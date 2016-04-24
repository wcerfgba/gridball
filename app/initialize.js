"use strict";

var elements = require("elements");
var game = require("game");

document.addEventListener('DOMContentLoaded', function() {
    elements.name.onReturn(function (e) {
        game.start();
    });
});
