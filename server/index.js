"use strict";

var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var State = require("../common/state");
var Player = require("../common/player");
var Ball = require("../common/ball");
var iterate = require("../common/iterate");
var collide = require("../common/collide");
var m = require("../common/magic");
var util = require("./util");

var app = express();
var server = http.Server(app);
var io = socketio(server, { transports: [ 'websocket' ] });

var socketCell = { };
var state = [ new State() ];
var tickNum = 0;
var tickBuffer = 0;
var inputs = [ ];
var newPlayers = [ ];
var nextPath = 0;
var disconnects = [ ];
var before;

var port = process.env.PORT || 3000;
app.use(express.static("public"));
server.listen(port);
console.log("Server listening on", port);

io.on("connection", function (socket) {
    socket.on("NewPlayer", function (data) {
        newPlayers.push([ socket.id, util.escapeHtml(data.substring(0, 16)) ]);
    });

    socket.on("GameState", function (data) {
        socket.emit("GameState", [ tickNum, state[0] ]);
    });

    socket.on("Input", function (data) {
        var cell = socketCell[socket.id];
        if (!cell) return;
        for (var i = 0; i < inputs.length; i++) {
            if (inputs[i].cell[0] === cell[0] &&
                inputs[i].cell[1] === cell[1]) {
                    inputs.splice(i, 1);
                    i--;
            }
        }
//console.log("INPUT @ " + tickNum);
        inputs.push({ cell: cell, angle: data[1], tick: data[0] });
    });

    socket.on("disconnect", function () {
        var cell = socketCell[socket.id];
        if (cell) {
            disconnects.push(cell);
            delete socketCell[socket.id];
        }
    });
});

function loop() {
    var timestamp = util.performanceNow();

    if (before === undefined) {
        before = timestamp;
        return;
    }

    var time = timestamp - before; 
    var tickTime = time + tickBuffer;
//if (tickTime > 20) console.log(tickNum + ": " + tickTime);
    while (tickTime > 0 &&
           (state[0].playerCount > 0 || newPlayers.length > 0)) {
        // Clone current state.
        var prevState = new State(state[0]);

        // Kill disconnected players, add new players if no disconnects.
        if (disconnects.length > 0) {
            while (disconnects.length > 0) {
                var cell = disconnects.pop();
                var player = state[0].players[cell[0]][cell[1]];
                if (player) {
                    player.health = 0;
                }
            }
        } else {
            addPlayers();
        }

        var inputChanges = applyInputs();
        inputs.splice(0);

        // Build and send delta.
        var delta = buildDelta(prevState, state[0]);
        Array.prototype.push.apply(delta,
                                   buildChangeDelta(state[0], inputChanges));
        if (delta.length > 0 || tickNum % m.snapshotRate === 0) {
            delta.unshift(tickNum);
            io.emit("Delta", delta);
        }

        // Save new state and iterate.
        state.unshift(new State(state[0]));
        iterate(state[0]);
        state.splice(m.tickRate);

        tickNum++;
        tickTime -= m.tickTime;
    }

    if (0 < tickTime && tickTime < time + tickBuffer) {
        tickBuffer = tickTime;
    } else {
        tickBuffer = 0;
    }

    before = timestamp;
}
var loopInterval = setInterval(loop, m.tickTime / 2);

