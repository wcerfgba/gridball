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

/* Players have a shield of a defined width in radians. */
var halfShieldWidth = Math.PI / 6;
module.exports.halfShieldWidth = halfShieldWidth;

/* Various lengths affect both the gameplay and the implementation of the 
 * simulation: the radius of the ball, the radius of the player node, the 
 * radius of the player shield, and the distance between players on the grid 
 * (which in turn determines the distances to zone boundaries). For safety and 
 * efficiency, we would like to store as many values as possible as integers. 
 * If these lengths can be represented as ratios then we can scale them up 
 * appropriately to derive integer values, at a precision suitable for the 
 * simulation.
 *
 * Because the hexagonal player grid is placed over a Cartesian grid, the 
 * increments for the X- and Y-axes between cells is not equal. The grid has 
 * an edge at the top and bottom, and so the cells which tesselate into this 
 * grid are hexagons with edges at the sides. The X-increment between adjacent 
 * cells is the 'distance between players' that we have already mentioned. When 
 * moving up or down, we move half player distance along the X-axis, and move 
 * along the Y-axis by player distance * cos(pi / 6). This ratio is roughly 
 * 0.866, so providing player distance is a multiple of 500, the Y-increment 
 * will be an integer.
 *
 * Thus the ratios for consideration are:
 *     ball radius : player radius : shield radius : 
 *     half player distance : Y increment
 *
 * which we will assume are equal to 1 : 3 : 3.5 : 10 : 2 * 10 * 0.866. Scaling 
 * by 50 gives 50 : 150 : 175 : 500 : 866.
 *
 * In a fully-enclosed zone, the maximum distance between the closest point on 
 * the ball and the player is given by:
 *     half player distance - 2 * ball radius - player radius
 * which in this instance is 500 - 2 * 50 - 150 = 250. At the same time, the 
 * maximum width of the grid is given by:
 *     (2 * side length - 1) * player distance
 * which with these ratios evaluates to (2 * 18 - 1) * 1000 = 35000. The the 
 * calculated values give good resolution for the ball positions, and the 
 * largest expected values for co-ordinates fit nicely into an unsigned short.
 */
var ballRadius = 50;
var ballDiameter = 2 * ballRadius;
var playerRadius = 150;
var shieldRadius = 175;
var halfPlayerDistance = 500;
var yIncrement = 866;
var playerDistance = 2 * halfPlayerDistance;
module.exports.ballRadius = ballRadius;
module.exports.ballDiameter = ballDiameter;
module.exports.playerRadius = playerRadius;
module.exports.shieldRadius = shieldRadius;
module.exports.halfPlayerDistance = halfPlayerDistance;
module.exports.yIncrement = yIncrement;
module.exports.playerDistance = playerDistance;

/* The time taken for a ball to collide with a player from the minimum zone 
 * edge ball distance is given by:
 *     distance / (tick rate * speed)
 * where the tick rate is the number of times the simulation is updated per 
 * second. If we operate at 50 ticks per second, this gives a maximum time of 
 * 250 / (50 * 1) = 5 seconds, which is very slow. Speed 2 gives 2.5 seconds, 
 * which is a more acceptable minimum. The time difference between speed 2 and 
 * speed 3 is 0.8333 seconds, which is a 33.333% increase in speed. This is the 
 * largest increase in the speed series, and so the discretization of the speed 
 * makes an interesting gameplay mechanic: slow balls gain speed quicker than 
 * faster balls. At the other end of the scale, speed 50 gives 0.1 seconds, 
 * which can be a maximum, with an increase from speed 49 of about 2ms.
 *
 * The tick rate is also responsible for setting the snapshot rate -- how often 
 * a state delta is sent to clients --, and the maximum acceptable lag. We send 
 * a snapshot every 5 ticks, and the maximum lag window is 5 snapshots. */
var tickRate = 50;
var tickTime = 1000 / tickRate;
var snapshotRate = tickRate / 5;
var snapshotTime = 1000 / snapshotRate;
var maxSnapshots = 5;
var maxLatency = maxSnapshots * snapshotTime;
var minBallSpeed = 2;
var maxBallSpeed = 50;
module.exports.tickRate = tickRate;
module.exports.tickTime = tickTime;
module.exports.snapshotRate = snapshotRate;
module.exports.snapshotTime = snapshotTime;
module.exports.maxSnapshots = maxSnapshots;
module.exports.maxLatency = maxLatency;
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
 * evaulates to null or a Player. */
