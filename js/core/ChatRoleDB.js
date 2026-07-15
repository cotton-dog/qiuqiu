/**
 * ChatRoleDB + UnifiedStorageService（角色分离存储 P1）
 * 使用 StorageService.openDB/transaction，写入前做 Quota 检查。
 */
(function(window) {
    'use strict';

    const DB_NAME = 'ChatRoleDB';
    const DB_VERSION = 1;

    function _req(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /** 游标遍历收集所有 value */
    function _cursorCollect(store, keyRange) {
        return new Promise((resolve, reject) => {
            const results = [];
            const req = store.openCursor(keyRange);
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

    /** 游标遍历按前缀删除 */
    function _cursorDeleteByPrefix(store, prefix) {
        const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
        return new Promise((resolve, reject) => {
            const req = store.openCursor(range);
            req.onsuccess = () => {
                const c = req.result;
                if (!c) {
                    resolve();
                    return;
                }
                c.delete();
                c.continue();
            };
            req.onerror = () => reject(req.error);
        });
    }

    class ChatRoleDB {
        constructor() {
            this.dbName = DB_NAME;
            this.version = DB_VERSION;
            this._storage = null;
        }

        _storageService() {
            return window.Core && window.Core.StorageService;
        }

        async _checkQuota() {
            const svc = this._storageService();
            if (!svc || typeof svc.getQuotaStatus !== 'function') return true;
            const status = await svc.getQuotaStatus();
            if (status.allowed) return true;
            if (window.Core && window.Core.ErrorLogService) {
                window.Core.ErrorLogService.log(new Error('Storage quota exceeded'), {
                    source: 'ChatRoleDB.quota',
                    extra: status
                });
            }
            return false;
        }

        async init() {
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            return storage.openDB(this.dbName, this.version, (db) => {
                if (!db.objectStoreNames.contains('roleMeta')) {
                    const s = db.createObjectStore('roleMeta', { keyPath: 'key' });
                    s.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains('roleMessages')) {
                    const s = db.createObjectStore('roleMessages', { keyPath: 'id' });
                    s.createIndex('roleId', 'roleId', { unique: false });
                    s.createIndex('weight', 'weight', { unique: false });
                    s.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains('roleDialogues')) {
                    const s = db.createObjectStore('roleDialogues', { keyPath: 'id' });
                    s.createIndex('roleId', 'roleId', { unique: false });
                    s.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains('roleSettings')) {
                    db.createObjectStore('roleSettings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('migrationLog')) {
                    const s = db.createObjectStore('migrationLog', { keyPath: 'id' });
                    s.createIndex('status', 'status', { unique: false });
                }
            });
        }

        async getRole(roleId) {
            const storage = this._storageService();
            if (!storage) return null;
            return storage.transaction(this.dbName, ['roleMeta'], async (tx) => {
                const store = tx.objectStore('roleMeta');
                const res = await _req(store.get('role:' + roleId));
                return res ? res.value : null;
            });
        }

        async saveRole(roleId, meta) {
            if (!(await this._checkQuota())) throw new Error('Storage quota exceeded');
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            return storage.transaction(this.dbName, ['roleMeta'], async (tx) => {
                const store = tx.objectStore('roleMeta');
                await _req(store.put({
                    key: 'role:' + roleId,
                    value: meta,
                    timestamp: Date.now()
                }));
            });
        }

        async addMessage(roleId, message) {
            if (!(await this._checkQuota())) throw new Error('Storage quota exceeded');
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const msgId = message.id || _generateId();
            await storage.transaction(this.dbName, ['roleMessages'], async (tx) => {
                const store = tx.objectStore('roleMessages');
                await _req(store.put({
                    id: 'msg:' + roleId + ':' + msgId,
                    roleId: roleId,
                    value: message,
                    timestamp: Date.now(),
                    weight: message.weight != null ? message.weight : 1
                }));
            });
            return msgId;
        }

        async getMessages(roleId, limit) {
            const cap = typeof limit === 'number' && limit > 0 ? limit : 100;
            const storage = this._storageService();
            if (!storage) return [];
            return storage.transaction(this.dbName, ['roleMessages'], async (tx) => {
                const store = tx.objectStore('roleMessages');
                const index = store.index('roleId');
                const list = await _req(index.getAll(IDBKeyRange.only(roleId)));
                return list
                    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
                    .slice(0, cap)
                    .map(function(r) { return r.value; });
            });
        }

        async saveDialogue(roleId, dialogue) {
            if (!(await this._checkQuota())) throw new Error('Storage quota exceeded');
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const dlgId = dialogue.id || _generateId();
            await storage.transaction(this.dbName, ['roleDialogues'], async (tx) => {
                const store = tx.objectStore('roleDialogues');
                await _req(store.put({
                    id: 'dlg:' + roleId + ':' + dlgId,
                    roleId: roleId,
                    value: dialogue,
                    timestamp: Date.now()
                }));
            });
            return dlgId;
        }

        async getDialogues(roleId) {
            const storage = this._storageService();
            if (!storage) return [];
            return storage.transaction(this.dbName, ['roleDialogues'], async (tx) => {
                const store = tx.objectStore('roleDialogues');
                const index = store.index('roleId');
                const list = await _req(index.getAll(IDBKeyRange.only(roleId)));
                return list.map(function(r) { return r.value; });
            });
        }

        async getSetting(roleId, settingKey) {
            const storage = this._storageService();
            if (!storage) return null;
            return storage.transaction(this.dbName, ['roleSettings'], async (tx) => {
                const store = tx.objectStore('roleSettings');
                const res = await _req(store.get('setting:' + roleId + ':' + settingKey));
                return res != null ? res.value : null;
            });
        }

        async setSetting(roleId, settingKey, value) {
            if (!(await this._checkQuota())) throw new Error('Storage quota exceeded');
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            return storage.transaction(this.dbName, ['roleSettings'], async (tx) => {
                const store = tx.objectStore('roleSettings');
                await _req(store.put({
                    key: 'setting:' + roleId + ':' + settingKey,
                    value: value,
                    timestamp: Date.now()
                }));
            });
        }

        async deleteRole(roleId) {
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const prefixMsg = 'msg:' + roleId + ':';
            const prefixDlg = 'dlg:' + roleId + ':';
            const prefixSetting = 'setting:' + roleId + ':';
            return storage.transaction(this.dbName, ['roleMeta', 'roleMessages', 'roleDialogues', 'roleSettings'], async (tx) => {
                await _cursorDeleteByPrefix(tx.objectStore('roleMessages'), prefixMsg);
                await _cursorDeleteByPrefix(tx.objectStore('roleDialogues'), prefixDlg);
                await _cursorDeleteByPrefix(tx.objectStore('roleSettings'), prefixSetting);
                const metaStore = tx.objectStore('roleMeta');
                await _req(metaStore.delete('role:' + roleId));
            });
        }

        async exportRole(roleId) {
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const role = await this.getRole(roleId);
            const messages = await this.getMessages(roleId, Infinity);
            const dialogues = await this.getDialogues(roleId);
            const settingsList = await storage.transaction(this.dbName, ['roleSettings'], async (tx) => {
                const store = tx.objectStore('roleSettings');
                const range = IDBKeyRange.bound('setting:' + roleId + ':', 'setting:' + roleId + ':\uffff');
                return _cursorCollect(store, range);
            });
            const settings = {};
            const prefix = 'setting:' + roleId + ':';
            settingsList.forEach(function(r) {
                if (r && r.key && r.key.indexOf(prefix) === 0) {
                    settings[r.key.slice(prefix.length)] = r.value;
                }
            });
            return { meta: role, messages: messages, dialogues: dialogues, settings: settings };
        }

        async importRole(roleId, data) {
            if (!(await this._checkQuota())) throw new Error('Storage quota exceeded');
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const stores = ['roleMeta', 'roleMessages', 'roleDialogues', 'roleSettings'];
            if (data.meta) {
                await this.saveRole(roleId, data.meta);
            }
            if (data.messages && data.messages.length) {
                for (let i = 0; i < data.messages.length; i++) {
                    await this.addMessage(roleId, data.messages[i]);
                }
            }
            if (data.dialogues && data.dialogues.length) {
                for (let j = 0; j < data.dialogues.length; j++) {
                    await this.saveDialogue(roleId, data.dialogues[j]);
                }
            }
            if (data.settings && typeof data.settings === 'object') {
                for (const k in data.settings) {
                    if (Object.prototype.hasOwnProperty.call(data.settings, k)) {
                        await this.setSetting(roleId, k, data.settings[k]);
                    }
                }
            }
        }

        async saveMigrationLog(migration) {
            const storage = this._storageService();
            if (!storage) throw new Error('StorageService not available');
            const logEntry = {
                id: migration.id || _generateId(),
                roleId: migration.roleId || null,
                status: migration.status || 'pending',
                source: migration.source || 'localStorage',
                target: migration.target || 'ChatRoleDB',
                records: migration.records || 0,
                errors: migration.errors || [],
                warnings: migration.warnings || [],
                timestamp: migration.timestamp || Date.now(),
                startTime: migration.startTime || null,
                endTime: migration.endTime || null,
                duration: migration.duration || null,
                steps: migration.steps || [],
                shadowBackup: migration.shadowBackup || null
            };
            return storage.transaction(this.dbName, ['migrationLog'], async (tx) => {
                const store = tx.objectStore('migrationLog');
                await _req(store.put(logEntry));
            });
        }

        async getMigrationLogs(limit) {
            const cap = typeof limit === 'number' && limit > 0 ? limit : 100;
            const storage = this._storageService();
            if (!storage) return [];
            return storage.transaction(this.dbName, ['migrationLog'], async (tx) => {
                const store = tx.objectStore('migrationLog');
                const index = store.index('status');
                const all = await _cursorCollect(store);
                return all
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                    .slice(0, cap);
            });
        }
    }

    class UnifiedStorageService {
        constructor() {
            this.chatRoleDB = new ChatRoleDB();
            this.storageService = window.Core && window.Core.StorageService;
            this._initDone = null;
            this.patrolLogger = null;
        }

        async init() {
            if (this._initDone !== null) return this._initDone;
            try {
                await this.chatRoleDB.init();
                this._initDone = { success: true };
                return this._initDone;
            } catch (e) {
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, { source: 'UnifiedStorageService.init', extra: {} });
                }
                this._initDone = { success: false, error: e.message };
                return this._initDone;
            }
        }

        async getRoleData(roleId) {
            const results = {
                meta: null,
                messages: [],
                dialogues: [],
                settings: {},
                source: 'unknown',
                warnings: []
            };
            try {
                await this.init();
                const r = await this.chatRoleDB.getRole(roleId);
                if (r) {
                    results.meta = r;
                    results.messages = await this.chatRoleDB.getMessages(roleId);
                    results.dialogues = await this.chatRoleDB.getDialogues(roleId);
                    results.source = 'indexeddb';
                    return results;
                }
            } catch (e) {
                results.warnings.push('IndexedDB读取失败: ' + (e && e.message));
            }
            try {
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('sleepAssistantCharacters') : null;
                if (raw) {
                    const chars = JSON.parse(raw);
                    const role = chars.find(function(c) { return c && c.id === roleId; });
                    if (role) {
                        results.meta = role;
                        results.source = 'localStorage';
                        results.warnings.push('数据来源: localStorage（建议迁移到IndexedDB）');
                    }
                }
            } catch (e) {
                results.warnings.push('localStorage读取失败: ' + (e && e.message));
            }
            return results;
        }

        async saveRoleData(roleId, data) {
            const errors = [];
            try {
                await this.init();
                if (this._initDone && !this._initDone.success) {
                    errors.push(this._initDone.error || 'init failed');
                    return { success: false, errors: errors };
                }
                if (data.meta) await this.chatRoleDB.saveRole(roleId, data.meta);
                if (data.messages && data.messages.length) {
                    for (let i = 0; i < data.messages.length; i++) {
                        await this.chatRoleDB.addMessage(roleId, data.messages[i]);
                    }
                }
                if (data.dialogues && data.dialogues.length) {
                    for (let j = 0; j < data.dialogues.length; j++) {
                        await this.chatRoleDB.saveDialogue(roleId, data.dialogues[j]);
                    }
                }
                return { success: true, errors: errors };
            } catch (e) {
                errors.push('IndexedDB保存失败: ' + (e && e.message));
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, { source: 'UnifiedStorageService.saveRoleData', extra: { roleId: roleId } });
                }
                return { success: false, errors: errors };
            }
        }

        async migrateFromLocalStorage(roleId) {
            const migration = {
                roleId: roleId,
                status: 'pending',
                source: 'localStorage',
                target: 'ChatRoleDB',
                records: 0,
                errors: [],
                warnings: []
            };
            try {
                const existing = await this.chatRoleDB.getRole(roleId);
                if (existing) {
                    migration.warnings.push('IndexedDB中已存在该角色数据，跳过迁移');
                    migration.status = 'skipped';
                    return migration;
                }
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('sleepAssistantCharacters') : null;
                if (!raw) {
                    migration.warnings.push('localStorage中未找到角色数据');
                    migration.status = 'skipped';
                    return migration;
                }
                const chars = JSON.parse(raw);
                const role = chars.find(function(c) { return c && c.id === roleId; });
                if (!role) {
                    migration.warnings.push('未找到角色ID: ' + roleId);
                    migration.status = 'failed';
                    return migration;
                }
                await this.chatRoleDB.saveRole(roleId, role);
                migration.records += 1;
                const dlgRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('sleepAssistantDialogues') : null;
                if (dlgRaw) {
                    const dialogues = JSON.parse(dlgRaw);
                    const roleDialogues = dialogues.filter(function(d) { return d && d.characterId === roleId; });
                    for (let i = 0; i < roleDialogues.length; i++) {
                        await this.chatRoleDB.saveDialogue(roleId, roleDialogues[i]);
                        migration.records += 1;
                    }
                }
                migration.status = 'success';
            } catch (e) {
                migration.status = 'failed';
                migration.errors.push(e && e.message);
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, { source: 'UnifiedStorageService.migrateFromLocalStorage', extra: { roleId: roleId } });
                }
            }
            return migration;
        }

        async migrateDataToIndexedDB() {
            const migration = {
                id: _generateId(),
                startTime: Date.now(),
                status: 'pending',
                steps: [],
                errors: [],
                warnings: [],
                records: 0,
                source: 'localStorage',
                target: 'ChatRoleDB',
                shadowBackup: null
            };

            const logStep = (step, status, message) => {
                migration.steps.push({ step, status, message, time: Date.now() });
            };

            try {
                logStep('检查localStorage容量', 'running', '...');
                let used = 0;
                try {
                    if (typeof localStorage !== 'undefined') {
                        used = JSON.stringify(localStorage).length;
                    }
                } catch (e) {
                    if (window.Core && window.Core.CapacityMonitor) {
                        const stats = window.Core.CapacityMonitor.getUsageStats();
                        used = stats.current || 0;
                    }
                }
                const threshold = 2 * 1024 * 1024;
                if (used < threshold) {
                    logStep('检查localStorage容量', 'skipped', '使用量' + (used / 1024 / 1024).toFixed(2) + 'MB < 阈值2MB');
                    migration.status = 'skipped';
                    migration.timestamp = Date.now();
                    await this.chatRoleDB.saveMigrationLog(migration);
                    return migration;
                }
                logStep('检查localStorage容量', 'success', '使用量' + (used / 1024 / 1024).toFixed(2) + 'MB');

                logStep('创建影子备份', 'running', '...');
                try {
                    const backupKeys = ['sleepAssistantCharacters', 'sleepAssistantDialogues'];
                    const backup = {};
                    for (let i = 0; i < backupKeys.length; i++) {
                        const key = backupKeys[i];
                        if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) {
                            backup[key] = localStorage.getItem(key);
                        }
                    }
                    migration.shadowBackup = {
                        timestamp: Date.now(),
                        keys: Object.keys(backup),
                        data: backup
                    };
                    logStep('创建影子备份', 'success', '已备份' + Object.keys(backup).length + '个key');
                } catch (e) {
                    migration.warnings.push('影子备份失败: ' + (e && e.message));
                    logStep('创建影子备份', 'warning', '备份失败但继续迁移');
                }

                const initResult = await this.init();
                if (!initResult.success) {
                    throw new Error(initResult.error || 'init failed');
                }
                logStep('初始化ChatRoleDB', 'success', '');

                const charsRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('sleepAssistantCharacters') : null;
                if (charsRaw) {
                    logStep('迁移角色数据', 'running', '...');
                    try {
                        const chars = JSON.parse(charsRaw);
                        let migrated = 0;
                        const failedRoles = [];
                        for (let i = 0; i < chars.length; i++) {
                            const role = chars[i];
                            if (!role || !role.id) continue;
                            try {
                                const existing = await this.chatRoleDB.getRole(role.id);
                                if (!existing) {
                                    await this.chatRoleDB.saveRole(role.id, role);
                                    migrated++;
                                    migration.records++;
                                } else {
                                    migration.warnings.push('角色' + role.id + '已存在，跳过');
                                }
                            } catch (e) {
                                failedRoles.push(role.id);
                                migration.warnings.push('角色' + role.id + '迁移失败: ' + (e && e.message));
                            }
                        }
                        logStep('迁移角色数据', 'success', '迁移' + migrated + '个角色' + (failedRoles.length > 0 ? '，' + failedRoles.length + '个失败' : ''));
                    } catch (e) {
                        migration.errors.push('解析角色数据失败: ' + (e && e.message));
                        logStep('迁移角色数据', 'failed', e && e.message);
                    }
                }

                const dialoguesRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('sleepAssistantDialogues') : null;
                if (dialoguesRaw) {
                    logStep('迁移对话数据', 'running', '...');
                    try {
                        const dialogues = JSON.parse(dialoguesRaw);
                        let migrated = 0;
                        const failedDialogues = [];
                        for (let i = 0; i < dialogues.length; i++) {
                            const dlg = dialogues[i];
                            if (!dlg || !dlg.id || !dlg.characterId) continue;
                            try {
                                await this.chatRoleDB.saveDialogue(dlg.characterId, dlg);
                                migrated++;
                                migration.records++;
                            } catch (e) {
                                failedDialogues.push(dlg.id);
                                migration.warnings.push('对话' + dlg.id + '迁移失败: ' + (e && e.message));
                            }
                        }
                        logStep('迁移对话数据', 'success', '迁移' + migrated + '条对话' + (failedDialogues.length > 0 ? '，' + failedDialogues.length + '条失败' : ''));
                    } catch (e) {
                        migration.errors.push('解析对话数据失败: ' + (e && e.message));
                        logStep('迁移对话数据', 'failed', e && e.message);
                    }
                }

                migration.status = migration.errors.length > 0 ? 'partial' : 'success';
                migration.endTime = Date.now();
                migration.duration = migration.endTime - migration.startTime;
                migration.timestamp = Date.now();

                logStep('保存迁移日志', 'running', '...');
                await this.chatRoleDB.saveMigrationLog(migration);
                logStep('保存迁移日志', 'success', '');

                if (window.Core && window.Core.ErrorLogService) {
                    if (migration.errors.length > 0) {
                        window.Core.ErrorLogService.log(new Error('迁移完成但有错误: ' + migration.errors.join('; ')), {
                            source: 'UnifiedStorageService.migrateDataToIndexedDB',
                            extra: { migration: migration }
                        });
                    }
                }

                return migration;
            } catch (e) {
                migration.status = 'failed';
                migration.errors.push(e && e.message);
                migration.endTime = Date.now();
                migration.duration = migration.endTime - migration.startTime;
                migration.timestamp = Date.now();
                try {
                    await this.chatRoleDB.saveMigrationLog(migration);
                } catch (logErr) {
                    console.error('[UnifiedStorageService] 保存迁移日志失败:', logErr);
                }
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, {
                        source: 'UnifiedStorageService.migrateDataToIndexedDB',
                        extra: { migration: migration }
                    });
                }
                return migration;
            }
        }

        async cleanupMigratedLocalStorage(keysToRemove) {
            const cleaned = [];
            const failed = [];
            if (!Array.isArray(keysToRemove)) {
                keysToRemove = ['sleepAssistantCharacters', 'sleepAssistantDialogues'];
            }
            for (let i = 0; i < keysToRemove.length; i++) {
                const key = keysToRemove[i];
                try {
                    if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) {
                        localStorage.removeItem(key);
                        cleaned.push(key);
                    }
                } catch (e) {
                    failed.push({ key: key, error: e && e.message });
                }
            }
            return { cleaned: cleaned, failed: failed };
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        async cleanExpiredRoleData(days) {
            const daysThreshold = typeof days === 'number' && days > 0 ? days : 90;
            const thresholdTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000);
            const cleaned = {
                roles: 0,
                messages: 0,
                dialogues: 0
            };
            const errors = [];

            try {
                await this.init();
                const storage = this.storageService;
                if (!storage) throw new Error('StorageService not available');

                const allRoles = await storage.transaction(this.chatRoleDB.dbName, ['roleMeta'], async (tx) => {
                    const store = tx.objectStore('roleMeta');
                    return _cursorCollect(store);
                });

                for (let i = 0; i < allRoles.length; i++) {
                    const roleEntry = allRoles[i];
                    if (!roleEntry || !roleEntry.key || !roleEntry.key.startsWith('role:')) continue;
                    const roleId = roleEntry.key.slice(5);
                    const lastAccess = roleEntry.timestamp || 0;

                    if (lastAccess < thresholdTime) {
                        try {
                            const messages = await this.chatRoleDB.getMessages(roleId, Infinity);
                            const dialogues = await this.chatRoleDB.getDialogues(roleId);
                            let hasRecentActivity = false;

                            for (let j = 0; j < messages.length; j++) {
                                if (messages[j] && messages[j].timestamp && messages[j].timestamp > thresholdTime) {
                                    hasRecentActivity = true;
                                    break;
                                }
                            }
                            if (!hasRecentActivity) {
                                for (let k = 0; k < dialogues.length; k++) {
                                    if (dialogues[k] && dialogues[k].timestamp && dialogues[k].timestamp > thresholdTime) {
                                        hasRecentActivity = true;
                                        break;
                                    }
                                }
                            }

                            if (!hasRecentActivity) {
                                await this.chatRoleDB.deleteRole(roleId);
                                cleaned.roles++;
                                cleaned.messages += messages.length;
                                cleaned.dialogues += dialogues.length;
                            }
                        } catch (e) {
                            errors.push('清理角色' + roleId + '失败: ' + (e && e.message));
                        }
                    }
                }

                if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                    this.patrolLogger.log({
                        type: 'role_cleanup',
                        level: 'info',
                        action: 'clean_expired',
                        details: cleaned,
                        message: '清理过期角色数据: ' + cleaned.roles + '个角色，' + cleaned.messages + '条消息，' + cleaned.dialogues + '条对话'
                    });
                }

                return { success: true, cleaned: cleaned, errors: errors };
            } catch (e) {
                const errorMsg = '清理过期数据失败: ' + (e && e.message);
                errors.push(errorMsg);
                if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                    this.patrolLogger.log({
                        type: 'role_cleanup',
                        level: 'error',
                        action: 'clean_expired',
                        details: { error: e && e.message },
                        message: errorMsg
                    });
                }
                return { success: false, cleaned: cleaned, errors: errors };
            }
        }
    }

    const unified = new UnifiedStorageService();
    window.Core = window.Core || {};
    window.Core.UnifiedStorage = unified;
    window.Core.ChatRoleDB = ChatRoleDB;
})(window);
