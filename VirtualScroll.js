(function(window) {
    'use strict';

    function VirtualScroll(options) {
        options = options || {};
        
        this.container = null;
        this.viewport = null;
        this.content = null;
        this.spacerBefore = null;
        this.spacerAfter = null;
        
        this.data = [];
        this.itemHeight = options.itemHeight || 60;
        this.bufferSize = options.bufferSize || 3;
        this.threshold = options.threshold || 50;
        
        this.startIndex = 0;
        this.endIndex = 0;
        this.renderedItems = new Map();
        this.heightCache = new Map();
        this.positionCache = new Map();
        
        this.renderItem = options.renderItem || null;
        this.estimateItemHeight = options.estimateItemHeight || null;
        this.onScroll = options.onScroll || null;
        this.onItemRendered = options.onItemRendered || null;
        
        this.isInitialized = false;
        this.rafId = null;
        this.totalHeight = 0;
        this.measureQueue = [];
        this.isMeasuring = false;
        
        if (options.container) {
            this.init(options.container);
        }
    }

    VirtualScroll.prototype.init = function(container) {
        if (this.isInitialized) return;
        
        this.container = container;
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';
        
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-scroll-viewport';
        this.viewport.style.position = 'absolute';
        this.viewport.style.top = '0';
        this.viewport.style.left = '0';
        this.viewport.style.right = '0';
        this.viewport.style.bottom = '0';
        this.viewport.style.overflow = 'auto';
        this.viewport.style.overflowX = 'hidden';
        
        this.content = document.createElement('div');
        this.content.className = 'virtual-scroll-content';
        this.content.style.position = 'absolute';
        this.content.style.top = '0';
        this.content.style.left = '0';
        this.content.style.right = '0';
        this.content.style.minHeight = '100%';
        
        this.spacerBefore = document.createElement('div');
        this.spacerBefore.className = 'virtual-scroll-spacer-before';
        this.spacerBefore.style.position = 'absolute';
        this.spacerBefore.style.left = '0';
        this.spacerBefore.style.right = '0';
        this.spacerBefore.style.height = '0';
        
        this.spacerAfter = document.createElement('div');
        this.spacerAfter.className = 'virtual-scroll-spacer-after';
        this.spacerAfter.style.position = 'absolute';
        this.spacerAfter.style.left = '0';
        this.spacerAfter.style.right = '0';
        this.spacerAfter.style.height = '0';
        
        this.container.appendChild(this.viewport);
        this.viewport.appendChild(this.content);
        this.content.appendChild(this.spacerBefore);
        this.content.appendChild(this.spacerAfter);
        
        this.setupScrollListener();
        this.isInitialized = true;
    };

    VirtualScroll.prototype.setupScrollListener = function() {
        var self = this;
        
        var scrollHandler = function() {
            if (self.rafId) {
                cancelAnimationFrame(self.rafId);
            }
            self.rafId = requestAnimationFrame(function() {
                self.updateVisibleItems();
                if (self.onScroll) {
                    self.onScroll({
                        scrollTop: self.viewport.scrollTop,
                        scrollHeight: self.viewport.scrollHeight,
                        clientHeight: self.viewport.clientHeight
                    });
                }
            });
        };
        
        this.viewport.addEventListener('scroll', scrollHandler, { passive: true });
    };

    VirtualScroll.prototype.estimateHeight = function(item, index) {
        if (this.heightCache.has(index)) {
            return this.heightCache.get(index);
        }
        
        if (this.estimateItemHeight) {
            try {
                var estimated = this.estimateItemHeight(item, index);
                if (estimated > 0) {
                    return estimated;
                }
            } catch (e) {
                console.error('VirtualScroll: estimateItemHeight error at index ' + index, e);
            }
        }
        
        return this.itemHeight;
    };

    VirtualScroll.prototype.calculatePositions = function() {
        this.positionCache.clear();
        var currentTop = 0;
        
        for (var i = 0; i < this.data.length; i++) {
            this.positionCache.set(i, currentTop);
            var height = this.estimateHeight(this.data[i], i);
            currentTop += height;
        }
        
        this.totalHeight = currentTop;
    };

    VirtualScroll.prototype.findVisibleRange = function() {
        var scrollTop = this.viewport.scrollTop;
        var viewportHeight = this.viewport.clientHeight;
        
        var startIndex = this.binarySearchStart(scrollTop);
        var endIndex = this.binarySearchEnd(scrollTop + viewportHeight);
        
        startIndex = Math.max(0, startIndex - this.bufferSize);
        endIndex = Math.min(this.data.length - 1, endIndex + this.bufferSize);
        
        return { start: startIndex, end: endIndex };
    };

    VirtualScroll.prototype.binarySearchStart = function(scrollTop) {
        var low = 0;
        var high = this.data.length - 1;
        
        while (low < high) {
            var mid = Math.floor((low + high) / 2);
            var pos = this.positionCache.get(mid) || 0;
            var height = this.estimateHeight(this.data[mid], mid);
            
            if (pos + height < scrollTop) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        
        return low;
    };

    VirtualScroll.prototype.binarySearchEnd = function(scrollBottom) {
        var low = 0;
        var high = this.data.length - 1;
        
        while (low < high) {
            var mid = Math.ceil((low + high) / 2);
            var pos = this.positionCache.get(mid) || 0;
            
            if (pos < scrollBottom) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        
        return low;
    };

    VirtualScroll.prototype.updateVisibleItems = function() {
        if (!this.isInitialized || !this.data.length || !this.viewport) return;
        
        var range = this.findVisibleRange();
        
        if (range.start === this.startIndex && range.end === this.endIndex) {
            return;
        }
        
        this.startIndex = range.start;
        this.endIndex = range.end;
        
        this.renderItems(range.start, range.end);
        this.updateSpacers();
    };

    VirtualScroll.prototype.renderItems = function(startIndex, endIndex) {
        var self = this;
        var toRemove = [];
        
        this.renderedItems.forEach(function(renderedItem, index) {
            if (index < startIndex || index > endIndex) {
                toRemove.push(index);
            }
        });
        
        toRemove.forEach(function(index) {
            self.removeItemAtIndex(index);
        });
        
        for (var i = startIndex; i <= endIndex; i++) {
            if (!this.renderedItems.has(i)) {
                this.renderItemAtIndex(i);
            }
        }
        
        this.scheduleMeasurement();
    };

    VirtualScroll.prototype.renderItemAtIndex = function(index) {
        if (this.renderedItems.has(index)) return;
        
        var dataItem = this.data[index];
        if (!dataItem) return;
        
        var itemElement;
        if (this.renderItem) {
            try {
                itemElement = this.renderItem(dataItem, index);
            } catch (e) {
                console.error('VirtualScroll: renderItem error at index ' + index, e);
                return;
            }
        }
        
        if (!itemElement) return;
        
        var top = this.positionCache.get(index) || 0;
        var estimatedHeight = this.estimateHeight(dataItem, index);
        
        itemElement.style.position = 'absolute';
        itemElement.style.left = '0';
        itemElement.style.right = '0';
        itemElement.style.top = top + 'px';
        itemElement.style.minHeight = estimatedHeight + 'px';
        itemElement.setAttribute('data-index', index);
        
        this.content.appendChild(itemElement);
        this.renderedItems.set(index, {
            element: itemElement,
            data: dataItem,
            measured: false
        });
        
        if (this.onItemRendered) {
            this.onItemRendered(itemElement, dataItem, index);
        }
    };

    VirtualScroll.prototype.removeItemAtIndex = function(index) {
        var renderedItem = this.renderedItems.get(index);
        if (renderedItem) {
            if (renderedItem.element && renderedItem.element.parentNode) {
                renderedItem.element.parentNode.removeChild(renderedItem.element);
            }
            this.renderedItems.delete(index);
        }
    };

    VirtualScroll.prototype.scheduleMeasurement = function() {
        var self = this;
        
        if (this.isMeasuring) return;
        
        this.isMeasuring = true;
        requestAnimationFrame(function() {
            self.measureRenderedItems();
            self.isMeasuring = false;
        });
    };

    VirtualScroll.prototype.measureRenderedItems = function() {
        var self = this;
        var needsRecalculation = false;
        
        this.renderedItems.forEach(function(renderedItem, index) {
            if (renderedItem.element && !renderedItem.measured) {
                var actualHeight = renderedItem.element.offsetHeight;
                var cachedHeight = self.heightCache.get(index);
                
                if (!cachedHeight || Math.abs(cachedHeight - actualHeight) > 2) {
                    self.heightCache.set(index, actualHeight);
                    needsRecalculation = true;
                }
                
                renderedItem.measured = true;
            }
        });
        
        if (needsRecalculation) {
            this.calculatePositions();
            this.updateRenderedPositions();
            this.updateTotalHeight();
            this.updateSpacers();
        }
    };

    VirtualScroll.prototype.updateRenderedPositions = function() {
        var self = this;
        
        this.renderedItems.forEach(function(renderedItem, index) {
            if (renderedItem.element) {
                var top = self.positionCache.get(index) || 0;
                renderedItem.element.style.top = top + 'px';
            }
        });
    };

    VirtualScroll.prototype.updateSpacers = function() {
        var beforeHeight = 0;
        var afterHeight = 0;
        
        if (this.startIndex > 0) {
            beforeHeight = this.positionCache.get(this.startIndex) || 0;
        }
        
        if (this.endIndex < this.data.length - 1) {
            var lastVisibleTop = this.positionCache.get(this.endIndex) || 0;
            var lastVisibleHeight = this.estimateHeight(this.data[this.endIndex], this.endIndex);
            afterHeight = this.totalHeight - (lastVisibleTop + lastVisibleHeight);
            afterHeight = Math.max(0, afterHeight);
        }
        
        this.spacerBefore.style.height = beforeHeight + 'px';
        this.spacerAfter.style.top = (this.totalHeight - afterHeight) + 'px';
        this.spacerAfter.style.height = afterHeight + 'px';
    };

    VirtualScroll.prototype.setData = function(newData) {
        this.data = Array.isArray(newData) ? newData : [];
        this.clear();
        this.calculatePositions();
        this.updateTotalHeight();
        
        if (this.data.length > 0) {
            this.updateVisibleItems();
        }
    };

    VirtualScroll.prototype.appendData = function(newItems) {
        if (!Array.isArray(newItems) || newItems.length === 0) return;
        
        var startIndex = this.data.length;
        
        for (var i = 0; i < newItems.length; i++) {
            this.data.push(newItems[i]);
        }
        
        var currentTop = 0;
        if (startIndex > 0) {
            currentTop = this.positionCache.get(startIndex - 1) || 0;
            currentTop += this.estimateHeight(this.data[startIndex - 1], startIndex - 1);
        }
        
        for (var j = startIndex; j < this.data.length; j++) {
            this.positionCache.set(j, currentTop);
            var height = this.estimateHeight(this.data[j], j);
            currentTop += height;
        }
        
        this.totalHeight = currentTop;
        this.updateTotalHeight();
        
        var lastItemIndex = this.data.length - 1;
        var viewportHeight = this.viewport.clientHeight;
        var lastItemTop = this.positionCache.get(lastItemIndex) || 0;
        var lastItemHeight = this.estimateHeight(this.data[lastItemIndex], lastItemIndex);
        
        if (lastItemTop < this.viewport.scrollTop + viewportHeight + this.bufferSize * this.itemHeight) {
            this.endIndex = lastItemIndex;
            this.renderItemAtIndex(lastItemIndex);
            this.scheduleMeasurement();
        }
        
        this.updateSpacers();
    };

    VirtualScroll.prototype.findIndexByMessageId = function(messageId) {
        for (var i = 0; i < this.data.length; i++) {
            var item = this.data[i];
            if (item && (item.id === messageId || String(item.id) === String(messageId))) {
                return i;
            }
        }
        return -1;
    };

    VirtualScroll.prototype.highlightItem = function(index, duration) {
        var self = this;
        duration = duration || 2000;
        
        var renderedItem = this.renderedItems.get(index);
        if (renderedItem && renderedItem.element) {
            var element = renderedItem.element;
            element.classList.add('virtual-scroll-highlight');
            setTimeout(function() {
                element.classList.remove('virtual-scroll-highlight');
            }, duration);
        }
    };

    VirtualScroll.prototype.updateTotalHeight = function() {
        this.content.style.height = this.totalHeight + 'px';
    };

    VirtualScroll.prototype.clear = function() {
        var self = this;
        this.renderedItems.forEach(function(renderedItem, index) {
            if (renderedItem.element && renderedItem.element.parentNode) {
                renderedItem.element.parentNode.removeChild(renderedItem.element);
            }
        });
        this.renderedItems.clear();
        this.startIndex = 0;
        this.endIndex = 0;
    };

    VirtualScroll.prototype.clearCache = function() {
        this.heightCache.clear();
        this.positionCache.clear();
    };

    VirtualScroll.prototype.refresh = function() {
        this.calculatePositions();
        this.updateTotalHeight();
        this.clear();
        this.updateVisibleItems();
    };

    VirtualScroll.prototype.scrollToIndex = function(index, options) {
        if (index < 0 || index >= this.data.length) return;
        
        this.calculatePositions();
        
        var targetScrollTop = this.positionCache.get(index) || 0;
        
        if (options && options.align === 'bottom') {
            var itemHeight = this.estimateHeight(this.data[index], index);
            targetScrollTop = targetScrollTop - this.viewport.clientHeight + itemHeight;
        }
        
        targetScrollTop = Math.max(0, Math.min(targetScrollTop, this.totalHeight - this.viewport.clientHeight));
        
        if (options && options.behavior === 'smooth') {
            this.viewport.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        } else {
            this.viewport.scrollTop = targetScrollTop;
        }
        
        var self = this;
        setTimeout(function() {
            self.updateVisibleItems();
        }, options && options.behavior === 'smooth' ? 300 : 0);
    };

    VirtualScroll.prototype.scrollToTop = function() {
        this.viewport.scrollTop = 0;
        this.updateVisibleItems();
    };

    VirtualScroll.prototype.scrollToBottom = function() {
        this.calculatePositions();
        var targetScrollTop = this.totalHeight - this.viewport.clientHeight;
        this.viewport.scrollTop = Math.max(0, targetScrollTop);
        this.updateVisibleItems();
    };

    VirtualScroll.prototype.getItemElement = function(index) {
        var renderedItem = this.renderedItems.get(index);
        return renderedItem ? renderedItem.element : null;
    };

    VirtualScroll.prototype.shouldUseVirtualScroll = function(dataLength) {
        return dataLength >= this.threshold;
    };

    VirtualScroll.prototype.getVisibleRange = function() {
        return {
            start: this.startIndex,
            end: this.endIndex
        };
    };

    VirtualScroll.prototype.destroy = function() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        this.clear();
        this.clearCache();
        
        if (this.viewport && this.viewport.parentNode) {
            this.viewport.parentNode.removeChild(this.viewport);
        }
        
        this.isInitialized = false;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = VirtualScroll;
    } else {
        window.VirtualScroll = VirtualScroll;
    }

})(typeof window !== 'undefined' ? window : global);
