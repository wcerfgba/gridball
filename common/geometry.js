"use strict";

/* The geometry of a hexagonal grid is based on movement along lines separated 
 * by 60 degrees. Any vector on the grid can be factored by these increments 
 * along the X and Y axes. */
var x_incr = 0.5;
var y_incr = Math.sin(Math.PI / 3);

/* A hexagon of six grid cells arranged around a seventh inner cell can be 
 * walked by the following array of vectors. The starting cell will be the 
 * top-right cell of the hexagon. */
var hexagon = [ { x:  1, y:  1 }, { x: -1, y:  1 }, { x: -2, y: 0 },
                { x: -1, y: -1 }, { x:  1, y: -1 }, { x:  2, y: 0 } ];

/* A hexagonal grid can be produced iteratively by first adding a single cell, 
 * then adding a shell of six cells, then adding a shell of twelve cells, and 
 * so on. The side of each successive shell increases by one each time we move 
 * outwards from the center. */
function hexGrid(shells) {
    // Start with a single cell in the center.
    var grid = [ { x: 0, y: 0 } ];

    for (var i = 1; i < shells + 1; i++) {
        // Move one step top-right out of the last cell of the last shell to 
        // enter the new shell.
        var prev = { x: grid[grid.length - 1].x + 1,
                     y: grid[grid.length - 1].y - 1 };

        // Repeatedly add each vector from the hexagon path according to the 
        // shell number to build the next shell.
        for (var j = 0; j < hexagon.length; j++) {
            for (var k = 0; k < i; k++) {
                var cell = { x: prev.x + hexagon[j].x,
                             y: prev.y + hexagon[j].y };
                grid.push(cell);
                prev = { x: cell.x, y: cell.y };
            }
        }
    }

    return grid;
}

exports = module.exports = {
    hexGrid: hexGrid,
    x_incr: x_incr,
    y_incr: y_incr
};
