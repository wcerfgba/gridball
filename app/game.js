"use strict";

var elements = require("elements");
var socket = io();

exports = module.exports = {
    start: function () {
        elements.landing.hide();
        elements.canvas.fillInner();

        // Send name to server.
        socket.emit("new_player", { name: elements.name.value() });

        // Setup game.
        socket.on("game_data", function (data) {
            console.log(data.id);
        });
    }
}

function Game(gameState) {
    this.players = gameState.players;
    this.playerPositions = gameState.playerPositions;
    this.balls = gameState.balls;
}
