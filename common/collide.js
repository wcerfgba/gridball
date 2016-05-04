"use strict";

var m = require("./magic");

var pi = 3141;
var twopi = 6182;
var half = 1570;
var third = 1047;
var sixth = 523;
var halfRootThree = Math.sqrt(3) / 2;
var onePlusHalfRootThree = 1 + halfRootThree;
var oneMinusHalfRootThree = 1 - halfRootThree;

exports = module.exports = {
    bound: function (player, ball) {
        for (var i = 0; i < player.activeBounds.length; i++) {
            if (player.activeBounds[i]) {
                var normal = m.boundNormals[i];
                var point = m.zonePoints[i];
                var v = { x: ball.position.x - (point.x + player.position.x),
                          y: ball.position.y - (point.y + player.position.y) };
                var normal_dist = v.x * normal.x + v.y * normal.y;
                var normal_velocity = normal.x * ball.velocity.x +
                                      normal.y * ball.velocity.y;
                if (normal_velocity > 0) {
                    continue;
                }

                if (normal_dist < m.ballRadius + 4) {
                    var perp_velocity = - normal.y * ball.velocity.x +
                                        normal.x * ball.velocity.y;
                    ball.velocity.x = (perp_velocity * - normal.y) - 
                                      (normal_velocity * normal.x);
                    ball.velocity.y = (perp_velocity * normal.x) -
                                      (normal_velocity * normal.y);
                    return;
                }
            }
        }
    },
    shield: function (player, ball) {
        var v = { x: ball.position.x - player.position.x,
                  y: ball.position.y - player.position.y };
        var vMagSq = Math.pow(v.x, 2) + Math.pow(v.y, 2);
        var vMag = Math.sqrt(vMagSq);
        var vNorm = { x: v.x / vMag, y: v.y / vMag };
        var vAngle = Math.atan2(vNorm.y, vNorm.x);

        var normal_velocity = vNorm.x * ball.velocity.x +
                              vNorm.y * ball.velocity.y;

        // No collision if we are moving away from the player.
        if (normal_velocity > 0) {
            return;
        }
        
        // If we are alive and ball hits the shield, bounce it.
        if (player.health > 0 &&
            vMag < m.shieldRadius + m.ballRadius + 1 &&
            player.shieldAngle - m.shieldHalfWidth < vAngle &&
            vAngle < player.shieldAngle + m.shieldHalfWidth) {
                var perp_velocity = - vNorm.y * ball.velocity.x +
                                    vNorm.x * ball.velocity.y;
                ball.velocity.x = (perp_velocity * - vNorm.y) - 
                                  (normal_velocity * vNorm.x);
                ball.velocity.y = (perp_velocity * vNorm.x) -
                                  (normal_velocity * vNorm.y);
        }
    },
    player: function (player, ball) {
        var v = { x: ball.position.x - player.position.x,
                  y: ball.position.y - player.position.y };
        var vMagSq = Math.pow(v.x, 2) + Math.pow(v.y, 2);
        var vMag = Math.sqrt(vMagSq);
        var vNorm = { x: v.x / vMag, y: v.y / vMag };

        var normal_velocity = vNorm.x * ball.velocity.x +
                              vNorm.y * ball.velocity.y;

        // No collision if we are moving away from the player.
        if (normal_velocity > 0) {
            return;
        }

        // Collide with player, take damage.
        if (vMag < m.playerRadius + m.ballRadius + 1) {
            var perp_velocity = - vNorm.y * ball.velocity.x +
                                vNorm.x * ball.velocity.y;
            ball.velocity.x = (perp_velocity * - vNorm.y) - 
                              (normal_velocity * vNorm.x);
            ball.velocity.y = (perp_velocity * vNorm.x) -
                              (normal_velocity * vNorm.y);
            player.health < 10 ? player.health = 0 : player.health -= 10;
        }
    }
};
