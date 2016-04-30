"use strict";

var util = require("./util");
var m = require("./magic");

/* This module exports a Simulation object, which is used to model the game. */
exports = module.exports = Simulation;

/* The Simulation maintains a 2D array of Players, indexed first by rows of the 
 * grid from top to bottom, and then by cell from left to right. The Simulation 
 * also stores an array of all Balls. The Simulation also stores a count of the 
 * current number of players. The Simulation also provides a semaphore for 
 * safety when applying migrations. */
function Simulation() {
    this.players = m.hexArray(m.maxShells);
    this.balls = [ ];
    this.playerCount = 0;
    this.migrationLock = false;
}

/* Allows setting the state of a Simulation from another object. */
Simulation.prototype.setState = function (simulationState) {
    if (this.migrationLock) {
        return false;
    }
    this.migrationLock = true;

    this.players = simulationState.players;
    this.balls = simulationState.balls;
    this.playerCount = simulationState.playerCount;

    this.migrationLock = false;
    return true;
}

/* The tick function iterates the Simulation by one time step. It updates the 
 * player shield positions, detects collisions and changes ball momenta, and 
 * updates the ball positions. */
Simulation.prototype.tick = function () {
    // Update each player's shield.
    for (var i = 0; i < this.players.length; i++) {
        for (var j = 0; j < this.players[i].length; i++) {
            if (this.players[i][j].length !== 0) {
                var player = this.players[i][j][0];

                if (player.shieldMomentum !== 0) {
                    var angle = player.shieldAngle + 
                                    player.shieldMomentum * m.shieldIncrement;
                    if (angle < - Math.PI) {
                        angle += 2 * Math.PI;
                    } else if (Math.PI < angle) {
                        angle -= 2 * Math.PI;
                    }
                    player.shieldAngle = angle % Math.PI;
                }
            }
        }
    }

    // Update each ball in each cell.
    for (var i = 0; i < this.balls.length; i++) {
        var ball = this.balls[i];
        var cell = m.positionToCell(ball.position);
        var player = this.players[cell[0]][cell[1]][0];

        // Collision functions update the velocity of a Ball, but do not update 
        // the position.
        collideWithBounds(ball, player) ||
        collideWithShield(ball, player) ||
        collideWithPlayer(ball, player);

        // Update position from velocity.
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
    }
};

/* The inputUpdate function takes the game state from the last tick, and the 
 * cell of a player inputting a command, and recomputes any changes in this 
 * slice of the game state as a result of the input. The function also takes 
 * and mutates two arrays for tracking Balls and Players that have been 
 * affected by the input. */
Simulation.prototype.inputUpdate =
function (past, cell, trackedBalls, trackedPlayers) {
    // Get current and past Player.
    var curPlayer = this.players[cell[0]][cell[1]];
    var pastPlayer = past.players[cell[0]][cell[1]];

    // Carry forward shield properties
    curPlayer.shieldMomentum = prevPlayer.shieldMomentum;
    curPlayer.shieldAngle = prevPlayer.shieldAngle;
    
    // Recalculate shield angle.
    var angle = curPlayer.shieldAngle + 
                    curPlayer.shieldMomentum * m.shieldIncrement;
    if (angle < - Math.PI) {
        angle += 2 * Math.PI;
    } else if (Math.PI < angle) {
        angle -= 2 * Math.PI;
    }
    curPlayer.shieldAngle = angle % Math.PI;

    // Carry forward health of tracked Players.
    for (var i = 0; i < trackedPlayers.length; i++) {
        var trackedCell = trackedPlayers[i];
        this.players[trackedCell[0]][trackedCell[1]].health = 
            past.players[trackedCell[0]][trackedCell[1]];
    }
    
    // Recalculate positions of carried-over Balls in zone and tracked non-zone 
    // balls. Player collisions activate tracking of Player health and Ball. 
    // Shield collisions activate tracking of Ball.
    for (var i = 0; i < this.balls.length; i++) {
        var curBall = this.balls[i];
        if (!curBall) { continue; }

        var ballCell = m.positionToCell(curBall.position);
        var ballCellPlayer = this.players[ballCell[0]][ballCell[1]];

        // Ball in cell of this player, or in another cell but tracked.
        if ((ballCell[0] === cell[0] && ballCell[1] === cell[1]) ||
            trackedBalls[i]) {
                var prevBall = past.balls[i];
                if (!prevBall) { continue; }

                // Carry forward Ball properties.
                curBall.position.x = pastBall.position.x;
                curBall.position.y = pastBall.position.y;
                curBall.velocity.x = pastBall.velocity.x;
                curBall.velocity.y = pastBall.velocity.y;

                // Recalculate collisions.
                collide.bound(ballCellPlayer, curBall);
                var shieldCollision = collide.shield(ballCellPlayer, curBall);
                var playerCollision = collide.player(ballCellPlayer, curBall);

                // Recalculate position.
                curBall.position.x += curBall.velocity.x;
                curBall.position.y += curBall.velocity.y;

                // Track.
                if (shieldCollision || playerCollision) {
                    trackedBalls[i] = true;
                }
                if (playerCollision) {
                    trackedPlayers.push(ballCell);
                }
        }
    }
};

