var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var simulation = require("./common/simulation");
var Player = require("./common/player");
var Ball = require("./common/ball");
var m = require("./common/magic");
var util = require("./common/util");

// Build express server and socket.
var app = express();
var server = http.Server(app);
var io = socketio(server);

// Store time when each wave of pings is sent for detecting laggy clients.
var pingSent = null;
// Map from socket IDs to latencies.
var socketLatency = { };
// Map from socket IDs to player cells.
var socketCell = { };
// Current snapshot and tick in snapshot.
var snapshot = 0;
var tick = 0;
// Current game state.
var game = new simulation();
// Array of simulation state snapshots in time-ascending order. Index i gives 
// game state at snapshot s = snapshot - i, tick t = 0.
var gameState = new Array(m.maxSnapshots);
gameState[0] = new simulation();
// Millisecond timer for iteration.
var before = null;
// Buffer of milliseconds left over from last iterate() call to catch dropped 
// ticks.
var tickBuffer = 0;
// Additional delta components to be send on the next snapshot. See input 
// handling.
var deltaCache = [ ];

// Set client route.
app.use(express.static("public"));

// Periodically ping each client.
function ping() {
    pingSent = util.performanceNow();
    io.emit("gPing", pingSent);
}
var pingInterval = setInterval(ping, 1000);

// Attempt to take snapshots and tick the simulation once every tickRate 
// milliseconds. The time window for the function is from the last time it was 
// called to the present. The server is expected to send a snapshot every 
// snapshotTime milliseconds, and to tick the simulation every tickTime 
// milliseconds. The timer is counted forward until it synchronises with these 
// steps, and then maintains steps of length tickTime.
function iterate() {
    // Get current time.
    var now = util.performanceNow();

    // If no players or no before, just set before to now.
    if (game.playerCount === 0 || !before) {
        before = now;
        return;
    }
 
    // Simulate necessary ticks in simulation.
    var time = now - before + tickBuffer;
    while (time > m.tickTime) {
        // Time for a new snapshot. Apply and push latent delta, update array.
        if (tick === m.snapshotRate) {
            // Update counters.
            snapshot++;
            tick = 0;

            // Generate and send delta.
            var delta = buildDelta(gameState[0], game);
            delta.unshift(snapshot);
            Array.prototype.push.apply(delta, deltaCache);
            deltaCache = [ ];
            io.emit("delta", delta);

            // Copy current state and push into array.
            gameState.unshift(new simulation(game));

            // Remove old states.
            if (gameState.length > m.maxSnapshots) {
                gameState.splice(m.maxSnapshots);
            }
        }
        game.tick();
        tick++;
        time -= m.tickTime;
    }
    tickBuffer = time;

    before = now;
}
var tickInterval = setInterval(iterate, m.tickTime);

