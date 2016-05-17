"use strict";

exports = module.exports = {
    randomColor: function () {
        return "rgb(" + Math.floor(Math.random() * 180) + ", " +
                        Math.floor(Math.random() * 180) + ", " +
                        Math.floor(Math.random() * 180) + ")";
    },
    // From http://stackoverflow.com/a/6234804
    escapeHtml: function (unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    },
    // From http://stackoverflow.com/a/18197438
    performanceNow: function () {
        var hrTime = process.hrtime();
        return hrTime[0] * 1000 + hrTime[1] / 1000000;
    }
};
