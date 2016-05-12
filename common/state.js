"use strict";

var m = require("./magic");
var Player = require("./player");
var Ball = require("./ball");

exports = module.exports = State;

function State(state) {
    this.players = m.hexArray(m.maxShells);
    this.balls = [ ];
    this.playerCount = 0;

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
    }
}
