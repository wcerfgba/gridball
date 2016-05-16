"use strict";

var express = require("express");
var http = require("http");
var socketio = require("socket.io");
var State = require("../common/state");
var Player = require("../common/player");
var Ball = require("../common/ball");
var iterate = require("../common/iterate");
var m = require("../common/magic");
var util = require("./util");

var app = express();
var server = http.Server(app);
var io = socketio(server);

var socketCell = { };
var state = [ new State() ];
var tickNum = 0;
var tickBuffer = 0;
var inputs = [ ];
var newPlayers = [ ];
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
    while (tickTime > 0 &&
           (state[0].playerCount > 0 || newPlayers.length > 0)) {
        tick();
        tickNum++;
        tickTime -= m.tickTime;
    }
    tickBuffer = tickTime;

    before = timestamp;
}
var loopInterval = setInterval(loop, m.tickTime);

function tick() {
    var delta = [ ];
    var trackedState = state[0];

    if (inputs.length > 0) {
        inputs.sort(function (a, b) {
            return a.tick - b.tick;
        });

        //var oldCurrentState = new State(state[0]);
        var tickIndex = Math.min(tickNum - inputs[0].tick, m.tickRate - 1);
        var updateState = trackedState = new State(state[tickIndex]);
        while (tickIndex > 0) {
            for (var i = 0; i < inputs.length; i++) {
                var input = inputs[i];
                if (input.tick > tickNum - tickIndex) {
                    break;
                }
//console.log("INTEGRATE INPUT @ ", tickNum, " (", tickNum - tickIndex, ") - ", input);
                var player = updateState.players[input.cell[0]][input.cell[1]];
                if (!player) {
                    inputs.splice(i, 1);
                    i--;
                    continue;
                }
                /*var angleDiff = input.angle - player.shieldAngle;
                if (Math.abs(angleDiff) < m.shieldIncrement) {
                    inputs.splice(i, 1);
                    i--;
                }
                if (Math.abs(angleDiff) > Math.PI) {
                    angleDiff -= Math.sign(angleDiff) * 2 * Math.PI;
                }
                angleDiff = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff),   
                                                            m.shieldIncrement);
                var newAngle = player.shieldAngle + angleDiff
                if (Math.abs(newAngle) > Math.PI) {
                    newAngle -= Math.sign(newAngle) * 2 * Math.PI;
                }
                player.shieldAngle = newAngle;*/
                player.shieldAngle = input.angle;
                player.tracked = true;
            }
            iterate(updateState);
            tickIndex--;

            // Migrate players.
            for (var i = 0; i < updateState.players.length; i++) {
                for (var j = 0; j < updateState.players[i].length; j++) {
                    var updatePlayer = updateState.players[i][j];
                    var tickPlayer = state[tickIndex].players[i][j];

                    if (!updatePlayer && tickPlayer) {
                        updateState.players[i][j] = new Player(tickPlayer);
                        // Get neighbours based on false entries in player.activeBounds and 
                        // remove their bounds.
                        for (var k = 0; k < 6; k++) {
                            if (!updateState.players[i][j].activeBounds[k]) {
                                var neighbourCell = m.neighbourCell([ i, j ], k);
                                var neighbour =
                                    updateState.players[neighbourCell[0]][neighbourCell[1]];
                                if (neighbour) {
                                    neighbour.activeBounds[(k + 3) % 6] = false;
                                }
                            }
                        }
                    } else if (updatePlayer && !tickPlayer) {
                        updatePlayer.health = 0;
                    }
                }
            }

            state[tickIndex] = new State(updateState);
        }
    }

    // Compute delta.
    for (var i = 0; i < trackedState.players.length; i++) {
        for (var j = 0; j < trackedState.players[i].length; j++) {
            var cell = [ i, j ];
            var player = trackedState.players[i][j];
            if (!player) {
                continue;
            }
            if (player.tracked) {
                delta.push([ "ShieldAngle", cell, player.shieldAngle ]);
                delta.push([ "Health", cell, player.health ]);
            }
        }
    }
    for (var i = 0; i < trackedState.balls.length; i++) {
        var ball = trackedState.balls[i];
        if (!ball) {
            continue;
        }
        if (ball.tracked) {
            delta.push([ "BallPosition", i, ball.position.x, ball.position.y ]);
            delta.push([ "BallVelocity", i, ball.velocity.x, ball.velocity.y ]);
        }
    }

    while (newPlayers.length > 0) {
        var newPlayer = newPlayers.pop();

        // Return error if game is full.
        if (state[0].playerCount === m.maxPlayers) {
            socket.emit("Error", "Game full.");
            break;
        }

        // Get cell for new player. If we have no players, add to center of 
        // grid. Otherwise, find the first neighboured but unoccupied cell.
        var cell = null;
        if (state[0].playerCount === 0) {
            cell = [ m.maxShells, m.maxShells ];
        } else {
            for (var i = 0; i < m.playerPositions.length - 1; i++) {
                var a = m.playerPositions[i];
                var b = m.playerPositions[i + 1];

                var cell_a = state[0].players[a[0]][a[1]];
                var cell_b = state[0].players[b[0]][b[1]];

                if (!cell_a && cell_b) {
                    cell = a;
                    break;
                } else if (cell_a && !cell_b) {
                    cell = b;
                    break;
                }
            }
        }
        if (cell === null) {
            console.log("ERROR: Could not find neighboured but unoccupied cell.");
            socket.emit("Error", "Could not find neighboured but unoccupied cell.");
            break;
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
        if (state[0].playerCount % 7 === 0) {
            var ball = new Ball(
                        { position: 
                            { x: player.position.x + m.playerDistance / 3,
                              y: player.position.y }
                        });
            // Insert into first empty space in array.
            var ballIndex = 0;
            while (ballIndex < state[0].balls.length) {
                if (state[0].balls[i] === null) {
                    break;
                }
                ballIndex++;
            }
            state[0].balls[ballIndex] = ball;
            delta.push([ "Ball", ballIndex, ball ]);
        }

        state[0].players[cell[0]][cell[1]] = player;
        state[0].playerCount++;
        // Get neighbours based on false entries in player.activeBounds and 
        // remove their bounds.
        for (var j = 0; j < 6; j++) {
            if (!state[0].players[cell[0]][cell[1]].activeBounds[j]) {
                var neighbourCell = m.neighbourCell(cell, j);
                var neighbour =
                    state[0].players[neighbourCell[0]][neighbourCell[1]];
                if (neighbour) {
                    neighbour.activeBounds[(j + 3) % 6] = false;
                }
            }
        }
        delta.push([ "Player", cell, player ]);

        // Setup socket cell.
        socketCell[newPlayer[0]] = cell;
        io.sockets.connected[newPlayer[0]].emit("NewPlayer", cell);
        io.sockets.connected[newPlayer[0]].emit("GameState",
                                                [ tickNum, state[0] ]);

        console.log("New player: ", player);
    }

    while (disconnects.length > 0) {
        var disconnect = disconnects.pop();
        if (state[0].players[disconnect[0]][disconnect[1]]) {
            state[0].players[disconnect[0]][disconnect[1]].health = 0;
        }
        delta.push([ "Health", disconnect, 0 ]);
    }

    if (delta.length > 0 || tickNum % m.snapshotRate === 0) {
        delta.unshift(tickNum);
//console.log(delta);
        io.emit("Delta", delta);
    }

    var curState = new State(state[0]);
    iterate(curState);
    state.unshift(curState);
    state = state.slice(0, m.tickRate);
}
