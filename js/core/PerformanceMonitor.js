/**
 * 性能监控模块
 * 检测长任务、帧率下降、大规模重排/重绘等性能异常
 */
(function(window) {
    'use strict';

    class LongTaskDetector {
        constructor() {
            this.longTaskCount = 0;
            this.longTaskHistory = [];
            this.observer = null;
            this.threshold = 50; // 50ms
            this.maxHistory = 100;
            this.patrolLogger = null;
            this._pendingLogs = [];
            this._flushScheduled = false;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        start() {
            if (typeof PerformanceObserver === 'undefined') {
                console.warn('[LongTaskDetector] PerformanceObserver不支持，使用降级方案');
                this._startFallback();
                return;
            }

            try {
                this.observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > this.threshold) {
                            this.recordLongTask(entry);
                        }
                    }
                });
                this.observer.observe({ entryTypes: ['longtask'] });
                console.log('[LongTaskDetector] 长任务检测已启动');
            } catch (e) {
                console.warn('[LongTaskDetector] 启动失败，使用降级方案:', e);
                this._startFallback();
            }
        }

        _startFallback() {
            // 降级方案：使用requestIdleCallback + performance.now()估算
            // 注意：这不是真正的长任务检测，只是估算
            let lastCheckTime = performance.now();
            
            const checkTask = () => {
                const now = performance.now();
                const delta = now - lastCheckTime;
                
                // 如果两次检查间隔超过阈值，可能发生了长任务
                if (delta > this.threshold * 2) {
                    this.recordLongTask({
                        duration: delta,
                        name: 'estimated-long-task',
                        startTime: lastCheckTime,
                        entryType: 'longtask'
                    });
                }
                
                lastCheckTime = now;
                
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(checkTask, { timeout: 1000 });
                } else {
                    setTimeout(checkTask, 1000);
                }
            };
            
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(checkTask, { timeout: 1000 });
            } else {
                setTimeout(checkTask, 1000);
            }
        }

        _flushLongTaskLogs() {
            this._flushScheduled = false;
            if (!this.patrolLogger || this._pendingLogs.length === 0) return;
            const batch = this._pendingLogs.splice(0, 20);
            for (let i = 0; i < batch.length; i++) {
                const payload = batch[i];
                try {
                    this.patrolLogger.log(payload);
                } catch (e) {}
            }
            if (this._pendingLogs.length > 0) this._scheduleFlush();
        }

        _scheduleFlush() {
            if (this._flushScheduled) return;
            this._flushScheduled = true;
            const self = this;
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(function flush() { self._flushLongTaskLogs(); }, { timeout: 500 });
            } else {
                setTimeout(function flush() { self._flushLongTaskLogs(); }, 0);
            }
        }

        recordLongTask(entry) {
            this.longTaskCount++;
            // #region agent log
            const _t0 = Date.now();
            // #endregion
            const taskInfo = {
                duration: entry.duration,
                startTime: entry.startTime,
                name: entry.name || 'unknown',
                entryType: entry.entryType || 'longtask',
                timestamp: Date.now()
            };

            this.longTaskHistory.push(taskInfo);
            if (this.longTaskHistory.length > this.maxHistory) {
                this.longTaskHistory.shift();
            }

            if (this.patrolLogger) {
                this._pendingLogs.push({
                    type: 'performance_long_task',
                    level: 'warning',
                    action: 'detect_long_task',
                    details: taskInfo,
                    message: '检测到长任务：' + taskInfo.duration.toFixed(2) + 'ms (' + taskInfo.name + ')'
                });
                this._scheduleFlush();
            }
            // #endregion
        }

        getStats() {
            return {
                longTaskCount: this.longTaskCount,
                recentTasks: this.longTaskHistory.slice(-10),
                avgDuration: this.longTaskHistory.length > 0
                    ? this.longTaskHistory.reduce((sum, t) => sum + t.duration, 0) / this.longTaskHistory.length
                    : 0
            };
        }

        reset() {
            this.longTaskCount = 0;
            this.longTaskHistory = [];
        }

        stop() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            this._flushScheduled = false;
            if (this._pendingLogs.length > 0) this._flushLongTaskLogs();
        }
    }

    class FrameRateMonitor {
        constructor() {
            this.fpsHistory = [];
            this.lastFrameTime = performance.now();
            this.frameCount = 0;
            this.checkInterval = 1000; // 每秒检查一次
            this.lowFpsThreshold = 30;
            this.maxHistory = 60; // 保留60秒历史
            this.patrolLogger = null;
            this.rafId = null;
            this.isRunning = false;
            this.lastFps = 60;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        start() {
            if (this.isRunning) return;
            this.isRunning = true;
            this.lastFrameTime = performance.now();
            this.frameCount = 0;
            this.measureFrame();
            console.log('[FrameRateMonitor] 帧率监控已启动');
        }

        measureFrame() {
            if (!this.isRunning) return;

            const now = performance.now();
            const delta = now - this.lastFrameTime;
            this.frameCount++;

            if (delta >= this.checkInterval) {
                const fps = Math.round((this.frameCount * 1000) / delta);
                this.recordFPS(fps);
                this.frameCount = 0;
                this.lastFrameTime = now;
            }

            this.rafId = requestAnimationFrame(() => this.measureFrame());
        }

        recordFPS(fps) {
            this.fpsHistory.push({
                fps: fps,
                timestamp: Date.now()
            });

            if (this.fpsHistory.length > this.maxHistory) {
                this.fpsHistory.shift();
            }

            // 检测低帧率
            if (fps < this.lowFpsThreshold) {
                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'performance_low_fps',
                        level: 'warning',
                        action: 'detect_low_fps',
                        details: { fps: fps, threshold: this.lowFpsThreshold },
                        message: `检测到低帧率：${fps} FPS (阈值: ${this.lowFpsThreshold})`
                    });
                }
            }

            // 检测帧率下降
            if (this.lastFps > 0 && (this.lastFps - fps) > 20) {
                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'performance_fps_drop',
                        level: 'info',
                        action: 'detect_fps_drop',
                        details: { 
                            previousFps: this.lastFps, 
                            currentFps: fps,
                            drop: this.lastFps - fps
                        },
                        message: `检测到帧率下降：${this.lastFps} → ${fps} FPS (下降${this.lastFps - fps})`
                    });
                }
            }

            this.lastFps = fps;
        }

        getStats() {
            if (this.fpsHistory.length === 0) {
                return {
                    avgFps: 60,
                    minFps: 60,
                    maxFps: 60,
                    currentFps: 60,
                    lowFpsCount: 0
                };
            }

            const fpsValues = this.fpsHistory.map(h => h.fps);
            const avgFps = Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length);
            const minFps = Math.min(...fpsValues);
            const maxFps = Math.max(...fpsValues);
            const currentFps = fpsValues[fpsValues.length - 1];
            const lowFpsCount = fpsValues.filter(fps => fps < this.lowFpsThreshold).length;

            return {
                avgFps: avgFps,
                minFps: minFps,
                maxFps: maxFps,
                currentFps: currentFps,
                lowFpsCount: lowFpsCount,
                history: this.fpsHistory.slice(-10)
            };
        }

        reset() {
            this.fpsHistory = [];
            this.lastFps = 60;
        }

        stop() {
            this.isRunning = false;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        }
    }

    class LayoutShiftDetector {
        constructor() {
            this.clsValue = 0;
            this.shiftCount = 0;
            this.largeShiftCount = 0;
            this.shiftHistory = [];
            this.observer = null;
            this.largeShiftThreshold = 0.1;
            this.maxHistory = 100;
            this.patrolLogger = null;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        start() {
            if (typeof PerformanceObserver === 'undefined') {
                console.warn('[LayoutShiftDetector] PerformanceObserver不支持，使用降级方案');
                this._startFallback();
                return;
            }

            try {
                this.observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!entry.hadRecentInput) {
                            this.clsValue += entry.value;
                            this.shiftCount++;
                            
                            if (entry.value > this.largeShiftThreshold) {
                                this.recordLargeShift(entry);
                            }
                        }
                    }
                });
                this.observer.observe({ entryTypes: ['layout-shift'] });
                console.log('[LayoutShiftDetector] 布局偏移检测已启动');
            } catch (e) {
                console.warn('[LayoutShiftDetector] 启动失败，使用降级方案:', e);
                this._startFallback();
            }
        }

        _startFallback() {
            // 降级方案：监听resize事件，检测频繁变化
            let resizeCount = 0;
            let lastResizeTime = Date.now();
            const resizeWindow = 1000; // 1秒窗口

            const handleResize = () => {
                resizeCount++;
                const now = Date.now();
                
                if (now - lastResizeTime > resizeWindow) {
                    if (resizeCount > 10) {
                        // 1秒内超过10次resize，可能有大面积重排
                        if (this.patrolLogger) {
                            this.patrolLogger.log({
                                type: 'performance_large_layout_shift',
                                level: 'info',
                                action: 'detect_layout_shift_fallback',
                                details: { resizeCount: resizeCount },
                                message: `检测到频繁resize（可能有大面积重排）：${resizeCount}次/秒`
                            });
                        }
                    }
                    resizeCount = 0;
                    lastResizeTime = now;
                }
            };

            window.addEventListener('resize', handleResize, { passive: true });
        }

        recordLargeShift(entry) {
            this.largeShiftCount++;
            
            const shiftInfo = {
                value: entry.value,
                startTime: entry.startTime,
                sources: entry.sources ? entry.sources.map(s => ({
                    node: s.node ? s.node.tagName : 'unknown',
                    previousRect: s.previousRect,
                    currentRect: s.currentRect
                })) : [],
                timestamp: Date.now()
            };

            this.shiftHistory.push(shiftInfo);
            if (this.shiftHistory.length > this.maxHistory) {
                this.shiftHistory.shift();
            }

            if (this.patrolLogger) {
                this.patrolLogger.log({
                    type: 'performance_large_layout_shift',
                    level: 'warning',
                    action: 'detect_large_shift',
                    details: shiftInfo,
                    message: `检测到大规模布局偏移：${shiftInfo.value.toFixed(3)}`
                });
            }
        }

        getStats() {
            return {
                clsValue: this.clsValue,
                shiftCount: this.shiftCount,
                largeShiftCount: this.largeShiftCount,
                recentShifts: this.shiftHistory.slice(-10)
            };
        }

        reset() {
            this.clsValue = 0;
            this.shiftCount = 0;
            this.largeShiftCount = 0;
            this.shiftHistory = [];
        }

        stop() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }
    }

    class PerformanceMonitor {
        constructor() {
            this.longTaskDetector = new LongTaskDetector();
            this.frameRateMonitor = new FrameRateMonitor();
            this.layoutShiftDetector = new LayoutShiftDetector();
            this.patrolLogger = null;
            this.isRunning = false;
            this.shouldBeRunning = true;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
            this.longTaskDetector.setPatrolLogger(logger);
            this.frameRateMonitor.setPatrolLogger(logger);
            this.layoutShiftDetector.setPatrolLogger(logger);
        }

        start() {
            if (this.isRunning) return;
            
            this.longTaskDetector.start();
            this.frameRateMonitor.start();
            this.layoutShiftDetector.start();
            
            this.isRunning = true;
            this.shouldBeRunning = true;
            console.log('[PerformanceMonitor] 性能监控已启动');
        }

        stop() {
            this.longTaskDetector.stop();
            this.frameRateMonitor.stop();
            this.layoutShiftDetector.stop();
            this.isRunning = false;
            console.log('[PerformanceMonitor] 性能监控已停止');
        }

        updateRunningState(enabled) {
            this.shouldBeRunning = enabled;
            
            if (enabled && !this.isRunning) {
                this.start();
            } else if (!enabled && this.isRunning) {
                this.stop();
            }
        }

        getStats() {
            return {
                longTask: this.longTaskDetector.getStats(),
                frameRate: this.frameRateMonitor.getStats(),
                layoutShift: this.layoutShiftDetector.getStats()
            };
        }

        reset() {
            this.longTaskDetector.reset();
            this.frameRateMonitor.reset();
            this.layoutShiftDetector.reset();
        }
    }

    const monitor = new PerformanceMonitor();
    window.Core = window.Core || {};
    window.Core.PerformanceMonitor = monitor;

    // 页面可见时自动启动
    if (document.visibilityState === 'visible') {
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => monitor.start(), { timeout: 3000 });
        } else {
            setTimeout(() => monitor.start(), 2000);
        }
    } else {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !monitor.isRunning) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => monitor.start(), { timeout: 3000 });
                } else {
                    setTimeout(() => monitor.start(), 2000);
                }
            } else if (document.visibilityState === 'hidden' && monitor.isRunning) {
                monitor.stop();
            }
        });
    }
})(window);
