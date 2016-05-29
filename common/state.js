"use strict";

var m = require("./magic");
var Player = require("./player");
var Ball = require("./ball");

exports = module.exports = State;

function State(state) {
    this.players = m.hexArray(m.maxShells);
    this.balls = [ ];
    this.playerCount = 0;
    this.ballCount = 0;

    if (state) {
        for (var i = 0; i < this.players.length; i++) {
            for (var j = 0; j < this.players[i].length; j++) {
                if (state.players[i][j]) {
                    this.players[i][j] = new Player(state.players[i][j]);
                }
            }
        }
        for (var i = 0; i < state.balls.length; i++) {
            if (state.balls[i]) {
                this.balls[i] = new Ball(state.balls[i]);
            }
        }
        this.playerCount = state.playerCount;
        this.ballCount = state.ballCount;
    }
}

State.prototype.addPlayer = function (cell, player) {
    this.players[cell[0]][cell[1]] = player;
    this.playerCount++;

    // Get neighbours based on false entries in player.activeBounds and 
    // remove their bounds.
    for (var j = 0; j < 6; j++) {
        if (!this.players[cell[0]][cell[1]].activeBounds[j]) {
            var neighbourCell = m.neighbourCell(cell, j);
            var neighbour =
                this.players[neighbourCell[0]][neighbourCell[1]];
            if (neighbour) {
                neighbour.activeBounds[(j + 3) % 6] = false;
            }
        }
    }
};
