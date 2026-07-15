(function(window) {
    'use strict';

    class EventBus {
        constructor() {
            this.listeners = new Map();
            this.nativeListeners = [];
            this.isInitialized = false;
            this.currentViewportHeight = 0;
            this.currentInnerHeight = 0;
            this.currentOffsetTop = 0;
            this.isInputFocused = false;
            this.lastSyncTime = 0;
            this.throttleInterval = 100;
        }

        init() {
            if (this.isInitialized) return;
            this.isInitialized = true;

            this.currentViewportHeight = window.innerHeight || 0;
            this.currentInnerHeight = window.innerHeight || 0;
            this.currentOffsetTop = window.visualViewport ? (window.visualViewport.offsetTop || 0) : 0;

            this.setupNativeListeners();
            console.log('[EventBus] 初始化完成');
        }

        setupNativeListeners() {
            const resizeHandler = () => {
                const eventData = {
                    viewportHeight: window.innerHeight || 0,
                    visualViewportHeight: window.visualViewport ? window.visualViewport.height : null,
                    visualViewportWidth: window.visualViewport ? window.visualViewport.width : null,
                    scale: window.visualViewport ? window.visualViewport.scale : 1,
                    offsetTop: window.visualViewport ? window.visualViewport.offsetTop || 0 : 0,
                    innerHeight: window.innerHeight || 0,
                    innerWidth: window.innerWidth || 0,
                    timestamp: Date.now()
                };

                this.currentViewportHeight = eventData.viewportHeight;
                this.currentInnerHeight = eventData.innerHeight;
                this.currentOffsetTop = eventData.offsetTop;

                this.emit('resize', eventData);
                this.emitThrottled('resize:throttled', eventData);
            };

            const orientationChangeHandler = () => {
                this.emit('orientationchange', {
                    orientation: window.orientation,
                    screenOrientation: window.screen && window.screen.orientation ? window.screen.orientation.type : null,
                    timestamp: Date.now()
                });
            };

            const focusInHandler = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
                    this.isInputFocused = true;
                    const eventData = {
                        target: e.target,
                        tagName: e.target.tagName,
                        id: e.target.id,
                        className: e.target.className,
                        isContentEditable: e.target.isContentEditable,
                        visualViewportHeight: window.visualViewport ? window.visualViewport.height : null,
                        offsetTop: window.visualViewport ? window.visualViewport.offsetTop || 0 : 0,
                        timestamp: Date.now()
                    };
                    this.emit('keyboard:focusin', eventData);
                    this.emit('keyboard:show', eventData);
                }
            };

            const focusOutHandler = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
                    this.isInputFocused = false;
                    const eventData = {
                        target: e.target,
                        tagName: e.target.tagName,
                        id: e.target.id,
                        className: e.target.className,
                        isContentEditable: e.target.isContentEditable,
                        timestamp: Date.now()
                    };
                    this.emit('keyboard:focusout', eventData);
                    this.emit('keyboard:hide', eventData);
                }
            };

            const visualViewportResizeHandler = (evt) => {
                if (!window.visualViewport) return;

                const eventData = {
                    height: window.visualViewport.height,
                    width: window.visualViewport.width,
                    scale: window.visualViewport.scale,
                    offsetTop: window.visualViewport.offsetTop || 0,
                    pageLeft: window.visualViewport.pageLeft,
                    pageTop: window.visualViewport.pageTop,
                    innerHeight: window.innerHeight || 0,
                    innerWidth: window.innerWidth || 0,
                    timestamp: Date.now()
                };

                this.currentOffsetTop = eventData.offsetTop;

                this.emit('visualViewport:resize', eventData);
                this.emitThrottled('visualViewport:resize:throttled', eventData);

                if (this.isInputFocused) {
                    this.emit('keyboard:resize', eventData);
                }
            };

            const visualViewportScrollHandler = () => {
                if (!window.visualViewport) return;

                const eventData = {
                    offsetTop: window.visualViewport.offsetTop || 0,
                    pageLeft: window.visualViewport.pageLeft,
                    pageTop: window.visualViewport.pageTop,
                    timestamp: Date.now()
                };

                this.currentOffsetTop = eventData.offsetTop;

                this.emit('visualViewport:scroll', eventData);

                if (this.isInputFocused && Math.abs(eventData.offsetTop - this.currentOffsetTop) > 10) {
                    this.emit('keyboard:offsetchange', eventData);
                }
            };

            window.addEventListener('resize', resizeHandler, { passive: true });
            this.nativeListeners.push({ target: window, event: 'resize', handler: resizeHandler });

            window.addEventListener('orientationchange', orientationChangeHandler, { passive: true });
            this.nativeListeners.push({ target: window, event: 'orientationchange', handler: orientationChangeHandler });

            window.addEventListener('focusin', focusInHandler, { passive: true });
            this.nativeListeners.push({ target: window, event: 'focusin', handler: focusInHandler });

            window.addEventListener('focusout', focusOutHandler, { passive: true });
            this.nativeListeners.push({ target: window, event: 'focusout', handler: focusOutHandler });

            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', visualViewportResizeHandler, { passive: true });
                this.nativeListeners.push({ target: window.visualViewport, event: 'resize', handler: visualViewportResizeHandler });

                window.visualViewport.addEventListener('scroll', visualViewportScrollHandler, { passive: true });
                this.nativeListeners.push({ target: window.visualViewport, event: 'scroll', handler: visualViewportScrollHandler });
            }
        }

        emit(event, data) {
            const handlers = this.listeners.get(event);
            if (handlers && handlers.length > 0) {
                handlers.forEach(handler => {
                    try {
                        handler(data, event);
                    } catch (e) {
                        console.warn(`[EventBus] Error in handler for event "${event}":`, e);
                    }
                });
            }
        }

        emitThrottled(event, data) {
            const now = Date.now();
            const timeSinceLastSync = now - this.lastSyncTime;

            if (timeSinceLastSync >= this.throttleInterval) {
                this.lastSyncTime = now;
                this.emit(event, data);
            }
        }

        on(event, handler) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, []);
            }
            this.listeners.get(event).push(handler);

            return () => this.off(event, handler);
        }

        once(event, handler) {
            const wrapper = (data, eventName) => {
                handler(data, eventName);
                this.off(event, wrapper);
            };
            return this.on(event, wrapper);
        }

        off(event, handler) {
            const handlers = this.listeners.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
                if (handlers.length === 0) {
                    this.listeners.delete(event);
                }
            }
        }

        removeAllListeners(event) {
            if (event) {
                this.listeners.delete(event);
            } else {
                this.listeners.clear();
            }
        }

        setThrottleInterval(interval) {
            this.throttleInterval = Math.max(0, interval);
        }

        getCurrentViewportInfo() {
            return {
                viewportHeight: this.currentViewportHeight,
                innerHeight: this.currentInnerHeight,
                visualViewportHeight: window.visualViewport ? window.visualViewport.height : null,
                offsetTop: this.currentOffsetTop,
                isInputFocused: this.isInputFocused
            };
        }

        calculateKeyboardHeight() {
            const innerHeight = window.innerHeight || 0;
            const vvHeight = window.visualViewport ? window.visualViewport.height : innerHeight;
            const offsetTop = window.visualViewport ? window.visualViewport.offsetTop || 0 : 0;

            let keyboardHeight = innerHeight - vvHeight;
            if (offsetTop > 0) {
                keyboardHeight = Math.max(keyboardHeight, offsetTop);
            }

            if (keyboardHeight < 0 || keyboardHeight > innerHeight * 0.6) {
                return 0;
            }

            return Math.min(keyboardHeight, 380, Math.round(innerHeight * 0.4));
        }

        destroy() {
            this.nativeListeners.forEach(({ target, event, handler }) => {
                try {
                    target.removeEventListener(event, handler);
                } catch (e) {
                    console.warn(`[EventBus] Error removing listener for "${event}":`, e);
                }
            });
            this.nativeListeners = [];
            this.listeners.clear();
            this.isInitialized = false;
        }
    }

    const eventBus = new EventBus();
    window.EventBus = eventBus;
    window.Core = window.Core || {};
    window.Core.EventBus = eventBus;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => eventBus.init(), { once: true });
    } else {
        eventBus.init();
    }

})(window);
