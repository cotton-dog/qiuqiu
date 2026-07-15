(function(window) {
    'use strict';

    window.Core = window.Core || {};

    class PopupService {
        constructor(options) {
            const opts = options || {};
            this.overlayId = opts.overlayId || 'popupOverlay';
            this.overlayClass = opts.overlayClass || 'popup-overlay';
            this.popupClass = opts.popupClass || 'popup-window';
            this.activeClass = opts.activeClass || 'active';
            this._overlay = null;
            this._isKeyboardOpen = false;
            this._keyboardListeners = [];
            this._bindGlobalEvents();
            this._bindKeyboardEvents();
        }

        open(target) {
            const popupEl = this._resolveElement(target);
            if (!popupEl) return null;

            const overlayEl = this._ensureOverlay();

            this.closeAll();
            popupEl.classList.add(this.activeClass);
            overlayEl.classList.add(this.activeClass);
            return popupEl;
        }

        close(target) {
            const overlayEl = this._ensureOverlay();
            const popupEl = target ? this._resolveElement(target) : null;

            if (popupEl) popupEl.classList.remove(this.activeClass);

            const stillOpen = this._getOpenPopups();
            if (stillOpen.length === 0) overlayEl.classList.remove(this.activeClass);
        }

        closeAll() {
            const overlayEl = this._ensureOverlay();
            const openPopups = this._getOpenPopups();
            for (let i = 0; i < openPopups.length; i++) {
                openPopups[i].classList.remove(this.activeClass);
            }
            overlayEl.classList.remove(this.activeClass);
        }

        isOpen(target) {
            if (!target) return this._getOpenPopups().length > 0;
            const popupEl = this._resolveElement(target);
            if (!popupEl) return false;
            return popupEl.classList.contains(this.activeClass);
        }

        _getOpenPopups() {
            try {
                return Array.from(document.querySelectorAll('.' + this.popupClass + '.' + this.activeClass));
            } catch (e) {
                return [];
            }
        }

        _resolveElement(target) {
            if (!target) return null;
            if (typeof target === 'string') {
                try {
                    return document.querySelector(target);
                } catch (e) {
                    return null;
                }
            }
            if (target && target.nodeType === 1) return target;
            return null;
        }

        _ensureOverlay() {
            if (this._overlay && this._overlay.nodeType === 1) return this._overlay;

            const existing = document.getElementById(this.overlayId);
            if (existing) {
                this._overlay = existing;
                if (!existing.classList.contains(this.overlayClass)) existing.classList.add(this.overlayClass);
                this._fixOverlayStyles(existing);
                return existing;
            }

            const overlayEl = document.createElement('div');
            overlayEl.id = this.overlayId;
            overlayEl.className = this.overlayClass;
            this._fixOverlayStyles(overlayEl);
            document.body.appendChild(overlayEl);
            this._overlay = overlayEl;
            return overlayEl;
        }

        _fixOverlayStyles(element) {
            // 确保遮罩层固定到viewport，不受键盘影响
            if (!element.style.position) {
                element.style.position = 'fixed';
            }
            if (!element.style.inset) {
                element.style.top = '0';
                element.style.left = '0';
                element.style.right = '0';
                element.style.bottom = '0';
            }
            // 使用CSS变量设置z-index
            if (!element.style.zIndex) {
                element.style.zIndex = 'var(--z-overlay, 2000)';
            }
        }

        _bindKeyboardEvents() {
            // 监听键盘弹起/收起事件
            const handleFocusIn = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                    this._isKeyboardOpen = true;
                    this._updatePopupForKeyboard(true);
                }
            };

            const handleFocusOut = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                    // 延迟检测，因为可能切换到另一个输入框
                    setTimeout(() => {
                        const activeInput = document.activeElement;
                        if (!activeInput || (activeInput.tagName !== 'INPUT' && activeInput.tagName !== 'TEXTAREA' && activeInput.tagName !== 'SELECT')) {
                            this._isKeyboardOpen = false;
                            this._updatePopupForKeyboard(false);
                        }
                    }, 100);
                }
            };

            // 使用 EventBus 订阅 visualViewport 事件检测键盘（如果可用）
            if (window.EventBus) {
                let lastHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const handleViewportResize = (data) => {
                    const currentHeight = data.height;
                    const heightDiff = lastHeight - currentHeight;
                    
                    // 高度减少超过100px通常表示键盘弹出
                    if (heightDiff > 100) {
                        this._isKeyboardOpen = true;
                        this._updatePopupForKeyboard(true);
                    } else if (heightDiff < -100) {
                        this._isKeyboardOpen = false;
                        this._updatePopupForKeyboard(false);
                    }
                    
                    lastHeight = currentHeight;
                };
                
                window.EventBus.on('visualViewport:resize', handleViewportResize);
                this._keyboardListeners.push({ target: window.EventBus, event: 'visualViewport:resize', handler: handleViewportResize });
            }

            window.addEventListener('focusin', handleFocusIn, { passive: true });
            window.addEventListener('focusout', handleFocusOut, { passive: true });
            this._keyboardListeners.push({ target: window, event: 'focusin', handler: handleFocusIn });
            this._keyboardListeners.push({ target: window, event: 'focusout', handler: handleFocusOut });
        }

        _updatePopupForKeyboard(isOpen) {
            const overlayEl = this._overlay;
            if (!overlayEl) return;

            // 键盘弹起时，确保遮罩层保持在viewport固定位置
            // 浮窗内容应该基于viewport定位，不受键盘影响
            if (isOpen) {
                overlayEl.classList.add('keyboard-open');
                // 防止浮窗内的输入框自动滚动
                const popups = this._getOpenPopups();
                popups.forEach(popup => {
                    popup.classList.add('keyboard-open');
                });
            } else {
                overlayEl.classList.remove('keyboard-open');
                const popups = this._getOpenPopups();
                popups.forEach(popup => {
                    popup.classList.remove('keyboard-open');
                });
            }
        }

        _bindGlobalEvents() {
            const onReady = () => {
                const overlayEl = this._ensureOverlay();

                overlayEl.addEventListener('click', (e) => {
                    if (e.target !== overlayEl) return;
                    this.closeAll();
                });

                overlayEl.addEventListener('touchmove', (e) => {
                    if (!overlayEl.classList.contains(this.activeClass)) return;
                    e.preventDefault();
                }, { passive: false });

                document.addEventListener('keydown', (e) => {
                    const key = e.key || e.code;
                    if (key === 'Escape') this.closeAll();
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', onReady);
            } else {
                onReady();
            }
        }

        // 清理方法（如果需要）
        destroy() {
            this._keyboardListeners.forEach(({ target, event, handler }) => {
                if (target === window.EventBus) {
                    target.off(event, handler);
                } else {
                    target.removeEventListener(event, handler);
                }
            });
            this._keyboardListeners = [];
        }
    }

    window.Core.Popup = new PopupService();

})(window);

