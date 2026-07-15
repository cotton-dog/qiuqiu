/**
 * AI补丁生成器（AIPatchGenerator）
 * 负责AI驱动的运行时补丁生成、应用、回滚和管理
 */
(function(window) {
    'use strict';

    // 项目代码文件索引
    const CODE_FILE_INDEX = {
        'PatrolService': {
            path: 'js/core/PatrolService.js',
            keywords: ['PatrolService', 'PatrolLogger', '巡查', 'patrol', 'checkPlatformAdapter'],
            dependencies: ['ErrorLogService', 'DeviceAdapter', 'PlatformLoader'],
            size: 'large'
        },
        'PlatformAdapterManager': {
            path: 'js/core/platform/PlatformAdapterManager.js',
            keywords: ['PlatformAdapter', '平台适配器', 'viewport', 'AdapterManager'],
            dependencies: ['PlatformLoader'],
            size: 'medium'
        },
        'PlatformLoader': {
            path: 'js/core/PlatformLoader.js',
            keywords: ['PlatformLoader', '平台加载', 'loadPlatformResources'],
            dependencies: [],
            size: 'medium'
        },
        'StorageService': {
            path: 'js/core/StorageService.js',
            keywords: ['StorageService', '存储', 'localStorage', 'IndexedDB'],
            dependencies: [],
            size: 'large'
        },
        'ErrorLogService': {
            path: 'js/core/ErrorLogService.js',
            keywords: ['ErrorLogService', '错误日志', 'error', 'log'],
            dependencies: [],
            size: 'medium'
        },
        'DeviceAdapter': {
            path: 'js/core/DeviceAdapter.js',
            keywords: ['DeviceAdapter', '设备适配', 'device', 'platform'],
            dependencies: [],
            size: 'medium'
        },
        'CapacityMonitor': {
            path: 'js/core/CapacityMonitor.js',
            keywords: ['CapacityMonitor', '容量监控', 'quota', 'storage'],
            dependencies: ['StorageService'],
            size: 'medium'
        },
        'PerformanceMonitor': {
            path: 'js/core/PerformanceMonitor.js',
            keywords: ['PerformanceMonitor', '性能监控', 'performance', 'fps'],
            dependencies: [],
            size: 'medium'
        },
        'VisualAnomalyDetector': {
            path: 'js/core/VisualAnomalyDetector.js',
            keywords: ['VisualAnomalyDetector', '视觉异常', 'flicker', 'blackScreen'],
            dependencies: [],
            size: 'medium'
        },
        'MessageBus': {
            path: 'js/core/MessageBus.js',
            keywords: ['MessageBus', '消息总线', 'event', 'message'],
            dependencies: [],
            size: 'medium'
        }
    };

    const REFRESH_THRESHOLD = 5; // 5次刷新
    const TIME_WINDOW = 60000; // 1分钟内
    const RECENT_PATCH_WINDOW = 300000; // 5分钟内应用的补丁
    const MAX_PATCHES = 50; // 最多保存50个补丁

    class AIPatchGenerator {
        constructor() {
            this.dbName = 'AIPatchDB';
            this.dbVersion = 1;
            this.storageService = null;
            this.patrolLogger = null;
            this.aiService = null;
            this._initDone = false;
        }

        async init() {
            if (this._initDone) return;
            
            this.storageService = window.Core && window.Core.StorageService;
            if (!this.storageService) {
                console.warn('[AIPatchGenerator] StorageService not available');
                return;
            }

            try {
                await this._initIndexedDB();
                this._initDone = true;
                
                // 页面加载时检查刷新模式并重新应用补丁
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        this._monitorPageRefresh();
                        this.reapplyAllPatches().catch(e => {
                            console.error('[AIPatchGenerator] Failed to reapply patches:', e);
                        });
                    });
                } else {
                    this._monitorPageRefresh();
                    this.reapplyAllPatches().catch(e => {
                        console.error('[AIPatchGenerator] Failed to reapply patches:', e);
                    });
                }
            } catch (e) {
                console.error('[AIPatchGenerator] Init failed:', e);
            }
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        setAIService(service) {
            this.aiService = service;
        }

        async _initIndexedDB() {
            if (!this.storageService) throw new Error('StorageService not available');
            
            return this.storageService.openDB(this.dbName, this.dbVersion, (db) => {
                if (!db.objectStoreNames.contains('patches')) {
                    const store = db.createObjectStore('patches', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('appliedAt', 'appliedAt', { unique: false });
                }
            });
        }

        _generatePatchId() {
            return 'patch_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        }

        _generateHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(36);
        }

        _isDangerousCode(code) {
            const dangerousPatterns = [
                /localStorage\.clear/,
                /sessionStorage\.clear/,
                /window\.location\s*=/,
                /document\.cookie\s*=/,
                /XMLHttpRequest/,
                /import\s*\(/,
                /require\s*\(/
            ];
            
            // 注意：eval和Function是补丁应用必需的，不在这里禁止
            // 但会在应用时进行安全检查
            
            return dangerousPatterns.some(pattern => pattern.test(code));
        }

        async _validatePatchBeforeApply(patchCode, metadata) {
            // 1. 检查代码格式
            if (!patchCode || typeof patchCode !== 'string') {
                return { valid: false, reason: '补丁代码格式无效' };
            }

            // 2. 检查是否包含危险操作
            if (this._isDangerousCode(patchCode)) {
                return { valid: false, reason: '补丁包含危险操作' };
            }

            // 3. 检查是否返回rollback函数
            if (!patchCode.includes('rollback')) {
                return { valid: false, reason: '补丁必须提供rollback函数' };
            }

            return { valid: true };
        }

        async _checkPatchHealth(patchResult, metadata) {
            try {
                // 1. 检查目标对象是否仍然可用
                if (metadata && metadata.target) {
                    const targetParts = metadata.target.split('.');
                    let obj = window;
                    for (const part of targetParts) {
                        if (obj[part] === undefined) {
                            return { healthy: false, reason: `目标对象 ${metadata.target} 不存在` };
                        }
                        obj = obj[part];
                    }
                }

                // 2. 检查rollback函数是否存在
                if (!patchResult || typeof patchResult.rollback !== 'function') {
                    return { healthy: false, reason: 'rollback函数无效' };
                }

                return { healthy: true };
            } catch (e) {
                return { healthy: false, reason: e.message };
            }
        }

        async applyPatch(patchCode, metadata) {
            try {
                // 1. 补丁应用前的安全验证
                const validation = await this._validatePatchBeforeApply(patchCode, metadata);
                if (!validation.valid) {
                    throw new Error(`补丁验证失败: ${validation.reason}`);
                }

                // 2. 代码安全检查
                if (this._isDangerousCode(patchCode)) {
                    throw new Error('补丁包含危险操作');
                }

                // 3. 在try-catch中执行补丁代码
                let result;
                try {
                    result = eval(`(${patchCode})()`);
                } catch (e) {
                    throw new Error(`补丁执行失败: ${e.message}`);
                }

                // 4. 补丁应用后的健康检查
                const healthCheck = await this._checkPatchHealth(result, metadata);
                if (!healthCheck.healthy) {
                    // 健康检查失败，立即回滚
                    if (result && result.rollback) {
                        try {
                            result.rollback();
                        } catch (rollbackError) {
                            console.error('[AIPatch] 回滚失败:', rollbackError);
                        }
                    }
                    throw new Error(`补丁健康检查失败: ${healthCheck.reason}`);
                }

                // 5. 生成补丁hash
                const patchHash = this._generateHash(patchCode);

                // 6. 保存补丁到IndexedDB
                const patchId = this._generatePatchId();
                const patch = {
                    id: patchId,
                    hash: patchHash,
                    code: patchCode,
                    problem: metadata.problem || '',
                    target: metadata.target || '',
                    type: metadata.type || 'function_replacement',
                    status: 'applied',
                    timestamp: Date.now(),
                    appliedAt: Date.now(),
                    rollbackInfo: result.rollback ? this._serializeRollback(result.rollback) : null,
                    healthCheck: healthCheck
                };

                await this._savePatchToIndexedDB(patch);

                // 7. 记录补丁应用时间（用于刷新检测）
                this._recordPatchApplication(patchId);

                // 8. 设置监控机制
                this._setupPatchMonitoring(patchId);

                await this._cleanupOldPatches();

                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'ai_patch_applied',
                        level: 'info',
                        action: 'apply_patch',
                        details: { patchId, target: metadata.target },
                        message: `AI补丁已应用: ${patchId}`
                    });
                }

                return { success: true, patchId };
            } catch (e) {
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, {
                        source: 'AIPatchGenerator.applyPatch',
                        extra: { metadata }
                    });
                }
                return { success: false, error: e.message };
            }
        }

        _serializeRollback(rollbackFn) {
            // 注意：函数无法完全序列化，这里只保存元数据
            // 实际回滚需要重新执行补丁代码来获取rollback函数
            return {
                type: 'function',
                note: 'rollback函数无法序列化，需要重新执行补丁代码获取'
            };
        }

        async _savePatchToIndexedDB(patch) {
            if (!this.storageService) throw new Error('StorageService not available');
            
            return this.storageService.transaction(this.dbName, ['patches'], async (tx) => {
                const store = tx.objectStore('patches');
                return this._req(store.put(patch));
            });
        }

        _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        _cursorCollect(indexOrStore, keyRange, direction) {
            return new Promise((resolve, reject) => {
                const results = [];
                const req = indexOrStore.openCursor(keyRange, direction);
                req.onsuccess = () => {
                    const c = req.result;
                    if (!c) {
                        resolve(results);
                        return;
                    }
                    results.push(c.value);
                    c.continue();
                };
                req.onerror = () => reject(req.error);
            });
        }

        async _loadPatchesFromIndexedDB() {
            if (!this.storageService) return [];
            
            try {
                return this.storageService.transaction(this.dbName, ['patches'], async (tx) => {
                    const store = tx.objectStore('patches');
                    const index = store.index('timestamp');
                    return this._cursorCollect(index, null, 'prev');
                });
            } catch (e) {
                console.error('[AIPatchGenerator] Failed to load patches:', e);
                return [];
            }
        }

        async _cleanupOldPatches() {
            const patches = await this._loadPatchesFromIndexedDB();
            
            // 1. 限制数量上限
            if (patches.length > MAX_PATCHES) {
                const toDelete = patches.slice(MAX_PATCHES);
                for (const patch of toDelete) {
                    await this._deletePatch(patch.id);
                }
            }

            // 2. 清理失败的补丁（7天后）
            const now = Date.now();
            const failedPatches = patches.filter(p => 
                p.status === 'failed' && (now - p.timestamp) > 7 * 24 * 60 * 60 * 1000
            );
            for (const patch of failedPatches) {
                await this._deletePatch(patch.id);
            }

            // 3. 清理已回滚的补丁（30天后）
            const rolledBackPatches = patches.filter(p => 
                (p.status === 'rolled_back' || p.status === 'rolled_back_crash') && 
                (now - (p.rollbackAt || p.timestamp)) > 30 * 24 * 60 * 60 * 1000
            );
            for (const patch of rolledBackPatches) {
                await this._deletePatch(patch.id);
            }
        }

        async _deletePatch(patchId) {
            if (!this.storageService) return;
            
            try {
                return this.storageService.transaction(this.dbName, ['patches'], async (tx) => {
                    const store = tx.objectStore('patches');
                    return this._req(store.delete(patchId));
                });
            } catch (e) {
                console.error('[AIPatchGenerator] Failed to delete patch:', patchId, e);
            }
        }

        _recordPatchApplication(patchId) {
            try {
                const key = 'aipatch_recent_applications';
                let recent = [];
                try {
                    const stored = sessionStorage.getItem(key);
                    if (stored) recent = JSON.parse(stored);
                } catch (e) {}
                
                recent.push({ patchId, timestamp: Date.now() });
                // 只保留最近5分钟内的记录
                const now = Date.now();
                recent = recent.filter(r => now - r.timestamp < RECENT_PATCH_WINDOW);
                
                sessionStorage.setItem(key, JSON.stringify(recent));
            } catch (e) {
                console.warn('[AIPatchGenerator] Failed to record patch application:', e);
            }
        }

        async _getRecentPatches(windowMs) {
            const patches = await this._loadPatchesFromIndexedDB();
            const now = Date.now();
            return patches.filter(p => 
                p.status === 'applied' && 
                (now - (p.appliedAt || p.timestamp)) < (windowMs || RECENT_PATCH_WINDOW)
            );
        }

        _getRefreshHistory() {
            try {
                const stored = sessionStorage.getItem('aipatch_refresh_history');
                if (stored) {
                    const history = JSON.parse(stored);
                    const now = Date.now();
                    return history.filter(t => now - t < TIME_WINDOW);
                }
            } catch (e) {}
            return [];
        }

        _monitorPageRefresh() {
            const refreshHistoryKey = 'aipatch_refresh_history';
            
            // 获取刷新历史
            let refreshHistory = [];
            try {
                const stored = sessionStorage.getItem(refreshHistoryKey);
                if (stored) refreshHistory = JSON.parse(stored);
            } catch (e) {}
            
            // 添加当前刷新时间
            refreshHistory.push(Date.now());
            
            // 只保留最近1分钟内的刷新记录
            const now = Date.now();
            refreshHistory = refreshHistory.filter(t => now - t < TIME_WINDOW);
            
            // 保存刷新历史
            try {
                sessionStorage.setItem(refreshHistoryKey, JSON.stringify(refreshHistory));
            } catch (e) {}
            
            // 检查是否达到阈值
            if (refreshHistory.length >= REFRESH_THRESHOLD) {
                // 检查是否有最近应用的补丁
                this._getRecentPatches(RECENT_PATCH_WINDOW).then(recentPatches => {
                    if (recentPatches.length > 0) {
                        console.warn('[AIPatch] 检测到异常刷新模式，自动回滚最近补丁');
                        this._autoRollbackOnCrash(recentPatches);
                    }
                }).catch(e => {
                    console.error('[AIPatch] Failed to check recent patches:', e);
                });
            }
        }

        async _autoRollbackOnCrash(patches) {
            for (const patch of patches) {
                try {
                    await this.rollbackPatch(patch.id);
                    // 标记为已回滚（崩溃导致）
                    patch.status = 'rolled_back_crash';
                    patch.rollbackReason = '检测到异常刷新模式，自动回滚';
                    patch.rollbackAt = Date.now();
                    await this._savePatchToIndexedDB(patch);
                } catch (e) {
                    console.error('[AIPatch] 自动回滚失败:', patch.id, e);
                }
            }
            
            // 清除刷新历史，避免重复触发
            try {
                sessionStorage.removeItem('aipatch_refresh_history');
            } catch (e) {}
        }

        _setupPatchMonitoring(patchId) {
            // 设置补丁监控机制
            // 可以在这里添加错误监听器等
        }

        async rollbackPatch(patchId) {
            try {
                const patches = await this._loadPatchesFromIndexedDB();
                const patch = patches.find(p => p.id === patchId);
                
                if (!patch) {
                    throw new Error('补丁不存在');
                }

                if (patch.status !== 'applied') {
                    throw new Error('补丁未应用，无法回滚');
                }

                // 重新执行补丁代码获取rollback函数
                if (patch.code) {
                    try {
                        const result = eval(`(${patch.code})()`);
                        if (result && result.rollback) {
                            result.rollback();
                        }
                    } catch (e) {
                        console.warn('[AIPatch] 回滚执行失败:', e);
                    }
                }

                // 更新补丁状态
                patch.status = 'rolled_back';
                patch.rollbackAt = Date.now();
                patch.rollbackReason = '用户手动回滚';
                await this._savePatchToIndexedDB(patch);

                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'ai_patch_rolled_back',
                        level: 'info',
                        action: 'rollback_patch',
                        details: { patchId },
                        message: `AI补丁已回滚: ${patchId}`
                    });
                }

                return { success: true };
            } catch (e) {
                console.error('[AIPatchGenerator] Rollback failed:', e);
                return { success: false, error: e.message };
            }
        }

        async rollbackAllPatches() {
            const patches = await this._loadPatchesFromIndexedDB();
            const appliedPatches = patches.filter(p => p.status === 'applied');
            
            for (const patch of appliedPatches) {
                await this.rollbackPatch(patch.id);
            }
            
            return { success: true, count: appliedPatches.length };
        }

        async getPatchHistory() {
            return await this._loadPatchesFromIndexedDB();
        }

        async reapplyAllPatches() {
            // 1. 先检查刷新模式
            this._monitorPageRefresh();
            
            // 2. 加载所有已应用的补丁
            const patches = await this._loadPatchesFromIndexedDB();
            const appliedPatches = patches.filter(p => p.status === 'applied');
            
            // 3. 如果有最近应用的补丁且刷新次数过多，先回滚
            const recentPatches = await this._getRecentPatches(RECENT_PATCH_WINDOW);
            if (recentPatches.length > 0) {
                const refreshHistory = this._getRefreshHistory();
                if (refreshHistory.length >= REFRESH_THRESHOLD) {
                    console.warn('[AIPatch] 检测到异常刷新，跳过补丁重新应用');
                    await this._autoRollbackOnCrash(recentPatches);
                    return;
                }
            }
            
            // 4. 正常重新应用补丁
            for (const patch of appliedPatches) {
                try {
                    if (patch.code) {
                        const result = eval(`(${patch.code})()`);
                        // 验证补丁是否仍然有效
                        const healthCheck = await this._checkPatchHealth(result, {
                            target: patch.target,
                            type: patch.type
                        });
                        if (!healthCheck.healthy) {
                            console.warn('[AIPatch] 补丁健康检查失败，跳过:', patch.id);
                            // 标记为失败
                            patch.status = 'failed';
                            patch.failureReason = healthCheck.reason;
                            await this._savePatchToIndexedDB(patch);
                            continue;
                        }
                    }
                } catch (e) {
                    console.error('[AIPatch] 重新应用补丁失败:', patch.id, e);
                    // 标记为失败
                    patch.status = 'failed';
                    patch.failureReason = e.message;
                    await this._savePatchToIndexedDB(patch);
                }
            }
        }

        async processAnomaly(anomalyLog) {
            // 这个方法用于处理异常日志并生成补丁
            // 需要AI服务支持
            if (!this.aiService) {
                return { success: false, error: 'AI服务未配置' };
            }

            // 这里可以调用AI生成补丁代码
            // 暂时返回占位符
            return { success: false, error: 'processAnomaly需要AI服务支持' };
        }

        // 代码文件相关方法
        detectRelevantFiles(userProblem, logs) {
            const detected = new Set();
            const problemKeywords = this._extractKeywords(userProblem);
            
            // 1. 从日志中检测
            if (logs && Array.isArray(logs)) {
                logs.forEach(log => {
                    const source = log.source || log.message || '';
                    Object.keys(CODE_FILE_INDEX).forEach(key => {
                        const index = CODE_FILE_INDEX[key];
                        if (source.includes(key) || index.keywords.some(k => source.includes(k))) {
                            detected.add(index.path);
                        }
                    });
                });
            }
            
            // 2. 从问题描述中检测
            Object.keys(CODE_FILE_INDEX).forEach(key => {
                const index = CODE_FILE_INDEX[key];
                if (index.keywords.some(k => problemKeywords.includes(k))) {
                    detected.add(index.path);
                }
            });
            
            // 3. 依赖关系扩展
            const expanded = new Set(detected);
            detected.forEach(path => {
                const fileInfo = Object.values(CODE_FILE_INDEX).find(f => f.path === path);
                if (fileInfo && fileInfo.dependencies) {
                    fileInfo.dependencies.forEach(dep => {
                        const depFile = Object.values(CODE_FILE_INDEX).find(f => 
                            f.path.includes(dep) || f.keywords.includes(dep)
                        );
                        if (depFile) expanded.add(depFile.path);
                    });
                }
            });
            
            return Array.from(expanded);
        }

        _extractKeywords(text) {
            if (!text) return [];
            const words = text.toLowerCase().split(/\s+/);
            return words.filter(w => w.length > 2);
        }

        async fetchCodeFile(filePath) {
            try {
                const response = await fetch(filePath, { 
                    cache: 'no-cache'
                });
                if (response.ok) {
                    return await response.text();
                } else {
                    console.warn('[AIPatch] Failed to fetch:', filePath, response.status);
                }
            } catch (e) {
                console.warn('[AIPatch] Failed to fetch code file:', filePath, e);
            }
            return null;
        }
    }

    // 创建全局实例
    const generator = new AIPatchGenerator();
    
    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            generator.init();
        });
    } else {
        generator.init();
    }

    window.Core = window.Core || {};
    window.Core.AIPatchGenerator = generator;

})(window);
