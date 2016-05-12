"use strict";

exports = module.exports = {
    joinGame: joinGame,
    canvas: new Element("canvas", [ fillInner ])
};

/* The Element constructor takes an ID of an element and and array of mixin 
 * functions. Each element is only retrieved from the DOM when it is first 
 * accessed. */
function Element(id, mixins) {
    Object.defineProperty(this, "element", {
        get: function () {
            delete this.element;
            return this.element = document.getElementById(id);
        },
        configurable: true
    });
   
    for (var i = 0; i < mixins.length; i++) { 
        mixins[i](this);
    }
}

function joinGame(callback) {
    var landingDiv = document.getElementById("landing");
    var nameInput = document.getElementById("name");

    nameInput.addEventListener("keypress", function (event) {
        if (event.which === 13 || event.keyCode === 13) {
            landingDiv.style.display = "none";
            callback({ name: nameInput.value });
        }
    });
}

/* The show mixin requires the value for the display CSS property. As such, it 
 * is actually a function which returns a mixin. */
function show(display) {
    return function (element) {
        Object.defineProperty(element, "show", {
            value: function () {
                this.element.style.display = display;
            }
        });
    };
}

/* The fillInner mixin sets the elements width and height to the inner width 
 * and height of the client. */
function fillInner(element) {
    Object.defineProperty(element, "fillInner", {
        value: function () {
            this.element.width = window.innerWidth;
            this.element.height = window.innerHeight;
        }
    });
}
