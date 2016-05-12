"use strict";

exports = module.exports = interpolate

function interpolate(t, a, b, t_end) {
    return a + (b - a) * (t / t_end);
}
