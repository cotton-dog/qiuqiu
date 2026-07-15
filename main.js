        (function () {
            try {
                if (!Number.isFinite) {
                    Number.isFinite = function (v) {
                        return typeof v === 'number' && isFinite(v);
                    };
                }
                if (!Array.prototype.flatMap) {
                    Array.prototype.flatMap = function (fn, thisArg) {
                        return Array.prototype.concat.apply([], this.map(fn, thisArg));
                    };
                }
                if (typeof Element !== 'undefined') {
                    if (!Element.prototype.matches) {
                        Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
                    }
                    if (!Element.prototype.closest) {
                        Element.prototype.closest = function (selector) {
                            let el = this;
                            while (el && el.nodeType === 1) {
                                if (el.matches && el.matches(selector)) return el;
                                el = el.parentElement || el.parentNode;
                            }
                            return null;
                        };
                    }
                }
            } catch (e) {}
        })();

        function syncAppHeight() {
            try {
                document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
            } catch (e) {}
        }
        
        var _sleepAidInitialized = false;
        var _sleepAidReadyReceived = false;
        
        function initSleepAid() {
            if (_sleepAidInitialized) return;
            _sleepAidInitialized = true;
            syncAppHeight();
            if (window.Core && window.Core.EventManager) {
                window.Core.EventManager.on(window, 'resize', syncAppHeight, { groupId: 'sleep-aid-resize', passive: true });
                window.Core.EventManager.on(window, 'orientationchange', syncAppHeight, { groupId: 'sleep-aid-resize', passive: true });
            } else {
                window.addEventListener('resize', syncAppHeight, { passive: true });
                window.addEventListener('orientationchange', syncAppHeight, { passive: true });
            }
        }

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
                syncFromWechat().then(() => {
                    updateCharacterDisplay();
                    renderCharacters();
                    renderDialogueFolders();
                    updateDialogue();
                }).catch(console.error);
            }
            if (event.data && event.data.type === 'app:ready') {
                if (!_sleepAidReadyReceived) {
                    _sleepAidReadyReceived = true;
                    initSleepAid();
                }
                if (typeof initPage === 'function' && !_sleepAidInitialized) {
                    initPage();
                }
            }
        });

        const DB_NAME = 'SleepAssistantDB';
        const DB_VERSION = 1;
        const STORE_NAME = 'audioFiles';
        const LS_KEYS = {
            whiteNoises: 'sleepAssistantWhiteNoises',
            sleepAudios: 'sleepAssistantSleepAudios',
            dialogues: 'sleepAssistantDialogues',
            dialoguesInit: 'sleepAssistantDialoguesInit',
            characters: 'sleepAssistantCharacters',
            state: 'sleepAssistantState'
        };
        let db = null;
        const LEGACY_SAMPLE_MP3_URL = 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3';
        const DEFAULT_SAMPLE_MP3_URL = 'https://cdn.jsdelivr.net/gh/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3';

        // 初始化数据
        let characters = [];
        
        // MessageBus辅助函数：通过MessageBus请求角色数据
        async function requestRoleDataViaMessageBus(roleId) {
            return new Promise((resolve, reject) => {
                if (!window.parent || !window.Core || !window.Core.MessageBus) {
                    resolve(null);
                    return;
                }
                const nonce = Math.random().toString(36).substr(2, 9);
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    resolve(null);
                }, 5000);

                const handler = (event) => {
                    if (event.data && event.data.type === 'getRoleData_response' && event.data.nonce === nonce) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        resolve(event.data.payload);
                    }
                };

                window.addEventListener('message', handler);
                window.Core.MessageBus.send(window.parent, 'getRoleData', { roleId: roleId, nonce: nonce });
            });
        }

        // MessageBus辅助函数：通过MessageBus保存角色数据
        async function saveRoleDataViaMessageBus(roleId, data) {
            return new Promise((resolve, reject) => {
                if (!window.parent || !window.Core || !window.Core.MessageBus) {
                    resolve({ success: false });
                    return;
                }
                const nonce = Math.random().toString(36).substr(2, 9);
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    resolve({ success: false });
                }, 5000);

                const handler = (event) => {
                    if (event.data && event.data.type === 'saveRoleData_response' && event.data.nonce === nonce) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        resolve(event.data.payload);
                    }
                };

                window.addEventListener('message', handler);
                window.Core.MessageBus.send(window.parent, 'saveRoleData', { roleId: roleId, data: data, nonce: nonce });
            });
        }

        // 从本地存储或MessageBus加载数据
        async function loadData() {
            // 优先尝试通过MessageBus加载（如果可用）
            let loadedViaMessageBus = false;
            if (window.parent && window.Core && window.Core.MessageBus) {
                try {
                    // 尝试加载所有角色（这里简化处理，实际应该遍历所有角色ID）
                    // 为了兼容，先检查localStorage是否有数据，如果有则迁移
                    const savedCharacters = localStorage.getItem(LS_KEYS.characters);
                    if (savedCharacters) {
                        try {
                            const chars = JSON.parse(savedCharacters);
                            // 迁移每个角色到IndexedDB
                            for (let i = 0; i < chars.length; i++) {
                                const char = chars[i];
                                if (char && char.id) {
                                    const roleData = await requestRoleDataViaMessageBus(char.id);
                                    if (!roleData || !roleData.meta) {
                                        // 如果IndexedDB中没有，尝试迁移
                                        if (window.parent && window.Core && window.Core.MessageBus) {
                                            const nonce = Math.random().toString(36).substr(2, 9);
                                            window.Core.MessageBus.send(window.parent, 'migrateRoleFromLocalStorage', { roleId: char.id, nonce: nonce });
                                        }
                                    }
                                }
                            }
                            loadedViaMessageBus = true;
                        } catch (e) {
                            console.error('MessageBus加载角色数据失败:', e);
                        }
                    }
                } catch (e) {
                    console.error('MessageBus请求失败:', e);
                }
            }

            // 回退到localStorage
            if (!loadedViaMessageBus) {
                const savedCharacters = localStorage.getItem(LS_KEYS.characters);
                if (savedCharacters) {
                    try {
                        characters = JSON.parse(savedCharacters);
                    } catch (e) {
                        console.error('加载角色数据失败:', e);
                    }
                }
            }
            
            const savedState = localStorage.getItem(LS_KEYS.state);
            if (savedState) {
                try {
                    const loadedState = JSON.parse(savedState);
                    state = { ...state, ...loadedState };
                } catch (e) {
                    console.error('加载状态数据失败:', e);
                }
            }

            const savedWhiteNoises = localStorage.getItem(LS_KEYS.whiteNoises);
            if (savedWhiteNoises) {
                try {
                    whiteNoises = JSON.parse(savedWhiteNoises).map(n => ({ ...n, playing: false }));
                } catch (e) {
                    console.error('加载白噪音数据失败:', e);
                }
            } else {
                saveAudioLists();
            }

            const savedSleepAudios = localStorage.getItem(LS_KEYS.sleepAudios);
            if (savedSleepAudios) {
                try {
                    sleepAudios = JSON.parse(savedSleepAudios).map(a => ({ ...a, playing: false }));
                } catch (e) {
                    console.error('加载助眠音频数据失败:', e);
                }
            } else {
                saveAudioLists();
            }

            let needSaveAudioLists = false;
            if (Array.isArray(whiteNoises)) {
                whiteNoises = whiteNoises.map(n => {
                    if (!n || typeof n !== 'object') return n;
                    if (typeof n.audio !== 'string') return n;
                    if (n.audio !== LEGACY_SAMPLE_MP3_URL) return n;
                    needSaveAudioLists = true;
                    return { ...n, audio: DEFAULT_SAMPLE_MP3_URL };
                });
            }

            if (Array.isArray(sleepAudios)) {
                sleepAudios = sleepAudios.map(a => {
                    if (!a || typeof a !== 'object') return a;
                    if (typeof a.audio !== 'string') return a;
                    if (a.audio !== LEGACY_SAMPLE_MP3_URL) return a;
                    needSaveAudioLists = true;
                    return { ...a, audio: DEFAULT_SAMPLE_MP3_URL };
                });
            }

            if (needSaveAudioLists) {
                saveAudioLists();
            }

            const savedDialogues = localStorage.getItem(LS_KEYS.dialogues);
            if (savedDialogues) {
                try {
                    customDialogues = JSON.parse(savedDialogues);
                } catch (e) {
                    console.error('加载语音条数据失败:', e);
                    customDialogues = [];
                }
            } else {
                customDialogues = [];
            }

            ensureDialoguesInitialized();
            
            // 同步微信好友
            syncFromWechat();
        }
        
        // 初始化背景选择卡片
        function initBgCard() {
            const card = document.getElementById('bgSelectCard');
            const closeBtn = document.getElementById('closeBgCard');
            const addBtn = document.getElementById('addBgFromPhone');
            const fileInput = document.getElementById('bgFileInput');
            const changeBgBtn = document.getElementById('changeBgBtn');
            const editChangeBgBtn = document.getElementById('editChangeBgBtn');

            // 打开卡片 (从角色设置页)
            if (changeBgBtn) {
                changeBgBtn.onclick = () => {
                    openBgCard(state.selectedCharacter);
                };
            }
            
            // 打开卡片 (从编辑浮窗)
            if (editChangeBgBtn) {
                editChangeBgBtn.onclick = () => {
                    // 如果正在编辑，使用编辑ID，否则使用选中ID
                    const targetId = state.editingCharacterId || state.selectedCharacter;
                    if (targetId) openBgCard(targetId);
                };
            }

            // 关闭卡片
            closeBtn.onclick = () => {
                card.classList.remove('show');
            };

            // 添加本地图片
            addBtn.onclick = () => {
                fileInput.click();
            };

            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    state.characterSettingsImage = e.target.result;
                    // 刷新主预览
                    renderCharacterGallery(state.selectedCharacter); // 这一步可能会重置，但我们需要更新显示的选中状态
                    // 关闭卡片
                    card.classList.remove('show');
                    showNotification('图片已选择');
                };
                reader.readAsDataURL(file);
            };
        }

        // 打开背景选择卡片
        function openBgCard(characterId) {
            const card = document.getElementById('bgSelectCard');
            const grid = document.getElementById('bgGrid');
            const empty = document.getElementById('bgEmptyTip');
            
            // 清空当前列表
            grid.innerHTML = '';
            
            // 获取相册图片
            const images = getAlbumImages(characterId);
            
            if (images.length === 0) {
                empty.style.display = 'flex';
            } else {
                empty.style.display = 'none';
                images.forEach(src => {
                    const item = document.createElement('div');
                    item.className = 'bg-item';
                    if (state.characterSettingsImage === src) {
                        item.classList.add('selected');
                    }
                    
                    const img = document.createElement('img');
                    img.src = '';
                    applyImgSrc(img, src, '');
                    item.appendChild(img);
                    
                    item.onclick = () => {
                        state.characterSettingsImage = src;
                        
                        // 更新选中样式
                        document.querySelectorAll('.bg-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        
                        // 稍微延迟关闭，给用户反馈
                        setTimeout(() => {
                            card.classList.remove('show');
                        }, 200);
                    };
                    
                    grid.appendChild(item);
                });
            }
            
            card.classList.add('show');
        }

        // 获取角色相册图片
        function getAlbumImages(characterId) {
            const character = characters.find(c => c.id === characterId);
            if (!character || !character.wechatId) return [];
            
            const key = `photo_albums_${character.wechatId}`;
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            try {
                const albums = JSON.parse(raw);
                if (!Array.isArray(albums)) return [];
                // 提取所有照片并扁平化
                return albums.reduce((acc, album) => acc.concat((album && album.photos) || []), []).map(p => p && p.src).filter(Boolean);
            } catch (e) {
                return [];
            }
        }

        // 保存数据到本地存储或通过MessageBus
        async function saveData() {
            try {
                // 优先通过MessageBus保存角色数据
                if (window.parent && window.Core && window.Core.MessageBus && characters && characters.length > 0) {
                    for (let i = 0; i < characters.length; i++) {
                        const char = characters[i];
                        if (char && char.id) {
                            try {
                                await saveRoleDataViaMessageBus(char.id, { meta: char });
                            } catch (e) {
                                console.error('MessageBus保存角色' + char.id + '失败:', e);
                            }
                        }
                    }
                }

                // 同时保存到localStorage作为备份
                localStorage.setItem(LS_KEYS.characters, JSON.stringify(characters));
                localStorage.setItem(LS_KEYS.state, JSON.stringify({
                    selectedCharacter: state.selectedCharacter,
                    collapsedSections: state.collapsedSections
                }));
            } catch (e) {
                console.error('保存数据失败:', e);
            }
        }

        function saveAudioLists() {
            try {
                const whiteNoisesToSave = (whiteNoises || []).map(n => ({ ...n, playing: false }));
                const sleepAudiosToSave = (sleepAudios || []).map(a => ({ ...a, playing: false }));
                localStorage.setItem(LS_KEYS.whiteNoises, JSON.stringify(whiteNoisesToSave));
                localStorage.setItem(LS_KEYS.sleepAudios, JSON.stringify(sleepAudiosToSave));
            } catch (e) {
                console.error('保存音频列表失败:', e);
            }
        }

        function saveDialogues() {
            try {
                localStorage.setItem(LS_KEYS.dialogues, JSON.stringify(customDialogues || []));
            } catch (e) {
                console.error('保存语音条失败:', e);
            }
        }

        function ensureDialoguesInitialized() {
            let inited = false;
            try {
                inited = localStorage.getItem(LS_KEYS.dialoguesInit) === '1';
            } catch (e) {
                return;
            }
            if (inited) return;

            if (!Array.isArray(customDialogues)) customDialogues = [];
            const existingGlobalTexts = new Set();
            customDialogues.forEach(d => {
                if (!d || typeof d !== 'object') return;
                if (d.scope !== 'global') return;
                const t = typeof d.text === 'string' ? d.text.trim() : '';
                if (t) existingGlobalTexts.add(t);
            });

            (defaultDialogues || []).forEach(raw => {
                const t = typeof raw === 'string' ? raw.trim() : '';
                if (!t) return;
                if (existingGlobalTexts.has(t)) return;
                customDialogues.push({
                    id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                    text: t,
                    scope: 'global',
                    characterId: null
                });
                existingGlobalTexts.add(t);
            });

            saveDialogues();
            try {
                localStorage.setItem(LS_KEYS.dialoguesInit, '1');
            } catch (e) {}
        }

        // Helper
        function _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function initDB() {
            const core = window.Core && window.Core.StorageService;
            if (core) {
                return core.openDB(DB_NAME, DB_VERSION, (db) => {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                });
            }

            if (db) return db;
            if (!window.indexedDB) throw new Error('indexedDB unavailable');

            db = await new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = () => {
                    const nextDb = request.result;
                    if (!nextDb.objectStoreNames.contains(STORE_NAME)) {
                        nextDb.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            return db;
        }

        async function saveBlobToDB(key, blob) {
            const core = window.Core && window.Core.StorageService;
            if (core) {
                return core.transaction(DB_NAME, [STORE_NAME], async (tx) => {
                    const store = tx.objectStore(STORE_NAME);
                    await _req(store.put(blob, key));
                });
            }

            const nativeDb = await initDB();
            return new Promise((resolve, reject) => {
                const tx = nativeDb.transaction([STORE_NAME], 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('transaction failed'));
                tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
                tx.objectStore(STORE_NAME).put(blob, key);
            });
        }

        async function getBlobFromDB(key) {
            const core = window.Core && window.Core.StorageService;
            if (core) {
                return core.transaction(DB_NAME, [STORE_NAME], async (tx) => {
                    const store = tx.objectStore(STORE_NAME);
                    return await _req(store.get(key));
                });
            }

            const nativeDb = await initDB();
            return new Promise((resolve, reject) => {
                const tx = nativeDb.transaction([STORE_NAME], 'readonly');
                const req = tx.objectStore(STORE_NAME).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        function formatDuration(seconds) {
            if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        async function getPlayableSrc(source) {
            if (!source) return { src: '', objectUrl: null };
            if (typeof source === 'string' && source.startsWith('indexeddb://')) {
                const id = parseInt(source.replace('indexeddb://', ''), 10);
                if (!Number.isFinite(id)) return { src: source, objectUrl: null };
                const blob = await getBlobFromDB(id);
                if (!blob) return { src: '', objectUrl: null };
                
                // 使用BlobUrlService统一管理Blob URL
                const blobUrlService = getBlobUrlService();
                let objectUrl;
                if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                    objectUrl = blobUrlService.createObjectUrl(blob, { groupId: GROUP_ID });
                } else {
                    objectUrl = URL.createObjectURL(blob);
                }
                return { src: objectUrl, objectUrl };
            }
            return { src: source, objectUrl: null };
        }

        // 使用BlobUrlService统一管理Blob URL
        const GROUP_ID = 'sleep_aid'; // 助眠页面的分组ID

        // 获取BlobUrlService实例
        function getBlobUrlService() {
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

        function cleanupAudioObjectUrl(audio) {
            if (!audio) return;
            const objectUrl = audio._objectUrl;
            if (objectUrl && typeof objectUrl === 'string' && objectUrl.startsWith('blob:')) {
                const blobUrlService = getBlobUrlService();
                if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                    blobUrlService.revoke(objectUrl);
                } else {
                    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                }
            }
            audio._objectUrl = null;
        }

        function ensureImageStorageDB() {
            // Helper proxy to Core Services
            return {
                init: async () => {
                     if (window.Core && window.Core.StorageService) {
                        return window.Core.StorageService.openDB('PhoneAppImages', 5);
                     }
                },
                put: async (id, data, type = 'image') => {
                     return window.Core.StorageService.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        await _req(store.put({ id, data, type, timestamp: Date.now() }));
                    });
                },
                get: async (id) => {
                     return window.Core.StorageService.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        const res = await _req(store.get(id));
                        return res ? res.data : null;
                    });
                },
                 getAppData: async (key) => {
                     return window.Core.StorageService.transaction('PhoneAppImages', ['appData'], async (tx) => {
                        const store = tx.objectStore('appData');
                        const res = await _req(store.get(key));
                        return res ? res.value : null;
                    });
                }
            };
        }

        async function resolveIdbSrc(src) {
            if (!src || typeof src !== 'string' || !src.startsWith('idb:')) return src;
            const id = src.slice(4);
            if (!id) return '';

            try {
                const db = ensureImageStorageDB();
                const data = await db.get(id);
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
                return data;
            } catch (e) {
                return '';
            }
        }

        async function applyImgSrc(imgEl, src, fallbackSrc) {
            if (!imgEl) return;
            let resolved = await resolveIdbSrc(normalizePlainSrc(src));
            if (typeof resolved === 'string' && resolved.trim() === '[object Blob]') {
                resolved = '';
            }
            if (typeof resolved === 'string') {
                resolved = normalizePlainSrc(resolved);
            }
            const fb = normalizePlainSrc(fallbackSrc);

            const isBlobLike = (v) => {
                if (!v || typeof v !== 'object') return false;
                if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
                const tag = Object.prototype.toString.call(v);
                if (tag === '[object Blob]') return true;
                if (typeof v.size === 'number' && typeof v.type === 'string' && typeof v.slice === 'function') return true;
                return false;
            };

            const blobUrlService = getBlobUrlService();
            if (imgEl.dataset && imgEl.dataset.tempObjectUrl) {
                const old = imgEl.dataset.tempObjectUrl;
                if (old && typeof resolved === 'string' && old === resolved) {
                } else {
                    if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                        blobUrlService.revoke(old);
                    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        try { URL.revokeObjectURL(old); } catch (e) {}
                    }
                    imgEl.dataset.tempObjectUrl = '';
                }
            }

            if (isBlobLike(resolved)) {
                let u;
                if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                    u = blobUrlService.createObjectUrl(resolved, { groupId: GROUP_ID });
                } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                    u = URL.createObjectURL(resolved);
                }
                if (u) {
                    if (imgEl.dataset) imgEl.dataset.tempObjectUrl = u;
                    imgEl.src = u;
                    return;
                }
            }

            imgEl.src = resolved || fb || '';
        }
        
        // 同步微信好友作为角色
        async function syncFromWechat() {
            let wechatData = null;

            try {
                const db = ensureImageStorageDB();
                if (db && db.getAppData) {
                    wechatData = await db.getAppData('wechatAppData');
                }
            } catch (e) { console.error(e); }

            if (!wechatData) {
                const wechatDataStr = localStorage.getItem('wechatAppData');
                if (wechatDataStr) {
                    try {
                        wechatData = JSON.parse(wechatDataStr);
                    } catch (e) {}
                }
            }
            
            if (!wechatData) return;
            
            try {
                const contacts = Array.isArray(wechatData && wechatData.contacts) ? wechatData.contacts : [];
                let updated = false;

                const contactById = new Map();
                contacts.forEach(c => {
                    if (!c || c.id == null) return;
                    contactById.set(String(c.id), c);
                });

                const removedCharacterIds = [];
                const remainingCharacters = [];
                (characters || []).forEach(ch => {
                    if (!ch || typeof ch !== 'object') return;
                    if (ch.wechatId == null) {
                        remainingCharacters.push(ch);
                        return;
                    }
                    const contact = contactById.get(String(ch.wechatId));
                    if (!contact) {
                        removedCharacterIds.push(ch.id);
                        updated = true;
                        return;
                    }
                    remainingCharacters.push(ch);
                });
                characters = remainingCharacters;

                if (removedCharacterIds.length > 0) {
                    const removedIdSet = new Set(removedCharacterIds.map(id => String(id)));
                    customDialogues = (customDialogues || []).filter(d => {
                        if (!d || typeof d !== 'object') return false;
                        if (d.scope !== 'character') return true;
                        return !removedIdSet.has(String(d.characterId));
                    });
                    saveDialogues();

                    if (removedIdSet.has(String(state.selectedCharacter))) {
                        state.selectedCharacter = characters.length > 0 ? characters[0].id : null;
                    }
                }

                let nextId = 1;
                if (characters.length > 0) {
                    const ids = characters.map(c => c && c.id).filter(id => typeof id === 'number' && Number.isFinite(id));
                    if (ids.length > 0) nextId = Math.max(...ids) + 1;
                }

                contacts.forEach(contact => {
                    if (!contact || contact.id == null) return;

                    const existingChar = characters.find(c => c && String(c.wechatId) === String(contact.id));
                    const desiredName = (contact.name || '未命名').trim() || '未命名';
                    const desiredText = (contact.avatarText || desiredName.charAt(0) || '?').toString();
                    const desiredColor = contact.avatarColor || 'bg-sage';

                    let desiredImg = '';
                    if (contact.hasCustomAvatar) {
                        desiredImg = normalizePlainSrc(localStorage.getItem(`avatar_${contact.id}`) || '');
                    }
                    if (!desiredImg) {
                        desiredImg = generateTextAvatar(desiredText, desiredColor);
                    }

                    if (existingChar) {
                        if (existingChar.name !== desiredName) {
                            existingChar.name = desiredName;
                            updated = true;
                        }

                        if (!existingChar.customBg && desiredImg && existingChar.img !== desiredImg) {
                            existingChar.img = desiredImg;
                            updated = true;
                        }

                        if (existingChar.avatarColor !== desiredColor) {
                            existingChar.avatarColor = desiredColor;
                            updated = true;
                        }

                        if (existingChar.gradient == null) {
                            existingChar.gradient = true;
                            updated = true;
                        }

                        if (existingChar.customBg == null) {
                            existingChar.customBg = false;
                            updated = true;
                        }
                        return;
                    }

                    const newCharacter = {
                        id: nextId,
                        wechatId: contact.id,
                        name: desiredName,
                        img: desiredImg,
                        avatarColor: desiredColor,
                        gradient: true,
                        customBg: false
                    };
                    nextId += 1;
                    characters.push(newCharacter);
                    updated = true;
                });
                
                if (updated) {
                    saveData();
                }
            } catch (e) {
                console.error('同步微信好友失败:', e);
            }
        }
        
        // 生成文字头像
        function generateTextAvatar(text, colorClass) {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            
            // 颜色映射
            const colors = {
                'bg-mauve': '#c9b1be',
                'bg-dusty-rose': '#d8a8a8',
                'bg-sage': '#b1c2a9',
                'bg-stone': '#a8a8a8',
                'bg-clay': '#b8a38d',
                'bg-slate': '#8a9ba3',
                'bg-moss': '#8a9d8a',
                'bg-sand': '#d9c7b4',
                'bg-rose': '#c9b1be',
                'bg-olive': '#9da391',
                'bg-terracotta': '#c6a3a3'
            };
            
            const colorKey = colorClass ? String(colorClass) : '';
            const bgColor = colors[colorKey] || (/^#/.test(colorKey) ? colorKey : '') || '#b1c2a9';
            
            // 绘制背景
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, 200, 200);
            
            // 绘制文字
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 80px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text || '?', 100, 100);
            
            return canvas.toDataURL('image/png');
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
        
        const defaultWhiteNoises = [];
        
        const defaultSleepAudios = [];
        
        const defaultDialogues = [
            "今天过得怎么样？我已经等你很久了。",
            "累了吗？放松一点，我在这里陪着你。",
            "闭上眼睛，深呼吸，把烦恼都暂时放下。",
            "我会一直在这里，守护你的安眠。",
            "明天的你，一定会比今天更加美好。",
            "听，外面的世界已经安静下来了。",
            "让音乐带走你的疲惫，好好休息吧。",
            "不用担心，一切都会好起来的。",
            "我在这里，你不会孤单的。",
            "晚安，愿你有一个美好的梦境。"
        ];

        let whiteNoises = defaultWhiteNoises.map(n => ({ ...n }));
        let sleepAudios = defaultSleepAudios.map(a => ({ ...a }));
        let customDialogues = [];
        
        // 状态管理
        let state = {
            selectedCharacter: 1,
            editingCharacterId: null,
            currentDialogueIndex: 0,
            timer: {
                hours: 0,
                minutes: 0,
                seconds: 0
            },
            activeWhiteNoises: [],
            activeSleepAudio: null,
            uploadType: null,
            fileToUpload: null,
            characterSettingsImage: null,
            newCharacterImage: null,
            pendingNewCharacter: null,
            collapsedSections: {
                character: true,
                dialogue: true,
                whiteNoise: true,
                sleepAudio: true
            }
        };
        
        // 音频元素存储
        const audioElements = {
            whiteNoises: {},
            sleepAudio: null
        };
        
        // DOM元素
        const playPage = document.getElementById('playPage');
        const settingsPage = document.getElementById('settingsPage');
        const uploadModal = document.getElementById('uploadModal');
        const characterModal = document.getElementById('characterModal');
        const editModal = document.getElementById('editModal');
        const addCharacterModal = document.getElementById('addCharacterModal');
        const homeBtn = document.getElementById('homeBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const closeSettings = document.getElementById('closeSettings');
        const closeUpload = document.getElementById('closeUpload');
        const cancelUpload = document.getElementById('cancelUpload');
        const confirmUpload = document.getElementById('confirmUpload');
        const closeCharacter = document.getElementById('closeCharacter');
        const closeEdit = document.getElementById('closeEdit');
        const closeAddCharacter = document.getElementById('closeAddCharacter');
        const characterImage = document.getElementById('characterImage');
        const characterGradient = document.getElementById('characterGradient');
        const characterName = document.getElementById('characterName');
        const dialogueItem = document.getElementById('dialogueItem');
        const timerText = document.getElementById('timerText');
        const characterList = document.getElementById('characterList');
        const whiteNoiseList = document.getElementById('whiteNoiseList');
        const sleepAudioList = document.getElementById('sleepAudioList');
        const dialogueFolderList = document.getElementById('dialogueFolderList');
        const characterHeader = document.getElementById('characterHeader');
        const dialogueHeader = document.getElementById('dialogueHeader');
        const whiteNoiseHeader = document.getElementById('whiteNoiseHeader');
        const sleepAudioHeader = document.getElementById('sleepAudioHeader');
        const uploadDropArea = document.getElementById('uploadDropArea');
        const uploadInput = document.getElementById('uploadInput');
        const uploadTitle = document.getElementById('uploadTitle');
        const uploadUrlSection = document.getElementById('uploadUrlSection');
        const uploadUrlInput = document.getElementById('uploadUrlInput');
        const addCharacterBtn = document.getElementById('addCharacterBtn');
        const addDialogueBtn = document.getElementById('addDialogueBtn');
        const addCharacterUploadArea = document.getElementById('addCharacterUploadArea');
        const addCharacterInput = document.getElementById('addCharacterInput');
        const cancelAddCharacter = document.getElementById('cancelAddCharacter');
        const confirmAddCharacter = document.getElementById('confirmAddCharacter');
        const characterGallery = document.getElementById('characterGallery');
        const characterGalleryUpload = document.getElementById('characterGalleryUpload');
        const characterGalleryInput = document.getElementById('characterGalleryInput');
        const gradientToggle = document.getElementById('gradientToggle');
        const applyGallery = document.getElementById('applyGallery');
        const applySettings = document.getElementById('applySettings');
        const cancelGallery = document.getElementById('cancelGallery');
        const cancelSettings = document.getElementById('cancelSettings');
        const characterModalTitle = document.getElementById('characterModalTitle');
        const editInput = document.getElementById('editInput');
        const editTitle = document.getElementById('editTitle');
        const cancelEdit = document.getElementById('cancelEdit');
        const confirmEdit = document.getElementById('confirmEdit');
        const deleteCharacterBtn = document.getElementById('deleteCharacterBtn');
        const dialogueModal = document.getElementById('dialogueModal');
        const closeDialogue = document.getElementById('closeDialogue');
        const cancelDialogue = document.getElementById('cancelDialogue');
        const confirmDialogue = document.getElementById('confirmDialogue');
        const globalDialogueInput = document.getElementById('globalDialogueInput');
        const characterDialogueInput = document.getElementById('characterDialogueInput');
        const dialogueCharacterSelect = document.getElementById('dialogueCharacterSelect');
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmText = document.getElementById('confirmText');
        const closeConfirm = document.getElementById('closeConfirm');
        const cancelConfirm = document.getElementById('cancelConfirm');
        const okConfirm = document.getElementById('okConfirm');
        const editDialogueModal = document.getElementById('editDialogueModal');
        const editDialogueTitle = document.getElementById('editDialogueTitle');
        const editDialogueInput = document.getElementById('editDialogueInput');
        const closeEditDialogue = document.getElementById('closeEditDialogue');
        const cancelEditDialogue = document.getElementById('cancelEditDialogue');
        const confirmEditDialogue = document.getElementById('confirmEditDialogue');

        const characterSelectModal = document.getElementById('characterSelectModal');
        const characterSelectList = document.getElementById('characterSelectList');
        const cancelCharacterSelect = document.getElementById('cancelCharacterSelect');
        const confirmCharacterSelect = document.getElementById('confirmCharacterSelect');

        let pendingConfirmAction = null;
        let editingDialogueId = null;
        let pendingSelectedCharacterId = null;

        let timerIntervalId = null;
        let dialogueIntervalId = null;
        let dialogueAnimationTimeoutId = null;
        let hasEntered = false;
        
        // 初始化页面
        async function initPage() {
            try {
                await initDB();
            } catch (e) {
                console.error('初始化数据库失败:', e);
            }

            try {
                const db = ensureImageStorageDB();
                if (db && typeof db.init === 'function') await db.init();
            } catch (e) {}

            loadData();

            setupEventListeners();
            initBgCard();

            renderCharacters();
            renderWhiteNoises();
            renderSleepAudios();
            renderDialogueFolders();

            openCharacterSelectModal();
        }
        
        // 渲染角色列表
        function renderCharacters() {
            characterList.innerHTML = '';
            
            characters.forEach(character => {
                const characterItem = document.createElement('div');
                characterItem.className = `character-item ${character.id === state.selectedCharacter ? 'active' : ''}`;
                characterItem.dataset.id = character.id;
                characterItem.textContent = character.name;
                
                const editBtn = document.createElement('button');
                editBtn.className = 'character-item-edit';
                editBtn.innerHTML = '<i class="fas fa-pen"></i>';
                editBtn.title = "编辑角色";
                characterItem.appendChild(editBtn);
                
                // 单击选择角色
                characterItem.addEventListener('click', (e) => {
                    // 如果点击的是编辑按钮，则不触发选择
                    if (e.target.closest('.character-item-edit')) return;
                    
                    state.selectedCharacter = character.id;
                    updateCharacterDisplay();
                    renderCharacters();
                });
                
                // 双击编辑角色名字
                characterItem.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    openEditModal(character.id);
                });
                
                // 编辑按钮点击事件
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(character.id);
                });
                
                characterList.appendChild(characterItem);
            });
            
            // 更新折叠状态
            updateSectionCollapse('character');
        }
        
        // 渲染白噪音列表
        function renderWhiteNoises() {
            whiteNoiseList.innerHTML = '';
            
            whiteNoises.forEach(noise => {
                const audioItem = document.createElement('div');
                audioItem.className = `audio-item ${noise.playing ? 'active' : ''}`;
                
                audioItem.innerHTML = `
                    <div class="audio-info">
                        <div class="audio-icon"><i class="${noise.icon}"></i></div>
                        <div class="audio-name">${noise.name}</div>
                    </div>
                    <div class="audio-controls">
                        <button class="audio-btn play-white-noise" data-id="${noise.id}">
                            <i class="fas fa-${noise.playing ? 'pause' : 'play'}"></i>
                        </button>
                        <div class="audio-actions">
                             <button class="audio-action-btn delete delete-white-noise" data-id="${noise.id}" title="删除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                whiteNoiseList.appendChild(audioItem);
            });
            
            // 重新绑定事件
            document.querySelectorAll('.play-white-noise').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = parseInt(this.dataset.id);
                    toggleWhiteNoise(id);
                });
            });

            document.querySelectorAll('.delete-white-noise').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = parseInt(this.dataset.id);
                    deleteWhiteNoise(id);
                });
            });
            
            // 更新折叠状态
            updateSectionCollapse('whiteNoise');
        }
        
        // 渲染助眠音频列表
        function renderSleepAudios() {
            sleepAudioList.innerHTML = '';
            
            if (sleepAudios.length === 0) {
                sleepAudioList.innerHTML = '<div style="text-align: center; padding: 12px; color: #aaa; font-size: 0.8rem;">暂无助眠音频，点击+号添加</div>';
                return;
            }
            
            sleepAudios.forEach(audio => {
                const audioItem = document.createElement('div');
                audioItem.className = `audio-item ${audio.playing ? 'active' : ''}`;
                
                audioItem.innerHTML = `
                    <div class="audio-info">
                        <div class="audio-icon"><i class="${audio.icon}"></i></div>
                        <div class="audio-name">${audio.name}</div>
                        <div class="audio-duration">${audio.duration}</div>
                    </div>
                    <div class="audio-controls">
                        <button class="audio-btn play-sleep-audio" data-id="${audio.id}">
                            <i class="fas fa-${audio.playing ? 'pause' : 'play'}"></i>
                        </button>
                        <div class="audio-actions">
                             <button class="audio-action-btn delete delete-sleep-audio" data-id="${audio.id}" title="删除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                sleepAudioList.appendChild(audioItem);
            });
            
            // 重新绑定事件
            document.querySelectorAll('.play-sleep-audio').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = parseInt(this.dataset.id);
                    toggleSleepAudio(id);
                });
            });

            document.querySelectorAll('.delete-sleep-audio').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = parseInt(this.dataset.id);
                    deleteSleepAudio(id);
                });
            });
            
            // 更新折叠状态
            updateSectionCollapse('sleepAudio');
        }

        function renderDialogueFolders() {
            if (!dialogueFolderList) return;

            const prevFolderState = {};
            dialogueFolderList.querySelectorAll('.dialogue-folder').forEach(folder => {
                const folderId = folder.dataset.folderId;
                if (!folderId) return;
                prevFolderState[String(folderId)] = {
                    collapsed: folder.classList.contains('collapsed'),
                    editMode: folder.classList.contains('folder-edit-mode')
                };
            });

            dialogueFolderList.innerHTML = '';

            const grouped = {
                global: [],
                byCharacter: {}
            };

            (customDialogues || []).forEach(d => {
                if (d.scope === 'global') grouped.global.push(d);
                if (d.scope === 'character' && d.characterId != null) {
                    const cid = String(d.characterId);
                    if (!grouped.byCharacter[cid]) grouped.byCharacter[cid] = [];
                    grouped.byCharacter[cid].push(d);
                }
            });

            const folders = [];
            folders.push({
                id: 'global',
                title: '全局语音条',
                items: grouped.global
            });

            Object.keys(grouped.byCharacter).forEach(cid => {
                const c = characters.find(x => String(x.id) === cid);
                if (!c) return;
                folders.push({
                    id: cid,
                    title: `${c.name}（绑定）`,
                    items: grouped.byCharacter[cid]
                });
            });

            const hasAny = folders.some(f => f.items.length > 0);
            if (!hasAny) {
                const empty = document.createElement('div');
                empty.style.cssText = 'text-align:center;padding:12px;color:#aaa;font-size:0.8rem;';
                empty.textContent = '暂无语音条，点击+号添加';
                dialogueFolderList.appendChild(empty);
                updateSectionCollapse('dialogue');
                return;
            }

            folders.forEach(folderInfo => {
                if (folderInfo.items.length === 0) return;
                const folder = document.createElement('div');
                folder.className = 'dialogue-folder collapsed';
                folder.dataset.folderId = folderInfo.id;

                const prev = prevFolderState[String(folderInfo.id)];
                if (prev && !prev.collapsed) folder.classList.remove('collapsed');
                if (prev && prev.editMode) folder.classList.add('folder-edit-mode');

                const header = document.createElement('div');
                header.className = 'dialogue-folder-header';
                header.innerHTML = `
                    <div class="dialogue-folder-title">
                        <i class="fas fa-folder"></i>
                        <span>${folderInfo.title}</span>
                    </div>
                    <div class="dialogue-folder-count">${folderInfo.items.length}条</div>
                `;

                const content = document.createElement('div');
                content.className = 'dialogue-folder-content';

                folderInfo.items.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'dialogue-row';
                    row.innerHTML = `
                        <div class="dialogue-text"></div>
                        <div class="dialogue-actions">
                            <button class="dialogue-action-btn edit" data-id="${item.id}" title="编辑">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="dialogue-action-btn delete" data-id="${item.id}" title="删除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    row.querySelector('.dialogue-text').textContent = item.text || '';
                    
                    // 为每一行添加双击事件，直接触发文件夹的编辑模式
                    row.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        if (e.target.closest('.dialogue-action-btn')) return;
                        folder.classList.toggle('folder-edit-mode');
                    });
                    
                    content.appendChild(row);
                });

                header.addEventListener('click', () => {
                    folder.classList.toggle('collapsed');
                });

                folder.appendChild(header);
                folder.appendChild(content);
                dialogueFolderList.appendChild(folder);
            });

            dialogueFolderList.querySelectorAll('.dialogue-action-btn.edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    editDialogue(id);
                });
            });

            dialogueFolderList.querySelectorAll('.dialogue-action-btn.delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    deleteDialogue(id);
                });
            });

            updateSectionCollapse('dialogue');
        }

        function addDialoguesFromText(text, scope, characterId) {
            const lines = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
            if (lines.length === 0) return;
            lines.forEach(line => {
                customDialogues.push({
                    id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                    text: line,
                    scope,
                    characterId: scope === 'character' ? characterId : null
                });
            });
            saveDialogues();
            renderDialogueFolders();
        }

        function editDialogue(dialogueId) {
            openEditDialogueModal(dialogueId);
        }

        function deleteDialogue(dialogueId) {
            customDialogues = (customDialogues || []).filter(d => String(d.id) !== String(dialogueId));
            saveDialogues();
            renderDialogueFolders();
            updateDialogue();
        }

        function getAvailableDialogueTexts() {
            const currentId = state.selectedCharacter;
            const filtered = (customDialogues || []).filter(d => {
                if (d.scope === 'global') return true;
                if (d.scope === 'character') return String(d.characterId) === String(currentId);
                return false;
            }).map(d => d.text).filter(Boolean);

            if (filtered.length > 0) return filtered;
            let inited = false;
            try {
                inited = localStorage.getItem(LS_KEYS.dialoguesInit) === '1';
            } catch (e) {}
            if (!inited) return defaultDialogues.slice();
            return [];
        }
        
        // 渲染角色图库
        function renderCharacterGallery(characterId) {
            characterGallery.innerHTML = '';
            
            const character = characters.find(c => c.id === characterId);
            if (!character) return;
            
            // 当前角色图片
            const currentItem = document.createElement('div');
            currentItem.className = 'gallery-item active';
            currentItem.dataset.img = character.img;

            const currentImg = document.createElement('img');
            currentImg.className = 'gallery-img';
            currentImg.alt = '当前角色';
            const currentFallback = generateTextAvatar((character.name || '').charAt(0) || '?', character.avatarColor || 'bg-sage');
            currentImg.src = currentFallback;
            applyImgSrc(currentImg, character.img, currentFallback);
            currentItem.appendChild(currentImg);
            
            currentItem.addEventListener('click', function() {
                document.querySelectorAll('.gallery-item').forEach(item => {
                    item.classList.remove('active');
                });
                this.classList.add('active');
                state.characterSettingsImage = character.img;
            });
            
            characterGallery.appendChild(currentItem);
            
            // 添加上传按钮
            const addItem = document.createElement('div');
            addItem.className = 'gallery-item gallery-add';
            
            addItem.innerHTML = `
                <i class="fas fa-plus"></i>
            `;
            
            addItem.addEventListener('click', () => {
                characterGalleryInput.click();
            });
            
            characterGallery.appendChild(addItem);
        }
        
        // 更新角色显示
        function updateCharacterDisplay() {
            const character = characters.find(c => c.id === state.selectedCharacter);
            if (character) {
                const fallback = generateTextAvatar((character.name || '').charAt(0) || '?', character.avatarColor || 'bg-sage');
                applyImgSrc(characterImage, character.img, fallback);
                characterName.textContent = character.name;
                
                // 更新渐变效果
                if (character.gradient) {
                    characterGradient.classList.add('active');
                } else {
                    characterGradient.classList.remove('active');
                }
            }
        }
        
        // 切换白噪音
        async function toggleWhiteNoise(id) {
            const noise = whiteNoises.find(n => n.id === id);
            if (!noise) return;
            
            if (noise.playing) {
                // 停止白噪音
                if (audioElements.whiteNoises[id]) {
                    cleanupAudioObjectUrl(audioElements.whiteNoises[id]);
                    audioElements.whiteNoises[id].pause();
                    delete audioElements.whiteNoises[id];
                }
                noise.playing = false;
            } else {
                // 播放白噪音
                const playable = await getPlayableSrc(noise.audio);
                if (!playable.src) {
                    showNotification('音频资源不可用');
                    return;
                }
                const audio = new Audio(playable.src);
                audio._objectUrl = playable.objectUrl;
                audio.loop = true;
                audio.volume = 0.5;
                
                audio.addEventListener('error', function(e) {
                    console.error(`白噪音加载错误 [${noise.audio}]:`, e);
                    if (!audio.dataset.legacyFallbackTried && audio.src === LEGACY_SAMPLE_MP3_URL) {
                        audio.dataset.legacyFallbackTried = '1';
                        noise.audio = DEFAULT_SAMPLE_MP3_URL;
                        saveAudioLists();
                        audio.src = DEFAULT_SAMPLE_MP3_URL;
                        audio.load();
                        audio.play().catch(() => {});
                        return;
                    }
                    const error = audio.error;
                    let message = "加载失败";
                    if (error && error.code === 4) message = "资源不可用";
                    showNotification(`${noise.name} ${message}`);
                    
                    noise.playing = false;
                    cleanupAudioObjectUrl(audio);
                    delete audioElements.whiteNoises[id];
                    renderWhiteNoises();
                });

                audio.play().catch(e => {
                    console.log("播放被阻止:", e);
                    if (e.name === 'NotSupportedError') {
                        showNotification(`浏览器不支持此音频格式: ${noise.name}`);
                    }
                });
                
                audioElements.whiteNoises[id] = audio;
                noise.playing = true;
            }
            
            renderWhiteNoises();
        }
        
        // 切换助眠音频
        async function toggleSleepAudio(id) {
            const audioItem = sleepAudios.find(a => a.id === id);
            if (!audioItem) return;
            
            // 如果点击的是正在播放的音频
            if (audioItem.playing) {
                // 暂停当前音频
                if (audioElements.sleepAudio) {
                    cleanupAudioObjectUrl(audioElements.sleepAudio);
                    audioElements.sleepAudio.pause();
                    audioElements.sleepAudio = null;
                }
                audioItem.playing = false;
                
                // 更新其他音频状态
                sleepAudios.forEach(a => {
                    if (a.id !== id) a.playing = false;
                });
            } else {
                // 停止当前播放的音频
                if (audioElements.sleepAudio) {
                    cleanupAudioObjectUrl(audioElements.sleepAudio);
                    audioElements.sleepAudio.pause();
                    audioElements.sleepAudio = null;
                }
                
                // 更新所有音频状态
                sleepAudios.forEach(a => {
                    a.playing = a.id === id;
                });
                
                // 播放新音频
                const playable = await getPlayableSrc(audioItem.audio);
                if (!playable.src) {
                    showNotification('音频资源不可用');
                    audioItem.playing = false;
                    renderSleepAudios();
                    return;
                }
                const audio = new Audio(playable.src);
                audio._objectUrl = playable.objectUrl;
                audio.volume = 0.7;
                
                audio.addEventListener('error', function(e) {
                    console.error(`助眠音频加载错误 [${audioItem.audio}]:`, e);
                    if (!audio.dataset.legacyFallbackTried && audio.src === LEGACY_SAMPLE_MP3_URL) {
                        audio.dataset.legacyFallbackTried = '1';
                        audioItem.audio = DEFAULT_SAMPLE_MP3_URL;
                        saveAudioLists();
                        audio.src = DEFAULT_SAMPLE_MP3_URL;
                        audio.load();
                        audio.play().catch(() => {});
                        return;
                    }
                    const error = audio.error;
                    let message = "加载失败";
                    if (error && error.code === 4) message = "资源不可用";
                    showNotification(`${audioItem.name} ${message}`);
                    
                    audioItem.playing = false;
                    cleanupAudioObjectUrl(audio);
                    audioElements.sleepAudio = null;
                    renderSleepAudios();
                });

                audio.play().catch(e => {
                    console.log("播放被阻止:", e);
                    if (e.name === 'NotSupportedError') {
                        showNotification(`浏览器不支持此音频格式: ${audioItem.name}`);
                    }
                });
                
                audioElements.sleepAudio = audio;
                
                // 当音频结束时更新状态
                audio.addEventListener('ended', () => {
                    audioItem.playing = false;
                    cleanupAudioObjectUrl(audio);
                    audioElements.sleepAudio = null;
                    renderSleepAudios();
                });
            }
            
            renderSleepAudios();
        }

        function deleteWhiteNoise(id) {
            const idx = (whiteNoises || []).findIndex(n => n && n.id === id);
            if (idx === -1) return;
            const noise = whiteNoises[idx];

            if (noise && noise.playing && audioElements.whiteNoises && audioElements.whiteNoises[id]) {
                try {
                    cleanupAudioObjectUrl(audioElements.whiteNoises[id]);
                    audioElements.whiteNoises[id].pause();
                } catch (e) {}
                delete audioElements.whiteNoises[id];
            }

            whiteNoises.splice(idx, 1);
            saveAudioLists();
            renderWhiteNoises();
        }

        function deleteSleepAudio(id) {
            const idx = (sleepAudios || []).findIndex(a => a && a.id === id);
            if (idx === -1) return;
            const audioItem = sleepAudios[idx];

            if (audioItem && audioItem.playing && audioElements.sleepAudio) {
                try {
                    cleanupAudioObjectUrl(audioElements.sleepAudio);
                    audioElements.sleepAudio.pause();
                } catch (e) {}
                audioElements.sleepAudio = null;
            }

            sleepAudios.splice(idx, 1);
            saveAudioLists();
            renderSleepAudios();
        }
        
        // 开始计时器
        function startTimer() {
            if (timerIntervalId != null) return;
            timerIntervalId = setInterval(() => {
                state.timer.seconds++;
                
                if (state.timer.seconds >= 60) {
                    state.timer.seconds = 0;
                    state.timer.minutes++;
                }
                
                if (state.timer.minutes >= 60) {
                    state.timer.minutes = 0;
                    state.timer.hours++;
                }
                
                // 格式化时间
                const hours = state.timer.hours.toString().padStart(2, '0');
                const minutes = state.timer.minutes.toString().padStart(2, '0');
                const seconds = state.timer.seconds.toString().padStart(2, '0');
                
                timerText.textContent = `${hours}:${minutes}:${seconds}`;
            }, 1000);
        }
        
        // 停止计时器
        function stopTimer() {
            if (timerIntervalId != null) {
                clearInterval(timerIntervalId);
                timerIntervalId = null;
            }
            state.timer.hours = 0;
            state.timer.minutes = 0;
            state.timer.seconds = 0;
            if (timerText) {
                timerText.textContent = '00:00:00';
            }
        }
        
        // 开始话语循环
        function startDialogueCycle() {
            // 每8秒切换一条话语
            if (dialogueIntervalId != null) return;
            dialogueIntervalId = setInterval(() => {
                updateDialogue();
            }, 8000);
        }
        
        // 停止话语循环
        function stopDialogueCycle() {
            if (dialogueIntervalId != null) {
                clearInterval(dialogueIntervalId);
                dialogueIntervalId = null;
            }
            if (dialogueAnimationTimeoutId != null) {
                clearTimeout(dialogueAnimationTimeoutId);
                dialogueAnimationTimeoutId = null;
            }
            if (dialogueItem) {
                dialogueItem.classList.remove('entering', 'leaving');
            }
        }
        
        // 停止所有音频播放
        function stopAllAudio() {
            Object.keys(audioElements.whiteNoises || {}).forEach(id => {
                const audio = audioElements.whiteNoises[id];
                if (audio) {
                    cleanupAudioObjectUrl(audio);
                    audio.pause();
                    delete audioElements.whiteNoises[id];
                }
            });
            
            whiteNoises.forEach(n => { n.playing = false; });
            
            if (audioElements.sleepAudio) {
                cleanupAudioObjectUrl(audioElements.sleepAudio);
                audioElements.sleepAudio.pause();
                audioElements.sleepAudio = null;
            }
            
            sleepAudios.forEach(a => { a.playing = false; });
        }
        
        // 退出应用时停止所有活动
        let _isStoppingActivities = false;
        function stopAllActivities() {
            if (_isStoppingActivities) return;
            _isStoppingActivities = true;
            try {
                stopTimer();
                stopDialogueCycle();
                stopAllAudio();
            } finally {
                _isStoppingActivities = false;
            }
        }
        
        // 更新话语条 - 新的动画逻辑
        function updateDialogue() {
            if (!dialogueItem) return;
            const available = getAvailableDialogueTexts();
            if (!Array.isArray(available) || available.length === 0) {
                dialogueItem.classList.remove('entering', 'leaving');
                dialogueItem.textContent = '';
                return;
            }
            const randomIndex = Math.floor(Math.random() * available.length);
            const nextText = available[randomIndex] || '';

            // 添加离开动画类
            dialogueItem.classList.remove('entering');
            dialogueItem.classList.add('leaving');
            
            // 清理之前的动画 timeout
            if (dialogueAnimationTimeoutId != null) {
                clearTimeout(dialogueAnimationTimeoutId);
                dialogueAnimationTimeoutId = null;
            }
            
            // 等待离开动画完成后更新文本并开始进入动画
            dialogueAnimationTimeoutId = setTimeout(() => {
                dialogueAnimationTimeoutId = null;
                dialogueItem.textContent = nextText;
                
                // 移除离开动画类，添加进入动画类
                dialogueItem.classList.remove('leaving');
                dialogueItem.classList.add('entering');
            }, 600); // 等待离开动画完成
        }
        
        // 更新折叠状态
        function updateSectionCollapse(section) {
            const isCollapsed = state.collapsedSections[section];
            let sectionElement, headerElement;
            
            switch(section) {
                case 'character':
                    sectionElement = characterList;
                    headerElement = characterHeader.querySelector('.section-title');
                    break;
                case 'dialogue':
                    sectionElement = dialogueFolderList;
                    headerElement = dialogueHeader.querySelector('.section-title');
                    break;
                case 'whiteNoise':
                    sectionElement = whiteNoiseList;
                    headerElement = whiteNoiseHeader.querySelector('.section-title');
                    break;
                case 'sleepAudio':
                    sectionElement = sleepAudioList;
                    headerElement = sleepAudioHeader.querySelector('.section-title');
                    break;
            }
            
            if (isCollapsed) {
                sectionElement.classList.add('collapsed');
                headerElement.classList.add('collapsed');
            } else {
                sectionElement.classList.remove('collapsed');
                headerElement.classList.remove('collapsed');
            }
        }
        
        // 切换折叠状态
        function toggleSectionCollapse(section) {
            state.collapsedSections[section] = !state.collapsedSections[section];
            updateSectionCollapse(section);
            saveData();
        }
        
        // 打开角色设置浮窗
        function openCharacterSettings(characterId) {
            const character = characters.find(c => c.id === characterId);
            if (!character) return;
            
            // 设置浮窗标题
            characterModalTitle.textContent = `设置 - ${character.name}`;
            
            // 渲染角色图库
            renderCharacterGallery(characterId);
            
            // 设置渐变开关状态
            gradientToggle.checked = character.gradient;
            
            // 设置当前选择的图片
            state.characterSettingsImage = character.img;
            
            // 显示浮窗
            characterModal.style.display = 'flex';
            playPage.classList.add('blurred');
        }
        
        // 打开编辑名字浮窗
        function openEditModal(characterId) {
            const character = characters.find(c => c.id === characterId);
            if (!character) return;

            state.editingCharacterId = characterId;
            state.pendingNewCharacter = null;
            // 初始化背景设置
            state.characterSettingsImage = character.img;
            
            editTitle.textContent = `编辑角色: ${character.name}`;
            editInput.value = character.name;
            editInput.focus();
            editInput.select();

            if (character.wechatId) {
                deleteCharacterBtn.style.display = 'none';
            } else {
                deleteCharacterBtn.style.display = 'inline-flex';
            }
            
            editModal.style.display = 'flex';
            playPage.classList.add('blurred');
        }
        
        // 保存编辑的角色名字
        function saveCharacterName() {
            if (!state.editingCharacterId || !editInput.value.trim()) return;
            
            const character = characters.find(c => c.id === state.editingCharacterId);
            if (character) {
                character.name = editInput.value.trim();
                
                // 保存背景设置
                if (state.characterSettingsImage) {
                    character.img = state.characterSettingsImage;
                    character.customBg = true;
                }
                
                // 如果当前编辑的是正在显示的角色，更新显示
                if (state.selectedCharacter === state.editingCharacterId) {
                    updateCharacterDisplay();
                }
                
                // 重新渲染角色列表
                renderCharacters();
                saveData();
                
                // 关闭编辑浮窗
                editModal.style.display = 'none';
                playPage.classList.remove('blurred');
                state.editingCharacterId = null;
                state.characterSettingsImage = null;
                
                // 显示成功提示
                showNotification(`角色信息已保存`);
            }
        }

        function confirmEditAction() {
            const name = editInput.value.trim();
            if (!name) {
                showNotification('角色名字不能为空');
                return;
            }
            if (state.pendingNewCharacter) {
                const newCharacter = {
                    id: state.pendingNewCharacter.id,
                    name,
                    img: state.pendingNewCharacter.img,
                    gradient: false
                };
                characters.push(newCharacter);
                state.pendingNewCharacter = null;
                state.selectedCharacter = newCharacter.id;
                updateCharacterDisplay();
                renderCharacters();
                saveData();
                editModal.style.display = 'none';
                playPage.classList.remove('blurred');
                state.editingCharacterId = null;
                showNotification(`新角色"${newCharacter.name}"已添加`);
                return;
            }
            saveCharacterName();
        }
        
        // 打开新增角色浮窗 - 已废弃，仅保留函数防止报错，逻辑置空
        function openAddCharacterModal() {
             showNotification('请在“传讯”应用中添加好友，会自动同步到此处');
        }
        
        // 显示上传浮窗
        function showUploadModal(type) {
            state.uploadType = type;
            state.fileToUpload = null;
            if (uploadUrlInput) uploadUrlInput.value = '';
            
            // 设置上传标题
            let title = '';
            let accept = '';
            
            switch(type) {
                case 'character':
                    title = '上传角色图片';
                    accept = 'image/*';
                    break;
                case 'whiteNoise':
                    title = '上传白噪音音频';
                    accept = 'audio/*';
                    break;
                case 'sleepAudio':
                    title = '上传助眠音频';
                    accept = 'audio/*';
                    break;
            }
            
            uploadTitle.textContent = title;
            uploadInput.accept = accept;
            
            // 重置上传区域文本
            uploadDropArea.querySelector('p').textContent = '点击或拖拽文件到此处';

            if (uploadUrlSection) {
                uploadUrlSection.style.display = (type === 'whiteNoise' || type === 'sleepAudio') ? 'block' : 'none';
            }
            
            // 显示浮窗
            uploadModal.style.display = 'flex';
            playPage.classList.add('blurred');
        }
        
        // 处理文件上传
        async function handleFileUpload(file) {
            if (!file || !state.uploadType) return;
            
            if (state.uploadType === 'character') {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const nextId = characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1;
                    const newCharacter = {
                        id: nextId,
                        name: file.name.replace(/\.[^/.]+$/, "").substring(0, 20),
                        img: e.target.result,
                        gradient: false
                    };
                    characters.push(newCharacter);
                    renderCharacters();
                    saveData();
                    uploadModal.style.display = 'none';
                    playPage.classList.remove('blurred');
                    showNotification(`文件"${file.name}"上传成功！`);
                };
                reader.readAsDataURL(file);
                return;
            }

            const audioId = Date.now();
            try {
                await saveBlobToDB(audioId, file);
            } catch (e) {
                console.error('保存音频到数据库失败:', e);
                showNotification('保存失败，可能是浏览器空间不足');
                return;
            }

            const title = file.name.replace(/\.[^/.]+$/, "").substring(0, 20);
            if (state.uploadType === 'whiteNoise') {
                const newWhiteNoise = {
                    id: audioId,
                    name: title,
                    icon: 'fas fa-volume-up',
                    audio: `indexeddb://${audioId}`,
                    playing: false
                };
                whiteNoises.push(newWhiteNoise);
                saveAudioLists();
                renderWhiteNoises();
            }

            if (state.uploadType === 'sleepAudio') {
                const newSleepAudio = {
                    id: audioId,
                    name: title,
                    icon: 'fas fa-music',
                    audio: `indexeddb://${audioId}`,
                    playing: false,
                    duration: '--:--'
                };
                sleepAudios.push(newSleepAudio);
                saveAudioLists();
                renderSleepAudios();
                updateSleepAudioDuration(newSleepAudio).catch(() => {});
            }

            uploadModal.style.display = 'none';
            playPage.classList.remove('blurred');
            showNotification(`文件"${file.name}"上传成功！`);
        }

        async function updateSleepAudioDuration(audioItem) {
            if (!audioItem) return;
            const playable = await getPlayableSrc(audioItem.audio);
            if (!playable.src) return;
            const temp = new Audio(playable.src);
            temp._objectUrl = playable.objectUrl;
            return new Promise((resolve) => {
                const finish = () => {
                    cleanupAudioObjectUrl(temp);
                    resolve();
                };
                temp.addEventListener('loadedmetadata', () => {
                    audioItem.duration = formatDuration(temp.duration);
                    saveAudioLists();
                    renderSleepAudios();
                    finish();
                }, { once: true });
                temp.addEventListener('error', () => {
                    finish();
                }, { once: true });
            });
        }

        function addAudioFromUrl(url) {
            const title = `在线音频_${Date.now()}`;
            const audioId = Date.now();
            if (state.uploadType === 'whiteNoise') {
                whiteNoises.push({
                    id: audioId,
                    name: title.substring(0, 20),
                    icon: 'fas fa-volume-up',
                    audio: url,
                    playing: false
                });
                saveAudioLists();
                renderWhiteNoises();
            }
            if (state.uploadType === 'sleepAudio') {
                const item = {
                    id: audioId,
                    name: title.substring(0, 20),
                    icon: 'fas fa-music',
                    audio: url,
                    playing: false,
                    duration: '--:--'
                };
                sleepAudios.push(item);
                saveAudioLists();
                renderSleepAudios();
                updateSleepAudioDuration(item).catch(() => {});
            }
        }

        function populateDialogueCharacterSelect() {
            if (!dialogueCharacterSelect) return;
            dialogueCharacterSelect.innerHTML = '';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = String(c.id);
                opt.textContent = c.name;
                dialogueCharacterSelect.appendChild(opt);
            });
        }

        function openDialogueModal() {
            populateDialogueCharacterSelect();
            globalDialogueInput.value = '';
            characterDialogueInput.value = '';
            dialogueModal.style.display = 'flex';
            playPage.classList.add('blurred');

            const tabs = dialogueModal.querySelectorAll('.dialogue-tab');
            const contents = dialogueModal.querySelectorAll('.dialogue-tab-content');
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            let defaultTab = 'global';
            const currentCharacter = characters.find(c => String(c.id) === String(state.selectedCharacter));
            if (currentCharacter) {
                defaultTab = 'character';
                if (dialogueCharacterSelect) {
                    dialogueCharacterSelect.value = String(currentCharacter.id);
                }
            }

            const defaultTabEl = dialogueModal.querySelector(`.dialogue-tab[data-tab="${defaultTab}"]`);
            const defaultContentEl = defaultTab === 'global'
                ? dialogueModal.querySelector('#dialogueGlobalTab')
                : dialogueModal.querySelector('#dialogueCharacterTab');
            if (defaultTabEl) defaultTabEl.classList.add('active');
            if (defaultContentEl) defaultContentEl.classList.add('active');
        }

        function closeDialogueModal() {
            dialogueModal.style.display = 'none';
            syncBlur();
        }

        function syncBlur() {
            const isVisible = (el) => el && el.style.display === 'flex';
            const anyOpen = [
                settingsPage,
                uploadModal,
                characterModal,
                editModal,
                addCharacterModal,
                dialogueModal,
                confirmModal,
                editDialogueModal,
                characterSelectModal
            ].some(isVisible);
            if (anyOpen) {
                playPage.classList.add('blurred');
            } else {
                playPage.classList.remove('blurred');
            }
        }

        async function openCharacterSelectModal() {
            if (!characterSelectModal || !characterSelectList) return;
            if (hasEntered) return;

            await syncFromWechat();
            if (!Array.isArray(characters) || characters.length === 0) {
                enterAfterCharacterSelected();
                return;
            }

            const current = characters.find(c => String(c.id) === String(state.selectedCharacter));
            pendingSelectedCharacterId = current ? current.id : characters[0].id;

            characterSelectList.innerHTML = '';
            characters.forEach(ch => {
                if (!ch || typeof ch !== 'object') return;
                const item = document.createElement('div');
                item.className = 'character-select-item';
                item.dataset.id = ch.id;
                if (String(ch.id) === String(pendingSelectedCharacterId)) item.classList.add('selected');

                const avatar = document.createElement('div');
                avatar.className = 'character-select-avatar';
                const img = document.createElement('img');
                const fallback = generateTextAvatar(((ch.name || '').charAt(0) || '?'), ch.avatarColor || 'bg-sage');
                img.src = fallback;
                applyImgSrc(img, ch.img, fallback);
                img.alt = ch.name || '';
                avatar.appendChild(img);

                const name = document.createElement('div');
                name.className = 'character-select-name';
                name.textContent = ch.name || '未命名';

                item.appendChild(avatar);
                item.appendChild(name);

                item.addEventListener('click', () => {
                    pendingSelectedCharacterId = ch.id;
                    characterSelectList.querySelectorAll('.character-select-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                });

                characterSelectList.appendChild(item);
            });

            characterSelectModal.style.display = 'flex';
            syncBlur();
        }

        function closeCharacterSelectModal() {
            if (!characterSelectModal) return;
            characterSelectModal.style.display = 'none';
            syncBlur();
        }

        function enterAfterCharacterSelected() {
            if (hasEntered) return;
            hasEntered = true;

            if (Array.isArray(characters) && characters.length > 0 && pendingSelectedCharacterId != null) {
                const match = characters.find(c => String(c.id) === String(pendingSelectedCharacterId));
                if (match) state.selectedCharacter = match.id;
            }

            saveData();
            closeCharacterSelectModal();
            updateCharacterDisplay();
            updateDialogue();
            startTimer();
            startDialogueCycle();

            try {
                window.parent.postMessage({ type: 'app_ready', appId: 'zhumian' }, '*');
            } catch (e) {
                console.error('Failed to send app_ready message:', e);
            }
        }

        function openConfirmModal(message, onConfirm, title = '确认') {
            pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
            if (confirmTitle) confirmTitle.textContent = title;
            if (confirmText) confirmText.textContent = message || '';
            confirmModal.style.display = 'flex';
            playPage.classList.add('blurred');
        }

        function closeConfirmModal() {
            confirmModal.style.display = 'none';
            pendingConfirmAction = null;
            syncBlur();
        }

        function openEditDialogueModal(dialogueId) {
            const d = (customDialogues || []).find(x => String(x.id) === String(dialogueId));
            if (!d) return;
            editingDialogueId = d.id;
            if (editDialogueTitle) editDialogueTitle.textContent = '编辑语音条';
            editDialogueInput.value = d.text || '';
            editDialogueModal.style.display = 'flex';
            playPage.classList.add('blurred');
            editDialogueInput.focus();
        }

        function closeEditDialogueModal() {
            editDialogueModal.style.display = 'none';
            editingDialogueId = null;
            syncBlur();
        }

        function saveEditedDialogue() {
            if (!editingDialogueId) return;
            const idx = (customDialogues || []).findIndex(d => String(d.id) === String(editingDialogueId));
            if (idx === -1) return;
            const t = (editDialogueInput.value || '').trim();
            if (!t) {
                showNotification('语音条内容不能为空');
                return;
            }
            customDialogues[idx].text = t;
            saveDialogues();
            renderDialogueFolders();
            closeEditDialogueModal();
            updateDialogue();
        }

        function requestDeleteDialogue(dialogueId) {
            customDialogues = (customDialogues || []).filter(d => String(d.id) !== String(dialogueId));
            saveDialogues();
            renderDialogueFolders();
            updateDialogue();
        }

        function requestDeleteCharacter(characterId) {
            const character = characters.find(c => String(c.id) === String(characterId));
            if (!character) return;
            if (character.wechatId) return;
            removeCharacterAndRelatedData(characterId);
        }

        function removeCharacterAndRelatedData(characterId) {
            const character = characters.find(c => String(c.id) === String(characterId));
            if (!character) return;
            if (character.wechatId) return;

            if (audioElements.sleepAudio) {
                cleanupAudioObjectUrl(audioElements.sleepAudio);
                audioElements.sleepAudio.pause();
                audioElements.sleepAudio = null;
            }
            Object.keys(audioElements.whiteNoises || {}).forEach(k => {
                const a = audioElements.whiteNoises[k];
                cleanupAudioObjectUrl(a);
                a.pause();
                delete audioElements.whiteNoises[k];
            });
            whiteNoises.forEach(n => { n.playing = false; });
            sleepAudios.forEach(a => { a.playing = false; });

            characters = characters.filter(c => String(c.id) !== String(characterId));
            customDialogues = (customDialogues || []).filter(d => !(d.scope === 'character' && String(d.characterId) === String(characterId)));
            saveDialogues();

            if (String(state.selectedCharacter) === String(characterId)) {
                state.selectedCharacter = characters.length > 0 ? characters[0].id : null;
            }
            saveData();
            renderCharacters();
            renderDialogueFolders();
            updateCharacterDisplay();

            editModal.style.display = 'none';
            if (String(state.editingCharacterId) === String(characterId)) state.editingCharacterId = null;
            state.pendingNewCharacter = null;
            syncBlur();
            showNotification(`角色"${character.name}"已删除`);
        }
        
        // 处理角色图片上传（用于新增角色流程）
        function handleNewCharacterImageUpload(file) {
            if (!file) return;
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                state.newCharacterImage = e.target.result;
                addCharacterUploadArea.querySelector('p').textContent = `已选择: ${file.name}`;
            };
            
            reader.readAsDataURL(file);
        }
        
        // 处理新增角色
        function handleAddCharacter() {
            if (!state.newCharacterImage) {
                showNotification('请先上传角色图片');
                return;
            }
            
            // 关闭新增角色浮窗，打开编辑名字浮窗
            addCharacterModal.style.display = 'none';
            
            // 创建一个临时角色用于编辑名字
            const tempCharacterId = characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1;
            state.editingCharacterId = tempCharacterId;
            state.pendingNewCharacter = { id: tempCharacterId, img: state.newCharacterImage };
            
            // 设置编辑浮窗
            editTitle.textContent = '为新角色命名';
            editInput.value = '新角色';
            editInput.focus();
            editInput.select();
            deleteCharacterBtn.style.display = 'none';
            
            // 显示编辑浮窗
            editModal.style.display = 'flex';
        }
        
        // 处理角色图片上传（用于角色图库）
        function handleCharacterImageUpload(file) {
            if (!file) return;
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // 创建新的图片项
                const newItem = document.createElement('div');
                newItem.className = 'gallery-item active';
                newItem.dataset.img = e.target.result;
                
                newItem.innerHTML = `
                    <img src="${e.target.result}" alt="新角色" class="gallery-img">
                `;
                
                newItem.addEventListener('click', function() {
                    document.querySelectorAll('.gallery-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    this.classList.add('active');
                    state.characterSettingsImage = e.target.result;
                });
                
                // 添加到图库中，放在上传按钮前面
                characterGallery.insertBefore(newItem, characterGalleryUpload);
                
                // 自动选择新上传的图片
                document.querySelectorAll('.gallery-item').forEach(item => {
                    item.classList.remove('active');
                });
                newItem.classList.add('active');
                state.characterSettingsImage = e.target.result;
                
                // 显示成功提示
                showNotification(`图片"${file.name}"上传成功！`);
            };
            
            reader.readAsDataURL(file);
        }
        
        // 应用角色图库设置
        function applyCharacterGallery() {
            const character = characters.find(c => c.id === state.selectedCharacter);
            if (!character || !state.characterSettingsImage) return;
            
            // 更新角色图片
            character.img = state.characterSettingsImage;
            
            // 更新显示
            updateCharacterDisplay();
            saveData();
            
            // 关闭浮窗
            characterModal.style.display = 'none';
            playPage.classList.remove('blurred');
            
            // 显示成功提示
            showNotification(`角色图片已更新`);
        }
        
        // 应用图片设置
        function applyImageSettings() {
            const character = characters.find(c => c.id === state.selectedCharacter);
            if (!character) return;
            
            // 更新渐变设置
            character.gradient = gradientToggle.checked;
            
            // 更新显示
            updateCharacterDisplay();
            saveData();
            
            // 关闭浮窗
            characterModal.style.display = 'none';
            playPage.classList.remove('blurred');
            
            // 显示成功提示
            showNotification(`图片设置已更新`);
        }
        
        // 显示通知
        function showNotification(message) {
            // 创建通知元素
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: calc(var(--safe-inset-top, 0px) + 12px);
                right: 20px;
                background: rgba(248, 182, 208, 0.9);
                color: #5d576b;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 100;
                font-weight: 500;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease;
                font-size: 0.9rem;
                max-width: min(320px, calc(100vw - 40px));
                word-break: break-word;
                opacity: 0;
            `;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.opacity = '1';
            }, 10);
            
            // 3秒后移除
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);
            
            // 添加动画样式
            if (!document.querySelector('#notification-animations')) {
                const style = document.createElement('style');
                style.id = 'notification-animations';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // 设置事件监听器
        function setupEventListeners() {
            // 监听点击事件并通知父页面，用于自动缩小全局播放器
            document.addEventListener('click', (e) => {
                window.parent.postMessage({ type: 'iframe_click' }, _getPostTargetOrigin());
                
                // 处理点击外部区域退出编辑模式
                if (whiteNoiseList.classList.contains('global-edit-mode')) {
                    if (!e.target.closest('#whiteNoiseList')) {
                        whiteNoiseList.classList.remove('global-edit-mode');
                    }
                }
                
                if (sleepAudioList.classList.contains('global-edit-mode')) {
                    if (!e.target.closest('#sleepAudioList')) {
                        sleepAudioList.classList.remove('global-edit-mode');
                    }
                }
                
                // 处理所有语音条文件夹
                const activeFolder = e.target.closest('.dialogue-folder');
                document.querySelectorAll('.dialogue-folder.global-edit-mode, .dialogue-folder.folder-edit-mode').forEach(folder => {
                    if (folder !== activeFolder) {
                        folder.classList.remove('global-edit-mode');
                        folder.classList.remove('folder-edit-mode');
                    }
                });
            }, true);

            // 监听 localStorage 变化以同步数据
            window.addEventListener('storage', (e) => {
                if (e.key === 'wechatAppData' || e.key === 'wechatAppData_rev' || (e.key && e.key.startsWith('avatar_'))) {
                    syncFromWechat().then(() => {
                        updateCharacterDisplay();
                        renderCharacters();
                        renderDialogueFolders();
                        updateDialogue();

                        if (characterSelectModal && characterSelectModal.style.display === 'flex' && !hasEntered) {
                            openCharacterSelectModal();
                        }
                    }).catch(console.error);
                }
            });

            // 设置按钮
            settingsBtn.addEventListener('click', () => {
                settingsPage.style.display = 'flex';
                playPage.classList.add('blurred');

                state.collapsedSections.character = true;
                state.collapsedSections.dialogue = true;
                state.collapsedSections.whiteNoise = true;
                state.collapsedSections.sleepAudio = true;
                updateSectionCollapse('character');
                updateSectionCollapse('dialogue');
                updateSectionCollapse('whiteNoise');
                updateSectionCollapse('sleepAudio');

                try {
                    if (!sessionStorage.getItem('sleepAssistantEditHintShown')) {
                        showNotification('提示：长按列表/语音条可进入编辑模式');
                        sessionStorage.setItem('sleepAssistantEditHintShown', '1');
                    }
                } catch (e) {}

                document.querySelectorAll('.dialogue-folder').forEach(folder => {
                    folder.classList.add('collapsed');
                    folder.classList.remove('folder-edit-mode');
                    folder.classList.remove('global-edit-mode');
                });

                if (whiteNoiseList) whiteNoiseList.classList.remove('global-edit-mode');
                if (sleepAudioList) sleepAudioList.classList.remove('global-edit-mode');
            });

            if (homeBtn) {
                homeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopAllActivities();
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'closeApp', appId: 'zhumian' }, _getPostTargetOrigin());
                            return;
                        }
                    } catch (err) {}
                    window.location.href = 'index.html';
                });
            }

            if (whiteNoiseList) {
                whiteNoiseList.addEventListener('dblclick', (e) => {
                    if (e.target.closest('.audio-btn') || e.target.closest('.audio-action-btn')) return;
                    e.stopPropagation();
                    whiteNoiseList.classList.toggle('global-edit-mode');
                });
            }

            if (sleepAudioList) {
                sleepAudioList.addEventListener('dblclick', (e) => {
                    if (e.target.closest('.audio-btn') || e.target.closest('.audio-action-btn')) return;
                    e.stopPropagation();
                    sleepAudioList.classList.toggle('global-edit-mode');
                });
            }

            if (dialogueFolderList) {
                dialogueFolderList.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                });
            }

            (function () {
                let lastTriggeredAt = 0;

                function setupLongPress(container, shouldStart, onTrigger) {
                    if (!container) return;
                    const delayMs = 450;
                    let timer = null;
                    let startX = 0;
                    let startY = 0;

                    const clear = () => {
                        if (timer != null) {
                            clearTimeout(timer);
                            timer = null;
                        }
                    };

                    container.addEventListener('touchstart', (e) => {
                        try {
                            if (!shouldStart(e)) return;
                            const t = e.touches && e.touches[0];
                            if (!t) return;
                            startX = t.clientX;
                            startY = t.clientY;
                            clear();
                            timer = setTimeout(() => {
                                timer = null;
                                lastTriggeredAt = Date.now();
                                onTrigger(e);
                            }, delayMs);
                        } catch (err) {}
                    }, { passive: true });

                    container.addEventListener('touchmove', (e) => {
                        if (timer == null) return;
                        const t = e.touches && e.touches[0];
                        if (!t) return;
                        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clear();
                    }, { passive: true });

                    container.addEventListener('touchend', clear, { passive: true });
                    container.addEventListener('touchcancel', clear, { passive: true });

                    container.addEventListener('contextmenu', (e) => {
                        const now = Date.now();
                        if (now - lastTriggeredAt < 600) return;
                        if (!shouldStart(e)) return;
                        e.preventDefault();
                        lastTriggeredAt = now;
                        onTrigger(e);
                    });
                }

                setupLongPress(whiteNoiseList, (e) => {
                    if (e.target.closest('.audio-btn') || e.target.closest('.audio-action-btn')) return false;
                    return !!e.target.closest('.audio-item');
                }, () => {
                    whiteNoiseList.classList.toggle('global-edit-mode');
                });

                setupLongPress(sleepAudioList, (e) => {
                    if (e.target.closest('.audio-btn') || e.target.closest('.audio-action-btn')) return false;
                    return !!e.target.closest('.audio-item');
                }, () => {
                    sleepAudioList.classList.toggle('global-edit-mode');
                });

                setupLongPress(dialogueFolderList, (e) => {
                    if (e.target.closest('.dialogue-action-btn')) return false;
                    return !!e.target.closest('.dialogue-row');
                }, (e) => {
                    const folder = e.target.closest('.dialogue-folder');
                    if (!folder) return;
                    folder.classList.toggle('folder-edit-mode');
                });
            })();
            
            // 关闭设置
            closeSettings.addEventListener('click', () => {
                settingsPage.style.display = 'none';
                syncBlur();
            });

            if (cancelCharacterSelect) {
                cancelCharacterSelect.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopAllActivities();
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'closeApp', appId: 'zhumian' }, _getPostTargetOrigin());
                            return;
                        }
                    } catch (err) {}
                    window.location.href = 'index.html';
                });
            }

            if (confirmCharacterSelect) {
                confirmCharacterSelect.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!Array.isArray(characters) || characters.length === 0) {
                        enterAfterCharacterSelected();
                        return;
                    }
                    if (pendingSelectedCharacterId == null) {
                        showNotification('请先选择角色');
                        return;
                    }
                    enterAfterCharacterSelected();
                });
            }
            
            // 折叠/展开事件
            characterHeader.addEventListener('click', () => {
                toggleSectionCollapse('character');
            });

            dialogueHeader.addEventListener('click', () => {
                toggleSectionCollapse('dialogue');
            });
            
            whiteNoiseHeader.addEventListener('click', () => {
                toggleSectionCollapse('whiteNoise');
            });
            
            sleepAudioHeader.addEventListener('click', () => {
                toggleSectionCollapse('sleepAudio');
            });
            
            // 新增角色按钮 - 已移除，添加空判断
            if (addCharacterBtn) {
                addCharacterBtn.addEventListener('click', openAddCharacterModal);
            }

            addDialogueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDialogueModal();
            });
            
            // 上传按钮（白噪音和助眠音频）
            document.querySelectorAll('.add-btn[data-upload-type]').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // 防止触发折叠事件
                    const type = this.dataset.uploadType;
                    showUploadModal(type);
                });
            });
            
            // 关闭上传浮窗
            closeUpload.addEventListener('click', () => {
                uploadModal.style.display = 'none';
                syncBlur();
            });
            
            cancelUpload.addEventListener('click', () => {
                uploadModal.style.display = 'none';
                syncBlur();
            });
            
            // 确认上传
            confirmUpload.addEventListener('click', async () => {
                if (state.fileToUpload) {
                    await handleFileUpload(state.fileToUpload);
                    return;
                }
                const url = (uploadUrlInput ? uploadUrlInput.value.trim() : '');
                if (url && (state.uploadType === 'whiteNoise' || state.uploadType === 'sleepAudio')) {
                    try {
                        new URL(url);
                    } catch (e) {
                        showNotification('URL格式不正确');
                        return;
                    }
                    addAudioFromUrl(url);
                    uploadModal.style.display = 'none';
                    syncBlur();
                    showNotification('已添加URL音频');
                    return;
                }
                showNotification('请先选择文件或输入URL');
            });
            
            // 文件上传区域
            uploadDropArea.addEventListener('click', () => {
                uploadInput.click();
            });
            
            uploadDropArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadDropArea.style.borderColor = '#f8b6d0';
                uploadDropArea.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });
            
            uploadDropArea.addEventListener('dragleave', () => {
                uploadDropArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                uploadDropArea.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            });
            
            uploadDropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadDropArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                uploadDropArea.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                
                const file = e.dataTransfer.files[0];
                if (file) {
                    state.fileToUpload = file;
                    if (uploadUrlInput) uploadUrlInput.value = '';
                    uploadDropArea.querySelector('p').textContent = `已选择: ${file.name}`;
                }
            });
            
            uploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    state.fileToUpload = file;
                    if (uploadUrlInput) uploadUrlInput.value = '';
                    uploadDropArea.querySelector('p').textContent = `已选择: ${file.name}`;
                }
            });
            
            // 新增角色浮窗
            closeAddCharacter.addEventListener('click', () => {
                addCharacterModal.style.display = 'none';
                state.newCharacterImage = null;
                state.pendingNewCharacter = null;
                syncBlur();
            });
            
            cancelAddCharacter.addEventListener('click', () => {
                addCharacterModal.style.display = 'none';
                state.newCharacterImage = null;
                state.pendingNewCharacter = null;
                syncBlur();
            });
            
            confirmAddCharacter.addEventListener('click', handleAddCharacter);
            
            // 新增角色图片上传
            addCharacterUploadArea.addEventListener('click', () => {
                addCharacterInput.click();
            });
            
            addCharacterInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleNewCharacterImageUpload(file);
                }
            });
            
            // 角色设置浮窗
            closeCharacter.addEventListener('click', () => {
                characterModal.style.display = 'none';
                syncBlur();
            });
            
            cancelGallery.addEventListener('click', () => {
                characterModal.style.display = 'none';
                syncBlur();
            });
            
            cancelSettings.addEventListener('click', () => {
                characterModal.style.display = 'none';
                syncBlur();
            });
            
            applyGallery.addEventListener('click', applyCharacterGallery);
            
            applySettings.addEventListener('click', applyImageSettings);
            
            // 角色图库上传
            characterGalleryUpload.addEventListener('click', () => {
                characterGalleryInput.click();
            });
            
            characterGalleryInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    handleCharacterImageUpload(file);
                }
            });
            
            // 角色设置标签切换
            document.querySelectorAll('.character-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabId = this.dataset.tab;
                    
                    // 更新标签状态
                    document.querySelectorAll('.character-tab').forEach(t => {
                        t.classList.remove('active');
                    });
                    this.classList.add('active');
                    
                    // 更新内容显示
                    document.querySelectorAll('.character-tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    document.getElementById(`${tabId}Tab`).classList.add('active');
                });
            });
            
            // 编辑名字浮窗
            closeEdit.addEventListener('click', () => {
                editModal.style.display = 'none';
                state.editingCharacterId = null;
                state.pendingNewCharacter = null;
                deleteCharacterBtn.style.display = 'none';
                syncBlur();
            });
            
            cancelEdit.addEventListener('click', () => {
                editModal.style.display = 'none';
                state.editingCharacterId = null;
                state.pendingNewCharacter = null;
                deleteCharacterBtn.style.display = 'none';
                syncBlur();
            });
            
            confirmEdit.addEventListener('click', confirmEditAction);

            deleteCharacterBtn.addEventListener('click', () => {
                if (!state.editingCharacterId) return;
                requestDeleteCharacter(state.editingCharacterId);
            });
            
            // 按回车键保存名字
            editInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmEditAction();
                }
            });

            closeDialogue.addEventListener('click', closeDialogueModal);
            cancelDialogue.addEventListener('click', closeDialogueModal);

            dialogueModal.querySelectorAll('.dialogue-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const t = tab.dataset.tab;
                    dialogueModal.querySelectorAll('.dialogue-tab').forEach(x => x.classList.remove('active'));
                    tab.classList.add('active');
                    dialogueModal.querySelectorAll('.dialogue-tab-content').forEach(c => c.classList.remove('active'));
                    if (t === 'global') {
                        document.getElementById('dialogueGlobalTab').classList.add('active');
                    } else {
                        document.getElementById('dialogueCharacterTab').classList.add('active');
                    }
                });
            });

            confirmDialogue.addEventListener('click', () => {
                const activeTab = dialogueModal.querySelector('.dialogue-tab.active')?.dataset?.tab || 'global';
                if (activeTab === 'global') {
                    const text = globalDialogueInput.value.trim();
                    if (!text) return;
                    addDialoguesFromText(text, 'global', null);
                    closeDialogueModal();
                    updateDialogue();
                    return;
                }
                const text = characterDialogueInput.value.trim();
                const cid = dialogueCharacterSelect.value;
                if (!cid) {
                    showNotification('请先选择角色');
                    return;
                }
                if (!text) return;
                addDialoguesFromText(text, 'character', cid);
                closeDialogueModal();
                updateDialogue();
            });

            closeConfirm.addEventListener('click', closeConfirmModal);
            cancelConfirm.addEventListener('click', closeConfirmModal);
            okConfirm.addEventListener('click', () => {
                const fn = pendingConfirmAction;
                pendingConfirmAction = null;
                if (typeof fn === 'function') fn();
                if (confirmModal.style.display === 'flex') closeConfirmModal();
            });

            closeEditDialogue.addEventListener('click', closeEditDialogueModal);
            cancelEditDialogue.addEventListener('click', closeEditDialogueModal);
            confirmEditDialogue.addEventListener('click', saveEditedDialogue);
        }
        
        // 页面加载完成后初始化
        // 如果在iframe中，等待app:ready消息；否则立即初始化
        function waitForReadyAndInit() {
            var isInIframe = window.parent && window.parent !== window;
            if (isInIframe) {
                setTimeout(function() {
                    if (!_sleepAidReadyReceived) {
                        initSleepAid();
                        if (!_sleepAidInitialized) {
                            initPage();
                        }
                    }
                }, 500);
            } else {
                initSleepAid();
                initPage();
            }
        }
        document.addEventListener('DOMContentLoaded', waitForReadyAndInit);
        
        // 页面隐藏或卸载时停止所有活动
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                stopAllActivities();
            }
        });
        
        // 移动端备用方案（pagehide 比 beforeunload 更可靠）
        window.addEventListener('pagehide', function() {
            stopAllActivities();
        });
        
        window.addEventListener('beforeunload', function() {
            stopAllActivities();
        });
