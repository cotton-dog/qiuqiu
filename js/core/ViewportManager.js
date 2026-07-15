(function(window) {
    'use strict';

    class ViewportManager {
        constructor() {
            this.activePage = null;
            this.pageListeners = new Map();
            this.globalListeners = new Map();
            this.snapshots = new Map();
            this.isInitialized = false;

            this._init();
        }

        _init() {
            if (this.isInitialized) return;

            this._setupGlobalListeners();
            this._setupPageVisibilityListener();

            this.isInitialized = true;
            console.log('[ViewportManager] 初始化完成');
        }

        _setupGlobalListeners() {
            this.globalListeners.set('resize', {
                handler: (data) => this._handleResize(data),
                bound: false
            });

            this.globalListeners.set('keyboardshow', {
                handler: (data) => this._handleKeyboardShow(data),
                bound: false
            });

            this.globalListeners.set('keyboardhide', {
                handler: (data) => this._handleKeyboardHide(data),
                bound: false
            });
        }

        _setupPageVisibilityListener() {
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        this._saveAllSnapshots();
                    } else {
                        if (this.activePage) {
                            this._restoreSnapshot(this.activePage);
                        }
                    }
                });
            }
        }

        registerPage(pageId, config = {}) {
            if (!pageId) return;

            const defaultConfig = {
                onResize: null,
                onKeyboardShow: null,
                onKeyboardHide: null,
                enabled: false
            };

            this.pageListeners.set(pageId, {
                ...defaultConfig,
                ...config
            });

            console.log(`[ViewportManager] 页面已注册: ${pageId}`);
        }

        unregisterPage(pageId) {
            if (!pageId) return;

            if (this.activePage === pageId) {
                this._saveSnapshot(pageId);
                this.activePage = null;
            }

            this.pageListeners.delete(pageId);
            this.snapshots.delete(`viewport-snapshot:${pageId}`);

            console.log(`[ViewportManager] 页面已注销: ${pageId}`);
        }

        activatePage(pageId) {
            const listenerSet = this.pageListeners.get(pageId);
            if (!listenerSet) {
                console.warn(`[ViewportManager] 页面未注册: ${pageId}`);
                return false;
            }

            if (this.activePage === pageId) {
                return true;
            }

            if (this.activePage) {
                this._saveSnapshot(this.activePage);
                this._deactivatePage(this.activePage);
            }

            listenerSet.enabled = true;
            this.activePage = pageId;

            this._restoreSnapshot(pageId);

            console.log(`[ViewportManager] 页面已激活: ${pageId}`);

            if (window.Core && window.Core.EventManager) {
                window.Core.EventManager.emit('viewport-page-activated', { pageId });
            }

            return true;
        }

        deactivatePage(pageId) {
            if (this.activePage !== pageId) return;

            this._saveSnapshot(pageId);
            this._deactivatePage(pageId);
            this.activePage = null;

            console.log(`[ViewportManager] 页面已停用: ${pageId}`);

            if (window.Core && window.Core.EventManager) {
                window.Core.EventManager.emit('viewport-page-deactivated', { pageId });
            }
        }

        _deactivatePage(pageId) {
            const listenerSet = this.pageListeners.get(pageId);
            if (!listenerSet) return;

            listenerSet.enabled = false;
        }

        _saveSnapshot(pageId) {
            const snapshot = {
                width: window.innerWidth,
                height: window.innerHeight,
                timestamp: Date.now()
            };

            if (window.visualViewport) {
                snapshot.visualViewport = {
                    width: window.visualViewport.width,
                    height: window.visualViewport.height,
                    offsetLeft: window.visualViewport.offsetLeft,
                    offsetTop: window.visualViewport.offsetTop
                };
            }

            this.snapshots.set(`viewport-snapshot:${pageId}`, snapshot);
        }

        _saveAllSnapshots() {
            this.pageListeners.forEach((_, pageId) => {
                this._saveSnapshot(pageId);
            });
        }

        _restoreSnapshot(pageId) {
            const snapshotRaw = sessionStorage.getItem(`viewport-snapshot:${pageId}`);
            if (!snapshotRaw) return;

            try {
                const snapshot = JSON.parse(snapshotRaw);

                const storedSnapshot = {
                    ...snapshot,
                    restored: true,
                    restoredAt: Date.now()
                };

                this.snapshots.set(`viewport-snapshot:${pageId}`, storedSnapshot);
            } catch (e) {
                console.warn(`[ViewportManager] 恢复快照失败: ${pageId}`, e);
            }
        }

        updatePageListener(pageId, eventType, handler) {
            const listenerSet = this.pageListeners.get(pageId);
            if (!listenerSet) return;

            if (eventType === 'resize') {
                listenerSet.onResize = handler;
            } else if (eventType === 'keyboardshow') {
                listenerSet.onKeyboardShow = handler;
            } else if (eventType === 'keyboardhide') {
                listenerSet.onKeyboardHide = handler;
            }
        }

        _handleResize(data) {
            if (!this.activePage) return;

            const listenerSet = this.pageListeners.get(this.activePage);
            if (!listenerSet || !listenerSet.enabled) return;

            if (listenerSet.onResize) {
                try {
                    listenerSet.onResize(data);
                } catch (e) {
                    console.error(`[ViewportManager] resize handler error:`, e);
                }
            }
        }

        _handleKeyboardShow(data) {
            if (!this.activePage) return;

            const listenerSet = this.pageListeners.get(this.activePage);
            if (!listenerSet || !listenerSet.enabled) return;

            if (listenerSet.onKeyboardShow) {
                try {
                    listenerSet.onKeyboardShow(data);
                } catch (e) {
                    console.error(`[ViewportManager] keyboardShow handler error:`, e);
                }
            }
        }

        _handleKeyboardHide(data) {
            if (!this.activePage) return;

            const listenerSet = this.pageListeners.get(this.activePage);
            if (!listenerSet || !listenerSet.enabled) return;

            if (listenerSet.onKeyboardHide) {
                try {
                    listenerSet.onKeyboardHide(data);
                } catch (e) {
                    console.error(`[ViewportManager] keyboardHide handler error:`, e);
                }
            }
        }

        getCurrentViewportState() {
            const state = {
                width: window.innerWidth,
                height: window.innerHeight,
                pixelRatio: window.devicePixelRatio || 1,
                timestamp: Date.now()
            };

            if (window.visualViewport) {
                state.visualViewport = {
                    width: window.visualViewport.width,
                    height: window.visualViewport.height,
                    offsetLeft: window.visualViewport.offsetLeft,
                    offsetTop: window.visualViewport.offsetTop,
                    scale: window.visualViewport.scale
                };
            }

            return state;
        }

        getActivePage() {
            return this.activePage;
        }

        isPageActive(pageId) {
            return this.activePage === pageId;
        }

        getStats() {
            const pages = [];
            this.pageListeners.forEach((config, pageId) => {
                pages.push({
                    pageId,
                    isActive: this.activePage === pageId,
                    enabled: config.enabled,
                    hasResizeHandler: !!config.onResize,
                    hasKeyboardHandler: !!(config.onKeyboardShow || config.onKeyboardHide)
                });
            });

            return {
                activePage: this.activePage,
                registeredPages: pages.length,
                activePages: pages.filter(p => p.isActive).length,
                pages
            };
        }

        destroy() {
            this._saveAllSnapshots();

            this.pageListeners.clear();
            this.snapshots.clear();
            this.globalListeners.clear();

            this.activePage = null;
            this.isInitialized = false;

            console.log('[ViewportManager] 已销毁');
        }
    }

    window.Core = window.Core || {};
    window.Core.ViewportManager = new ViewportManager();
})(window);
