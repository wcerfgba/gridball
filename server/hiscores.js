"use strict";

var redis = require("redis");
var fs = require("fs");
var m = require("../common/magic");

var maxScores = 20;
var htmlFilename = "public/hiscores.html";

var client = redis.createClient(process.env.REDIS_URL || "");
client.on("error", function (err) {
    console.log(err);
});

function updateScores(state, tickNum) {
    var currentScores = [ ];

    for (var i = 0; i < state.players.length; i++) {
        for (var j = 0; j < state.players[i].length; j++) {
            var player = state.players[i][j];
            if (!player || player.health === 0) { continue; }
            var score = Math.round((tickNum - player.joinTick) / 
                                   (1000 / m.tickTime));
            currentScores.push(score, player.name);
        }
    }

    client.multi()
          .del("current")
          .zadd("current", currentScores)
          .zunionstore("hiscores", 2, "hiscores", "current",
                       "aggregate", "max")
          .zremrangebyrank("hiscores", 0, -maxScores)
          .exec();
    client.zrevrange("hiscores", 0, maxScores, "withscores",
                     function (err, res) {
                        if (err) {
                            console.log(err);
                        } else {
                            renderScores(res);
                        }
                     });
}
module.exports.updateScores = updateScores;

function renderScores(scores) {
    var html = '<h2 id="scores-title">High Scores</h2><ul id="score-list">';
    var itemStart = '<li><span class="score-name">';
    var itemMiddle = '</span><span class="score-score">';
    var itemEnd = '</li>'

    for (var i = 0; i < scores.length - 1; i += 2) {
        html += itemStart + scores[i] + itemMiddle + scores[i + 1] + itemEnd;
    }

    html += '</ul>';

    fs.writeFileSync(htmlFilename, html);
}

exports = module.exports;
