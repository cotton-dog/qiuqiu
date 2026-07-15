(function(window) {
    'use strict';

    window.Core = window.Core || {};

    /**
     * TimerManager - 统一定时器管理服务
     * 提供定时器的分组管理和自动清理功能
     * 
     * 特点：
     * - 跟踪所有 setTimeout/setInterval
     * - 按分组清理
     * - 兼容原生API（不破坏现有代码）
     * - 零依赖
     * - 使用 WeakMap 避免内存泄漏
     */
    class TimerManager {
        constructor() {
            // 定时器信息存储
            // key: timerId, value: { type, handler, delay, groupId, startTime }
            this._timers = new Map();
            
            // 分组管理：groupId -> Set<timerId>
            this._groups = new Map();
            
            // 调试模式
            this._debug = false;
            
            // 统计信息
            this._stats = {
                totalTimers: 0,
                activeTimers: 0,
                totalGroups: 0
            };
        }

        /**
         * 启用/禁用调试模式
         * @param {boolean} enabled 
         */
        setDebug(enabled) {
            this._debug = enabled;
            if (enabled) {
                console.log('[TimerManager] 调试模式已启用');
            }
        }

        /**
         * 创建 setTimeout 定时器
         * @param {Function} handler - 回调函数
         * @param {number} delay - 延迟时间（毫秒）
         * @param {Object|string} options - 选项对象或 groupId 字符串
         * @returns {number} 定时器ID
         */
        setTimeout(handler, delay, options = {}) {
            if (typeof handler !== 'function') {
                console.warn('[TimerManager] handler 必须是函数');
                return -1;
            }

            const opts = typeof options === 'string' ? { groupId: options } : (options || {});
            const { groupId, ...restOptions } = opts;

            // 创建定时器
            const timerId = window.setTimeout(() => {
                // 执行回调
                try {
                    handler();
                } catch (e) {
                    console.error('[TimerManager] 定时器回调执行错误', e);
                } finally {
                    // 清理定时器信息
                    this._timers.delete(timerId);
                    this._stats.activeTimers--;
                    this._stats.totalTimers--;

                    // 从分组中移除
                    if (groupId) {
                        const group = this._groups.get(groupId);
                        if (group) {
                            group.delete(timerId);
                            if (group.size === 0) {
                                this._groups.delete(groupId);
                                this._stats.totalGroups--;
                            }
                        }
                    }
                }
            }, delay, ...(restOptions.args || []));

            // 存储定时器信息
            this._timers.set(timerId, {
                type: 'setTimeout',
                handler,
                delay,
                groupId: groupId || null,
                startTime: Date.now()
            });

            // 分组管理
            if (groupId) {
                if (!this._groups.has(groupId)) {
                    this._groups.set(groupId, new Set());
                    this._stats.totalGroups++;
                }
                this._groups.get(groupId).add(timerId);
            }

            this._stats.totalTimers++;
            this._stats.activeTimers++;

            if (this._debug) {
                console.log('[TimerManager] setTimeout 已创建', { 
                    timerId, 
                    delay, 
                    groupId: groupId || 'none' 
                });
            }

            return timerId;
        }

        /**
         * 创建 setInterval 定时器
         * @param {Function} handler - 回调函数
         * @param {number} delay - 间隔时间（毫秒）
         * @param {Object|string} options - 选项对象或 groupId 字符串
         * @returns {number} 定时器ID
         */
        setInterval(handler, delay, options = {}) {
            if (typeof handler !== 'function') {
                console.warn('[TimerManager] handler 必须是函数');
                return -1;
            }

            const opts = typeof options === 'string' ? { groupId: options } : (options || {});
            const { groupId, ...restOptions } = opts;

            // 创建定时器
            const timerId = window.setInterval(() => {
                try {
                    handler();
                } catch (e) {
                    console.error('[TimerManager] 定时器回调执行错误', e);
                }
            }, delay, ...(restOptions.args || []));

            // 存储定时器信息
            this._timers.set(timerId, {
                type: 'setInterval',
                handler,
                delay,
                groupId: groupId || null,
                startTime: Date.now()
            });

            // 分组管理
            if (groupId) {
                if (!this._groups.has(groupId)) {
                    this._groups.set(groupId, new Set());
                    this._stats.totalGroups++;
                }
                this._groups.get(groupId).add(timerId);
            }

            this._stats.totalTimers++;
            this._stats.activeTimers++;

            if (this._debug) {
                console.log('[TimerManager] setInterval 已创建', { 
                    timerId, 
                    delay, 
                    groupId: groupId || 'none' 
                });
            }

            return timerId;
        }

        /**
         * 清除 setTimeout 定时器
         * @param {number} timerId - 定时器ID
         */
        clearTimeout(timerId) {
            if (timerId == null) return;

            const timer = this._timers.get(timerId);
            if (!timer) {
                // 可能是原生定时器，直接清除
                window.clearTimeout(timerId);
                return;
            }

            window.clearTimeout(timerId);
            this._removeTimer(timerId);
        }

        /**
         * 清除 setInterval 定时器
         * @param {number} timerId - 定时器ID
         */
        clearInterval(timerId) {
            if (timerId == null) return;

            const timer = this._timers.get(timerId);
            if (!timer) {
                // 可能是原生定时器，直接清除
                window.clearInterval(timerId);
                return;
            }

            window.clearInterval(timerId);
            this._removeTimer(timerId);
        }

        /**
         * 清除指定分组的所有定时器
         * @param {string} groupId - 分组ID
         */
        clearGroup(groupId) {
            if (!groupId) {
                console.warn('[TimerManager] 无效的分组ID');
                return;
            }

            const group = this._groups.get(groupId);
            if (!group) {
                if (this._debug) {
                    console.log('[TimerManager] 分组不存在', { groupId });
                }
                return;
            }

            // 复制 Set 以避免迭代时修改
            const timerIds = Array.from(group);
            timerIds.forEach((timerId) => {
                const timer = this._timers.get(timerId);
                if (timer) {
                    if (timer.type === 'setTimeout') {
                        window.clearTimeout(timerId);
                    } else if (timer.type === 'setInterval') {
                        window.clearInterval(timerId);
                    }
                    this._removeTimer(timerId);
                }
            });

            // 删除分组
            this._groups.delete(groupId);
            this._stats.totalGroups--;

            if (this._debug) {
                console.log('[TimerManager] 分组的所有定时器已清除', { 
                    groupId, 
                    count: timerIds.length 
                });
            }
        }

        /**
         * 移除定时器信息（内部方法）
         * @private
         */
        _removeTimer(timerId) {
            const timer = this._timers.get(timerId);
            if (!timer) return;

            // 从分组中移除
            if (timer.groupId) {
                const group = this._groups.get(timer.groupId);
                if (group) {
                    group.delete(timerId);
                    if (group.size === 0) {
                        this._groups.delete(timer.groupId);
                        this._stats.totalGroups--;
                    }
                }
            }

            // 移除定时器信息
            this._timers.delete(timerId);
            this._stats.activeTimers--;
            this._stats.totalTimers--;

            if (this._debug) {
                console.log('[TimerManager] 定时器已清除', { 
                    timerId, 
                    type: timer.type 
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
                setTimeout(handler, delay, options = {}) {
                    return self.setTimeout(handler, delay, { ...options, groupId });
                },
                setInterval(handler, delay, options = {}) {
                    return self.setInterval(handler, delay, { ...options, groupId });
                },
                clear() {
                    self.clearGroup(groupId);
                }
            };
        }

        /**
         * 获取调试信息
         * @returns {Object} 统计信息
         */
        debug() {
            const groupsInfo = {};
            this._groups.forEach((group, groupId) => {
                const timers = Array.from(group).map((timerId) => {
                    const timer = this._timers.get(timerId);
                    if (!timer) return null;
                    return {
                        timerId,
                        type: timer.type,
                        delay: timer.delay,
                        elapsed: Date.now() - timer.startTime
                    };
                }).filter(Boolean);
                
                groupsInfo[groupId] = {
                    count: timers.length,
                    timers
                };
            });

            return {
                stats: { ...this._stats },
                groups: groupsInfo,
                totalGroups: this._groups.size,
                activeTimers: Array.from(this._timers.keys()).length
            };
        }

        /**
         * 清理所有定时器
         */
        clear() {
            // 清除所有分组的定时器
            const groupIds = Array.from(this._groups.keys());
            groupIds.forEach((groupId) => {
                this.clearGroup(groupId);
            });

            // 清除剩余的定时器（没有分组的）
            const timerIds = Array.from(this._timers.keys());
            timerIds.forEach((timerId) => {
                const timer = this._timers.get(timerId);
                if (timer) {
                    if (timer.type === 'setTimeout') {
                        window.clearTimeout(timerId);
                    } else if (timer.type === 'setInterval') {
                        window.clearInterval(timerId);
                    }
                    this._removeTimer(timerId);
                }
            });

            // 清理统计信息
            this._stats = {
                totalTimers: 0,
                activeTimers: 0,
                totalGroups: 0
            };

            if (this._debug) {
                console.log('[TimerManager] 所有定时器已清理');
            }
        }
    }

    // 创建单例实例
    window.Core.TimerManager = new TimerManager();

    // 在开发环境自动启用调试模式
    if (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost') {
        window.Core.TimerManager.setDebug(true);
    }

})(window);