function hexArray(shells) {
    var array = [ ];

    var buildRow = function (size) {
        var row = [ ];
        for (var i = 0; i < size; i++) { row.push(null); }
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
var rowOffsets = [ ];
for (var i = maxShells; 0 < i; i--) {
    rowOffsets.push(halfPlayerDistance * (i + 1));
}
rowOffsets.push(halfPlayerDistance);
for (var i = 1; i < maxShells + 1; i++) {
    rowOffsets.push(halfPlayerDistance * (i + 1));
}
module.exports.rowOffsets = rowOffsets;

/* It is also useful to have the relative co-ordinates of the points on the 
 * zone hexagon from the center of the player. This is used in rendering and 
 * collision detection. zonePoints and hexVectors are in one-to-one 
 * correspondence and each zone point is the anticlockwise point of its 
 * vector. */
var zoneRadius = Math.floor(playerDistance / Math.sqrt(3));
var zonePoints = [ ];
for (var i = 0; i < 6; i++) {
    zonePoints.push({ x: Math.floor(zoneRadius *  Math.sin(i * Math.PI / 3)),
                      y: Math.floor(zoneRadius * -Math.cos(i * Math.PI / 3)) });
}
module.exports.zoneRadius = zoneRadius;
module.exports.zonePoints = zonePoints;


var boundNormals = [ ];
for (var i = 0; i < 6; i++) {
    boundNormals.push({ x: -Math.sin((Math.PI / 6) + (i * Math.PI / 3)),
                        y: Math.cos((Math.PI / 6) + (i * Math.PI / 3)) });
}
module.exports.boundNormals = boundNormals;



/* Takes an array of indices [ row, cell ] referencing a cell in a hex array, 
 * and computes the position of the center of that cell. */
function cellToPosition(cell) {
    return { x: rowOffsets[cell[0]] + cell[1] * playerDistance,
             y: zoneRadius + cell[0] * yIncrement }; 
};
module.exports.cellToPosition = cellToPosition;

/* Takes a position object with co-ordinates (x, y) as properties, and computes 
 * the indices for that position in a hex cell array. */
var halfZoneRadius = zoneRadius / 2;
function positionToCell(position) {
    var row = null;

    // Overlay an orthogonal grid playerDistance wide and yIncrement high.
    var maxRow = Math.floor(position.y / yIncrement);
    var centerCell = Math.floor(position.x / playerDistance);

    // Compute distance from corner.
    var left = position.x - centerCell * playerDistance;
    var top = position.y - maxRow * yIncrement;
    var offset = top * Math.sqrt(3);

    // Even row, one hexagon in most of grid cell, but upper row hexagon in top 
    // left and right.
    if (maxRow % 2 === 0) {
        // Test row.
        if (top < halfZoneRadius &&
            (left < halfPlayerDistance - offset) ||
            (halfPlayerDistance + offset < left)) {
                row = maxRow - 1;
        } else {
            row = maxRow;
        }
    // Odd row, two hexagons either side with upper row hexagon at top.
    } else {
        // Test row.
        if (top < halfZoneRadius &&
            offset < left && left < playerDistance - offset) {
                row = maxRow - 1;
        } else {
            row = maxRow;
        }
    }
    return [ row,
             Math.floor((position.x - rowOffsets[row] + halfPlayerDistance) /
                        playerDistance) ];
}
module.exports.positionToCell = positionToCell;

/* The positions of neighbouring cells in the hex array is dependent on where 
 * the current cell is located: in the top half, moving up one row also moves 
 * to the right, as there are fewer cells in the preceding row; this 
 * relationship is symmetrical about the middle row. */
function neighbourCell(cell, direction) {
    if (cell[0] < maxShells) {
        switch (direction % 6) {
        case 0: return [ cell[0] - 1, cell[1]     ];
        case 1: return [ cell[0]    , cell[1] + 1 ];
        case 2: return [ cell[0] + 1, cell[1] + 1 ];
        case 3: return [ cell[0] + 1, cell[1]     ];
        case 4: return [ cell[0]    , cell[1] - 1 ];
        case 5: return [ cell[0] - 1, cell[1] - 1 ];
        }
    } else if (cell[0] === maxShells) {
        switch (direction % 6) {
        case 0: return [ cell[0] - 1, cell[1]     ];
        case 1: return [ cell[0]    , cell[1] + 1 ];
        case 2: return [ cell[0] + 1, cell[1]     ];
        case 3: return [ cell[0] + 1, cell[1] - 1 ];
        case 4: return [ cell[0]    , cell[1] - 1 ];
        case 5: return [ cell[0] - 1, cell[1] - 1 ];
        }
    } else {
        switch (direction % 6) {
        case 0: return [ cell[0] - 1, cell[1] + 1 ];
        case 1: return [ cell[0]    , cell[1] + 1 ];
        case 2: return [ cell[0] + 1, cell[1]     ];
        case 3: return [ cell[0] + 1, cell[1] - 1 ];
        case 4: return [ cell[0]    , cell[1] - 1 ];
        case 5: return [ cell[0] - 1, cell[1]     ];
        }
    }
}
function neighbourCells(cell) {
    var neighbours = [ ];
    for (var i = 0; i < 6; i++) {
        neighbours.push(neighbourCell(cell, i));
    }
    return neighbours;
}
module.exports.neighbourCell = neighbourCell;
module.exports.neighbourCells = neighbourCells;

/* playerPositions holds an array of grid vectors that map each successive 
 * player to their indices in a hexArray of size maxShells. It uses the 
 * hexVectors to build each shell of cells. This array is used to determine the 
 * cell players are alloated in the grid when they join.*/
// Start with the first player in the middle.
var playerPositions = [ [ maxShells, maxShells ] ];

for (var i = 1; i < maxShells + 1; i++) {
    // Move one step bottom-left out of the last cell of the last shell to 
    // enter the new shell.
    var prev = neighbourCell(playerPositions[playerPositions.length - 1], 4);

    // Repeatedly add each vector from the hexagon path according to the 
    // shell number to build the next shell.
    for (var j = 0; j < 6; j++) {
        for (var k = 0; k < i; k++) {
            var cell = neighbourCell(prev, j);
            playerPositions.push(cell);
            prev = [ cell[0], cell[1] ];
        }
    }
}
module.exports.playerPositions = playerPositions;

exports = module.exports;
