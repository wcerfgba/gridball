var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var simulation = require("./common/simulation");
var utils = require("./common/util");

// Build express server and socket.
var app = express();
var server = http.Server(app);
var io = socketio(server);

// Map from socket IDs to player cells.
var socketCell = { };
// Maximum latency. Used to determine when to boot clients and how much 
// historical state to store for lag compensation.
var maxLatency = 1000;
// Map from socket IDs to latencies.
var socketLatency = { };
// Array of simulation states in time descending order.
var gameState = new Array(2 * maxLatency);
// Lock for mustating game state.
var gameStateLock = false;
// Store time when pings are sent to compute client latency when receiving 
// pongs.
var pingSent = null;

// Serve client to visitors.
app.use(express.static("public"));

// Periodically ping each client.
function ping() {
    pingSent = util.performanceNow();
    io.emit("ping", pingSent);
}
var pingInterval = setInterval(ping, 1000);

// Connection from browser.
io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    // Pong reply.
    socket.on("pong", function (data) {
        // Client too laggy, disconnect.
        if (data < pingSent) {
            socket.disconnect(true);
        }

        socketLatency[socket.id] =
            Math.floor((util.performanceNow - data) / 2);
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
                    { game: game, cell: migration.cell });

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
        delete socketCells[socket.id];
        socket.broadcast.emit("remove_player", migration);
    }

    console.log("Connection closed: ", socket.id);
});

// Iterate server state at tickrate.

// Start server.
server.listen(3000);
console.log("Listening on port 3000...");
