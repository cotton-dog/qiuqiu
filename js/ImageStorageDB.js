(function(window) {
    const GROUP_ID = 'image_storage_db';

    function getBlobUrlService() {
        if (window.Core && window.Core.BlobUrlService) return window.Core.BlobUrlService;
        return null;
    }

    window.ImageStorageDB = {
        dbName: 'PhoneAppImages',
        version: 5,
        _initPromise: null,

        _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async init() {
            if (window.Core && window.Core.StorageService) {
                return window.Core.StorageService.openDB(this.dbName, this.version, (db) => {
                    if (!db.objectStoreNames.contains('images')) {
                        const store = db.createObjectStore('images', { keyPath: 'id' });
                        store.createIndex('type', 'type', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('appData')) {
                        db.createObjectStore('appData', { keyPath: 'key' });
                    }
                });
            }
            console.warn('Core.StorageService 不可用，图片存储功能降级');
            return Promise.resolve(null);
        },

        async _ensureInit() {
            if (this._initPromise) return this._initPromise;
            this._initPromise = this.init().catch((e) => {
                console.warn('图片存储初始化失败:', e);
                this._initPromise = null;
                return null;
            });
            return this._initPromise;
        },

        async get(id) {
            console.log('[ImageStorageDB.get] 开始查询, ID:', id);
            const db = await this._ensureInit();
            console.log('[ImageStorageDB.get] _ensureInit返回, db:', db, 'window.Core:', !!window.Core, 'window.Core.StorageService:', !!(window.Core?.StorageService));
            if (!db || !window.Core || !window.Core.StorageService) {
                console.warn('图片存储不可用，无法获取:', id);
                return null;
            }
            console.log('[ImageStorageDB.get] 准备调用transaction');
            return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                console.log('[ImageStorageDB.get] transaction回调开始执行, tx:', !!tx);
                const store = tx.objectStore('images');
                console.log('[ImageStorageDB.get] 获取store:', !!store);
                const res = await this._req(store.get(id));
                console.log('[ImageStorageDB.get] 查询ID:', id, '结果:', res, '结果类型:', typeof res, 'res.data:', res?.data, 'res.imageData:', res?.imageData);
                return res ? (res.data ?? res.imageData ?? null) : null;
            }).catch(err => {
                console.error('[ImageStorageDB.get] transaction异常:', err);
                return null;
            });
        },

        async getFriendAvatar(friendId, returnBlobUrl = true) {
            console.log('[ImageStorageDB.getFriendAvatar] 开始查询好友头像, friendId:', friendId, 'returnBlobUrl:', returnBlobUrl);
            if (!friendId) {
                console.warn('[ImageStorageDB.getFriendAvatar] friendId为空');
                return null;
            }
            const avatarId = `avatar_${String(friendId).trim()}`;
            const data = await this.get(avatarId);
            console.log('[ImageStorageDB.getFriendAvatar] 查询结果, data:', !!data, 'data类型:', typeof data);
            
            if (!data) {
                console.warn('[ImageStorageDB.getFriendAvatar] 头像数据不存在:', avatarId);
                return null;
            }

            if (!returnBlobUrl) {
                return data;
            }

            if (typeof data === 'string') {
                console.log('[ImageStorageDB.getFriendAvatar] 直接返回字符串数据');
                return data;
            }

            if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
                console.log('[ImageStorageDB.getFriendAvatar] 创建Blob URL');
                const blobUrlService = getBlobUrlService();
                if (!blobUrlService) throw new Error('BlobUrlService不可用');
                const blobUrl = await blobUrlService.toDisplayUrl(data, { preferDataUrlInFileProtocol: true, groupId: GROUP_ID + '-avatar' });
                console.log('[ImageStorageDB.getFriendAvatar] Blob URL创建成功:', blobUrl);
                return blobUrl;
            }

            console.warn('[ImageStorageDB.getFriendAvatar] 无法处理数据格式');
            return null;
        },

        async put(id, data, type = 'image') {
            const db = await this._ensureInit();
            if (!db || !window.Core || !window.Core.StorageService) {
                console.warn('图片存储不可用，无法保存:', id);
                return null;
            }
            return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.put({ id, data, type, timestamp: Date.now() }));
            });
        },

        async delete(id) {
                await this._ensureInit();
                return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.delete(id));
            });
        },

        async clear() {
                await this._ensureInit();
                return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.clear());
            });
        },

            async saveAppData(key, data) {
                await this._ensureInit();
            if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.setAppData === 'function') {
                return window.Core.StorageService.setAppData(key, data);
            }
            return window.Core.StorageService.transaction(this.dbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                await this._req(store.put({ key, value: data, timestamp: Date.now() }));
            });
        },

        async getAppData(key) {
                await this._ensureInit();
            if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.getAppData === 'function') {
                return window.Core.StorageService.getAppData(key);
            }
            return window.Core.StorageService.transaction(this.dbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                const res = await this._req(store.get(key));
                return res ? res.value : null;
            });
        },

        async loadToElement(element, styleProperty, localStorageKey, defaultStyle = '') {
            const rawSavedValue = localStorage.getItem(localStorageKey);
            if (!rawSavedValue) {
                if (defaultStyle) element.style[styleProperty] = defaultStyle;
                return;
            }

            const savedValue = String(rawSavedValue || '').trim();

            const pickIdbId = (input) => {
                const v = String(input || '').trim();
                if (!v) return '';
                if (v.indexOf('idb:') === 0) return v.slice(4).trim();

                if (v.indexOf('url(') === 0) {
                    const m = v.match(/^url\((['"]?)(.*?)\1\)$/i);
                    const inner = (m && m[2]) ? String(m[2]).trim() : '';
                    if (inner.indexOf('idb:') === 0) return inner.slice(4).trim();
                }

                const mid = v.match(/idb:([^\)"'\s]+)/i);
                return (mid && mid[1]) ? String(mid[1]).trim() : '';
            };

            const id = pickIdbId(savedValue);
            if (id) {
                const storedValue = await this.get(id);

                if (element && element.dataset && element.dataset.tempUrl) {
                    const blobUrlService = getBlobUrlService();
                    if (blobUrlService) blobUrlService.revokeObjectUrl(element.dataset.tempUrl);
                    element.dataset.tempUrl = '';
                }

                let finalSrc = '';
                if (typeof storedValue === 'string') {
                    if (storedValue.startsWith('idb:')) return;
                    finalSrc = storedValue;
                } else if (storedValue && typeof storedValue === 'object' && typeof storedValue.arrayBuffer === 'function') {
                    const blobUrlService = getBlobUrlService();
                    if (!blobUrlService) throw new Error('BlobUrlService不可用');
                    finalSrc = await blobUrlService.toDisplayUrl(storedValue, { preferDataUrlInFileProtocol: true, groupId: GROUP_ID + '-element' });
                    if (element && element.dataset) element.dataset.tempUrl = finalSrc;
                }

                if (finalSrc) {
                    element.style[styleProperty] = `url('${finalSrc}')`;
                    try { localStorage.setItem(localStorageKey, 'idb:' + id); } catch (e) {}
                } else if (defaultStyle) {
                    element.style[styleProperty] = defaultStyle;
                }
                return;
            }

            element.style[styleProperty] = savedValue;
        }
    };
})(window);
