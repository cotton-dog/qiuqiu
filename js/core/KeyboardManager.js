(function(window) {
    'use strict';

    class KeyboardManager {
        constructor() {
            this.isInputFocused = false;
            this.keyboardHeight = 0;
            this.isKeyboardOpen = false;
            this.currentTarget = null;
            this.listeners = [];
            this.isOpera = false;
            this.isIOS = false;
            this.isAndroid = false;
            this.isStandaloneMode = false;
            this.lastInnerHeight = window.innerHeight || 0;
            this.lastVisualViewportHeight = window.visualViewport ? window.visualViewport.height : 0;
            this.lastOffsetTop = window.visualViewport ? window.visualViewport.offsetTop || 0 : 0;
            
            this.keyboardSpacerHeight = 0;
            this.keyboardSpacerElement = null;
            this.dialoguePageElement = null;
            
            this.timers = {
                keyboardOpen: null,
                keyboardClose: null,
                heightUpdate: null
            };
            
            this.OPERA_HOLD_MS = { pointer: 900, focus: 1400, resize: 520 };
        }

        init() {
            this.detectPlatform();
            this.setupEventListeners();
            this.setupKeyboardSpacer();
            this.setupOperaFix();
            
            console.log('[KeyboardManager] 初始化完成', {
                isOpera: this.isOpera,
                isIOS: this.isIOS,
                isAndroid: this.isAndroid,
                isStandaloneMode: this.isStandaloneMode
            });
        }

        detectPlatform() {
            const ua = String(navigator.userAgent || '');
            this.isAndroid = /Android/i.test(ua);
            this.isIOS = /iPhone|iPad|iPod/i.test(ua);
            this.isOpera = /OPR\/|OPX\/|OPT\/|Opera/i.test(ua);
            
            try {
                if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) {
                    this.isStandaloneMode = true;
                }
                if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
                    this.isStandaloneMode = true;
                }
                if (window.navigator && window.navigator.standalone === true) {
                    this.isStandaloneMode = true;
                }
            } catch (e) {}
        }

        setupEventListeners() {
            if (!window.EventBus) return;

            window.EventBus.on('keyboard:focusin', (e) => {
                this.handleFocusIn(e.target);
            });

            window.EventBus.on('keyboard:focusout', (e) => {
                this.handleFocusOut(e.target);
            });

            window.EventBus.on('keyboard:show', (e) => {
                this.handleKeyboardShow(e);
            });

            window.EventBus.on('keyboard:hide', (e) => {
                this.handleKeyboardHide(e);
            });

            window.EventBus.on('keyboard:resize', (data) => {
                this.handleKeyboardResize(data);
            });

            window.EventBus.on('keyboard:offsetchange', (data) => {
                this.handleOffsetChange(data);
            });

            window.EventBus.on('visualViewport:resize', (data) => {
                this.handleVisualViewportResize(data);
            });

            window.EventBus.on('visualViewport:scroll', (data) => {
                this.handleVisualViewportScroll(data);
            });

            window.EventBus.on('resize:throttled', () => {
                this.handleResize();
            });
        }

        setupKeyboardSpacer() {
            this.dialoguePageElement = document.getElementById('dialogue-page');
            if (this.dialoguePageElement) {
                this.keyboardSpacerElement = this.dialoguePageElement.querySelector('.keyboard-spacer');
            }
        }

        setupOperaFix() {
            if (!this.isOpera) return;

            const OPERA_CLASS = 'ua-android-opera';
            const STYLE_ID = 'core-opera-kbd-fix-style';
            const KBD_ATTR = 'data-kbd';
            const MARK_VALUE = '1';

            const ensureStyle = (doc) => {
                try {
                    if (!doc || !doc.head) return;
                    if (doc.getElementById(STYLE_ID)) return;
                    const style = doc.createElement('style');
                    style.id = STYLE_ID;
                    style.textContent = `
html.${OPERA_CLASS},
html.${OPERA_CLASS} body { background-color: var(--bg, var(--background-color, #f8f5f2)) !important; }
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"],
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"] body { background-color: var(--bg, var(--background-color, #f8f5f2)) !important; }
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"] * { transition: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
                    `.trim();
                    doc.head.appendChild(style);
                } catch (e) {}
            };

            const mark = (holdMs) => {
                try {
                    const doc = document;
                    if (!doc || !doc.documentElement) return;
                    doc.documentElement.setAttribute(KBD_ATTR, MARK_VALUE);
                    if (this.timers.keyboardMark) clearTimeout(this.timers.keyboardMark);
                    this.timers.keyboardMark = setTimeout(() => {
                        try {
                            if (doc.documentElement) doc.documentElement.removeAttribute(KBD_ATTR);
                        } catch (err) {}
                    }, Math.max(80, Number(holdMs) || 0));
                } catch (err) {}
            };

            const patchDocument = (doc) => {
                try {
                    if (!doc || !doc.documentElement) return;
                    doc.documentElement.classList.add(OPERA_CLASS);
                    ensureStyle(doc);
                } catch (e) {}
            };

            patchDocument(document);
            window.__operaKbdMark = (holdMs) => mark(holdMs || this.OPERA_HOLD_MS.resize);
        }

        handleFocusIn(target) {
            if (!target) return;
            const isInputTarget = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
            
            if (isInputTarget) {
                this.isInputFocused = true;
                this.currentTarget = target;
                
                this.lastInnerHeight = window.innerHeight || 0;
                this.lastVisualViewportHeight = window.visualViewport ? window.visualViewport.height : 0;
                this.lastOffsetTop = window.visualViewport ? window.visualViewport.offsetTop || 0 : 0;
                
                if (this.isOpera) {
                    window.__operaKbdMark && window.__operaKbdMark(this.OPERA_HOLD_MS.focus);
                    this.updateKeyboardSpacer(300);
                }
                
                this.emit('focus', { target, timestamp: Date.now() });
            }
        }

        handleFocusOut(target) {
            if (!target) return;
            const isInputTarget = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
            
            if (isInputTarget) {
                this.isInputFocused = false;
                this.hideKeyboardSpacer();
                
                if (this.isOpera) {
                    window.__operaKbdMark && window.__operaKbdMark(this.OPERA_HOLD_MS.focus);
                }
                
                this.emit('blur', { target, timestamp: Date.now() });
            }
        }

        handleKeyboardShow(e) {
            if (!this.isKeyboardOpen) {
                this.isKeyboardOpen = true;
                this.emit('open', { target: e.target, timestamp: Date.now() });
            }
        }

        handleKeyboardHide(e) {
            if (this.isKeyboardOpen) {
                this.isKeyboardOpen = false;
                this.keyboardHeight = 0;
                this.emit('close', { target: e.target, timestamp: Date.now() });
            }
        }

        handleKeyboardResize(data) {
            const newHeight = this.calculateKeyboardHeight(data);
            
            if (Math.abs(newHeight - this.keyboardHeight) > 10) {
                this.keyboardHeight = newHeight;
                this.updateKeyboardSpacer(newHeight);
                this.emit('heightchange', { height: newHeight, timestamp: Date.now() });
            }
        }

        handleOffsetChange(data) {
            this.emit('offsetchange', { offsetTop: data.offsetTop, timestamp: Date.now() });
        }

        handleVisualViewportResize(data) {
            this.lastVisualViewportHeight = data.height || 0;
            this.lastOffsetTop = data.offsetTop || 0;
            
            if (this.isInputFocused) {
                const newHeight = this.calculateKeyboardHeight(data);
                if (newHeight > 100) {
                    this.updateKeyboardSpacer(newHeight);
                }
            }
        }

        handleVisualViewportScroll(data) {
            this.lastOffsetTop = data.offsetTop || 0;
            
            if (this.isInputFocused && Math.abs(data.offsetTop - this.lastOffsetTop) > 10) {
                this.emit('offsetchange', { offsetTop: data.offsetTop, timestamp: Date.now() });
            }
        }

        handleResize() {
            if (this.isOpera) {
                window.__operaKbdMark && window.__operaKbdMark(this.OPERA_HOLD_MS.resize);
            }
        }

        calculateKeyboardHeight(data) {
            const innerHeight = window.innerHeight || 0;
            const vvHeight = data ? data.height : (window.visualViewport ? window.visualViewport.height : innerHeight);
            const offsetTop = data ? data.offsetTop : (window.visualViewport ? window.visualViewport.offsetTop || 0 : 0);
            
            let keyboardHeight = innerHeight - vvHeight;
            
            if (this.isStandaloneMode && offsetTop > 0) {
                keyboardHeight = Math.max(keyboardHeight, offsetTop);
            }
            
            if (keyboardHeight < 0 || keyboardHeight > innerHeight * 0.6) {
                keyboardHeight = 0;
            }
            
            return Math.min(keyboardHeight, 380, Math.round(innerHeight * 0.4));
        }

        updateKeyboardSpacer(height) {
            if (this.timers.heightUpdate) {
                clearTimeout(this.timers.heightUpdate);
            }
            
            this.timers.heightUpdate = setTimeout(() => {
                try {
                    const dialoguePage = this.dialoguePageElement || document.getElementById('dialogue-page');
                    if (!dialoguePage) return;
                    
                    this.keyboardSpacerElement = this.keyboardSpacerElement || dialoguePage.querySelector('.keyboard-spacer');
                    if (!this.keyboardSpacerElement) return;
                    
                    const cap = Math.min(380, Math.round((window.innerHeight || 0) * 0.4));
                    const h = Math.min(height, cap);
                    
                    if (Math.abs(this.keyboardSpacerHeight - h) > 5) {
                        dialoguePage.classList.add('keyboard-open');
                        this.keyboardSpacerElement.style.flex = `0 0 ${h}px`;
                        this.keyboardSpacerHeight = h;
                    }
                } catch (e) {
                    console.warn('[KeyboardManager] updateKeyboardSpacer error:', e);
                }
            }, 16);
        }

        hideKeyboardSpacer() {
            try {
                const dialoguePage = this.dialoguePageElement || document.getElementById('dialogue-page');
                if (!dialoguePage) return;
                
                this.keyboardSpacerElement = this.keyboardSpacerElement || dialoguePage.querySelector('.keyboard-spacer');
                if (this.keyboardSpacerElement) {
                    dialoguePage.classList.remove('keyboard-open');
                    this.keyboardSpacerElement.style.flex = '';
                    this.keyboardSpacerElement.style.height = '';
                    this.keyboardSpacerHeight = 0;
                }
            } catch (e) {
                console.warn('[KeyboardManager] hideKeyboardSpacer error:', e);
            }
        }

        on(event, handler) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(handler);
            
            return () => this.off(event, handler);
        }

        off(event, handler) {
            if (this.listeners[event]) {
                const index = this.listeners[event].indexOf(handler);
                if (index > -1) {
                    this.listeners[event].splice(index, 1);
                }
            }
        }

        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(handler => {
                    try {
                        handler(data, event);
                    } catch (e) {
                        console.warn(`[KeyboardManager] Error in handler for event "${event}":`, e);
                    }
                });
            }
        }

        getState() {
            return {
                isInputFocused: this.isInputFocused,
                keyboardHeight: this.keyboardHeight,
                isKeyboardOpen: this.isKeyboardOpen,
                currentTarget: this.currentTarget,
                isOpera: this.isOpera,
                isIOS: this.isIOS,
                isAndroid: this.isAndroid,
                isStandaloneMode: this.isStandaloneMode
            };
        }

        destroy() {
            Object.values(this.timers).forEach(timer => {
                if (timer) clearTimeout(timer);
            });
            
            this.listeners = {};
            this.isInputFocused = false;
            this.keyboardHeight = 0;
            this.isKeyboardOpen = false;
            this.currentTarget = null;
        }
    }

    const keyboardManager = new KeyboardManager();
    window.KeyboardManager = keyboardManager;
    window.Core = window.Core || {};
    window.Core.KeyboardManager = keyboardManager;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => keyboardManager.init(), { once: true });
    } else {
        keyboardManager.init();
    }

})(window);
