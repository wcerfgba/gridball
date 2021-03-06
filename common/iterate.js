"use strict";

var collide = require("./collide");
var m = require("./magic");

exports = module.exports = iterate;

function iterate(state) {
    // Find and try to remove dead players.
    for (var i = 0; i < state.players.length; i++) {
        innerLoop:
        for (var j = 0; j < state.players[i].length; j++) {
            if (state.players[i][j] && state.players[i][j].health === 0) {
                // Don't delete if there are unconnected living neighbours.
                var bounds = state.players[i][j].activeBounds;
                for (var k = 0; k < bounds.length; k++) {
                    var neighbourCell = m.neighbourCell([ i, j ], k);
                    var neighbour =
                        state.players[neighbourCell[0]][neighbourCell[1]];
                    if (bounds[(k - 1) % 6] &&
                        !bounds[k] &&
                        bounds[(k + 1) % 6] &&
                        neighbour && neighbour.health > 0) {
                            continue innerLoop;
                    }
                }

                // Find balls in cell.
                var idx = [ ];
                for (var k = 0; k < state.balls.length; k++) {
                    var ball = state.balls[k];
                    if (!ball) { continue; }
                    var ballCell = m.positionToCell(ball.position);

                    if (ballCell[0] === i && ballCell[1] === j) {
                        idx.push(k);
                    }
                }

                // Remove balls if player-ball ratio is off, or if the cell is
                // closed off (all bounds active).
                while (idx.length > 0 &&
                       (state.ballCount >
                         Math.ceil(state.playerCount / m.playerBallRatio) ||
                        bounds.reduce(function (a, b) { return a & b; }))) {
                    state.balls[idx.pop()] = null;
                    state.ballCount--;
                }

                // Don't delete if there are still balls in the cell.
                if (idx.length > 0) {
                    continue innerLoop;
                }

                // No balls in cell, remove completely.
                state.players[i][j] = null;

                // Find neighbouring Players and add walls.
                for (var k = 0; k < 6; k++) {
                    var neighbourCell = m.neighbourCell([ i, j ], k);

                    // Test each neighbour vector is valid (in-bounds), and if 
                    // there is a Player there, set the appropriate bound.
                    if (0 <= neighbourCell[0] &&
                             neighbourCell[0] < state.players.length &&
                        0 <= neighbourCell[1] &&
                             neighbourCell[1] < state.players[neighbourCell[0]]
                                                     .length &&
                        state.players[neighbourCell[0]][neighbourCell[1]]) {
                            state.players[neighbourCell[0]]
                                         [neighbourCell[1]]
                                 .activeBounds[(k + 3) % 6] = true;
                    }
                }
                state.playerCount--;
            }
        }
    }

    // Update each ball in each cell.
    for (var i = 0; i < state.balls.length; i++) {
        var ball = state.balls[i];
        if (!ball) { continue; }

        var cell = m.positionToCell(ball.position);
        var player = state.players[cell[0]][cell[1]];

        if (player) {
            // Collision functions update the velocity of a Ball, but do not
            // update the position. They also change player health.
            var collideBound = collide.bound(player, ball);
            var collidePlayer = collide.player(player, ball);
            if (collideBound || collidePlayer) {
                ball.tracked = true;
            }
            if (collidePlayer) {
                player.tracked = true;
            }
        }

        // Update position from velocity.
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
    }
}
