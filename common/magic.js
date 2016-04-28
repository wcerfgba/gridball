"use strict";

/* This module contains various constants and functions important for both 
 * simulation and rendering. */

/* To limit the total number of players to less than 1000 (for performance 
 * reasons) on a hexagonal grid, it is necessary to have a side length of 
 * n = 18, giving 3 * 18 * (18 - 1) + 1 = 919 players per grid. */
var maxShells = 18;
var maxPlayers = 919;
module.exports.maxShells = maxShells;
module.exports.maxPlayers = maxPlayers;

/* Various lengths affect both the gameplay and the implementation of the 
 * simulation: the radius of the ball, the radius of the player node, the 
 * radius of the player shield, and the distance between players on the grid 
 * (which in turn determines the distances to zone boundaries). We will assume 
 * that the ratios:
 *     ball radius : player radius : shield radius : player distance
 * are equal to 1 : 3 : 3.5 : 18. In a fully-enclosed zone, the maximum distance
 * between the closest point on the ball and the player is given by:
 *     0.5 * player distance - 2 * ball radius - player radius
 * which in this instance is 0.5 * 18 - 2 * 1 - 3 = 4. For performance reasons 
 * we would like to work only in integer co-ordinates, and a granularity of only 
 * four to five distances when the ball is approaching the player is clearly 
 * insufficient. At the same time, the maximum width of the grid is given by:
 *     (2 * side length - 1) * player distance
 * which with these ratios evaluates to (2 * 18 - 1) * 18 = 630. If we choose a 
 * multiplier of 100, then we get a total width of 63000, which still fits into 
 * an unsigned short, and a minimum zone edge ball distance of 400. */
var ballRadius = 100;
var ballDiameter = 2 * ballRadius;
var playerRadius = 300;
var shieldRadius = 350;
var halfShieldWidth = Math.PI / 6;
var playerDistance = 1800;
module.exports.ballRadius = ballRadius;
module.exports.ballDiameter = ballDiameter;
module.exports.playerRadius = playerRadius;
module.exports.shieldRadius = shieldRadius;
module.exports.halfShieldWidth = halfShieldWidth;
module.exports.playerDistance = playerDistance;

/* The time taken for a ball to collide with a player from the minimum zone 
 * edge ball distance is given by:
 *     distance / (tick rate * speed)
 * where the tick rate is the number of times the simulation is updated per 
 * second. If we operate at 20 ticks per second, this gives a maximum time of 
 * 400 / (20 * 1) = 20 seconds, which is very slow. Speed 8 gives 2.5 seconds, 
 * which is a more acceptable minimum. The time difference between speed 8 and 
 * speed 9 is 0.27 seconds, which is a 10.8% increase in speed. This is the 
 * largest increase in the speed series, and so the discretization of the speed 
 * makes an interesting gameplay mechanic: slow balls gain speed quicker than 
 * faster balls. At the other end of the scale, speed 200 gives 0.1 seconds, 
 * which can be a maximum, with an increase from speed 199 of about half a 
 * millisecond.
 *  */
var tickRate = 20;
var minBallSpeed = 8;
var maxBallSpeed = 200;
module.exports.tickRate = tickRate;
module.exports.minBallSpeed = minBallSpeed;
module.exports.maxBallSpeed = maxBallSpeed;

/* Two vector spaces are used for the implementation of the Simulation. 
 * Fundamentally, the simulation takes place on the 2D plane with orthogonal 
 * (x, y) co-ordinates. The position and velocity of Balls is represented in 
 * this space. Players, on the other hand, are positioned on a hexagonal grid 
 * in this space, and thus form a higher-level grid space. Co-ordinates in grid 
 * space can be converted to co-ordinates in Cartesian space for positioning in 
 * the simulation, but vectors in grid space lend themselves to array indices 
 * for the efficient storage of the grid in memory. 
 *
 * The hexArray functions constructs an array that represents a hex grid. The 
 * first index is the row of the hexagon, and evaluates to an array of cells in 
 * that row. The first row has (shells + 1) cells, the next (shells + 2), the 
 * next (shells + 3), until the (shells + 1)th row, which has (2 * shells + 1) 
 * cells, after which point the cell numbers count back down. Each cell 
 * evaulates to an empty array, into which the Player at that cell can be 
 * inserted. */
