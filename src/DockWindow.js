define([
    './geometry',
    './monitorManager',
    './BaseWindow'
], function (
    geometry,
    monitorManager,
    BaseWindow
) {
    "use strict";
    // TODO: Dock windows based on EDGES they stick to, rather than just docking them.
    //       This is useful to solve issues like resize moving.

    var Vector = geometry.Vector,
        Position = geometry.Vector,
        CollisionMesh = geometry.CollisionMesh;

    function DockWindow(config) {
		if (!(this instanceof DockWindow)) return new DockWindow(config);

        BaseWindow.apply(this, arguments);
        this._dockedGroup = [this];
		this._isDocked = false;
        //this.isDocked = observable(false);

        this.addEventListener("_bringToFront", function () {
            //If the windows are dockedGrouped bring them to the front in unison - dockedGroup includes curWnd already
            for (var index = 0; index < this._dockedGroup.length; index += 1) {
                if (this !== this._dockedGroup[index]) this._dockedGroup[index].bringToFront();
            }
        });

        this.addEventListener("_bringChildrenToFront", function () {
            //If the child windows are dockedGrouped bring them to the front in unison - dockedGroup includes curWnd already
            for (var i = 0; i < this._dockedGroup.length; i += 1) {
                var window = this._dockedGroup[i];
                if (this !== window) {
                    for (var j = 0; j < window._children.length; j += 1) {
                        if (window._children[j]._alwaysAboveParent && !window._children[j].isVisible()) {
                            window._children[j].bringToFront();
                            window._children[j].focus();
                        }
                    }
                }
            }
        });

        this.addEventListener("hidden", this.undock);
        //this.addEventListener("minimized", this.undock);
        this.addEventListener("maximized", this.undock);
        this.addEventListener("restored", function () {
			for (var index = 0; index < this._dockedGroup.length; index += 1) {
				if (this._dockedGroup[index] !== this) this._dockedGroup[index].toBase().restore();
			}
		});
        this.addEventListener("closed", this.undock);
        //this.addEventListener("resized", this.undock);
        this.addEventListener("childremove", function (window) {
            if (window._addToParentMesh) {
                this.undock();
                //this.triggerEvent("resized", this.getBounds(true));
            }
        })

        // Dock when snapped:
        this.addEventListener("_endSnap", this.dock);
    }
    DockWindow.prototype = Object.create(BaseWindow.prototype);
    DockWindow.prototype.constructor = DockWindow;

    DockWindow.prototype.toBase = function () {
        //var obj = JSON.parse(JSON.stringify(this));
        var obj = {};
        for (var prop in this) {
            if (this.hasOwnProperty(prop)) obj[prop] = this[prop];
        }
        obj.__proto__ = BaseWindow.prototype;
        return obj;
    };

    DockWindow.prototype.dock = function (other) {
        if (!(other instanceof DockWindow)) throw "dock requires argument 'other' to be of type DockWindow";
        if (this._dockedGroup.indexOf(other) >= 0) return; // Don't have to do anything if already docked!

        var otherGroup = other._dockedGroup;

		// Verify it is touching one window:
		if (!other.getCollisionMesh().isTouching(this.getCollisionMesh())) return; // Don't dock if none are touching

        for (var index = 0; index < otherGroup.length; index += 1) {
            if (this._dockedGroup.indexOf(otherGroup[index]) < 0) {
                this._dockedGroup.push(otherGroup[index]);
                otherGroup[index]._dockedGroup = this._dockedGroup;
            }
        }

        for (var index = 0; index < this._dockedGroup.length; index += 1) {
            //this._dockedGroup[index].isDocked(true);
			this._dockedGroup[index]._isDocked = true;
            this._dockedGroup[index].triggerEvent("dock");
        }
    };

    DockWindow.prototype.undock = function () {
        if (this._dockedGroup.length === 1) return; // Bail early if not docked to anything

        // Store old group:
        var oldGroup = this._dockedGroup;

        // Undock all:
        for (var i = 0; i < oldGroup.length; i += 1) {
            oldGroup[i]._dockedGroup = [oldGroup[i]];
            //oldGroup[i].isDocked(false);
			oldGroup[i]._isDocked = false;
            oldGroup[i].triggerEvent("undock");
        }

        // Remove this window from oldGroup:
        var index = oldGroup.indexOf(this);
        if (index >= 0) oldGroup.splice(index, 1);

        // Check if other docked windows can be grouped together:
        for (var i = 0; i < oldGroup.length; i += 1) {
            var window = oldGroup[i];
            for (var j = 0; j < oldGroup.length; j += 1) {
                // Check if window touches edge of another window:
                if (oldGroup[j] !== window && window.getCollisionMesh().isTouching(oldGroup[j])) window.dock(oldGroup[j]);
            }
        }
    };

    DockWindow.prototype.getCollisionMeshWindows = function (opts) {
        if (!this.isReady()) throw "getCollisionMesh can't be called on an unready window";
        // Does not use super, to avoid changing the proto of this in windows array.
        opts = opts || {};
        var windows = [this];
        if (!opts.ignoreChildren) {
            for (var index = 0; index < this._children.length; index += 1) {
                if (this._children[index]._addToParentMesh) windows = windows.concat(this._children[index].getCollisionMeshWindows(opts));//windows.push(this._children[index]);
            }
        }
        if (!opts.ignoreDockedGroup) {
            var nopts = {};
            for (var field in opts) { nopts[field] = opts[field]; }
            nopts.ignoreDockedGroup = true;
            for (var index = 0; index < this._dockedGroup.length; index += 1) {
                // Ignore this window, as it was already added by the super:
                if (this._dockedGroup[index] !== this) windows = windows.concat(this._dockedGroup[index].getCollisionMeshWindows(nopts));//windows.push(this._dockedGroup[index]);
            }
        }
        return windows;
    };

    DockWindow.prototype.getCollisionMesh = function (opts) {
        if (!this.isReady()) throw "getCollisionMesh can't be called on an unready window";
        // Call super on each docked window:
        var boxes = [this.getBounds()];
        opts = opts || {};
        if (!opts.ignoreChildren) {
            for (var index = 0; index < this._children.length; index += 1) {
                if (this._children[index]._addToParentMesh) {
                    boxes = boxes.concat(this._children[index].getCollisionMesh(opts).boxes)
                }
            }
        }
        if (!opts.ignoreDockedGroup) {
            for (var index = 0; index < this._dockedGroup.length; index += 1) {
                if (this._dockedGroup[index] !== this) boxes = boxes.concat(this._dockedGroup[index].toBase().getCollisionMesh(opts).boxes);//BaseWindow.prototype.getCollisionMesh.call(this).boxes);
            }
        }
        return new CollisionMesh(boxes);
    };

    DockWindow.prototype.getBoundingBox = function () {
        if (!this.isReady()) throw "getBoundingBox can't be called on an unready window";
        return this.getCollisionMesh().getBoundingBox();
    };

    DockWindow.prototype.moveTo = function (left, top, callback, errorCallback) {
        var newPosition = new Vector(left, top);

        // Check if new position keeps at least one part of all windows in group on atleast one monitor:
        if (this.getCollisionMesh().moveTo(newPosition).someColliding(monitorManager.getMonitors())) {
            // Move children and docked group:
            var deltaPos = (new Position(left, top)).subtract(this.getPosition());
            for (var index = 0; index < this._children.length; index += 1) {
                if (this._children[index]._addToParentMesh) this._children[index].moveTo(deltaPos.clone().add(this._children[index].getPosition()));
            }
            for (var index = 0; index < this._dockedGroup.length; index += 1) {
                // Docked group contains this window as well.
                if (this._dockedGroup[index] != this) this._dockedGroup[index].toBase().moveTo(deltaPos.clone().add(this._dockedGroup[index].getPosition()));
            }
            var newPos = deltaPos.clone().add(this.getPosition());
            this.toBase().moveTo(newPos.left, newPos.top, callback, errorCallback);
        }
    };

	DockWindow.prototype.minimize = function () {
        for (var index = 0; index < this._dockedGroup.length; index += 1) {
			var window = this._dockedGroup[index].toBase();
            window.minimize.apply(window, arguments);
        }
    };

	DockWindow.prototype.restore = function () {
        for (var index = 0; index < this._dockedGroup.length; index += 1) {
			var window = this._dockedGroup[index].toBase();
            window.restore.apply(window, arguments);
        }
    };

	DockWindow.prototype.isDocked = function () {
		return this._isDocked;
	};

    return DockWindow;
});
