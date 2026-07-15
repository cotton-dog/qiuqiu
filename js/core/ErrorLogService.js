/**
 * 全局错误日志服务（P0 存储基础设施）
 * 将移动端报错记录至 IndexedDB 供调试导出。
 * 数据库: AppErrorLogDB, 表: entries (id, level, message, stack, timestamp, source, extra)
 */
(function(window) {
    'use strict';

    const DB_NAME = 'AppErrorLogDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'entries';
    const MAX_ENTRIES = 500;

    function _uuid() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    }

    class ErrorLogService {
        constructor() {
            this._db = null;
            this._logging = false;
            this._initPromise = null;
        }

        async _openDB() {
            if (this._db) return this._db;
            if (this._initPromise) return this._initPromise;
            this._initPromise = new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error('IndexedDB not available'));
                    return;
                }
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function(event) {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('level', 'level', { unique: false });
                    }
                };
                req.onsuccess = (event) => {
                    this._db = event.target.result;
                    this._db.onclose = () => { this._db = null; this._initPromise = null; };
                    resolve(this._db);
                };
                req.onerror = () => reject(req.error);
            });
            return this._initPromise;
        }

        _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        /**
         * 写入一条日志
         * @param {Error|string} error - 错误对象或字符串
         * @param {{ source?: string, extra?: object }} options
         */
        async log(error, options = {}) {
            if (this._logging) return;
            this._logging = true;
            try {
                const db = await this._openDB();
                const entry = {
                    id: _uuid(),
                    level: (options && options.level) || 'error',
                    message: typeof error === 'string' ? error : (error && error.message) || String(error),
                    stack: (error && error.stack) || null,
                    timestamp: Date.now(),
                    source: (options && options.source) || null,
                    extra: (options && options.extra) != null ? options.extra : null
                };
                const tx = db.transaction([STORE_NAME], 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                await this._req(store.add(entry));
                await this._req(new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }));
                await this._trimToMax(db);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[ErrorLogService] log failed:', e);
                }
            } finally {
                this._logging = false;
            }
        }

        async _trimToMax(db) {
            try {
                const tx = db.transaction([STORE_NAME], 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const index = store.index('timestamp');
                const all = await this._req(index.getAll());
                if (all.length <= MAX_ENTRIES) return;
                const toDelete = all.slice(0, all.length - MAX_ENTRIES);
                for (const entry of toDelete) {
                    store.delete(entry.id);
                }
                await this._req(new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }));
            } catch (_) {}
        }

        /**
         * 获取最近若干条日志
         * @param {number} limit
         * @returns {Promise<Array<{id, level, message, stack, timestamp, source, extra}>>}
         */
        async getRecent(limit = 100) {
            try {
                const db = await this._openDB();
                const tx = db.transaction([STORE_NAME], 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const index = store.index('timestamp');
                const all = await this._req(index.getAll());
                const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
                return sorted.slice(0, limit);
            } catch (e) {
                return [];
            }
        }

        /**
         * 导出为 JSON 字符串
         * @param {number} limit
         * @returns {Promise<string>}
         */
        async exportAsJson(limit = 500) {
            const entries = await this.getRecent(limit);
            return JSON.stringify({ exportedAt: Date.now(), entries }, null, 2);
        }
    }

    const service = new ErrorLogService();
    window.Core = window.Core || {};
    window.Core.ErrorLogService = service;

    function onGlobalError(message, source, lineno, colno, error) {
        service.log(error || message, {
            source: source || (source === undefined ? 'window.onerror' : null),
            extra: { lineno, colno, url: typeof source === 'string' ? source : null }
        });
    }

    function onUnhandledRejection(event) {
        const reason = event.reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        const err = reason instanceof Error ? reason : new Error(msg);
        service.log(err, { source: 'unhandledrejection', extra: { reason: msg } });
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('error', function(event) {
            onGlobalError(event.message, event.filename, event.lineno, event.colno, event.error);
        });
        window.addEventListener('unhandledrejection', function(event) {
            onUnhandledRejection(event);
        });
    }

})(window);
