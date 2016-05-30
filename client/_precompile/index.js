var mouseEvent;
var mouseTime = 0;

document.addEventListener("DOMContentLoaded", function () {
    dom.canvas.element.addEventListener("mousemove", function (event) {
        event.preventDefault();
        var now = performance.now();
        if (now > mouseTime + 10) {
            mouseEvent = event;
            mouseTime = now;
        }
    });
});

inputCallback = function () {    
    if (mouseEvent && tickNum % 2 === 0) {
        var mouseAngle =
                Math.atan2(mouseEvent.clientY - 
                                (dom.canvas.element.height / 2),
                           mouseEvent.clientX -
                                (dom.canvas.element.width / 2));
        if (player && player.shieldAngle !== mouseAngle) {
                socket.emit("Input", [ tickNum, mouseAngle ]);
                player.shieldAngle = mouseAngle;
        }
    }
};
