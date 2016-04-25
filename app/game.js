"use strict";

var elements = require("elements");
var socket = io();
var geometry = require("../common/geometry");

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

        renderTest();
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
