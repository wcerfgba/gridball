"use strict";

var elements = require("elements");
var socket = io();
var simulation = require("../common/simulation");

var game = new simulation();

exports = module.exports = {
    start: function () {
        elements.landing.hide();
        elements.canvas.fillInner();

        // Set up error handler.
        socket.on("error", function (data) {
            console.log(data.error);
        });

        // Set up game state handler.
        socket.on("game_state", function (data) {
            game.setState(data);
            console.log(game);
        });

        // Send new player request.
        socket.emit("new_player_req", { name: elements.name.value() });
    }
}

function renderTest() {
    var grid = geometry.hexGrid(4);
    var spacing = { x: geometry.x_incr * 50, y: geometry.y_incr * 50 };

    var ctx = elements.canvas.element.getContext("2d");
    ctx.fillStyle = "rgb(0, 0, 0)";
    for (var i = 0; i < grid.length; i++) {
        var point = { x: (8 + grid[i].x) * spacing.x,
                      y: (4 + grid[i].y) * spacing.y };
        //ctx.moveTo(point.x, point.y);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 20, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fill();
    }
}
