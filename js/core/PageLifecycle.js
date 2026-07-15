(function(window) {
    'use strict';

    window.Core = window.Core || {};

    /**
     * PageLifecycle - 页面生命周期管理服务
     * 提供页面生命周期钩子和自动资源清理功能
     * 
     * 特点：
     * - 提供生命周期钩子（onShow/onHide等）
     * - 页面切换锁（防止快速切换冲突）
     * - 可选使用（不强制）
     * - 集成 EventManager 和 TimerManager
     * - 支持手动触发和可选自动检测
     */
    class PageLifecycle {
        constructor() {
            // 页面注册表：pageId -> { onShow, onHide, onBeforeShow, onBeforeHide, ... }
            this._pages = new Map();
            
            // 当前显示的页面ID
            this._currentPage = null;
            
            // 页面切换锁
            this._switching = false;
            
            // 自动检测配置
            this._autoDetect = false;
            this._observer = null;
            
            // 调试模式
            this._debug = false;
            
            // 统计信息
            this._stats = {
                totalPages: 0,
                currentPage: null
            };
        }

        /**
         * 启用/禁用调试模式
         * @param {boolean} enabled 
         */
        setDebug(enabled) {
            this._debug = enabled;
            if (enabled) {
                console.log('[PageLifecycle] 调试模式已启用');
            }
        }

        /**
         * 启用/禁用自动检测
         * @param {boolean} enabled 
         * @param {Object} options - 检测选项 { selector, activeClass }
         */
        setAutoDetect(enabled, options = {}) {
            this._autoDetect = enabled;
            
            if (enabled) {
                this._startAutoDetect(options);
            } else {
                this._stopAutoDetect();
            }
        }

        /**
         * 注册页面
         * @param {string} pageId - 页面ID
         * @param {Object} hooks - 生命周期钩子
         * @param {Function} hooks.onShow - 页面显示时调用
         * @param {Function} hooks.onHide - 页面隐藏时调用
         * @param {Function} hooks.onBeforeShow - 页面显示前调用
         * @param {Function} hooks.onBeforeHide - 页面隐藏前调用
         * @param {boolean} hooks.autoCleanup - 是否自动清理事件和定时器（默认true）
         */
        register(pageId, hooks = {}) {
            if (!pageId || typeof pageId !== 'string') {
                console.warn('[PageLifecycle] 无效的页面ID', pageId);
                return;
            }

            const {
                onShow,
                onHide,
                onBeforeShow,
                onBeforeHide,
                autoCleanup = true
            } = hooks || {};

            this._pages.set(pageId, {
                onShow: typeof onShow === 'function' ? onShow : null,
                onHide: typeof onHide === 'function' ? onHide : null,
                onBeforeShow: typeof onBeforeShow === 'function' ? onBeforeShow : null,
                onBeforeHide: typeof onBeforeHide === 'function' ? onBeforeHide : null,
                autoCleanup: autoCleanup !== false,
                registeredAt: Date.now()
            });

            this._stats.totalPages = this._pages.size;

            if (this._debug) {
                console.log('[PageLifecycle] 页面已注册', { 
                    pageId, 
                    hasOnShow: !!onShow, 
                    hasOnHide: !!onHide,
                    autoCleanup 
                });
            }
        }

        /**
         * 注销页面
         * @param {string} pageId - 页面ID
         */
        unregister(pageId) {
            if (!pageId) return;

            const removed = this._pages.delete(pageId);
            this._stats.totalPages = this._pages.size;

            if (this._currentPage === pageId) {
                this._currentPage = null;
                this._stats.currentPage = null;
            }

            if (this._debug && removed) {
                console.log('[PageLifecycle] 页面已注销', { pageId });
            }
        }

        /**
         * 显示页面
         * @param {string} pageId - 页面ID
         * @param {Object} options - 选项 { skipLock, ... }
         * @returns {Promise<boolean>} 是否成功显示
         */
        async show(pageId, options = {}) {
            if (!pageId) {
                console.warn('[PageLifecycle] 无效的页面ID');
                return false;
            }

            // 检查切换锁
            if (!options.skipLock && this._switching) {
                if (this._debug) {
                    console.warn('[PageLifecycle] 页面正在切换中，跳过', { pageId });
                }
                return false;
            }

            // 如果已经是当前页面，直接返回
            if (this._currentPage === pageId) {
                return true;
            }

            this._switching = true;

            try {
                const page = this._pages.get(pageId);
                if (!page) {
                    if (this._debug) {
                        console.warn('[PageLifecycle] 页面未注册', { pageId });
                    }
                    return false;
                }

                // 隐藏当前页面
                if (this._currentPage) {
                    await this.hide(this._currentPage, { skipLock: true });
                }

                // 执行 onBeforeShow 钩子
                if (page.onBeforeShow) {
                    try {
                        await page.onBeforeShow();
                    } catch (e) {
                        console.error('[PageLifecycle] onBeforeShow 钩子执行错误', { pageId, error: e });
                    }
                }

                // 更新当前页面
                this._currentPage = pageId;
                this._stats.currentPage = pageId;

                // 执行 onShow 钩子
                if (page.onShow) {
                    try {
                        await page.onShow();
                    } catch (e) {
                        console.error('[PageLifecycle] onShow 钩子执行错误', { pageId, error: e });
                    }
                }

                if (this._debug) {
                    console.log('[PageLifecycle] 页面已显示', { pageId });
                }

                return true;
            } catch (e) {
                console.error('[PageLifecycle] 显示页面错误', { pageId, error: e });
                return false;
            } finally {
                this._switching = false;
            }
        }

        /**
         * 隐藏页面
         * @param {string} pageId - 页面ID
         * @param {Object} options - 选项 { skipLock, ... }
         * @returns {Promise<boolean>} 是否成功隐藏
         */
        async hide(pageId, options = {}) {
            if (!pageId) {
                console.warn('[PageLifecycle] 无效的页面ID');
                return false;
            }

            // 检查切换锁
            if (!options.skipLock && this._switching) {
                if (this._debug) {
                    console.warn('[PageLifecycle] 页面正在切换中，跳过', { pageId });
                }
                return false;
            }

            // 如果不是当前页面，直接返回
            if (this._currentPage !== pageId) {
                return true;
            }

            this._switching = true;

            try {
                const page = this._pages.get(pageId);
                if (!page) {
                    return false;
                }

                // 执行 onBeforeHide 钩子
                if (page.onBeforeHide) {
                    try {
                        await page.onBeforeHide();
                    } catch (e) {
                        console.error('[PageLifecycle] onBeforeHide 钩子执行错误', { pageId, error: e });
                    }
                }

                // 自动清理事件和定时器
                if (page.autoCleanup && window.Core.EventManager && window.Core.TimerManager) {
                    try {
                        window.Core.EventManager.offGroup(pageId);
                        window.Core.TimerManager.clearGroup(pageId);
                    } catch (e) {
                        console.error('[PageLifecycle] 自动清理错误', { pageId, error: e });
                    }
                }
                
                // 自动清理Blob URL（使用BlobUrlService统一管理）
                if (page.autoCleanup && window.Core.BlobUrlService) {
                    try {
                        window.Core.BlobUrlService.clearGroup(pageId);
                        if (this._debug) {
                            console.log('[PageLifecycle] 已清理页面Blob URL', { pageId });
                        }
                    } catch (e) {
                        console.error('[PageLifecycle] 清理Blob URL错误', { pageId, error: e });
                    }
                }

                // 执行 onHide 钩子
                if (page.onHide) {
                    try {
                        await page.onHide();
                    } catch (e) {
                        console.error('[PageLifecycle] onHide 钩子执行错误', { pageId, error: e });
                    }
                }

                // 更新当前页面
                if (this._currentPage === pageId) {
                    this._currentPage = null;
                    this._stats.currentPage = null;
                }

                if (this._debug) {
                    console.log('[PageLifecycle] 页面已隐藏', { pageId });
                }

                return true;
            } catch (e) {
                console.error('[PageLifecycle] 隐藏页面错误', { pageId, error: e });
                return false;
            } finally {
                this._switching = false;
            }
        }

        /**
         * 获取当前页面ID
         * @returns {string|null}
         */
        getCurrentPage() {
            return this._currentPage;
        }

        /**
         * 检查页面是否已注册
         * @param {string} pageId - 页面ID
         * @returns {boolean}
         */
        isRegistered(pageId) {
            return this._pages.has(pageId);
        }

        /**
         * 启动自动检测
         * @private
         */
        _startAutoDetect(options = {}) {
            if (this._observer) {
                this._stopAutoDetect();
            }

            const {
                selector = '.page, [data-page], .tab-content',
                activeClass = 'active'
            } = options;

            // 使用 MutationObserver 监听 DOM 变化
            this._observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type !== 'attributes' && mutation.type !== 'childList') return;
                    
                    // 检查 active 类变化
                    const target = mutation.target;
                    if (target.matches && target.matches(selector)) {
                        const isActive = target.classList.contains(activeClass);
                        const pageId = target.id || target.getAttribute('data-page') || target.className.split(' ')[0];
                        
                        if (pageId && this._pages.has(pageId)) {
                            if (isActive && this._currentPage !== pageId) {
                                this.show(pageId).catch(e => {
                                    console.error('[PageLifecycle] 自动显示页面错误', { pageId, error: e });
                                });
                            } else if (!isActive && this._currentPage === pageId) {
                                this.hide(pageId).catch(e => {
                                    console.error('[PageLifecycle] 自动隐藏页面错误', { pageId, error: e });
                                });
                            }
                        }
                    }
                });
            });

            // 开始观察
            this._observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
                childList: true,
                subtree: true
            });

            if (this._debug) {
                console.log('[PageLifecycle] 自动检测已启动', { selector, activeClass });
            }
        }

        /**
         * 停止自动检测
         * @private
         */
        _stopAutoDetect() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;

                if (this._debug) {
                    console.log('[PageLifecycle] 自动检测已停止');
                }
            }
        }

        /**
         * 获取调试信息
         * @returns {Object} 统计信息
         */
        debug() {
            const pagesInfo = {};
            this._pages.forEach((page, pageId) => {
                pagesInfo[pageId] = {
                    isCurrent: this._currentPage === pageId,
                    hasOnShow: !!page.onShow,
                    hasOnHide: !!page.onHide,
                    autoCleanup: page.autoCleanup,
                    registeredAt: page.registeredAt
                };
            });

            return {
                stats: { ...this._stats },
                pages: pagesInfo,
                currentPage: this._currentPage,
                autoDetect: this._autoDetect,
                switching: this._switching
            };
        }

        /**
         * 清理所有页面
         */
        clear() {
            // 隐藏当前页面
            if (this._currentPage) {
                this.hide(this._currentPage, { skipLock: true }).catch(() => {});
            }

            // 停止自动检测
            this._stopAutoDetect();

            // 清理所有页面
            this._pages.clear();
            this._currentPage = null;

            // 清理统计信息
            this._stats = {
                totalPages: 0,
                currentPage: null
            };

            if (this._debug) {
                console.log('[PageLifecycle] 所有页面已清理');
            }
        }
    }

    // 创建单例实例
    window.Core.PageLifecycle = new PageLifecycle();

    // 在开发环境自动启用调试模式
    if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
        window.Core.PageLifecycle.setDebug(true);
    }

})(window);
