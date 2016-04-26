var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var models = require("../common/models");

var app = express();
var server = http.Server(app);
var io = socketio(server);

server.listen(3000);
console.log("Listening on port 3000...");

app.use(express.static("public"));

var game = new models.Game();

io.on("connection", function (socket) {
    console.log("Connection received: ", socket.id);

    socket.on("new_player", function (data) {
        console.log("New player: ", data.name);

        game.addPlayer(data.name);

        socket.emit("game_data", { id: socket.id });
    });
});
