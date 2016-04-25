"use strict";

var viewport = require("viewport");

/* The module exports instances of Element objects. */
exports = module.exports = {
    landing: new Element("landing", [ show("block"), hide ]),
    name: new Element("name", [ onReturn, value ]),
    canvas: new Element("canvas", [ fillInner, viewport ])
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

/* Mixins are called with the Element instance when it is created, and can thus 
 * be used to attach arbitrary functionality to an Element. */

/* The onReturn mixin allows a developer to define an event handler to be 
 * called when the element recieves a enter/return keypress event. */
function onReturn(element) {
    // Define the appropriate property on the element.
    Object.defineProperty(element, "onReturn", {
        // The property is a function which takes the developer's event handler.
        value: function (listener) {
            // Add an event listener to the keypress event which calls the 
            // developer's listener only on a return/enter keypress.
            this.element.addEventListener("keypress", function (event) {
                if (event.which == 13 || event.keyCode == 13) {
                    listener(event);
                }
            });
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

/* The hide mixin sets the elements display CSS property to none. */
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
            this.element.width = window.innerWidth;
            this.element.height = window.innerHeight;
        }
    });
}

/* The value mixin retrieves the value property of the element. */
function value(element) {
    Object.defineProperty(element, "value", {
        value: function () {
            return this.element.value;
        }
    });
}
