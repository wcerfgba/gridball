"use strict";

var fs = require("fs");
var m = require("../common/magic");

var filename = "hiscores.txt";
var htmlFilename = "public/hiscores.html";
var maxScores = 20;

var scores = [ ];
function scoreSort(a, b) {
    return b.score - a.score;
}

function readScores() {
    try {
        scores = JSON.parse(fs.readFileSync(filename));
    } catch (e) {
        if (e.code !== "ENOENT") { throw e; }
    }
    return scores;
}
module.exports.readScores = readScores;

function renderScores() {
    var html = '<h2 id="scores-title">High Scores</h2><ul id="score-list">';
    var itemStart = '<li><span class="score-name">';
    var itemMiddle = '</span><span class="score-score">';
    var itemEnd = '</li>'

    for (var i = 0; i < scores.length; i++) {
        html += itemStart + scores[i].name + itemMiddle +
                            scores[i].score + itemEnd;
    }

    html += '</ul>';

    fs.writeFileSync(htmlFilename, html);
}
    
function updateScores(state, tickNum) {
    readScores();

    var changed = false;

    for (var i = 0; i < state.players.length; i++) {
        for (var j = 0; j < state.players[i].length; j++) {
            var player = state.players[i][j];
            if (!player || player.health === 0) { continue; }
            var score = Math.round((tickNum - player.joinTick) / 
                                   (1000 / m.tickTime));

            var position = scores.length;
            while (position > 0) {
                if (scores[position] &&
                    scores[position].name === player.name) {
                    break;
                } else if (scores[position - 1].score <= score) {
                    position--;
                } else {
                    break;
                }
            }
            if (position < maxScores - 1) {
                if (scores[position] &&
                    scores[position].name === player.name &&
                    scores[position].score < score) {
                        scores[position].score = score;
                        scores.sort(scoreSort);
                } else {
                    scores.splice(position, 0, { name: player.name,
                                                 score: score });
                    scores.splice(maxScores);
                }
                changed = true;
            }
        }
    }

    if (changed) {
        fs.writeFileSync(filename, JSON.stringify(scores));
        renderScores();
    }

    readScores();
}
module.exports.updateScores = updateScores;

exports = module.exports;
