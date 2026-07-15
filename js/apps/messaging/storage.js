(function() {
    'use strict';

    window.ChatStorageDB = {
        dbName: 'PhoneAppImages',
        version: 5,
        _initialized: false,
        _initPromise: null,

        _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async _ensureInit() {
            if (this._initialized) {
                return;
            }
            
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = this.init().catch(err => {
                this._initPromise = null;
                throw err;
            });
            
            return this._initPromise;
        },

        async init() {
            if (!window.Core?.StorageService) {
                throw new Error('[ChatStorageDB] Core.StorageService 不可用');
            }
            await window.Core.StorageService.openDB(this.dbName, this.version);
            this._initialized = true;
        },

        async put(id, imageData, type = 'image') {
            await this._ensureInit();
            return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.put({ id, data: imageData, type, timestamp: Date.now() }));
            });
        },

        async get(id) {
            await this._ensureInit();
            return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                const result = await this._req(store.get(id));
                return result ? result.data : null;
            });
        },

        async saveAppData(key, data) {
            await this._ensureInit();
            
            if (key === 'wechatAppData' && window.Core?.StorageService?.setAppData) {
                try {
                    return await window.Core.StorageService.setAppData('wechatAppData', data);
                } catch (err) {
                    console.warn('[ChatStorageDB] setAppData failed, falling back:', err);
                }
            }
            
            return window.Core.StorageService.transaction(this.dbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                await this._req(store.put({ key, value: data, timestamp: Date.now() }));
            });
        },

        async getAppData(key) {
            await this._ensureInit();
            
            if (key === 'wechatAppData' && window.Core?.StorageService?.getAppData) {
                try {
                    return await window.Core.StorageService.getAppData('wechatAppData');
                } catch (err) {
                    console.warn('[ChatStorageDB] getAppData failed, falling back:', err);
                }
            }
            
            return window.Core.StorageService.transaction(this.dbName, ['appData'], async (tx) => {
                const store = tx.objectStore('appData');
                const result = await this._req(store.get(key));
                return result ? result.value : null;
            });
        },

        async remove(id) {
            await this._ensureInit();
            return window.Core.StorageService.transaction(this.dbName, ['images'], async (tx) => {
                const store = tx.objectStore('images');
                await this._req(store.delete(id));
            });
        }
    };

    window.ChatStorageDB.init().catch(err => {
        console.error('[Storage] Initialization failed:', err);
    });

})();