function addPlayers() {
    while (newPlayers.length > 0) {
        var newPlayer = newPlayers.pop();

        // Return error if game is full.
        if (state[0].playerCount === m.maxPlayers) {
            io.emit("Error", "Game full.");
            break;
        }

        // Get cell for new player. If we have no players, add to center of 
        // grid. Otherwise, find the first neighboured but unoccupied cell.
        var cell = [ m.maxShells, m.maxShells ];

        var path = m.randomPaths[nextPath];
        nextPath = (nextPath + 1) % m.randomPaths.length;
        var i = 0;
        while (state[0].players[cell[0]][cell[1]]) {
            var newCell = m.neighbourCell(cell, path[i]);
            if (0 <= newCell[0] &&
                     newCell[0] < state[0].players.length &&
                0 <= newCell[1] &&
                     newCell[1] < state[0].players[newCell[0]].length) {
                        cell = newCell;
            }
            i = (i + 1) % path.length;
        }

        // Get bounds to set for this player.
        var bounds = [ ];
        for (var i = 0; i < 6; i++) {
            var neighbourCell = m.neighbourCell(cell, i);
            if (0 <= neighbourCell[0] &&
                     neighbourCell[0] < state[0].players.length &&
                0 <= neighbourCell[1] &&
                     neighbourCell[1] < state[0].players[neighbourCell[0]]
                                                .length &&
                state[0].players[neighbourCell[0]][neighbourCell[1]]) {
                    bounds.push(false);
            } else {
                    bounds.push(true);
            }
        }

        // Calculate position in the grid.
        var position = m.cellToPosition(cell);

        // Construct player.
        var player = new Player({ name: newPlayer[1],
                                  color: util.randomColor(),
                                  activeBounds: bounds,
                                  position: position });

        // Add a new ball in the new Player's cell if this player is a multiple 
        // of seven (one shell plus center).
        if (state[0].ballCount === 0 ||
            state[0].ballCount <
                Math.ceil(state[0].playerCount / m.playerBallRatio)) {
                    var ball = new Ball({ position: 
                                            { x: player.position.x +
                                                    m.playerDistance / 3,
                                              y: player.position.y } });
                    // Insert into first empty space in array.
                    var ballIndex = 0;
                    while (ballIndex < state[0].balls.length) {
                        if (state[0].balls[ballIndex] === null) {
                            break;
                        }
                        ballIndex++;
                    }
                    state[0].balls[ballIndex] = ball;
                    state[0].ballCount++;
        }

        state[0].addPlayer(cell, player);

        // Setup socket cell.
        socketCell[newPlayer[0]] = cell;
        io.sockets.connected[newPlayer[0]].emit("NewPlayer", cell);
        io.sockets.connected[newPlayer[0]].emit("GameState",
                                                [ tickNum, state[0] ]);

        console.log("New player: ", player);
    }
}

function applyInputs() {
    if (inputs.length === 0) {
        return;
    }

    inputs.sort(function (a, b) {
        return a.tick - b.tick;
    });

    var trackedBalls = [ ];
    var trackedPlayers = [ ];

    var firstTick = Math.min(tickNum - inputs[0].tick, m.tickRate - 2);
    for (var i = firstTick; i > -1; i--) {
        var curState = state[i];

        for (var j = 0; j < inputs.length; j++) {
            var input = inputs[j];

            // Apply inputs that started on or before this tick.
            if (input.tick > tickNum - i) {
                break;
            }

            // Skip if player doesn't exist.
            if (!curState.players[input.cell[0]][input.cell[1]]) {
                continue;
            }

            // Set shield angle.
            curState.players[input.cell[0]][input.cell[1]].shieldAngle = 
                input.angle;

            // Copy forward health of tracked players.
            for (var k = 0; k < trackedPlayers.length; k++) {
                var cell = trackedPlayers[k];
                if (!curState.players[cell[0]][cell[1]]) {
                    trackedPlayers.splice(k, 1);
                    k--;
                    continue;
                }
                curState.players[cell[0]][cell[1]].health = 
                    state[i + 1].players[cell[0]][cell[1]].health;
            }

            // Track balls in input cells and recalculate tracked balls.
            for (var k = 0; k < curState.balls.length; k++) {
                // Skip if ball doesn't exist.
                if (!curState.balls[k]) {
                    continue;
                }

                var cell = m.positionToCell(curState.balls[k].position);

                // Track and update on next tick if in input cell and 
                // untracked.
                if (cell[0] === input.cell[0] && cell[1] === input.cell[1] &&
                    !trackedBalls[k]) {
                        trackedBalls[k] = true;
                        continue;
                }

                // Skip if ball isn't tracked.
                if (!trackedBalls[k]) {
                    continue;
                }

                // Copy forward tracked ball.
                var ball = curState.balls[k];
                ball.position.x = state[i + 1].balls[k].position.x;
                ball.position.y = state[i + 1].balls[k].position.y;
                ball.velocity.x = state[i + 1].balls[k].velocity.x;
                ball.velocity.y = state[i + 1].balls[k].velocity.y;
                
                var player = curState.players[cell[0]][cell[1]];

                // Collide and move ball again.
                if (player) {
                    var collideBound = collide.bound(player, ball);
                    var collideShield = collide.shield(player, ball);
                    var collidePlayer = collide.player(player, ball);
                    if (collidePlayer || collideShield) {
                        var found = false;
                        for (var l = 0; l < trackedPlayers.length; l++) {
                            if (trackedPlayers[l][0] === cell[0] &&
                                trackedPlayers[l][1] === cell[1]) {
                                    var found = true;
                                    break;
                            }
                        }
                        if (!found) {
                            trackedPlayers.push(cell);
                        }
                    }
                }

                ball.position.x += ball.velocity.x;
                ball.position.y += ball.velocity.y;
            }
        }
    }

    return { balls: trackedBalls, players: trackedPlayers };
}

