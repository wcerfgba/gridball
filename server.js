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
// Maximum latency.
var maxLatency = m.maxSnapshots * m.snapshotTime;
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
// Millisecond timer for iteration.
var before = null;
// Buffer of milliseconds left over from last iterate() call to catch dropped 
// ticks.
var tickBuffer = 0;
// Snapshot delta to be sent at next snapshotTime. First index is snapshot 
// number.
var delta = [ null ];
// Only add one player per snapshot. Queue new player messages.
var playerQueue = [ ];
var playerAdded = false;

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

    // If we have players to add and haven't added one in this snapshot, do so.
    if (playerQueue.length > 0 && !playerAdded) {
        addPlayer();
        playerAdded = true;
    }

    // If no players and no deltas, or no before, just set before to now.
    if ((game.playerCount === 0 && delta.length === 1) || !before) {
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

            // Apply, send and clear delta.
            delta[0] = snapshot;
            game.applyDelta(delta);
            io.emit("delta", delta);
            delta = [ null ];

            // Reset playerAdded.
            playerAdded = false;

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
        //socket.emit("error", data);
    });

    // Pong.
    socket.on("gPong", function (data) {
        var latency = Math.floor((util.performanceNow() - data) / 2);
        
        // Old ping, client too laggy, cap latency.
        if (latency > maxLatency) {
            socket.emit("error", "Latency too high: " + latency);
            //socket.disconnect(true);
            latency = maxLatency;
        }

        socketLatency[socket.id] = latency;
    });

    // New player requests are deferred to a queue so that only one player is 
    // added per snapshot.
    socket.on("new_player", function (data) {
        playerQueue.unshift([ socket.id, data ]);
    });

    // Player input.
    socket.on("input", function (data) {
        // Get the player's cell.
        var cell = socketCell[socket.id];

        // Input starts at t_start = - latency - snapshotTime. Therefore the 
        // input started in the snapshot s_start, taken just before t_start, 
        // and occured at tick ((s_start * snapshotTime) - t_start) / tickTime 
        // in that snapshot.
        var inputBegin = socketLatency[socket.id] + m.snapshotTime;
        var inputBeginSnapshot = Math.ceil(inputBegin / m.snapshotTime);
        var inputBeginTick = Math.floor(
                            ((inputBeginSnapshot * m.snapshotTime) -
                                    inputBegin) / m.tickTime);

        // Construct a delta to track changes as we reiterate. This is used to 
        // update snapshots during reiteration and will eventually be appended 
        // to the global delta to be sent to clients next snapshotTime.
        var inputDelta = [ [ "shieldMomentum", cell, data ] ];

        // Make local copy of current snapshot for iteration.
        var state = new simulation(gameState[inputBeginSnapshot]);

        // Track reiteration.
        var reiterSnapshot = inputBeginSnapshot;
        var reiterTick = 0;

        // Iterate to input time, apply input.
        while (reiterTick > inputBeginTick) {
            state.tick();
            reiterTick++;
        }
        state.applyDelta(inputDelta);

        // Iterate forward to next snapshot time.
        while (reiterSnapshot > -1) {
            if (reiterTick === m.snapshotRate) {
                reiterSnapshot--;
                reiterTick = 0;
            }
            state.tick();
            reiterTick++;
        }

        // Advance current state to next snapshot time. This allows us to build 
        // the delta, and forces a snapshot on the next call to iterate().
        while (tick < m.snapshotRate) {
            gameState[0].tick();
            tick++;
        }

        // Build and save delta.
        inputDelta = buildDelta(gameState[0], state);
        Array.prototype.push.apply(delta, inputDelta);
    });

    // Client disconnect.
    socket.on("disconnect", function () {
        // If socket is associated with a player, clean up.
        var cell = socketCell[socket.id];
        if (cell) {
            // Build delta to remove player.
            var removeDelta = [ "remove_player", cell ];
            delta.push(removeDelta);

            // Also remove nearest ball if we would have too many balls to players.
            if (game.playerCount % 7 === 1) {
                var playerPosition = game.players[cell[0]][cell[1]].position;
                var nearestIndex = null;
                var nearestDistSq = Number.MAX_VALUE;
                for (var i = 0; i < game.balls.length; i++) {
                    var ball = game.balls[i];
                    if (!ball) { continue; }

                    var distSq = Math.pow(playerPosition.x - ball.position.x, 2) + 
                                 Math.pow(playerPosition.y - ball.position.y, 2);
                    if (distSq < nearestDistSq) {
                        nearestDistSq = distSq;
                        nearestIndex = i;
                    }
                }

                var removeBallDelta = [ "remove_ball", nearestIndex ];
                delta.push(removeBallDelta);
            }

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

/* Actually adds a player to the game. */
function addPlayer() {
    var instance = playerQueue.pop();
    var socket = io.sockets.connected[instance[0]];
    var data = instance[1];

    console.log("new_player, latency: ", socketLatency[socket.id]);
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

        // Add ball delta for next snapshot.
        var ballDelta = [ "ball", game.balls.length, ball ];
        delta.push(ballDelta);
    }

    // Add Player on next snapshot.
    var playerDelta = [ "player", cell, player ];
    delta.push(playerDelta);

    // Setup socket cell.
    socketCell[socket.id] = cell;

    // Send ack with last snapshot.
    socket.emit("new_player_ack",
                  { snapshot: snapshot, game: gameState[0], cell: cell });

    // Only add one Player per snapshot.
    playerAdded = true;

    console.log("New player: ", name);
}

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
