"use strict";

var m = require("../common/magic");

exports = module.exports = {
    player: function (ctx, topleft, downsample, player) {
        // Calculate center.
        var center = { x: (player.position.x - topleft.x) / downsample,
                       y: (player.position.y - topleft.y) / downsample };

        // Draw zone.
        if (player.health === 0) {
            ctx.fillStyle = "rgb(255, 255, 255)";
        } else {
            ctx.fillStyle = "rgb(" + (2 * (100 - player.health) + 55) + ", " +
                                     (2 * player.health + 55) + ", 55)";
        }
        ctx.beginPath();
        ctx.moveTo(center.x + (m.zonePoints[0].x / downsample),
                   center.y + (m.zonePoints[0].y / downsample));
        for (var i = 1; i < 7; i++) {
            ctx.lineTo(center.x + (m.zonePoints[i % 6].x / downsample),
                       center.y + (m.zonePoints[i % 6].y / downsample));
        }
        ctx.closePath();
        ctx.fill();

        // Draw bounds.
        ctx.strokeStyle = "rgb(0, 0, 0)";
        ctx.lineWidth = 2;
        for (var i = 0; i < 6; i++) {
            if (player.activeBounds[i]) {
                ctx.beginPath();
                ctx.moveTo(center.x + (m.zonePoints[i].x / downsample),
                           center.y + (m.zonePoints[i].y / downsample));
                ctx.lineTo(center.x + (m.zonePoints[(i + 1) % 6].x / downsample),
                           center.y + (m.zonePoints[(i + 1) % 6].y / downsample));
                ctx.closePath();
                ctx.stroke();
            }
        }

        // Leave it there if the player is dead.
        if (player.health === 0) {
            return;
        }
    
        // Draw player node.
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(center.x, center.y, m.playerRadius / downsample,
                0, 2 * Math.PI);
        ctx.closePath();
        ctx.fill();

        // Draw shield.
        ctx.strokeStyle = "rgb(0, 0, 255)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(center.x, center.y, m.shieldRadius / downsample,
                player.shieldAngle - m.halfShieldWidth,
                player.shieldAngle + m.halfShieldWidth);
        ctx.stroke();
        ctx.closePath();
    },

    ball: function (ctx, topleft, downsample, ball) {
        ctx.fillStyle = "rgb(255, 0, 0)";
        ctx.beginPath();
        ctx.arc((ball.position.x - topleft.x) / downsample,
                (ball.position.y - topleft.y) / downsample,
                m.ballRadius / downsample,
                0,
                2 * Math.PI);
        ctx.closePath();
        ctx.fill();
    }
};
