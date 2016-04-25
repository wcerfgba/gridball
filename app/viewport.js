"use strict";

/* This module exports a mixin for Elements (see elements.js) which adds 
 * a Viewport object to the element. */
exports = module.exports = addViewportMixin;

/* This function will attach a new Viewport to the given element. The outer 
 * element is passed to the Viewport constructor, so that the inner DOM element 
 * can be accessed later. */ 
function addViewportMixin(element) {
    Object.defineProperty(element, "viewport", {
        value: new Viewport(element)
    });
}

/* A Viewport tracks a point on an element, which can be moved, to facilitate 
 * displaying a scrollable portion of some larger underlying content. Viewports 
 * also encapsulate adding and removing mouse listeners so that users can drag 
 * on the element to scroll it. */
function Viewport(element) {
    this.element = element;
    this.corner = { x: 0, y: 0 };
    this.listeners = { down: null, move: null, up: null };
    this.flag = false;
}

Viewport.prototype.scroll = function (vector) {
    this.corner.x += vector.x;
    this.corner.y += vector.y;
};

Viewport.prototype.bindMouseListeners = function () {
    this.listeners.down = viewportMouseDown(this.flag);
    this.listeners.move = viewportMouseMove(this.flag);
    this.listeners.up = viewportMouseUp(this.flag);

    this.element.element.addEventListener("mousedown", this.listeners.down);
    this.element.element.addEventListener("mousemove", this.listeners.move);
    this.element.element.addEventListener("mouseup", this.listeners.up);
};

Viewport.prototype.unbindMouseListeners = function () {
    this.element.element.removeEventListener("mousedown", this.listeners.down);
    this.element.element.removeEventListener("mousemove", this.listeners.move);
    this.element.element.removeEventListener("mouseup", this.listeners.up);

    this.listeners.down = null;
    this.listeners.move = null;
    this.listeners.up = null;
}

// TODO: Listeners
function viewportMouseDown(flag) {
    return function (event) {
    };
}

function viewportMouseMove(flag) {
    return function (event) {
    };
}

function viewportMouseUp(flag) {
    return function (event) {
    };
}
