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
    this.players = m.hexArray(maxShells);
    this.balls = [ ];
    this.playerCount = 0;
    this.migrationLock = false;
}

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

Simulation.prototype.tick = function () {
    // Update each ball in each cell.
    for (var i = 0; i < this.balls.length; i++) {
        var ball = this.balls[i];
        var cell = m.positionToCell(ball.position);
        var player = this.players[cell[0]][cell[1]][0];

        // Collision functions update the velocity of a Ball, but do not update 
        // the position.
        ball.collideWithBounds(player) ||
        ball.collideWithShield(player) ||
        ball.collideWithPlayer(player);

        // Update position from velocity.
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
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
            var neighbour = this.players[migration.cell[0] + m.hexVectors[i][0]]
                                        [migration.cell[1] + m.hexVectors[i][1]]
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

            if (cell_a === [ ] && cell_b !== [ ]) {
                cell = a;
                break;
            } else if (cell_a !== [ ] && cell_b === [ ]) {
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
    for (var i = 0; i < m.hexVectors.length; i++) {
        var neighbourCell = [ cell[0] + m.hexVectors[i][0],
                              cell[1] + m.hexVectors[i][1] ];

        // Test each neighbour vector is valid (in-bounds), and if there is a 
        // Player there, push them into the array. Missing neighbours are 
        // represented as nulls.
        if (0 <= neighbourCell[0] &&
                 neighbourCell[0] < this.players.length &&
            0 <= neighbourCell[1] &&
                 neighbourCell[1] < this.players[neighbourCell[0]].length &&
            this.players[neighbourCell[0]][neighbourCell[1]] !== [ ]) {
                neighbours.push(true);
        } else {
            neighbours.push(false);
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
                        { x: player.position.x + m.halfPlayerDistance * 1.5,
                          y: player.position.y + m.halfPlayerDistance * 1.5 }
                    });

        return { cell: cell, player: player, ball: ball };
    }

    return { cell: cell, player: player };
}

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

Ball.prototype.collideWithBounds = function (player) {
};

Ball.prototype.collideWithShield = function (player) {
};

Ball.prototype.collideWithPlayer = function (player) {
};
