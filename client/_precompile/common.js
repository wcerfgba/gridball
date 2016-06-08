"use strict";

var dom = require("./dom");
var render = require("./render");
var iterate = require("../common/iterate");
var State = require("../common/state");
var m = require("../common/magic");

var socket = io({ transports: [ 'websocket' ] });
var ctx;
var state;
var tickNum;
var tickBuffer;
var cell;
var player;
var inputCallback;
var deltas = [ ];
var before;
var lastClear;
var topleft;
var bottomright;
var downsample = 5;

document.addEventListener("DOMContentLoaded", function () {
    dom.contact.embedContact();

    dom.canvas.fillInner();
    ctx = dom.canvas.element.getContext("2d");

    dom.landing.joinGame(function (config) {
        socket.connect();
        socket.emit("NewPlayer", config.name);
    });

    dom.scores.registerScoresUpdateInterval();

    socket.emit("GameState");

    /*dom.landing.viewGame(function () {
        socket.emit("GameState");
    });*/
});

socket.on("NewPlayer", function (data) {
    cell = data;
    dom.loading.hide();
});

socket.on("GameState", function (data) {
    tickNum = data[0];
    state = new State(data[1]);
    tickBuffer = 0;
    player = null;
    deltas = [ ];
    if (!before) {
        window.requestAnimationFrame(loop);
    }
});

socket.on("Delta", function (data) {
    if (state) {
        deltas.push(data);
    }
});

function loop(timestamp) {
    if (!before || !lastClear) {
        before = timestamp;
        lastClear = timestamp;
        window.requestAnimationFrame(loop);
        return;
    }

    if (inputCallback) {
        inputCallback();
    }

    if (deltas.length > 0) {
        var tickTime = timestamp - before;
        var tickDelay = ((deltas[deltas.length - 1][0] - tickNum) *
                            m.tickTime) - m.snapshotTime;
        if (tickDelay > m.snapshotTime) {
            tickTime += m.snapshotTime / 2;
        } else if (tickTime > tickDelay) {
            tickTime = 0;
        }

        while (tickTime >= 0 && deltas.length > 0) {
            applyDelta();
            iterate(state);
            tickNum++;
            tickTime -= m.tickTime;
        }
    } else {
        console.log("DELTA STALL");
    }

    if (cell && state.players[cell[0]][cell[1]]) {
        player = state.players[cell[0]][cell[1]];
    }

    if (player && player.health === 0) {
        /*state = null;
        tickNum = 0;
        tickBuffer = 0;*/
        cell = null;
        player = null;
        /*deltas = [ ];
        before = null;
        lastClear = null;*/
        /*socket.disconnect();
        ctx.clearRect(0, 0, dom.canvas.element.width,
                            dom.canvas.element.height);*/
        dom.landing.show();
        //return;
    }

    var time = timestamp - before; 
    if (time > 16) {
        // Clear screen and attempt to resize canvas every 500ms.
        if (!topleft || !bottomright || timestamp - lastClear > 500) {
            dom.canvas.fillInner();
            ctx.clearRect(0, 0, dom.canvas.element.width,
                                dom.canvas.element.height);
            lastClear = timestamp;

            // Set rendering bounds.
            if (player) {
                downsample = 5;
                topleft = { x: player.position.x -
                                downsample * dom.canvas.element.width / 2,
                            y: player.position.y -
                                downsample * dom.canvas.element.height / 2 };
                bottomright = { x: player.position.x +
                                   downsample * dom.canvas.element.width / 2,
                                y: player.position.y +
                                   downsample * dom.canvas.element.height / 2 };
            } else {
                downsample = 10;
                var center = m.cellToPosition([ m.maxShells, m.maxShells ]);
                topleft = { x: center.x -
                                downsample * dom.canvas.element.width / 2,
                            y: center.y -
                                downsample * dom.canvas.element.height / 2 };
                bottomright = { x: center.x +
                                   downsample * dom.canvas.element.width / 2,
                                y: center.y +
                                   downsample * dom.canvas.element.height / 2 };
            }
        }

        // Get range of visible cells.
        var startCell = m.positionToCell(topleft);
        var endCell = m.positionToCell(bottomright);

        // Render players.
        for (var i = startCell[0] - 1; i <= endCell[0] + 1; i++) {
            for (var j = startCell[1] - 1; j <= endCell[1] + 1; j++) {
                if (0 <= i && i < state.players.length &&
                    0 <= j && j < state.players[i].length &&
                    state.players[i][j]) {
                    render.player(ctx, topleft, downsample,
                                  state.players[i][j]);
                }
            }
        }

        // Render bounds.
        for (var i = startCell[0] - 1; i <= endCell[0] + 1; i++) {
            for (var j = startCell[1] - 1; j <= endCell[1] + 1; j++) {
                if (0 <= i && i < state.players.length &&
                    0 <= j && j < state.players[i].length &&
                    state.players[i][j]) {
                    render.bounds(ctx, topleft, downsample,
                                  state.players[i][j]);
                }
            }
        }

        // Render each visible ball.
        for (var i = 0; i < state.balls.length; i++) {
            var ball = state.balls[i];
            if (ball &&
                topleft.x - m.ballDiameter < ball.position.x &&
                    ball.position.x < bottomright.x + m.ballDiameter &&
                topleft.y - m.ballDiameter < ball.position.y &&
                    ball.position.y < bottomright.y + m.ballDiameter) {
                render.ball(ctx, topleft, downsample, ball);
            }
        }
    }

    before = timestamp;
    window.requestAnimationFrame(loop);
}

