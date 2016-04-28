var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var simulation = require("./common/simulation");

var app = express();
var server = http.Server(app);
var io = socketio(server);

server.listen(3000);
console.log("Listening on port 3000...");

app.use(express.static("public"));

var game = new simulation();

io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    // Player wants to join.
    socket.on("new_player_req", function (data) {
        // Trim name.
        var name = data.name.substring(0, 16);

        console.log("New player: ", data.name);

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
        socket.broadcast.emit("new_player", migration);
        socket.emit("new_player_game_state",
                    { game: game, cell: migration.cell });
    });
});
