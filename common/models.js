"use strict";

var geometry = require("./geometry");
var util = require("./util");

/* This module exports a Simulation object, which is used to model the game. */
exports = module.exports = Simulation;

/* The Simulation object tracks the state of the game -- the position of the 
 * players and walls, shield positions and momenta, and the positions and 
 * momenta of balls -- and allows iteration of the state over time.
 *
 * To limit the total number of players to less than 1000 (for performance 
 * reasons) on a hexagonal grid, it is necessary to have a side length of 
 * n = 18, giving 3 * 18 * (18 - 1) + 1 = 919 players per grid. */
var maxPlayers = 919;

/* Various lengths affect both the gameplay and the implementation of the 
 * simulation: the radius of the ball, the radius of the player node, the 
 * radius of the player shield, and the distance between players on the grid 
 * (which in turn determines the distances to zone boundaries). We will assume 
 * that the ratios:
 *     ball radius : player radius : shield radius : player distance
 * are equal to 1 : 3 : 3.5 : 18. In a fully-enclosed zone, the maximum distance
 * between the closest point on the ball and the player is given by:
 *     0.5 * player distance - 2 * ball radius - player radius
 * which in this instance is 0.5 * 18 - 2 * 1 - 3 = 4. For performance reasons 
 * we would like to work only in integer co-ordinates, and a granularity of only 
 * four to five distances when the ball is approaching the player is clearly 
 * insufficient. At the same time, the maximum width of the grid is given by:
 *     (2 * side length - 1) * player distance
 * which with these ratios evaluates to (2 * 18 - 1) * 18 = 630. If we choose a 
 * multiplier of 100, then we get a total width of 63000, which still fits into 
 * an unsigned short, and a minimum zone edge ball distance of 400. */
var ballRadius = 100;
var playerRadius = 300;
var shieldRadius = 350;
var playerDistance = 1800;

/* The time taken for a ball to collide with a player from the minimum zone 
 * edge ball distance is given by:
 *     distance / (tick rate * speed)
 * where the tick rate is the number of times the simulation is updated per 
 * second. If we operate at 20 ticks per second, this gives a maximum time of 
 * 400 / (20 * 1) = 20 seconds, which is very slow. Speed 8 gives 2.5 seconds, 
 * which is a more acceptable minimum. The time difference between speed 8 and 
 * speed 9 is 0.27 seconds, which is a 10.8% increase in speed. This is the 
 * largest increase in the speed series, and so the discretization of the speed 
 * makes an interesting gameplay mechanic: slow balls gain speed quicker than 
 * faster balls. At the other end of the scale, speed 200 gives 0.1 seconds, 
 * which can be a maximum, with an increase from speed 199 of about half a 
 * millisecond.
 *  */
var tickRate = 20;
var minBallSpeed = 8;
var maxBallSpeed = 200;


function Game(gameState) {
    this.players = gameState.players || geometry.Sparse;
    this.balls = gameState.balls || [ ];
}

function Player(playerState) {
    this.name = playerState.name || "";
    this.color = playerState.color || util.randomColor();
    this.health = playerState.health || 100;
    this.shieldAngle = playerState.shieldAngle || 0;
}

function Ball(ballState) {
    this.position = ballState.position;
    this.velocity = ballState.velocity;
}

Game.prototype.addPlayer = function (name) {
    var player = new Player({ name: name });
};