// Connection from browser.
io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    // Error handler.
    socket.on("error", function (data) {
        console.log("ERROR: ", data);
    });

    // Pong.
    socket.on("gPong", function (data) {
        var latency = Math.floor((util.performanceNow() - data) / 2);
        
        // Old ping, client too laggy, cap latency.
        if (latency > m.maxLatency) {
            socket.emit("error", "Latency too high: " + latency);
            //socket.disconnect(true);
            latency = m.maxLatency;
        }

        socketLatency[socket.id] = latency;
    });

    // New player requests are deferred to a queue so that only one player is 
    // added per snapshot.
    socket.on("new_player", function (data) {
        // Ignore message if no latency data.
        if (socketLatency[socket.id] === undefined) {
            return;
        }

        // Trim name, make safe.
        var name = util.escapeHtml(data.substring(0, 16));

        // Return error if game is full.
        if (game.playerCount === m.maxPlayers) {
            socket.emit("error", "Game full.");
            return;
        }

        // Get cell for new player. If we have no players, add to center of 
        // grid. Otherwise, find the first neighboured but unoccupied cell.
        var cell = null;
        if (game.playerCount === 0) {
            cell = [ m.maxShells, m.maxShells ];
        } else {
            for (var i = 0; i < m.playerPositions.length - 1; i++) {
                var a = m.playerPositions[i];
                var b = m.playerPositions[i + 1];

                var cell_a = game.players[a[0]][a[1]];
                var cell_b = game.players[b[0]][b[1]];

                if (!cell_a && cell_b) {
                    cell = a;
                    break;
                } else if (cell_a && !cell_b) {
                    cell = b;
                    break;
                }
            }
        }
        if (cell === null) {
            console.log("ERROR: Could not find neighboured but unoccupied cell.");
            socket.emit("error", "Could not find neighboured but unoccupied cell.");
            return;
        }

        // Get bounds to set for this player.
        var bounds = [ ];
        for (var i = 0; i < 6; i++) {
            var neighbourCell = m.neighbourCell(cell, i);
            if (0 <= neighbourCell[0] &&
                     neighbourCell[0] < game.players.length &&
                0 <= neighbourCell[1] &&
                     neighbourCell[1] < game.players[neighbourCell[0]]
                                            .length &&
                game.players[neighbourCell[0]][neighbourCell[1]]) {
                    bounds.push(false);
                } else {
                    bounds.push(true);
            }
        }

        // Calculate position in the grid.
        var position = m.cellToPosition(cell);

        // Construct player.
        var player = new Player({ name: name,
                                  activeBounds: bounds,
                                  position: position });

        // Add a new ball in the new Player's cell if this player is a multiple 
        // of seven (one shell plus center).
        if (game.playerCount % 7 === 0) {
            var ball = new Ball(
                        { position: 
                            { x: player.position.x + m.playerDistance / 3,
                              y: player.position.y }
                        });
            // Insert into first empty space in array.
            var ballIndex = 0;
            for (var i = 0; i < game.balls.length; i++) {
                if (game.balls[i] === null) {
                    break;
                }
            }
            game.applyDelta([ 0, [ "ball", ballIndex, ball ] ]);
        }

        game.applyDelta([ 0, [ "player", cell, player ] ]);

        // Setup socket cell.
        socketCell[socket.id] = cell;

        // Send ack with last snapshot.
        socket.emit("new_player_ack",
                      { snapshot: snapshot, game: gameState[0], cell: cell });

        console.log("New player, latency: ", socketLatency[socket.id]);
    });

    // Player input.
    socket.on("input", function (data) {
        // Get the player's cell.
        var cell = socketCell[socket.id];

        // Input starts at t_start = - latency - snapshotTime.
        var inputBegin = socketLatency[socket.id] + m.snapshotTime;
        var inputBeginSnapshot = Math.floor(inputBegin / m.snapshotTime);
        var inputBeginTick = Math.floor((inputBegin % m.snapshotTime) /
                                        m.tickTime);

        // Track reiteration.
        var reiterSnapshot = inputBeginSnapshot;
        var reiterTick = 0;

        // Make local copy of current snapshot for iteration.
        var state = new simulation(gameState[inputBeginSnapshot]);

        // A lag spike just after adding a player can cause the input to appear 
        // before the player exists. In this case, we find the first state the 
        // player exists in, and if no player exists, drop the message.
        while (!gameState[reiterSnapshot].players[cell[0]][cell[1]] &&
               reiterSnapshot > 1) {
            reiterSnapshot--;
            state = new simulation(gameState[reiterSnapshot]);
        }
        if (!gameState[reiterSnapshot].players[cell[0]][cell[1]]) {
            return;
        }

        // Iterate to input time, apply input.
        while (reiterTick > inputBeginTick) {
            state.tick();
            reiterTick++;
        }
        state.players[cell[0]][cell[1]].shieldMomentum = data;

        // Iterate forward to present and update old snapshots in the process.
        while (reiterSnapshot > 0 ||
               (reiterSnapshot === 0 && reiterTick < tick)) {
                    if (reiterTick === m.snapshotRate) {
                        reiterSnapshot--;
                        reiterTick = 0;
                        gameState[reiterSnapshot] = new simulation(state);
                    }
                    state.tick();
                    reiterTick++;
        }

        // Set current state.
        game = state;

        // Cache shieldMomentum delta part.
        deltaCache.push([ "shieldMomentum", cell, data ]);
    });

    // Client disconnect.
    socket.on("disconnect", function () {
        // If socket is associated with a player, clean up.
        var cell = socketCell[socket.id];
        if (cell) {
            // Remove player.
            game.applyDelta([ 0, [ "remove_player", cell ] ]);

            // Delete socket cell.
            delete socketCell[socket.id];
        }

        delete socketLatency[socket.id];

        console.log("Connection closed: ", socket.id);
    });
});


// Start server.
server.listen(3000);
console.log("Listening on port 3000...");

/* buildDelta examines a past and a present simulation and constructs a delta 
 * object which tracks any difference in values between the two states. */
function buildDelta(past, present) {
    var delta = [ ];

    for (var i = 0; i < present.players.length; i++) {
        for (var j = 0; j < present.players[i].length; j++) {
            var cell = [ i, j ];
            var pastPlayer = past.players[i][j];
            var presentPlayer = present.players[i][j];

            if (presentPlayer && !pastPlayer) {
                delta.push([ "player", cell, presentPlayer ]);
            } else if (!presentPlayer && pastPlayer) {
                delta.push([ "remove_player", cell ]);
            } else if (presentPlayer && pastPlayer) {
                if (presentPlayer.shieldMomentum !== pastPlayer.shieldMomentum) {
                    delta.push([ "shieldMomentum", cell,
                                 presentPlayer.shieldMomentum ]);
                }
                if (presentPlayer.shieldAngle !== pastPlayer.shieldAngle) {
                    delta.push([ "shieldAngle", cell,
                                 presentPlayer.shieldAngle ]);
                }
                if (presentPlayer.health !== pastPlayer.health) {
                    delta.push([ "health", cell,
                                 presentPlayer.health ]);
                }
            }
        }
    }

    for (var i = 0; i < present.balls.length; i++) {
        var pastBall = past.balls[i];
        var presentBall = present.balls[i];

        if (presentBall && !pastBall) {
            delta.push([ "ball", i, presentBall ]);
        } else if (!presentBall && pastBall) {
            delta.push([ "remove_ball", i ]);
        } else if (presentBall && pastBall) {
            if (presentBall.position.x !== pastBall.position.x ||
                presentBall.position.y !== pastBall.position.y) {
                delta.push([ "position", i,
                             presentBall.position.x, presentBall.position.y ]);
            }
            if (presentBall.velocity.x !== pastBall.velocity.x ||
                presentBall.velocity.y !== pastBall.velocity.y) {
                delta.push([ "velocity", i,
                             presentBall.velocity.x, presentBall.velocity.y ]);
            }
        }
    }

    return delta;
}
