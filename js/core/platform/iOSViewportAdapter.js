/**
 * iOS 视口适配器
 * 针对iOS Safari优化的视口和键盘处理
 */
(function(window) {
    'use strict';

    class iOSViewportAdapter {
        constructor(deviceAdapter) {
            this.deviceAdapter = deviceAdapter;
            this.rafId = 0;
            this.lastHeight = 0;
            this.lastSyncTime = 0;
            this.isInputFocused = false;
            this.lastInputFocusState = null;
            this.visualViewport = null;
            this.listeners = [];
        }

        init() {
            // iOS Safari 13+ 支持 visualViewport
            if (window.visualViewport && typeof window.visualViewport.height === 'number') {
                this.visualViewport = window.visualViewport;
                this.setupVisualViewportListeners();
            }
            
            this.setupWindowListeners();
            this.scheduleHeightUpdate();
            
            console.log('[iOSViewportAdapter] 初始化完成，visualViewport支持:', !!this.visualViewport);
        }

        setupVisualViewportListeners() {
            // 使用EventBus统一处理事件
            if (window.EventBus) {
                window.EventBus.on('visualViewport:resize', (data) => {
                    const currentVvH = this.visualViewport.height;
                    const heightDiff = this.lastHeight - currentVvH;
                    
                    // 动态调整键盘占位元素高度
                    if (this.isInputFocused) {
                        const keyboardHeight = window.innerHeight - currentVvH;
                        if (keyboardHeight > 100) {
                            this.updateKeyboardSpacer(keyboardHeight);
                        } else {
                            this.hideKeyboardSpacer();
                        }
                    }
                    
                    // 检测键盘弹起（高度减少超过100px）
                    if (this.isInputFocused && heightDiff > 100) {
                        this.onKeyboardShow();
                    }
                    
                    this.lastHeight = currentVvH;
                    this.scheduleHeightUpdate();
                });

                window.EventBus.on('visualViewport:scroll', () => {
                    this.scheduleHeightUpdate();
                });
            }
        }

        setupWindowListeners() {
            // 使用EventBus统一处理事件
            if (window.EventBus) {
                window.EventBus.on('resize:throttled', () => this.scheduleHeightUpdate());
                window.EventBus.on('orientationchange', () => this.scheduleHeightUpdate());

                window.EventBus.on('keyboard:focusin', (e) => {
                    const target = e.target;
                    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                        this.isInputFocused = true;
                        this.notifyParentInputFocus(true);
                        this.updateKeyboardSpacer(300); // iOS默认键盘高度
                        // 键盘展开后延迟滚动，确保spacer占位生效
                        setTimeout(() => this.onKeyboardShow(), 80);
                    }
                });

                window.EventBus.on('keyboard:focusout', (e) => {
                    const target = e.target;
                    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                        this.isInputFocused = false;
                        this.notifyParentInputFocus(false);
                        this.hideKeyboardSpacer();
                        setTimeout(() => this.scheduleHeightUpdate(), 150);
                    }
                });
            }
        }

        getHeightPx() {
            if (this.visualViewport && typeof this.visualViewport.height === 'number') {
                return Math.round(this.visualViewport.height);
            }
            return Math.round(window.innerHeight || 0);
        }

        scheduleHeightUpdate() {
            const now = Date.now();
            const MIN_SYNC_INTERVAL = 100; // iOS使用100ms间隔
            const timeSinceLastSync = now - this.lastSyncTime;
            const useThrottle = this.isInputFocused && timeSinceLastSync < MIN_SYNC_INTERVAL;
            
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            
            this.rafId = requestAnimationFrame(() => {
                this.rafId = 0;
                if (!useThrottle || timeSinceLastSync >= MIN_SYNC_INTERVAL) {
                    this.lastSyncTime = now;
                    this.applyHeight();
                }
            });
        }

        applyHeight() {
            if (this.isInputFocused) return; // 键盘期不写根高度，避免整页重排
            const h = this.getHeightPx();
            if (h > 0 && h !== this.lastHeight) {
                this.lastHeight = h;
                document.documentElement.style.setProperty('--app-height', `${h}px`);
            }
        }

        updateKeyboardSpacer(height) {
            try {
                const dialoguePage = document.getElementById('dialogue-page');
                if (!dialoguePage) return;
                
                const spacer = dialoguePage.querySelector('.keyboard-spacer');
                if (spacer) {
                    dialoguePage.classList.add('keyboard-open');
                    spacer.style.flex = `0 0 ${height}px`;
                }
            } catch (e) {
                console.warn('[iOSViewportAdapter] updateKeyboardSpacer error:', e);
            }
        }

        hideKeyboardSpacer() {
            try {
                const dialoguePage = document.getElementById('dialogue-page');
                if (!dialoguePage) return;
                
                const spacer = dialoguePage.querySelector('.keyboard-spacer');
                if (spacer) {
                    dialoguePage.classList.remove('keyboard-open');
                    spacer.style.flex = '';
                    spacer.style.height = '';
                }
            } catch (e) {
                console.warn('[iOSViewportAdapter] hideKeyboardSpacer error:', e);
            }
        }

        onKeyboardShow() {
            // 键盘弹出时的回调，可以触发滚动到底部等操作
            if (typeof window.scrollToLatestOnKeyboard === 'function') {
                window.scrollToLatestOnKeyboard();
            }
        }

        notifyParentInputFocus(focused) {
            if (this.lastInputFocusState === focused) return;
            this.lastInputFocusState = focused;
            
            try {
                if (window.parent && window.parent !== window) {
                    const origin = this.getPostTargetOrigin();
                    window.parent.postMessage({ 
                        type: 'iframeInputFocus', 
                        payload: { focused: !!focused } 
                    }, origin);
                }
            } catch (e) {
                console.warn('[iOSViewportAdapter] notifyParentInputFocus error:', e);
            }
        }

        getPostTargetOrigin() {
            try {
                const params = new URLSearchParams(window.location.search);
                const configuredOrigin = params.get('parentOrigin') || params.get('allowedParentOrigin') || '';
                if (configuredOrigin) return configuredOrigin;
                
                if (document.referrer) {
                    return new URL(document.referrer).origin;
                }
                
                const selfOrigin = window.location.origin;
                return selfOrigin && selfOrigin !== 'null' ? selfOrigin : '*';
            } catch (e) {
                return '*';
            }
        }

        destroy() {
            // 清理所有监听器
            this.listeners.forEach(({ target, event, handler }) => {
                try {
                    target.removeEventListener(event, handler);
                } catch (e) {}
            });
            this.listeners = [];
            
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = 0;
            }
        }
    }

    window.Core = window.Core || {};
    window.Core.Platform = window.Core.Platform || {};
    window.Core.Platform.iOSViewportAdapter = iOSViewportAdapter;
})(window);
