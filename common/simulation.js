"use strict";

var util = require("./util");

/* This module exports a Simulation object, which is used to model the game. */
exports = module.exports = Simulation;

/* The Simulation object tracks the state of the game -- the position of the 
 * players and walls, shield positions and momenta, and the positions and 
 * momenta of balls -- and allows iteration of the state over time.
 *
 * To limit the total number of players to less than 1000 (for performance 
 * reasons) on a hexagonal grid, it is necessary to have a side length of 
 * n = 18, giving 3 * 18 * (18 - 1) + 1 = 919 players per grid. */
var maxShells = 18;
var maxPlayers = 919;

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
var playerRadius = 300;
var shieldRadius = 350;
var playerDistance = 1800;

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

/* Takes an array of indices [ row, cell ] referencing a cell in a hex array, 
 * and computes the position of the center of that cell. */
function cellToPosition(cell) {
    return { x: rowOffsets[cell[0]] + cell[1] * playerDistance,
             y: halfPlayerDistance + cell[0] * playerDistance }; 
};

/* Takes a position object with co-ordinates (x, y) as properties, and computes 
 * the indices for that position in a hex cell array. */
function positionToCell(position) {
    var row = Math.floor((position.y - halfPlayerDistance) / playerDistance);
    return [ row,
             Math.floor((position.x - rowOffsets[row]) / playerDistance) ];
}

/* It is useful to have an array of vectors describing a hexagon of cells on 
 * the grid. If a cell vector is added componentwise to each hexVector, the 
 * resulting vectors are for the neighbours of the original cell. If each 
 * hexVector is added componentwise in turn, then the sequence describes a 
 * hexagonal walk on the grid, ending on the original vector, in the top-right 
 * of the walked hexagon. */
var hexVectors = [ [  1,  1 ], [  1, 0 ], [ 0, -1 ],
                   [ -1, -1 ], [ -1, 0 ], [ 0,  1 ] ];

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

/* The Simulation maintains a 2D array of Players, indexed first by rows of the 
 * grid from top to bottom, and then by cell from left to right. The Simulation 
 * also stores an array of all Balls. The Simulation also stores a count of the 
 * current number of players. The Simulation also provides a semaphore for 
 * safety when applying migrations. */
function Simulation() {
    this.players = hexArray(maxShells);
    this.balls = [ ];
    this.playerCount = 0;
    this.migrationLock = false;
}

Simulation.prototype.setState = function (simulationState) {
    if (this.migrationLock) {
        return false;
    }
    this.migrationLock = true;

    this.players = simulationState.players;
    this.balls = simulationState.balls;
    this.playerCount = simulationState.playerCount;

    this.migrationLock = false;
    return true;
}

Simulation.prototype.tick = function () {
    // Update each ball in each cell.
    for (var i = 0; i < this.balls.length; i++) {
        var ball = this.balls[i];
        var cell = positionToCell(ball.position);
        var player = this.players[cell[0]][cell[1]][0];

        // Collision functions update the velocity of a Ball, but do not update 
        // the position.
        ball.collideWithBounds(player) ||
        ball.collideWithShield(player) ||
        ball.collideWithPlayer(player);

        // Update position from velocity.
        ball.position.x += ball.velocity.x;
        ball.position.y += ball.velocity.y;
    }
};

/* Takes an addPlayer migration and mutates the Simulation to add the new 
 * player to the game. Returns false if lock fails, true on completion. */
Simulation.prototype.addPlayer = function (migration) {
    // Attempt to lock for migration.
    if (this.migrationLock) {
        return false;
    }
    this.migrationLock = true;

    // Get neighbours based on false entries in player.activeBounds and remove 
    // their bounds.
    for (var i = 0; i < migration.player.activeBounds.length; i++) {
        if (migration.player.activeBounds[i] === false) {
            var neighbour = this.players[migration.cell[0] + hexVectors[i][0]]
                                        [migration.cell[1] + hexVectors[i][1]]
                                        [0];
            neighbour.activeBounds[(i + 3) % 6] = false;
        }
    }

    // Construct Player and insert into hex array.
    this.players[migration.cell[0]][migration.cell[1]][0] = 
        new Player(migration.player);
    this.playerCount++;

    // Construct and insert Ball if one was made.
    if (migration.hasOwnProperty("ball")) {
        this.balls.push(new Ball(migration.ball));
    }

    this.migrationLock = false;
    return true;
};

