"use strict";

var elements = require("elements");

exports = module.exports = {
    start: function () {
        elements.landing.hide();
        elements.canvas.fillInner();

        console.log(elements.name.value());
    }
}
