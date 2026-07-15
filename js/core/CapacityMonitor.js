/**
 * 容量监控（容量管理工具）
 * 监控 localStorage 使用量，3MB 预警、4MB 与 StorageService 熔断统一；轻量周期检查，防抖通知。
 */
(function(window) {
    'use strict';

    const THRESHOLD = 4 * 1024 * 1024;
    const WARNING_THRESHOLD = 3 * 1024 * 1024;
    const COOLDOWN_MS = 5 * 60 * 1000;
    const MAX_HISTORY = 1440;

    class CapacityMonitor {
        constructor() {
            this.threshold = THRESHOLD;
            this.warningThreshold = WARNING_THRESHOLD;
            this.currentUsage = 0;
            this.usageHistory = [];
            this.monitorInterval = null;
            this.patrolLogger = null;
            this._lastWarningAt = 0;
            this._lastFullAt = 0;
            
            // 存储失败检测
            this.failureCount = 0;
            this.failureHistory = [];
            this.writeAttempts = 0;
            this._lastFailureCheckAt = 0;
            this._originalSetItem = null;
            this._isPatched = false;
            this._patchLocalStorage();
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        startMonitoring(interval) {
            const ms = typeof interval === 'number' && interval > 0 ? interval : 60000;
            if (this.monitorInterval) return;
            this.monitorInterval = setInterval(() => {
                const run = () => this.checkCapacity();
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(run, { timeout: 2000 });
                } else {
                    run();
                }
            }, ms);
        }

        stopMonitoring() {
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }
        }

        checkCapacity() {
            const usage = this.calculateUsage();
            this.currentUsage = usage;
            this._recordHistory(usage);
            if (usage >= this.threshold) {
                this._handleCapacityFull();
            } else if (usage >= this.warningThreshold) {
                this._handleCapacityWarning();
            }
            return usage;
        }

        calculateUsage() {
            let total = 0;
            try {
                if (typeof localStorage === 'undefined') return 0;
                for (const x in localStorage) {
                    if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
                        total += (localStorage[x].length + x.length) * 2;
                    }
                }
            } catch (e) {
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, { source: 'CapacityMonitor.calculateUsage', extra: {} });
                }
            }
            return total;
        }

        _recordHistory(usage) {
            this.usageHistory.push({ usage, timestamp: Date.now() });
            if (this.usageHistory.length > MAX_HISTORY) this.usageHistory.shift();
        }

        _handleCapacityFull() {
            const now = Date.now();
            if (now - this._lastFullAt < COOLDOWN_MS) return;
            this._lastFullAt = now;

            const message = 'localStorage 容量已满（' + this.formatBytes(this.currentUsage) + '），新数据写入已受限';
            if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                this.patrolLogger.log({
                    type: 'capacity_full',
                    level: 'error',
                    action: 'check_capacity',
                    details: { usage: this.currentUsage },
                    message: message
                });
            }
            if (window.Core && window.Core.ErrorLogService) {
                window.Core.ErrorLogService.log(new Error(message), {
                    source: 'CapacityMonitor.capacity_full',
                    extra: { usage: this.currentUsage }
                });
            }
            try {
                const popup = window.Core && window.Core.Popup;
                if (popup && typeof popup.showNotification === 'function') {
                    popup.showNotification({ title: '容量警告', content: message, type: 'error', duration: 10000 });
                } else {
                    console.warn('[CapacityMonitor]', message);
                }
            } catch (_) {}
        }

        _handleCapacityWarning() {
            const now = Date.now();
            if (now - this._lastWarningAt < COOLDOWN_MS) return;
            this._lastWarningAt = now;

            const message = 'localStorage 使用量接近上限（' + this.formatBytes(this.currentUsage) + '）';
            if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                this.patrolLogger.log({
                    type: 'capacity_warning',
                    level: 'warning',
                    action: 'check_capacity',
                    details: { usage: this.currentUsage },
                    message: message
                });
            }
            if (window.Core && window.Core.ErrorLogService) {
                window.Core.ErrorLogService.log(new Error(message), {
                    source: 'CapacityMonitor.capacity_warning',
                    level: 'warning',
                    extra: { usage: this.currentUsage }
                });
            }
            console.warn('[CapacityMonitor]', message);
        }

        formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[Math.min(i, 2)];
        }

        getUsageStats() {
            return {
                current: this.currentUsage,
                threshold: this.threshold,
                warningThreshold: this.warningThreshold,
                percentage: this.threshold > 0 ? (this.currentUsage / this.threshold) * 100 : 0,
                history: this.usageHistory.slice(-60)
            };
        }

        _patchLocalStorage() {
            // 避免重复patch
            if (this._isPatched) return;
            
            // 检查localStorage是否可用
            if (typeof Storage === 'undefined' || typeof localStorage === 'undefined') {
                return;
            }

            try {
                // 保存原始方法
                this._originalSetItem = Storage.prototype.setItem;
                const self = this;

                // Patch Storage.prototype.setItem
                Storage.prototype.setItem = function(key, value) {
                    self.writeAttempts++;
                    
                    try {
                        // 调用原始方法
                        self._originalSetItem.call(this, key, value);
                    } catch (e) {
                        // 捕获QuotaExceededError
                        if (e.name === 'QuotaExceededError' || 
                            e.code === 22 || 
                            e.code === 1014 ||
                            (e.message && e.message.toLowerCase().includes('quota'))) {
                            self.failureCount++;
                            self._recordStorageFailure(key, value, e);
                        }
                        // 重新抛出错误，保持原有行为
                        throw e;
                    }
                };

                this._isPatched = true;
                console.log('[CapacityMonitor] localStorage.setItem已patch，启用失败检测');
            } catch (e) {
                console.warn('[CapacityMonitor] patch localStorage失败:', e);
            }
        }

        _recordStorageFailure(key, value, error) {
            const failure = {
                key: key,
                valueSize: value ? (typeof value === 'string' ? value.length : JSON.stringify(value).length) : 0,
                timestamp: Date.now(),
                error: error.message || error.name || 'QuotaExceededError',
                errorName: error.name,
                errorCode: error.code
            };

            this.failureHistory.push(failure);
            if (this.failureHistory.length > 100) {
                this.failureHistory.shift();
            }

            // 记录日志
            if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                this.patrolLogger.log({
                    type: 'storage_quota_exceeded',
                    level: 'error',
                    action: 'storage_write',
                    details: failure,
                    message: `localStorage写入失败：QuotaExceededError (key: ${key}, 值大小: ${failure.valueSize} bytes)`
                });
            }

            // 检查失败率
            this._checkFailureRate();
        }

        _checkFailureRate() {
            const now = Date.now();
            // 每5分钟检查一次失败率
            if (now - this._lastFailureCheckAt < COOLDOWN_MS) {
                return;
            }
            this._lastFailureCheckAt = now;

            const failureRate = this.writeAttempts > 0 
                ? (this.failureCount / this.writeAttempts) * 100 
                : 0;

            // 失败率超过5%时记录警告
            if (failureRate > 5) {
                if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                    this.patrolLogger.log({
                        type: 'storage_high_failure_rate',
                        level: 'error',
                        action: 'check_failure_rate',
                        details: {
                            failureRate: failureRate.toFixed(2),
                            failureCount: this.failureCount,
                            writeAttempts: this.writeAttempts,
                            recentFailures: this.failureHistory.slice(-10)
                        },
                        message: `localStorage写入失败率过高：${failureRate.toFixed(2)}% (${this.failureCount}/${this.writeAttempts})`
                    });
                }
            }
        }

        getFailureStats() {
            const failureRate = this.writeAttempts > 0 
                ? (this.failureCount / this.writeAttempts) * 100 
                : 0;
            return {
                failureCount: this.failureCount,
                writeAttempts: this.writeAttempts,
                failureRate: parseFloat(failureRate.toFixed(2)),
                recentFailures: this.failureHistory.slice(-10)
            };
        }

        resetFailureStats() {
            this.failureCount = 0;
            this.writeAttempts = 0;
            this.failureHistory = [];
        }
    }

    const monitor = new CapacityMonitor();
    window.Core = window.Core || {};
    window.Core.CapacityMonitor = monitor;

    function startWhenReady() {
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => monitor.startMonitoring(60000), { timeout: 3000 });
        } else {
            setTimeout(() => monitor.startMonitoring(60000), 2000);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWhenReady);
    } else {
        startWhenReady();
    }
})(window);