/* Takes the name of a player and constructs a migration object containing the 
 * information required to update the simulation and add the player to the 
 * game. */
Simulation.prototype.addPlayerMigration = function (name) {
    // Return error if game is full.
    if (this.playerCount === maxPlayers) {
        return { error: "Game is full." };
    }

    var playerState = { name: name };
    var cell = null;

    // If we have no players, add to center of grid. Otherwise, find the first 
    // neighboured but unoccupied cell.
    if (this.playerCount === 0) {
        cell = [ maxShells, maxShells ];
    } else {
        for (var i = 0; i < playerPositions.length - 1; i++) {
            var a = playerPositions[i];
            var b = playerPositions[i + 1];

            var cell_a = this.players[a[0]][a[1]];
            var cell_b = this.players[b[0]][b[1]];

            if (cell_a === [ ] && cell_b !== [ ]) {
                cell = a;
                break;
            } else if (cell_a !== [ ] && cell_b === [ ]) {
                cell = b;
                break;
            }
        }
    }

    if (cell === null) {
        return { error: "Could not find neighboured but unoccupied cell." };
    }

    // Find neighbouring Players and remove walls.
    var neighbours = [ ];
    for (var i = 0; i < hexVectors.length; i++) {
        var neighbourCell = [ cell[0] + hexVectors[i][0],
                              cell[1] + hexVectors[i][1] ];

        // Test each neighbour vector is valid (in-bounds), and if there is a 
        // Player there, push them into the array. Missing neighbours are 
        // represented as nulls.
        if (0 <= neighbourCell[0] &&
                 neighbourCell[0] < this.players.length &&
            0 <= neighbourCell[1] &&
                 neighbourCell[1] < this.players[neighbourCell[0]].length &&
            this.players[neighbourCell[0]][neighbourCell[1]] !== [ ]) {
                neighbours.push(true);
        } else {
            neighbours.push(false);
        }
    }

    playerState.activeBounds = neighbours;

    // Calculate position in the grid.
    var position = cellToPosition(cell);
    playerState.position = position;

    // Construct and insert Player.
    var player = new Player(playerState);

    // Add a new ball in the new Player's cell if this player is a multiple of 
    // seven (one shell plus center).

    if (this.playerCount % 7 === 0) {
        var ball = new Ball(
                        { position: 
                            { x: player.position.x + halfPlayerDistance * 1.5,
                              y: player.position.y + halfPlayerDistance * 1.5 }
                        });

        return { cell: cell, player: player, ball: ball };
    }

    return { cell: cell, player: player };
}

/* A Player has a name, color, health, and shield angle. The Player object also 
 * stores which zone boundaries -- walls at the edges of a player's zone 
 * blocking off unoccupied areas -- are active, and the position co-ordinate 
 * representing the center of this cell, which is necessary for collision 
 * computations and must be specified when creating the object. */
function Player(playerState) {
    this.name = playerState.name || "";
    this.color = playerState.color || util.randomColor();
    this.health = playerState.health || 100;
    this.shieldAngle = playerState.shieldAngle || 0;
    this.activeBounds = playerState.activeBounds || 
                        [ true, true, true, true, true, true ];
    this.position = playerState.position;
}

/* A Ball has a position and a velocity, both of which are (x, y) 
 * co-ordinates. The position is mandatory, and unless specified the velocity 
 * is random with a maximum speed (i.e. modulus) of 1. */
function Ball(ballState) {
    this.position = ballState.position;
    this.velocity = ballState.velocity ||
                    { x: Math.random() / Math.sqrt(2),
                      y: Math.random() / Math.sqrt(2) };
}

Ball.prototype.collideWithBounds = function (player) {
};

Ball.prototype.collideWithShield = function (player) {
};

Ball.prototype.collideWithPlayer = function (player) {
};
