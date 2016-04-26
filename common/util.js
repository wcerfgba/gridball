"use strict";

exports = module.exports = {
    randomColor: function () {
        return "rgb(" + Math.floor(Math.random() * 128) + ", " +
                        Math.floor(Math.random() * 128) + ", " +
                        Math.floor(Math.random() * 128) + ")";
    }
};
