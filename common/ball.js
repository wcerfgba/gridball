"use strict";

/* A Ball has a position and a velocity, both of which are (x, y) 
 * co-ordinates. The position is mandatory, and unless specified the velocity 
 * is random with a maximum speed (i.e. modulus) of 1. */
function Ball(ballState) {
    this.position = { x: ballState.position.x, y: ballState.position.y };
    this.velocity = ballState.velocity ? 
                    { x: ballState.velocity.x, y: ballState.velocity.y } :
                    { x: 1 + Math.random(), y: 1 + Math.random() };
}
exports = module.exports = Ball;
