(function(window) {
    'use strict';

    window.Core = window.Core || {};

    class Modal {
        constructor(options) {
            const opts = options || {};
            this.id = opts.id || 'modal-' + Date.now();
            this.title = opts.title || '';
            this.content = opts.content || '';
            this.footer = opts.footer || '';
            this.onOpen = opts.onOpen || null;
            this.onClose = opts.onClose || null;
            this.onBeforeOpen = opts.onBeforeOpen || null;
            this.onBeforeClose = opts.onBeforeClose || null;
            this.closeOnOverlayClick = opts.closeOnOverlayClick !== false;
            this.closeOnEscape = opts.closeOnEscape !== false;
            
            // 支持包装现有元素
            this.useExisting = opts.useExisting || false;
            this.existingElement = opts.existingElement || null;
            this.preserveStyles = opts.preserveStyles !== false;
            
            // 原有显示/隐藏方式（用于包装现有元素）
            this._showMethod = opts.showMethod || 'classList.add';
            this._showValue = opts.showValue || 'active';
            this._hideMethod = opts.hideMethod || 'classList.remove';
            this._hideValue = opts.hideValue || 'active';
            
            // 基础功能开关
            this.enableKeyboardHandling = opts.enableKeyboardHandling !== false;
            this.enableHeightFix = opts.enableHeightFix !== false;
            this.enableInputScroll = opts.enableInputScroll !== false;
            
            this._modalElement = null;
            this._overlayElement = null;
            this._isOpened = false;
            this._isKeyboardOpen = false;
            this._keyboardListeners = [];
            this._escapeHandler = null;
            
            this._init();
        }

        _init() {
            if (this.useExisting && this.existingElement) {
                this._wrapExistingElement();
            } else {
                this._createModalElement();
            }
            this._bindEvents();
        }
        
        _wrapExistingElement() {
            // 包装现有元素，不创建新 DOM
            this._modalElement = this.existingElement;
            this.id = this._modalElement.id || this.id;
            
            // 查找或创建遮罩层
            this._overlayElement = this._findOrCreateOverlay();
            
            // 添加标记属性（用于 CSS 选择器）
            this._modalElement.setAttribute('data-modal-wrapped', 'true');
            
            // 确保高度固定（最小化样式干预）
            if (this.enableHeightFix) {
                this._ensureHeightFix();
            }
            
            // 添加基础行为
            this._attachBehaviors();
        }
        
        _findOrCreateOverlay() {
            // 查找现有的遮罩层（可能在父元素中）
            let overlay = this._modalElement.closest('.modal-overlay') || 
                         this._modalElement.closest('.popup-overlay') ||
                         this._modalElement.parentElement;
            
            // 如果父元素是遮罩层，使用它
            if (overlay && (overlay.classList.contains('modal-overlay') || 
                           overlay.classList.contains('popup-overlay'))) {
                return overlay;
            }
            
            // 否则查找全局遮罩层
            const globalOverlay = document.getElementById('popupOverlay') || 
                                 document.querySelector('.modal-overlay') ||
                                 document.querySelector('.popup-overlay');
            
            if (globalOverlay) {
                return globalOverlay;
            }
            
            // 如果都没有，创建一个（但不插入 DOM，由应用自己管理）
            return null;
        }
        
        _ensureHeightFix() {
            // 确保浮窗基于 viewport 定位，不受键盘影响
            const computedStyle = window.getComputedStyle(this._modalElement);
            const currentPosition = computedStyle.position;
            
            // 如果已经是 fixed，确保使用 viewport 单位
            if (currentPosition === 'fixed') {
                // 不修改样式，只添加标记
                this._modalElement.setAttribute('data-modal-height-fixed', 'true');
            } else if (currentPosition !== 'fixed') {
                // 如果不是 fixed，尝试设置为 fixed（最小干预）
                // 但只在必要时才修改
                const rect = this._modalElement.getBoundingClientRect();
                if (rect.top === 0 || rect.bottom === window.innerHeight) {
                    // 看起来已经是全屏或固定定位，不修改
                    this._modalElement.setAttribute('data-modal-height-fixed', 'true');
                }
            }
        }
        
        _attachBehaviors() {
            // 只添加基础行为，不修改样式类名
            // 行为会在 open() 时启用
        }

        _createModalElement() {
            const existing = document.getElementById(this.id);
            if (existing) {
                existing.remove();
            }

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = this.id + '-overlay';

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = this.id;
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', this.id + '-title');

            const header = document.createElement('div');
            header.className = 'modal-header';

            const title = document.createElement('h3');
            title.className = 'modal-title';
            title.id = this.id + '-title';
            title.textContent = this.title;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.setAttribute('aria-label', '关闭');
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => this.close();

            header.appendChild(title);
            header.appendChild(closeBtn);

            const content = document.createElement('div');
            content.className = 'modal-content';
            content.innerHTML = this.content;

            modal.appendChild(header);
            modal.appendChild(content);

            if (this.footer) {
                const footer = document.createElement('div');
                footer.className = 'modal-footer';
                footer.innerHTML = this.footer;
                modal.appendChild(footer);
            }

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            this._modalElement = modal;
            this._overlayElement = overlay;
        }

        _bindEvents() {
            this._overlayElement.addEventListener('click', (e) => {
                if (this.closeOnOverlayClick && e.target === this._overlayElement) {
                    this.close();
                }
            });

            if (this.closeOnEscape) {
                this._escapeHandler = (e) => {
                    if (e.key === 'Escape' && this._isOpened) {
                        this.close();
                    }
                };
                document.addEventListener('keydown', this._escapeHandler);
            }
        }

        _bindKeyboardEvents() {
            if (!this.enableKeyboardHandling) return;
            
            const handleFocusIn = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                    this._isKeyboardOpen = true;
                    if (this.enableInputScroll) {
                        // 延迟一下，等待键盘完全弹起
                        setTimeout(() => {
                            this._scrollInputIntoView(e.target);
                        }, 300);
                    }
                }
            };

            const handleFocusOut = (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                    setTimeout(() => {
                        const activeInput = document.activeElement;
                        if (!activeInput || (activeInput.tagName !== 'INPUT' && activeInput.tagName !== 'TEXTAREA' && activeInput.tagName !== 'SELECT')) {
                            this._isKeyboardOpen = false;
                        }
                    }, 100);
                }
            };

            // 使用 EventBus 订阅 visualViewport 事件监听键盘状态
            if (window.EventBus) {
                let lastHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const handleViewportResize = (data) => {
                    const currentHeight = data.height;
                    const heightDiff = lastHeight - currentHeight;
                    
                    // 高度减少超过 100px 判断为键盘弹出
                    if (heightDiff > 100) {
                        this._isKeyboardOpen = true;
                        const activeInput = document.activeElement;
                        if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
                            if (this.enableInputScroll) {
                                setTimeout(() => {
                                    this._scrollInputIntoView(activeInput);
                                }, 100);
                            }
                        }
                    } else if (heightDiff < -100) {
                        // 高度增加超过 100px 判断为键盘收起
                        this._isKeyboardOpen = false;
                    }
                    
                    lastHeight = currentHeight;
                };
                
                window.EventBus.on('visualViewport:resize', handleViewportResize);
                this._keyboardListeners.push({ target: window.EventBus, event: 'visualViewport:resize', handler: handleViewportResize });
            }

            // 监听浮窗内的输入框焦点事件
            this._modalElement.addEventListener('focusin', handleFocusIn, { passive: true });
            this._modalElement.addEventListener('focusout', handleFocusOut, { passive: true });
            this._keyboardListeners.push({ target: this._modalElement, event: 'focusin', handler: handleFocusIn });
            this._keyboardListeners.push({ target: this._modalElement, event: 'focusout', handler: handleFocusOut });
        }

        _unbindKeyboardEvents() {
            this._keyboardListeners.forEach(({ target, event, handler }) => {
                if (target === window.EventBus) {
                    target.off(event, handler);
                } else {
                    target.removeEventListener(event, handler);
                }
            });
            this._keyboardListeners = [];
        }

        _scrollInputIntoView(inputElement) {
            try {
                if (!inputElement || !this._modalElement) return;
                
                // 查找可滚动的内容区域（支持多种结构）
                const content = this._modalElement.querySelector('.modal-content') ||
                               this._modalElement.querySelector('[class*="content"]') ||
                               this._modalElement;
                
                if (!content) return;

                const inputRect = inputElement.getBoundingClientRect();
                const contentRect = content.getBoundingClientRect();
                const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

                const inputBottom = inputRect.bottom;
                const contentBottom = contentRect.bottom;
                const visibleThreshold = 50;
                
                // 计算键盘可能占用的高度
                const keyboardHeight = window.innerHeight - viewportHeight;
                const availableHeight = viewportHeight - visibleThreshold;

                // 如果输入框被键盘遮挡
                if (inputBottom > availableHeight) {
                    // 计算需要滚动的距离
                    const scrollOffset = inputBottom - availableHeight + visibleThreshold;
                    
                    // 如果内容区域可滚动
                    if (content.scrollHeight > content.clientHeight) {
                        const currentScrollTop = content.scrollTop || 0;
                        content.scrollTop = currentScrollTop + scrollOffset;
                    } else {
                        // 如果内容区域不可滚动，尝试滚动整个浮窗
                        if (this._modalElement.scrollHeight > this._modalElement.clientHeight) {
                            this._modalElement.scrollTop += scrollOffset;
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to scroll input into view:', e);
            }
        }

        open() {
            if (this._isOpened) return;
            
            if (this.onBeforeOpen) {
                const result = this.onBeforeOpen();
                if (result === false) return;
            }

            // 使用原有显示方式（如果是包装现有元素）
            if (this.useExisting) {
                if (this._showMethod === 'classList.add') {
                    this._modalElement.classList.add(this._showValue);
                } else if (this._showMethod === 'style.display') {
                    this._modalElement.style.display = this._showValue;
                } else if (this._showMethod === 'classList.remove') {
                    // 移除隐藏类
                    this._modalElement.classList.remove(this._hideValue);
                }
                
                // 如果有遮罩层，也显示它
                if (this._overlayElement) {
                    this._overlayElement.classList.add('active');
                }
            } else {
                // 标准 Modal 显示方式
                if (this._overlayElement) {
                    this._overlayElement.classList.add('active');
                }
                this._modalElement.classList.add('active');
            }
            
            this._isOpened = true;

            // 启用键盘处理
            if (this.enableKeyboardHandling) {
                this._bindKeyboardEvents();
            }

            if (this.onOpen) {
                this.onOpen();
            }
        }

        close() {
            if (!this._isOpened) return;
            
            if (this.onBeforeClose) {
                const result = this.onBeforeClose();
                if (result === false) return;
            }

            this._unbindKeyboardEvents();
            
            // 使用原有隐藏方式（如果是包装现有元素）
            if (this.useExisting) {
                if (this._hideMethod === 'classList.remove') {
                    this._modalElement.classList.remove(this._hideValue);
                } else if (this._hideMethod === 'style.display') {
                    this._modalElement.style.display = this._hideValue;
                } else if (this._hideMethod === 'classList.add') {
                    // 添加隐藏类
                    this._modalElement.classList.add(this._hideValue);
                }
                
                // 如果有遮罩层，也隐藏它
                if (this._overlayElement) {
                    this._overlayElement.classList.remove('active');
                }
            } else {
                // 标准 Modal 隐藏方式
                if (this._overlayElement) {
                    this._overlayElement.classList.remove('active');
                }
                this._modalElement.classList.remove('active');
            }
            
            this._isOpened = false;

            if (this.onClose) {
                this.onClose();
            }
        }

        isOpen() {
            return this._isOpened;
        }

        setContent(content) {
            this.content = content;
            const contentElement = this._modalElement.querySelector('.modal-content');
            if (contentElement) {
                contentElement.innerHTML = content;
            }
        }

        setTitle(title) {
            this.title = title;
            const titleElement = this._modalElement.querySelector('.modal-title');
            if (titleElement) {
                titleElement.textContent = title;
            }
        }

        setFooter(footer) {
            this.footer = footer;
            const existingFooter = this._modalElement.querySelector('.modal-footer');
            if (existingFooter) {
                existingFooter.remove();
            }
            if (footer) {
                const footerElement = document.createElement('div');
                footerElement.className = 'modal-footer';
                footerElement.innerHTML = footer;
                this._modalElement.appendChild(footerElement);
            }
        }

        destroy() {
            this.close();
            if (this._escapeHandler) {
                document.removeEventListener('keydown', this._escapeHandler);
            }
            if (this._overlayElement && this._overlayElement.parentNode) {
                this._overlayElement.remove();
            }
        }

        static open(options) {
            const modal = new Modal(options);
            modal.open();
            return modal;
        }
    }

    window.Core.Modal = Modal;

})(window);
