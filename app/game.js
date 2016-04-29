"use strict";

var elements = require("elements");
var socket = io();
var simulation = require("../common/simulation");
var m = require("../common/magic");
var render = require("render");

var ctx = null;
var game = new simulation();
var player = null;
var looping = false;
var before = null;
var tickBuffer = 0;

exports = module.exports = {
    start: function () {
        elements.landing.hide();
        elements.canvas.fillInner();
        ctx = elements.canvas.element.getContext("2d");

        // Set up error handler.
        socket.on("error", function (data) {
            console.log(data.error);
        });

        // Successful new player response.
        socket.on("new_player_game_state", function (data) {
            looping = false;
            game.setState(data.game);
            player = game.players[data.cell[0]][data.cell[1]][0];
            looping = true;
            window.requestAnimationFrame(loop);
        });

        // Game state pushes.
        socket.on("game_state", function (data) {
            looping = false;
            game.setState(data);
            looping = true;
            window.requestAnimationFrame(loop);
        });

        // Add player
        socket.on("new_player", function (data) {
            looping = false;
            game.addPlayer(data);
            looping = true;
            window.requestAnimationFrame(loop);
        });

        // Remove player.

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
            // Get viewport bounds in simulation space. Downsample 5x for 
            // rendering.
            var downsample = 5;
            var topleft = { x: player.position.x -
                                downsample * elements.canvas.element.width / 2,
                            y: player.position.y -
                                downsample * elements.canvas.element.height / 2 };
            var bottomright =
                        { x: player.position.x +
                                downsample * elements.canvas.element.width / 2,
                          y: player.position.y +
                                downsample * elements.canvas.element.height / 2 };
            
            // Get range of visible cells.
            var startCell = m.positionToCell(topleft);
            var endCell = m.positionToCell(bottomright);

            // Render each visible cell and surrounding cells.
            for (var i = startCell[0] - 1; i <= endCell[0] + 1; i++) {
                for (var j = startCell[1] - 1; j <= endCell[1] + 1; j++) {
                    if (0 <= i && i < game.players.length &&
                        0 <= j && j < game.players[i].length &&
                        game.players[i][j].length !== 0) {
                        render.player(ctx, topleft, downsample,
                                      game.players[i][j][0]);
                    }
                }
            }

            // Render each visible ball.
            for (var i = 0; i < game.balls.length; i++) {
                var ball = game.balls[i];
                if (topleft.x - m.ballDiameter < ball.position.x &&
                        ball.position.x < bottomright.x + m.ballDiameter &&
                    topleft.y - m.ballDiameter < ball.position.y &&
                        ball.position.y < bottomright.y + m.ballDiameter) {
                    render.ball(ctx, topleft, downsample, ball);
                }
            }
        }
            
        // Simulate necessary ticks in simulation.
        time += tickBuffer;
        while (m.tickTime < time) {
            game.tick();
            time -= m.tickTime;
        }
        tickBuffer = time;
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
