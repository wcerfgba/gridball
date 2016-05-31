var aiAngle;

document.addEventListener("DOMContentLoaded", function () {
    // AI angle calculation.
    window.setInterval(function () {
        if (!state || !player || !cell) { return; }

        for (var i = 0; i < state.balls.length; i++) {
            var ball = state.balls[i];
            if (!ball) { continue; }

            var bCell = m.positionToCell(ball.position);
            if (bCell[0] !== cell[0] || bCell[1] !== cell[1]) { continue; }

            aiAngle = Math.atan2(ball.position.y - player.position.y,
                                 ball.position.x - player.position.x);
            break;
        }
    }, 200);

    // Always try to be in a game.
    window.setInterval(function () {
        if (dom.landing.element.style.display !== "none") {
            var nameInput = document.getElementById("name");
            nameInput.value = "" + Math.floor(Math.random() * 1000000);
            nameInput.dispatchEvent(
                new KeyboardEvent("keypress", { which: 13, keyCode: 13,
                                                keyIdentifier: "Enter" }));
        }
    }, 2000);
});

inputCallback = function () {
    if (aiAngle && tickNum % 2 === 0) {
        if (player && player.shieldAngle !== aiAngle) {
                socket.emit("Input", [ tickNum, aiAngle ]);
                player.shieldAngle = aiAngle;
        }
    }
};