function buildDelta(prev, next) {
    var delta = [ ];

    for (var i = 0; i < next.players.length; i++) {
        for (var j = 0; j < next.players[i].length; j++) {
            var cell = [ i, j ];
            var nextPlayer = next.players[i][j];
            var prevPlayer = prev.players[i][j];
            if (nextPlayer && !prevPlayer) {
                delta.push([ "Player", cell, nextPlayer ]);
            } else if ((!nextPlayer && prevPlayer) ||
                       (nextPlayer && nextPlayer.health === 0)) {
                delta.push([ "Health", cell, 0 ]);
            } else if (nextPlayer && prevPlayer) {
                if (nextPlayer.shieldAngle !== prevPlayer.shieldAngle) {
                    delta.push([ "ShieldAngle", cell, nextPlayer.shieldAngle ]);
                }
                if (nextPlayer.health !== prevPlayer.health) {
                    delta.push([ "Health", cell, nextPlayer.health ]);
                }
            }
        }
    }
    for (var i = 0; i < next.balls.length; i++) {
        var nextBall = next.balls[i];
        var prevBall = prev.balls[i];
        if (nextBall && !prevBall) {
            delta.push([ "Ball", i, nextBall ]);
        } else if (nextBall && prevBall) {
            if (nextBall.position.x !== prevBall.position.x ||
                nextBall.position.y !== prevBall.position.y) {
                    delta.push([ "BallPosition", i, nextBall.position.x,
                                                    nextBall.position.y ]);
            }
            if (nextBall.velocity.x !== prevBall.velocity.x ||
                nextBall.velocity.y !== prevBall.velocity.y) {
                    delta.push([ "BallVelocity", i, nextBall.velocity.x,
                                                    nextBall.velocity.y ]);
            }
        } else if (!nextBall && prevBall) {
            // Shouldn't happen?
            console.log("whoops");
        }
    }

    return delta;
}

function buildChangeDelta(state, changes) {
    if (!changes) {
        return;
    }

    var delta = [ ];

    for (var i = 0; i < changes.players.length; i++) {
        var cell = changes.players[i];
        var player = state.players[cell[0]][cell[1]];

        if (player) {
            delta.push([ "Health", cell, player.health ]);
            delta.push([ "ShieldAngle", cell, player.shieldAngle ]);
        }
    }

    for (var i = 0; i < changes.balls.length; i++) {
        if (!changes.balls[i]) {
            continue;
        }

        var ball = state.balls[i];

        if (ball) {
            delta.push([ "BallPosition", i, ball.position.x, ball.position.y ]);
            delta.push([ "BallVelocity", i, ball.velocity.x, ball.velocity.y ]);
        }
    }

    return delta;
}
