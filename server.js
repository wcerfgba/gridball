var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var simulation = require("./common/simulation");
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
// Array of simulation states snapshots in time descending order: each array 
// index is m.snapshotTime ahead of the next index, with gameState[0] being 
// the present.
var gameState = new Array(m.maxSnapshots);
// Millisecond timer for iteration.
var before = util.performanceNow();
// Lock for mustating game state. (probably unnecessary)
var gameStateLock = false;

// Initialize first game state.
gameState[0] = new simulation();

// Serve client to visitors.
app.use(express.static("public"));

// Periodically ping each client.
function ping() {
    pingSent = util.performanceNow();
    io.emit("ping", { sTime: pingSent });
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

    // If no players, just set before to now.
    if (gameState[0].playerCount === 0) {
        before = now;
        return;
    }
 
    // Update simulation time until now.
    while (before < now) {
        // Test for snapshot step.
        if (before % t.snapshotTime === 0) {
            // Send and clear delta.
            io.emit("delta", delta);
            delta = null;

            // Copy current state and push into array.
            gameState.splice(0, 0, new simulation(gameState[0]));

            // Remove old states.
            if (gameState.length > m.maxSnapshots) {
                gameState.splice(m.maxSnapshots);
            }
        }

        // Test for tick step.
        if (before % t.tickTime === 0) {
            gameState[0].tick();

            // Timer is synchronised so increment by tickTime.
            before += m.tickTime;
            continue;
        }

        // Timer not synchronised, increment by 1.
        before++;
    }
}
var tickInterval = setInterval(iterate, m.tickTime);

// Connection from browser.
io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    // Pong-ping and pong. (Three-way ping)
    socket.on("pongping", function (data) {
        var latency = Math.floor((util.performanceNow - data.sTime) / 2);

        // Old ping, client too laggy, disconnect.
        if (data.sTime < pingSent) {
            socket.emit("error", "Latency too high: " + latency);
            socket.disconnect(true);
        }

        socketLatency[socket.id] = latency;
        socket.emit("pong", { cTime: data.cTime });
    });

    // New player request.
    socket.on("new_player_req", function (data) {
        // Ignore message if no latency data.
        if (!socketLatency[socket.id]) {
            return;
        }

        // Trim name, make safe.
        var name = util.escapeHtml(data.name.substring(0, 16));

        // Attempt to build migration.
        var migration = gameState[0].addPlayerMigration(name);
        
        if (migration.hasOwnProperty("error")) {
            console.log("ERROR: ", migration.error);
            socket.emit("error", { error: migration.error });
            return;
        }

        // Add player to game, notify all other clients, send state to new 
        // client.
        gameState[0].addPlayer(migration);
        socketCells[socket.id] = migration.cell;
        socket.broadcast.emit("new_player", migration);
        socket.emit("new_player_game_state",
                    { game: gameState[0], cell: migration.cell });

        console.log("New player: ", data.name);
    });

    // Game state request.
    socket.on("game_state_req", function () {
        socket.emit("game_state", gameState[0]);
    });

    // Player input.
    socket.on("input", function (data) {
        // Lock state.
        if (gameStateLock) {
            console.log("ERROR: Could not lock game state.");
            return;
        }
        gameStateLock = true;

        // Get the player's cell.
        var cell = socketCell[socket.id];

        // Input starts at t = - 2 * latency and continues until t = - latency.
        var inputBegin = 2 * socketLatency[socket.id];
        var inputEnd = socketLatency[socket.id];

        // Store the shield momentum at the end to be reset later.
        var endPlayer = gameState[inputEnd].players[cell[0]][cell[1]];
        var endShieldMomentum = endPlayer.shieldMomentum;

        // Set up tracking variables for magical algorithm.
        var trackedBalls = [ ];
        var trackedPlayers = [ ];

        // Set shield momentum at beginning of input.
        var beginPlayer = gameState[inputBegin].players[cell[0]][cell[1]];
        beginPlayer.shieldMomentum = data;

        // Do magical algorithm.
        for (var i = inputBegin; i < inputEnd; i--) {
            gameState[i - 1].inputUpdate(gameState[i], cell,
                                         trackedBalls, trackedPlayers);
        }

        // Reset movement.
        endPlayer.shieldMomentum = endShieldMomentum;

        // Do magical algorithm.
        for (var i = inputEnd; i < 0; i--) {
            gameState[i - 1] =
                gameState[i].inputUpdate(cell, trackedBalls, trackedPlayers);
        }

        // State updated, unlock.
        gameStateLock = false;
    });
});

// Client disconnect.
io.on("disconnect", function (socket) {
    // If socket is associated with a player, clean up.
    if (socketCells.hasOwnProperty(socket.id)) {
        // Find relevant player cell.
        var cell = socketCells[socket.id];

        // Build migration to remove player.
        var migration = gameState[0].removePlayerMigration(cell);

        // Apply migration, update socketCells, notify clients.
        gameState[0].removePlayer(migration);
        delete socketCell[socket.id];
        socket.broadcast.emit("remove_player", migration);
    }

    delete socketLatenct[socket.id];

    console.log("Connection closed: ", socket.id);
});

// Start server.
server.listen(3000);
console.log("Listening on port 3000...");
