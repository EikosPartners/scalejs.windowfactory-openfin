define([
    './geometry',
    './eventSystem'
], function (
    geometry,
    eventSystem
) {
    "use strict";

    var Vector = geometry.Vector,
        Position = geometry.Vector,
        BoundingBox = geometry.BoundingBox,
        CollisionMesh = geometry.CollisionMesh,
        readyListeners = [],
        _isReady = false,
        currentMonitorInfo,
        deviceScaleFactor = 1,
        deviceScaleInvFactor = 1,
        currentMonitors = [],
        currentMousePosition = new Position(0, 0),
        currentMouseMonitor;

    function Monitor(monitorObj) {
		if (!(this instanceof Monitor)) return new Monitor(monitorObj);
		
        this.deviceId = monitorObj.deviceId;
        this.name = monitorObj.name;
        this.deviceScaleFactor = monitorObj.deviceScaleFactor;
        this.deviceScaleInvFactor = 1 / this.deviceScaleFactor;
        this.displayDeviceActive = monitorObj.displayDeviceActive;
        this.monitorRect = new BoundingBox(monitorObj.monitorRect);
	    this.availableRect = new BoundingBox(monitorObj.availableRect);
	}
	Monitor.prototype.getPosition = function () {
	    return new Vector(this.monitorRect); // Uses monitorRect.left and monitorRect.top
	};
	Monitor.prototype.getBounds = function () {
	    return new BoundingBox(this.monitorRect);
	};
	Monitor.prototype.getBoundingBox = Monitor.prototype.getBounds;
	Monitor.prototype.getCollisionMesh = function () {
	    return this.getBounds().getCollisionMesh();
	};
	Monitor.prototype.isContains = function (other) {
	    return this.getBoundingBox().isContains(other);
	};
	Monitor.prototype.isTouching = function (other) {
	    return this.getBoundingBox().isTouching(other);
	};
	Monitor.prototype.someTouching = function (others) {
	    return this.getBoundingBox().someTouching(others);
	};
	Monitor.prototype.isColliding = function (other) {
	    return this.getBoundingBox().isColliding(other);
	};
	Monitor.prototype.someColliding = function (others) {
	    return this.getBoundingBox().someColliding(others);
	};

	function getMonitors() {
        // Makes duplicates of each monitor instance:
	    var monitors = [];
	    for (var index = 0; index < currentMonitors.length; index += 1) {
	        monitors[index] = new Monitor(currentMonitors[index]);
	    }
	    return monitors;
	}

	function getPrimaryMonitor() {
	    return new Monitor(currentMonitors[0]);
	}

	function determineMonitor(left, top, right, bottom) {
        // Accepts:
		// determineMonitor(boundingBox);
        // determineMonitor(left, top, right, bottom);
        // determineMonitor(vector);
        // determineMonitor(left, top);
        var box;
        if (arguments.length === 2 || left instanceof Position) {
            box = new Position(left, top);
        } else {
            box = new BoundingBox(left, top, right, bottom);
        }

        for (var index = 0; index < currentMonitors.length; index += 1) {
            if (currentMonitors[index].isContains(box)) {
                return new Monitor(currentMonitors[index]);
            }
        }
	}
	
	function determinePartialMonitor(left, top, right, bottom) {
        // Accepts:
		// determinePartialMonitor(boundingBox);
        // determinePartialMonitor(left, top, right, bottom);
        // determinePartialMonitor(vector);
        // determinePartialMonitor(left, top);
        var box;
        if (arguments.length === 2 || left instanceof Position) {
            box = new Position(left, top);
        } else {
            box = new BoundingBox(left, top, right, bottom);
        }
		box = box.getBoundingBox();
		
		var monitor,
			maxArea = 0;
        for (var index = 0; index < currentMonitors.length; index += 1) {
            if (currentMonitors[index].isColliding(box)) {
				var intersection = box.getIntersection(currentMonitors[index]);
				if (intersection instanceof BoundingBox) {
					// TODO: What if one dimension is 0? And the other is not? So it collides on 1 column of pixels or something?
					var area = intersection.getArea();
					if (area >= maxArea) {
						maxArea = area;
						monitor = currentMonitors[index];
					}
				}
            }
        }
		if (monitor != null) return new Monitor(monitor);
	}

	function getDeviceScaleFactor() {
	    return deviceScaleFactor;
	}
	function getDeviceScaleInvFactor() {
	    return deviceScaleInvFactor;
	}

	function getMouseMonitor() {
	    return new Monitor(currentMouseMonitor);
	}

	function isVisible(window) {
	    return window.getCollisionMesh().someColliding(currentMonitors);
	}
	
	function isContained(window) {
		return new CollisionMesh(currentMonitors).someContains(window);
	}
    
	fin.desktop.main(function () {
	    function updateMonitors(monitorInfo) {
	        console.debug("The monitor information has changed to: ", monitorInfo);
	        currentMonitorInfo = monitorInfo;
	        deviceScaleFactor = monitorInfo.deviceScaleFactor || 1;
	        deviceScaleInvFactor = 1 / deviceScaleFactor;

	        currentMonitors = [new Monitor(monitorInfo.primaryMonitor)];
	        for (var index = 0; index < monitorInfo.nonPrimaryMonitors.length; index += 1) {
	            currentMonitors.push(new Monitor(monitorInfo.nonPrimaryMonitors[index]));
	        }

	        //currentMouseMonitor = windowFactory.determineMonitor(currentMousePosition) || getPrimaryMonitor();

	        _isReady = true;
			for (var index = 0; index < readyListeners.length; index += 1) {
				readyListeners[index]();
			}
			readyListeners = [];
	        eventSystem.triggerEvent("monitors", [currentMonitors]);
	    }

	    //app = fin.desktop.Application.getCurrent();
	    fin.desktop.System.getMonitorInfo(updateMonitors);
	    fin.desktop.System.addEventListener('monitor-info-changed', updateMonitors, undefined, function (err) {
	        console.error("Failure to listen for monitor updates: " + err);
	    });

	    // Poll mouse position:
	    function pollMouseMon() {
	        fin.desktop.System.getMousePosition(function (mousePosition) {
	            //console.log("The mouse is located at left: " + mousePosition.left + ", top: " + mousePosition.top);
	            currentMousePosition.moveTo(mousePosition);
	            currentMouseMonitor = determineMonitor(currentMousePosition.left) || getPrimaryMonitor();
	        });
	    }
	    pollMouseMon();
	    setInterval(pollMouseMon, 250);
	});
	
	function isReady() {
		return _isReady;
	}
	
	function onReady(callback) {
        // Check if already is ready:
        if (_isReady) return callback();

        // Check if eventListener is a function:
        if (callback == null || callback.constructor !== Function) throw "onReady requires argument 'callback' of type Function";
        
        // Check if eventListener is already added:
        if (readyListeners.indexOf(callback) >= 0) return;

        // Add event listener:
        readyListeners.push(callback);
    }

	return {
	    Monitor: Monitor,
	    getMonitors: getMonitors,
	    getPrimaryMonitor: getPrimaryMonitor,
	    determineMonitor: determineMonitor,
		determinePartialMonitor: determinePartialMonitor,
	    getDeviceScaleFactor: getDeviceScaleFactor,
	    getDeviceScaleInvFactor: getDeviceScaleInvFactor,
	    getMouseMonitor: getMouseMonitor,
	    isVisible: isVisible,
		isContained: isContained,
        isReady: isReady,
		onReady: onReady
	};
});
