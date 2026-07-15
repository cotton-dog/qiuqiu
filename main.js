        window.addEventListener('DOMContentLoaded', function() {
            window.Core = window.Core || {};
            window.Core._loadPromises = window.Core._loadPromises || {};
            
            // 等待核心服务加载的 Promise
            window.Core.waitForService = function(serviceName) {
                if (window.Core[serviceName]) {
                    return Promise.resolve(window.Core[serviceName]);
                }
                if (window.Core._loadPromises[serviceName]) {
                    return window.Core._loadPromises[serviceName];
                }
                return Promise.resolve(null);
            };
        });
    </script>

        function _getPostTargetOrigin() {
            const origin = window.location.origin;
            return origin && origin !== 'null' ? origin : '*';
        }

        function _isAllowedMessageOrigin(origin) {
            const expected = window.location.origin;
            if (!expected || expected === 'null') return true;
            return origin === expected;
        }

        window.addEventListener('message', (event) => {
            if (!_isAllowedMessageOrigin(event.origin)) return;
            if (event.data && event.data.type === 'wechatAppDataChanged') {
                loadCharactersFromWechat().then(chars => renderCharacters(chars));
            }
        });

        let albumsData = [];

        // 全局变量
        let currentAlbumId = null;
        let currentViewMode = 'none';
        let currentRatio = 'ratio-1-1';
        let groupedPhotos = {};
        let nextPhotoId = 1;
        let nextAlbumId = 1;
        let editAlbumId = null;
        let selectedFiles = [];
        let isLocalImport = false;
        let draggingItem = null;

        // DOM元素
        const albumContainer = document.getElementById('albumContainer');
        const emptyState = document.getElementById('emptyState');
        const albumsNav = document.getElementById('albumsNav');
        const menuBtn = document.getElementById('menuBtn');
        const menuModal = document.getElementById('menuModal');
        const createAlbumMenuItem = document.getElementById('createAlbumMenuItem');
        const createPhotoMenuItem = document.getElementById('createPhotoMenuItem');
        const changeGroupingMenuItem = document.getElementById('changeGroupingMenuItem');
        const changeRatioMenuItem = document.getElementById('changeRatioMenuItem');
        const beautifyMenuItem = document.getElementById('beautifyMenuItem');
        const currentGroupingText = document.getElementById('currentGroupingText');
        const currentRatioText = document.getElementById('currentRatioText');
        const beautifyModal = document.getElementById('beautifyModal');
        const closeBeautifyBtn = document.getElementById('closeBeautifyBtn');
        const roleBgPreview = document.getElementById('roleBgPreview');
        const roleBgPreviewLabel = document.getElementById('roleBgPreviewLabel');
        const roleBgPickBtn = document.getElementById('roleBgPickBtn');
        const roleBgClearBtn = document.getElementById('roleBgClearBtn');
        const roleBgFileInput = document.getElementById('roleBgFileInput');
        const namecardBgPreview = document.getElementById('namecardBgPreview');
        const namecardBgPreviewLabel = document.getElementById('namecardBgPreviewLabel');
        const namecardBgPickBtn = document.getElementById('namecardBgPickBtn');
        const namecardBgClearBtn = document.getElementById('namecardBgClearBtn');
        const namecardBgFileInput = document.getElementById('namecardBgFileInput');
        const roleBgTitle = document.getElementById('roleBgTitle');
        const namecardBgTitle = document.getElementById('namecardBgTitle');
        const createAlbumModal = document.getElementById('createAlbumModal');
        const closeCreateAlbumBtn = document.getElementById('closeCreateAlbumBtn');
        const cancelCreateAlbumBtn = document.getElementById('cancelCreateAlbumBtn');
        const createAlbumForm = document.getElementById('createAlbumForm');
        const createPhotoModal = document.getElementById('createPhotoModal');
        const closeCreatePhotoBtn = document.getElementById('closeCreatePhotoBtn');
        const cancelCreatePhotoBtn = document.getElementById('cancelCreatePhotoBtn');
        const createPhotoForm = document.getElementById('createPhotoForm');
        const photoAlbumSelect = document.getElementById('photoAlbumSelect');
        const urlImportBtn = document.getElementById('urlImportBtn');
        const localImportBtn = document.getElementById('localImportBtn');
        const urlImportSection = document.getElementById('urlImportSection');
        const localImportSection = document.getElementById('localImportSection');
        const fileInput = document.getElementById('fileInput');
        const fileImportArea = document.getElementById('fileImportArea');
        const previewImages = document.getElementById('previewImages');
        const photoUrlInput = document.getElementById('photoUrl');
        const groupingModal = document.getElementById('groupingModal');
        const closeGroupingBtn = document.getElementById('closeGroupingBtn');
        const cancelGroupingBtn = document.getElementById('cancelGroupingBtn');
        const saveGroupingBtn = document.getElementById('saveGroupingBtn');
        const ratioModal = document.getElementById('ratioModal');
        const closeRatioBtn = document.getElementById('closeRatioBtn');
        const cancelRatioBtn = document.getElementById('cancelRatioBtn');
        const saveRatioBtn = document.getElementById('saveRatioBtn');
        const moveAlbumModal = document.getElementById('moveAlbumModal');
        const closeMoveAlbumBtn = document.getElementById('closeMoveAlbumBtn');
        const cancelMoveAlbumBtn = document.getElementById('cancelMoveAlbumBtn');
        const saveMoveAlbumBtn = document.getElementById('saveMoveAlbumBtn');
        const albumMoveList = document.getElementById('albumMoveList');
        const imagePreviewModal = document.getElementById('imagePreviewModal');
        const closeImagePreviewBtn = document.getElementById('closeImagePreviewBtn');
        const deleteImagePreviewBtn = document.getElementById('deleteImagePreviewBtn');
        const imagePreview = document.getElementById('imagePreview');
        const imageInfo = document.getElementById('imageInfo');
        const editAlbumMenu = document.getElementById('editAlbumMenu');
        const deleteAlbumBtn = document.getElementById('deleteAlbumBtn');
        const moveAlbumEditBtn = document.getElementById('moveAlbumEditBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const createPhotoBtn = document.getElementById('createPhotoBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const viewAlbumBtn = document.getElementById('viewAlbumBtn');
        const topNavTitle = document.getElementById('topNavTitle');
        const topNavTitleText = document.getElementById('topNavTitleText');
        const topNavTitleIconWrap = document.getElementById('topNavTitleIconWrap');
        const topNavTitleIcon = document.getElementById('topNavTitleIcon');
        const topNavTitleImg = document.getElementById('topNavTitleImg');
        const charactersPage = document.getElementById('charactersPage');
        const albumPage = document.getElementById('albumPage');
        const charactersGrid = document.getElementById('charactersGrid');
        const charactersEmpty = document.getElementById('charactersEmpty');
        const pageSpinnerMask = document.getElementById('pageSpinnerMask');

        let selectedCharacter = null;
        let beautifyContext = { type: 'character' };
        let systemMenuAnchor = null;

        // IndexedDB Helper (Delegated to Core)
        window.ImageStorageDB = {
            dbName: 'PhoneAppImages',
            version: 5,
            _initPromise: null,

            // Helper to convert IDBRequest to Promise
            _req(request) {
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            },

            async init() {
                if (window.Core && window.Core.StorageService) {
                    const storage = window.Core.StorageService;
                    const ensureSchema = (db) => {
                        if (!db.objectStoreNames.contains('images')) {
                            const store = db.createObjectStore('images', { keyPath: 'id' });
                            store.createIndex('type', 'type', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('appData')) {
                            db.createObjectStore('appData', { keyPath: 'key' });
                        }
                    };

                    let db = await storage.openDB(this.dbName, this.version, ensureSchema);
                    if (!db.objectStoreNames.contains('images') || !db.objectStoreNames.contains('appData')) {
                        try { db.close(); } catch (e) {}
                        db = await storage.openDB(this.dbName, this.version + 1, ensureSchema);
                    }
                    return db;
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

            async put(id, imageData, type = 'image') {
                const db = await this._ensureInit();
                if (!db || !window.Core || !window.Core.StorageService) {
                    console.warn('图片存储不可用，无法保存:', id);
                    return null;
                }
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
                    if (!result) return null;
                    if (result.data != null) return result.data;
                    if (result.imageData != null) return result.imageData;
                    return null;
                });
            },

            async getAppData(key) {
                 await this._ensureInit();
                 return window.Core.StorageService.transaction(this.dbName, ['appData'], async (tx) => {
                    const store = tx.objectStore('appData');
                    const result = await this._req(store.get(key));
                    return result ? result.value : null;
                });
            }
        };

        function showPageLoader() {
            pageSpinnerMask.classList.add('show');
        }

        function hidePageLoader() {
            pageSpinnerMask.classList.remove('show');
        }

        function hashToIndex(input, mod) {
            const str = String(input || '');
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
            }
            return mod === 0 ? 0 : hash % mod;
        }

        function generateTextAvatar(text, seed, colorKey) {
            const colorMap = {
                'bg-mauve': '#c9b1be',
                'bg-dusty-rose': '#d8a8a8',
                'bg-sage': '#b1c2a9',
                'bg-stone': '#a8a8a8',
                'bg-clay': '#b8a38d',
                'bg-slate': '#8a9ba3',
                'bg-moss': '#8a9d8a',
                'bg-sand': '#d9c7b4'
            };
            const override = colorKey ? String(colorKey) : '';
            const palette = ['#2196F3', '#1976D2', '#26A69A', '#7E57C2', '#FF7043', '#8D6E63', '#546E7A'];
            const bg = (override && colorMap[override]) || (override && /^#/.test(override) ? override : '') || palette[hashToIndex(seed, palette.length)] || '#2196F3';
            const safeText = String(text || '').trim().slice(0, 2) || '友';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="32" ry="32" fill="${bg}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="96" fill="#fff">${safeText}</text></svg>`;
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        }

        function getPhotoFallback() {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" rx="48" ry="48" fill="#f2f3f5"/><path d="M240 300h320a40 40 0 0 1 40 40v220a40 40 0 0 1-40 40H240a40 40 0 0 1-40-40V340a40 40 0 0 1 40-40z" fill="#dfe3ea"/><circle cx="340" cy="420" r="44" fill="#c9d0db"/><path d="M240 560l130-140 80 90 90-100 120 150H240z" fill="#c9d0db"/></svg>`;
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        }

        function toBackgroundCssUrlValue(input) {
            const safe = String(input || '').replace(/"/g, '%22');
            return safe ? `url("${safe}")` : 'none';
        }

        function normalizePlainSrc(input) {
            if (input == null) return '';
            if (typeof input !== 'string') return '';
            let s = input.trim();
            if (!s) return '';
            if (s === '[object Blob]') return '';
            if (s.startsWith('url(')) {
                const inner = s.replace(/^url\(\s*/i, '').replace(/\)\s*$/, '');
                s = inner.trim().replace(/^['"]|['"]$/g, '');
            }
            if (!s) return '';
            if (s.startsWith('blob:') && (s.startsWith('blob:file:') || window.location.protocol === 'file:')) return '';
            return s;
        }

        // 使用BlobUrlService统一管理Blob URL，移除本地缓存Map
        const idbMediaUrlPromiseCache = new Map(); // 保留Promise缓存避免重复请求
        const GROUP_ID = 'gallery'; // 相册页面的分组ID

        // 获取BlobUrlService实例（支持iframe嵌套）
        function getBlobUrlService() {
            if (window.parent && window.parent.Core && window.parent.Core.BlobUrlService) {
                return window.parent.Core.BlobUrlService;
            }
            if (window.Core && window.Core.BlobUrlService) {
                return window.Core.BlobUrlService;
            }
            return null;
        }

        // 注册自动清理（在页面隐藏/卸载时自动清理所有Blob URL）
        (function() {
            const blobUrlService = getBlobUrlService();
            if (blobUrlService && typeof blobUrlService.enableAutoCleanup === 'function') {
                blobUrlService.enableAutoCleanup(GROUP_ID);
            }
        })();

        async function resolveIdbSrc(src) {
            if (!src || typeof src !== 'string' || !src.startsWith('idb:')) return src;
            const id = src.slice(4);
            if (!id) return '';

            // 检查是否有正在进行的请求
            const inflight = idbMediaUrlPromiseCache.get(id);
            if (inflight) return inflight;

            const task = (async () => {
                const data = await window.ImageStorageDB.get(id);
                if (!data) return '';
                
                const blobUrlService = getBlobUrlService();
                
                if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
                    // 使用BlobUrlService统一管理Blob URL
                    if (blobUrlService && typeof blobUrlService.toDisplayUrl === 'function') {
                        const url = await blobUrlService.toDisplayUrl(data, { 
                            preferDataUrlInFileProtocol: true,
                            groupId: GROUP_ID 
                        });
                        return url;
                    }

                    // 降级：直接创建URL
                    if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                        const url = blobUrlService.createObjectUrl(data, { groupId: GROUP_ID });
                        return url;
                    }
                    const url = URL.createObjectURL(data);
                    return url;
                }
                
                if (typeof data === 'string') {
                    return data;
                }
                
                return '';
            })();

            idbMediaUrlPromiseCache.set(id, task);

            try {
                return await task;
            } catch (e) {
                return '';
            } finally {
                if (idbMediaUrlPromiseCache.get(id) === task) {
                    idbMediaUrlPromiseCache.delete(id);
                }
            }
        }

        async function setupImageLoading(stateEl, imgEl, src, fallbackSrc) {
            stateEl.classList.remove('is-loaded', 'is-ready', 'is-error');
            if (imgEl && imgEl.dataset) imgEl.dataset.fallbackApplied = '';
            
            let finalSrc = normalizePlainSrc(src);
            
            // Handle IndexedDB source
            if (finalSrc && finalSrc.startsWith('idb:')) {
                const resolved = await resolveIdbSrc(finalSrc);
                finalSrc = normalizePlainSrc(resolved) || normalizePlainSrc(fallbackSrc);
            }

            imgEl.onload = () => {
                stateEl.classList.add('is-ready');
            };

            imgEl.onerror = () => {
                if (!imgEl.dataset.fallbackApplied && fallbackSrc) {
                    imgEl.dataset.fallbackApplied = '1';
                    imgEl.src = normalizePlainSrc(fallbackSrc);
                    return;
                }
                stateEl.classList.add('is-error');
            };
            
            if (finalSrc) {
                imgEl.src = finalSrc;
            } else if (fallbackSrc) {
                imgEl.src = normalizePlainSrc(fallbackSrc);
            } else {
                stateEl.classList.add('is-error');
            }
        }

        window.addEventListener('pageshow', (e) => {
            if (!e || !e.persisted) return;
            // 页面恢复时清理Promise缓存
            idbMediaUrlPromiseCache.clear();
            try {
                showPageLoader();
                if (document.body.classList.contains('album-mode') && selectedCharacter) {
                    requestAnimationFrame(() => {
                        showAlbumPage(selectedCharacter);
                        setTimeout(hidePageLoader, 180);
                    });
                } else {
                    showCharactersPage();
                    loadCharactersFromWechat().then(chars => {
                        renderCharacters(chars);
                        hidePageLoader();
                    }).catch(() => hidePageLoader());
                }
            } catch (err) {
                hidePageLoader();
            }
        });

        async function setupCardBackgroundLoading(cardEl, src, fallbackSrc) {
            const toCssUrlValue = (input) => {
                const safe = String(normalizePlainSrc(input) || '').replace(/"/g, '%22');
                return safe ? `url("${safe}")` : 'none';
            };

            cardEl.classList.remove('is-loaded', 'is-error');

            let currentSrc = normalizePlainSrc(src);
            let fallbackApplied = false;
            
            // Handle IndexedDB source
            if (currentSrc && currentSrc.startsWith('idb:')) {
                const resolved = await resolveIdbSrc(currentSrc);
                if (resolved) {
                    currentSrc = normalizePlainSrc(resolved);
                } else {
                    currentSrc = normalizePlainSrc(fallbackSrc);
                    fallbackApplied = true;
                }
            }

            const loader = new Image();

            const applyBackground = (finalSrc) => {
                cardEl.style.setProperty('--character-bg', toCssUrlValue(finalSrc));
            };

            loader.onload = () => {
                applyBackground(currentSrc);
                cardEl.classList.add('is-ready');
            };

            loader.onerror = () => {
                if (!fallbackApplied && fallbackSrc) {
                    fallbackApplied = true;
                    currentSrc = fallbackSrc;
                    loader.src = currentSrc;
                    return;
                }
                cardEl.classList.add('is-error');
            };

            if (currentSrc) {
                loader.src = currentSrc;
            } else if (fallbackSrc) {
                fallbackApplied = true;
                currentSrc = normalizePlainSrc(fallbackSrc);
                loader.src = currentSrc;
            } else {
                cardEl.classList.add('is-error');
            }
        }

        function setHeaderToCharacters() {
            topNavTitleText.textContent = '角色';
            topNavTitleIcon.className = 'fas fa-user-friends';
            topNavTitleIcon.style.display = '';
            topNavTitleImg.style.display = 'none';
            topNavTitleImg.removeAttribute('src');
        }

        function setHeaderToCharacter(character) {
            topNavTitleText.textContent = (character && character.name) || '图集';
            topNavTitleIcon.style.display = 'none';
            topNavTitleImg.style.display = '';
            const fallback = generateTextAvatar(
                (character && character.avatarText) || (((character && character.name) || '友').slice(0, 1)),
                (character && character.id) || (character && character.name) || 'friend'
            );
            topNavTitleImg.dataset.fallbackApplied = '';
            
            const src = (character && character.avatarSrc) || fallback;
            const normalizedSrc = normalizePlainSrc(src);
            if (src && src.startsWith('idb:')) {
                resolveIdbSrc(src).then(resolved => {
                    topNavTitleImg.src = normalizePlainSrc(resolved) || normalizePlainSrc(fallback);
                }).catch(() => {
                    topNavTitleImg.src = normalizePlainSrc(fallback);
                });
            } else {
                topNavTitleImg.src = normalizedSrc || normalizePlainSrc(fallback);
            }

            topNavTitleImg.onerror = () => {
                if (!topNavTitleImg.dataset.fallbackApplied) {
                    topNavTitleImg.dataset.fallbackApplied = '1';
                    topNavTitleImg.src = fallback;
                }
            };
        }

        function showCharactersPage() {
            document.body.classList.add('characters-mode');
            document.body.classList.remove('album-mode');
            charactersPage.classList.remove('hidden');
            albumPage.classList.add('hidden');
            selectedCharacter = null;
            applyBeautifyForHome();
            setHeaderToCharacters();
            closeAllModals();
        }

        function showAlbumPage(character) {
            selectedCharacter = character;
            document.body.classList.remove('characters-mode');
            document.body.classList.add('album-mode');
            document.body.classList.remove('home-beautify');
            charactersPage.classList.add('hidden');
            albumPage.classList.remove('hidden');
            setHeaderToCharacter(character);
            applyBeautifyForCharacter(character && character.id);
            loadAlbumsForCharacter(character && character.id);
            currentViewMode = loadGroupingForCharacter(character && character.id);
            renderAlbumsNav();
            groupPhotos();
            renderAlbum();
            updateMenuTexts();
        }

        function getAlbumsStorageKey(characterId) {
            return `photo_albums_${String(characterId || 'default')}`;
        }

        function getGroupingStorageKey(characterId) {
            return `album_grouping_${String(characterId || 'default')}`;
        }

        function normalizeGroupingMode(input) {
            const mode = String(input || '').trim();
            if (mode === 'none' || mode === 'date' || mode === 'month' || mode === 'year') return mode;
            return 'none';
        }

        function loadGroupingForCharacter(characterId) {
            try {
                return normalizeGroupingMode(localStorage.getItem(getGroupingStorageKey(characterId)));
            } catch (e) {
                return 'none';
            }
        }

        function saveGroupingForCurrentCharacter(mode) {
            if (!selectedCharacter || !selectedCharacter.id) return;
            try {
                localStorage.setItem(getGroupingStorageKey(selectedCharacter.id), normalizeGroupingMode(mode));
            } catch (e) {}
        }

        function getBeautifyStorageKey(characterId) {
            return `character_beautify_${String(characterId || 'default')}`;
        }

        function getHomeBeautifyStorageKey() {
            return 'album_home_beautify';
        }

        function normalizeBeautifySettings(input) {
            return {
                roleBgSrc: input && typeof input.roleBgSrc === 'string' ? input.roleBgSrc : '',
                namecardBgSrc: input && typeof input.namecardBgSrc === 'string' ? input.namecardBgSrc : ''
            };
        }

        function readBeautifyLegacy(raw) {
            if (!raw) return { roleBgSrc: '', namecardBgSrc: '' };
            try {
                return normalizeBeautifySettings(JSON.parse(raw));
            } catch (e) {
                return { roleBgSrc: '', namecardBgSrc: '' };
            }
        }

        function loadBeautifyForHome() {
            try {
                const roleBg = localStorage.getItem('album_home_bg_role');
                const namecardBg = localStorage.getItem('album_home_bg_namecard');
                const legacyRaw = localStorage.getItem(getHomeBeautifyStorageKey());

                if (roleBg !== null || namecardBg !== null) {
                    const legacy = (roleBg === null || namecardBg === null) ? readBeautifyLegacy(legacyRaw) : { roleBgSrc: '', namecardBgSrc: '' };
                    return {
                        roleBgSrc: roleBg !== null ? (roleBg || '') : legacy.roleBgSrc,
                        namecardBgSrc: namecardBg !== null ? (namecardBg || '') : legacy.namecardBgSrc
                    };
                }

                return readBeautifyLegacy(legacyRaw);
            } catch (e) {
                return { roleBgSrc: '', namecardBgSrc: '' };
            }
        }

        async function saveBeautifyForHome(settings) {
            const next = normalizeBeautifySettings(settings);

            try {
                // Save role background to DB if it's base64
                if (next.roleBgSrc && next.roleBgSrc.startsWith('data:image')) {
                    const id = 'home_bg_role_' + Date.now();
                    try {
                        const blob = await (await fetch(next.roleBgSrc)).blob();
                        await window.ImageStorageDB.put(id, blob, 'background');
                        next.roleBgSrc = 'idb:' + id;
                    } catch (e) {
                        console.error('Failed to save role bg to DB', e);
                    }
                }

                // Save namecard background to DB if it's base64
                if (next.namecardBgSrc && next.namecardBgSrc.startsWith('data:image')) {
                    const id = 'home_bg_namecard_' + Date.now();
                    try {
                        const blob = await (await fetch(next.namecardBgSrc)).blob();
                        await window.ImageStorageDB.put(id, blob, 'background');
                        next.namecardBgSrc = 'idb:' + id;
                    } catch (e) {
                        console.error('Failed to save namecard bg to DB', e);
                    }
                }

                localStorage.setItem('album_home_bg_role', String(next.roleBgSrc || '').trim());
                localStorage.setItem('album_home_bg_namecard', String(next.namecardBgSrc || '').trim());
                localStorage.removeItem(getHomeBeautifyStorageKey());
                return true;
            } catch (e) {
                alert('保存失败。');
                return false;
            }
        }

        function hasBeautifyBackgrounds(settings) {
            const roleBgSrc = String(settings && settings.roleBgSrc ? settings.roleBgSrc : '').trim();
            const namecardBgSrc = String(settings && settings.namecardBgSrc ? settings.namecardBgSrc : '').trim();
            return !!(roleBgSrc || namecardBgSrc);
        }

        function loadBeautifyForCharacter(characterId) {
            try {
                const roleKey = `album_character_${characterId}_bg_role`;
                const namecardKey = `album_character_${characterId}_bg_namecard`;
                const roleBg = localStorage.getItem(roleKey);
                const namecardBg = localStorage.getItem(namecardKey);
                const legacyRaw = localStorage.getItem(getBeautifyStorageKey(characterId));

                if (roleBg !== null || namecardBg !== null) {
                    const legacy = (roleBg === null || namecardBg === null) ? readBeautifyLegacy(legacyRaw) : { roleBgSrc: '', namecardBgSrc: '' };
                    return {
                        roleBgSrc: roleBg !== null ? (roleBg || '') : legacy.roleBgSrc,
                        namecardBgSrc: namecardBg !== null ? (namecardBg || '') : legacy.namecardBgSrc
                    };
                }

                return readBeautifyLegacy(legacyRaw);
            } catch (e) {
                return { roleBgSrc: '', namecardBgSrc: '' };
            }
        }

        async function saveBeautifyForCurrentCharacter(settings) {
            if (!selectedCharacter || !selectedCharacter.id) return;
            const next = normalizeBeautifySettings(settings);
            const roleKey = `album_character_${selectedCharacter.id}_bg_role`;
            const namecardKey = `album_character_${selectedCharacter.id}_bg_namecard`;

            try {
                // Save role background to DB if it's base64
                if (next.roleBgSrc && next.roleBgSrc.startsWith('data:image')) {
                    const id = `character_${selectedCharacter.id}_bg_role_` + Date.now();
                    try {
                        const blob = await (await fetch(next.roleBgSrc)).blob();
                        await window.ImageStorageDB.put(id, blob, 'background');
                        next.roleBgSrc = 'idb:' + id;
                    } catch (e) {
                        console.error('Failed to save role bg to DB', e);
                    }
                }

                // Save namecard background to DB if it's base64
                if (next.namecardBgSrc && next.namecardBgSrc.startsWith('data:image')) {
                    const id = `character_${selectedCharacter.id}_bg_namecard_` + Date.now();
                    try {
                        const blob = await (await fetch(next.namecardBgSrc)).blob();
                        await window.ImageStorageDB.put(id, blob, 'background');
                        next.namecardBgSrc = 'idb:' + id;
                    } catch (e) {
                        console.error('Failed to save namecard bg to DB', e);
                    }
                }

                localStorage.setItem(roleKey, String(next.roleBgSrc || '').trim());
                localStorage.setItem(namecardKey, String(next.namecardBgSrc || '').trim());
                localStorage.removeItem(getBeautifyStorageKey(selectedCharacter.id));
                return true;
            } catch (e) {
                alert('保存失败。');
                return false;
            }
        }

        function applyBeautifySettings(settings) {
            const roleBgSrc = settings && settings.roleBgSrc ? settings.roleBgSrc : '';
            const namecardBgSrc = settings && settings.namecardBgSrc ? settings.namecardBgSrc : '';

            const applyVar = (name, src) => {
                const raw = String(src || '').trim();
                if (raw === '[object Blob]') {
                    document.body.style.setProperty(name, 'none');
                    return;
                }
                if (!raw) {
                    document.body.style.setProperty(name, 'none');
                    return;
                }
                if (raw.startsWith('idb:')) {
                    resolveIdbSrc(raw).then(resolved => {
                        document.body.style.setProperty(name, toBackgroundCssUrlValue(resolved));
                    }).catch(() => {
                        document.body.style.setProperty(name, 'none');
                    });
                    return;
                }
                document.body.style.setProperty(name, toBackgroundCssUrlValue(raw));
            };

            applyVar('--role-bg', roleBgSrc);
            applyVar('--namecard-bg', namecardBgSrc);
        }

        function resetBeautifyStyles() {
            document.body.style.removeProperty('--role-bg');
            document.body.style.removeProperty('--namecard-bg');
        }

        function applyBeautifyForCharacter(characterId) {
            if (!characterId) {
                resetBeautifyStyles();
                return;
            }
            applyBeautifySettings(loadBeautifyForCharacter(characterId));
        }

        function applyBeautifyForHome() {
            const settings = loadBeautifyForHome();
            if (!hasBeautifyBackgrounds(settings)) {
                document.body.classList.remove('home-beautify');
                resetBeautifyStyles();
                return;
            }
            document.body.classList.add('home-beautify');
            applyBeautifySettings(settings);
        }

        function loadAlbumsForCharacter(characterId) {
            albumsData = [];
            currentAlbumId = null;
            nextAlbumId = 1;
            nextPhotoId = 1;

            const raw = localStorage.getItem(getAlbumsStorageKey(characterId));
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        albumsData = parsed;
                    }
                } catch (e) {}
            }

            const albumIds = albumsData.map(a => a && a.id).filter(v => typeof v === 'number');
            nextAlbumId = albumIds.length ? Math.max(...albumIds) + 1 : 1;
            const photoIds = albumsData
                .reduce((acc, a) => acc.concat((a && Array.isArray(a.photos) ? a.photos : [])), [])
                .map(p => p && p.id)
                .filter(v => typeof v === 'number');
            nextPhotoId = photoIds.length ? Math.max(...photoIds) + 1 : 1;

            currentAlbumId = albumsData.length ? albumsData[0].id : null;
        }

        function saveAlbumsForCurrentCharacter() {
            if (!selectedCharacter || !selectedCharacter.id) return;
            try {
                localStorage.setItem(getAlbumsStorageKey(selectedCharacter.id), JSON.stringify(albumsData));
            } catch (e) {
                console.error('保存失败:', e);
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    alert('存储空间已满，无法保存更多照片。请删除一些照片后重试。');
                } else {
                    alert('保存数据失败: ' + e.message);
                }
            }
        }

        async function loadCharactersFromWechat() {
            let appData = null;
            
            // Try IndexedDB first
            try {
                appData = await window.ImageStorageDB.getAppData('wechatAppData');
            } catch (e) {
                console.error('Failed to load from IDB', e);
            }
            
            // Fallback to localStorage
            if (!appData) {
                const raw = localStorage.getItem('wechatAppData');
                if (raw) {
                    try {
                        appData = JSON.parse(raw);
                    } catch (e) {}
                }
            }

            if (!appData) return [];

            try {
                const contacts = Array.isArray(appData && appData.contacts) ? appData.contacts : [];
                return contacts.map(c => {
                    const hasCustom = !!(c && c.hasCustomAvatar);
                    const avatarKey = `avatar_${c && c.id}`;
                    const avatarData = hasCustom ? normalizePlainSrc(localStorage.getItem(avatarKey) || '') : '';
                    const avatarText = (c && c.avatarText) || (c && c.name ? c.name.slice(0, 1) : '友');
                    const avatarColor = c && c.avatarColor ? c.avatarColor : '';
                    const avatarFallback = generateTextAvatar(avatarText, (c && c.id) || (c && c.name) || avatarText, avatarColor);
                    return {
                        id: c && c.id,
                        name: (c && c.name) || '未命名',
                        avatarText,
                        avatarColor,
                        avatarSrc: avatarData || normalizePlainSrc(avatarFallback),
                        avatarFallback
                    };
                }).filter(c => c.id != null);
            } catch (e) {
                return [];
            }
        }

        function renderCharacters(characters) {
            charactersGrid.innerHTML = '';
            if (!characters || characters.length === 0) {
                charactersEmpty.style.display = 'block';
                return;
            }
            charactersEmpty.style.display = 'none';

            characters.forEach(character => {
                const card = document.createElement('div');
                card.className = 'character-card';
                card.dataset.id = character.id;

                const skeleton = document.createElement('div');
                skeleton.className = 'img-skeleton';
                const errorEl = document.createElement('div');
                errorEl.className = 'img-error';
                errorEl.innerHTML = '<i class="fas fa-image"></i>';
                card.appendChild(skeleton);
                card.appendChild(errorEl);
                setupCardBackgroundLoading(card, character.avatarSrc, character.avatarFallback);

                const badge = document.createElement('div');
                badge.className = 'character-badge';
                const badgeSkeleton = document.createElement('div');
                badgeSkeleton.className = 'img-skeleton';
                const badgeError = document.createElement('div');
                badgeError.className = 'img-error';
                badgeError.innerHTML = '<i class="fas fa-user"></i>';
                const badgeImg = document.createElement('img');
                badgeImg.alt = '';
                badgeImg.loading = 'lazy';
                // badgeImg.src = character.avatarSrc; // Moved to setupImageLoading
                badge.appendChild(badgeSkeleton);
                badge.appendChild(badgeError);
                badge.appendChild(badgeImg);
                setupImageLoading(badge, badgeImg, character.avatarSrc, character.avatarFallback);

                const name = document.createElement('div');
                name.className = 'character-name';
                name.textContent = character.name;

                card.appendChild(name);
                card.appendChild(badge);

                card.addEventListener('click', () => {
                    showPageLoader();
                    requestAnimationFrame(() => {
                        showAlbumPage(character);
                        setTimeout(hidePageLoader, 180);
                    });
                });

                charactersGrid.appendChild(card);
            });
        }

        // 初始化函数
        async function init() {
            await window.ImageStorageDB.init().catch(error => {
                console.error('IndexedDB初始化失败:', error);
            });
            document.addEventListener('click', () => {
                window.parent.postMessage({ type: 'iframe_click' }, _getPostTargetOrigin());
            }, true);

            const today = new Date().toISOString().split('T')[0];
            document.getElementById('photoDate').value = today;
            
            // 初始化裁剪组件
            if (typeof initCropModal === 'function') {
                initCropModal();
            }

            // 绑定事件
            bindEvents();

            showCharactersPage();
            showPageLoader();

            loadCharactersFromWechat().then(chars => {
                renderCharacters(chars);
                hidePageLoader();
                try {
                    window.parent.postMessage({ type: 'app_ready', appId: 'xiangce' }, _getPostTargetOrigin());
                } catch (e) {
                    console.error('Failed to send app_ready message:', e);
                }
            }).catch(() => {
                try {
                    window.parent.postMessage({ type: 'app_ready', appId: 'xiangce' }, _getPostTargetOrigin());
                } catch (e) {
                    console.error('Failed to send app_ready message:', e);
                }
            });

            window.addEventListener('storage', (e) => {
                if (e.key === 'wechatAppData' || e.key === 'wechatAppData_rev' || (e.key && e.key.startsWith('avatar_'))) {
                    loadCharactersFromWechat().then(chars => renderCharacters(chars));
                }
            });
        }

        // 绑定所有事件
        function bindEvents() {
            // 顶部菜单按钮
            menuBtn.addEventListener('click', openMenuModal);

            topNavTitleIconWrap.addEventListener('click', (e) => {
                if (!document.body.classList.contains('album-mode')) return;
                e.stopPropagation();
                showPageLoader();
                requestAnimationFrame(() => {
                    showCharactersPage();
                    setTimeout(hidePageLoader, 160);
                });
            });

        if (topNavTitle) {
            topNavTitle.style.cursor = 'pointer';
            topNavTitle.addEventListener('click', (e) => {
                    // 如果在图集模式（角色详情页），点击标题返回角色列表页
                    if (document.body.classList.contains('album-mode')) {
                        e.preventDefault();
                        e.stopPropagation();
                        showPageLoader();
                        requestAnimationFrame(() => {
                            showCharactersPage();
                            setTimeout(hidePageLoader, 160);
                        });
                        return;
                    }

                    // 如果在角色列表页，点击"角色"标题返回手机主页（如果需要的话，但通常由返回按钮处理）
                    // 这里保留原有逻辑，或者是用户意图是点击标题也能退出？
                    // 原逻辑是：只有当标题是"角色"时才退出
                    if ((((topNavTitleText && topNavTitleText.textContent) || '')).trim() !== '角色') return;
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'closeApp', appId: 'xiangce' }, _getPostTargetOrigin());
                            return;
                        }
                    } catch (err) {}
                    window.location.href = 'index.html';
                });
            }
            
            // 菜单项点击事件
            createAlbumMenuItem.addEventListener('click', () => {
                closeAllModals();
                openCreateAlbumModal();
            });
            
            createPhotoMenuItem.addEventListener('click', () => {
                closeAllModals();
                openCreatePhotoModal();
            });
            
            changeGroupingMenuItem.addEventListener('click', () => {
                closeAllModals();
                openGroupingModal();
            });
            
            changeRatioMenuItem.addEventListener('click', () => {
                closeAllModals();
                openRatioModal();
            });

            beautifyMenuItem.addEventListener('click', () => {
                closeAllModals();
                openBeautifyModal();
            });
            
            // 底部操作栏
            createPhotoBtn.addEventListener('click', openCreatePhotoModal);
            settingsBtn.addEventListener('click', openMenuModal);
            
            // 添加图集模态框
            closeCreateAlbumBtn.addEventListener('click', closeAllModals);
            cancelCreateAlbumBtn.addEventListener('click', closeAllModals);
            createAlbumForm.addEventListener('submit', handleCreateAlbumSubmit);
            
            // 添加照片模态框
            closeCreatePhotoBtn.addEventListener('click', closeAllModals);
            cancelCreatePhotoBtn.addEventListener('click', closeAllModals);
            createPhotoForm.addEventListener('submit', handleCreatePhotoSubmit);
            
            // 上传方式切换
            urlImportBtn.addEventListener('click', () => switchImportMode(false));
            localImportBtn.addEventListener('click', () => switchImportMode(true));
            
            // 文件上传相关
            fileImportArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleFileSelect);
            fileImportArea.addEventListener('dragover', handleDragOver);
            fileImportArea.addEventListener('drop', handleFileDrop);
            
            // 分组方式模态框
            closeGroupingBtn.addEventListener('click', closeAllModals);
            cancelGroupingBtn.addEventListener('click', closeAllModals);
            saveGroupingBtn.addEventListener('click', saveGrouping);
            document.querySelectorAll('.group-option[data-group]').forEach(option => {
                option.addEventListener('click', selectGroupOption);
            });
            
            // 图片比例模态框
            closeRatioBtn.addEventListener('click', closeAllModals);
            cancelRatioBtn.addEventListener('click', closeAllModals);
            saveRatioBtn.addEventListener('click', saveRatio);
            document.querySelectorAll('.group-option[data-ratio]').forEach(option => {
                option.addEventListener('click', selectRatioOption);
            });
            
            // 图集移动模态框
            closeMoveAlbumBtn.addEventListener('click', closeAllModals);
            cancelMoveAlbumBtn.addEventListener('click', closeAllModals);
            saveMoveAlbumBtn.addEventListener('click', saveAlbumOrder);
            
            // 图片预览模态框
            closeImagePreviewBtn.addEventListener('click', closeAllModals);
            deleteImagePreviewBtn.addEventListener('click', () => {
                const photoId = parseInt(imagePreviewModal.dataset.photoId);
                const albumId = parseInt(imagePreviewModal.dataset.albumId);
                closeAllModals();
                if (!Number.isFinite(photoId) || !Number.isFinite(albumId)) return;
                deletePhoto(photoId, albumId);
            });

            // 美化模态框
            closeBeautifyBtn.addEventListener('click', closeAllModals);
            roleBgPickBtn.addEventListener('click', () => {
                roleBgFileInput.value = '';
                roleBgFileInput.click();
            });
            namecardBgPickBtn.addEventListener('click', () => {
                namecardBgFileInput.value = '';
                namecardBgFileInput.click();
            });
            roleBgClearBtn.addEventListener('click', () => setRoleBackground(''));
            namecardBgClearBtn.addEventListener('click', () => setNamecardBackground(''));
            roleBgFileInput.addEventListener('change', handleRoleBgFileChange);
            namecardBgFileInput.addEventListener('change', handleNamecardBgFileChange);
            
            // 编辑图集菜单
            deleteAlbumBtn.addEventListener('click', handleDeleteAlbum);
            moveAlbumEditBtn.addEventListener('click', handleMoveAlbum);
            cancelEditBtn.addEventListener('click', hideEditMenu);
            
            // 点击模态框外部关闭
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', function(e) {
                    if (e.target === this) {
                        closeAllModals();
                    }
                });
            });

            topNavTitle.addEventListener('keydown', (e) => {
                const key = e.key;
                if (key !== 'Enter' && key !== ' ') return;
                e.preventDefault();
                topNavTitle.click();
            });

            document.addEventListener('keydown', (e) => {
                if (!e) return;
                if (e.key === 'Escape') {
                    closeAllModals();
                    return;
                }
                const t = e.target;
                if (!t || !t.getAttribute || t.tagName === 'BUTTON') return;
                if (t.getAttribute('role') !== 'button') return;
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (typeof t.click === 'function') t.click();
            });
        }

        function hideSystemMenu() {
            menuModal.classList.remove('show');
            menuModal.style.top = '';
            menuModal.style.left = '';
            menuModal.style.visibility = '';
            menuModal.setAttribute('aria-hidden', 'true');
            systemMenuAnchor = null;
            document.removeEventListener('click', closeSystemMenuOnOutsideClick);
            document.removeEventListener('touchstart', closeSystemMenuOnOutsideClick);
        }

        function closeSystemMenuOnOutsideClick(e) {
            if (!menuModal.classList.contains('show')) return;
            if (menuModal.contains(e.target)) return;
            if (systemMenuAnchor && systemMenuAnchor.contains(e.target)) return;
            hideSystemMenu();
        }

        function showSystemMenu(anchorEl) {
            updateMenuAvailability();
            menuModal.classList.add('show');
            menuModal.style.visibility = 'hidden';
            menuModal.style.top = '0px';
            menuModal.style.left = '0px';
            menuModal.setAttribute('aria-hidden', 'false');
            systemMenuAnchor = anchorEl || null;

            requestAnimationFrame(() => {
                const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
                const menuRect = menuModal.getBoundingClientRect();
                const padding = 8;
                const viewportW = window.innerWidth;
                const viewportH = window.innerHeight;

                const openUp = rect ? rect.top > viewportH / 2 : false;
                let top = rect ? (openUp ? rect.top - menuRect.height - 8 : rect.bottom + 8) : padding;
                let left = rect ? rect.right - menuRect.width : padding;

                top = Math.max(padding, Math.min(top, viewportH - padding - menuRect.height));
                left = Math.max(padding, Math.min(left, viewportW - padding - menuRect.width));

                menuModal.style.top = `${top}px`;
                menuModal.style.left = `${left}px`;
                menuModal.style.visibility = '';
            });

            setTimeout(() => {
                document.addEventListener('click', closeSystemMenuOnOutsideClick);
                document.addEventListener('touchstart', closeSystemMenuOnOutsideClick);
            }, 10);
        }

        // 打开系统菜单（点击展开的小菜单）
        function ensureGeneratedMenuSubtext(menuItem) {
            let el = menuItem.querySelector('.menu-subtext');
            if (el) return el;
            el = document.createElement('div');
            el.className = 'menu-subtext generated-subtext';
            menuItem.appendChild(el);
            return el;
        }

        function setMenuItemDisabled(menuItem, disabled, subtextText) {
            menuItem.classList.toggle('disabled', !!disabled);
            const existing = menuItem.querySelector('.menu-subtext');
            if (typeof subtextText === 'string') {
                const subtextEl = ensureGeneratedMenuSubtext(menuItem);
                subtextEl.textContent = subtextText;
                subtextEl.style.display = '';
                return;
            }
            if (existing && existing.classList.contains('generated-subtext')) {
                existing.remove();
            }
        }

        function updateMenuAvailability() {
            const hasCharacter = !!(selectedCharacter && selectedCharacter.id);
            const onlyBeautify = !hasCharacter;
            [createAlbumMenuItem, createPhotoMenuItem, changeGroupingMenuItem, changeRatioMenuItem].forEach(item => {
                if (item) item.style.display = onlyBeautify ? 'none' : '';
            });

            if (onlyBeautify) {
                setMenuItemDisabled(createAlbumMenuItem, false);
                setMenuItemDisabled(createPhotoMenuItem, false);
                changeGroupingMenuItem.classList.remove('disabled');
                changeRatioMenuItem.classList.remove('disabled');
            } else {
                setMenuItemDisabled(createAlbumMenuItem, false);
                setMenuItemDisabled(createPhotoMenuItem, false);
                changeGroupingMenuItem.classList.remove('disabled');
                changeRatioMenuItem.classList.remove('disabled');
                updateMenuTexts();
            }

            const beautifySubtext = beautifyMenuItem.querySelector('.menu-subtext');
            if (beautifySubtext) {
                beautifySubtext.textContent = hasCharacter ? '自定义背景' : '主页美化';
            }
        }

        function openMenuModal(e) {
            if (e && e.stopPropagation) e.stopPropagation();
            const anchor = e && e.currentTarget ? e.currentTarget : menuBtn;
            if (menuModal.classList.contains('show') && systemMenuAnchor === anchor) {
                hideSystemMenu();
                return;
            }
            closeAllModals();
            showSystemMenu(anchor);
        }

        function setBeautifyPreview(previewEl, labelEl, src) {
            const safeSrc = String(src || '').trim();
            if (safeSrc) {
                labelEl.style.display = 'none';
                if (safeSrc.startsWith('idb:')) {
                    resolveIdbSrc(safeSrc).then(resolved => {
                        if (!resolved) {
                            previewEl.style.backgroundImage = '';
                            labelEl.style.display = '';
                            return;
                        }
                        previewEl.style.backgroundImage = toBackgroundCssUrlValue(resolved);
                    }).catch(() => {
                        previewEl.style.backgroundImage = '';
                        labelEl.style.display = '';
                    });
                    return;
                }
                previewEl.style.backgroundImage = toBackgroundCssUrlValue(safeSrc);
                return;
            }
            previewEl.style.backgroundImage = '';
            labelEl.style.display = '';
        }

        function openBeautifyModal() {
            const hasCharacter = !!(selectedCharacter && selectedCharacter.id);
            beautifyContext = { type: hasCharacter ? 'character' : 'home' };
            if (roleBgTitle) roleBgTitle.textContent = hasCharacter ? '自定义角色背景' : '自定义主页背景';
            if (namecardBgTitle) namecardBgTitle.textContent = hasCharacter ? '自定义名片背景' : '自定义顶部栏背景';

            const settings = hasCharacter ? loadBeautifyForCharacter(selectedCharacter.id) : loadBeautifyForHome();
            setBeautifyPreview(roleBgPreview, roleBgPreviewLabel, settings.roleBgSrc);
            setBeautifyPreview(namecardBgPreview, namecardBgPreviewLabel, settings.namecardBgSrc);
            beautifyModal.style.display = 'flex';
        }

        function setRoleBackground(src) {
            const hasCharacter = (beautifyContext && beautifyContext.type === 'character') && !!(selectedCharacter && selectedCharacter.id);
            const settings = hasCharacter ? loadBeautifyForCharacter(selectedCharacter.id) : loadBeautifyForHome();
            settings.roleBgSrc = String(src || '').trim();
            if (hasCharacter) {
                saveBeautifyForCurrentCharacter(settings);
                applyBeautifySettings(settings);
            } else {
                saveBeautifyForHome(settings);
                if (!hasBeautifyBackgrounds(settings)) {
                    document.body.classList.remove('home-beautify');
                    resetBeautifyStyles();
                } else {
                    document.body.classList.add('home-beautify');
                    applyBeautifySettings(settings);
                }
            }
            setBeautifyPreview(roleBgPreview, roleBgPreviewLabel, settings.roleBgSrc);
        }

        function setNamecardBackground(src) {
            const hasCharacter = (beautifyContext && beautifyContext.type === 'character') && !!(selectedCharacter && selectedCharacter.id);
            const settings = hasCharacter ? loadBeautifyForCharacter(selectedCharacter.id) : loadBeautifyForHome();
            settings.namecardBgSrc = String(src || '').trim();
            if (hasCharacter) {
                saveBeautifyForCurrentCharacter(settings);
                applyBeautifySettings(settings);
            } else {
                saveBeautifyForHome(settings);
                if (!hasBeautifyBackgrounds(settings)) {
                    document.body.classList.remove('home-beautify');
                    resetBeautifyStyles();
                } else {
                    document.body.classList.add('home-beautify');
                    applyBeautifySettings(settings);
                }
            }
            setBeautifyPreview(namecardBgPreview, namecardBgPreviewLabel, settings.namecardBgSrc);
        }

        // 裁剪相关变量
        let cropImage = null;
        let cropScale = 1;
        let cropTranslateX = 0;
        let cropTranslateY = 0;
        let cropStartDistance = 0;
        let cropStartScale = 1;
        let cropStartX = 0;
        let cropStartY = 0;
        let cropIsDragging = false;
        let currentCropOptions = {};
        let currentCropCallback = null;

        function initCropModal() {
            const cropModal = document.getElementById('cropModal');
            const cropCanvas = document.getElementById('cropCanvas');
            const cropWrapper = document.getElementById('cropWrapper');
            const cropOverlay = document.getElementById('cropOverlay');
            const cancelBtn = document.getElementById('cropCancelBtn');
            const confirmBtn = document.getElementById('cropConfirmBtn');
            const ctx = cropCanvas.getContext('2d');
            
            // 触摸事件处理
            cropWrapper.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    cropIsDragging = true;
                    cropStartX = e.touches[0].clientX - cropTranslateX;
                    cropStartY = e.touches[0].clientY - cropTranslateY;
                } else if (e.touches.length === 2) {
                    cropIsDragging = false;
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    cropStartDistance = Math.sqrt(dx * dx + dy * dy);
                    cropStartScale = cropScale;
                }
            }, { passive: false });
            
            cropWrapper.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && cropIsDragging) {
                    cropTranslateX = e.touches[0].clientX - cropStartX;
                    cropTranslateY = e.touches[0].clientY - cropStartY;
                    drawCropImage();
                } else if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (cropStartDistance > 0) {
                        const newScale = cropStartScale * (distance / cropStartDistance);
                        cropScale = Math.max(0.1, Math.min(10, newScale));
                        drawCropImage();
                    }
                }
            }, { passive: false });
            
            cropWrapper.addEventListener('touchend', () => {
                cropIsDragging = false;
            });
            
            // 鼠标事件支持
            cropWrapper.addEventListener('mousedown', (e) => {
                cropIsDragging = true;
                cropStartX = e.clientX - cropTranslateX;
                cropStartY = e.clientY - cropTranslateY;
            });
            
            cropWrapper.addEventListener('mousemove', (e) => {
                if (cropIsDragging) {
                    cropTranslateX = e.clientX - cropStartX;
                    cropTranslateY = e.clientY - cropStartY;
                    drawCropImage();
                }
            });
            
            cropWrapper.addEventListener('mouseup', () => {
                cropIsDragging = false;
            });
            
            cropWrapper.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                cropScale = Math.max(0.1, Math.min(10, cropScale * delta));
                drawCropImage();
            });
            
            function drawCropImage() {
                if (!cropImage) return;
                
                cropCanvas.width = cropWrapper.clientWidth;
                cropCanvas.height = cropWrapper.clientHeight;
                
                const cx = cropCanvas.width / 2;
                const cy = cropCanvas.height / 2;
                
                ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
                ctx.save();
                ctx.translate(cx + cropTranslateX, cy + cropTranslateY);
                ctx.scale(cropScale, cropScale);
                ctx.drawImage(cropImage, -cropImage.width / 2, -cropImage.height / 2);
                ctx.restore();
            }
            
            cancelBtn.addEventListener('click', () => {
                cropModal.classList.remove('show');
                if (roleBgFileInput) roleBgFileInput.value = '';
                if (namecardBgFileInput) namecardBgFileInput.value = '';
            });
            
            confirmBtn.addEventListener('click', () => {
                if (!currentCropCallback) return;
                
                // 计算输出尺寸 (默认 max 1024)
                const maxOutputSize = 1024;
                
                // 计算 Overlay 在画布上的位置和大小
                // Overlay 总是居中
                const overlayRect = cropOverlay.getBoundingClientRect();
                const wrapperRect = cropWrapper.getBoundingClientRect();
                
                // Overlay 实际像素大小
                const overlayWidth = overlayRect.width;
                const overlayHeight = overlayRect.height;
                
                // 计算输出 Canvas 大小 (维持宽高比)
                // 如果图片足够大，我们希望输出接近 maxOutputSize
                let outputWidth = overlayWidth;
                let outputHeight = overlayHeight;
                
                const ratio = overlayWidth / overlayHeight;
                if (outputWidth > outputHeight) {
                    outputWidth = maxOutputSize;
                    outputHeight = maxOutputSize / ratio;
                } else {
                    outputHeight = maxOutputSize;
                    outputWidth = maxOutputSize * ratio;
                }
                
                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = outputWidth;
                outputCanvas.height = outputHeight;
                const outCtx = outputCanvas.getContext('2d');
                
                outCtx.fillStyle = '#000'; // 填充背景色防止透明
                outCtx.fillRect(0, 0, outputWidth, outputHeight);
                
                outCtx.save();
                outCtx.translate(outputWidth / 2, outputHeight / 2);
                
                // Scale factor from Overlay size to Output size
                const scaleFactor = outputWidth / overlayWidth;
                
                outCtx.scale(scaleFactor, scaleFactor);
                outCtx.translate(cropTranslateX, cropTranslateY);
                outCtx.scale(cropScale, cropScale);
                
                outCtx.drawImage(cropImage, -cropImage.width / 2, -cropImage.height / 2);
                outCtx.restore();
                
                const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.8);
                currentCropCallback(dataUrl);
                
                cropModal.classList.remove('show');
                if (roleBgFileInput) roleBgFileInput.value = '';
                if (namecardBgFileInput) namecardBgFileInput.value = '';
            });
            
            // 暴露打开裁剪器的方法
            window.openCropModal = (imgSrc, options, callback) => {
                currentCropOptions = Object.assign({
                    aspectRatio: null,
                    shape: 'rect'
                }, options);
                currentCropCallback = callback;
                
                cropImage = new Image();
                cropImage.onload = () => {
                    // Reset State
                    cropScale = 1;
                    cropTranslateX = 0;
                    cropTranslateY = 0;
                    
                    // Update Overlay Shape and Size
                    cropOverlay.className = 'crop-overlay ' + currentCropOptions.shape;
                    
                    // Set Overlay Size based on Aspect Ratio
                    // Base size: 280px width or height
                    const baseSize = 280;
                    if (currentCropOptions.aspectRatio) {
                        if (currentCropOptions.aspectRatio >= 1) {
                            cropOverlay.style.width = baseSize + 'px';
                            cropOverlay.style.height = (baseSize / currentCropOptions.aspectRatio) + 'px';
                        } else {
                            cropOverlay.style.height = baseSize + 'px';
                            cropOverlay.style.width = (baseSize * currentCropOptions.aspectRatio) + 'px';
                        }
                    } else {
                        // Default square if not specified
                        cropOverlay.style.width = baseSize + 'px';
                        cropOverlay.style.height = baseSize + 'px';
                    }
                    
                    // Fit image to screen initially
                    const minDim = Math.min(cropImage.width, cropImage.height);
                    const wrapperDim = Math.min(cropWrapper.clientWidth, cropWrapper.clientHeight);
                    if (minDim > 0) {
                        cropScale = (wrapperDim * 0.8) / minDim;
                    }
                    
                    drawCropImage();
                    cropModal.classList.add('show');
                };
                cropImage.src = imgSrc;
            };
        }



        function handleRoleBgFileChange(e) {
            const file = e && e.target && e.target.files ? e.target.files[0] : null;
            if (!file) return;
            // 压缩读取原图（使用较大尺寸以保留细节，但为了移动端性能限制为1024）
            compressImage(file, 1024, 0.8).then(result => {
                if (window.openCropModal) {
                    // 角色/主页背景：通常是竖屏全屏，比例约 9:16 (0.5625)
                    window.openCropModal(result, { aspectRatio: 9/16, shape: 'rect' }, (croppedDataUrl) => {
                         setRoleBackground(croppedDataUrl);
                    });
                } else {
                    setRoleBackground(result);
                }
            });
        }

        function handleNamecardBgFileChange(e) {
            const file = e && e.target && e.target.files ? e.target.files[0] : null;
            if (!file) return;
            // 压缩读取原图
            compressImage(file, 1024, 0.8).then(result => {
                if (window.openCropModal) {
                    // 名片/顶部栏背景：横向长方形，比例约 3:1 (0.33) 或更宽
                    // 顶部栏高度较小，建议宽长条
                    window.openCropModal(result, { aspectRatio: 3/1, shape: 'rect' }, (croppedDataUrl) => {
                         setNamecardBackground(croppedDataUrl);
                    });
                } else {
                    setNamecardBackground(result);
                }
            });
        }

        // 关闭所有模态框
        function closeAllModals() {
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.style.display = 'none';
            });
            hideSystemMenu();
            hideEditMenu();
        }

        // 更新菜单文本
        function updateMenuTexts() {
            const groupTexts = {
                'none': '无日期',
                'date': '按日期',
                'month': '按月份',
                'year': '按年份'
            };
            
            const ratioTexts = {
                'ratio-1-1': '1:1',
                'ratio-3-4': '3:4'
            };
            
            currentGroupingText.textContent = groupTexts[currentViewMode];
            currentRatioText.textContent = ratioTexts[currentRatio];
        }

        // 渲染顶部图集导航栏
        function renderAlbumsNav() {
            albumsNav.innerHTML = '';

            if (!albumsData || albumsData.length === 0) {
                currentAlbumId = null;
                updateAlbumSelectOptions();
                return;
            }

            if (currentAlbumId == null || !albumsData.some(a => a.id === currentAlbumId)) {
                currentAlbumId = albumsData[0].id;
            }
            
            albumsData.forEach(album => {
                const albumTab = document.createElement('button');
                albumTab.type = 'button';
                albumTab.className = `album-tab ${album.id === currentAlbumId ? 'active' : ''}`;
                albumTab.dataset.albumId = album.id;
                
                albumTab.innerHTML = `
                    <span>${album.name}</span>
                    <span class="photo-count">${album.photos.length}</span>
                `;
                
                // 添加单击事件切换图集
                albumTab.addEventListener('click', () => {
                    switchAlbum(album.id);
                });
                
                // 添加长按事件显示编辑菜单
                let pressTimer;
                albumTab.addEventListener('touchstart', (e) => {
                    pressTimer = setTimeout(() => {
                        showEditMenu(album.id, albumTab);
                        e.preventDefault();
                    }, 800); // 长按800毫秒
                });
                
                albumTab.addEventListener('touchend', () => {
                    clearTimeout(pressTimer);
                });
                
                albumTab.addEventListener('touchmove', () => {
                    clearTimeout(pressTimer);
                });
                
                albumsNav.appendChild(albumTab);
            });
            
            // 更新添加照片表单中的图集选项
            updateAlbumSelectOptions();
        }

        // 显示编辑菜单
        function showEditMenu(albumId, targetElement) {
            editAlbumId = albumId;
            
            // 获取目标元素位置
            const rect = targetElement.getBoundingClientRect();
            
            // 设置菜单位置
            editAlbumMenu.style.top = `${rect.bottom + 5}px`;
            editAlbumMenu.style.left = `${rect.left}px`;
            
            // 显示菜单
            editAlbumMenu.classList.add('show');
            
            // 添加点击外部关闭菜单的事件
            setTimeout(() => {
                document.addEventListener('click', closeEditMenuOnClickOutside);
                document.addEventListener('touchstart', closeEditMenuOnClickOutside);
            }, 10);
        }

        // 隐藏编辑菜单
        function hideEditMenu() {
            editAlbumMenu.classList.remove('show');
            editAlbumId = null;
            document.removeEventListener('click', closeEditMenuOnClickOutside);
            document.removeEventListener('touchstart', closeEditMenuOnClickOutside);
        }

        // 点击外部关闭编辑菜单
        function closeEditMenuOnClickOutside(e) {
            if (!editAlbumMenu.contains(e.target)) {
                hideEditMenu();
            }
        }

        // 切换图集
        function switchAlbum(albumId) {
            if (albumId == null) return;
            currentAlbumId = albumId;
            
            // 更新导航栏活动状态
            document.querySelectorAll('.album-tab').forEach(tab => {
                tab.classList.toggle('active', parseInt(tab.dataset.albumId) === albumId);
            });
            
            // 重新分组并渲染照片
            groupPhotos();
            renderAlbum();
        }

        // 根据当前视图模式分组图片
        function groupPhotos() {
            const currentAlbum = albumsData.find(album => album.id === currentAlbumId);
            if (!currentAlbum) {
                groupedPhotos = {};
                return;
            }
            
            if (currentViewMode === 'none') {
                groupedPhotos = {
                    '所有照片': currentAlbum.photos
                };
                return;
            }
            
            groupedPhotos = {};
            
            currentAlbum.photos.forEach(photo => {
                const dateObj = new Date(photo.date);
                let groupKey;
                
                switch(currentViewMode) {
                    case 'date':
                        groupKey = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
                        break;
                    case 'month':
                        groupKey = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月`;
                        break;
                    case 'year':
                        groupKey = `${dateObj.getFullYear()}年`;
                        break;
                }
                
                if (!groupedPhotos[groupKey]) {
                    groupedPhotos[groupKey] = [];
                }
                
                groupedPhotos[groupKey].push(photo);
            });
            
            // 对分组进行排序
            const sortedGroupedPhotos = {};
            Object.keys(groupedPhotos)
                .sort((a, b) => {
                    if (currentViewMode === 'year') {
                        return parseInt(b) - parseInt(a);
                    } else if (currentViewMode === 'month') {
                        const yearA = parseInt(a);
                        const monthA = parseInt(a.match(/(\d+)月/)[1]);
                        const yearB = parseInt(b);
                        const monthB = parseInt(b.match(/(\d+)月/)[1]);
                        if (yearB !== yearA) return yearB - yearA;
                        return monthB - monthA;
                    } else if (currentViewMode === 'date') {
                        const album = albumsData.find(album => album.id === currentAlbumId);
                        const keyToTime = {};
                        if (album && Array.isArray(album.photos)) {
                            album.photos.forEach(p => {
                                if (!p || !p.date) return;
                                const d = new Date(p.date);
                                const k = `${d.getMonth() + 1}月${d.getDate()}日`;
                                const time = d.getTime();
                                if (!keyToTime[k] || time > keyToTime[k]) keyToTime[k] = time;
                            });
                        }
                        return (keyToTime[b] || 0) - (keyToTime[a] || 0);
                    }
                    return 0;
                })
                .forEach(key => {
                    sortedGroupedPhotos[key] = groupedPhotos[key];
                });
            
            groupedPhotos = sortedGroupedPhotos;
        }

        // 渲染相册
        function renderAlbum() {
            albumContainer.innerHTML = '';
            
            const currentAlbum = albumsData.find(album => album.id === currentAlbumId);
            if (!currentAlbum || currentAlbum.photos.length === 0) {
                emptyState.style.display = 'block';
                albumContainer.appendChild(emptyState);
                return;
            }
            
            emptyState.style.display = 'none';
            
            const photoFallback = getPhotoFallback();

            // 为每个分组创建面板
            for (const [groupName, photos] of Object.entries(groupedPhotos)) {
                // 如果不是"无日期"分组，则显示分组标题
                if (currentViewMode !== 'none') {
                    const groupLabel = document.createElement('div');
                    groupLabel.className = 'group-label';

                    groupLabel.innerHTML = `
                        <span class="group-label-text">${groupName}</span>
                        <span class="group-label-count">${photos.length} 张照片</span>
                    `;
                    
                    albumContainer.appendChild(groupLabel);
                }
                
                // 创建图片面板
                const photoPanel = document.createElement('div');
                photoPanel.className = 'photo-panel';
                
                // 添加图片
                photos.forEach(photo => {
                    const photoContainer = document.createElement('div');
                    photoContainer.className = `photo-container ${currentRatio}`;
                    
                    const dateObj = new Date(photo.date);
                    const formattedDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
                    const rawLocation = String(photo && photo.location ? photo.location : '').trim();
                    const locationText = rawLocation === '未知地点' ? '' : rawLocation;

                    const skeleton = document.createElement('div');
                    skeleton.className = 'img-skeleton';
                    const errorEl = document.createElement('div');
                    errorEl.className = 'img-error';
                    errorEl.innerHTML = '<i class="fas fa-image"></i>';

                    const img = document.createElement('img');
                    img.alt = '照片';
                    img.loading = 'lazy';
                    img.dataset.id = photo.id;

                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'delete-photo';
                    deleteBtn.dataset.photoId = photo.id;
                    deleteBtn.dataset.albumId = currentAlbumId;
                    deleteBtn.setAttribute('aria-label', '删除照片');
                    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';

                    const info = document.createElement('div');
                    info.className = 'photo-info';
                    info.innerHTML = `
                        <div class="photo-date">${formattedDate}</div>
                        ${locationText ? `<div class="photo-location">${locationText}</div>` : ''}
                    `;

                    photoContainer.appendChild(skeleton);
                    photoContainer.appendChild(errorEl);
                    photoContainer.appendChild(img);
                    photoContainer.appendChild(deleteBtn);
                    photoContainer.appendChild(info);

                    setupImageLoading(photoContainer, img, photo.src, photoFallback);

                    let suppressNextClick = false;
                    let pressTimer = null;
                    let pressStartX = 0;
                    let pressStartY = 0;
                    let pressPointerId = null;

                    const clearPressTimer = () => {
                        if (pressTimer) {
                            clearTimeout(pressTimer);
                            pressTimer = null;
                        }
                    };

                    const triggerPhotoDelete = () => {
                        const deleted = deletePhoto(photo.id, currentAlbumId);
                        suppressNextClick = !!deleted;
                    };

                    const startPress = (x, y) => {
                        pressStartX = x;
                        pressStartY = y;
                        suppressNextClick = false;
                        clearPressTimer();
                        pressTimer = setTimeout(triggerPhotoDelete, 650);
                    };

                    if ('PointerEvent' in window) {
                        photoContainer.addEventListener('pointerdown', (e) => {
                            if (!e || e.pointerType === 'mouse') return;
                            pressPointerId = e.pointerId;
                            startPress(e.clientX, e.clientY);
                        }, { passive: true });

                        photoContainer.addEventListener('pointermove', (e) => {
                            if (!pressTimer || pressPointerId == null) return;
                            if (e.pointerId !== pressPointerId) return;
                            const dx = e.clientX - pressStartX;
                            const dy = e.clientY - pressStartY;
                            if (dx * dx + dy * dy > 10 * 10) clearPressTimer();
                        }, { passive: true });

                        const endPointerPress = (e) => {
                            if (pressPointerId != null && e.pointerId !== pressPointerId) return;
                            pressPointerId = null;
                            clearPressTimer();
                        };

                        photoContainer.addEventListener('pointerup', endPointerPress, { passive: true });
                        photoContainer.addEventListener('pointercancel', endPointerPress, { passive: true });
                    } else {
                        photoContainer.addEventListener('touchstart', (e) => {
                            if (e.touches && e.touches.length !== 1) return;
                            const t = e.touches[0];
                            startPress(t.clientX, t.clientY);
                        }, { passive: true });

                        photoContainer.addEventListener('touchmove', (e) => {
                            if (!pressTimer || !e.touches || e.touches.length !== 1) return;
                            const t = e.touches[0];
                            const dx = t.clientX - pressStartX;
                            const dy = t.clientY - pressStartY;
                            if (dx * dx + dy * dy > 10 * 10) clearPressTimer();
                        }, { passive: true });

                        photoContainer.addEventListener('touchend', clearPressTimer, { passive: true });
                        photoContainer.addEventListener('touchcancel', clearPressTimer, { passive: true });
                    }
                    photoContainer.addEventListener('contextmenu', (e) => e.preventDefault());

                    photoContainer.addEventListener('click', () => {
                        if (suppressNextClick) {
                            suppressNextClick = false;
                            return;
                        }
                        imagePreview.dataset.fallbackApplied = '';
                        imagePreview.onerror = () => {
                            if (!imagePreview.dataset.fallbackApplied) {
                                imagePreview.dataset.fallbackApplied = '1';
                                imagePreview.src = photoFallback;
                            }
                        };
                        const previewSrc = photo.src;
                        if (previewSrc && typeof previewSrc === 'string' && previewSrc.startsWith('idb:')) {
                            resolveIdbSrc(previewSrc).then(resolved => {
                                imagePreview.src = resolved || photoFallback;
                            }).catch(() => {
                                imagePreview.src = photoFallback;
                            });
                        } else {
                            imagePreview.src = previewSrc;
                        }
                        imageInfo.textContent = locationText ? `${formattedDate} · ${locationText}` : formattedDate;
                        imagePreviewModal.dataset.photoId = String(photo.id);
                        imagePreviewModal.dataset.albumId = String(currentAlbumId);
                        imagePreviewModal.style.display = 'flex';
                    });

                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deletePhoto(photo.id, currentAlbumId);
                    });
                    
                    photoPanel.appendChild(photoContainer);
                });
                
                albumContainer.appendChild(photoPanel);
            }
        }

        // 打开添加图集模态框
        function openCreateAlbumModal() {
            if (!selectedCharacter) {
                alert('请先选择角色');
                return;
            }
            createAlbumModal.style.display = 'flex';
            document.getElementById('albumName').focus();
        }

        // 打开添加照片模态框
        function openCreatePhotoModal() {
            if (!selectedCharacter) {
                alert('请先选择角色');
                return;
            }
            if (!albumsData || albumsData.length === 0) {
                alert('请先创建图集');
                openCreateAlbumModal();
                return;
            }
            createPhotoModal.style.display = 'flex';
            updateAlbumSelectOptions();
            switchImportMode(false);
        }

        // 切换上传模式
        function switchImportMode(isLocal) {
            isLocalImport = isLocal;
            
            if (isLocal) {
                urlImportSection.style.display = 'none';
                localImportSection.style.display = 'block';
                urlImportBtn.classList.remove('btn-primary');
                urlImportBtn.classList.add('btn-secondary');
                localImportBtn.classList.remove('btn-secondary');
                localImportBtn.classList.add('btn-primary');
                photoUrlInput.value = '';
            } else {
                urlImportSection.style.display = 'block';
                localImportSection.style.display = 'none';
                localImportBtn.classList.remove('btn-primary');
                localImportBtn.classList.add('btn-secondary');
                urlImportBtn.classList.remove('btn-secondary');
                urlImportBtn.classList.add('btn-primary');
                clearFilePreview();
                selectedFiles = [];
            }
        }

        // 处理文件选择
        function handleFileSelect(e) {
            const files = Array.from(e.target.files);
            appendFilesToPreview(files);
        }

        // 处理文件拖放
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            fileImportArea.style.borderColor = 'var(--primary-color)';
            fileImportArea.style.backgroundColor = '#f5f9ff';
        }

        // 处理文件拖放完成
        function handleFileDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            fileImportArea.style.borderColor = '#ccc';
            fileImportArea.style.backgroundColor = '#fafafa';
            
            const files = Array.from(e.dataTransfer.files);
            appendFilesToPreview(files);
        }

        // 添加文件到预览
        function appendFilesToPreview(files) {
            const imageFiles = files.filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length === 0) {
                alert('请选择图片文件（JPG, PNG, GIF等格式）');
                return;
            }
            
            selectedFiles.push(...imageFiles);
            updateFilePreview();
        }

        // 更新文件预览
        function updateFilePreview() {
            previewImages.innerHTML = '';
            
            selectedFiles.forEach((file, index) => {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    const previewImage = document.createElement('div');
                    previewImage.className = 'preview-image';
                    previewImage.innerHTML = `
                        <img src="${e.target.result}" alt="${file.name}">
                        <button class="remove-preview" data-index="${index}">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    
                    previewImages.appendChild(previewImage);
                    
                    previewImage.querySelector('.remove-preview').addEventListener('click', (e) => {
                        e.stopPropagation();
                        removeFileFromPreview(index);
                    });
                };
                
                reader.readAsDataURL(file);
            });
        }

        // 从预览中移除文件
        function removeFileFromPreview(index) {
            selectedFiles.splice(index, 1);
            updateFilePreview();
        }

        // 清空文件预览
        function clearFilePreview() {
            previewImages.innerHTML = '';
        }

        // 更新添加照片表单中的图集选项
        function updateAlbumSelectOptions() {
            photoAlbumSelect.innerHTML = '';
            
            if (!albumsData || albumsData.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无图集';
                option.disabled = true;
                option.selected = true;
                photoAlbumSelect.appendChild(option);
                return;
            }

            albumsData.forEach(album => {
                const option = document.createElement('option');
                option.value = album.id;
                option.textContent = `${album.name} (${album.photos.length}张照片)`;
                if (album.id === currentAlbumId) {
                    option.selected = true;
                }
                photoAlbumSelect.appendChild(option);
            });
        }

        // 处理添加图集表单提交
        function handleCreateAlbumSubmit(e) {
            e.preventDefault();
            
            const albumName = document.getElementById('albumName').value.trim();
            const albumDescription = document.getElementById('albumDescription').value.trim();
            
            if (!albumName) {
                alert('请输入图集名称');
                return;
            }
            
            const newAlbum = {
                id: nextAlbumId++,
                name: albumName,
                description: albumDescription || '',
                photos: []
            };
            
            albumsData.push(newAlbum);
            currentAlbumId = newAlbum.id;
            saveAlbumsForCurrentCharacter();
            
            renderAlbumsNav();
            closeAllModals();
            
            setTimeout(() => {
                switchAlbum(newAlbum.id);
            }, 100);
            
            alert(`图集"${albumName}"创建成功！`);
        }

        async function compressImage(file, maxWidth = 1024, quality = 0.7) {
            const toDataUrl = (blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const compressWithCanvas = (blob) => new Promise((resolve, reject) => {
                const img = new Image();
                const blobUrlService = getBlobUrlService();
                let url;
                if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                    url = blobUrlService.createObjectUrl(blob, { groupId: GROUP_ID });
                } else {
                    url = URL.createObjectURL(blob);
                }
                img.onload = () => {
                    if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                        blobUrlService.revoke(url);
                    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        URL.revokeObjectURL(url);
                    }
                    let width = img.width;
                    let height = img.height;
                    
                    // 保持宽高比缩放
                    if (width > maxWidth || height > maxWidth) {
                         const ratio = width / height;
                         if (width > height) {
                             width = maxWidth;
                             height = width / ratio;
                         } else {
                             height = maxWidth;
                             width = height * ratio;
                         }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    reject(e);
                };
                img.src = url;
            });

            const normalizeToBlob = async (input) => {
                if (input instanceof Blob) return input;
                if (typeof input === 'string') {
                    const u = String(input || '').trim();
                    if (!u) throw new Error('Empty image source');
                    const res = await fetch(u);
                    return await res.blob();
                }
                throw new Error('Invalid source type: must be Blob or File');
            };

            const blob = await normalizeToBlob(file);

            const waitForImageService = () => {
                return new Promise((resolve) => {
                    const maxWait = 3000;
                    const checkInterval = 100;
                    let waited = 0;

                    if (window.Core && window.Core.ImageService) {
                        resolve(window.Core.ImageService);
                        return;
                    }

                    const interval = setInterval(() => {
                        waited += checkInterval;
                        if (window.Core && window.Core.ImageService) {
                            clearInterval(interval);
                            console.log('[compressImage] Core.ImageService 加载完成，等待时间:', waited, 'ms');
                            resolve(window.Core.ImageService);
                        } else if (waited >= maxWait) {
                            clearInterval(interval);
                            console.warn('[compressImage] Core.ImageService 加载超时（', maxWait, 'ms），使用 Canvas 压缩');
                            resolve(null);
                        }
                    }, checkInterval);
                });
            };

            const imageService = await waitForImageService();

            if (imageService) {
                try {
                    const compressed = await imageService.compressImage(blob, maxWidth, quality);
                    return await toDataUrl(compressed);
                } catch (e) {
                    console.warn('[compressImage] 图片压缩失败，尝试使用Canvas压缩:', e);
                }
            } else {
                console.warn('[compressImage] Core.ImageService 不可用，尝试使用Canvas压缩');
            }

            // Fallback to Canvas compression
            try {
                return await compressWithCanvas(blob);
            } catch (e) {
                console.warn('[compressImage] Canvas压缩也失败，使用原始文件:', e);
                return await toDataUrl(blob);
            }
        }

        async function compressImageToBlob(file, maxWidth = 1024, quality = 0.7) {
            const compressWithCanvasToBlob = (blob) => new Promise((resolve, reject) => {
                const img = new Image();
                const blobUrlService = getBlobUrlService();
                let url;
                if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                    url = blobUrlService.createObjectUrl(blob, { groupId: GROUP_ID });
                } else {
                    url = URL.createObjectURL(blob);
                }
                img.onload = () => {
                    if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                        blobUrlService.revoke(url);
                    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        URL.revokeObjectURL(url);
                    }
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxWidth || height > maxWidth) {
                         const ratio = width / height;
                         if (width > height) {
                             width = maxWidth;
                             height = width / ratio;
                         } else {
                             height = maxWidth;
                             width = height * ratio;
                         }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((b) => {
                        if (b) resolve(b);
                        else reject(new Error('Canvas toBlob failed'));
                    }, 'image/jpeg', quality);
                };
                img.onerror = (e) => {
                    if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                        blobUrlService.revoke(url);
                    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        URL.revokeObjectURL(url);
                    }
                    reject(e);
                };
                img.src = url;
            });

            const normalizeToBlob = async (input) => {
                if (input && typeof input === 'object' && typeof input.arrayBuffer === 'function') return input;
                if (typeof input === 'string') {
                    const u = String(input || '').trim();
                    if (!u) throw new Error('Empty image source');
                    const res = await fetch(u);
                    return await res.blob();
                }
                throw new Error('Invalid source type: must be Blob or File');
            };

            const blob = await normalizeToBlob(file);

            const waitForImageService = () => {
                return new Promise((resolve) => {
                    const maxWait = 3000;
                    const checkInterval = 100;
                    let waited = 0;

                    if (window.Core && window.Core.ImageService) {
                        resolve(window.Core.ImageService);
                        return;
                    }

                    const interval = setInterval(() => {
                        waited += checkInterval;
                        if (window.Core && window.Core.ImageService) {
                            clearInterval(interval);
                            console.log('[compressImageToBlob] Core.ImageService 加载完成，等待时间:', waited, 'ms');
                            resolve(window.Core.ImageService);
                        } else if (waited >= maxWait) {
                            clearInterval(interval);
                            console.warn('[compressImageToBlob] Core.ImageService 加载超时（', maxWait, 'ms），使用 Canvas 压缩');
                            resolve(null);
                        }
                    }, checkInterval);
                });
            };

            const imageService = await waitForImageService();

            if (imageService) {
                try {
                    return await imageService.compressImage(blob, maxWidth, quality);
                } catch (e) {
                    console.warn('[compressImageToBlob] 图片压缩失败，尝试使用Canvas压缩:', e);
                }
            } else {
                console.warn('[compressImageToBlob] Core.ImageService 不可用，尝试使用Canvas压缩');
            }

            // Fallback to Canvas compression
            try {
                return await compressWithCanvasToBlob(blob);
            } catch (e) {
                console.warn('[compressImageToBlob] Canvas压缩也失败，使用原始文件:', e);
                return blob;
            }
        }

        // 处理添加照片表单提交
        async function handleCreatePhotoSubmit(e) {
            e.preventDefault();

            const photoDate = document.getElementById('photoDate').value;
            const photoLocation = document.getElementById('photoLocation').value.trim();
            const albumId = parseInt(document.getElementById('photoAlbumSelect').value);

            if (!photoDate) {
                alert('请选择拍摄日期');
                return;
            }

            if (isLocalImport) {
                if (selectedFiles.length === 0) {
                    alert('请选择要上传的照片');
                    return;
                }

                try {
                    showPageLoader();

                    const processPromises = selectedFiles.map(file => compressImageToBlob(file));
                    const compressedImages = await Promise.all(processPromises);
                    
                    // 保存到 IndexedDB
                    const savedImageSrcs = [];
                    for (const imgData of compressedImages) {
                        const id = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        try {
                            await window.ImageStorageDB.put(id, imgData, 'photo');
                            savedImageSrcs.push('idb:' + id);
                        } catch (err) {
                            console.error('保存照片到DB失败', err);
                            // 降级：如果DB失败，尝试使用原始base64（可能会导致localStorage溢出，但比丢失好）
                            try {
                                const reader = new FileReader();
                                const asDataUrl = await new Promise((resolve, reject) => {
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(imgData);
                                });
                                savedImageSrcs.push(asDataUrl);
                            } catch (e) {
                                savedImageSrcs.push('');
                            }
                        }
                    }
                    
                    let addedCount = 0;
                    const albumIndex = albumsData.findIndex(album => album.id === albumId);
                    
                    if (albumIndex !== -1) {
                        savedImageSrcs.forEach(src => {
                            const newPhoto = {
                                id: nextPhotoId++,
                                date: photoDate,
                                location: photoLocation,
                                src: src
                            };
                            albumsData[albumIndex].photos.push(newPhoto);
                            addedCount++;
                        });
                        
                        saveAlbumsForCurrentCharacter();
                        
                        // 更新UI
                        renderAlbumsNav();
                        closeAllModals();
                        
                        if (currentAlbumId === albumId) {
                            groupPhotos();
                            renderAlbum();
                        } else {
                            switchAlbum(albumId);
                        }
                        
                        clearFilePreview();
                        selectedFiles = [];
                        alert(`成功上传 ${addedCount} 张照片！`);
                    }
                } catch (error) {
                    console.error('上传失败:', error);
                    alert('照片处理失败，请重试');
                } finally {
                    hidePageLoader();
                }
            } else {
                // ... URL handling (unchanged logic but wrapped in async function)
                const photoUrl = document.getElementById('photoUrl').value.trim();
                
                if (!photoUrl) {
                    alert('请输入照片URL');
                    return;
                }
                
                const newPhoto = {
                    id: nextPhotoId++,
                    date: photoDate,
                    location: photoLocation,
                    src: photoUrl
                };
                
                const albumIndex = albumsData.findIndex(album => album.id === albumId);
                if (albumIndex !== -1) {
                    albumsData[albumIndex].photos.push(newPhoto);
                    saveAlbumsForCurrentCharacter();
                    
                    renderAlbumsNav();
                    closeAllModals();
                    
                    if (currentAlbumId === albumId) {
                        groupPhotos();
                        renderAlbum();
                    } else {
                        switchAlbum(albumId);
                    }
                    
                    alert('照片添加成功！');
                }
            }
        }

        // 删除照片
        function deletePhoto(photoId, albumId) {
            if (!confirm('确定要删除这张照片吗？')) {
                return false;
            }
            
            const albumIndex = albumsData.findIndex(album => album.id === albumId);
            if (albumIndex !== -1) {
                const photoIndex = albumsData[albumIndex].photos.findIndex(photo => photo.id === photoId);
                if (photoIndex !== -1) {
                    albumsData[albumIndex].photos.splice(photoIndex, 1);
                    saveAlbumsForCurrentCharacter();
                    
                    renderAlbumsNav();
                    groupPhotos();
                    renderAlbum();
                    
                    alert('照片已删除');
                    return true;
                }
            }
            return false;
        }

        // 打开分组方式模态框
        function openGroupingModal() {
            groupingModal.style.display = 'flex';
            
            // 设置当前选中的选项
            document.querySelectorAll('.group-option[data-group]').forEach(option => {
                option.classList.remove('active');
                if (option.dataset.group === currentViewMode) {
                    option.classList.add('active');
                }
            });
        }

        // 选择分组选项
        function selectGroupOption(e) {
            const option = e.currentTarget;
            document.querySelectorAll('.group-option[data-group]').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
        }

        // 保存分组设置
        function saveGrouping() {
            const selectedOption = document.querySelector('.group-option[data-group].active');
            if (selectedOption) {
                const newViewMode = selectedOption.dataset.group;
                if (currentViewMode !== newViewMode) {
                    currentViewMode = newViewMode;
                    groupPhotos();
                    renderAlbum();
                    updateMenuTexts();
                }
                saveGroupingForCurrentCharacter(currentViewMode);
            }
            closeAllModals();
        }

        // 打开图片比例模态框
        function openRatioModal() {
            ratioModal.style.display = 'flex';
            
            // 设置当前选中的选项
            document.querySelectorAll('.group-option[data-ratio]').forEach(option => {
                option.classList.remove('active');
                if (option.dataset.ratio === currentRatio) {
                    option.classList.add('active');
                }
            });
        }

        // 选择比例选项
        function selectRatioOption(e) {
            const option = e.currentTarget;
            document.querySelectorAll('.group-option[data-ratio]').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
        }

        // 保存比例设置
        function saveRatio() {
            const selectedOption = document.querySelector('.group-option[data-ratio].active');
            if (selectedOption) {
                const newRatio = selectedOption.dataset.ratio;
                if (currentRatio !== newRatio) {
                    currentRatio = newRatio;
                    renderAlbum();
                    updateMenuTexts();
                }
            }
            closeAllModals();
        }

        // 处理删除图集
        function handleDeleteAlbum() {
            if (!editAlbumId) return;
            
            const albumIndex = albumsData.findIndex(album => album.id === editAlbumId);
            if (albumIndex === -1) return;
            
            const albumName = albumsData[albumIndex].name;
            
            if (!confirm(`确定要删除图集"${albumName}"吗？此操作无法撤销，所有照片将被删除。`)) {
                hideEditMenu();
                return;
            }
            
            albumsData.splice(albumIndex, 1);
            saveAlbumsForCurrentCharacter();
            
            if (currentAlbumId === editAlbumId) {
                currentAlbumId = albumsData.length > 0 ? albumsData[0].id : null;
            }
            
            renderAlbumsNav();
            groupPhotos();
            renderAlbum();
            
            hideEditMenu();
            alert(`图集"${albumName}"已删除`);
        }

        // 处理移动图集
        function handleMoveAlbum() {
            hideEditMenu();
            openMoveAlbumModal();
        }

        // 打开移动图集模态框
        function openMoveAlbumModal() {
            moveAlbumModal.style.display = 'flex';
            renderAlbumMoveList();
        }

        // 渲染图集移动列表
        function renderAlbumMoveList() {
            albumMoveList.innerHTML = '';
            
            albumsData.forEach((album, index) => {
                const moveItem = document.createElement('div');
                moveItem.className = 'album-move-item';
                moveItem.dataset.albumId = album.id;
                moveItem.dataset.index = index;
                
                moveItem.innerHTML = `
                    <div class="drag-handle">
                        <i class="fas fa-arrows-alt"></i>
                    </div>
                    <div class="album-info">
                        <div class="album-name">${album.name}</div>
                        <div class="album-count">${album.photos.length} 张照片</div>
                    </div>
                `;
                
                albumMoveList.appendChild(moveItem);
            });
            
            // 初始化拖拽功能
            initDragAndDrop();
        }

        // 初始化拖拽功能
        function initDragAndDrop() {
            let dragSrcEl = null;
            let touchStartY = 0;
            let touchStartIndex = 0;
            
            function handleDragStart(e) {
                dragSrcEl = this;
                this.style.opacity = '0.4';
                
                // 处理触摸事件
                if (e.type === 'touchstart') {
                    touchStartY = e.touches[0].clientY;
                    touchStartIndex = parseInt(this.dataset.index);
                }
            }
            
            function handleDragOver(e) {
                e.preventDefault();
                return false;
            }
            
            function handleDragEnter(e) {
                this.classList.add('over');
            }
            
            function handleDragLeave(e) {
                this.classList.remove('over');
            }
            
            function handleDrop(e) {
                e.stopPropagation();
                e.preventDefault();
                
                if (dragSrcEl !== this) {
                    const items = Array.from(albumMoveList.children);
                    const srcIndex = items.indexOf(dragSrcEl);
                    const destIndex = items.indexOf(this);
                    
                    if (srcIndex < destIndex) {
                        albumMoveList.insertBefore(dragSrcEl, this.nextSibling);
                    } else {
                        albumMoveList.insertBefore(dragSrcEl, this);
                    }
                    
                    // 更新索引
                    items.forEach((item, index) => {
                        item.dataset.index = index;
                    });
                }
                
                return false;
            }
            
            function handleDragEnd(e) {
                this.style.opacity = '1';
                document.querySelectorAll('.album-move-item').forEach(item => {
                    item.classList.remove('over');
                });
            }
            
            function handleTouchMove(e) {
                // 如果没有阻止默认行为，页面会滚动
                if (e.cancelable) {
                    e.preventDefault();
                }
                const touchY = e.touches[0].clientY;
                const deltaY = touchY - touchStartY;
                
                if (Math.abs(deltaY) > 20) {
                    const items = Array.from(albumMoveList.children);
                    const currentIndex = parseInt(this.dataset.index);
                    const newIndex = touchStartIndex + Math.round(deltaY / 60);
                    
                    if (newIndex >= 0 && newIndex < items.length && newIndex !== currentIndex) {
                        if (newIndex > currentIndex) {
                            albumMoveList.insertBefore(this, items[newIndex].nextSibling);
                        } else {
                            albumMoveList.insertBefore(this, items[newIndex]);
                        }
                        
                        // 更新索引
                        items.forEach((item, index) => {
                            item.dataset.index = index;
                        });
                    }
                }
            }
            
            function handleTouchEnd(e) {
                this.style.opacity = '1';
                // 重置状态
            }
            
            // 为每个项目添加事件监听器
            const items = albumMoveList.querySelectorAll('.album-move-item');
            items.forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('dragenter', handleDragEnter);
                item.addEventListener('dragleave', handleDragLeave);
                item.addEventListener('drop', handleDrop);
                item.addEventListener('dragend', handleDragEnd);
                
                // 触摸事件
                item.addEventListener('touchstart', handleDragStart, {passive: false});
                item.addEventListener('touchmove', handleTouchMove, {passive: false});
                item.addEventListener('touchend', handleTouchEnd);
            });
        }

        // 保存图集顺序
        function saveAlbumOrder() {
            const newOrder = [];
            const moveItems = albumMoveList.querySelectorAll('.album-move-item');
            
            moveItems.forEach(item => {
                const albumId = parseInt(item.dataset.albumId);
                const album = albumsData.find(a => a.id === albumId);
                if (album) {
                    newOrder.push(album);
                }
            });
            
            albumsData = newOrder;
            saveAlbumsForCurrentCharacter();
            renderAlbumsNav();
            closeAllModals();
            
            alert('图集顺序已更新');
        }

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', init);

        // 返回主页按钮逻辑
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (document.body.classList.contains('album-mode')) {
                    showPageLoader();
                    requestAnimationFrame(() => {
                        showCharactersPage();
                        setTimeout(hidePageLoader, 160);
                    });
                    return;
                }
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'closeApp', appId: 'xiangce' }, _getPostTargetOrigin());
                    }
                } catch (err) {
                    console.error('PostMessage error:', err);
                }
            });
        }
