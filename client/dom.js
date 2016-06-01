"use strict";

exports = module.exports = {
    landing: new Element("landing", [ joinGame, show("block") ]),
    canvas:  new Element("canvas", [ fillInner ]),
    loading: new Element("loading", [ hide ]),
    scores:  new Element("scores-container", [ registerScoresUpdateInterval ])
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

function joinGame(element) {
    Object.defineProperty(element, "joinGame", {
        value: function (callback) {
            var landingDiv = this.element;
            var nameInput = document.getElementById("name");
            var loadingImg = document.getElementById("loading");

            nameInput.addEventListener("keypress", function (event) {
                if (event.which === 13 || event.keyCode === 13 ||
                    event.keyIdentifier === "Enter") {
                    landingDiv.style.display = "none";
                    loadingImg.style.display = "block";
                    callback({ name: nameInput.value });
                }
            });
        }
    });
}

function registerScoresUpdateInterval(element) {
    Object.defineProperty(element, "registerScoresUpdateInterval", {
        value: function () {
            var container = this.element;
            var intervalFunc = function () {
                var req = new XMLHttpRequest();
                req.onreadystatechange = function () {
                    if (req.readyState === XMLHttpRequest.DONE &&
                        req.status === 200) {
                            container.innerHTML = req.responseText;
                    }
                };
                req.open("GET", "hiscores.html");
                req.send();
            };
            intervalFunc();
            window.setInterval(intervalFunc, 5000);
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

function hide(element) {
    Object.defineProperty(element, "hide", {
        value: function () {
            this.element.style.display = "none";
        }
    });
}

/* The fillInner mixin sets the elements width and height to the inner width 
 * and height of the client. */
function fillInner(element) {
    Object.defineProperty(element, "fillInner", {
        value: function () {
            if (this.element.width !== window.innerWidth ||
                this.element.height !== window.innerHeight) {
                    this.element.width = window.innerWidth;
                    this.element.height = window.innerHeight;
            }
        }
    });
}