function applyDelta() {
    if (deltas.length === 0) {
        return;
    }

    var delta = deltas[0];
    var deltaTick = delta[0];
    var tickDiff = deltaTick - tickNum;

    if (tickDiff > 0) {
        for (var i = 1; i < delta.length; i++) {
            var change = delta[i];
            var type = change[0];
            var target = change[1];
            switch (type) {
            case "BallPosition":
                var dBall = state.balls[target];
                if (!dBall) { continue; }
                var xDiff = change[2] - dBall.position.x;
                var yDiff = change[3] - dBall.position.y;
                dBall.position.x += xDiff / tickDiff;
                dBall.position.y += yDiff / tickDiff;
                break;
            case "ShieldAngle":
                // Ignore if current player.
                if (cell && target[0] === cell[0] && target[1] === cell[1]) {
                    continue;
                }
                var dPlayer = state.players[target[0]][target[1]];
                if (!dPlayer) { continue; }
                var angleDiff = change[2] - dPlayer.shieldAngle;
                if (Math.abs(angleDiff) > Math.PI) {
                    angleDiff -= Math.sign(angleDiff) * 2 * Math.PI;
                }
                var newAngle = dPlayer.shieldAngle + (angleDiff / tickDiff);
                if (Math.abs(newAngle) > Math.PI) {
                    newAngle -= Math.sign(newAngle) * 2 * Math.PI;
                }
                dPlayer.shieldAngle = newAngle;
                break;
            }
        }
    } else if (tickDiff === 0) {
        for (var i = 1; i < delta.length; i++) {
            var change = delta[i];
            var type = change[0];
            var target = change[1];
            switch (type) {
            case "BallPosition":
                var dBall = state.balls[target];
                if (!dBall) { continue; }
                dBall.position.x = change[2];
                dBall.position.y = change[3];
                break;
            case "ShieldAngle":
                // Skip if player.
                if (cell && target[0] === cell[0] && target[1] === cell[1]) {
                    continue;
                }
                var dPlayer = state.players[target[0]][target[1]];
                if (!dPlayer) { continue; }
                dPlayer.shieldAngle = change[2];
                break;
            case "BallVelocity":
                var dBall = state.balls[target];
                if (!dBall) { continue; }
                dBall.velocity.x = change[2];
                dBall.velocity.y = change[3];
                break;
            case "Player":
                if (!state.players[target[0]][target[1]]) {
                    state.addPlayer(target, change[2]);
                }
                break;
            case "Health":
                var dPlayer = state.players[target[0]][target[1]];
                if (!dPlayer) { continue; }
                dPlayer.health = change[2];
                break;
            case "Ball":
                if (!state.balls[target]) {
                    state.ballCount++;
                }
                state.balls[target] = change[2];
                break;
            }
        }
        deltas.shift();
    } else {
        console.log("Missed delta ", deltaTick, " at ", tickNum);
        socket.emit("GameState");
    }
}