/* Takes an addPlayer migration and mutates the Simulation to add the new 
 * player to the game. Returns false if lock fails, true on completion. */
Simulation.prototype.addPlayer = function (migration) {
    // Attempt to lock for migration.
    if (this.migrationLock) {
        return false;
    }
    this.migrationLock = true;

    // Get neighbours based on false entries in player.activeBounds and remove 
    // their bounds.
    for (var i = 0; i < migration.player.activeBounds.length; i++) {
        if (migration.player.activeBounds[i] === false) {
            var neighbourCell = m.neighbourCell(migration.cell, i)
            var neighbour = this.players[neighbourCell[0]]
                                        [neighbourCell[1]]
                                        [0];
            neighbour.activeBounds[(i + 3) % 6] = false;
        }
    }

    // Construct Player and insert into hex array.
    this.players[migration.cell[0]][migration.cell[1]][0] = 
        new Player(migration.player);
    this.playerCount++;

    // Construct and insert Ball if one was made.
    if (migration.hasOwnProperty("ball")) {
        this.balls.push(new Ball(migration.ball));
    }

    this.migrationLock = false;
    return true;
};

/* Takes the name of a player and constructs a migration object containing the 
 * information required to update the simulation and add the player to the 
 * game. */
Simulation.prototype.addPlayerMigration = function (name) {
    // Return error if game is full.
    if (this.playerCount === m.maxPlayers) {
        return { error: "Game is full." };
    }

    var playerState = { name: name };
    var cell = null;

    // If we have no players, add to center of grid. Otherwise, find the first 
    // neighboured but unoccupied cell.
    if (this.playerCount === 0) {
        cell = [ m.maxShells, m.maxShells ];
    } else {
        for (var i = 0; i < m.playerPositions.length - 1; i++) {
            var a = m.playerPositions[i];
            var b = m.playerPositions[i + 1];

            var cell_a = this.players[a[0]][a[1]];
            var cell_b = this.players[b[0]][b[1]];

            if (cell_a.length === 0 && cell_b.length !== 0) {
                cell = a;
                break;
            } else if (cell_a.length !== 0 && cell_b.length === 0) {
                cell = b;
                break;
            }
        }
    }

    if (cell === null) {
        return { error: "Could not find neighboured but unoccupied cell." };
    }

    // Find neighbouring Players and remove walls.
    var neighbours = [ ];
    for (var i = 0; i < 6; i++) {
        var neighbourCell = m.neighbourCell(cell, i);

        // Test each neighbour vector is valid (in-bounds), and if there is a 
        // Player there, push them into the array. Missing neighbours are 
        // represented as nulls.
        if (0 <= neighbourCell[0] &&
                 neighbourCell[0] < this.players.length &&
            0 <= neighbourCell[1] &&
                 neighbourCell[1] < this.players[neighbourCell[0]].length &&
            this.players[neighbourCell[0]][neighbourCell[1]].length !== 0) {
                neighbours.push(false);
        } else {
            neighbours.push(true);
        }
    }
    
    playerState.activeBounds = neighbours;

    // Calculate position in the grid.
    var position = m.cellToPosition(cell);
    playerState.position = position;

    // Construct and insert Player.
    var player = new Player(playerState);

    // Add a new ball in the new Player's cell if this player is a multiple of 
    // seven (one shell plus center).
    if (this.playerCount % 7 === 0) {
        var ball = new Ball(
                    { position: 
                        { x: player.position.x + m.playerDistance / 3,
                          y: player.position.y }
                    });

        return { cell: cell, player: player, ball: ball };
    }

    return { cell: cell, player: player };
}

