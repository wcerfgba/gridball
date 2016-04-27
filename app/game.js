"use strict";

var elements = require("elements");
var socket = io();
var simulation = require("../common/simulation");
var m = require("../common/magic");

var game = new simulation();
var player = null;
var looping = false;
var before = null;

exports = module.exports = {
    start: function () {
        elements.landing.hide();
        elements.canvas.fillInner();

        // Set up error handler.
        socket.on("error", function (data) {
            console.log(data.error);
        });

        // Set up handler for new player response.
        socket.on("new_player_game_state", function (data) {
            looping = false;
            game.setState(data.game);
            player = game.players[data.cell[0]][data.cell[1]][0];
            looping = true;
            window.requestAnimationFrame(loop);
        });

        // Set up handler for game state pushes.
        socket.on("game_state", function (data) {
            looping = false;
            game.setState(data);
            looping = true;
            window.requestAnimationFrame(loop);
        });

        // Send new player request.
        socket.emit("new_player_req", { name: elements.name.value() });
    }
}

function loop(timestamp) {
    if (!looping) {
        return;
    }

    if (before !== null) {
        var time = timestamp - before;

        // Redraw at max. 60 fps = 16 ms.
        if (16 < time) {
            // Get viewport bounds in simulation space. Downsample 4x for 
            // rendering.
            var topleft = { x: player.position.x - 2 * elements.canvas.width,
                            y: player.position.y - 2 * elements.canvas.height };
            var bottomright =
                        { x: player.position.x + 2 * elements.canvas.width,
                          y: player.position.y + 2 * elements.canvas.height };
            
            // Get range of visible cells.
            var startCell = m.positionToCell(topleft);
            var endCell = m.positionToCell(bottomright);

            // Render each visible cell.
            for (var i = startCell[0]; i < endCell[0]; i++) {
                for (var j = startCell[1]; j < endCell[1]; j++) {
                    render.player(game.players[i][j]);
                }
            }

            // Render each visible ball.
            for (var i = 0; i < game.balls.length; i++) {
                var ball = game.balls[i];
                if (topleft.x - m.ballDiameter < ball.position.x &&
                        ball.position.x < bottomright.x + m.ballDiameter &&
                    topleft.y - m.ballDiameter < ball.position.y &&
                        ball.position.y < bottomright.y + m.ballDiameter) {
                    render.ball(ball);
                }
            }
        }
            
        // Simulate necessary ticks in simulation.
    }

    before = timestamp;
    if (looping) {
        window.requestAnimationFrame(loop);
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