function hexArray(shells) {
    var array = [ ];

    var buildRow = function (size) {
        var row = [ ];
        for (var i = 0; i < size; i++) { row.push([ ]); }
        return row;
    };

    for (var i = 1; i < shells + 1; i++) { array.push(buildRow(shells + i)); }
    array.push(buildRow(2 * shells + 1));
    for (var i = shells; 0 < i; i--) { array.push(buildRow(shells + i)); }

    return array;
}
module.exports.hexArray = hexArray;
 
/* Because the hexagon slopes at the sides, each row has a different distance 
 * from the edge of the Y axis in the plane to the center of the first cell in 
 * that row. The middle row has an offset of playerDistance / 2, and each row 
 * out from the center adds on an extra playerDistance / 2 each time. We 
 * precompute these values here for efficiency. */
var halfPlayerDistance = playerDistance / 2;
var rowOffsets = [ ];

for (var i = maxShells; 0 < i; i--) {
    rowOffsets.push(halfPlayerDistance * (i + 1));
}
rowOffsets.push(halfPlayerDistance);
for (var i = 1; i < maxShells + 1; i++) {
    rowOffsets.push(halfPlayerDistance * (i + 1));
}
module.exports.halfPlayerDistance = halfPlayerDistance;
module.exports.rowOffsets = rowOffsets;

/* Takes an array of indices [ row, cell ] referencing a cell in a hex array, 
 * and computes the position of the center of that cell. */
function cellToPosition(cell) {
    return { x: rowOffsets[cell[0]] + cell[1] * playerDistance,
             y: halfPlayerDistance + cell[0] * playerDistance }; 
};
module.exports.cellToPosition = cellToPosition;

/* Takes a position object with co-ordinates (x, y) as properties, and computes 
 * the indices for that position in a hex cell array. */
function positionToCell(position) {
    var row = Math.floor(position.y / playerDistance);
    return [ row,
             Math.floor((position.x - rowOffsets[row] + halfPlayerDistance) / 
                playerDistance) ];
}
module.exports.positionToCell = positionToCell;

/* It is useful to have an array of vectors describing a hexagon of cells on 
 * the grid. If a cell vector is added componentwise to each hexVector, the 
 * resulting vectors are for the neighbours of the original cell. If each 
 * hexVector is added componentwise in turn, then the sequence describes a 
 * hexagonal walk on the grid, ending on the original vector, in the top-right 
 * of the walked hexagon. */
var hexVectors = [ [  1,  1 ], [  1, 0 ], [ 0, -1 ],
                   [ -1, -1 ], [ -1, 0 ], [ 0,  1 ] ];
module.exports.hexVectors = hexVectors;

/* It is also useful to have the relative co-ordinates of the points on the 
 * zone hexagon from the center of the player. This is used in rendering and 
 * collision detection. zonePoints and hexVectors are in one-to-one 
 * correspondence and each zone point is the anticlockwise point of its 
 * vector. */
var zoneRadius = playerDistance / Math.sqrt(3);
var zonePoints = [ ];
for (var i = 0; i < 6; i++) {
    zonePoints.push({ x: zoneRadius * Math.cos((2 * i + 1) * Math.PI / 6),
                      y: zoneRadius * Math.sin((2 * i + 1) * Math.PI / 6) });
}
module.exports.zoneRadius = zoneRadius;
module.exports.zonePoints = zonePoints;

/* playerPositions holds an array of grid vectors that map each successive 
 * player to their indices in a hexArray of size maxShells. It uses the 
 * hexVectors to build each shell of cells. This array is used to determine the 
 * cell players are alloated in the grid when they join.*/
// Start with the first player in the middle.
var playerPositions = [ [ maxShells, maxShells ] ];

for (var i = 1; i < maxShells + 1; i++) {
    // Move one step top-right out of the last cell of the last shell to 
    // enter the new shell.
    var prev = [ playerPositions[playerPositions.length - 1][0] - 1,
                 playerPositions[playerPositions.length - 1][1] ];

    // Repeatedly add each vector from the hexagon path according to the 
    // shell number to build the next shell.
    for (var j = 0; j < hexVectors.length; j++) {
        for (var k = 0; k < i; k++) {
            var cell = [ prev[0] + hexVectors[j][0],
                         prev[1] + hexVectors[j][1] ];
            playerPositions.push(cell);
            prev = [ cell[0], cell[1] ];
        }
    }
}
module.exports.playerPositions = playerPositions;

exports = module.exports;
