(function(window) {
    'use strict';

    window.Core = window.Core || {};

    /**
     * EventManager - 统一事件管理服务
     * 提供事件监听器的分组管理和自动清理功能
     * 
     * 特点：
     * - 防重复绑定
     * - 支持按分组清理（页面卸载时）
     * - 兼容原生API（不破坏现有代码）
     * - 零依赖，轻量级
     * - 使用 WeakMap 避免内存泄漏
     */
    class EventManager {
        constructor() {
            // 使用 WeakMap 存储事件监听器信息，避免强引用导致的内存泄漏
            // key: 元素对象, value: Map<eventType, Set<handler>>
            this._listeners = new WeakMap();
            
            // 分组管理：groupId -> Set<{target, event, handler}>
            // 使用 WeakSet 存储引用，但需要额外维护一个普通 Set 来跟踪分组
            this._groups = new Map();
            
            // 调试模式
            this._debug = false;
            
            // 统计信息
            this._stats = {
                totalListeners: 0,
                totalGroups: 0
            };
            
            // 自动清理标志
            this._autoCleanupEnabled = false;
        }

        /**
         * 启用/禁用调试模式
         * @param {boolean} enabled 
         */
        setDebug(enabled) {
            this._debug = enabled;
            if (enabled) {
                console.log('[EventManager] 调试模式已启用');
            }
        }

        /**
         * 注册事件监听器
         * @param {EventTarget|Element} target - 目标元素
         * @param {string} event - 事件类型
         * @param {Function} handler - 事件处理函数
         * @param {Object} options - 选项 { groupId, ...addEventListenerOptions }
         * @returns {Function} 清理函数
         */
        on(target, event, handler, options = {}) {
            if (!target || typeof event !== 'string' || typeof handler !== 'function') {
                console.warn('[EventManager] 无效的参数', { target, event, handler });
                return () => {};
            }

            const { groupId, ...addEventListenerOptions } = options || {};
            
            // 检查是否已绑定相同的事件监听器
            if (this._isListenerExists(target, event, handler)) {
                if (this._debug) {
                    console.warn('[EventManager] 事件监听器已存在，跳过绑定', { target, event, groupId });
                }
                return () => this.off(target, event, handler);
            }

            // 绑定事件
            target.addEventListener(event, handler, addEventListenerOptions);

            // 存储监听器信息
            if (!this._listeners.has(target)) {
                this._listeners.set(target, new Map());
            }
            const targetListeners = this._listeners.get(target);
            if (!targetListeners.has(event)) {
                targetListeners.set(event, new Set());
            }
            targetListeners.get(event).add(handler);

            // 分组管理
            if (groupId) {
                if (!this._groups.has(groupId)) {
                    this._groups.set(groupId, new Set());
                    this._stats.totalGroups++;
                }
                const group = this._groups.get(groupId);
                group.add({ target, event, handler });
            }

            this._stats.totalListeners++;

            if (this._debug) {
                console.log('[EventManager] 事件监听器已注册', { 
                    target: target.id || target.className || target.tagName, 
                    event, 
                    groupId: groupId || 'none' 
                });
            }

            // 返回清理函数
            return () => this.off(target, event, handler);
        }

        /**
         * 移除事件监听器
         * @param {EventTarget|Element} target - 目标元素
         * @param {string} event - 事件类型
         * @param {Function} handler - 事件处理函数（可选，不提供则移除该事件的所有监听器）
         */
        off(target, event, handler) {
            if (!target || !event) {
                console.warn('[EventManager] 无效的参数', { target, event });
                return;
            }

            const targetListeners = this._listeners.get(target);
            if (!targetListeners || !targetListeners.has(event)) {
                return;
            }

            const handlers = targetListeners.get(event);
            
            if (handler) {
                // 移除指定的监听器
                if (handlers.has(handler)) {
                    target.removeEventListener(event, handler);
                    handlers.delete(handler);
                    this._stats.totalListeners--;
                    
                    // 从所有分组中移除
                    this._groups.forEach((group) => {
                        group.forEach((item) => {
                            if (item.target === target && item.event === event && item.handler === handler) {
                                group.delete(item);
                            }
                        });
                    });

                    if (this._debug) {
                        console.log('[EventManager] 事件监听器已移除', { 
                            target: target.id || target.className || target.tagName, 
                            event 
                        });
                    }
                }
            } else {
                // 移除该事件的所有监听器
                handlers.forEach((h) => {
                    target.removeEventListener(event, h);
                    this._stats.totalListeners--;
                });
                handlers.clear();
                targetListeners.delete(event);

                if (this._debug) {
                    console.log('[EventManager] 事件类型的所有监听器已移除', { 
                        target: target.id || target.className || target.tagName, 
                        event 
                    });
                }
            }

            // 清理空的分组
            this._cleanupEmptyGroups();
        }

        /**
         * 移除指定分组的所有事件监听器
         * @param {string} groupId - 分组ID
         */
        offGroup(groupId) {
            if (!groupId) {
                console.warn('[EventManager] 无效的分组ID');
                return;
            }

            const group = this._groups.get(groupId);
            if (!group) {
                if (this._debug) {
                    console.log('[EventManager] 分组不存在', { groupId });
                }
                return;
            }

            // 复制 Set 以避免迭代时修改
            const items = Array.from(group);
            items.forEach(({ target, event, handler }) => {
                try {
                    target.removeEventListener(event, handler);
                    this._stats.totalListeners--;
                } catch (e) {
                    console.warn('[EventManager] 移除事件监听器失败', { target, event, error: e });
                }
            });

            // 从 listeners 中移除
            items.forEach(({ target, event, handler }) => {
                const targetListeners = this._listeners.get(target);
                if (targetListeners && targetListeners.has(event)) {
                    targetListeners.get(event).delete(handler);
                    if (targetListeners.get(event).size === 0) {
                        targetListeners.delete(event);
                    }
                }
            });

            // 删除分组
            this._groups.delete(groupId);
            this._stats.totalGroups--;

            if (this._debug) {
                console.log('[EventManager] 分组的所有事件监听器已移除', { 
                    groupId, 
                    count: items.length 
                });
            }
        }

        /**
         * 移除目标元素的所有事件监听器
         * @param {EventTarget|Element} target - 目标元素
         */
        offTarget(target) {
            if (!target) {
                console.warn('[EventManager] 无效的目标元素');
                return;
            }

            const targetListeners = this._listeners.get(target);
            if (!targetListeners) {
                return;
            }

            // 移除所有事件监听器
            targetListeners.forEach((handlers, event) => {
                handlers.forEach((handler) => {
                    try {
                        target.removeEventListener(event, handler);
                        this._stats.totalListeners--;
                    } catch (e) {
                        console.warn('[EventManager] 移除事件监听器失败', { target, event, error: e });
                    }
                });
            });

            // 从所有分组中移除
            this._groups.forEach((group) => {
                group.forEach((item) => {
                    if (item.target === target) {
                        group.delete(item);
                    }
                });
            });

            this._listeners.delete(target);
            this._cleanupEmptyGroups();

            if (this._debug) {
                console.log('[EventManager] 目标元素的所有事件监听器已移除', { 
                    target: target.id || target.className || target.tagName 
                });
            }
        }

        /**
         * 链式API：创建分组上下文
         * @param {string} groupId - 分组ID
         * @returns {Object} 链式API对象
         */
        group(groupId) {
            const self = this;
            return {
                on(target, event, handler, options = {}) {
                    return self.on(target, event, handler, { ...options, groupId });
                },
                off() {
                    self.offGroup(groupId);
                }
            };
        }

        /**
         * 批量注册事件监听器
         * @param {string} groupId - 分组ID
         * @param {Array<Array>} listeners - [[target, event, handler, options], ...]
         * @returns {Function} 清理函数
         */
        onGroup(groupId, listeners) {
            if (!Array.isArray(listeners)) {
                console.warn('[EventManager] listeners 必须是数组');
                return () => {};
            }

            listeners.forEach(([target, event, handler, options = {}]) => {
                this.on(target, event, handler, { ...options, groupId });
            });

            return () => this.offGroup(groupId);
        }

        /**
         * 检查事件监听器是否存在
         * @private
         */
        _isListenerExists(target, event, handler) {
            const targetListeners = this._listeners.get(target);
            if (!targetListeners) return false;
            const handlers = targetListeners.get(event);
            if (!handlers) return false;
            return handlers.has(handler);
        }

        /**
         * 清理空的分组
         * @private
         */
        _cleanupEmptyGroups() {
            this._groups.forEach((group, groupId) => {
                if (group.size === 0) {
                    this._groups.delete(groupId);
                    this._stats.totalGroups--;
                }
            });
        }

        /**
         * 启用页面hide/unload自动清理功能
         * @param {Object} options - 选项 { clearAll, cleanupGroups }
         */
        enableAutoCleanup(options = {}) {
            if (this._autoCleanupEnabled) {
                if (this._debug) {
                    console.log('[EventManager] 自动清理功能已启用');
                }
                return;
            }

            const { clearAll = false, cleanupGroups = [] } = options;
            
            this._autoCleanupEnabled = true;
            this._autoCleanupOptions = { clearAll, cleanupGroups };

            // 监听页面隐藏事件
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', this._handlePageHide.bind(this));
            }
            
            // 监听页面卸载事件
            if (typeof window !== 'undefined') {
                window.addEventListener('beforeunload', this._handlePageUnload.bind(this));
                window.addEventListener('pagehide', this._handlePageHide.bind(this));
            }

            if (this._debug) {
                console.log('[EventManager] 自动清理功能已启用', { clearAll, cleanupGroups });
            }
        }

        /**
         * 禁用页面hide/unload自动清理功能
         */
        disableAutoCleanup() {
            if (!this._autoCleanupEnabled) {
                return;
            }

            this._autoCleanupEnabled = false;
            this._autoCleanupOptions = null;

            // 移除监听器
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', this._handlePageHide.bind(this));
            }
            
            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeunload', this._handlePageUnload.bind(this));
                window.removeEventListener('pagehide', this._handlePageHide.bind(this));
            }

            if (this._debug) {
                console.log('[EventManager] 自动清理功能已禁用');
            }
        }

        /**
         * 处理页面隐藏事件
         * @private
         */
        _handlePageHide() {
            if (!this._autoCleanupEnabled || document.visibilityState === 'visible') {
                return;
            }

            if (this._debug) {
                console.log('[EventManager] 页面隐藏，触发自动清理');
            }

            const { clearAll, cleanupGroups } = this._autoCleanupOptions || {};

            if (clearAll) {
                this.clear();
            } else if (cleanupGroups && cleanupGroups.length > 0) {
                cleanupGroups.forEach((groupId) => {
                    this.offGroup(groupId);
                });
            }
        }

        /**
         * 处理页面卸载事件
         * @private
         */
        _handlePageUnload() {
            if (!this._autoCleanupEnabled) {
                return;
            }

            if (this._debug) {
                console.log('[EventManager] 页面卸载，触发自动清理');
            }

            const { clearAll, cleanupGroups } = this._autoCleanupOptions || {};

            if (clearAll) {
                this.clear();
            } else if (cleanupGroups && cleanupGroups.length > 0) {
                cleanupGroups.forEach((groupId) => {
                    this.offGroup(groupId);
                });
            }
        }

        /**
         * 获取调试信息
         * @returns {Object} 统计信息
         */
        debug() {
            const groupsInfo = {};
            this._groups.forEach((group, groupId) => {
                groupsInfo[groupId] = {
                    count: group.size,
                    listeners: Array.from(group).map(({ target, event }) => ({
                        target: target.id || target.className || target.tagName,
                        event
                    }))
                };
            });

            return {
                stats: { ...this._stats },
                groups: groupsInfo,
                totalGroups: this._groups.size,
                autoCleanupEnabled: this._autoCleanupEnabled,
                autoCleanupOptions: this._autoCleanupOptions
            };
        }

        /**
         * 清理所有事件监听器
         */
        clear() {
            // 移除所有分组的事件监听器
            const groupIds = Array.from(this._groups.keys());
            groupIds.forEach((groupId) => {
                this.offGroup(groupId);
            });

            // 清理统计信息
            this._stats = {
                totalListeners: 0,
                totalGroups: 0
            };

            if (this._debug) {
                console.log('[EventManager] 所有事件监听器已清理');
            }
        }
    }

    // 创建单例实例
    window.Core.EventManager = new EventManager();

    // 在开发环境自动启用调试模式
    if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
        window.Core.EventManager.setDebug(true);
    }

})(window);
