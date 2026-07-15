(function(window) {
    'use strict';

    class BlobUrlService {
        constructor() {
            this._revokeTimers = new Map();
            // 引用计数：url -> count
            this._refCounts = new Map();
            // 分组管理：groupId -> Set<url>
            this._groups = new Map();
            // URL元数据：url -> {groupId, blob, createdAt}
            this._urlMetadata = new Map();
            // 调试模式
            this._debug = false;
            // 是否已注册自动清理
            this._autoCleanupRegistered = false;
        }

        isFileProtocol() {
            return window.location && window.location.protocol === 'file:';
        }

        /**
         * 创建Blob URL（带引用计数）
         * @param {Blob} blob - Blob对象
         * @param {Object} options - 选项
         * @param {string} options.groupId - 分组ID（用于批量清理）
         * @returns {string} Blob URL
         */
        createObjectUrl(blob, options = {}) {
            try {
                if (!blob) return '';
                if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
                
                const url = URL.createObjectURL(blob);
                const groupId = (options && typeof options === 'object' && options.groupId) ? String(options.groupId) : 'default';
                
                // 引用计数
                const currentCount = this._refCounts.get(url) || 0;
                this._refCounts.set(url, currentCount + 1);
                
                // 分组管理
                if (!this._groups.has(groupId)) {
                    this._groups.set(groupId, new Set());
                }
                this._groups.get(groupId).add(url);
                
                // 元数据
                this._urlMetadata.set(url, {
                    groupId: groupId,
                    blob: blob,
                    createdAt: Date.now()
                });
                
                if (this._debug) {
                    console.log('[BlobUrlService] 创建URL:', url, '引用计数:', currentCount + 1, '分组:', groupId);
                }
                
                return url;
            } catch (e) {
                if (this._debug) {
                    console.error('[BlobUrlService] 创建URL失败:', e);
                }
                return '';
            }
        }

        /**
         * 释放Blob URL（带引用计数）
         * @param {string} url - Blob URL
         * @param {boolean} force - 是否强制释放（忽略引用计数）
         */
        revokeObjectUrl(url, force = false) {
            if (!url) return;
            if (typeof url !== 'string') return;
            if (url.indexOf('blob:') !== 0) return;
            
            try {
                // 清除定时器
                const timer = this._revokeTimers.get(url);
                if (timer) {
                    clearTimeout(timer);
                    this._revokeTimers.delete(url);
                }
                
                // 引用计数处理
                const currentCount = this._refCounts.get(url) || 0;
                if (force || currentCount <= 1) {
                    // 引用计数为0或强制释放，真正释放URL
                    try {
                        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                            URL.revokeObjectURL(url);
                        }
                    } catch (e) {
                        if (this._debug) {
                            console.error('[BlobUrlService] 释放URL失败:', e);
                        }
                    }
                    
                    // 清理记录
                    this._refCounts.delete(url);
                    const metadata = this._urlMetadata.get(url);
                    if (metadata) {
                        const groupId = metadata.groupId;
                        if (this._groups.has(groupId)) {
                            this._groups.get(groupId).delete(url);
                            if (this._groups.get(groupId).size === 0) {
                                this._groups.delete(groupId);
                            }
                        }
                        this._urlMetadata.delete(url);
                    }
                    
                    if (this._debug) {
                        console.log('[BlobUrlService] 释放URL:', url);
                    }
                } else {
                    // 引用计数减1
                    this._refCounts.set(url, currentCount - 1);
                    if (this._debug) {
                        console.log('[BlobUrlService] URL引用计数减1:', url, '剩余:', currentCount - 1);
                    }
                }
            } catch (e) {
                if (this._debug) {
                    console.error('[BlobUrlService] 处理URL失败:', e);
                }
            }
        }
        
        /**
         * 增加URL引用计数
         * @param {string} url - Blob URL
         */
        addRef(url) {
            if (!url || typeof url !== 'string' || url.indexOf('blob:') !== 0) return;
            const currentCount = this._refCounts.get(url) || 0;
            this._refCounts.set(url, currentCount + 1);
            if (this._debug) {
                console.log('[BlobUrlService] URL引用计数+1:', url, '当前:', currentCount + 1);
            }
        }

        scheduleRevoke(url, delayMs = 5000) {
            if (!url) return;
            if (typeof url !== 'string') return;
            if (url.indexOf('blob:') !== 0) return;
            const ms = (typeof delayMs === 'number' && isFinite(delayMs)) ? Math.max(0, delayMs) : 5000;
            if (this._revokeTimers.has(url)) return;
            const timer = setTimeout(() => {
                this._revokeTimers.delete(url);
                try {
                    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        URL.revokeObjectURL(url);
                    }
                } catch (e) {}
            }, ms);
            this._revokeTimers.set(url, timer);
        }

        blobToDataUrl(blob) {
            return new Promise((resolve) => {
                try {
                    if (!blob || typeof FileReader === 'undefined') return resolve('');
                    const reader = new FileReader();
                    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(blob);
                } catch (e) {
                    resolve('');
                }
            });
        }

        async toDisplayUrl(blob, options = {}) {
            const opt = options && typeof options === 'object' ? options : {};
            const preferDataUrl = !!opt.preferDataUrl;
            const preferDataUrlInFileProtocol = opt.preferDataUrlInFileProtocol !== false;
            const groupId = opt.groupId || 'default';

            if (preferDataUrl) {
                return await this.blobToDataUrl(blob);
            }

            if (preferDataUrlInFileProtocol && this.isFileProtocol()) {
                const dataUrl = await this.blobToDataUrl(blob);
                if (dataUrl) return dataUrl;
            }

            return this.createObjectUrl(blob, { groupId: groupId });
        }
        
        /**
         * 清理指定分组的所有URL
         * @param {string} groupId - 分组ID
         * @param {boolean} force - 是否强制释放（忽略引用计数）
         */
        clearGroup(groupId) {
            if (!groupId) return;
            const groupIdStr = String(groupId);
            const urls = this._groups.get(groupIdStr);
            if (!urls || urls.size === 0) return;
            
            const urlArray = Array.from(urls);
            urlArray.forEach(url => {
                this.revokeObjectUrl(url, true); // 强制释放
            });
            
            if (this._debug) {
                console.log('[BlobUrlService] 清理分组:', groupIdStr, '释放了', urlArray.length, '个URL');
            }
        }
        
        /**
         * 清理所有URL（谨慎使用）
         */
        clearAll() {
            const allUrls = Array.from(this._refCounts.keys());
            allUrls.forEach(url => {
                this.revokeObjectUrl(url, true);
            });
            this._refCounts.clear();
            this._groups.clear();
            this._urlMetadata.clear();
            this._revokeTimers.clear();
            
            if (this._debug) {
                console.log('[BlobUrlService] 清理所有URL');
            }
        }
        
        /**
         * 获取调试信息
         * @returns {Object} 调试信息
         */
        getDebugInfo() {
            const groupStats = {};
            this._groups.forEach((urls, groupId) => {
                groupStats[groupId] = {
                    count: urls.size,
                    urls: Array.from(urls)
                };
            });
            
            return {
                totalUrls: this._refCounts.size,
                totalGroups: this._groups.size,
                groupStats: groupStats,
                refCounts: Object.fromEntries(this._refCounts),
                pendingRevokes: this._revokeTimers.size
            };
        }
        
        /**
         * 启用/禁用调试模式
         * @param {boolean} enabled - 是否启用
         */
        setDebug(enabled) {
            this._debug = !!enabled;
        }

        /**
         * 注册自动清理监听器（pagehide/beforeunload）
         * @param {string} groupId - 可选，仅清理指定分组；不传则清理所有
         */
        enableAutoCleanup(groupId = null) {
            if (this._autoCleanupRegistered) return;

            const cleanup = () => {
                if (this._debug) {
                    console.log('[BlobUrlService] 自动清理触发');
                }
                if (groupId != null) {
                    this.clearGroup(groupId);
                } else {
                    this.clearAll();
                }
            };

            // pagehide 事件（现代浏览器推荐，包括移动端）
            window.addEventListener('pagehide', cleanup);

            // beforeunload 作为备选（桌面浏览器）
            window.addEventListener('beforeunload', cleanup);

            this._autoCleanupRegistered = true;

            if (this._debug) {
                console.log('[BlobUrlService] 自动清理已注册', groupId ? `分组: ${groupId}` : '清理所有');
            }
        }

        /**
         * 简化的创建接口（兼容旧代码）
         * @param {Blob} blob - Blob对象
         * @param {string} groupId - 分组ID
         * @returns {string} Blob URL
         */
        create(blob, groupId) {
            return this.createObjectUrl(blob, { groupId: groupId || 'default' });
        }

        /**
         * 简化的释放接口（兼容旧代码）
         * @param {string} url - Blob URL
         */
        revoke(url) {
            this.revokeObjectUrl(url, false);
        }
    }

    window.Core = window.Core || {};
    window.Core.BlobUrlService = window.Core.BlobUrlService || new BlobUrlService();

})(window);
