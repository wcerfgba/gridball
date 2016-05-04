"use strict";

var elements = require("elements");
var socket = io();
var simulation = require("../common/simulation");
var m = require("../common/magic");
var render = require("render");

// Canvas context for rendering.
var ctx = null;
// Last canvas clear time.
var lastClear = 0;
// Current game state.
var game = new simulation();
// Current snapshot and tick.
var snapshot = 0;
var tick = 0;
// User's cell and Player.
var cell = null;
var player = null;
// Array of snapshot deltas to apply. This should always have one delta, which 
// is the last one received from the server, and towards which the client is 
// iterating.
var deltas = [ ];
// Animation frame ID.
var animFrame = null;
// Last animation frame timestamp.
var before = null;
// Buffer of additional time between animationFrame calls.
var tickBuffer = 0;
// Wait until first ping before sending new player requests.
var firstPing = true;
// Mouse angle.
var inputAngle = 0;

exports = module.exports = {
    start: function () {
        // Mouse and touch handlers.
        document.addEventListener("mousemove", function (event) {
            if (player) {
                var v = 
                    { x: event.clientX - (elements.canvas.element.width / 2),
                      y: event.clientY - (elements.canvas.element.height / 2) };
                inputAngle = Math.atan2(v.y, v.x);
            }
        });

        // Error handler.
        socket.on("error", function (data) {
            console.log(data);
            socket.disconnect(true);
        });

        // New player response.
        socket.on("new_player_ack", function (data) {
            snapshot = data.snapshot;
            if (data.game) {
                game.setState(data.game);
            }
            cell = data.cell;
            animFrame = window.requestAnimationFrame(loop);
            console.log("new player ack");
        });

        // Delta state pushes.
        socket.on("delta", function (data) {
            if (cell) {
                deltas.unshift(data);
            }
        });

        // Ping handler.
        socket.on("gPing", function (data) {
            socket.emit("gPong", data);

            if (firstPing) {
                firstPing = false;
                window.setTimeout(function () {
                    // Hide landing elements, setup canvas.
                    elements.landing.hide();
                    elements.canvas.fillInner();
                    ctx = elements.canvas.element.getContext("2d");

                    // Send new player request.
                    socket.emit("new_player", elements.name.value());
                }, 1000);
            }
        });
    }
}

function loop(timestamp) {
    // Skip if we are too far ahead in the simulation, or we have no last 
    // timestamp.
    if (!deltas[0] || before === null) {
        before = timestamp;
        animFrame = window.requestAnimationFrame(loop);
        return;
    }

    // If player doesn't exist yet, iterate forward to the snapshot they were 
    // added and get the Player.
    if (!player) {
        // Fail if we don't have at least two deltas.
        if (deltas.length < 2) {
            before = timestamp;
            animFrame = window.requestAnimationFrame(loop);
            return;
        }

        // Advance to delta where player is added.
        while (tick < m.snapshotRate) {
            game.tick();
            tick++;
        }
        snapshot++;
        tick = 0;

        // Apply delta, get player.
        game.applyDelta(deltas.pop());
        player = game.players[cell[0]][cell[1]];
    }

    // Clear screen every 500ms.
    if (timestamp - lastClear > 500) {
        ctx.clearRect(0, 0, elements.canvas.element.width,
                            elements.canvas.element.height);
        lastClear = timestamp;
    }

    // Apply input.
    var angleDiff = inputAngle - player.shieldAngle
    if (Math.abs(angleDiff) > Math.PI) {
        player.shieldMomentum = - Math.sign(angleDiff);
    } else {
        player.shieldMomentum = Math.sign(angleDiff);
    }

    // Get time.
    var time = timestamp - before;

    // Redraw at max. 60 fps = 16 ms.
    if (time > 16) {
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
                    game.players[i][j]) {
                    render.player(ctx, topleft, downsample,
                                  game.players[i][j]);
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

    var serverSnapshot = deltas[0][0];
    time += tickBuffer;
    //time += tickBuffer + (serverSnapshot - snapshot - 1) * m.snapshotTime;
    while (snapshot < serverSnapshot && time > m.snapshotTime) {
        // Apply delta on appropriate tick.
        /*if (tick === m.snapshotRate) {
            snapshot++;
            tick = 0;
            var delta = deltas.pop();
            if (delta[0] !== snapshot) {
                console.log("ERROR: Deltas out of sync!");
                return;
            }
            game.applyDelta(delta);
            continue;
        }*/
        // Iterate forward.
        game.tick();
        tick++;
        // Remove tick time from remaining time to prevent oversimulation.
        time -= m.tickTime;
    }
    tickBuffer = time;

    before = timestamp;
    animFrame = window.requestAnimationFrame(loop);
}
