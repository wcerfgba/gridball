"use strict";

var elements = require("elements");
var socket = io();
var simulation = require("../common/simulation");
var m = require("../common/magic");
var render = require("render");

// Canvas context for rendering.
var ctx = null;
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
var deltas = null;
// Animation frame ID.
var animFrame = null;
// Last animation frame timestamp.
var before = null;
// Buffer of additional time between animationFrame calls.
var tickBuffer = 0;

exports = module.exports = {
    start: function () {
        // Hide landing elements, setup canvas.
        elements.landing.hide();
        elements.canvas.fillInner();
        ctx = elements.canvas.element.getContext("2d");

        // Error handler.
        socket.on("error", function (data) {
            console.log(data);
            socket.disconnect(true);
        });

        // Ping handler.
        socket.on("ping", function (data) {
            socket.emit("pong", data);
        });

        // New player response.
        socket.on("new_player_ack", function (data) {
            snapshot = data.snapshot
            game.setState(data.game);
            cell = data.cell;
            animFrame = window.requestAnimationFrame(loop);
        });

        // Delta state pushes.
        socket.on("delta", function (data) {
            if (game) {
                deltas.unshift(data);
            }
        });

        // Send new player request.
        socket.emit("new_player", element.name.value);
    }
}

function loop(timestamp) {
    // Skip if we are too far ahead in the simulation, or we have no last 
    // timestamp.
    if (!deltas[0] || snapshot >= deltas[0][0] || before === null) {
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
        player = game.player[cell[0]][cell[1]];
    }

    // Get variables.
    var serverSnapshot = deltas[0][0];
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

    // Apply latent deltas.
    while (snapshot < serverSnapshot - 1) {
        // Apply delta on appropriate tick.
        if (tick === m.snapshotRate) {
            snapshot++;
            tick = 0;
            var delta = deltas.pop();
            if (delta[0] !== snapshot) {
                console.log("ERROR: Deltas out of sync!");
                return;
            }
            game.applyDelta(delta);
            continue;
        }
        // Iterate forward.
        game.tick();
        tick++;
        // Remove tick time from remaining time to prevent oversimulation later.
        time -= m.tickTime;
    }

    // Simulate necessary ticks in simulation.
    time += tickBuffer;

    if (time > m.snapshotTime) {
        time = m.snapshotTime;
        console.log("WOAH! Too much to simulate.");
    }

    while (time > m.tickTime) {
        game.tick()
        tick++;
        time -= m.tickTime;
    }
    tickBuffer = time;

    before = timestamp;
    animFrame = window.requestAnimationFrame(loop);
}
