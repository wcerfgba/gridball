"use strict";

var m = require("./magic");

exports = module.exports = {
    bound: function (player, ball) {
        for (var i = 0; i < player.activeBounds.length; i++) {
            if (player.activeBounds[i]) {
                var normal = m.boundNormals[i];
                var point = m.zonePoints[i];
                var v = { x: ball.position.x - (point.x + player.position.x),
                          y: ball.position.y - (point.y + player.position.y) };
                var normal_dist = v.x * normal.x + v.y * normal.y;

                if (normal_dist < m.ballRadius + 4) {
                    var normal_velocity = normal.x * ball.velocity.x +
                                          normal.y * ball.velocity.y;
                    if (normal_velocity > -0.1) {
                        continue;
                    }

                    var perp_velocity = - normal.y * ball.velocity.x +
                                        normal.x * ball.velocity.y;
                    ball.velocity.x = (perp_velocity * - normal.y) - 
                                      (normal_velocity * normal.x);
                    ball.velocity.y = (perp_velocity * normal.x) -
                                      (normal_velocity * normal.y);
//console.log("bound: ", ball.position.x, ball.position.y, ball.velocity.x, ball.velocity.y, player.activeBounds);
                    return true;
                }
            }
        }

        return false;
    },
    shield: function (player, ball) {
        // Don't bother if player is dead.
        if (player.health === 0) {
            return false;
        }

        var v = { x: ball.position.x - player.position.x,
                  y: ball.position.y - player.position.y };
        var vMagSq = Math.pow(v.x, 2) + Math.pow(v.y, 2);
        var vMag = Math.sqrt(vMagSq);
        var vNorm = { x: v.x / vMag, y: v.y / vMag };
        var vAngle = Math.atan2(vNorm.y, vNorm.x);

        var normal_velocity = vNorm.x * ball.velocity.x +
                              vNorm.y * ball.velocity.y;

        // No collision unless we are moving towards the player fast enough.
        if (normal_velocity > -0.1) {
            return false;
        }
        
        // If we are alive and ball hits the shield, bounce it.
        var angleDiff = vAngle - player.shieldAngle;
        if (Math.abs(angleDiff) > Math.PI) {
            angleDiff -= Math.sign(angleDiff) * 2 * Math.PI;
        }
        if (player.health > 0 &&
            vMag < m.shieldRadius + m.ballRadius + 1 &&
            Math.abs(angleDiff) < m.halfShieldWidth) {
                var perp_velocity = - vNorm.y * ball.velocity.x +
                                    vNorm.x * ball.velocity.y;
                ball.velocity.x = (perp_velocity * - vNorm.y) - 
                                  1.25 * (normal_velocity * vNorm.x);
                ball.velocity.y = (perp_velocity * vNorm.x) -
                                  1.25 * (normal_velocity * vNorm.y);
                if (Math.abs(ball.velocity.x) > m.maxBallSpeed) {
                    ball.velocity.x =
                        Math.sign(ball.velocity.x) * m.maxBallSpeed;
                } else if (Math.abs(ball.velocity.y) < m.minBallSpeed) {
                    ball.velocity.x = 
                        Math.sign(ball.velocity.x) * m.minBallSpeed;
                }
                if (Math.abs(ball.velocity.y) > m.maxBallSpeed) {
                    ball.velocity.y =
                        Math.sign(ball.velocity.y) * m.maxBallSpeed;
                } else if (Math.abs(ball.velocity.y) < m.minBallSpeed) {
                    ball.velocity.y = 
                        Math.sign(ball.velocity.y) * m.minBallSpeed;
                }
//console.log("shield: ", ball.position.x, ball.position.y, ball.velocity.x, ball.velocity.y);
            return true;
        }

        return false;
    },
    player: function (player, ball) {
        // Don't bother if player is dead.
        if (player.health === 0) {
            return false;
        }

        var v = { x: ball.position.x - player.position.x,
                  y: ball.position.y - player.position.y };
        var vMagSq = Math.pow(v.x, 2) + Math.pow(v.y, 2);
        var vMag = Math.sqrt(vMagSq);
        var vNorm = { x: v.x / vMag, y: v.y / vMag };

        var normal_velocity = vNorm.x * ball.velocity.x +
                              vNorm.y * ball.velocity.y;

        // No collision if we are moving away from the player.
        if (normal_velocity > -0.1) {
            return false;
        }

        // Collide with player, take damage.
        if (vMag < m.playerRadius + m.ballRadius + 1) {
            var perp_velocity = - vNorm.y * ball.velocity.x +
                                vNorm.x * ball.velocity.y;
            ball.velocity.x = (perp_velocity * - vNorm.y) - 
                              0.95 * (normal_velocity * vNorm.x);
            ball.velocity.y = (perp_velocity * vNorm.x) -
                              0.95 * (normal_velocity * vNorm.y);
            if (Math.abs(ball.velocity.x) > m.maxBallSpeed) {
                ball.velocity.x =
                    Math.sign(ball.velocity.x) * m.maxBallSpeed;
            } else if (Math.abs(ball.velocity.y) < m.minBallSpeed) {
                ball.velocity.x = 
                    Math.sign(ball.velocity.x) * m.minBallSpeed;
            }
            if (Math.abs(ball.velocity.y) > m.maxBallSpeed) {
                ball.velocity.y =
                    Math.sign(ball.velocity.y) * m.maxBallSpeed;
            } else if (Math.abs(ball.velocity.y) < m.minBallSpeed) {
                ball.velocity.y = 
                    Math.sign(ball.velocity.y) * m.minBallSpeed;
            }
            var damage = -normal_velocity;
            player.health < damage ? player.health = 0 : player.health -= damage;

console.log("player: ", ball.position.x, ball.position.y, ball.velocity.x, ball.velocity.y);
            return true;
        }

        return false;
    }
};
