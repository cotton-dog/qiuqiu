/**
 * Android 视口适配器
 * 针对Android Opera/Chrome优化的视口和键盘处理
 */
(function(window) {
    'use strict';

    class AndroidViewportAdapter {
        constructor(deviceAdapter) {
            this.deviceAdapter = deviceAdapter;
            this.rafId = 0;
            this.lastHeight = 0;
            this.lastSyncTime = 0;
            this.isInputFocused = false;
            this.lastInputFocusState = null;
            this.isOpera = deviceAdapter.isOpera();
            this.listeners = [];
            this.lastInnerHeight = 0;
            this.lastOffsetTop = 0;
            this.isStandaloneMode = false;
        }

        init() {
            // 检测全屏/standalone模式
            this.isStandaloneMode = this.detectStandaloneMode();
            
            // 初始化高度值
            this.lastInnerHeight = window.innerHeight || 0;
            if (window.visualViewport) {
                this.lastOffsetTop = window.visualViewport.offsetTop || 0;
            }
            
            // Android Opera可能不支持visualViewport，使用window.innerHeight
            // Android Chrome支持visualViewport，但Opera可能不支持
            if (!this.isOpera && window.visualViewport && typeof window.visualViewport.height === 'number') {
                this.setupVisualViewportListeners();
            }
            
            this.setupWindowListeners();
            this.scheduleHeightUpdate();
            
            console.log('[AndroidViewportAdapter] 初始化完成，isOpera:', this.isOpera, 'visualViewport支持:', !!window.visualViewport, 'standalone模式:', this.isStandaloneMode);
        }

        detectStandaloneMode() {
            try {
                if (window.matchMedia) {
                    if (window.matchMedia('(display-mode: fullscreen)').matches) {
                        return true;
                    }
                    if (window.matchMedia('(display-mode: standalone)').matches) {
                        return true;
                    }
                }
                if (window.navigator && window.navigator.standalone === true) {
                    return true;
                }
                if (document.referrer && document.referrer.includes('android-app://')) {
                    return true;
                }
            } catch (e) {
                // 忽略错误
            }
            return false;
        }

        setupVisualViewportListeners() {
            if (!window.visualViewport) return;
            
            // 使用EventBus统一处理事件
            if (window.EventBus) {
                window.EventBus.on('visualViewport:resize', (data) => {
                    this.handleViewportResize();
                    this.scheduleHeightUpdate();
                });
                window.EventBus.on('visualViewport:scroll', () => {
                    this.handleViewportScroll();
                });
            }
        }

        handleViewportResize() {
            if (!window.visualViewport) return;
            
            const currentVvH = window.visualViewport.height;
            const currentInnerH = window.innerHeight;
            const currentOffsetTop = window.visualViewport.offsetTop || 0;
            
            // 在全屏模式下，如果visualViewport.height变化不明显，使用innerHeight的变化来检测键盘
            if (this.isStandaloneMode && this.isInputFocused) {
                const innerHeightDiff = this.lastInnerHeight - currentInnerH;
                const vvHeightDiff = this.lastHeight - currentVvH;
                
                // 如果innerHeight明显减少但visualViewport.height变化不大，说明键盘弹起了
                if (innerHeightDiff > 100 && vvHeightDiff < 50) {
                    const keyboardHeight = innerHeightDiff;
                    if (keyboardHeight > 100) {
                        this.updateKeyboardSpacer(keyboardHeight);
                        this.onKeyboardShow();
                    }
                }
            }
            
            // 动态调整键盘占位元素高度
            if (this.isInputFocused) {
                const keyboardHeight = this.calculateKeyboardHeight();
                if (keyboardHeight > 100) {
                    this.updateKeyboardSpacer(keyboardHeight);
                } else {
                    this.hideKeyboardSpacer();
                }
            }
            
            this.lastInnerHeight = currentInnerH;
            this.lastOffsetTop = currentOffsetTop;
        }

        handleViewportScroll() {
            if (!window.visualViewport) return;
            
            const currentOffsetTop = window.visualViewport.offsetTop || 0;
            
            // 如果offsetTop变化，说明键盘弹起导致视口偏移，需要调整顶部栏位置
            if (this.isInputFocused && Math.abs(currentOffsetTop - this.lastOffsetTop) > 10) {
                this.adjustHeaderPosition(currentOffsetTop);
                this.lastOffsetTop = currentOffsetTop;
            }
        }

        adjustHeaderPosition(offsetTop) {
            try {
                // 方案A：不再通过 translateY(offsetTop) 平移整块对话内容层。
                // 键盘只允许影响消息区/菜单/输入区（通过 keyboard-spacer），顶部栏与背景不动。
                const dialoguePage = document.getElementById('dialogue-page');
                const content = dialoguePage
                    ? dialoguePage.querySelector('.dialogue-page__content')
                    : document.querySelector('.dialogue-page__content');
                if (content) content.style.transform = '';
            } catch (e) {
                console.warn('[AndroidViewportAdapter] adjustHeaderPosition error:', e);
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
                        this.adjustHeaderPosition(0);
                        // 更新当前高度值
                        this.lastInnerHeight = window.innerHeight || 0;
                        if (window.visualViewport) {
                            this.lastOffsetTop = window.visualViewport.offsetTop || 0;
                        }
                        
                        const inOverlay = target.closest('.card-overlay') || target.closest('.batch-import-overlay');
                        if (inOverlay) {
                            const lockDocScroll = () => {
                                try {
                                    document.documentElement.scrollTop = 0;
                                    document.body.scrollTop = 0;
                                } catch (err) {}
                            };
                            lockDocScroll();
                            setTimeout(lockDocScroll, 50);
                            setTimeout(lockDocScroll, 150);
                            if (typeof window.scrollOverlayInputIntoView === 'function') {
                                setTimeout(() => window.scrollOverlayInputIntoView(target), 280);
                                setTimeout(() => window.scrollOverlayInputIntoView(target), 600);
                                setTimeout(() => window.scrollOverlayInputIntoView(target), 900);
                            }
                        }
                        
                        // Android Opera使用固定高度，其他浏览器动态计算
                        if (this.isOpera) {
                            this.updateKeyboardSpacer(300);
                            // 键盘展开后延迟滚动，确保spacer占位生效
                            setTimeout(() => this.onKeyboardShow(), 100);
                        } else {
                            // Chrome可以动态计算，在全屏模式下需要更长的延迟
                            const delay = this.isStandaloneMode ? 200 : 100;
                            setTimeout(() => {
                                const keyboardHeight = this.calculateKeyboardHeight();
                                if (keyboardHeight > 100) {
                                    this.updateKeyboardSpacer(keyboardHeight);
                                } else if (this.isStandaloneMode) {
                                    // 全屏模式下，如果visualViewport检测失败，尝试使用innerHeight变化
                                    const heightDiff = this.lastInnerHeight - (window.innerHeight || 0);
                                    if (heightDiff > 100) {
                                        this.updateKeyboardSpacer(heightDiff);
                                    }
                                }
                                // 键盘展开后延迟滚动，确保spacer占位生效
                                setTimeout(() => this.onKeyboardShow(), 80);
                            }, delay);
                        }
                    }
                });

                window.EventBus.on('keyboard:focusout', (e) => {
                    const target = e.target;
                    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                        this.isInputFocused = false;
                        this.notifyParentInputFocus(false);
                        this.hideKeyboardSpacer();
                        setTimeout(() => this.scheduleHeightUpdate(), 200); // Android需要更长延迟
                    }
                });
            }
        }

        getHeightPx() {
            // Android Opera不支持visualViewport，使用innerHeight
            if (this.isOpera) {
                return Math.round(window.innerHeight || 0);
            }
            
            // Android Chrome可以使用visualViewport
            if (window.visualViewport && typeof window.visualViewport.height === 'number') {
                return Math.round(window.visualViewport.height);
            }
            
            return Math.round(window.innerHeight || 0);
        }

        calculateKeyboardHeight() {
            const innerHeight = window.innerHeight || 0;
            
            if (!window.visualViewport || this.isOpera) {
                const diff = this.lastHeight - innerHeight;
                if (diff > 50) {
                    return Math.min(diff, Math.round(innerHeight * 0.4));
                }
                return Math.round(innerHeight * 0.35);
            }
            
            const vvHeight = window.visualViewport.height;
            const offsetTop = window.visualViewport.offsetTop || 0;
            
            let keyboardHeight = innerHeight - vvHeight;
            
            if (this.isStandaloneMode && offsetTop > 0) {
                keyboardHeight = Math.max(keyboardHeight, offsetTop);
            }
            
            if (keyboardHeight < 0 || keyboardHeight > innerHeight * 0.6) {
                const diff = this.lastHeight - innerHeight;
                if (diff > 50) {
                    return Math.min(diff, Math.round(innerHeight * 0.4));
                }
                return Math.round(innerHeight * 0.35);
            }
            return Math.min(keyboardHeight, 380, Math.round(innerHeight * 0.4));
        }

        scheduleHeightUpdate() {
            const now = Date.now();
            const MIN_SYNC_INTERVAL = this.isOpera ? 200 : 100; // Opera使用200ms间隔
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
            let h = this.getHeightPx();
            const MIN_SENSIBLE_HEIGHT = 200; // 过滤键盘期瞬时异常高度，与宿主一致
            if (this.isOpera && h < MIN_SENSIBLE_HEIGHT && this.lastHeight >= MIN_SENSIBLE_HEIGHT) {
                h = this.lastHeight;
            }
            if (h > 0 && h !== this.lastHeight) {
                this.lastHeight = h;
                document.documentElement.style.setProperty('--app-height', `${h}px`);
            }
        }

        updateKeyboardSpacer(height) {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            
            this.rafId = requestAnimationFrame(() => {
                this.rafId = 0;
                try {
                    const dialoguePage = document.getElementById('dialogue-page');
                    if (!dialoguePage) return;
                    
                    const cap = Math.min(380, Math.round((window.innerHeight || 0) * 0.4));
                    const h = Math.min(height, cap);
                    const spacer = dialoguePage.querySelector('.keyboard-spacer');
                    
                    if (spacer) {
                        const currentHeight = parseInt(spacer.style.flexBasis) || 0;
                        if (Math.abs(currentHeight - h) > 5) {
                            dialoguePage.classList.add('keyboard-open');
                            spacer.style.flex = `0 0 ${h}px`;
                        }
                    }
                } catch (e) {
                    console.warn('[AndroidViewportAdapter] updateKeyboardSpacer error:', e);
                }
            });
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
                
                // 重置顶部栏位置
                const content = dialoguePage.querySelector('.dialogue-page__content');
                if (content) {
                    content.style.transform = '';
                }
                
                // 重置offsetTop记录
                this.lastOffsetTop = 0;
            } catch (e) {
                console.warn('[AndroidViewportAdapter] hideKeyboardSpacer error:', e);
            }
        }

        onKeyboardShow() {
            // 键盘弹出时的回调
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
                console.warn('[AndroidViewportAdapter] notifyParentInputFocus error:', e);
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
    window.Core.Platform.AndroidViewportAdapter = AndroidViewportAdapter;
})(window);
