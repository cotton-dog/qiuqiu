(function(window) {
    'use strict';

    const QUOTA_RATIO_THRESHOLD = 0.85;

    class StorageService {
        constructor() {
            this.dbs = new Map();
            this.writeQueues = new Map();
            this.localStorageThreshold = 4 * 1024 * 1024;
            this.quotaRatioThreshold = QUOTA_RATIO_THRESHOLD;
            this.appDataDbName = 'PhoneAppImages';
            this.appDataVersion = 5;
            this._localStoragePatched = false;
            this._compacting = false;
            this._friendDataCache = new Map();
        }

        /**
         * 获取存储配额状态（navigator.storage.estimate），用于写入前熔断
         * @returns {Promise<{ usage: number, quota: number, usageRatio: number, allowed: boolean }>}
         */
        async getQuotaStatus() {
            try {
                if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
                    const est = await navigator.storage.estimate();
                    const usage = (est && est.usage) || 0;
                    const quota = (est && est.quota) || 0;
                    const usageRatio = quota > 0 ? usage / quota : 0;
                    const allowed = usageRatio < this.quotaRatioThreshold;
                    return { usage, quota, usageRatio, allowed };
                }
            } catch (e) {
                if (window.Core && window.Core.ErrorLogService) {
                    window.Core.ErrorLogService.log(e, { source: 'StorageService.getQuotaStatus', extra: {} });
                }
            }
            return { usage: 0, quota: 0, usageRatio: 0, allowed: true };
        }

        /**
         * 写入前检查配额，不足时提示并返回 false
         * @returns {Promise<boolean>}
         */
        async _checkQuotaBeforeWrite() {
            const status = await this.getQuotaStatus();
            if (status.allowed) return true;
            const msg = '存储空间不足，无法写入新数据，请清理后重试';
            try {
                const popup = window.Core && window.Core.Popup;
                if (popup && typeof popup.showNotification === 'function') {
                    popup.showNotification({ title: '存储提示', content: msg, type: 'error', duration: 8000 });
                } else {
                    console.warn('[StorageService]', msg);
                }
            } catch (_) {}
            if (window.Core && window.Core.ErrorLogService) {
                window.Core.ErrorLogService.log(new Error(msg), { source: 'StorageService.quota', extra: status });
            }
            return false;
        }

        _isWechatAppDataKey(key) {
            return String(key || '').trim() === 'wechatAppData';
        }

        _getWechatAppMetaKey() {
            return 'wechatAppData_meta';
        }

        _getWechatFriendKey(id) {
            return 'wechatAppData_friend_' + String(id);
        }

        _splitWechatAppData(data) {
            const source = (data && typeof data === 'object') ? data : {};
            const meta = { ...source };
            delete meta.contacts;
            delete meta.chats;
            const contacts = Array.isArray(source.contacts) ? source.contacts : [];
            const chats = Array.isArray(source.chats) ? source.chats : [];
            const items = new Map();

            contacts.forEach((contact) => {
                if (!contact || contact.id == null) return;
                const id = String(contact.id).trim();
                if (!id) return;
                const existing = items.get(id);
                if (existing) {
                    existing.contact = contact;
                    return;
                }
                items.set(id, { id, contact, chats: [] });
            });

            chats.forEach((chat) => {
                if (!chat || typeof chat !== 'object') return;
                const candidates = [
                    chat.contactId,
                    chat.friendId,
                    chat.friend_id,
                    chat.wechatId,
                    chat.wechat_id,
                    chat.peerId,
                    chat.peer_id
                ];
                const candidate = candidates.find((value) => value != null && String(value).trim() !== '');
                if (!candidate) return;
                const id = String(candidate).trim();
                if (!id) return;
                let existing = items.get(id);
                if (!existing) {
                    existing = { id, contact: null, chats: [] };
                    items.set(id, existing);
                }
                existing.chats.push(chat);
            });

            const friendIds = Array.from(items.keys());
            return { meta, friendIds, items };
        }

        /**
         * 批量查询多个键的值 - 使用getAll()替代循环get
         * @param {IDBObjectStore} store - IndexedDB object store
         * @param {string[]} keys - 要查询的键数组
         * @returns {Promise<Array>} 查询结果数组，顺序与keys一致
         */
        async _getBatch(store, keys) {
            if (!keys || keys.length === 0) return [];
            const allData = await this._req(store.getAll());
            const keySet = new Set(keys);
            const resultMap = new Map();
            for (const item of allData) {
                const itemKey = item && item.key;
                if (itemKey !== undefined && keySet.has(itemKey)) {
                    resultMap.set(itemKey, item);
                }
            }
            return keys.map(key => resultMap.get(key) || null);
        }

        /**
         * 使用索引按friendId查询
         * @param {IDBObjectStore} store - IndexedDB object store
         * @param {string} friendId - 好友ID
         * @returns {Promise<Object|null>} 查询结果
         */
        async _getByFriendIdIndex(store, friendId) {
            if (!store.indexNames.contains('friendId')) {
                const key = this._getWechatFriendKey(friendId);
                return this._req(store.get(key));
            }
            const index = store.index('friendId');
            return this._req(index.get(IDBKeyRange.only(String(friendId))));
        }

        /**
         * 使用索引按friendId批量查询
         * @param {IDBObjectStore} store - IndexedDB object store
         * @param {string[]} friendIds - 好友ID数组
         * @returns {Promise<Array>} 查询结果数组
         */
        async _getBatchByFriendIdIndex(store, friendIds) {
            if (!friendIds || friendIds.length === 0) return [];
            if (!store.indexNames.contains('friendId')) {
                const keys = friendIds.map(id => this._getWechatFriendKey(id));
                return this._getBatch(store, keys);
            }
            const index = store.index('friendId');
            const results = [];
            for (const friendId of friendIds) {
                const result = await this._req(index.get(IDBKeyRange.only(String(friendId))));
                results.push(result);
            }
            return results;
        }

        async _buildWechatAppDataFromSplit(meta, store) {
            const friendIds = Array.isArray(meta && meta.friendIds) ? meta.friendIds.map((v) => String(v)) : [];
            if (friendIds.length === 0) {
                const merged = { ...meta };
                delete merged.friendIds;
                delete merged.splitVersion;
                merged.contacts = [];
                merged.chats = [];
                return merged;
            }
            
            const keys = friendIds.map(id => this._getWechatFriendKey(id));
            const results = await this._getBatch(store, keys);
            
            const contacts = [];
            const chats = [];
            for (let i = 0; i < results.length; i += 1) {
                const res = results[i];
                const value = res ? res.value : null;
                if (value && value.contact) contacts.push(value.contact);
                if (value && Array.isArray(value.chats)) chats.push(...value.chats);
            }
            
            const merged = { ...meta };
            delete merged.friendIds;
            delete merged.splitVersion;
            merged.contacts = contacts;
            merged.chats = chats;
            return merged;
        }

        async getBatchFriendData(friendIds, options = {}) {
            if (!Array.isArray(friendIds) || friendIds.length === 0) return [];
            const { useCache = true, includeContact = true, includeChats = true, limit = 50 } = options;
            const limitedIds = friendIds.slice(0, limit);
            const results = new Map();
            const uncachedIds = [];
            
            if (useCache) {
                for (const id of limitedIds) {
                    const cached = this._friendDataCache.get(String(id));
                    if (cached) {
                        results.set(id, cached);
                    } else {
                        uncachedIds.push(id);
                    }
                }
            } else {
                uncachedIds.push(...limitedIds);
            }
            
            if (uncachedIds.length > 0) {
                const loaded = await this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                    const store = tx.objectStore('appData');
                    const batchResults = await this._getBatchByFriendIdIndex(store, uncachedIds);
                    const loadedData = new Map();
                    for (let i = 0; i < batchResults.length; i++) {
                        const res = batchResults[i];
                        const value = res ? (res.value || res) : null;
                        if (value) {
                            const id = uncachedIds[i];
                            loadedData.set(id, value);
                            if (useCache) {
                                this._friendDataCache.set(String(id), value);
                            }
                        }
                    }
                    return loadedData;
                });
                
                loaded.forEach((value, id) => results.set(id, value));
            }
            
            const output = [];
            for (const id of limitedIds) {
                const data = results.get(id);
                if (!data) {
                    output.push({ id: String(id), contact: null, chats: [] });
                    continue;
                }
                const item = { id: String(id) };
                if (includeContact) item.contact = data.contact;
                if (includeChats) item.chats = Array.isArray(data.chats) ? data.chats : [];
                output.push(item);
            }
            return output;
        }

        async getFriendDataById(friendId, options = {}) {
            const { useCache = true } = options;
            const id = String(friendId);
            
            if (useCache) {
                const cached = this._friendDataCache.get(id);
                if (cached) return cached;
            }
            
            const data = await this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                const res = await this._getByFriendIdIndex(store, id);
                return res ? res.value : null;
            });
            
            if (data && useCache) {
                this._friendDataCache.set(id, data);
            }
            return data;
        }

        async getWechatAppDataLazy(options = {}) {
            const { preloadContactCount = 20, includeChats = false } = options;
            const meta = await this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                const res = await this._req(store.get(this._getWechatAppMetaKey()));
                return res && res.value ? res.value : null;
            });
            
            if (!meta || !meta.splitVersion) {
                const fullData = await this.getAppData('wechatAppData');
                return fullData;
            }
            
            const friendIds = Array.isArray(meta.friendIds) ? meta.friendIds.slice(0, preloadContactCount) : [];
            const friendData = await this.getBatchFriendData(friendIds, {
                useCache: true,
                includeContact: true,
                includeChats: includeChats
            });
            
            const contacts = friendData.filter(d => d.contact).map(d => d.contact);
            const chats = friendData.filter(d => d.chats && d.chats.length > 0).flatMap(d => d.chats);
            
            const merged = { ...meta };
            delete merged.friendIds;
            delete merged.splitVersion;
            merged.contacts = contacts;
            merged.chats = chats;
            merged._lazy = true;
            merged._loadedCount = contacts.length;
            merged._totalCount = meta.friendIds.length;
            
            return merged;
        }

        async loadMoreFriendData(startIndex = 0, count = 20, options = {}) {
            const { includeChats = false } = options;
            const meta = await this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                const res = await this._req(store.get(this._getWechatAppMetaKey()));
                return res && res.value ? res.value : null;
            });
            
            if (!meta || !meta.friendIds) return { contacts: [], chats: [] };
            
            const friendIds = meta.friendIds.slice(startIndex, startIndex + count);
            if (friendIds.length === 0) return { contacts: [], chats: [] };
            
            const friendData = await this.getBatchFriendData(friendIds, {
                useCache: true,
                includeContact: true,
                includeChats: includeChats
            });
            
            const contacts = friendData.filter(d => d.contact).map(d => d.contact);
            const chats = friendData.filter(d => d.chats && d.chats.length > 0).flatMap(d => d.chats);
            
            return { contacts, chats, loadedCount: contacts.length, startIndex };
        }

        async getFriendChatsLazy(friendId, options = {}) {
            const { limit = 100, offset = 0 } = options;
            const id = String(friendId);
            
            const data = await this.getFriendDataById(id, { useCache: true });
            if (!data || !data.chats || data.chats.length === 0) return [];
            
            let chats = data.chats;
            if (data.chats.length > 0 && data.chats[0].messages) {
                chats = data.chats.map(chat => ({
                    ...chat,
                    messages: (chat.messages || []).slice(offset, offset + limit)
                })).filter(chat => chat.messages.length > 0);
            }
            
            return chats;
        }

        clearFriendDataCache(friendId = null) {
            if (friendId) {
                this._friendDataCache.delete(String(friendId));
            } else {
                this._friendDataCache.clear();
            }
        }

        preloadFriendData(friendIds, options = {}) {
            return this.getBatchFriendData(friendIds, { ...options, useCache: true });
        }

        async _setWechatAppDataSplit(tx, value) {
            const store = tx.objectStore('appData');
            const normalized = this._normalizeMirrorValue('wechatAppData', value);
            const data = this._splitWechatAppData(normalized);
            const metaKey = this._getWechatAppMetaKey();
            const prev = await this._req(store.get(metaKey));
            const prevIds = prev && prev.value && Array.isArray(prev.value.friendIds)
                ? prev.value.friendIds.map((v) => String(v))
                : [];
            const nextIds = data.friendIds.map((v) => String(v));
            const nextSet = new Set(nextIds);
            for (let i = 0; i < prevIds.length; i += 1) {
                const id = prevIds[i];
                if (!nextSet.has(id)) {
                    await this._req(store.delete(this._getWechatFriendKey(id)));
                    this._friendDataCache.delete(id);
                }
            }

            const metaValue = { ...data.meta, friendIds: nextIds, splitVersion: 1 };
            await this._req(store.put({ key: metaKey, value: metaValue, timestamp: Date.now() }));
            await this._req(store.delete('wechatAppData'));

            for (let i = 0; i < nextIds.length; i += 1) {
                const id = nextIds[i];
                const item = data.items.get(id);
                const record = {
                    id,
                    friendId: id,
                    contact: item && item.contact ? item.contact : null,
                    chats: item && Array.isArray(item.chats) ? item.chats : []
                };
                await this._req(store.put({ key: this._getWechatFriendKey(id), value: record, timestamp: Date.now() }));
                this._friendDataCache.set(id, record);
            }
        }

        async _removeWechatAppDataSplit(tx) {
            const store = tx.objectStore('appData');
            const metaKey = this._getWechatAppMetaKey();
            const prev = await this._req(store.get(metaKey));
            const prevIds = prev && prev.value && Array.isArray(prev.value.friendIds)
                ? prev.value.friendIds.map((v) => String(v))
                : [];
            for (let i = 0; i < prevIds.length; i += 1) {
                const id = prevIds[i];
                await this._req(store.delete(this._getWechatFriendKey(id)));
            }
            await this._req(store.delete(metaKey));
            await this._req(store.delete('wechatAppData'));
        }

        // --- Database Access ---

        /**
         * Open or get connection to a specific database
         * @param {string} dbName - Database name (e.g., 'PhoneAppImages', 'ChatStorageDB')
         * @param {number} version - Database version
         * @param {Function} [onUpgrade] - Optional upgrade handler: (db) => void
         * @returns {Promise<IDBDatabase>}
         */
        async openDB(dbName, version, onUpgrade) {
            if (this.dbs.has(dbName)) {
                const existingDb = this.dbs.get(dbName);
                
                // 使用创建事务来检测连接存活
                let isAlive = false;
                try {
                    if (existingDb && existingDb.objectStoreNames && existingDb.objectStoreNames.length > 0) {
                        existingDb.transaction(existingDb.objectStoreNames[0], 'readonly');
                        isAlive = true;
                    }
                } catch (e) {
                    isAlive = false;
                }
                
                if (isAlive) {
                    if (Number.isInteger(version) && version > 0) {
                        if (existingDb.version > version) {
                            throw new Error(`[StorageService] Cannot downgrade database ${dbName} from version ${existingDb.version} to ${version}`);
                        }
                        if (existingDb.version < version) {
                            existingDb.close();
                            this.dbs.delete(dbName);
                        } else {
                            return existingDb;
                        }
                    } else {
                        return existingDb;
                    }
                } else {
                    this.dbs.delete(dbName);
                }
            }

            const defaultUpgradeHandler = (dbName === 'PhoneAppImages') ? this._createPhoneAppImagesUpgradeHandler() : null;
            const upgradeHandler = (typeof onUpgrade === 'function') ? onUpgrade : defaultUpgradeHandler;

            return new Promise((resolve, reject) => {
                const request = Number.isInteger(version) && version > 0 ? indexedDB.open(dbName, version) : indexedDB.open(dbName);
                let timeoutId = null;
                let blockedTimeoutId = null;
                let settled = false;

                const cleanup = () => {
                    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                    if (blockedTimeoutId) { clearTimeout(blockedTimeoutId); blockedTimeoutId = null; }
                };

                const doResolve = (value) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(value);
                };

                const doReject = (error) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(error);
                };

                timeoutId = setTimeout(() => {
                    doReject(new Error(`[StorageService] Database ${dbName} open timeout`));
                }, 10000);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const transaction = event.target.transaction;

                    if (upgradeHandler) {
                        try {
                            upgradeHandler(db, transaction, { oldVersion: event.oldVersion, newVersion: event.newVersion });
                        } catch (error) {
                            console.error('[StorageService] Upgrade handler error:', error);
                            transaction.abort();
                            doReject(error);
                        }
                    }
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    this.dbs.set(dbName, db);
                    db.onclose = () => { this.dbs.delete(dbName); };
                    db.onversionchange = () => { db.close(); this.dbs.delete(dbName); };
                    doResolve(db);
                };

                request.onerror = (event) => {
                    doReject(event.target.error);
                };

                request.onblocked = () => {
                    blockedTimeoutId = setTimeout(() => {
                        if (!settled) {
                            doReject(new Error(`[StorageService] Database ${dbName} blocked timeout`));
                        }
                    }, 30000);
                    
                    try {
                        const popup = window.Core && window.Core.Popup;
                        if (popup && typeof popup.showNotification === 'function') {
                            popup.showNotification({ 
                                title: '提示', 
                                content: '数据库被占用，请关闭其他标签页后刷新', 
                                type: 'warning',
                                duration: 30000
                            });
                        }
                    } catch (e) {
                        console.warn('[StorageService] Failed to show notification:', e);
                    }
                };
            });
        }

        _createPhoneAppImagesUpgradeHandler() {
            return (db, transaction, { oldVersion, newVersion }) => {
                const migrations = {
                    1: () => {
                        if (!db.objectStoreNames.contains('images')) {
                            const store = db.createObjectStore('images', { keyPath: 'id' });
                            store.createIndex('type', 'type', { unique: false });
                            store.createIndex('timestamp', 'timestamp', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('appData')) {
                            const appDataStore = db.createObjectStore('appData', { keyPath: 'key' });
                            appDataStore.createIndex('timestamp', 'timestamp', { unique: false });
                            appDataStore.createIndex('friendId', 'friendId', { unique: false });
                        }
                    },
                    2: () => {
                        if (db.objectStoreNames.contains('images')) {
                            const store = transaction.objectStore('images');
                            if (!store.indexNames.contains('timestamp')) {
                                store.createIndex('timestamp', 'timestamp', { unique: false });
                            }
                        }
                    },
                    3: () => {},
                    4: () => {},
                    5: () => {}
                };
                
                const targetVersion = newVersion || 5;
                for (let v = oldVersion + 1; v <= targetVersion; v++) {
                    if (migrations[v]) {
                        migrations[v]();
                    }
                }
            };
        }

        // --- Transaction Helpers ---

        /**
         * Execute a read-write operation with a queue lock
         * @param {string} dbName 
         * @param {string[]} storeNames 
         * @param {Function} operation - async (transaction) => result
         * @returns {Promise<any>}
         */
        async transaction(dbName, storeNames, operation) {
            return this._enqueue(dbName, async () => {
                let db = this.dbs.get(dbName);
                if (!db) {
                    // 自动尝试打开请求的数据库，而不仅仅是特定的
                    console.log(`[StorageService] 尝试自动打开数据库: ${dbName}`);
                    db = await this.openDB(dbName);
                }

                return new Promise(async (resolve, reject) => {
                    let tx;
                    try {
                        tx = db.transaction(storeNames, 'readwrite');
                    } catch (e) {
                        return reject(e);
                    }
                    
                    // We rely on the operation promise resolution, but we must ensure tx completes
                    let opResult;
                    let opError;

                    tx.oncomplete = () => {
                        if (opError) reject(opError);
                        else resolve(opResult);
                    };
                    
                    tx.onerror = (e) => reject(tx.error || e.target.error);
                    tx.onabort = (e) => reject(tx.error || new Error('Transaction aborted'));

                    try {
                        opResult = await operation(tx);
                        // If operation returns, we wait for tx.oncomplete
                    } catch (e) {
                        opError = e;
                        // Manually abort to trigger rollback if needed
                        try { tx.abort(); } catch (_) {}
                        reject(e);
                    }
                });
            });
        }

        async getAppData(key) {
            console.log(`[StorageService] getAppData called for key: ${key}`);
            const k = String(key || '').trim();
            const value = await this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                if (this._isWechatAppDataKey(k)) {
                    const metaRes = await this._req(store.get(this._getWechatAppMetaKey()));
                    if (metaRes && metaRes.value && metaRes.value.splitVersion) {
                        const built = await this._buildWechatAppDataFromSplit(metaRes.value, store);
                        console.log(`[StorageService] Raw IDB result for ${key}:`, built);
                        return built;
                    }
                }
                const res = await this._req(store.get(k));
                console.log(`[StorageService] Raw IDB result for ${key}:`, res);
                return res ? res.value : null;
            });
            const normalized = this._normalizeMirrorValue(k, value);
            console.log(`[StorageService] Normalized value for ${key}:`, normalized ? 'Present (Object/String)' : 'Null/Undefined');
            if (normalized !== value) {
                try {
                    console.log(`[StorageService] Normalizing and updating IDB for ${key}`);
                    await this.setAppData(k, normalized);
                } catch (_) {}
            }
            return normalized;
        }

        async setAppData(key, value) {
            const allowed = await this._checkQuotaBeforeWrite();
            if (!allowed) return Promise.reject(new Error('Storage quota exceeded'));
            const k = String(key || '').trim();
            if (this._isWechatAppDataKey(k)) {
                return this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                    await this._setWechatAppDataSplit(tx, value);
                });
            }
            return this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                await this._req(store.put({ key: k, value, timestamp: Date.now() }));
            });
        }

        async removeAppData(key) {
            const k = String(key || '').trim();
            if (this._isWechatAppDataKey(k)) {
                return this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                    await this._removeWechatAppDataSplit(tx);
                });
            }
            return this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                await this._req(store.delete(k));
            });
        }

        async clearAppData() {
            return this.transaction(this.appDataDbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                await this._req(store.clear());
            });
        }

        // --- LocalStorage Fallback with Circuit Breaker ---

        setItemFallback(key, value) {
            if (this._isLocalStorageFull()) {
                console.warn('[StorageService] LocalStorage full/near limit. Fallback blocked.');
                return false;
            }
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (e) {
                console.error('[StorageService] LocalStorage write failed:', e);
                return false;
            }
        }

        // --- Internal ---

        _enqueue(queueName, task) {
            if (!this.writeQueues.has(queueName)) {
                this.writeQueues.set(queueName, Promise.resolve());
            }
            
            const queue = this.writeQueues.get(queueName);
            const run = queue.then(() => task());
            const runWithLog = run.catch((err) => {
                console.error(`[StorageService] Task failed in queue ${queueName}:`, err);
                throw err;
            });

            this.writeQueues.set(queueName, runWithLog.catch(() => {}));
            return runWithLog;
        }

        _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        _initLocalStorageMirror() {
            if (this._localStoragePatched) return;
            let storage;
            try {
                storage = window.localStorage;
            } catch (e) {
                return;
            }
            if (!storage) return;
            this._localStoragePatched = true;
            const originalSetItem = storage.setItem.bind(storage);
            const originalRemoveItem = storage.removeItem.bind(storage);
            const originalClear = storage.clear.bind(storage);
            storage.setItem = (key, value) => {
                originalSetItem(key, value);
                this._mirrorSet(String(key));
                if (!this._compacting) this._autoCompact(String(key)).catch(() => {});
            };
            storage.removeItem = (key) => {
                originalRemoveItem(key);
                this._mirrorRemove(String(key));
            };
            storage.clear = () => {
                originalClear();
                this._mirrorClear();
            };
            this._mirrorAll();
            this._compactAllLocalStorage().catch(() => {});
        }

        _normalizeMirrorValue(key, value) {
            const k = String(key || '').trim();
            if (!k) return value;
            if (k === 'wechatAppData' && typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed && (trimmed[0] === '{' || trimmed[0] === '[')) {
                    try {
                        return JSON.parse(trimmed);
                    } catch (_) {
                        return value;
                    }
                }
            }
            return value;
        }

        async _mirrorSet(key) {
            if (!key) return;
            try {
                const value = localStorage.getItem(key);
                const normalized = this._normalizeMirrorValue(key, value);
                await this.setAppData(key, normalized);
            } catch (e) {}
        }

        async _mirrorRemove(key) {
            if (!key) return;
            try {
                await this.removeAppData(key);
            } catch (e) {}
        }

        async _mirrorClear() {
            try {
                await this.clearAppData();
            } catch (e) {}
        }

        async _mirrorAll() {
            try {
                const total = localStorage.length;
                for (let i = 0; i < total; i += 1) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const value = localStorage.getItem(key);
                    const normalized = this._normalizeMirrorValue(key, value);
                    await this.setAppData(key, normalized);
                }
            } catch (e) {}
        }

        _isLocalStorageFull() {
            let total = 0;
            for (let x in localStorage) {
                if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
                    total += (localStorage[x].length + x.length) * 2;
                }
            }
            return total > this.localStorageThreshold;
        }

        async _autoCompact(key) {
            try {
                const value = localStorage.getItem(key);
                if (!value || typeof value !== 'string') return;
                if (this._isHeavyValue(value)) {
                    const processed = await this._processValueForCompaction(key, value);
                    if (processed && processed.changed) {
                        this._compacting = true;
                        try { localStorage.setItem(key, processed.value); } catch (_) {}
                        this._compacting = false;
                        await this.setAppData(key, processed.value);
                    }
                }
            } catch (_) {}
        }

        async _compactAllLocalStorage() {
            try {
                const total = localStorage.length;
                for (let i = 0; i < total; i += 1) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    await this._autoCompact(key);
                }
            } catch (_) {}
        }

        _isHeavyValue(v) {
            if (!v || typeof v !== 'string') return false;
            if (v.length >= 128 * 1024) return true;
            if (this._looksLikeDataUrl(v)) return true;
            if (v.indexOf('data:image') !== -1 || v.indexOf('data:audio') !== -1) return true;
            return false;
        }

        _looksLikeDataUrl(v) {
            return typeof v === 'string' && v.startsWith('data:') && v.indexOf(';base64,') > 0;
        }

        _extractMimeFromDataUrl(v) {
            try {
                const m = v.match(/^data:([^;]+);base64,/);
                return m && m[1] ? m[1] : '';
            } catch (_) { return ''; }
        }

        _dataUrlToBlob(v) {
            try {
                const idx = v.indexOf(';base64,');
                const head = v.substring(0, idx);
                const mime = this._extractMimeFromDataUrl(v);
                const b64 = v.substring(idx + 8);
                const bin = atob(b64);
                const len = bin.length;
                const u8 = new Uint8Array(len);
                for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
                return new Blob([u8], { type: mime || 'application/octet-stream' });
            } catch (_) { return null; }
        }

        async _storeBlob(id, blob, type) {
            return this.transaction('PhoneAppImages', ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.put({ id, data: blob, type, timestamp: Date.now() }));
            });
        }

        _genId(prefix) {
            return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
        }

        async _processValueForCompaction(key, value) {
            if (this._looksLikeDataUrl(value)) {
                const blob = this._dataUrlToBlob(value);
                if (!blob) return null;
                const mime = this._extractMimeFromDataUrl(value);
                const id = this._genId('ls_blob');
                await this._storeBlob(id, blob, mime && mime.indexOf('audio') === 0 ? 'audio' : 'image');
                return { changed: true, value: 'idb:' + id };
            }
            if (value.length >= 64 * 1024 || value.indexOf('data:image') !== -1 || value.indexOf('data:audio') !== -1) {
                try {
                    const obj = JSON.parse(value);
                    const replaced = await this._replaceDataUrlsInObject(obj);
                    const nv = JSON.stringify(replaced);
                    if (nv.length < value.length) return { changed: true, value: nv };
                } catch (_) {}
            }
            return null;
        }

        async _replaceDataUrlsInObject(obj) {
            if (obj == null) return obj;
            if (typeof obj === 'string') {
                if (this._looksLikeDataUrl(obj)) {
                    const blob = this._dataUrlToBlob(obj);
                    if (!blob) return obj;
                    const mime = this._extractMimeFromDataUrl(obj);
                    const id = this._genId('ls_blob');
                    await this._storeBlob(id, blob, mime && mime.indexOf('audio') === 0 ? 'audio' : 'image');
                    return 'idb:' + id;
                }
                return obj;
            }
            if (Array.isArray(obj)) {
                const out = [];
                for (let i = 0; i < obj.length; i++) out[i] = await this._replaceDataUrlsInObject(obj[i]);
                return out;
            }
            if (typeof obj === 'object') {
                const out = {};
                for (let k in obj) {
                    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
                    out[k] = await this._replaceDataUrlsInObject(obj[k]);
                }
                return out;
            }
            return obj;
        }
    }

    window.Core = window.Core || {};
    window.Core.StorageService = new StorageService();
    
    Object.defineProperty(window.Core.StorageService, '_isSingleton', {
        value: true,
        writable: false,
        configurable: false
    });

})(window);