Simulation.prototype.removePlayer = function (migration) {
    // Attempt to lock for migration.
    if (this.migrationLock) {
        return false;
    }
    this.migrationLock = true;

    // Remove player from array and update count.
    this.players[migration.cell[0]][migration.cell[1]] = [ ];
    this.playerCount--;

    // Add walls to neighbours.
    for (var i = 0; i < 6; i++) {
        var cell = migration.neighbours[i];
        // Test each neighbour vector is valid (in-bounds), and if there is a 
        // Player there, update the appropriate bound.
        if (0 <= cell[0] && cell[0] < this.players.length &&
            0 <= cell[1] && cell[1] < this.players[cell[0]].length &&
            this.players[cell[0]][cell[1]].length !== 0) {
                var neighbour = this.players[cell[0]][cell[1]][0];
                neighbour.activeBounds[(i + 3) % 6] = true;
        }
    }

    // If we have a ball to remove, remove it.
    if (migration.ballIndex) {
        this.balls.splice(migration.ballIndex, 1);
    }

    this.migrationLock = false;
    return true;
};

Simulation.prototype.removePlayerMigration = function (cell) {
    // If we will have too many balls once this player is removed, find the 
    // nearest Ball to them and remove it.
    var playerPosition = this.players[cell[0]][cell[1]][0].position;
    if (this.playerCount % 7 === 1) {
        var nearestIndex = null;
        var nearestDistSq = Number.MAX_VALUE;
        for (var i = 0; i < this.balls.length; i++) {
            var distSq = Math.pow(playerPosition.x - this.balls[i].position.x,
                                    2) + 
                         Math.pow(playerPosition.y - this.balls[i].position.y,
                                    2);
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestIndex = i;
            }
        }

        return { cell: cell, neighbours: m.neighbourCells(cell), 
                 ballIndex: nearestIndex };   
    }

    // No ball to remove.
    return { cell: cell, neighbours: m.neighbourCells(cell) };
};

/* A Player has a name, color, health, and shield angle. The Player object also 
 * stores which zone boundaries -- walls at the edges of a player's zone 
 * blocking off unoccupied areas -- are active, and the position co-ordinate 
 * representing the center of this cell, which is necessary for collision 
 * computations and must be specified when creating the object. */
function Player(playerState) {
    this.name = playerState.name || "";
    this.color = playerState.color || util.randomColor();
    this.health = playerState.health || 100;
    this.shieldAngle = playerState.shieldAngle || 0;
    this.activeBounds = playerState.activeBounds || 
                        [ true, true, true, true, true, true ];
    this.position = playerState.position;
}

/* A Ball has a position and a velocity, both of which are (x, y) 
 * co-ordinates. The position is mandatory, and unless specified the velocity 
 * is random with a maximum speed (i.e. modulus) of 1. */
function Ball(ballState) {
    this.position = ballState.position;
    this.velocity = ballState.velocity ||
                    { x: Math.random() / Math.sqrt(2),
                      y: Math.random() / Math.sqrt(2) };
}

function collideWithBounds(ball, player) {
};

function collideWithShield(ball, player) {
};

function collideWithPlayer(ball, player) {
};
