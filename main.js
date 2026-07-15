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
            if (event.data && event.data.type === 'themeChanged') {
                const theme = (event.data && event.data.theme) === 'light' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
                try { localStorage.setItem('theme', theme); } catch (e) {}
                document.querySelectorAll('.theme-option').forEach(option => {
                    option.classList.toggle('active', option.getAttribute('data-theme') === theme);
                });
                return;
            }
            if (event.data && event.data.type === 'wechatAppDataChanged') {
                refreshWechatCharacters();
            }
        });



        (function () {
            function setAppHeight() {
                const height = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
                document.documentElement.style.setProperty('--app-height', height + 'px');
            }
            setAppHeight();
            if (window.EventBus) {
                window.EventBus.on('resize:throttled', setAppHeight);
                window.EventBus.on('visualViewport:resize', setAppHeight);
                window.EventBus.on('visualViewport:scroll', setAppHeight);
            } else {
                window.addEventListener('resize', setAppHeight, { passive: true });
                if (window.visualViewport && window.visualViewport.addEventListener) {
                    window.visualViewport.addEventListener('resize', setAppHeight);
                    window.visualViewport.addEventListener('scroll', setAppHeight);
                }
            }
            if (window.Core && window.Core.EventManager) {
                window.Core.EventManager.on(window, 'orientationchange', setAppHeight, { groupId: 'study-room-resize', passive: true });
            } else {
                window.addEventListener('orientationchange', setAppHeight, { passive: true });
            }
        })();

        (function () {
            if (!Element.prototype.matches) {
                Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
            }
            if (!Element.prototype.closest) {
                Element.prototype.closest = function (selector) {
                    let el = this;
                    while (el && el.nodeType === 1) {
                        if (el.matches(selector)) return el;
                        el = el.parentElement || el.parentNode;
                    }
                    return null;
                };
            }
            if (!String.prototype.padStart) {
                String.prototype.padStart = function padStart(targetLength, padString) {
                    targetLength = targetLength >> 0;
                    padString = String(padString !== undefined ? padString : ' ');
                    if (this.length >= targetLength) return String(this);
                    targetLength = targetLength - this.length;
                    let padding = '';
                    while (padding.length < targetLength) {
                        padding += padString;
                    }
                    if (padding.length > targetLength) {
                        padding = padding.slice(0, targetLength);
                    }
                    return padding + String(this);
                };
            }
            if (!String.prototype.startsWith) {
                String.prototype.startsWith = function (search, pos) {
                    pos = pos > 0 ? pos | 0 : 0;
                    return this.substring(pos, pos + String(search).length) === String(search);
                };
            }
            if (window.NodeList && !NodeList.prototype.forEach) {
                NodeList.prototype.forEach = Array.prototype.forEach;
            }
            if (window.Element && !Element.prototype.remove) {
                Element.prototype.remove = function () {
                    if (this.parentNode) {
                        this.parentNode.removeChild(this);
                    }
                };
            }
            if (!Array.prototype.flatMap) {
                Array.prototype.flatMap = function (callback, thisArg) {
                    return Array.prototype.concat.apply([], this.map(callback, thisArg));
                };
            }
            if (!Array.prototype.find) {
                Array.prototype.find = function (predicate, thisArg) {
                    if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
                    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
                    const list = Object(this);
                    const length = list.length >>> 0;
                    for (let i = 0; i < length; i++) {
                        const value = list[i];
                        if (predicate.call(thisArg, value, i, list)) return value;
                    }
                    return undefined;
                };
            }
            try {
                new Event('test');
            } catch (e) {
                window.Event = function (event, params) {
                    params = params || { bubbles: false, cancelable: false };
                    const evt = document.createEvent('Event');
                    evt.initEvent(event, params.bubbles, params.cancelable);
                    return evt;
                };
            }
        })();

        var localStorage = (function () {
            function createMemoryStorage() {
                const data = {};
                return {
                    getItem: function (key) {
                        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
                    },
                    setItem: function (key, value) {
                        data[key] = String(value);
                    },
                    removeItem: function (key) {
                        delete data[key];
                    }
                };
            }

            try {
                const storage = window.localStorage;
                const testKey = '__storage_test__';
                storage.setItem(testKey, '1');
                storage.removeItem(testKey);
                return {
                    getItem: function (key) {
                        try {
                            return window.localStorage.getItem(key);
                        } catch (e) {
                            return null;
                        }
                    },
                    setItem: function (key, value) {
                        try {
                            window.localStorage.setItem(key, value);
                        } catch (e) {}
                    },
                    removeItem: function (key) {
                        try {
                            window.localStorage.removeItem(key);
                        } catch (e) {}
                    }
                };
            } catch (e) {
                return createMemoryStorage();
            }
        })();

        // 全局变量
        let timerInterval;
        let timerTime = 0; // 以秒为单位
        let isRunning = false;
        let isCountdown = false;
        let countdownHours = 0;
        let countdownMinutes = 25;
        let currentAudio = null;
        let customAudio = null;
        let dialogueCycleInterval = null; // 话语条循环计时器
        
        // 存储数据
        let customCharacters = [];
        let customNoises = [];
        let dialogues = [];
        let currentCharacterId = null;
        let currentDialogueIndex = 0;
        
        // 默认话语库（当没有自定义话语时使用）
        const defaultDialogues = [
            "今天的你，正在创造明天的辉煌。",
            "每一分钟的专注，都是未来的基石。",
            "保持专注，时间会给你最好的答案。",
            "学习的路上，每一步都算数。",
            "专注当下，未来可期。",
            "每一次坚持，都是对自己的投资。",
            "知识在积累，能力在提升。",
            "心无旁骛，方能致远。",
            "今天的努力，是明天的底气。",
            "专注是一种力量，坚持是一种态度。"
        ];
        
        // DOM元素
        const timerDisplay = document.getElementById('timer');
        const timerText = document.getElementById('timerText');
        const timerLabel = document.getElementById('timer-label');
        const timerMode = document.getElementById('timer-mode');
        const modeText = document.getElementById('mode-text');
        const modeInfo = document.getElementById('mode-info');
        const startBtn = document.getElementById('start-timer');
        const pauseBtn = document.getElementById('pause-timer');
        const resetBtn = document.getElementById('reset-timer');
        const circularTimer = document.getElementById('circular-timer');
        const timerContainer = document.getElementById('timerContainer');
        const timerControlPanel = document.getElementById('timerControlPanel');
        const timerControlOverlay = document.getElementById('timerControlOverlay');
        const playPage = document.getElementById('playPage');
        const dialogueElement = document.getElementById('dialogueItem');
        
        // 计时器控制按钮元素
        const pauseTimerBtn = document.getElementById('pause-timer-btn');
        const stopTimerBtn = document.getElementById('stop-timer-btn');
        const cancelTimerBtn = document.getElementById('cancel-timer-btn');
        const mainBackBtn = document.getElementById('mainBackBtn');

        // 返回按钮事件
        if (mainBackBtn) {
            mainBackBtn.addEventListener('click', () => {
                 try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'closeApp', appId: 'study' }, _getPostTargetOrigin());
                        return;
                    }
                } catch (err) {}
                window.location.href = 'index.html';
            });
        }
        
        // 模态框元素
        const countdownModal = document.getElementById('countdown-modal');
        const modalClose = document.getElementById('modal-close');
        const modalCancel = document.getElementById('modal-cancel');
        const modalConfirm = document.getElementById('modal-confirm');
        const modalHours = document.getElementById('modal-hours');
        const modalMinutes = document.getElementById('modal-minutes');
        
        // 三点菜单元素
        const menuButton = document.getElementById('menu-button');
        const menuOverlay = document.getElementById('menu-overlay');
        const menuClose = document.getElementById('menu-close');
        const characterGrid = document.getElementById('character-grid');
        const noiseGrid = document.getElementById('noise-grid');
        const characterImageEl = document.getElementById('characterImage');
        const defaultCharacterImageSrc = characterImageEl ? characterImageEl.src : '';
        
        // 主题切换元素
        const themeConfirmModal = document.getElementById('theme-confirm-modal');
        const themeConfirmCancel = document.getElementById('theme-confirm-cancel');
        const themeConfirmOk = document.getElementById('theme-confirm-ok');
        const themeToSwitchEl = document.getElementById('theme-to-switch');
        let targetTheme = 'dark';
        
        // 菜单折叠功能
        const menuSections = document.querySelectorAll('.menu-section-header');
        
        // 自定义白噪音模态框元素
        const customNoiseBtn = document.getElementById('custom-noise-btn');
        const customNoiseModal = document.getElementById('custom-noise-modal');
        const customNoiseInput = document.getElementById('custom-noise-input');
        const noiseFileInput = document.getElementById('noise-file-input');
        const noiseCustomName = document.getElementById('noise-custom-name');
        const customNoiseCancel = document.getElementById('custom-noise-cancel');
        const customNoiseConfirm = document.getElementById('custom-noise-confirm');
        
        // 自定义话语条模态框元素
        const addDialogueBtn = document.getElementById('add-dialogue-btn');
        const customDialogueModal = document.getElementById('custom-dialogue-modal');
        const globalDialogueInput = document.getElementById('global-dialogue-input');
        const characterDialogueInput = document.getElementById('character-dialogue-input');
        const customDialogueCancel = document.getElementById('custom-dialogue-cancel');
        const customDialogueConfirm = document.getElementById('custom-dialogue-confirm');
        
        // 编辑话语条模态框元素
        const editDialogueModal = document.getElementById('editDialogueModal');
        const editDialogueInput = document.getElementById('editDialogueInput');
        const cancelEditDialogueBtn = document.getElementById('cancelEditDialogue');
        const confirmEditDialogueBtn = document.getElementById('confirmEditDialogue');
        let currentEditingDialogueId = null;

        // 选项卡元素
        const customTabs = document.querySelectorAll('.custom-input-tab');
        

        
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

        function ensureImageStorageDB() {
            if (window.__RoomImageStorageDB) return window.__RoomImageStorageDB;
            // Helper
            function _req(request) {
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }

            // Helper proxy to Core Services
            const coreRef = (window.parent && window.parent.Core) ? window.parent.Core : (window.Core ? window.Core : null);
            const storageRef = coreRef && coreRef.StorageService ? coreRef.StorageService : null;
            const dbObj = {
                dbName: 'PhoneAppImages',
                version: 5,
                _initPromise: null,
                _db: null,
                _storeSupport: { images: false, appData: false },
                init: async () => {
                    if (!storageRef) return;
                    const ensureSchema = (db) => {
                        if (!db.objectStoreNames.contains('images')) {
                            const store = db.createObjectStore('images', { keyPath: 'id' });
                            store.createIndex('type', 'type', { unique: false });
                        }
                        if (!db.objectStoreNames.contains('appData')) {
                            db.createObjectStore('appData', { keyPath: 'key' });
                        }
                    };
                    const db = await storageRef.openDB('PhoneAppImages', 5, ensureSchema);
                    dbObj._db = db;
                    dbObj._storeSupport = {
                        images: !!(db && db.objectStoreNames && db.objectStoreNames.contains('images')),
                        appData: !!(db && db.objectStoreNames && db.objectStoreNames.contains('appData'))
                    };
                    return db;
                },
                _ensureInit: async () => {
                    if (dbObj._initPromise) return dbObj._initPromise;
                    dbObj._initPromise = dbObj.init().catch((e) => {
                        dbObj._initPromise = null;
                        throw e;
                    });
                    return dbObj._initPromise;
                },
                put: async (id, data, type = 'media') => {
                    if (!storageRef) return;
                    await dbObj._ensureInit();
                    if (!dbObj._storeSupport.images) return;
                    return storageRef.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        await _req(store.put({ id, data, type, timestamp: Date.now() }));
                    });
                },
                get: async (id) => {
                    if (!storageRef) return null;
                    await dbObj._ensureInit();
                    if (!dbObj._storeSupport.images) return null;
                    return storageRef.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        const res = await _req(store.get(id));
                        if (!res) return null;
                        if (res.data != null) return res.data;
                        if (res.imageData != null) return res.imageData;
                        return null;
                    });
                },
                delete: async (id) => {
                    if (!storageRef) return;
                    await dbObj._ensureInit();
                    if (!dbObj._storeSupport.images) return;
                    return storageRef.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        await _req(store.delete(id));
                    });
                },
                saveAppData: async (key, data) => {
                     const k = String(key || '').trim();
                     if (!k) return;
                    if (!storageRef) return;
                    await dbObj._ensureInit();
                    if (!dbObj._storeSupport.appData) return;
                    return storageRef.transaction('PhoneAppImages', ['appData'], async (tx) => {
                        const store = tx.objectStore('appData');
                        await _req(store.put({ key: k, id: k, value: data, data: data, timestamp: Date.now() }));
                    });
                },
                 getAppData: async (key) => {
                     const k = String(key || '').trim();
                     if (!k) return null;
                    if (!storageRef) return null;
                    await dbObj._ensureInit();
                    if (!dbObj._storeSupport.appData) return null;
                    return storageRef.transaction('PhoneAppImages', ['appData'], async (tx) => {
                        const store = tx.objectStore('appData');
                        const res = await _req(store.get(k));
                        if (!res) return null;
                        if (res.value != null) return res.value;
                        if (res.data != null) return res.data;
                        return null;
                    });
                }
            };
            window.__RoomImageStorageDB = dbObj;
            return dbObj;
        }

        // 使用BlobUrlService统一管理Blob URL
        const GROUP_ID = 'study_room'; // 自习室页面的分组ID

        // 获取BlobUrlService实例
        function getBlobUrlService() {
            if (window.Core && window.Core.BlobUrlService) {
                return window.Core.BlobUrlService;
            }
            return null;
        }

        // 清除特定ID的缓存（用于头像更新时强制刷新）
        function clearCachedObjectUrl(id) {
            const blobUrlService = getBlobUrlService();
            // 注意：BlobUrlService不维护ID到URL的映射，所以这里主要是为了兼容性
            // 实际的头像更新会通过重新调用resolveIbdRef来获取新URL
        }

        async function resolveIbdRef(src, forceRefresh = false) {
            if (!src || typeof src !== 'string' || !src.startsWith('idb:')) return src;
            const id = src.slice(4);
            if (!id) return '';

            try {
                const db = ensureImageStorageDB();
                // 强制刷新时，确保重新从IndexedDB读取最新数据
                // 注意：IndexedDB的get操作本身就会返回最新数据，不需要特殊处理
                const data = await db.get(id);
                if (!data) return '';
                
                const blobUrlService = getBlobUrlService();
                
                if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
                    // 使用BlobUrlService统一管理Blob URL
                    // 注意：每次调用toDisplayUrl都会创建新的Blob URL（如果数据不同）
                    // 如果数据相同，BlobUrlService可能会复用URL，但这是正常的
                    if (blobUrlService && typeof blobUrlService.toDisplayUrl === 'function') {
                        const url = await blobUrlService.toDisplayUrl(data, { 
                            preferDataUrlInFileProtocol: true,
                            groupId: GROUP_ID 
                        });
                        return url;
                    }
                    // 降级：直接创建URL
                    const url = URL.createObjectURL(data);
                    return url;
                }
                return data;
            } catch (e) {
                console.error('[自习室] resolveIbdRef错误:', e);
                return '';
            }
        }

        async function applyImgSrc(imgEl, src, fallbackSrc, forceRefresh = false) {
            if (!imgEl) return;
            const resolved = await resolveIbdRef(src, forceRefresh);
            
            // 如果强制刷新，先清除当前src，确保浏览器重新加载
            if (forceRefresh && imgEl.src) {
                const oldSrc = imgEl.src;
                imgEl.src = '';
                // 使用微延迟确保浏览器清除缓存
                await new Promise(resolve => setTimeout(resolve, 10));
                // 如果新URL和旧URL相同，添加时间戳参数强制刷新
                if (resolved && oldSrc === resolved && resolved.startsWith('blob:')) {
                    // Blob URL无法添加查询参数，所以直接设置新URL（浏览器会重新加载）
                    imgEl.src = resolved;
                    return;
                }
            }
            
            imgEl.src = resolved || fallbackSrc || '';
        }

        async function loadCharactersFromWechat() {
            let appData = null;
            try {
                const db = ensureImageStorageDB();
                if (db && db.getAppData) {
                    appData = await db.getAppData('wechatAppData');
                }
            } catch (e) { console.error(e); }

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
                return Promise.all(contacts.map(async c => {
                    const avatarKey = 'avatar_' + (c && c.id);
                    let avatarData = '';
                    
                    // 检查是否有自定义头像，不再依赖hasCustomAvatar标志
                    // 直接检查存储中是否有头像数据
                    const db = ensureImageStorageDB();
                    
                    // 先尝试从IndexedDB获取
                    try {
                        const stored = await db.get(avatarKey);
                        if (stored && typeof stored === 'object' && typeof stored.arrayBuffer === 'function') {
                            avatarData = `idb:${avatarKey}`;
                        } else if (typeof stored === 'string' && stored.startsWith('data:image')) {
                            try {
                                const blob = await (await fetch(stored)).blob();
                                await db.put(avatarKey, blob, 'avatar');
                                avatarData = `idb:${avatarKey}`;
                            } catch (e) {
                                avatarData = stored;
                            }
                        }
                    } catch (e) {
                        avatarData = '';
                    }
                    
                    // 如果IndexedDB没有，尝试从localStorage获取
                    if (!avatarData) {
                        const ls = localStorage.getItem(avatarKey) || '';
                        if (ls && ls.startsWith('data:image')) {
                            try {
                                const blob = await (await fetch(ls)).blob();
                                await db.put(avatarKey, blob, 'avatar');
                                avatarData = `idb:${avatarKey}`;
                            } catch (e) {
                                avatarData = ls;
                            }
                        } else if (ls) {
                            // 处理其他可能的头像数据格式
                            avatarData = ls;
                        }
                    }

                    const avatarText = (c && c.avatarText) || (c && c.name ? c.name.slice(0, 1) : '友');
                    const avatarColor = c && c.avatarColor ? c.avatarColor : '';
                    const avatarFallback = generateTextAvatar(avatarText, (c && c.id) || (c && c.name) || avatarText, avatarColor);
                    return {
                        id: c && c.id,
                        name: (c && c.name) || '未命名',
                        avatarColor,
                        imageUrl: avatarData || avatarFallback,
                        fallbackUrl: avatarFallback
                    };
                })).then(results => results.filter(c => c.id != null));
            } catch (e) {
                return [];
            }
        }

        // 从本地存储加载数据
        async function loadFromLocalStorage() {
            customCharacters = await loadCharactersFromWechat();
            await saveCharactersToLocalStorage();
            renderCharacters();
            
            // 加载自定义白噪音
            const savedNoises = localStorage.getItem('customNoises');
            if (savedNoises) {
                customNoises = JSON.parse(savedNoises);
            } else {
                customNoises = []; // 清空默认白噪音
            }
            renderNoises();
            
            // 加载自定义话语条
            const savedDialogues = localStorage.getItem('customDialogues');
            if (savedDialogues) {
                dialogues = JSON.parse(savedDialogues);
            } else {
                dialogues = []; // 清空默认话语条
                saveDialoguesToLocalStorage();
            }
            
            // 加载当前角色（首次加载时强制刷新头像）
            const savedCurrentCharacterId = localStorage.getItem('currentCharacterId');
            if (savedCurrentCharacterId && customCharacters.length > 0) {
                const characterExists = customCharacters.some(char => char.id === savedCurrentCharacterId);
                if (characterExists) {
                    currentCharacterId = savedCurrentCharacterId;
                    const character = customCharacters.find(char => char.id === savedCurrentCharacterId);
                    if (character) {
                        // 首次加载时强制刷新，确保获取最新头像
                        if (characterImageEl) await applyImgSrc(characterImageEl, character.imageUrl, character.fallbackUrl || defaultCharacterImageSrc, true);
                        const currentNameEl = document.getElementById('current-character-name');
                        if (currentNameEl) currentNameEl.textContent = character.name;
                    }
                } else {
                    currentCharacterId = null;
                    localStorage.removeItem('currentCharacterId');
                    if (characterImageEl && defaultCharacterImageSrc) characterImageEl.src = defaultCharacterImageSrc;
                    const currentNameEl = document.getElementById('current-character-name');
                    if (currentNameEl) currentNameEl.textContent = '无';
                }
            }
            
            // 渲染话语条文件夹
            renderDialogueFolders();
        }

        async function refreshWechatCharacters() {
            customCharacters = await loadCharactersFromWechat();
            await saveCharactersToLocalStorage();
            renderCharacters();

            const savedCurrentCharacterId = localStorage.getItem('currentCharacterId');
            if (savedCurrentCharacterId && customCharacters.length > 0) {
                const characterExists = customCharacters.some(char => char.id === savedCurrentCharacterId);
                if (characterExists) {
                    currentCharacterId = savedCurrentCharacterId;
                    const character = customCharacters.find(char => char.id === savedCurrentCharacterId);
                    if (character) {
                        // 强制刷新头像，确保获取最新数据
                        if (characterImageEl) await applyImgSrc(characterImageEl, character.imageUrl, character.fallbackUrl || defaultCharacterImageSrc, true);
                        const currentNameEl = document.getElementById('current-character-name');
                        if (currentNameEl) currentNameEl.textContent = character.name;
                    }
                } else {
                    currentCharacterId = null;
                    localStorage.removeItem('currentCharacterId');
                    if (characterImageEl && defaultCharacterImageSrc) characterImageEl.src = defaultCharacterImageSrc;
                    const currentNameEl = document.getElementById('current-character-name');
                    if (currentNameEl) currentNameEl.textContent = '无';
                }
            }

            renderDialogueFolders();
        }
        
        // 保存数据到本地存储
        async function saveCharactersToLocalStorage() {
            try {
                const db = ensureImageStorageDB();
                const charsToSave = await Promise.all(customCharacters.map(async (char) => {
                    const src = char && typeof char.imageUrl === 'string' ? char.imageUrl : '';
                    if (!src) return char;
                    if (src.startsWith('idb:')) return char;
                    if (src.startsWith('data:image/svg+xml')) return char;
                    if (!src.startsWith('data:image') && !src.startsWith('blob:')) return char;

                    try {
                        const blob = await (await fetch(src)).blob();
                        const key = `avatar_${String(char.id || 'x')}`;
                        await db.put(key, blob, 'avatar');
                        return { ...char, imageUrl: `idb:${key}` };
                    } catch (e) {
                        return char;
                    }
                }));

                customCharacters = charsToSave;
                localStorage.setItem('customCharacters', JSON.stringify(charsToSave));
            } catch (e) {
                try {
                    localStorage.setItem('customCharacters', JSON.stringify(customCharacters));
                } catch (err) {}
            }
        }

        async function saveNoisesToLocalStorage() {
            try {
                const db = ensureImageStorageDB();
                const noisesToSave = await Promise.all(customNoises.map(async (noise) => {
                    const src = noise && typeof noise.audioUrl === 'string' ? noise.audioUrl : '';
                    if (!src) return noise;
                    if (src.startsWith('idb:')) return noise;
                    if (!src.startsWith('data:audio') && !src.startsWith('data:application/octet-stream')) return noise;

                    try {
                        const blob = await (await fetch(src)).blob();
                        const key = `roomaud_${String(noise.id || 'x')}_${Date.now()}`;
                        await db.put(key, blob, 'audio');
                        return { ...noise, audioUrl: `idb:${key}` };
                    } catch (e) {
                        return noise;
                    }
                }));

                customNoises = noisesToSave;
                localStorage.setItem('customNoises', JSON.stringify(noisesToSave));
            } catch (e) {
                try {
                    localStorage.setItem('customNoises', JSON.stringify(customNoises));
                } catch (err) {}
            }
        }
        
        function saveDialoguesToLocalStorage() {
            localStorage.setItem('customDialogues', JSON.stringify(dialogues));
        }
        
        // 更新当前时间
        function updateCurrentTime() {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const el = document.getElementById('current-time');
            if (el) {
                el.textContent = `${hours}:${minutes}`;
            }
        }
        
        // 页面切换功能
        const navItems = document.querySelectorAll('.nav-item');
        const pages = document.querySelectorAll('.page');
        
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const pageId = item.getAttribute('data-page');
                hideTimerControl();
                
                // 更新导航项状态
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // 显示对应页面
                pages.forEach(page => {
                    page.classList.remove('active');
                    if (page.id === `${pageId}-page`) {
                        page.classList.add('active');
                    }
                });
                
                // 更新页面标题
                updatePageTitle(pageId);
                
                // 如果是进度页，重新生成热力图以确保正确显示
                if (pageId === 'progress') {
                    generateCurrentMonthHeatmap();
                    generateFocusRecords();
                }
                
                // 修复：返回专注页时重新显示计时器（如果计时器正在运行或暂停）
                if (pageId === 'focus' && (timerTime > 0 || isRunning)) {
                    timerContainer.classList.add('visible');
                    playPage.classList.add('focus-mode');
                }
                
                // 更新左上角计时器显示
                updateTimerContainerVisibility();
            });
        });
        
        function updatePageTitle(pageId) {
            const titles = {
                'focus': '专注',
                'tasks': '任务',
                'progress': '进度'
            };
            document.title = `个人自习室 - ${titles[pageId]}`;
        }
        
        // 更新左上角计时器显示（只在专注页显示）
        function updateTimerContainerVisibility() {
            const activePage = document.querySelector('.page.active');
            if (activePage && activePage.id === 'focus-page' && (timerTime > 0 || isRunning)) {
                timerContainer.classList.add('visible');
            } else {
                timerContainer.classList.remove('visible');
                hideTimerControl();
            }
        }
        
        // 加载保存的主题
        function loadTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
            
            // 更新主题选项状态
            document.querySelectorAll('.theme-option').forEach(option => {
                option.classList.remove('active');
                if (option.getAttribute('data-theme') === savedTheme) {
                    option.classList.add('active');
                }
            });
        }
        
        // 主题切换功能
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', function() {
                const theme = this.getAttribute('data-theme');
                const themeName = theme === 'light' ? '白昼模式' : '暗夜模式';
                
                // 如果已经是当前主题，不执行切换
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                if (currentTheme === theme) return;
                
                targetTheme = theme;
                themeToSwitchEl.textContent = themeName;
                
                // 显示确认浮窗
                themeConfirmModal.classList.add('active');
            });
        });
        
        // 确认主题切换
        themeConfirmOk.addEventListener('click', function() {
            document.documentElement.setAttribute('data-theme', targetTheme);
            localStorage.setItem('theme', targetTheme);
            
            // 更新主题选项状态
            document.querySelectorAll('.theme-option').forEach(option => {
                option.classList.remove('active');
                if (option.getAttribute('data-theme') === targetTheme) {
                    option.classList.add('active');
                }
            });
            
            themeConfirmModal.classList.remove('active');
            closeMenu();
        });
        
        // 取消主题切换
        themeConfirmCancel.addEventListener('click', function() {
            themeConfirmModal.classList.remove('active');
        });
        
        // 菜单折叠功能
        menuSections.forEach(header => {
            header.addEventListener('click', function() {
                const section = this.parentElement;
                section.classList.toggle('collapsed');
            });
        });
        
        // 打开三点菜单
        function openMenu() {
            menuOverlay.classList.add('active');
            // 重新渲染话语条文件夹以确保显示正确的文件夹
            renderDialogueFolders();
        }
        
        // 关闭三点菜单
        function closeMenu() {
            menuOverlay.classList.remove('active');
        }
        
        // 切换自定义输入选项卡
        customTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const tabType = this.getAttribute('data-tab');
                const modal = this.closest('.custom-input-modal');
                const tabContents = modal.querySelectorAll('.custom-input-tab-content');
                
                // 更新选项卡状态
                modal.querySelectorAll('.custom-input-tab').forEach(t => {
                    t.classList.remove('active');
                });
                this.classList.add('active');
                
                // 显示对应的内容
                tabContents.forEach(content => {
                    content.classList.remove('active');
                });
                
                if (modal.id.indexOf('dialogue') !== -1) {
                    modal.querySelector(`#dialogue-${tabType}-tab`).classList.add('active');
                } else if (modal.id.indexOf('character') !== -1) {
                    modal.querySelector(`#character-${tabType}-tab`).classList.add('active');
                } else if (modal.id.indexOf('noise') !== -1) {
                    modal.querySelector(`#noise-${tabType}-tab`).classList.add('active');
                }
                
                // 重置自定义名称输入
                if (modal.id.indexOf('character') !== -1) {
                    characterCustomName.value = '';
                } else if (modal.id.indexOf('noise') !== -1) {
                    noiseCustomName.value = '';
                }
            });
        });
        
        // 打开自定义角色输入模态框
        function openCustomCharacterModal() {
            // 已弃用：角色管理统一由相册同步
        }
        
        // 关闭自定义角色输入模态框
        function closeCustomCharacterModal() {
            customCharacterModal.classList.remove('active');
        }
        
        // 打开自定义白噪音输入模态框
        function openCustomNoiseModal() {
            // 重置表单
            customNoiseInput.value = '';
            noiseFileInput.value = '';
            noiseCustomName.value = '';
            
            // 激活第一个选项卡
            customNoiseModal.querySelectorAll('.custom-input-tab').forEach((tab, index) => {
                tab.classList.remove('active');
                if (index === 0) tab.classList.add('active');
            });
            
            customNoiseModal.querySelectorAll('.custom-input-tab-content').forEach((content, index) => {
                content.classList.remove('active');
                if (index === 0) content.classList.add('active');
            });
            
            customNoiseModal.classList.add('active');
            closeMenu();
        }
        
        // 关闭自定义白噪音输入模态框
        function closeCustomNoiseModal() {
            customNoiseModal.classList.remove('active');
        }
        
        // 打开自定义话语条输入模态框
        let closeDropdownHandler = null;
        function openCustomDialogueModal() {
            // 重置表单
            globalDialogueInput.value = '';
            characterDialogueInput.value = '';
            
            // 重置角色选择器
            const selectedCharacterEl = document.getElementById('selected-character');
            const currentCharacterNameEl = document.getElementById('current-character-name');
            const characterDropdown = document.getElementById('character-dropdown');
            
            // 如果有当前角色，设为默认选择
            if (currentCharacterId) {
                const character = customCharacters.find(char => char.id === currentCharacterId);
                if (character) {
                    currentCharacterNameEl.textContent = character.name;
                    selectedCharacterEl.setAttribute('data-character-id', character.id);
                } else {
                    currentCharacterNameEl.textContent = '请选择角色';
                    selectedCharacterEl.setAttribute('data-character-id', '');
                }
            } else {
                currentCharacterNameEl.textContent = '请选择角色';
                selectedCharacterEl.setAttribute('data-character-id', '');
            }
            
            // 清空下拉菜单
            characterDropdown.innerHTML = '';
            
            // 生成角色下拉选项
            customCharacters.forEach(character => {
                const option = document.createElement('div');
                option.className = 'character-dropdown-option';
                option.style.cssText = `
                    padding: 10px 15px;
                    cursor: pointer;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                `;
                const img = document.createElement('img');
                img.alt = character.name;
                img.style.width = '24px';
                img.style.height = '24px';
                img.style.borderRadius = '4px';
                img.style.marginRight = '8px';
                img.style.objectFit = 'cover';
                option.appendChild(img);

                const text = document.createElement('span');
                text.textContent = character.name;
                option.appendChild(text);

                const fallbackSrc = character.fallbackUrl || defaultCharacterImageSrc || '';
                applyImgSrc(img, character.imageUrl, fallbackSrc);
                option.setAttribute('data-character-id', character.id);
                
                option.addEventListener('mouseenter', function() {
                    this.style.background = 'rgba(255, 255, 255, 0.1)';
                });
                
                option.addEventListener('mouseleave', function() {
                    this.style.background = 'transparent';
                });
                
                option.addEventListener('click', function() {
                    const characterId = this.getAttribute('data-character-id');
                    const character = customCharacters.find(char => char.id === characterId);
                    if (character) {
                        currentCharacterNameEl.textContent = character.name;
                        selectedCharacterEl.setAttribute('data-character-id', characterId);
                        characterDropdown.style.display = 'none';
                    }
                });
                
                characterDropdown.appendChild(option);
            });
            
            // 添加"无"选项
            const noOption = document.createElement('div');
            noOption.className = 'character-dropdown-option';
            noOption.style.cssText = `
                padding: 10px 15px;
                cursor: pointer;
                transition: background 0.2s;
                display: flex;
                align-items: center;
                color: rgba(255, 255, 255, 0.6);
            `;
            noOption.innerHTML = `
                <i class="fas fa-times" style="margin-right: 8px;"></i>
                <span>不绑定角色（全局）</span>
            `;
            noOption.addEventListener('click', function() {
                currentCharacterNameEl.textContent = '请选择角色';
                selectedCharacterEl.setAttribute('data-character-id', '');
                characterDropdown.style.display = 'none';
            });
            noOption.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            noOption.addEventListener('mouseleave', function() {
                this.style.background = 'transparent';
            });
            characterDropdown.appendChild(noOption);
            
            // 切换下拉菜单显示
            selectedCharacterEl.addEventListener('click', function() {
                characterDropdown.style.display = characterDropdown.style.display === 'none' ? 'block' : 'none';
            });
            
            // 点击其他地方关闭下拉菜单
            if (closeDropdownHandler) {
                document.removeEventListener('click', closeDropdownHandler);
            }
            closeDropdownHandler = function (e) {
                if (!characterDropdown.contains(e.target) && !selectedCharacterEl.contains(e.target)) {
                    characterDropdown.style.display = 'none';
                }
            };
            document.addEventListener('click', closeDropdownHandler);
            
            // 根据当前角色状态设置默认选项卡：有当前角色则默认「捆绑角色」，否则默认「全局应用」
            const tabs = customDialogueModal.querySelectorAll('.custom-input-tab');
            const contents = customDialogueModal.querySelectorAll('.custom-input-tab-content');

            let defaultTab = 'global';
            if (currentCharacterId) {
                const hasCharacter = customCharacters.some(char => char.id === currentCharacterId);
                if (hasCharacter) {
                    defaultTab = 'character';
                }
            }

            tabs.forEach(tab => {
                const tabType = tab.getAttribute('data-tab');
                tab.classList.toggle('active', tabType === defaultTab);
            });

            contents.forEach(content => {
                const id = content.id || '';
                const isGlobal = id === 'dialogue-global-tab' && defaultTab === 'global';
                const isCharacter = id === 'dialogue-character-tab' && defaultTab === 'character';
                content.classList.toggle('active', isGlobal || isCharacter);
            });
            
            customDialogueModal.classList.add('active');
            closeMenu();
        }
        
        // 关闭自定义话语条输入模态框
        function closeCustomDialogueModal() {
            customDialogueModal.classList.remove('active');
        }
        
        noiseFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const fileName = this.files[0].name;
                // 自动填充自定义名称（去掉扩展名）
                const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
                noiseCustomName.value = nameWithoutExt || fileName;
            } else {
                noiseCustomName.value = '';
            }
        });
        
        // 渲染角色（添加长按编辑功能）
        function renderCharacters() {
            characterGrid.innerHTML = '';
            
            customCharacters.forEach(character => {
                const characterOption = document.createElement('div');
                characterOption.className = 'character-option';
                if (character.id === currentCharacterId) {
                    characterOption.classList.add('selected');
                }
                characterOption.setAttribute('data-character-id', character.id);

                const imgEl = document.createElement('img');
                imgEl.className = 'character-image-small';
                imgEl.alt = character.name;
                const fallbackSrc = character.fallbackUrl || generateTextAvatar((character.name || '').slice(0, 1), character.id || character.name || 'x', character.avatarColor || '');
                imgEl.src = fallbackSrc;
                applyImgSrc(imgEl, character.imageUrl, fallbackSrc);

                const nameEl = document.createElement('div');
                nameEl.className = 'character-name';
                nameEl.textContent = character.name;

                characterOption.appendChild(imgEl);
                characterOption.appendChild(nameEl);
                
                // 点击选择角色
                characterOption.addEventListener('click', (e) => {
                    if (!isLongPress) {
                        selectCharacter(character.id);
                    }
                });
                
                // 双击编辑
                characterOption.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    openEditCharacterModal(character);
                });
                
                // 长按编辑
                let longPressTimer;
                let isLongPress = false;
                
                characterOption.addEventListener('mousedown', (e) => {
                    isLongPress = false;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        openEditCharacterModal(character);
                    }, 800); // 长按800毫秒
                });
                
                characterOption.addEventListener('mouseup', () => {
                    clearTimeout(longPressTimer);
                });
                
                characterOption.addEventListener('mouseleave', () => {
                    clearTimeout(longPressTimer);
                });
                
                // 触摸设备支持
                characterOption.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        openEditCharacterModal(character);
                    }, 800);
                });
                
                characterOption.addEventListener('touchend', () => {
                    clearTimeout(longPressTimer);
                });

                characterOption.addEventListener('touchmove', () => {
                    clearTimeout(longPressTimer);
                });

                characterOption.addEventListener('touchcancel', () => {
                    clearTimeout(longPressTimer);
                });
                
                characterGrid.appendChild(characterOption);
            });
        }


        // ---------------------------------------------------------
        // 角色编辑与背景管理功能
        // ---------------------------------------------------------
        
        let characterEditing = null;

        function openEditCharacterModal(character) {
            characterEditing = character;
            const modal = document.getElementById('editCharacterModal');
            const nameInput = document.getElementById('editCharacterNameInput');
            
            if (modal && nameInput) {
                nameInput.value = character.name || '';
                modal.classList.add('active');
            }
        }

        function closeEditCharacterModal() {
            const modal = document.getElementById('editCharacterModal');
            if (modal) {
                modal.classList.remove('active');
            }
            characterEditing = null;
        }

        // 初始化背景选择卡片及编辑功能
        function initBgCard() {
            const openBgSelectBtn = document.getElementById('openBgSelectBtn');
            const closeBgCardBtn = document.getElementById('closeBgCard');
            const addBgFromPhoneBtn = document.getElementById('addBgFromPhone');
            const bgFileInput = document.getElementById('bgFileInput');
            const saveEditBtn = document.getElementById('saveEditCharacter');
            const cancelEditBtn = document.getElementById('cancelEditCharacter');
            const deleteCharBtn = document.getElementById('deleteCharacterBtn');
            
            // 编辑浮窗事件
            if (saveEditBtn) {
                saveEditBtn.onclick = () => {
                    if (characterEditing) {
                        const nameInput = document.getElementById('editCharacterNameInput');
                        if (nameInput) {
                            const newName = nameInput.value.trim();
                            if (newName) {
                                characterEditing.name = newName;
                                saveCharactersToLocalStorage();
                                renderCharacters();
                                if (characterEditing.id === currentCharacterId) {
                                    document.getElementById('current-character-name').textContent = newName;
                                }
                            }
                        }
                    }
                    closeEditCharacterModal();
                };
            }
            
            if (cancelEditBtn) {
                cancelEditBtn.onclick = closeEditCharacterModal;
            }
            
            // 打开背景选择卡片
            if (openBgSelectBtn) {
                openBgSelectBtn.onclick = () => {
                    if (!characterEditing) return;
                    openBgCard(characterEditing.id);
                };
            }

            // 关闭背景选择卡片
            if (closeBgCardBtn) {
                closeBgCardBtn.onclick = () => {
                    const bgSelectCard = document.getElementById('bgSelectCard');
                    if (bgSelectCard) bgSelectCard.classList.remove('show');
                };
            }

            // 添加本地图片
            if (addBgFromPhoneBtn && bgFileInput) {
                addBgFromPhoneBtn.onclick = () => {
                    bgFileInput.click();
                };

                bgFileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file || !characterEditing) return;

                    if (!window.FileReader) {
                        showNotification('当前浏览器不支持本地图片选择');
                        bgFileInput.value = '';
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const newUrl = e.target.result;
                        updateCharacterBackground(characterEditing, newUrl);
                        const bgSelectCard = document.getElementById('bgSelectCard');
                        if (bgSelectCard) bgSelectCard.classList.remove('show');
                    };
                    reader.onerror = () => {
                        showNotification('读取图片失败');
                    };
                    reader.readAsDataURL(file);
                };
            }
        }

        async function openBgCard(characterId) {
            const bgSelectCard = document.getElementById('bgSelectCard');
            const bgGrid = document.getElementById('bgGrid');
            const bgEmptyTip = document.getElementById('bgEmptyTip');
            
            if (!bgSelectCard || !bgGrid) return;
            
            // 清空当前列表
            bgGrid.innerHTML = '';
            
            // 获取相册图片
            const images = getAlbumImages(characterId);
            
            if (images.length === 0) {
                if (bgEmptyTip) bgEmptyTip.style.display = 'flex';
            } else {
                if (bgEmptyTip) bgEmptyTip.style.display = 'none';
                images.forEach(src => {
                    const item = document.createElement('div');
                    item.className = 'bg-item';
                    if (characterEditing && characterEditing.imageUrl === src) {
                        item.classList.add('selected');
                    }
                    
                    const img = document.createElement('img');
                    img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Crect width=%22120%22 height=%22120%22 rx=%2220%22 fill=%22%231a1a2e%22/%3E%3C/svg%3E';
                    applyImgSrc(img, src, img.src);
                    item.appendChild(img);
                    
                    item.onclick = () => {
                        updateCharacterBackground(characterEditing, src);
                        
                        // 更新选中样式
                        document.querySelectorAll('.bg-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        
                        // 稍微延迟关闭
                        setTimeout(() => {
                            bgSelectCard.classList.remove('show');
                        }, 200);
                    };
                    
                    bgGrid.appendChild(item);
                });
            }
            
            bgSelectCard.classList.add('show');
        }

        async function updateCharacterBackground(character, url) {
            if (!character) return;
            
            character.imageUrl = url;
            await saveCharactersToLocalStorage();
            renderCharacters();
            
            if (character.id === currentCharacterId) {
                const charImg = document.getElementById('characterImage');
                const updated = customCharacters.find(c => c && c.id === character.id) || character;
                // 强制刷新头像，确保显示最新数据
                if (charImg) await applyImgSrc(charImg, updated.imageUrl, updated.fallbackUrl || defaultCharacterImageSrc, true);
            }
        }

        // 获取角色相册图片 (从相册应用数据中读取)
        function getAlbumImages(characterId) {
            const key = `photo_albums_${characterId}`;
            const raw = localStorage.getItem(key);
            
            if (!raw) return [];
            try {
                const albums = JSON.parse(raw);
                if (!Array.isArray(albums)) return [];
                const photos = [];
                albums.forEach(album => {
                    const list = album && Array.isArray(album.photos) ? album.photos : [];
                    list.forEach(p => {
                        if (p && p.src) photos.push(p.src);
                    });
                });
                return photos;
            } catch (e) {
                return [];
            }
        }
        
        // Initialize listeners
        initBgCard();

        
        // 渲染白噪音
        function renderNoises() {
            // 保留"无"选项
            const noiseOptions = noiseGrid.querySelectorAll('.noise-option');
            noiseOptions.forEach(option => {
                if (option.getAttribute('data-noise') !== 'none') {
                    option.remove();
                }
            });
            
            customNoises.forEach(noise => {
                const noiseOption = document.createElement('div');
                noiseOption.className = 'noise-option';
                noiseOption.setAttribute('data-noise-id', noise.id);
                noiseOption.innerHTML = `
                    <i class="fas fa-headphones noise-icon"></i>
                    <div class="noise-name">${noise.name}</div>
                `;
                
                noiseOption.addEventListener('click', () => {
                    selectNoise(noise.id);
                });
                
                noiseGrid.appendChild(noiseOption);
            });
        }
        
        // 渲染话语条文件夹
        function renderDialogueFolders() {
            const dialogueSectionContent = document.getElementById('dialogue-section-content');
            const addDialogueBtn = document.getElementById('add-dialogue-btn');
            
            // 清除现有内容（除了添加按钮）
            const existingFolders = dialogueSectionContent.querySelectorAll('.dialogue-folder');
            existingFolders.forEach(folder => folder.remove());
            
            // 过滤话语条：专注未开始显示所有，专注开始后只显示全局和当前角色的话语条
            let filteredDialogues = dialogues;
            if (isRunning && currentCharacterId) {
                filteredDialogues = dialogues.filter(dialogue => 
                    dialogue.scope === 'global' || 
                    (dialogue.scope === 'character' && dialogue.characterId === currentCharacterId)
                );
            }
            
            // 按范围分组
            const globalDialogues = filteredDialogues.filter(d => d.scope === 'global');
            const characterDialogues = filteredDialogues.filter(d => d.scope === 'character');
            
            // 按角色分组
            const characterGroups = {};
            characterDialogues.forEach(dialogue => {
                if (!characterGroups[dialogue.characterId]) {
                    characterGroups[dialogue.characterId] = [];
                }
                characterGroups[dialogue.characterId].push(dialogue);
            });
            
            // 创建全局话语条文件夹
            if (globalDialogues.length > 0) {
                const globalFolder = createDialogueFolder('global', '全局话语条', globalDialogues);
                dialogueSectionContent.insertBefore(globalFolder, addDialogueBtn);
            }
            
            // 创建角色话语条文件夹
            Object.keys(characterGroups).forEach(characterId => {
                const character = customCharacters.find(char => char.id === characterId);
                if (character) {
                    const characterFolder = createDialogueFolder(characterId, `${character.name}的话语条`, characterGroups[characterId]);
                    dialogueSectionContent.insertBefore(characterFolder, addDialogueBtn);
                }
            });
        }
        
        // 创建话语条文件夹
        function createDialogueFolder(folderId, folderTitle, dialogueItems) {
            const folder = document.createElement('div');
            folder.className = 'dialogue-folder collapsed';
            folder.id = `dialogue-folder-${folderId}`;
            
            const folderHeader = document.createElement('div');
            folderHeader.className = 'dialogue-folder-header';
            folderHeader.innerHTML = `
                <div class="folder-title">
                    <i class="fas fa-folder"></i>
                    <span>${folderTitle}</span>
                </div>
                <div class="folder-count">${dialogueItems.length}条</div>
                <i class="fas fa-chevron-down folder-arrow"></i>
            `;
            
            const dialogueList = document.createElement('div');
            dialogueList.className = 'dialogue-list';
            
            dialogueItems.forEach(dialogue => {
                const dialogueOption = document.createElement('div');
                dialogueOption.className = 'dialogue-item-option';
                dialogueOption.setAttribute('data-dialogue-id', dialogue.id);
                dialogueOption.innerHTML = `
                    <div class="dialogue-text">${dialogue.text}</div>
                    <div class="dialogue-actions">
                        <button class="dialogue-action-btn edit-btn" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="dialogue-action-btn delete-btn" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                // 编辑按钮事件
                const editBtn = dialogueOption.querySelector('.edit-btn');
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    editDialogue(dialogue.id);
                });
                
                // 删除按钮事件
                const deleteBtn = dialogueOption.querySelector('.delete-btn');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteDialogue(dialogue.id);
                });
                
                dialogueList.appendChild(dialogueOption);
            });
            
            folder.appendChild(folderHeader);
            folder.appendChild(dialogueList);
            
            // 文件夹折叠功能
            folderHeader.addEventListener('click', function() {
                folder.classList.toggle('collapsed');
            });
            
            // 双击进入编辑模式
            folder.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (e.target.closest('.dialogue-action-btn')) return;
                folder.classList.toggle('folder-edit-mode');
            });

            return folder;
        }
        
        // 添加自定义角色
        function addCustomCharacter(imageUrl, isFile = false, customName = '') {
            if (!imageUrl) return;
            
            let finalImageUrl = imageUrl;
            
            // 如果是文件，使用FileReader读取为Data URL
            if (isFile) {
                if (!window.FileReader) {
                    showNotification('当前浏览器不支持本地文件读取');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    finalImageUrl = e.target.result;
                    completeAddCustomCharacter(finalImageUrl, customName, true);
                };
                reader.onerror = function () {
                    showNotification('读取文件失败');
                };
                reader.readAsDataURL(imageUrl);
                return; // 异步操作，在回调中完成添加
            }
            
            completeAddCustomCharacter(finalImageUrl, customName, false);
        }
        
        function completeAddCustomCharacter(imageUrl, customName, isFile) {
            // 使用自定义名称或默认名称
            const displayName = customName.trim() || '自定义角色';
            
            // 创建新角色
            const characterId = `custom-${Date.now()}`;
            const newCharacter = {
                id: characterId,
                name: displayName,
                imageUrl: imageUrl,
                isFile: isFile
            };
            
            // 添加到数组
            customCharacters.push(newCharacter);
            
            // 保存到本地存储
            saveCharactersToLocalStorage();
            
            // 渲染角色
            renderCharacters();
            
            // 如果这是第一个角色，自动选择它
            if (customCharacters.length === 1) {
                selectCharacter(characterId);
            }
            
            closeCustomCharacterModal();
        }
        
        // 添加自定义白噪音
        function addCustomNoise(audioUrl, isFile = false, customName = '') {
            if (!audioUrl) return;
            
            let finalAudioUrl = audioUrl;
            
            // 如果是文件，使用FileReader读取为Data URL
            if (isFile) {
                if (!window.FileReader) {
                    showNotification('当前浏览器不支持本地文件读取');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    finalAudioUrl = e.target.result;
                    completeAddCustomNoise(finalAudioUrl, customName, true);
                };
                reader.onerror = function () {
                    showNotification('读取文件失败');
                };
                reader.readAsDataURL(audioUrl);
                return; // 异步操作，在回调中完成添加
            }
            
            completeAddCustomNoise(finalAudioUrl, customName, false);
        }
        
        function completeAddCustomNoise(audioUrl, customName, isFile) {
            // 使用自定义名称或默认名称
            const displayName = customName.trim() || '自定义白噪音';
            
            // 创建新白噪音
            const noiseId = `custom-${Date.now()}`;
            const newNoise = {
                id: noiseId,
                name: displayName,
                audioUrl: audioUrl,
                isFile: isFile
            };
            
            // 添加到数组
            customNoises.push(newNoise);
            
            // 保存到本地存储
            saveNoisesToLocalStorage();
            
            // 渲染白噪音
            renderNoises();
            
            closeCustomNoiseModal();
        }
        
        // 添加自定义话语条
        function addCustomDialogue(text, scope = 'global', characterId = null) {
            if (!text || text.trim() === '') return;
            
            // 按行分割处理
            const lines = text.split('\n').filter(line => line.trim() !== '');
            
            lines.forEach(line => {
                const dialogueId = `dialogue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const newDialogue = {
                    id: dialogueId,
                    text: line.trim(),
                    scope: scope,
                    characterId: characterId
                };
                
                // 添加到数组
                dialogues.push(newDialogue);
            });
            
            // 保存到本地存储
            saveDialoguesToLocalStorage();
            
            // 重新渲染话语条文件夹
            renderDialogueFolders();
            
            closeCustomDialogueModal();
        }
        
        // 编辑话语条
        function editDialogue(dialogueId) {
            const dialogue = dialogues.find(d => d.id === dialogueId);
            if (!dialogue) return;
            
            currentEditingDialogueId = dialogueId;
            editDialogueInput.value = dialogue.text;
            editDialogueModal.classList.add('active');
        }
        
        // 删除话语条
        function deleteDialogue(dialogueId) {
            dialogues = dialogues.filter(d => d.id !== dialogueId);
            saveDialoguesToLocalStorage();
            renderDialogueFolders();
        }
        
        // 选择角色
        async function selectCharacter(characterId) {
            const character = customCharacters.find(char => char.id === characterId);
            if (!character) return;
            
            // 更新当前角色ID
            currentCharacterId = characterId;
            localStorage.setItem('currentCharacterId', characterId);
            
            // 更新角色选择状态
            document.querySelectorAll('.character-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            const selectedOption = document.querySelector(`[data-character-id="${characterId}"]`);
            if (selectedOption) {
                selectedOption.classList.add('selected');
            }
            
            // 更新背景图片（强制刷新以确保获取最新头像）
            const charImg = document.getElementById('characterImage');
            if (charImg) {
                await applyImgSrc(charImg, character.imageUrl, character.fallbackUrl || defaultCharacterImageSrc, true);
            }
            
            // 更新话语条模态框中的角色名称
            const currentNameEl = document.getElementById('current-character-name');
            if (currentNameEl) currentNameEl.textContent = character.name;
            
            // 重新渲染话语条文件夹
            renderDialogueFolders();
        }
        
        // 选择白噪音
        function selectNoise(noiseId) {
            // 停止当前音频
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }
            
            // 更新白噪音选择状态
            document.querySelectorAll('.noise-option').forEach(option => {
                option.classList.remove('active');
            });
            
            const selectedOption = document.querySelector(`[data-noise-id="${noiseId}"]`);
            if (selectedOption) {
                selectedOption.classList.add('active');
            }
            
            // 如果是"无"选项
            if (noiseId === 'none') {
                closeMenu();
                return;
            }
            
            // 查找白噪音
            let noise;
            if (noiseId.startsWith('custom-')) {
                noise = customNoises.find(n => n.id === noiseId);
            }
            
            if (noise && noise.audioUrl) {
                if (typeof Audio !== 'function') {
                    showNotification('当前浏览器不支持音频播放');
                    closeMenu();
                    return;
                }
                const startAudio = async () => {
                    const resolved = await resolveIbdRef(noise.audioUrl);
                    if (!resolved) return;
                    currentAudio = new Audio(resolved);
                    currentAudio.loop = true;
                    currentAudio.volume = 0.3;

                    const playResult = currentAudio.play();
                    if (playResult && typeof playResult.catch === 'function') {
                        playResult.catch(() => {});
                    }
                };

                startAudio();
            }
            
            closeMenu();
        }
        
        // 显示计时器控制浮窗
        function showTimerControl() {
            if (!isRunning && timerTime === 0) {
                return;
            }
            const activePage = document.querySelector('.page.active');
            if (!activePage || activePage.id !== 'focus-page') return;
            if (!timerContainer.classList.contains('visible')) return;
            
            updateTimerControlButtons();
            
            timerControlPanel.classList.add('active');
            timerControlOverlay.classList.add('active');
        }
        
        // 更新计时器控制按钮
        function updateTimerControlButtons() {
            if (isRunning) {
                pauseTimerBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停';
                pauseTimerBtn.className = 'timer-control-btn pause-btn';
            } else if (timerTime > 0) {
                pauseTimerBtn.innerHTML = '<i class="fas fa-play"></i> 继续';
                pauseTimerBtn.className = 'timer-control-btn resume-btn';
            }
        }
        
        // 隐藏计时器控制浮窗
        function hideTimerControl() {
            timerControlPanel.classList.remove('active');
            timerControlOverlay.classList.remove('active');
        }
        
        // 打开倒计时设置模态框
        function openCountdownModal() {
            if (!isCountdown) return;
            
            modalHours.value = countdownHours;
            modalMinutes.value = countdownMinutes;
            
            countdownModal.classList.add('active');
        }
        
        // 关闭倒计时设置模态框
        function closeCountdownModal() {
            countdownModal.classList.remove('active');
        }
        
        // 确认倒计时设置
        function confirmCountdownTime() {
            let hours = parseInt(modalHours.value) || 0;
            let minutes = parseInt(modalMinutes.value) || 1;
            
            if (hours < 0) hours = 0;
            if (hours > 5) hours = 5;
            if (minutes < 1) minutes = 1;
            if (minutes > 59) minutes = 59;
            
            countdownHours = hours;
            countdownMinutes = minutes;
            
            if (!isRunning) {
                timerTime = 0;
                updateTimerDisplay();
            }
            
            closeCountdownModal();
        }
        
        // 格式化时间显示
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // 计算倒计时总秒数
        function getCountdownTotalSeconds() {
            return (countdownHours * 3600) + (countdownMinutes * 60);
        }
        
        // 更新计时器显示
        function updateTimerDisplay() {
            if (isCountdown) {
                const totalSeconds = getCountdownTotalSeconds();
                const remaining = totalSeconds - timerTime;
                if (remaining <= 0) {
                    timerDisplay.textContent = '00:00';
                    timerText.textContent = '00:00';
                    timerLabel.textContent = '时间到！';
                    clearInterval(timerInterval);
                    isRunning = false;
                    startBtn.innerHTML = '<i class="fas fa-play"></i> 重新开始';
                    pauseBtn.style.display = 'none';
                    if (remaining === 0) {
                        showNotification('专注时间结束！休息一下吧。');
                        stopDialogueCycle(); // 专注结束隐藏话语条
                        exitFocusMode();
                    }
                } else {
                    timerDisplay.textContent = formatTime(remaining);
                    timerText.textContent = formatTime(remaining);
                    timerLabel.textContent = '倒计时';
                }
            } else {
                timerDisplay.textContent = formatTime(timerTime);
                timerText.textContent = formatTime(timerTime);
                timerLabel.textContent = '正计时';
            }
        }
        
        // 进入专注模式
        function enterFocusMode() {
            playPage.classList.add('focus-mode');
            // 只在专注页显示计时器
            const activePage = document.querySelector('.page.active');
            if (activePage && activePage.id === 'focus-page') {
                timerContainer.classList.add('visible');
            }
        }
        
        // 退出专注模式
        function exitFocusMode() {
            playPage.classList.remove('focus-mode');
            timerContainer.classList.remove('visible');
            hideTimerControl();
        }
        
        // 开始话语循环
        function startDialogueCycle() {
            if (dialogueCycleInterval) {
                clearInterval(dialogueCycleInterval);
            }
            updateDialogue(); // 立即显示第一条
            dialogueCycleInterval = setInterval(() => {
                updateDialogue();
            }, 8000);
        }
        
        // 停止话语循环
        function stopDialogueCycle() {
            if (dialogueCycleInterval) {
                clearInterval(dialogueCycleInterval);
                dialogueCycleInterval = null;
            }
            dialogueElement.classList.remove('entering');
            dialogueElement.classList.add('leaving');
        }
        
        // 开始计时器
        function startTimer() {
            if (isRunning) return;
            
            isRunning = true;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 运行中...';
            pauseBtn.style.display = 'flex';
            
            enterFocusMode();
            
            // 开始话语条显示
            startDialogueCycle();
            
            timerInterval = setInterval(() => {
                timerTime++;
                updateTimerDisplay();
                
                if (timerTime % 60 === 0) { // 每分钟更新一次
                    updateTodayFocusTime();
                }
                
                if (isCountdown && timerTime >= getCountdownTotalSeconds()) {
                    clearInterval(timerInterval);
                    isRunning = false;
                    startBtn.innerHTML = '<i class="fas fa-play"></i> 重新开始';
                    pauseBtn.style.display = 'none';
                    recordFocusSession(timerTime);
                    stopDialogueCycle(); // 专注结束隐藏话语条
                    exitFocusMode();
                }
            }, 1000);
            
            updateTimerControlButtons();
            hideTimerControl();
        }
        
        // 暂停计时器
        function pauseTimer() {
            if (!isRunning) return;
            
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 继续专注';
            pauseBtn.style.display = 'none';
            stopDialogueCycle(); // 暂停时隐藏话语条
            
            updateTimerControlButtons();
            hideTimerControl();
        }
        
        // 停止计时器
        function stopTimer() {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始专注';
            pauseBtn.style.display = 'none';
            
            if (timerTime > 60) {
                recordFocusSession(timerTime);
            }
            
            timerTime = 0;
            updateTimerDisplay();
            stopDialogueCycle(); // 停止时隐藏话语条
            
            exitFocusMode();
            hideTimerControl();
        }
        
        // 取消计时器
        function cancelTimer() {
            clearInterval(timerInterval);
            isRunning = false;
            timerTime = 0;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始专注';
            pauseBtn.style.display = 'none';
            updateTimerDisplay();
            stopDialogueCycle(); // 取消时隐藏话语条
            
            exitFocusMode();
            hideTimerControl();
        }
        
        // 重置计时器
        function resetTimer() {
            clearInterval(timerInterval);
            isRunning = false;
            timerTime = 0;
            startBtn.innerHTML = '<i class="fas fa-play"></i> 开始专注';
            pauseBtn.style.display = 'none';
            updateTimerDisplay();
            stopDialogueCycle(); // 重置时隐藏话语条
            
            // 如果是倒计时模式，恢复默认值
            if (isCountdown) {
                countdownHours = 0;
                countdownMinutes = 25;
                updateTimerDisplay();
            }
            
            updateTimerControlButtons();
        }
        
        // 切换计时模式
        function toggleTimerMode() {
            isCountdown = !isCountdown;
            
            if (isCountdown) {
                modeText.textContent = '倒计时';
                modeInfo.textContent = '点击计时器设置时长';
                timerLabel.textContent = '倒计时';
                timerTime = 0;
                updateTimerDisplay();
            } else {
                modeText.textContent = '正计时';
                modeInfo.textContent = '点击切换为倒计时';
                timerLabel.textContent = '正计时';
                timerTime = 0;
                timerDisplay.textContent = '00:00';
                timerText.textContent = '00:00';
            }
            
            if (isRunning) {
                clearInterval(timerInterval);
                isRunning = false;
                startBtn.innerHTML = '<i class="fas fa-play"></i> 开始专注';
                pauseBtn.style.display = 'none';
                stopDialogueCycle(); // 切换模式时隐藏话语条
            }
            
            updateTimerControlButtons();
        }
        
        // 记录专注会话
        function recordFocusSession(durationSeconds) {
            // 只要超过1分钟就记录
            if (durationSeconds < 60) return;
            
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const seconds = durationSeconds % 60;
            let durationText = '';
            
            if (hours > 0) {
                durationText = `${hours}小时${minutes}分钟`;
            } else if (minutes > 0) {
                durationText = `${minutes}分钟`;
            } else {
                durationText = `${seconds}秒`;
            }
            
            const record = {
                date: dateStr,
                startTime: timeStr,
                duration: durationText,
                durationSeconds: durationSeconds
            };
            
            let records = JSON.parse(localStorage.getItem('focusRecords') || '[]');
            records.unshift(record);
            if (records.length > 50) records = records.slice(0, 50);
            localStorage.setItem('focusRecords', JSON.stringify(records));
            
            updateHeatmapData(dateStr, durationSeconds);
            generateFocusRecords();
            generateCurrentMonthHeatmap();
            
            // 更新状态栏的专注时长统计（时间轴记录的总和）
            updateTodayFocusTime();
            
            const tasksCompletedElement = document.getElementById('tasks-completed-value');
            tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) + 1;
            
            updateFocusStreak();
        }
        
        // 更新今日专注时长统计（从时间轴记录中累加）
        function updateTodayFocusTime() {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
            
            let records = JSON.parse(localStorage.getItem('focusRecords') || '[]');
            let todayTotalSeconds = 0;
            
            records.forEach(record => {
                if (record.date === todayStr) {
                    todayTotalSeconds += record.durationSeconds;
                }
            });
            
            const hours = Math.floor(todayTotalSeconds / 3600);
            const minutes = Math.floor((todayTotalSeconds % 3600) / 60);
            const seconds = todayTotalSeconds % 60;
            
            const todayTimeElement = document.getElementById('today-time-value');
            if (hours > 0) {
                todayTimeElement.textContent = `${hours}:${minutes.toString().padStart(2, '0')}`;
            } else {
                todayTimeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
        
        // 更新热力图数据
        function updateHeatmapData(dateStr, durationSeconds) {
            let heatmapData = JSON.parse(localStorage.getItem('heatmapData') || '{}');
            const date = dateStr;
            
            if (!heatmapData[date]) {
                heatmapData[date] = 0;
            }
            
            heatmapData[date] += durationSeconds / 3600;
            
            localStorage.setItem('heatmapData', JSON.stringify(heatmapData));
        }
        
        // 更新连续专注天数
        function updateFocusStreak() {
            const streakElement = document.getElementById('focus-streak-value');
            const currentStreak = parseInt(streakElement.textContent);
            
            if (Math.random() < 0.1) {
                streakElement.textContent = currentStreak + 1;
            }
        }
        
        // 显示通知
        function showNotification(message) {
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 80px;
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
                opacity: 0;
            `;
            
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.opacity = '1';
            }, 10);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);
            
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
        
        // 更新话语条
        function updateDialogue() {
            dialogueElement.classList.remove('entering');
            dialogueElement.classList.add('leaving');
            
            setTimeout(() => {
                // 获取当前可用的所有话语条
                let availableDialogues = [];
                
                // 如果专注未开始或没有角色，显示所有话语条
                if (!isRunning || !currentCharacterId) {
                    availableDialogues = dialogues;
                } else {
                    // 专注开始后，只显示全局和当前角色的话语条
                    availableDialogues = dialogues.filter(dialogue => 
                        dialogue.scope === 'global' || 
                        (dialogue.scope === 'character' && dialogue.characterId === currentCharacterId)
                    );
                }
                
                // 如果没有可用话语条，使用默认话语
                if (availableDialogues.length === 0) {
                    availableDialogues = defaultDialogues.map((text, index) => ({
                        id: `default-${index}`,
                        text: text,
                        scope: 'global',
                        characterId: null
                    }));
                }
                
                // 随机选择一个话语条
                const randomIndex = Math.floor(Math.random() * availableDialogues.length);
                dialogueElement.textContent = availableDialogues[randomIndex].text;
                
                dialogueElement.classList.remove('leaving');
                dialogueElement.classList.add('entering');
                
                currentDialogueIndex = (currentDialogueIndex + 1) % availableDialogues.length;
            }, 600);
        }
        
        // 生成当月热力图数据（7列n行） - 修复版，向右移动一个格子
function generateCurrentMonthHeatmap() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    document.getElementById('current-month').textContent = `${currentYear}年${monthNames[currentMonth]}`;
    
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    
    // 将星期天转换为7，星期一到星期六转换为1-6，这样周一=1，周日=7
    const firstWeekday = firstDayOfMonth === 0 ? 7 : firstDayOfMonth;
    
    const heatmapWeeks = document.getElementById('heatmap-weeks');
    heatmapWeeks.innerHTML = '';
    
    let heatmapData = JSON.parse(localStorage.getItem('heatmapData') || '{}');
    let monthTotalHours = 0;
    let daysWithData = 0;
    
    // 先在最左边添加一个空白列（向右移动一个格子）
    const emptyColumn = document.createElement('div');
    emptyColumn.className = 'heatmap-week';
    
    // 计算需要多少行（周数）
    const weeksInMonth = Math.ceil((firstWeekday - 1 + daysInMonth) / 7);
    
    // 为空白列添加格子
    for (let week = 0; week < weeksInMonth; week++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'heatmap-cell';
        emptyCell.style.visibility = 'hidden';
        emptyColumn.appendChild(emptyCell);
    }
    
    heatmapWeeks.appendChild(emptyColumn);
    
    // 创建7列（星期一至星期日）
    for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
        const weekColumn = document.createElement('div');
        weekColumn.className = 'heatmap-week';
        
        for (let week = 0; week < weeksInMonth; week++) {
            // 计算该格子对应的日期
            // 公式：格子索引 = 周数 * 7 + 星期几 - (第一个星期几 - 1)
            const cellIndex = week * 7 + dayOfWeek - (firstWeekday - 1);
            const dayOfMonth = cellIndex;
            
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            
            if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
                // 这个格子不在当月内，隐藏
                cell.style.visibility = 'hidden';
            } else {
                const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${dayOfMonth.toString().padStart(2, '0')}`;
                const hours = heatmapData[dateStr] || 0;
                
                let level = 0;
                if (hours > 0 && hours <= 1) level = 1;
                else if (hours > 1 && hours <= 2) level = 2;
                else if (hours > 2 && hours <= 3) level = 3;
                else if (hours > 3) level = 4;
                
                cell.setAttribute('data-level', level);
                
                // 转换星期几为中文
                let dayName = '';
                switch(dayOfWeek) {
                    case 1: dayName = '一'; break;
                    case 2: dayName = '二'; break;
                    case 3: dayName = '三'; break;
                    case 4: dayName = '四'; break;
                    case 5: dayName = '五'; break;
                    case 6: dayName = '六'; break;
                    case 7: dayName = '日'; break;
                }
                cell.title = `${currentMonth + 1}月${dayOfMonth}日（星期${dayName}）: ${hours.toFixed(1)}小时`;
                
                monthTotalHours += hours;
                if (hours > 0) daysWithData++;
            }
            
            weekColumn.appendChild(cell);
        }
        
        heatmapWeeks.appendChild(weekColumn);
    }
    
    const daysPassed = Math.min(now.getDate(), daysInMonth);
    const avgHours = monthTotalHours / (daysWithData || 1);
    
    document.getElementById('month-total-time').textContent = `${monthTotalHours.toFixed(1)}h`;
    document.getElementById('month-avg-time').textContent = `${avgHours.toFixed(1)}h`;
}
        
        // 生成专注记录时间轴
        function generateFocusRecords() {
            const timeline = document.getElementById('focus-timeline');
            timeline.innerHTML = '';
            
            let records = JSON.parse(localStorage.getItem('focusRecords') || '[]');
            
            if (records.length === 0) {
                timeline.innerHTML = '<div class="no-records">暂无专注记录，快去开始你的第一次专注吧！</div>';
                return;
            }
            
            records.forEach(record => {
                const recordItem = document.createElement('div');
                recordItem.className = 'record-item';
                
                const dateObj = new Date(record.date);
                const formattedDate = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
                
                recordItem.innerHTML = `
                    <div class="record-info">
                        <div class="record-date">${formattedDate}</div>
                        <div class="record-time">${record.startTime}</div>
                    </div>
                    <div class="record-duration-box">
                        <div class="record-duration">${record.duration}</div>
                    </div>
                `;
                
                timeline.appendChild(recordItem);
            });
        }
        
        // 事件监听
        timerMode.addEventListener('click', toggleTimerMode);
        startBtn.addEventListener('click', startTimer);
        pauseBtn.addEventListener('click', pauseTimer);
        resetBtn.addEventListener('click', resetTimer);
        
        timerContainer.addEventListener('click', showTimerControl);
        timerControlOverlay.addEventListener('click', hideTimerControl);
        
        pauseTimerBtn.addEventListener('click', function() {
            if (isRunning) {
                pauseTimer();
            } else {
                startTimer();
            }
        });
        
        stopTimerBtn.addEventListener('click', stopTimer);
        cancelTimerBtn.addEventListener('click', cancelTimer);
        
        modalClose.addEventListener('click', closeCountdownModal);
        modalCancel.addEventListener('click', closeCountdownModal);
        modalConfirm.addEventListener('click', confirmCountdownTime);
        
        circularTimer.addEventListener('click', () => {
            if (isCountdown && !isRunning) {
                openCountdownModal();
            }
        });
        
        menuButton.addEventListener('click', openMenu);
        menuClose.addEventListener('click', closeMenu);
        menuOverlay.addEventListener('click', (e) => {
            if (e.target === menuOverlay) {
                closeMenu();
            }
        });
        
        customNoiseBtn.addEventListener('click', openCustomNoiseModal);
        customNoiseCancel.addEventListener('click', closeCustomNoiseModal);
        customNoiseConfirm.addEventListener('click', () => {
            const activeTab = customNoiseModal.querySelector('.custom-input-tab.active').getAttribute('data-tab');
            
            if (activeTab === 'url') {
                const audioUrl = customNoiseInput.value.trim();
                const customName = noiseCustomName.value.trim();
                if (audioUrl) {
                    addCustomNoise(audioUrl, false, customName);
                }
            } else if (activeTab === 'file') {
                if (noiseFileInput.files.length > 0) {
                    const file = noiseFileInput.files[0];
                    const customName = noiseCustomName.value.trim();
                    addCustomNoise(file, true, customName);
                }
            }
        });
        
        addDialogueBtn.addEventListener('click', openCustomDialogueModal);
        customDialogueCancel.addEventListener('click', closeCustomDialogueModal);
        
        // 编辑话语条模态框事件
        if (cancelEditDialogueBtn) {
            cancelEditDialogueBtn.addEventListener('click', () => {
                editDialogueModal.classList.remove('active');
                currentEditingDialogueId = null;
            });
        }
        
        if (confirmEditDialogueBtn) {
            confirmEditDialogueBtn.addEventListener('click', () => {
                if (currentEditingDialogueId) {
                    const newText = editDialogueInput.value.trim();
                    if (newText) {
                        const dialogueIndex = dialogues.findIndex(d => d.id === currentEditingDialogueId);
                        if (dialogueIndex !== -1) {
                            dialogues[dialogueIndex].text = newText;
                            saveDialoguesToLocalStorage();
                            renderDialogueFolders();
                        }
                    }
                    editDialogueModal.classList.remove('active');
                    currentEditingDialogueId = null;
                }
            });
        }
        customDialogueConfirm.addEventListener('click', () => {
            const activeTab = customDialogueModal.querySelector('.custom-input-tab.active').getAttribute('data-tab');
            
            if (activeTab === 'global') {
                const text = globalDialogueInput.value.trim();
                if (text) {
                    // 按行分割
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    lines.forEach(line => {
                        addCustomDialogue(line, 'global', null);
                    });
                }
            } else if (activeTab === 'character') {
                const text = characterDialogueInput.value.trim();
                const selectedCharacterId = document.getElementById('selected-character').getAttribute('data-character-id');
                
                if (text && selectedCharacterId) {
                    // 按行分割
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    lines.forEach(line => {
                        addCustomDialogue(line, 'character', selectedCharacterId);
                    });
                } else if (!selectedCharacterId) {
                    alert('请先选择一个角色！');
                }
            }
            
            closeCustomDialogueModal();
        });
        
        (async () => {
            const db = ensureImageStorageDB();
            if (db && typeof db.init === 'function') {
                try {
                    await db.init();
                } catch (e) {}
            }
            updateTimerDisplay();
            await loadFromLocalStorage();
            loadTheme();
        })();
        
        // 恢复任务页功能
        const categoryHeaders = document.querySelectorAll('.category-header');
        const addTaskToggles = document.querySelectorAll('.add-task-toggle');
        
        categoryHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.add-task-toggle')) return;
                
                const category = header.getAttribute('data-category');
                const taskList = document.getElementById(`${category}-tasks`);
                const toggleIcon = header.querySelector('.toggle-icon i');
                
                taskList.classList.toggle('collapsed');
                
                if (taskList.classList.contains('collapsed')) {
                    toggleIcon.className = 'fas fa-chevron-down';
                } else {
                    toggleIcon.className = 'fas fa-chevron-up';
                }
            });
        });
        
        addTaskToggles.forEach(toggle => {
            const handleToggle = (e) => {
                e.stopPropagation();
                if (e.type === 'touchend') {
                    e.preventDefault();
                }
                
                const category = toggle.getAttribute('data-category');
                const taskForm = document.getElementById(`${category}-task-form`);
                
                taskForm.classList.toggle('active');
                
                const taskList = document.getElementById(`${category}-tasks`);
                const toggleIcon = toggle.parentElement.querySelector('.toggle-icon i');
                
                if (taskList.classList.contains('collapsed')) {
                    taskList.classList.remove('collapsed');
                    toggleIcon.className = 'fas fa-chevron-up';
                }
                
                if (taskForm.classList.contains('active')) {
                    const input = taskForm.querySelector('.task-input');
                    if (input) {
                        input.focus();
                        setTimeout(() => {
                            input.focus();
                        }, 100);
                    }
                }
            };

            toggle.addEventListener('click', handleToggle);
            toggle.addEventListener('touchend', handleToggle);
        });
        
        // 移动已完成任务到"已完成"列表
        function moveCompletedTask(checkbox) {
            const taskItem = checkbox.closest('.task-item');
            const taskText = taskItem.querySelector('.task-text').textContent;
            // 获取原始分类，如果没有则默认'today'
            const originalCategory = taskItem.dataset.originalCategory || 'today';
            const completedTasksList = document.getElementById('completed-tasks');
            
            const newCompletedItem = document.createElement('li');
            newCompletedItem.className = 'task-item';
            newCompletedItem.dataset.originalCategory = originalCategory; // 保持原始分类
            newCompletedItem.innerHTML = `
                <input type="checkbox" class="task-checkbox" checked>
                <span class="task-text task-completed">${taskText}</span>
            `;
            
            completedTasksList.appendChild(newCompletedItem);
            taskItem.remove();
            
            const newCheckbox = newCompletedItem.querySelector('.task-checkbox');
            
            // 使得点击整行也能触发
            newCompletedItem.style.cursor = 'pointer';
            newCompletedItem.addEventListener('click', function(e) {
                if (e.target !== newCheckbox) {
                    newCheckbox.checked = !newCheckbox.checked;
                    newCheckbox.dispatchEvent(new Event('change'));
                }
            });
            
            newCheckbox.addEventListener('change', function() {
                if (!this.checked) {
                    // 使用dataset获取原始分类
                    const category = newCompletedItem.dataset.originalCategory || 'today';
                    const originalList = document.getElementById(`${category}-tasks`);
                    
                    const newTaskItem = document.createElement('li');
                    newTaskItem.className = 'task-item';
                    newTaskItem.dataset.originalCategory = category;
                    newTaskItem.innerHTML = `
                        <input type="checkbox" class="task-checkbox">
                        <span class="task-text">${taskText}</span>
                    `;
                    
                    originalList.appendChild(newTaskItem);
                    newCompletedItem.remove();
                    
                    const newCheckbox = newTaskItem.querySelector('.task-checkbox');
                    newCheckbox.addEventListener('change', updateTaskCompletion);
                    
                    // 使得点击整行也能触发
                    newTaskItem.style.cursor = 'pointer';
                    newTaskItem.addEventListener('click', function(e) {
                        if (e.target !== newCheckbox) {
                            newCheckbox.checked = !newCheckbox.checked;
                            newCheckbox.dispatchEvent(new Event('change'));
                        }
                    });
                    
                    // 更新统计并保存
                    const tasksCompletedElement = document.getElementById('tasks-completed-value');
                    tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) - 1;
                    saveTasks();
                }
            });
            
            completedTasksList.classList.remove('collapsed');
            const completedHeader = document.querySelector('[data-category="completed"]');
            completedHeader.querySelector('.toggle-icon i').className = 'fas fa-chevron-up';
            
            saveTasks(); // 保存任务
        }
        
        function updateTaskCompletion(event) {
            const checkbox = event.target;
            const taskText = checkbox.nextElementSibling;
            
            if (checkbox.checked) {
                taskText.classList.add('task-completed');
                moveCompletedTask(checkbox);
                
                const tasksCompletedElement = document.getElementById('tasks-completed-value');
                tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) + 1;
            } else {
                taskText.classList.remove('task-completed');
                
                const tasksCompletedElement = document.getElementById('tasks-completed-value');
                tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) - 1;
                
                saveTasks(); // 保存任务
            }
        }
        
        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', updateTaskCompletion);
        });
        
        document.querySelectorAll('#completed-tasks .task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                if (!this.checked) {
                    const taskItem = this.closest('.task-item');
                    const taskText = taskItem.querySelector('.task-text').textContent;
                    
                    taskItem.remove();
                    
                    const todayTasksList = document.getElementById('today-tasks');
                    const newTaskItem = document.createElement('li');
                    newTaskItem.className = 'task-item';
                    newTaskItem.innerHTML = `
                        <input type="checkbox" class="task-checkbox">
                        <span class="task-text">${taskText}</span>
                    `;
                    
                    todayTasksList.appendChild(newTaskItem);
                    
                    const tasksCompletedElement = document.getElementById('tasks-completed-value');
                    tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) - 1;
                    
                    const newCheckbox = newTaskItem.querySelector('.task-checkbox');
                    newCheckbox.addEventListener('change', updateTaskCompletion);
                }
            });
        });
        
        document.querySelectorAll('.add-btn').forEach((btn, index) => {
            btn.addEventListener('click', function() {
                const input = this.parentElement.querySelector('.task-input');
                addTask(input, index);
            });
        });
        
        document.querySelectorAll('.task-input').forEach((input, index) => {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    addTask(this, index);
                }
            });
        });
        
        // 保存任务到本地存储
        function saveTasks() {
            const categories = ['today', 'week', 'month', 'longterm', 'completed'];
            const data = {};
            
            categories.forEach(category => {
                const list = document.getElementById(`${category}-tasks`);
                const tasks = [];
                list.querySelectorAll('.task-item').forEach(item => {
                    const text = item.querySelector('.task-text').textContent;
                    const isCompleted = item.querySelector('.task-checkbox').checked;
                    const originalCategory = item.dataset.originalCategory || 'today';
                    tasks.push({
                        text: text,
                        completed: isCompleted,
                        originalCategory: originalCategory
                    });
                });
                data[category] = tasks;
            });
            
            localStorage.setItem('userTasks', JSON.stringify(data));
        }

        // 从本地存储加载任务
        function loadTasks() {
            const saved = localStorage.getItem('userTasks');
            if (!saved) return;
            
            try {
                const data = JSON.parse(saved);
                const categories = ['today', 'week', 'month', 'longterm', 'completed'];
                let completedCount = 0;
                
                categories.forEach(category => {
                    const list = document.getElementById(`${category}-tasks`);
                    if (!list) return;
                    list.innerHTML = ''; // 清空现有列表
                    
                    if (data[category] && Array.isArray(data[category])) {
                        data[category].forEach(task => {
                            const li = document.createElement('li');
                            li.className = 'task-item';
                            li.dataset.originalCategory = task.originalCategory || 'today';
                            li.style.cursor = 'pointer';
                            
                            if (category === 'completed') {
                                li.innerHTML = `
                                    <input type="checkbox" class="task-checkbox" checked>
                                    <span class="task-text task-completed">${task.text}</span>
                                `;
                                completedCount++;
                                
                                const checkbox = li.querySelector('.task-checkbox');
                                checkbox.addEventListener('change', function() {
                                    if (!this.checked) {
                                        const originalCategory = li.dataset.originalCategory;
                                        const originalList = document.getElementById(`${originalCategory}-tasks`);
                                        
                                        const newTaskItem = document.createElement('li');
                                        newTaskItem.className = 'task-item';
                                        newTaskItem.dataset.originalCategory = originalCategory;
                                        newTaskItem.style.cursor = 'pointer';
                                        newTaskItem.innerHTML = `
                                            <input type="checkbox" class="task-checkbox">
                                            <span class="task-text">${task.text}</span>
                                        `;
                                        
                                        originalList.appendChild(newTaskItem);
                                        li.remove();
                                        
                                        const newCheckbox = newTaskItem.querySelector('.task-checkbox');
                                        newCheckbox.addEventListener('change', updateTaskCompletion);
                                        
                                        newTaskItem.addEventListener('click', function(e) {
                                            if (e.target !== newCheckbox) {
                                                newCheckbox.checked = !newCheckbox.checked;
                                                newCheckbox.dispatchEvent(new Event('change'));
                                            }
                                        });
                                        
                                        // 更新统计并保存
                                        const tasksCompletedElement = document.getElementById('tasks-completed-value');
                                        tasksCompletedElement.textContent = parseInt(tasksCompletedElement.textContent) - 1;
                                        saveTasks();
                                    }
                                });
                            } else {
                                li.innerHTML = `
                                    <input type="checkbox" class="task-checkbox">
                                    <span class="task-text">${task.text}</span>
                                `;
                                const checkbox = li.querySelector('.task-checkbox');
                                checkbox.addEventListener('change', updateTaskCompletion);
                            }
                            
                            // 绑定行点击事件
                            const checkbox = li.querySelector('.task-checkbox');
                            li.addEventListener('click', function(e) {
                                if (e.target !== checkbox) {
                                    checkbox.checked = !checkbox.checked;
                                    checkbox.dispatchEvent(new Event('change'));
                                }
                            });
                            
                            list.appendChild(li);
                        });
                        
                        if (category === 'completed' && data[category].length > 0) {
                            list.classList.remove('collapsed');
                            const completedHeader = document.querySelector('[data-category="completed"]');
                            if (completedHeader) {
                                completedHeader.querySelector('.toggle-icon i').className = 'fas fa-chevron-up';
                            }
                        }
                    }
                });
                
                // 更新已完成任务统计
                const tasksCompletedElement = document.getElementById('tasks-completed-value');
                if (tasksCompletedElement) {
                    tasksCompletedElement.textContent = completedCount;
                }
                
            } catch (e) {
                console.error('加载任务失败:', e);
            }
        }

        function addTask(input, categoryIndex) {
            const taskText = input.value.trim();
            if (taskText === '') return;
            
            const categoryIds = ['today', 'week', 'month', 'longterm'];
            const categoryId = categoryIds[categoryIndex];
            const taskList = document.getElementById(`${categoryId}-tasks`);
            
            const taskItem = document.createElement('li');
            taskItem.className = 'task-item';
            taskItem.dataset.originalCategory = categoryId; // 记录原始分类
            taskItem.innerHTML = `
                <input type="checkbox" class="task-checkbox">
                <span class="task-text">${taskText}</span>
            `;
            
            taskList.appendChild(taskItem);
            input.value = '';
            
            const taskForm = document.getElementById(`${categoryId}-task-form`);
            taskForm.classList.remove('active');
            
            const newCheckbox = taskItem.querySelector('.task-checkbox');
            newCheckbox.addEventListener('change', updateTaskCompletion);
            
            // 使得点击整行也能触发
            taskItem.style.cursor = 'pointer';
            taskItem.addEventListener('click', function(e) {
                if (e.target !== newCheckbox) {
                    newCheckbox.checked = !newCheckbox.checked;
                    newCheckbox.dispatchEvent(new Event('change'));
                }
            });
            
            saveTasks(); // 保存任务
        }
        
        // 进度页功能
        const viewSwitches = document.querySelectorAll('.view-switch');
        const progressViews = document.querySelectorAll('.progress-view');
        
        viewSwitches.forEach(switchBtn => {
            switchBtn.addEventListener('click', () => {
                const viewId = switchBtn.getAttribute('data-view');
                
                viewSwitches.forEach(btn => btn.classList.remove('active'));
                switchBtn.classList.add('active');
                
                progressViews.forEach(view => {
                    view.classList.remove('active');
                    if (view.id === `${viewId}-view`) {
                        view.classList.add('active');
                    }
                });
            });
        });
        
        // 初始化
        loadTasks(); // 加载任务
        generateCurrentMonthHeatmap();
        generateFocusRecords();
        
        // 更新今日专注时长统计
        updateTodayFocusTime();
        
        // 处理页面加载时的音频播放策略
        document.addEventListener('click', function initAudio() {
            document.removeEventListener('click', initAudio);
            
            const activeNoise = document.querySelector('.noise-option.active');
            if (activeNoise && activeNoise.getAttribute('data-noise') !== 'none') {
                const noiseId = activeNoise.getAttribute('data-noise-id');
                selectNoise(noiseId);
            }
        });

        // 监听点击事件并通知父页面，用于自动缩小全局播放器
        document.addEventListener('click', () => {
            window.parent.postMessage({ type: 'iframe_click' }, _getPostTargetOrigin());
        }, true);

        window.addEventListener('storage', (e) => {
            if (e && (e.key === 'wechatAppData' || e.key === 'wechatAppData_rev' || (e.key && e.key.indexOf('avatar_') === 0))) {
                refreshWechatCharacters();
            }
        });

        try {
            window.parent.postMessage({ type: 'app_ready', appId: 'zixishi' }, _getPostTargetOrigin());
        } catch (e) {
            console.error('Failed to send app_ready message:', e);
        }
