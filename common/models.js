"use strict";

var geometry = require("./geometry");

exports = module.exports = Game;

function Game(gameState) {
    this.players = gameState.players;
    this.balls = gameState.balls;
}

function Player(playerState) {
    this.name = playerState.name;
    this.color = playerState.color;
    this.health = playerState.health;
    this.shieldAngle = playerState.shieldAngle;
    this.position = playerState.position;
}

function Ball(ballState) {
    this.position = ballState.position;
    this.velocity = ballState.velocity;
}

Game.prototype.addPlayer = function (name) {
    var player = new Player({
        name: name,
        color: "rgb(" + Math.floor(Math.random() * 128) + ", " +
                        Math.floor(Math.random() * 128) + ", " +
                        Math.floor(Math.random() * 128) + ")",
        health: 100,
        shieldAngle: 0,
        position: geometry.hexGridPosition(this.players.length)
    });
};
