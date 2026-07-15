/**
 * 巡查服务（PatrolService + PatrolLogger）
 * 自动巡查、清理过期数据、设备适配检查
 */
(function(window) {
    'use strict';

    const MAX_LOG_COUNT = 1000;
    const RETENTION_DAYS = 7;
    // 巡查周期：从5分钟调整为15分钟，减少性能影响
    const CYCLE_INTERVAL = 15 * 60 * 1000;
    const WEEKLY_CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;

    class PatrolLogger {
        constructor() {
            this.logKey = 'patrolLogs';
            this.maxLogCount = MAX_LOG_COUNT;
            this.retentionDays = RETENTION_DAYS;
        }

        _generateId() {
            return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
        }

        log(logEntry) {
            const entry = {
                id: this._generateId(),
                timestamp: Date.now(),
                level: logEntry.level || 'info',
                type: logEntry.type || 'patrol',
                module: logEntry.module || 'PatrolService',
                action: logEntry.action || '',
                details: logEntry.details || {},
                message: logEntry.message || ''
            };

            if (typeof window !== 'undefined' && window.__keyboardPhase) {
                this._keyboardQueue = this._keyboardQueue || [];
                this._keyboardQueue.push(entry);
                return;
            }

            this._addLog(entry);
            this._trimLogs();
            this._autoCleanup();

            if (window.Core && window.Core.ErrorLogService) {
                const errorLogLevel = entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : 'info';
                window.Core.ErrorLogService.log(entry.message || entry.type, {
                    source: 'PatrolService.' + entry.module,
                    level: errorLogLevel,
                    extra: entry.details
                });
            }
        }

        flushKeyboardQueue() {
            if (!this._keyboardQueue || this._keyboardQueue.length === 0) return;
            try {
                const logs = this._loadLogs();
                for (const entry of this._keyboardQueue) {
                    logs.push(entry);
                    if (window.Core && window.Core.ErrorLogService) {
                        const errorLogLevel = entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : 'info';
                        window.Core.ErrorLogService.log(entry.message || entry.type, {
                            source: 'PatrolService.' + entry.module,
                            level: errorLogLevel,
                            extra: entry.details
                        });
                    }
                }
                if (typeof localStorage !== 'undefined') {
                    const trimmed = logs.length > this.maxLogCount ? logs.slice(-this.maxLogCount) : logs;
                    localStorage.setItem(this.logKey, JSON.stringify(trimmed));
                }
                this._keyboardQueue = [];
                this._trimLogs();
                this._autoCleanup();
            } catch (e) {
                console.error('[PatrolLogger] flushKeyboardQueue failed:', e);
                this._keyboardQueue = [];
            }
        }

        _addLog(entry) {
            try {
                const logs = this._loadLogs();
                logs.push(entry);
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(this.logKey, JSON.stringify(logs));
                }
            } catch (e) {
                console.error('[PatrolLogger] Failed to add log:', e);
            }
        }

        _loadLogs() {
            try {
                if (typeof localStorage === 'undefined') return [];
                const raw = localStorage.getItem(this.logKey);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        _trimLogs() {
            try {
                const logs = this._loadLogs();
                if (logs.length > this.maxLogCount) {
                    const trimmed = logs.slice(-this.maxLogCount);
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(this.logKey, JSON.stringify(trimmed));
                    }
                }
            } catch (e) {
                console.error('[PatrolLogger] Failed to trim logs:', e);
            }
        }

        _autoCleanup() {
            try {
                const now = Date.now();
                const threshold = now - (this.retentionDays * 24 * 60 * 60 * 1000);
                const logs = this._loadLogs();
                const validLogs = logs.filter(log => log.timestamp >= threshold);

                if (validLogs.length !== logs.length) {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(this.logKey, JSON.stringify(validLogs));
                    }
                }
            } catch (e) {
                console.error('[PatrolLogger] Failed to auto cleanup:', e);
            }
        }

        getLogs(filters) {
            let logs = this._loadLogs();
            if (filters) {
                if (filters.level) {
                    logs = logs.filter(log => (log.level || '').toLowerCase() === filters.level.toLowerCase());
                }
                if (filters.type) {
                    logs = logs.filter(log => log.type === filters.type);
                }
                if (filters.module) {
                    logs = logs.filter(log => log.module === filters.module);
                }
                if (filters.since) {
                    logs = logs.filter(log => log.timestamp >= filters.since);
                }
            }
            return logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
    }

    class PatrolService {
        constructor() {
            this.isRunning = false;
            this.cycleInterval = CYCLE_INTERVAL;
            this.cycleTimer = null;
            this.weeklyTimer = null;
            this.lastWeeklyCleanup = 0;
            this.modules = {
                patrolLogger: new PatrolLogger()
            };
            this.capacityMonitor = null;
            this.unifiedStorage = null;
            this.deviceAdapter = null;
            this.performanceMonitor = null;
            this.visualAnomalyDetector = null;
            this.isPageVisible = true;
            this.pendingCycle = null;
            
            this.isResidentPatrolEnabled = true;
            this.hasDoneStartupPatrol = false;
            
            // 状态快照，用于检测变化
            this.stateSnapshot = {
                hasDeviceAdapter: false,
                hasPlatformManager: false,
                hasPlatformAdapterClass: false,
                hasViewportAdapter: false,
                hasPlatformAdapter: false,
                deviceType: null,
                platformAdapterClassName: null,
                hasPlatformAdapterClassExists: false,
                lastCheckTime: 0
            };
            
            // 修复尝试次数跟踪，避免无限循环修复
            this.fixAttempts = {
                platformLoader: 0,
                missingScripts: 0,
                viewportAdapter: 0,
                platformAdapter: 0,
                platformManager: 0
            };
            this.maxFixAttempts = 3; // 同一问题最多尝试3次
        }

        async init() {
            if (this.isRunning) return;

            console.log('[PatrolService] 正在初始化...');

            this.capacityMonitor = window.Core && window.Core.CapacityMonitor;
            this.unifiedStorage = window.Core && window.Core.UnifiedStorage;
            this.performanceMonitor = window.Core && window.Core.PerformanceMonitor;
            this.visualAnomalyDetector = window.Core && window.Core.VisualAnomalyDetector;

            if (this.capacityMonitor && typeof this.capacityMonitor.setPatrolLogger === 'function') {
                this.capacityMonitor.setPatrolLogger(this.modules.patrolLogger);
            }

            if (this.unifiedStorage && typeof this.unifiedStorage.setPatrolLogger === 'function') {
                this.unifiedStorage.setPatrolLogger(this.modules.patrolLogger);
            }

            if (this.deviceAdapter && typeof this.deviceAdapter.setPatrolLogger === 'function') {
                this.deviceAdapter.setPatrolLogger(this.modules.patrolLogger);
            }

            if (this.performanceMonitor && typeof this.performanceMonitor.setPatrolLogger === 'function') {
                this.performanceMonitor.setPatrolLogger(this.modules.patrolLogger);
            }

            if (this.visualAnomalyDetector && typeof this.visualAnomalyDetector.setPatrolLogger === 'function') {
                this.visualAnomalyDetector.setPatrolLogger(this.modules.patrolLogger);
            }

            this.isRunning = true;
            
            this.stateSnapshot = this.captureStateSnapshot();
            this.stateSnapshot.lastCheckTime = Date.now();
            
            if (this.isResidentPatrolEnabled) {
                this.startCycle();
                this.startWeeklyCleanup();
            } else {
                this.runStartupPatrol();
            }
            this.setupVisibilityListener();

            this.modules.patrolLogger.log({
                type: 'patrol_service_init',
                level: 'info',
                action: 'init',
                details: {
                    initialState: this.stateSnapshot,
                    residentPatrolEnabled: this.isResidentPatrolEnabled
                },
                message: this.isResidentPatrolEnabled ? '巡查服务初始化完成（常驻巡查已开启）' : '巡查服务初始化完成（仅启动时巡查）'
            });

            console.log('[PatrolService] 初始化完成');
        }

        async runStartupPatrol() {
            if (this.hasDoneStartupPatrol) {
                return;
            }
            
            this.modules.patrolLogger.log({
                type: 'startup_patrol',
                level: 'info',
                action: 'run_startup_patrol',
                message: '正在执行启动时全面巡查...'
            });

            try {
                await this.runCycle();
                this.hasDoneStartupPatrol = true;
                
                this.modules.patrolLogger.log({
                    type: 'startup_patrol_complete',
                    level: 'info',
                    action: 'run_startup_patrol',
                    message: '启动巡查完成，后续巡查已禁用（常驻巡查开关关闭）'
                });
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'startup_patrol_error',
                    level: 'error',
                    action: 'run_startup_patrol',
                    details: { error: e && e.message },
                    message: '启动巡查失败：' + (e && e.message)
                });
            }
        }

        startCycle() {
            // 立即执行一次
            this.scheduleCycle();
            // 设置定时器
            this.cycleTimer = setInterval(() => this.scheduleCycle(), this.cycleInterval);
        }

        scheduleCycle() {
            // 常驻巡查已关闭时，不执行任何巡查
            if (!this.isResidentPatrolEnabled) {
                return;
            }
            
            // 如果页面不可见，延迟执行
            if (!this.isPageVisible) {
                // 页面隐藏时，等待页面可见后再执行
                return;
            }

            // 使用 requestIdleCallback 在空闲时执行，避免影响主线程性能
            if (typeof requestIdleCallback !== 'undefined') {
                this.pendingCycle = requestIdleCallback(() => {
                    this.runCycle();
                    this.pendingCycle = null;
                }, { timeout: 5000 }); // 最多等待5秒
            } else {
                // 降级方案：使用 setTimeout 延迟执行
                setTimeout(() => this.runCycle(), 100);
            }
        }

        setupVisibilityListener() {
            if (typeof document === 'undefined' || !document.addEventListener) return;
            
            const handleVisibilityChange = () => {
                this.isPageVisible = !document.hidden;
                
                // 常驻巡查已关闭时，不响应可见性变化
                if (!this.isResidentPatrolEnabled) {
                    return;
                }
                
                // 页面变为可见时，如果有待执行的巡查，立即执行
                if (this.isPageVisible && this.pendingCycle === null) {
                    setTimeout(() => {
                        if (this.isPageVisible && this.isResidentPatrolEnabled) {
                            this.scheduleCycle();
                        }
                    }, 2000);
                }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
            
            this.isPageVisible = !document.hidden;
        }

        stopCycle() {
            if (this.cycleTimer) {
                clearInterval(this.cycleTimer);
                this.cycleTimer = null;
            }
            if (this.weeklyTimer) {
                clearInterval(this.weeklyTimer);
                this.weeklyTimer = null;
            }
            if (this.pendingCycle && typeof cancelIdleCallback !== 'undefined') {
                cancelIdleCallback(this.pendingCycle);
                this.pendingCycle = null;
            }
            this.isRunning = false;
        }

        async toggleResidentPatrol(enabled) {
            this.isResidentPatrolEnabled = enabled;
            
            if (enabled) {
                this.startCycle();
                this.startWeeklyCleanup();
                
                this.modules.patrolLogger.log({
                    type: 'patrol_config_change',
                    level: 'info',
                    action: 'toggle_resident_patrol',
                    message: '常驻巡查已开启'
                });
            } else {
                this.stopCycle();
                
                this.modules.patrolLogger.log({
                    type: 'patrol_config_change',
                    level: 'info',
                    action: 'toggle_resident_patrol',
                    message: '常驻巡查已关闭，后续仅在启动时进行全面检查'
                });
            }
        }

        async runCycle() {
            // 常驻巡查已关闭时，跳过巡查
            if (!this.isResidentPatrolEnabled) {
                return;
            }
            
            // 如果页面不可见，跳过本次巡查
            if (!this.isPageVisible) {
                return;
            }

            this.modules.patrolLogger.log({
                type: 'patrol_cycle_start',
                level: 'info',
                action: 'run_cycle',
                message: '巡查周期开始'
            });

            try {
                // 监控状态变化并检测是否需要重新初始化
                const stateChanged = await this.monitorStateChanges();
                
                if (stateChanged) {
                    // 状态发生变化，执行必要的重新初始化
                    await this.handleStateChanges();
                } else {
                    // 状态未变化，只做轻量级检查
                    await this.checkPlatformAdapterStatus();
                }

                // 检查性能异常
                await this.checkPerformanceIssues();

                // 检查视觉异常
                await this.checkVisualIssues();

                // 检查存储失败
                await this.checkStorageIssues();
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'patrol_cycle_error',
                    level: 'error',
                    action: 'run_cycle',
                    details: { error: e && e.message },
                    message: '巡查周期错误：' + (e && e.message)
                });
            }

            this.modules.patrolLogger.log({
                type: 'patrol_cycle_end',
                level: 'info',
                action: 'run_cycle',
                message: '巡查周期结束'
            });
        }

        async monitorStateChanges() {
            // 获取当前状态快照
            const currentState = this.captureStateSnapshot();
            
            // 比较状态变化
            const changes = this.compareStateChanges(this.stateSnapshot, currentState);
            
            if (changes.length > 0) {
                // 记录状态变化
                this.modules.patrolLogger.log({
                    type: 'state_change_detected',
                    level: 'info',
                    action: 'monitor_state',
                    details: {
                        changes: changes,
                        previousState: this.stateSnapshot,
                        currentState: currentState
                    },
                    message: `检测到${changes.length}项状态变化：${changes.join(', ')}`
                });
                
                // 更新状态快照
                this.stateSnapshot = currentState;
                return true;
            }
            
            // 更新检查时间
            this.stateSnapshot.lastCheckTime = Date.now();
            return false;
        }

        captureStateSnapshot() {
            const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
            const platformManager = window.Core && window.Core.PlatformAdapterManager;
            const hasAdapterManagerClass = !!(window.Core && window.Core.Platform && window.Core.Platform.AdapterManager);
            
            let deviceType = null;
            let platformAdapterClassName = null;
            let hasPlatformAdapterClass = false;
            let hasViewportAdapter = false;
            let hasPlatformAdapter = false;
            
            if (deviceAdapter) {
                deviceType = deviceAdapter.deviceType || (deviceAdapter.getPlatformAdapter && deviceAdapter.getPlatformAdapter());
                
                if (deviceAdapter.isIOS && deviceAdapter.isIOS()) {
                    platformAdapterClassName = 'iOSPlatformAdapter';
                    hasPlatformAdapterClass = !!(window.Core?.Platform?.iOSPlatformAdapter);
                } else if (deviceAdapter.isAndroid && deviceAdapter.isAndroid()) {
                    platformAdapterClassName = 'AndroidPlatformAdapter';
                    hasPlatformAdapterClass = !!(window.Core?.Platform?.AndroidPlatformAdapter);
                }
            }
            
            if (platformManager) {
                const viewportAdapter = platformManager.getViewportAdapter && platformManager.getViewportAdapter();
                const platformAdapter = platformManager.getPlatformAdapter && platformManager.getPlatformAdapter();
                hasViewportAdapter = !!viewportAdapter;
                hasPlatformAdapter = !!platformAdapter;
            }
            
            return {
                hasDeviceAdapter: !!(deviceAdapter && typeof deviceAdapter.checkDevice === 'function'),
                hasPlatformManager: !!platformManager,
                hasPlatformAdapterClass: hasAdapterManagerClass,
                hasViewportAdapter: hasViewportAdapter,
                hasPlatformAdapter: hasPlatformAdapter,
                deviceType: deviceType,
                platformAdapterClassName: platformAdapterClassName,
                hasPlatformAdapterClassExists: hasPlatformAdapterClass,
                lastCheckTime: Date.now()
            };
        }

        compareStateChanges(previous, current) {
            const changes = [];
            
            if (previous.hasDeviceAdapter !== current.hasDeviceAdapter) {
                changes.push(`设备适配器${current.hasDeviceAdapter ? '已设置' : '已移除'}`);
            }
            
            if (previous.hasPlatformManager !== current.hasPlatformManager) {
                changes.push(`平台适配器管理器${current.hasPlatformManager ? '已初始化' : '已移除'}`);
            }
            
            if (previous.hasPlatformAdapterClass !== current.hasPlatformAdapterClass) {
                changes.push(`平台适配器类${current.hasPlatformAdapterClass ? '已加载' : '已卸载'}`);
            }
            
            if (previous.hasViewportAdapter !== current.hasViewportAdapter) {
                changes.push(`视口适配器${current.hasViewportAdapter ? '已加载' : '已移除'}`);
            }
            
            if (previous.hasPlatformAdapter !== current.hasPlatformAdapter) {
                changes.push(`平台适配器${current.hasPlatformAdapter ? '已加载' : '已移除'}`);
            }
            
            if (previous.deviceType !== current.deviceType) {
                changes.push(`设备类型变化：${previous.deviceType} → ${current.deviceType}`);
            }
            
            if (previous.platformAdapterClassName !== current.platformAdapterClassName) {
                changes.push(`平台适配器类名变化：${previous.platformAdapterClassName || '无'} → ${current.platformAdapterClassName || '无'}`);
            }
            
            if (previous.hasPlatformAdapterClassExists !== current.hasPlatformAdapterClassExists) {
                changes.push(`平台适配器类存在性变化：${previous.hasPlatformAdapterClassExists ? '存在' : '不存在'} → ${current.hasPlatformAdapterClassExists ? '存在' : '不存在'}`);
            }
            
            return changes;
        }

        async handleStateChanges() {
            const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
            const platformManager = window.Core && window.Core.PlatformAdapterManager;
            const platformLoader = window.Core && window.Core.PlatformLoader;
            
            // 1. 如果 PlatformLoader 未加载或类不存在，尝试修复
            if (platformLoader && (!platformLoader.loaded || !(window.Core?.Platform?.AdapterManager))) {
                await this.recoverPlatformLoader();
            }
            
            // 2. 如果平台适配器类不存在，尝试加载脚本
            if (!window.Core || !window.Core.Platform || !window.Core.Platform.AdapterManager) {
                const platform = platformLoader ? platformLoader.getPlatform() : null;
                if (platform === 'ios') {
                    await this.recoverMissingScripts(['js/core/platform/iOSViewportAdapter.js', 'js/core/platform/PlatformAdapterManager.js']);
                } else if (platform === 'android') {
                    await this.recoverMissingScripts(['js/core/platform/AndroidViewportAdapter.js', 'js/core/platform/AndroidOperaKeyboardFix.js', 'js/core/platform/AndroidPlatformAdapter.js', 'js/core/platform/PlatformAdapterManager.js']);
                }
            }
            
            // 3. 如果设备适配器不存在但应该存在，尝试重新初始化
            if (!deviceAdapter && window.Core && window.Core.DeviceAdapter) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_attempt',
                    level: 'info',
                    action: 'reinit_device_adapter',
                    message: '检测到设备适配器缺失，尝试重新初始化'
                });
                
                try {
                    const newDeviceAdapter = new window.Core.DeviceAdapter();
                    newDeviceAdapter.setPatrolLogger(this.modules.patrolLogger);
                    await newDeviceAdapter.init();
                    
                    window.Core.DeviceAdapterInstance = newDeviceAdapter;
                    this.deviceAdapter = newDeviceAdapter;
                    this.setDeviceAdapter(newDeviceAdapter);
                    
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_success',
                        level: 'info',
                        action: 'reinit_device_adapter',
                        message: '设备适配器重新初始化成功'
                    });
                } catch (e) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_failed',
                        level: 'error',
                        action: 'reinit_device_adapter',
                        details: { error: e && e.message },
                        message: '设备适配器重新初始化失败：' + (e && e.message)
                    });
                }
            }
            
            // 4. 如果平台适配器管理器不存在但应该存在，尝试重新初始化
            const currentDeviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
            if (!platformManager && currentDeviceAdapter && window.Core && window.Core.Platform && window.Core.Platform.AdapterManager) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_attempt',
                    level: 'info',
                    action: 'reinit_platform_manager',
                    message: '检测到平台适配器管理器缺失，尝试重新初始化'
                });
                
                try {
                    const newPlatformManager = new window.Core.Platform.AdapterManager();
                    newPlatformManager.setPatrolLogger(this.modules.patrolLogger);
                    await newPlatformManager.init(currentDeviceAdapter);
                    
                    window.Core.PlatformAdapterManager = newPlatformManager;
                    
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_success',
                        level: 'info',
                        action: 'reinit_platform_manager',
                        message: '平台适配器管理器重新初始化成功'
                    });
                    this.fixAttempts.platformManager = 0;
                } catch (e) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_failed',
                        level: 'error',
                        action: 'reinit_platform_manager',
                        details: { error: e && e.message },
                        message: '平台适配器管理器重新初始化失败：' + (e && e.message)
                    });
                    this.fixAttempts.platformManager++;
                }
            }
            
            // 5. 如果视口适配器未加载，尝试修复
            const currentPlatformManager = window.Core && window.Core.PlatformAdapterManager;
            if (currentPlatformManager && currentDeviceAdapter) {
                const viewportAdapter = currentPlatformManager.getViewportAdapter && currentPlatformManager.getViewportAdapter();
                if (!viewportAdapter) {
                    await this.recoverViewportAdapter();
                }
            }
            
            // 6. 如果平台适配器未加载，尝试修复
            if (currentPlatformManager && currentDeviceAdapter) {
                const platformAdapter = currentPlatformManager.getPlatformAdapter && currentPlatformManager.getPlatformAdapter();
                if (!platformAdapter) {
                    await this.recoverPlatformAdapter();
                }
            }
            
            // 7. 如果设备类型变化，记录警告（不自动重新初始化，因为运行时通常不会变化）
            if (currentDeviceAdapter && currentPlatformManager) {
                const currentDeviceType = currentDeviceAdapter.deviceType || (currentDeviceAdapter.getPlatformAdapter && currentDeviceAdapter.getPlatformAdapter());
                if (this.stateSnapshot.deviceType && this.stateSnapshot.deviceType !== currentDeviceType) {
                    this.modules.patrolLogger.log({
                        type: 'state_recovery',
                        level: 'warning',
                        action: 'device_type_changed',
                        details: {
                            previousType: this.stateSnapshot.deviceType,
                            currentType: currentDeviceType
                        },
                        message: `设备类型变化，可能需要重新初始化平台适配器：${this.stateSnapshot.deviceType} → ${currentDeviceType}`
                    });
                    
                    // 注意：这里不自动重新初始化，因为设备类型在运行时通常不会变化
                    // 如果确实需要，可以手动触发
                }
            }
        }

        async recoverPlatformLoader() {
            const fixKey = 'platformLoader';
            
            // 检查是否已达到最大尝试次数
            if (this.fixAttempts[fixKey] >= this.maxFixAttempts) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_skipped',
                    level: 'warning',
                    action: 'recover_platform_loader',
                    details: { attempts: this.fixAttempts[fixKey], maxAttempts: this.maxFixAttempts },
                    message: 'PlatformLoader修复已跳过：已达到最大尝试次数'
                });
                return false;
            }

            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'recover_platform_loader',
                details: { attempt: this.fixAttempts[fixKey] + 1 },
                message: '尝试修复PlatformLoader脚本加载'
            });

            try {
                const platformLoader = window.Core && window.Core.PlatformLoader;
                
                if (!platformLoader) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_failed',
                        level: 'warning',
                        action: 'recover_platform_loader',
                        details: { reason: 'PlatformLoader不存在' },
                        message: 'PlatformLoader修复失败：PlatformLoader不存在'
                    });
                    this.fixAttempts[fixKey]++;
                    return false;
                }

                // 如果未加载，重新加载
                if (!platformLoader.loaded) {
                    platformLoader.loaded = false; // 重置状态
                    await platformLoader.loadPlatformResources();
                    
                    // 等待加载完成
                    let waitCount = 0;
                    const maxWait = 50; // 最多等待5秒
                    while (!platformLoader.loaded && waitCount < maxWait) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        waitCount++;
                    }

                    if (platformLoader.loaded && window.Core && window.Core.Platform && window.Core.Platform.AdapterManager) {
                        this.modules.patrolLogger.log({
                            type: 'auto_fix_success',
                            level: 'info',
                            action: 'recover_platform_loader',
                            details: { waitTime: waitCount * 100 },
                            message: 'PlatformLoader修复成功'
                        });
                        this.fixAttempts[fixKey] = 0; // 重置尝试次数
                        return true;
                    } else {
                        throw new Error('PlatformLoader加载超时或失败');
                    }
                } else {
                    // 已加载，检查类是否存在
                    if (window.Core && window.Core.Platform && window.Core.Platform.AdapterManager) {
                        this.modules.patrolLogger.log({
                            type: 'auto_fix_success',
                            level: 'info',
                            action: 'recover_platform_loader',
                            message: 'PlatformLoader已加载，无需修复'
                        });
                        this.fixAttempts[fixKey] = 0;
                        return true;
                    } else {
                        throw new Error('PlatformLoader已加载但类不存在');
                    }
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_failed',
                    level: 'error',
                    action: 'recover_platform_loader',
                    details: { error: e && e.message, attempt: this.fixAttempts[fixKey] + 1 },
                    message: 'PlatformLoader修复失败：' + (e && e.message)
                });
                this.fixAttempts[fixKey]++;
                return false;
            }
        }

        async recoverMissingScripts(scripts) {
            const fixKey = 'missingScripts';
            
            if (this.fixAttempts[fixKey] >= this.maxFixAttempts) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_skipped',
                    level: 'warning',
                    action: 'recover_missing_scripts',
                    details: { attempts: this.fixAttempts[fixKey], scripts: scripts },
                    message: '缺失脚本修复已跳过：已达到最大尝试次数'
                });
                return false;
            }

            if (!scripts || scripts.length === 0) {
                return true;
            }

            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'recover_missing_scripts',
                details: { scripts: scripts, attempt: this.fixAttempts[fixKey] + 1 },
                message: `尝试加载缺失的脚本：${scripts.join(', ')}`
            });

            try {
                const platformLoader = window.Core && window.Core.PlatformLoader;
                
                if (platformLoader && typeof platformLoader.loadScripts === 'function') {
                    // 使用PlatformLoader加载脚本
                    await new Promise((resolve) => {
                        platformLoader.loadScripts(scripts, resolve);
                    });
                    
                    // 验证脚本是否加载成功
                    let allLoaded = true;
                    for (const script of scripts) {
                        // 简单的验证：检查脚本路径对应的类是否存在
                        // 这里只做基本检查，具体类检查在调用方进行
                        const scriptName = script.split('/').pop().replace('.js', '');
                        if (scriptName.includes('AdapterManager') && !(window.Core?.Platform?.AdapterManager)) {
                            allLoaded = false;
                            break;
                        }
                    }

                    if (allLoaded) {
                        this.modules.patrolLogger.log({
                            type: 'auto_fix_success',
                            level: 'info',
                            action: 'recover_missing_scripts',
                            details: { scripts: scripts },
                            message: '缺失脚本加载成功'
                        });
                        this.fixAttempts[fixKey] = 0;
                        return true;
                    } else {
                        throw new Error('脚本加载后验证失败');
                    }
                } else {
                    // 使用fallback机制加载脚本
                    const loadScriptFallback = async (scriptPath, retries = 2) => {
                        for (let i = 0; i < retries; i++) {
                            try {
                                const response = await fetch(scriptPath, { 
                                    cache: 'no-cache',
                                    headers: { 'Cache-Control': 'no-cache' }
                                });
                                if (response.ok) {
                                    const code = await response.text();
                                    eval(code);
                                    return true;
                                } else if (response.status === 503 && i < retries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                                    continue;
                                }
                            } catch (e) {
                                if (i < retries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                                } else {
                                    throw e;
                                }
                            }
                        }
                        return false;
                    };

                    let allLoaded = true;
                    for (const script of scripts) {
                        const loaded = await loadScriptFallback(script);
                        if (!loaded) {
                            allLoaded = false;
                            break;
                        }
                    }

                    if (allLoaded) {
                        this.modules.patrolLogger.log({
                            type: 'auto_fix_success',
                            level: 'info',
                            action: 'recover_missing_scripts',
                            details: { scripts: scripts },
                            message: '缺失脚本fallback加载成功'
                        });
                        this.fixAttempts[fixKey] = 0;
                        return true;
                    } else {
                        throw new Error('部分脚本fallback加载失败');
                    }
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_failed',
                    level: 'error',
                    action: 'recover_missing_scripts',
                    details: { error: e && e.message, scripts: scripts, attempt: this.fixAttempts[fixKey] + 1 },
                    message: '缺失脚本加载失败：' + (e && e.message)
                });
                this.fixAttempts[fixKey]++;
                return false;
            }
        }

        async recoverViewportAdapter() {
            const fixKey = 'viewportAdapter';
            
            if (this.fixAttempts[fixKey] >= this.maxFixAttempts) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_skipped',
                    level: 'warning',
                    action: 'recover_viewport_adapter',
                    details: { attempts: this.fixAttempts[fixKey] },
                    message: '视口适配器修复已跳过：已达到最大尝试次数'
                });
                return false;
            }

            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'recover_viewport_adapter',
                details: { attempt: this.fixAttempts[fixKey] + 1 },
                message: '尝试修复视口适配器'
            });

            try {
                const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
                const platformManager = window.Core && window.Core.PlatformAdapterManager;

                if (!deviceAdapter) {
                    throw new Error('设备适配器不存在');
                }

                // 如果管理器不存在，先创建
                let manager = platformManager;
                if (!manager) {
                    if (!window.Core || !window.Core.Platform || !window.Core.Platform.AdapterManager) {
                        throw new Error('平台适配器管理器类不存在');
                    }
                    manager = new window.Core.Platform.AdapterManager();
                    manager.setPatrolLogger(this.modules.patrolLogger);
                    await manager.init(deviceAdapter);
                    window.Core.PlatformAdapterManager = manager;
                }

                // 检查视口适配器类是否存在
                let viewportAdapterClass = null;
                if (deviceAdapter.isIOS && deviceAdapter.isIOS()) {
                    viewportAdapterClass = window.Core?.Platform?.iOSViewportAdapter;
                } else if (deviceAdapter.isAndroid && deviceAdapter.isAndroid()) {
                    viewportAdapterClass = window.Core?.Platform?.AndroidViewportAdapter;
                }

                if (!viewportAdapterClass) {
                    throw new Error('视口适配器类不存在');
                }

                // 重新初始化视口适配器
                await manager.initViewportAdapter();
                
                const viewportAdapter = manager.getViewportAdapter && manager.getViewportAdapter();
                if (viewportAdapter) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_success',
                        level: 'info',
                        action: 'recover_viewport_adapter',
                        message: '视口适配器修复成功'
                    });
                    this.fixAttempts[fixKey] = 0;
                    return true;
                } else {
                    throw new Error('视口适配器初始化后仍为null');
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_failed',
                    level: 'error',
                    action: 'recover_viewport_adapter',
                    details: { error: e && e.message, attempt: this.fixAttempts[fixKey] + 1 },
                    message: '视口适配器修复失败：' + (e && e.message)
                });
                this.fixAttempts[fixKey]++;
                return false;
            }
        }

        async recoverPlatformAdapter() {
            const fixKey = 'platformAdapter';
            
            if (this.fixAttempts[fixKey] >= this.maxFixAttempts) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_skipped',
                    level: 'warning',
                    action: 'recover_platform_adapter',
                    details: { attempts: this.fixAttempts[fixKey] },
                    message: '平台适配器修复已跳过：已达到最大尝试次数'
                });
                return false;
            }

            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'recover_platform_adapter',
                details: { attempt: this.fixAttempts[fixKey] + 1 },
                message: '尝试修复平台适配器'
            });

            try {
                const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
                const platformManager = window.Core && window.Core.PlatformAdapterManager;

                if (!deviceAdapter) {
                    throw new Error('设备适配器不存在');
                }

                // 如果管理器不存在，先创建
                let manager = platformManager;
                if (!manager) {
                    if (!window.Core || !window.Core.Platform || !window.Core.Platform.AdapterManager) {
                        throw new Error('平台适配器管理器类不存在');
                    }
                    manager = new window.Core.Platform.AdapterManager();
                    manager.setPatrolLogger(this.modules.patrolLogger);
                    await manager.init(deviceAdapter);
                    window.Core.PlatformAdapterManager = manager;
                }

                // 检查平台适配器类是否存在
                let platformAdapterClass = null;
                let platformAdapterClassName = '';
                if (deviceAdapter.isIOS && deviceAdapter.isIOS()) {
                    platformAdapterClassName = 'iOSPlatformAdapter';
                    platformAdapterClass = window.Core?.Platform?.iOSPlatformAdapter;
                } else if (deviceAdapter.isAndroid && deviceAdapter.isAndroid()) {
                    platformAdapterClassName = 'AndroidPlatformAdapter';
                    platformAdapterClass = window.Core?.Platform?.AndroidPlatformAdapter;
                }

                // 如果类不存在，这是可选的扩展功能，不报错
                if (!platformAdapterClass) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_skipped',
                        level: 'info',
                        action: 'recover_platform_adapter',
                        details: { className: platformAdapterClassName },
                        message: `平台适配器类${platformAdapterClassName}不存在，这是可选的扩展功能，跳过修复`
                    });
                    return false;
                }

                // 重新初始化平台适配器
                await manager.initPlatformAdapter();
                
                const platformAdapter = manager.getPlatformAdapter && manager.getPlatformAdapter();
                if (platformAdapter) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_success',
                        level: 'info',
                        action: 'recover_platform_adapter',
                        message: '平台适配器修复成功'
                    });
                    this.fixAttempts[fixKey] = 0;
                    return true;
                } else {
                    throw new Error('平台适配器初始化后仍为null');
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_failed',
                    level: 'error',
                    action: 'recover_platform_adapter',
                    details: { error: e && e.message, attempt: this.fixAttempts[fixKey] + 1 },
                    message: '平台适配器修复失败：' + (e && e.message)
                });
                this.fixAttempts[fixKey]++;
                return false;
            }
        }

        async autoFixIssues() {
            // 统一入口，按优先级修复问题
            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'auto_fix_issues',
                message: '开始自动修复检查'
            });

            const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
            const platformManager = window.Core && window.Core.PlatformAdapterManager;
            const platformLoader = window.Core && window.Core.PlatformLoader;
            
            // 1. PlatformLoader 脚本加载（基础）
            if (platformLoader && (!platformLoader.loaded || !(window.Core?.Platform?.AdapterManager))) {
                await this.recoverPlatformLoader();
            }

            // 2. 平台适配器类加载（依赖）
            if (!window.Core || !window.Core.Platform || !window.Core.Platform.AdapterManager) {
                const platform = platformLoader ? platformLoader.getPlatform() : null;
                if (platform === 'ios') {
                    await this.recoverMissingScripts(['js/core/platform/iOSViewportAdapter.js', 'js/core/platform/PlatformAdapterManager.js']);
                } else if (platform === 'android') {
                    await this.recoverMissingScripts(['js/core/platform/AndroidViewportAdapter.js', 'js/core/platform/AndroidOperaKeyboardFix.js', 'js/core/platform/AndroidPlatformAdapter.js', 'js/core/platform/PlatformAdapterManager.js']);
                }
            }

            // 3. 管理器实例初始化（依赖）
            if (!platformManager && deviceAdapter && window.Core?.Platform?.AdapterManager) {
                this.modules.patrolLogger.log({
                    type: 'auto_fix_attempt',
                    level: 'info',
                    action: 'recover_platform_manager',
                    details: { attempt: this.fixAttempts.platformManager + 1 },
                    message: '尝试修复平台适配器管理器实例'
                });

                try {
                    const newManager = new window.Core.Platform.AdapterManager();
                    newManager.setPatrolLogger(this.modules.patrolLogger);
                    await newManager.init(deviceAdapter);
                    window.Core.PlatformAdapterManager = newManager;
                    
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_success',
                        level: 'info',
                        action: 'recover_platform_manager',
                        message: '平台适配器管理器实例修复成功'
                    });
                    this.fixAttempts.platformManager = 0;
                } catch (e) {
                    this.modules.patrolLogger.log({
                        type: 'auto_fix_failed',
                        level: 'error',
                        action: 'recover_platform_manager',
                        details: { error: e && e.message },
                        message: '平台适配器管理器实例修复失败：' + (e && e.message)
                    });
                    this.fixAttempts.platformManager++;
                }
            }

            // 4. 视口适配器初始化（功能）
            if (platformManager || (deviceAdapter && window.Core?.Platform?.AdapterManager)) {
                const currentManager = platformManager || (window.Core && window.Core.PlatformAdapterManager);
                if (currentManager) {
                    const viewportAdapter = currentManager.getViewportAdapter && currentManager.getViewportAdapter();
                    if (!viewportAdapter) {
                        await this.recoverViewportAdapter();
                    }
                }
            }

            // 5. 平台适配器初始化（可选）
            if (platformManager || (deviceAdapter && window.Core?.Platform?.AdapterManager)) {
                const currentManager = platformManager || (window.Core && window.Core.PlatformAdapterManager);
                if (currentManager) {
                    const platformAdapter = currentManager.getPlatformAdapter && currentManager.getPlatformAdapter();
                    if (!platformAdapter) {
                        await this.recoverPlatformAdapter();
                    }
                }
            }

            this.modules.patrolLogger.log({
                type: 'auto_fix_attempt',
                level: 'info',
                action: 'auto_fix_issues',
                message: '自动修复检查完成'
            });
        }

        async checkPlatformAdapterStatus() {
            try {
                // 先检查状态
                const platformManager = window.Core && window.Core.PlatformAdapterManager;
                const hasPlatformManager = !!platformManager;

                let statusBefore = null;
                if (hasPlatformManager) {
                    const viewportAdapter = platformManager.getViewportAdapter && platformManager.getViewportAdapter();
                    const platformAdapter = platformManager.getPlatformAdapter && platformManager.getPlatformAdapter();
                    
                    const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
                    let platformAdapterClassExists = false;
                    let platformAdapterClassName = '';
                    
                    if (deviceAdapter) {
                        if (deviceAdapter.isIOS && deviceAdapter.isIOS()) {
                            platformAdapterClassName = 'iOSPlatformAdapter';
                            platformAdapterClassExists = !!(window.Core?.Platform?.iOSPlatformAdapter);
                        } else if (deviceAdapter.isAndroid && deviceAdapter.isAndroid()) {
                            platformAdapterClassName = 'AndroidPlatformAdapter';
                            platformAdapterClassExists = !!(window.Core?.Platform?.AndroidPlatformAdapter);
                        }
                    }
                    
                    statusBefore = {
                        hasPlatformManager: true,
                        hasViewportAdapter: !!viewportAdapter,
                        hasPlatformAdapter: !!platformAdapter,
                        platformAdapterClassExists: platformAdapterClassExists,
                        platformAdapterClassName: platformAdapterClassName,
                        hasPlatformNamespace: !!(window.Core && window.Core.Platform)
                    };
                } else {
                    const hasAdapterManagerClass = !!(window.Core && window.Core.Platform && window.Core.Platform.AdapterManager);
                    statusBefore = {
                        hasPlatformManager: false,
                        hasAdapterManagerClass: hasAdapterManagerClass,
                        hasPlatformNamespace: !!(window.Core && window.Core.Platform)
                    };
                }

                // 记录检查结果
                let message = '';
                if (statusBefore.hasPlatformManager) {
                    message = `平台适配器状态：视口适配器${statusBefore.hasViewportAdapter ? '已加载' : '未加载'}，平台适配器${statusBefore.hasPlatformAdapter ? '已加载' : '未加载'}`;
                    
                    if (!statusBefore.hasPlatformAdapter) {
                        if (!statusBefore.platformAdapterClassExists) {
                            message += `（${statusBefore.platformAdapterClassName || '平台适配器类'}未找到，这是可选的扩展功能）`;
                        } else {
                            message += '（类存在但未初始化）';
                        }
                    }
                } else {
                    message = statusBefore.hasAdapterManagerClass 
                        ? '平台适配器管理器类已加载，但实例未初始化（可能未在传讯.html中初始化）'
                        : '平台适配器管理器未初始化（类和实例都不存在）';
                }

                this.modules.patrolLogger.log({
                    type: 'patrol_step',
                    level: 'info',
                    action: 'check_platform_adapter',
                    details: { ...statusBefore, beforeFix: true },
                    message: message
                });

                // 尝试自动修复问题
                await this.autoFixIssues();

                // 修复后再次检查状态
                const platformManagerAfter = window.Core && window.Core.PlatformAdapterManager;
                const hasPlatformManagerAfter = !!platformManagerAfter;

                let statusAfter = null;
                if (hasPlatformManagerAfter) {
                    const viewportAdapterAfter = platformManagerAfter.getViewportAdapter && platformManagerAfter.getViewportAdapter();
                    const platformAdapterAfter = platformManagerAfter.getPlatformAdapter && platformManagerAfter.getPlatformAdapter();
                    
                    const deviceAdapter = this.deviceAdapter || (window.Core && window.Core.DeviceAdapterInstance);
                    let platformAdapterClassExistsAfter = false;
                    let platformAdapterClassNameAfter = '';
                    
                    if (deviceAdapter) {
                        if (deviceAdapter.isIOS && deviceAdapter.isIOS()) {
                            platformAdapterClassNameAfter = 'iOSPlatformAdapter';
                            platformAdapterClassExistsAfter = !!(window.Core?.Platform?.iOSPlatformAdapter);
                        } else if (deviceAdapter.isAndroid && deviceAdapter.isAndroid()) {
                            platformAdapterClassNameAfter = 'AndroidPlatformAdapter';
                            platformAdapterClassExistsAfter = !!(window.Core?.Platform?.AndroidPlatformAdapter);
                        }
                    }
                    
                    statusAfter = {
                        hasPlatformManager: true,
                        hasViewportAdapter: !!viewportAdapterAfter,
                        hasPlatformAdapter: !!platformAdapterAfter,
                        platformAdapterClassExists: platformAdapterClassExistsAfter,
                        platformAdapterClassName: platformAdapterClassNameAfter,
                        hasPlatformNamespace: !!(window.Core && window.Core.Platform)
                    };
                } else {
                    const hasAdapterManagerClassAfter = !!(window.Core && window.Core.Platform && window.Core.Platform.AdapterManager);
                    statusAfter = {
                        hasPlatformManager: false,
                        hasAdapterManagerClass: hasAdapterManagerClassAfter,
                        hasPlatformNamespace: !!(window.Core && window.Core.Platform)
                    };
                }

                // 比较修复前后的状态
                const fixed = JSON.stringify(statusBefore) !== JSON.stringify(statusAfter);
                
                if (fixed) {
                    let messageAfter = '';
                    if (statusAfter.hasPlatformManager) {
                        messageAfter = `修复后状态：视口适配器${statusAfter.hasViewportAdapter ? '已加载' : '未加载'}，平台适配器${statusAfter.hasPlatformAdapter ? '已加载' : '未加载'}`;
                    } else {
                        messageAfter = statusAfter.hasAdapterManagerClass 
                            ? '修复后状态：平台适配器管理器类已加载，但实例未初始化'
                            : '修复后状态：平台适配器管理器未初始化';
                    }

                    this.modules.patrolLogger.log({
                        type: 'patrol_step',
                        level: 'info',
                        action: 'check_platform_adapter',
                        details: { 
                            ...statusAfter, 
                            afterFix: true,
                            fixed: true,
                            before: statusBefore,
                            after: statusAfter
                        },
                        message: messageAfter
                    });
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'patrol_step',
                    level: 'warning',
                    action: 'check_platform_adapter',
                    details: { error: e && e.message },
                    message: '检查平台适配器状态时出错：' + (e && e.message)
                });
            }
        }

        startWeeklyCleanup() {
            const runWeeklyCleanup = async () => {
                const now = Date.now();
                if (now - this.lastWeeklyCleanup < WEEKLY_CLEANUP_INTERVAL) return;
                this.lastWeeklyCleanup = now;

                try {
                    if (this.unifiedStorage && typeof this.unifiedStorage.cleanExpiredRoleData === 'function') {
                        await this.unifiedStorage.cleanExpiredRoleData(90);
                    }
                } catch (e) {
                    this.modules.patrolLogger.log({
                        type: 'weekly_cleanup_error',
                        level: 'error',
                        action: 'weekly_cleanup',
                        details: { error: e && e.message },
                        message: '每周清理错误：' + (e && e.message)
                    });
                }
            };

            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => {
                    runWeeklyCleanup();
                    this.weeklyTimer = setInterval(runWeeklyCleanup, WEEKLY_CLEANUP_INTERVAL);
                }, { timeout: 10000 });
            } else {
                setTimeout(() => {
                    runWeeklyCleanup();
                    this.weeklyTimer = setInterval(runWeeklyCleanup, WEEKLY_CLEANUP_INTERVAL);
                }, 5000);
            }
        }

        setDeviceAdapter(adapter) {
            const previousState = this.stateSnapshot.hasDeviceAdapter;
            this.deviceAdapter = adapter;
            if (adapter && typeof adapter.setPatrolLogger === 'function') {
                adapter.setPatrolLogger(this.modules.patrolLogger);
            }
            
            // 更新状态快照
            if (this.isRunning) {
                const newState = this.captureStateSnapshot();
                if (previousState !== newState.hasDeviceAdapter) {
                    this.modules.patrolLogger.log({
                        type: 'state_change',
                        level: 'info',
                        action: 'device_adapter_set',
                        details: {
                            previous: previousState,
                            current: newState.hasDeviceAdapter
                        },
                        message: `设备适配器${newState.hasDeviceAdapter ? '已设置' : '已移除'}`
                    });
                }
                this.stateSnapshot = newState;
            }
        }

        async checkPerformanceIssues() {
            if (!this.performanceMonitor) return;

            try {
                const stats = this.performanceMonitor.getStats();
                
                // 检查长任务
                if (stats.longTask && stats.longTask.longTaskCount > 0) {
                    this.modules.patrolLogger.log({
                        type: 'performance_anomaly',
                        level: 'warning',
                        action: 'check_performance',
                        details: stats.longTask,
                        message: `检测到${stats.longTask.longTaskCount}个长任务（平均${stats.longTask.avgDuration.toFixed(2)}ms）`
                    });
                }
                
                // 检查低帧率
                if (stats.frameRate && stats.frameRate.avgFps < 30) {
                    this.modules.patrolLogger.log({
                        type: 'performance_anomaly',
                        level: 'warning',
                        action: 'check_performance',
                        details: { 
                            avgFps: stats.frameRate.avgFps,
                            minFps: stats.frameRate.minFps,
                            lowFpsCount: stats.frameRate.lowFpsCount
                        },
                        message: `帧率过低：平均${stats.frameRate.avgFps} FPS，最低${stats.frameRate.minFps} FPS`
                    });
                }

                // 检查大规模布局偏移
                if (stats.layoutShift && stats.layoutShift.largeShiftCount > 0) {
                    this.modules.patrolLogger.log({
                        type: 'performance_anomaly',
                        level: 'warning',
                        action: 'check_performance',
                        details: {
                            clsValue: stats.layoutShift.clsValue,
                            largeShiftCount: stats.layoutShift.largeShiftCount,
                            shiftCount: stats.layoutShift.shiftCount
                        },
                        message: `检测到大规模布局偏移：CLS=${stats.layoutShift.clsValue.toFixed(3)}，${stats.layoutShift.largeShiftCount}次大规模偏移`
                    });
                }

                // 检查高CLS值
                if (stats.layoutShift && stats.layoutShift.clsValue > 0.25) {
                    this.modules.patrolLogger.log({
                        type: 'performance_high_cls',
                        level: 'warning',
                        action: 'check_performance',
                        details: { clsValue: stats.layoutShift.clsValue },
                        message: `累积布局偏移过高：CLS=${stats.layoutShift.clsValue.toFixed(3)}（>0.25）`
                    });
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'patrol_step',
                    level: 'warning',
                    action: 'check_performance',
                    details: { error: e && e.message },
                    message: '检查性能异常时出错：' + (e && e.message)
                });
            }
        }

        async checkVisualIssues() {
            if (!this.visualAnomalyDetector) return;

            try {
                const stats = this.visualAnomalyDetector.getStats();
                
                if (stats.flicker && stats.flicker.flickerDetected) {
                    this.modules.patrolLogger.log({
                        type: 'visual_anomaly',
                        level: 'warning',
                        action: 'check_visual',
                        details: stats.flicker,
                        message: `检测到闪屏现象：共${stats.flicker.flickerCount}次`
                    });
                }
                
                if (stats.blackScreen && stats.blackScreen.blackScreenDetected) {
                    this.modules.patrolLogger.log({
                        type: 'visual_anomaly',
                        level: 'error',
                        action: 'check_visual',
                        details: stats.blackScreen,
                        message: `检测到黑屏现象：共${stats.blackScreen.blackScreenCount}次，距离上次活动${(stats.blackScreen.timeSinceLastActivity/1000).toFixed(1)}秒`
                    });
                }
                
                // 检查短暂黑屏（键盘起落导致的闪黑）
                if (stats.blackScreen && stats.blackScreen.briefBlackScreenDetected) {
                    this.modules.patrolLogger.log({
                        type: 'visual_anomaly',
                        level: 'warning',
                        action: 'check_visual',
                        details: stats.blackScreen,
                        message: `检测到短暂黑屏现象：共${stats.blackScreen.briefBlackScreenCount}次（可能是键盘起落导致的闪黑）`
                    });
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'patrol_step',
                    level: 'warning',
                    action: 'check_visual',
                    details: { error: e && e.message },
                    message: '检查视觉异常时出错：' + (e && e.message)
                });
            }
        }

        async checkStorageIssues() {
            if (!this.capacityMonitor) return;

            try {
                // 检查存储失败统计
                if (typeof this.capacityMonitor.getFailureStats === 'function') {
                    const failureStats = this.capacityMonitor.getFailureStats();
                    
                    if (failureStats.failureRate > 5) {
                        this.modules.patrolLogger.log({
                            type: 'storage_anomaly',
                            level: 'error',
                            action: 'check_storage',
                            details: failureStats,
                            message: `localStorage写入失败率过高：${failureStats.failureRate}% (${failureStats.failureCount}/${failureStats.writeAttempts})`
                        });
                    } else if (failureStats.failureCount > 0) {
                        // 即使失败率不高，如果有失败也记录
                        this.modules.patrolLogger.log({
                            type: 'storage_anomaly',
                            level: 'info',
                            action: 'check_storage',
                            details: failureStats,
                            message: `localStorage写入失败：${failureStats.failureCount}次，失败率${failureStats.failureRate}%`
                        });
                    }
                }
            } catch (e) {
                this.modules.patrolLogger.log({
                    type: 'patrol_step',
                    level: 'warning',
                    action: 'check_storage',
                    details: { error: e && e.message },
                    message: '检查存储失败时出错：' + (e && e.message)
                });
            }
        }
    }

    const patrolService = new PatrolService();
    window.Core = window.Core || {};
    window.Core.PatrolService = patrolService;
    window.Core.PatrolLogger = PatrolLogger;
})(window);
