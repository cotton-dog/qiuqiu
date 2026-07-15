(function(window) {
    'use strict';

    const UPDATE_CHECK_KEY = 'updateCheck';
    const LAST_CHECK_TIME_KEY = 'lastUpdateCheckTime';
    const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
    const MAX_CACHED_VERSIONS = 10;

    class VersionCacheDB {
        constructor() {
            this.dbName = 'VersionCacheDB';
            this.storeName = 'versions';
            this.db = null;
        }

        async open() {
            if (this.db) return this.db;

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to open:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'version' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            });
        }

        async saveVersion(versionInfo) {
            await this.open();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);

                const entry = {
                    version: versionInfo.version,
                    timestamp: Date.now(),
                    cachedAt: new Date().toLocaleString('zh-CN'),
                    manifest: versionInfo.manifest || null
                };

                const request = store.put(entry);

                request.onsuccess = () => {
                    this._trimOldVersions();
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to save:', request.error);
                    reject(request.error);
                };
            });
        }

        async _trimOldVersions() {
            await this.open();

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'prev');

            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    count++;
                    if (count > MAX_CACHED_VERSIONS) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        }

        async getAllVersions() {
            await this.open();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('timestamp');
                const request = index.getAll();

                request.onsuccess = () => {
                    const results = request.result || [];
                    resolve(results.sort((a, b) => b.timestamp - a.timestamp));
                };

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to get all:', request.error);
                    reject(request.error);
                };
            });
        }

        async getVersion(version) {
            await this.open();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(version);

                request.onsuccess = () => {
                    resolve(request.result || null);
                };

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to get:', request.error);
                    reject(request.error);
                };
            });
        }

        async deleteVersion(version) {
            await this.open();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(version);

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to delete:', request.error);
                    reject(request.error);
                };
            });
        }

        async clear() {
            await this.open();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[VersionCacheDB] Failed to clear:', request.error);
                    reject(request.error);
                };
            });
        }
    }

    class UpdateChecker {
        constructor() {
            this.currentVersion = this._getVersionFromMeta();
            this.cachePrefix = '小手机-';
            this.cacheSuffix = this.currentVersion ? `-v${this.currentVersion}` : '';
            this.versionCacheDB = new VersionCacheDB();
        }

        _getVersionFromMeta() {
            if (window.APP_VERSION) {
                return window.APP_VERSION;
            }
            
            try {
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (manifestLink) {
                    const manifestHref = manifestLink.href;
                    const versionMatch = manifestHref.match(/[?&]v=(\d+\.\d+\.\d+)/);
                    if (versionMatch) return versionMatch[1];
                }
            } catch (e) {}
            
            try {
                const script = document.querySelector('script[data-version]');
                if (script) {
                    return script.getAttribute('data-version');
                }
            } catch (e) {}
            
            const savedVersion = localStorage.getItem('appVersion');
            if (savedVersion) return savedVersion;
            
            const version = '1.0.0';
            localStorage.setItem('appVersion', version);
            return version;
        }

        async getLatestVersion() {
            try {
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (!manifestLink) {
                    return { available: false, error: '未找到 manifest', currentVersion: this.currentVersion };
                }

                const manifestUrl = manifestLink.href;
                const manifestResponse = await this._fetchWithCache(manifestUrl);
                const manifest = await manifestResponse.json();

                const version = manifest.version || manifest.version_name;
                
                if (!version) {
                    return { 
                        available: false, 
                        error: 'manifest 中无版本号', 
                        currentVersion: this.currentVersion,
                        manifest: manifest 
                    };
                }

                return {
                    available: version && version !== this.currentVersion,
                    version: version,
                    manifest: manifest
                };
            } catch (e) {
                console.error('[UpdateChecker] Failed to check version:', e);
                return { available: false, error: e.message, currentVersion: this.currentVersion };
            }
        }

        async _fetchWithCache(url, options = {}) {
            const cacheName = `${this.cachePrefix}resources${this.cacheSuffix}`;
            const cache = await caches.open(cacheName);

            try {
                const response = await fetch(url, { ...options, cache: 'no-cache' });
                if (response.ok) {
                    const responseToCache = response.clone();
                    cache.put(url, responseToCache);
                }
                return response;
            } catch (networkError) {
                const cachedResponse = await cache.match(url);
                if (cachedResponse) {
                    return cachedResponse;
                }
                throw networkError;
            }
        }

        async getCachedVersion() {
            try {
                const cached = localStorage.getItem(`${UPDATE_CHECK_KEY}:cachedVersion`);
                return cached ? JSON.parse(cached) : null;
            } catch (e) {
                return null;
            }
        }

        async saveCachedVersion(versionInfo) {
            try {
                localStorage.setItem(`${UPDATE_CHECK_KEY}:cachedVersion`, JSON.stringify(versionInfo));
            } catch (e) {
                console.warn('[UpdateChecker] Failed to save cached version:', e);
            }
        }

        async saveCurrentVersionToCache() {
            try {
                let currentSwCache = null;
                
                if ('caches' in window) {
                    const allCaches = await caches.keys();
                    currentSwCache = allCaches.find(name => name.startsWith('qiuqiu-v'));
                }
                
                const versionInfo = {
                    version: this.currentVersion,
                    timestamp: Date.now(),
                    cachedAt: new Date().toLocaleString('zh-CN'),
                    manifest: null,
                    swCacheName: currentSwCache || null
                };

                await this.versionCacheDB.saveVersion(versionInfo);

                console.log(`[UpdateChecker] Version ${this.currentVersion} saved to cache (SW: ${currentSwCache || 'N/A - non-HTTPS'})`);
                return true;
            } catch (e) {
                console.error('[UpdateChecker] Failed to save version to cache:', e);
                return false;
            }
        }

        async getCachedVersions() {
            try {
                const versions = await this.versionCacheDB.getAllVersions();
                return versions;
            } catch (e) {
                console.error('[UpdateChecker] Failed to get cached versions:', e);
                return [];
            }
        }

        async rollbackToVersion(version) {
            if (!('caches' in window)) {
                return { success: false, error: '需要 HTTPS 环境才能使用回滚功能' };
            }
            
            try {
                const versionInfo = await this.versionCacheDB.getVersion(version);
                if (!versionInfo) {
                    return { success: false, error: '版本不存在于缓存记录中' };
                }

                const allCaches = await caches.keys();
                const targetCacheName = versionInfo.swCacheName;
                
                if (!targetCacheName || !allCaches.includes(targetCacheName)) {
                    const availableCaches = allCaches.filter(name => name.startsWith('qiuqiu-v'));
                    if (availableCaches.length === 0) {
                        return { success: false, error: '没有可用的旧版本缓存，无法回滚' };
                    }
                    
                    if (window.Core && window.Core.PopupService) {
                        window.Core.PopupService.show({
                            title: '缓存不可用',
                            content: `版本 ${version} 的缓存已被清理。\n\n可用的缓存版本：\n${availableCaches.join('\n')}`,
                            type: 'alert'
                        });
                    }
                    return { success: false, error: '目标版本缓存已被清理' };
                }

                const cachesToKeep = new Set([targetCacheName, 'qiuqiu-runtime']);
                
                await Promise.all(
                    allCaches
                        .filter(name => !cachesToKeep.has(name))
                        .map(name => {
                            console.log('[UpdateChecker] 删除缓存:', name);
                            return caches.delete(name);
                        })
                );

                localStorage.setItem(`${UPDATE_CHECK_KEY}:rolledBackTo`, JSON.stringify({
                    fromVersion: this.currentVersion,
                    toVersion: version,
                    timestamp: Date.now()
                }));

                localStorage.setItem('appVersion', version);

                if (window.Core && window.Core.PopupService) {
                    window.Core.PopupService.showToast(`已回滚到版本 ${version}，正在刷新...`);
                }

                setTimeout(() => {
                    window.location.reload();
                }, 1000);

                return { success: true, version: version };
            } catch (e) {
                console.error('[UpdateChecker] Failed to rollback:', e);
                return { success: false, error: e.message };
            }
        }

        async checkForUpdates(force = false) {
            const now = Date.now();
            const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_TIME_KEY) || '0', 10);

            if (!force && (now - lastCheck < CHECK_INTERVAL)) {
                const cachedVersion = await this.getCachedVersion();
                if (cachedVersion) {
                    return {
                        checked: false,
                        reason: 'recently_checked',
                        cachedVersion: cachedVersion
                    };
                }
            }

            localStorage.setItem(LAST_CHECK_TIME_KEY, String(now));

            const versionInfo = await this.getLatestVersion();
            if (versionInfo.available) {
                await this.saveCachedVersion(versionInfo);
            }

            return {
                checked: true,
                ...versionInfo
            };
        }

        async updateAllCaches() {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const cacheWhitelist = [`${this.cachePrefix}resources${this.cacheSuffix}`];

                await caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames
                            .filter(name => !cacheWhitelist.some(prefix => name.startsWith(prefix)))
                            .map(name => caches.delete(name))
                    );
                });

                const registration = await navigator.serviceWorker.getRegistration();
                if (registration && registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    return { success: true, reload: true };
                }
            }

            return { success: false, reload: false };
        }

        async applyUpdate() {
            try {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration && registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    return { success: true, reload: true };
                }

                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    const messageChannel = new MessageChannel();
                    navigator.serviceWorker.controller.postMessage(
                        { type: 'APPLY_UPDATE' },
                        [messageChannel.port1]
                    );
                    return { success: true, reload: true };
                }

                return { success: false, error: 'No service worker waiting' };
            } catch (e) {
                console.error('[UpdateChecker] Failed to apply update:', e);
                return { success: false, error: e.message };
            }
        }

        getCurrentVersion() {
            return this.currentVersion || 'unknown';
        }

        async showVersionCheckPopup() {
            const currentVersion = this.getCurrentVersion();
            const cachedVersions = await this.getCachedVersions();
            
            let availableSwCaches = [];
            if ('caches' in window) {
                const allCaches = await caches.keys();
                availableSwCaches = allCaches.filter(name => name.startsWith('qiuqiu-v'));
            }

            const cacheListHtml = cachedVersions.length > 0
                ? cachedVersions.map(v => {
                    const isAvailable = v.swCacheName && availableSwCaches.includes(v.swCacheName);
                    const badgeClass = isAvailable ? 'version-cache-badge' : 'version-cache-badge unavailable';
                    const badgeText = isAvailable ? '可回滚' : '缓存已失效';
                    const itemClass = isAvailable ? 'version-cache-item' : 'version-cache-item unavailable';
                    const clickHandler = isAvailable ? `onclick="window.Core.UpdateChecker.handleRollback('${v.version}')"` : '';
                    
                    return `
                        <div class="${itemClass}" data-version="${v.version}" ${clickHandler}>
                            <div class="version-cache-info">
                                <div class="version-cache-version">${v.version}</div>
                                <div class="version-cache-date">${v.cachedAt}</div>
                            </div>
                            <div class="${badgeClass}">${badgeText}</div>
                        </div>
                    `;
                }).join('')
                : '<div class="version-cache-empty">' + ('caches' in window ? '暂无缓存版本' : '需要 HTTPS 环境才能使用缓存功能') + '</div>';

            if (window.Core && window.Core.PopupService) {
                window.Core.PopupService.show({
                    title: '版本检查',
                    content: `
                        <div class="version-check-popup">
                            <div class="version-popup-current">
                                <div class="version-popup-label">当前版本</div>
                                <div class="version-popup-value">${currentVersion}</div>
                            </div>
                            <div class="version-popup-actions">
                                <button class="version-popup-btn" onclick="window.Core.UpdateChecker.handleCheckUpdate(this)">
                                    <i class="fas fa-sync-alt"></i><span>检查更新</span>
                                </button>
                            </div>
                            <div class="version-popup-cache">
                                <div class="version-popup-cache-title">已缓存版本</div>
                                <div class="version-popup-cache-list">
                                    ${cacheListHtml}
                                </div>
                                <div class="version-popup-cache-tip">点击可用版本可回滚</div>
                            </div>
                        </div>
                    `,
                    type: 'custom',
                    showCancel: true,
                    cancelText: '关闭',
                    width: '90%',
                    maxWidth: '400px'
                });
            } else {
                alert(`当前版本：${currentVersion}\n\n已缓存版本：\n${cachedVersions.map(v => `- ${v.version} (${v.cachedAt})`).join('\n') || '无'}`);
            }
        }

        async handleCheckUpdate(btn) {
            if (!btn) return;

            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spin"></i><span>检查中...</span>';
            btn.disabled = true;

            try {
                const result = await this.checkForUpdates(true);

                if (result.available) {
                    if (window.Core && window.Core.PopupService) {
                        window.Core.PopupService.show({
                            title: '发现新版本',
                            content: `当前版本：${this.getCurrentVersion()}<br>新版本：${result.version}<br><br>是否立即更新？`,
                            type: 'confirm',
                            confirmText: '立即更新',
                            cancelText: '稍后',
                            onConfirm: async () => {
                                await this.saveCurrentVersionToCache();
                                await this.applyUpdate();
                            }
                        });
                    }
                } else if (result.error) {
                    if (window.Core && window.Core.PopupService) {
                        window.Core.PopupService.showToast('检查失败：' + result.error);
                    } else {
                        alert('检查失败：' + result.error);
                    }
                } else {
                    if (window.Core && window.Core.PopupService) {
                        window.Core.PopupService.showToast('当前已是最新版本');
                    } else {
                        alert('当前已是最新版本');
                    }
                }
            } catch (e) {
                console.error('[UpdateChecker] Check update error:', e);
                if (window.Core && window.Core.PopupService) {
                    window.Core.PopupService.showToast('检查更新失败');
                }
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        async handleRollback(version) {
            const confirmed = confirm(`确定要回滚到版本 ${version} 吗？\n当前版本（${this.getCurrentVersion()}）将被覆盖。`);

            if (confirmed) {
                await this.rollbackToVersion(version);
            }
        }
    }

    window.Core = window.Core || {};
    window.Core.UpdateChecker = new UpdateChecker();
    window.Core.VersionCacheDB = new VersionCacheDB();
})(window);
