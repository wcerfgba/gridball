"use strict";

var util = require("./util");
var m = require("./magic");

/* This module exports a Simulation object, which is used to model the game. */
exports = module.exports = Simulation;

/* The Simulation maintains a 2D array of Players, indexed first by rows of the 
 * grid from top to bottom, and then by cell from left to right. The Simulation 
 * also stores an array of all Balls. The Simulation also stores a count of the 
 * current number of players. Deep-copies if called with argument. */
function Simulation(simulation) {
    this.players = m.hexArray(m.maxShells);
    this.balls = [ ];
    this.playerCount = 0;

    if (simulation) {
        for (var i = 0; i < this.players.length; i++) {
            for (var j = 0; j < this.players[i].length; j++) {
                if (simulation.players[i][j]) {
                    this.players[i][j] = new Player(simulation.players[i][j]);
                }
            }
        }
        for (var i = 0; i < simulation.balls.length; i++) {
            if (simulation.balls[i]) {
                this.balls[i] = new Ball(simulation.balls[i]);
            }
        }
        this.playerCount = simulation.playerCount;
    }
}

Simulation.prototype.applyDelta = function (delta) {
    for (var i = 1; i < delta.length; i++) {
        var state = delta[i];

        switch (state[0]) {
        case "ball":
            this.balls[state[1]] = new Ball(state[2]);
            break;
        case "remove_ball":
            this.balls[state[1]] = null;
            break;
        case "position":
            this.balls[state[1]].position.x = state[2];
            this.balls[state[1]].position.y = state[3];
            break;
        case "velocity":
            this.balls[state[1]].velocity.x = state[2];
            this.balls[state[1]].velocity.y = state[3];
            break;
        case "player":
            this.players[state[1][0]][state[1][1]] = new Player(state[2]);
            // Get neighbours based on false entries in player.activeBounds and 
            // remove their bounds.
            for (var i = 0; i < 6; i++) {
                if (!this.players[state[1][0]][state[1][1]].activeBounds[i]) {
                    var neighbourCell = m.neighbourCell(state[1], i);
                    var neighbour =
                        this.players[neighbourCell[0]][neighbourCell[1]];
                    neighbour.activeBounds[(i + 3) % 6] = false;
                }
            }
            this.playerCount++;
            break;
        case "remove_player":
            this.players[state[1][0]][state[1][1]] = null;
            // Find neighbouring Players and remove walls.
            for (var i = 0; i < 6; i++) {
                var neighbourCell = m.neighbourCell(state[1], i);

                // Test each neighbour vector is valid (in-bounds), and if there is a 
                // Player there, push them into the array. Missing neighbours are 
                // represented as nulls.
                if (0 <= neighbourCell[0] &&
                         neighbourCell[0] < this.players.length &&
                    0 <= neighbourCell[1] &&
                         neighbourCell[1] < this.players[neighbourCell[0]].length &&
                    this.players[neighbourCell[0]][neighbourCell[1]]) {
                        this.players[neighbourCell[0]]
                                    [neighbourCell[1]].activeBounds[(i + 3) % 6] = true;
                }
            }
            this.playerCount--;
            break;
        case "shieldAngle":
            this.players[state[1][0]][state[1][1]].shieldAngle = state[2];
            break;
        case "shieldMomentum":
            this.players[state[1][0]][state[1][1]].shieldMomentum = state[2];
            break;
        case "health":
            this.players[state[1][0]][state[1][1]].health = state[2];
            break;
        }
    }
}

/* Allows setting the state of a Simulation from another object. */
Simulation.prototype.setState = function (simulationState) {
    this.players = simulationState.players;
    this.balls = simulationState.balls;
    this.playerCount = simulationState.playerCount;
}

/* The tick function iterates the Simulation by one time step. It updates the 
 * player shield positions, detects collisions and changes ball momenta, and 
 * updates the ball positions. */
Simulation.prototype.tick = function () {
    // Update each player's shield.
    for (var i = 0; i < this.players.length; i++) {
        for (var j = 0; j < this.players[i].length; i++) {
            var player = this.players[i][j];
            if (!player) { continue; }

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

    // Update each ball in each cell.
    for (var i = 0; i < this.balls.length; i++) {
        var ball = this.balls[i];
        var cell = m.positionToCell(ball.position);
        var player = this.players[cell[0]][cell[1]];

        if (player) {
            // Collision functions update the velocity of a Ball, but do not
            // update the position. They also change player health.
            collideWithBounds(ball, player) ||
            collideWithShield(ball, player) ||
            collideWithPlayer(ball, player);
        }

        // Update position from velocity.
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
    }
};

/* DEPRECATED BUT USEFUL: Use this to make input updates more efficient on the 
 *                        server.
 *
 * The inputUpdate function takes the game state from the last tick, and the 
 * cell of a player inputting a command, and recomputes any changes in this 
 * slice of the game state as a result of the input. The function also takes 
 * and mutates two arrays for tracking Balls and Players that have been 
 * affected by the input. */
Simulation.prototype.inputUpdate =
function (past, cell, trackedBalls, trackedPlayers) {
        return false;
    }
    this.migrationLock = true;

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

    this.migrationLock = false;
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
    this.activeBounds = playerState.activeBounds.concat() || 
                        [ true, true, true, true, true, true ];
    this.position = { x: playerState.position.x, y: playerState.position.y };
}

/* A Ball has a position and a velocity, both of which are (x, y) 
 * co-ordinates. The position is mandatory, and unless specified the velocity 
 * is random with a maximum speed (i.e. modulus) of 1. */
function Ball(ballState) {
    this.position = { x: ballState.position.x, y: ballState.position.y };
    this.velocity = { x: ballState.velocity.x, y: ballState.velocity.y } ||
                    { x: Math.random() / Math.sqrt(2),
                      y: Math.random() / Math.sqrt(2) };
}

function collideWithBounds(ball, player) {
};

function collideWithShield(ball, player) {
};

function collideWithPlayer(ball, player) {
};
