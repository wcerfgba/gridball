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
// Store time when pings are sent to compute client latency when receiving 
// pongs.
var pingId = 0;
var pingSent = null;

// Serve client to visitors.
app.use(express.static("public"));

// Connection from browser.
io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    // New player request.
    socket.on("new_player_req", function (data) {
        // Trim name, make safe.
        var name = util.escapeHtml(data.name.substring(0, 16));

        // Attempt to build migration.
        var migration = game.addPlayerMigration(name);
        
        if (migration.hasOwnProperty("error")) {
            console.log("ERROR: ", migration.error);
            socket.emit("error", { error: migration.error });
            return;
        }

        // Add player to game, notify all other clients, send state to new 
        // client.
        game.addPlayer(migration);
        socketCells[socket.id] = migration.cell;
        socket.broadcast.emit("new_player", migration);
        socket.emit("new_player_game_state",
                    { game: game, cell: migration.cell });

        console.log("New player: ", data.name);
    });

    // Pong reply.
    socket.on("pong", function (data) {
        // Client too laggy, disconnect.
        if (data !== pingId) {
            socket.disconnect(true);
        }

        socketLatency[socket.id] =
            Math.floor((util.performanceNow - pingSent) / 2);
    });

    // Game state request.
    socket.on("game_state_req", function () {
        socket.emit("game_state", game);
    });

    socket.on("input", function (data) {
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

        // State updated.
    });
});

// Client disconnect.
io.on("disconnect", function (socket) {
    // If socket is associated with a player, clean up.
    if (socketCells.hasOwnProperty(socket.id)) {
        // Find relevant player cell.
        var cell = socketCells[socket.id];

        // Build migration to remove player.
        var migration = game.removePlayerMigration(cell);

        // Apply migration, update socketCells, notify clients.
        game.removePlayer(migration);
        delete socketCells[socket.id];
        socket.broadcast.emit("remove_player", migration);
    }

    console.log("Connection closed: ", socket.id);
});

// Periodically ping each client.
function ping() {
    pingId = (pingId + 1) % 255;
    pingSent = util.performanceNow();
    io.emit("ping", pingId);
}
var pingInterval = setInterval(ping, 1000);

// Iterate server state at tickrate.

// Start server.
server.listen(3000);
console.log("Listening on port 3000...");
