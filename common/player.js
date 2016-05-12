"use strict";

/* A Player has a name, color, health, and shield angle. The Player object also 
 * stores which zone boundaries -- walls at the edges of a player's zone 
 * blocking off unoccupied areas -- are active, and the position co-ordinate 
 * representing the center of this cell, which is necessary for collision 
 * computations and must be specified when creating the object. */
function Player(playerState) {
    this.name = playerState.name || "";
    this.color = playerState.color || "rgb(0, 0, 0)";
    this.health = playerState.health !== undefined ? playerState.health : 100;
    this.shieldAngle = playerState.shieldAngle || 0;
    this.shieldMomentum = playerState.shieldMomentum || 0;
    this.activeBounds = playerState.activeBounds.concat() || 
                        [ true, true, true, true, true, true ];
    this.position = { x: playerState.position.x, y: playerState.position.y };
}
exports = module.exports = Player;
