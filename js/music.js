function _getPostTargetOrigin() {
            const origin = window.location.origin;
            return origin && origin !== 'null' ? origin : '*';
        }

        function _isAllowedMessageOrigin(origin) {
            const expected = window.location.origin;
            if (!expected || expected === 'null') return true;
            return origin === expected;
        }

        const DEBUG = /(?:\?|&)debug(?:=1|=true)?(?:&|$)/i.test(String((window.location && window.location.search) || ''));
        function logDebug() {
            if (!DEBUG) return;
            try {
                if (window.console && typeof window.console.log === 'function') {
                    window.console.log.apply(window.console, arguments);
                }
            } catch (e) {}
        }

        window.addEventListener('message', (event) => {
            if (!_isAllowedMessageOrigin(event.origin)) return;
            if (event.data && event.data.type === 'wechatAppDataChanged') {
                updateUserAvatar();
                updateFriendAvatar();
                if (friendModal && friendModal.classList.contains('show')) {
                    renderFriendList();
                }
            }
            if (event.data && event.data.type === 'themeChanged') {
                currentTheme = event.data.theme;
                applyTheme();
            }
            if (event.data && event.data.type === 'app:pause') {
                setMinimalMode(true);
            }
            if (event.data && event.data.type === 'app:resume') {
                setMinimalMode(false);
            }
        });

        // ================= 数据库逻辑 (IndexedDB) =================
        const DB_NAME = 'MusicPlayerDB';
        const DB_VERSION = 1;
        const STORE_NAME = 'musicFiles';

        // Helper
        function _req(request) {
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        function _getStorageService() {
            try {
                if (window.parent && window.parent !== window && window.parent.Core && window.parent.Core.StorageService) {
                    return window.parent.Core.StorageService;
                }
            } catch (e) {}
            if (window.Core && window.Core.StorageService) return window.Core.StorageService;
            return null;
        }

        function _openDBNative(dbName, version, upgrade) {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(dbName, version);
                req.onupgradeneeded = () => {
                    try {
                        if (typeof upgrade === 'function') upgrade(req.result);
                    } catch (e) {
                        reject(e);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async function _transactionNative(dbName, storeNames, fn) {
            const db = await _openDBNative(dbName, DB_VERSION, (nextDb) => {
                if (dbName === DB_NAME && !nextDb.objectStoreNames.contains(STORE_NAME)) {
                    nextDb.createObjectStore(STORE_NAME);
                }
            });

            try {
                return await new Promise((resolve, reject) => {
                    const tx = db.transaction(storeNames, 'readwrite');
                    const done = new Promise((res, rej) => {
                        tx.oncomplete = () => res();
                        tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
                        tx.onerror = () => rej(tx.error || new Error('transaction error'));
                    });

                    let fnPromise;
                    try {
                        fnPromise = Promise.resolve(fn(tx));
                    } catch (e) {
                        try { tx.abort(); } catch (err) {}
                        reject(e);
                        return;
                    }

                    Promise.all([fnPromise, done])
                        .then(([result]) => resolve(result))
                        .catch((e) => reject(e));
                });
            } finally {
                try { db.close(); } catch (e) {}
            }
        }

        // 初始化数据库
        async function initDB() {
            const storageService = _getStorageService();
            if (storageService) {
                return storageService.openDB(DB_NAME, DB_VERSION, (db) => {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                });
            }
            return _openDBNative(DB_NAME, DB_VERSION, (db) => {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            });
        }

        async function _transaction(dbName, storeNames, fn) {
            const storageService = _getStorageService();
            if (storageService) {
                if (dbName === DB_NAME) {
                    await initDB();
                }
                return storageService.transaction(dbName, storeNames, fn);
            }

            await initDB();
            return _transactionNative(dbName, storeNames, fn);
        }

        // 保存文件到数据库
        async function saveFileToDB(id, file) {
            return _transaction(DB_NAME, [STORE_NAME], async (tx) => {
                const store = tx.objectStore(STORE_NAME);
                await _req(store.put(file, id));
            });
        }

        // 从数据库读取文件
        async function getFileFromDB(id) {
            return _transaction(DB_NAME, [STORE_NAME], async (tx) => {
                const store = tx.objectStore(STORE_NAME);
                return await _req(store.get(id));
            });
        }

        // 从数据库删除文件
        async function deleteFileFromDB(id) {
            return _transaction(DB_NAME, [STORE_NAME], async (tx) => {
                const store = tx.objectStore(STORE_NAME);
                await _req(store.delete(id));
            });
        }

        // DOM元素
        const audioPlayer = new Audio();
        audioPlayer.preload = 'metadata';
        audioPlayer.playsInline = true;
        audioPlayer.setAttribute('playsinline', '');
        audioPlayer.setAttribute('webkit-playsinline', '');
        audioPlayer.style.display = 'none';
        document.body.appendChild(audioPlayer);
        const pagesContainer = document.getElementById('pagesContainer');
        const navItems = document.querySelectorAll('.nav-item');
        
        // 播放器元素
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playPauseIcon = document.getElementById('playPauseIcon');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const mainBackBtn = document.getElementById('mainBackBtn');
        const progressBar = document.getElementById('progressBar');
        const progress = document.getElementById('progress');
        
        // 返回按钮事件
        function handleBack() {
             try {
                try {
                    if (typeof syncGlobalPlayerStatus === 'function') {
                        syncGlobalPlayerStatus();
                    }
                } catch (e) {}
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'closeApp', appId: 'music' }, _getPostTargetOrigin());
                    return;
                }
            } catch (err) {}
            try {
                if (history.length > 1) {
                    history.back();
                    return;
                }
            } catch (e) {}
            window.location.href = 'index.html';
        }

        if (mainBackBtn) {
            mainBackBtn.addEventListener('click', handleBack);
        }

        const currentTimeEl = document.getElementById('currentTime');
        const durationEl = document.getElementById('duration');
        const songTitle = document.getElementById('songTitle');
        const record = document.getElementById('record');
        const tonearm = document.getElementById('tonearm');
        const togetherLine = document.getElementById('togetherLine');
        const bgTurntable = document.getElementById('bgTurntable');
        const bgDisc = document.getElementById('bgDisc');
        const bgDiscTexture = document.getElementById('bgDiscTexture');
        const bgDiscInput = document.getElementById('bgDiscInput');
        const bgTonearm = document.getElementById('bgTonearm');
        const playerHeader = document.querySelector('#playerPage .player-header');

        function safeAddClass(el, className) {
            if (el && el.classList) el.classList.add(className);
        }

        function safeRemoveClass(el, className) {
            if (el && el.classList) el.classList.remove(className);
        }

        function enableKeyboardClick(el) {
            if (!el || !el.addEventListener) return;
            const tag = String(el.tagName || '').toUpperCase();
            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
            el.addEventListener('keydown', (e) => {
                const key = e && e.key;
                if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    el.click();
                }
            });
        }

        function initA11y() {
            [
                mainBackBtn,
                themeToggleBtn,
                moreOptionsBtn,
                leftAvatar,
                rightAvatar
            ].forEach(enableKeyboardClick);

            document.querySelectorAll('.tab, .add-menu-option, .more-options-item, .move-modal-close').forEach(enableKeyboardClick);
        }

        // ================= 极简渲染模式 =================
        let isMinimalMode = false;
        let animationElements = [];

        function initMinimalMode() {
            const bgDisc = document.getElementById('bgDisc');
            const bgTonearm = document.getElementById('bgTonearm');
            const record = document.getElementById('record');
            if (bgDisc) animationElements.push(bgDisc);
            if (bgTonearm) animationElements.push(bgTonearm);
            if (record) animationElements.push(record);
        }

        function setMinimalMode(enable) {
            if (isMinimalMode === enable) return;
            isMinimalMode = enable;
            animationElements.forEach(el => {
                if (enable) {
                    el.dataset.originalAnimation = el.style.animation;
                    el.style.animation = 'none';
                } else {
                    el.style.animation = el.dataset.originalAnimation || '';
                }
            });
        }

        function handleVisibilityChange() {
            setMinimalMode(!document.hidden);
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
            initMinimalMode();
            handleVisibilityChange();
        }

        // 使用BlobUrlService统一管理Blob URL
        const GROUP_ID = 'music'; // 音乐页面的分组ID

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

        // 安全释放 Blob URL（使用BlobUrlService）
        function safeRevoke(url) {
            if (!url) return;
            const blobUrlService = getBlobUrlService();
            if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                blobUrlService.revoke(url);
            } else {
                try { URL.revokeObjectURL(url); } catch (e) {}
            }
        }

        const BG_DISC_TEXTURE_KEY = 'music_bg_disc_texture';
        const BG_DISC_DB_ID = 'bg_disc_texture_blob';

        function ensureImageStorageDB() {
            const storageService = _getStorageService();
            if (!storageService) {
                return {
                    init: async () => null,
                    get: async () => null,
                    getAppData: async () => null
                };
            }
            return {
                init: async () => {
                    return storageService.openDB('PhoneAppImages', 5);
                },
                get: async (id) => {
                    return storageService.transaction('PhoneAppImages', ['images'], async (tx) => {
                        const store = tx.objectStore('images');
                        const res = await _req(store.get(id));
                        return res ? res.data : null;
                    });
                },
                 getAppData: async (key) => {
                    return storageService.transaction('PhoneAppImages', ['appData'], async (tx) => {
                        const store = tx.objectStore('appData');
                        const res = await _req(store.get(key));
                        return res ? res.value : null;
                    });
                }
            };
        }

        async function resolveIdbSrc(src) {
            logDebug('[resolveIdbSrc] 开始解析, src:', src);
            if (!src || typeof src !== 'string' || !src.startsWith('idb:')) {
                logDebug('[resolveIdbSrc] 不是idb引用，直接返回:', src);
                return src;
            }
            const id = src.slice(4);
            if (!id) {
                logDebug('[resolveIdbSrc] id为空，返回空字符串');
                return '';
            }

            try {
                logDebug('[resolveIdbSrc] 从IndexedDB获取数据, id:', id);
                const db = ensureImageStorageDB();
                const data = await db.get(id);
                logDebug('[resolveIdbSrc] IndexedDB返回数据类型:', typeof data, '是否为对象:', data && typeof data === 'object');
                
                if (!data) {
                    logDebug('[resolveIdbSrc] 数据为空，返回空字符串');
                    return '';
                }
                
                const blobUrlService = getBlobUrlService();
                
                if (data && typeof data === 'object' && typeof data.arrayBuffer === 'function') {
                    logDebug('[resolveIdbSrc] 创建blob URL');
                    // 使用BlobUrlService统一管理Blob URL
                    if (blobUrlService && typeof blobUrlService.toDisplayUrl === 'function') {
                        const url = await blobUrlService.toDisplayUrl(data, { 
                            preferDataUrlInFileProtocol: true,
                            groupId: GROUP_ID 
                        });
                        logDebug('[resolveIdbSrc] blob URL创建成功（通过BlobUrlService）:', url);
                        return url;
                    }
                    // 降级：直接创建URL
                    if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                        const url = blobUrlService.createObjectUrl(data, { groupId: GROUP_ID });
                        logDebug('[resolveIdbSrc] blob URL创建成功（降级）:', url);
                        return url;
                    }
                    const url = URL.createObjectURL(data);
                    logDebug('[resolveIdbSrc] blob URL创建成功（降级）:', url);
                    return url;
                }
                logDebug('[resolveIdbSrc] 直接返回数据:', data);
                return data;
            } catch (e) {
                console.error('[resolveIdbSrc] 解析失败:', e);
                return '';
            }
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

        function getIdbRef(input) {
            const v = normalizePlainSrc(String(input || '').trim());
            if (!v) return '';
            if (v.startsWith('idb:')) return v;
            const m = v.match(/idb:[^\s"')]+/i);
            return m ? String(m[0]).trim() : '';
        }
        
        // 歌单元素
        const tabs = document.querySelectorAll('.tab');
        const playlistContents = document.querySelectorAll('.playlist-content');
        const addBtn = document.getElementById('addBtn');
        const editBtn = document.getElementById('editBtn');
        const bulkActions = document.getElementById('bulkActions');
        const bulkMoveBtn = document.getElementById('bulkMoveBtn');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        const playlistPage = document.getElementById('playlistPage');
        
        // 添加菜单元素
        const addMenu = document.getElementById('addMenu');
        const addSongsOption = document.getElementById('addSongsOption');
        const addCollectionOption = document.getElementById('addCollectionOption');
        const closeAddMenu = document.getElementById('closeAddMenu');
        
        // 添加歌曲页面元素
        const addSongsPage = document.getElementById('addSongsPage');
        const backFromAddSongs = document.getElementById('backFromAddSongs');
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const urlInput = document.getElementById('urlInput');
        const loadUrlBtn = document.getElementById('loadUrlBtn');
        const collectionSelectList = document.getElementById('collectionSelectList');
        
        // 合集详情浮窗元素
        const collectionDetailModal = document.getElementById('collectionDetailModal');
        const collectionDetailTitle = document.getElementById('collectionDetailTitle');
        const collectionDetailSongs = document.getElementById('collectionDetailSongs');
        const collectionDetailClose = document.getElementById('collectionDetailClose');
        const playCollectionBtn = document.getElementById('playCollectionBtn');
        
        // 添加合集模态框元素
        const addCollectionModal = document.getElementById('addCollectionModal');
        const collectionNameInput = document.getElementById('collectionNameInput');
        const cancelAddCollection = document.getElementById('cancelAddCollection');
        const confirmAddCollection = document.getElementById('confirmAddCollection');
        
        // 主题相关元素
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        const moreOptionsBtn = document.getElementById('moreOptionsBtn');
        
        // 提示框
        const toast = document.getElementById('toast');

        // 长按编辑菜单相关 DOM
        const editMenu = document.getElementById('editMenu');
        const moveOption = document.getElementById('moveOption');
        const deleteOption = document.getElementById('deleteOption');
        const cancelEdit = document.getElementById('cancelEdit');
        const moveModal = document.getElementById('moveModal');
        const moveCollectionList = document.getElementById('moveCollectionList');
        const closeMoveModal = document.getElementById('closeMoveModal');

        // 更多选项菜单相关 DOM
        const moreOptionsMenu = document.getElementById('moreOptionsMenu');
        const customBgOption = document.getElementById('customBgOption');
        const playbackSettingsOption = document.getElementById('playbackSettingsOption');
        const floatingPlayerOption = document.getElementById('floatingPlayerOption');
        const floatingPlayerCheckbox = document.getElementById('floatingPlayerCheckbox');
        const storageOption = document.getElementById('storageOption');
        
        const customBgInput = document.getElementById('customBgInput');
        const customBgImage = document.getElementById('customBgImage');
        
        // 背景设置相关 DOM
        const bgSettingsModal = document.getElementById('bgSettingsModal');
        const bgPreviewImage = document.getElementById('bgPreviewImage');
        const bgPreviewEmpty = document.getElementById('bgPreviewEmpty');
        const selectBgBtn = document.getElementById('selectBgBtn');
        const blurSlider = document.getElementById('blurSlider');
        const blurValue = document.getElementById('blurValue');
        const cancelBgSettings = document.getElementById('cancelBgSettings');
        const saveBgSettings = document.getElementById('saveBgSettings');
        
        let tempBgBlob = null;
        let bgPreviewObjectUrl = null;
        let bgObjectUrl = null;
        
        const playbackModal = document.getElementById('playbackModal');
        const modeSequence = document.getElementById('modeSequence');
        const modeLoop = document.getElementById('modeLoop');
        const modeShuffle = document.getElementById('modeShuffle');
        
        const collectionEditMenu = document.getElementById('collectionEditMenu');
        const renameCollectionOption = document.getElementById('renameCollectionOption');
        const deleteCollectionOption = document.getElementById('deleteCollectionOption');
        const cancelCollectionEdit = document.getElementById('cancelCollectionEdit');
        
        const storageModal = document.getElementById('storageModal');
        const storageSizeDisplay = document.getElementById('storageSizeDisplay');
        const closeStorageModal = document.getElementById('closeStorageModal');

        // 一起听头像相关元素
        const leftAvatar = document.getElementById('leftAvatar');
        const rightAvatar = document.getElementById('rightAvatar');
        const togetherContainer = document.getElementById('togetherContainer');
        const friendModal = document.getElementById('friendModal');
        const friendListEl = document.getElementById('friendList');
        const closeFriendModal = document.getElementById('closeFriendModal');

        logDebug('[初始化] leftAvatar元素:', leftAvatar);
        logDebug('[初始化] rightAvatar元素:', rightAvatar);
        logDebug('[初始化] togetherContainer元素:', togetherContainer);

        // 一起听状态
        let selectedFriendId = localStorage.getItem('music_selected_friend_id') || null;
        let wechatCache = null;
        
        // 播放列表和当前索引
        let playlist = []; // 默认播放列表（所有歌曲）
        let currentSongIndex = 0;
        let currentPage = 0;
        
        // 合集数据
        let collections = [];
        
        // 当前播放模式
        let currentPlayMode = 'default'; // 'default' 或 'collection'
        let currentCollectionId = null; // 当前播放的合集ID
        let currentCollectionSongs = []; // 当前合集中的歌曲
        
        // 当前播放的歌曲ID
        let currentPlayingSongId = null;
        
        // 正在编辑的歌曲ID
        let editingSongId = null;
        let editingCollectionId = null; // 正在编辑的合集ID
        let longPressTimer = null;
        let isBulkEditing = false;
        let bulkSelectedSongIds = new Set();
        let selectedAddCollectionId = null;
        let moveTargetSongIds = [];
        
        // 播放顺序模式
        let playbackOrder = localStorage.getItem('music_playback_order') || 'sequence'; // sequence, loop, shuffle
        
        // 自定义背景
        const CUSTOM_BG_DB_ID = 'custom_bg_blob';
        
        // 悬浮播放器开关
        let floatingPlayerEnabled = localStorage.getItem('music_floating_player_enabled') !== 'false';
        
        // 触摸滑动相关变量
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        const minSwipeDistance = 50; // 最小滑动距离
        
        // 主题相关变量
        let currentTheme = localStorage.getItem('theme') || 'dark'; // 'dark', 'light'
        const THEME_KEY = 'theme'; // 统一使用全局 theme key
        const PLAYLIST_KEY = 'musicPlayerPlaylist';
        const COLLECTIONS_KEY = 'musicPlayerCollections';
        const LEGACY_SAMPLE_MP3_URLS = [
            'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3',
            'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/master/sample.mp3'
        ];
        const DEFAULT_SAMPLE_MP3_URL = 'https://cdn.jsdelivr.net/gh/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3';

        // 全局播放器同步相关变量
        let lastPauseSource = 'app'; // 'app' 或 'global'
        let lastCommandId = null;
        let hasStartedPlayback = localStorage.getItem('global_music_has_started') === '1';

        // 更新 MediaSession (系统媒体控制)
        function updateMediaSession() {
            if ('mediaSession' in navigator) {
                const currentSong = playlist.find(s => s.id === currentPlayingSongId);
                if (currentSong) {
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: currentSong.title,
                        artist: '手机音乐',
                        album: '我的歌单',
                        artwork: [
                            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                        ]
                    });
                }

                // 设置操作处理程序
                navigator.mediaSession.setActionHandler('play', () => {
                    lastPauseSource = 'global';
                    safePlay();
                    syncGlobalPlayerStatus();
                });
                navigator.mediaSession.setActionHandler('pause', () => {
                    lastPauseSource = 'global';
                    audioPlayer.pause();
                    syncGlobalPlayerStatus();
                });
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    lastPauseSource = 'global';
                    playPrev();
                    syncGlobalPlayerStatus();
                });
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    lastPauseSource = 'global';
                    playNext();
                    syncGlobalPlayerStatus();
                });
            }
        }

        // 保存音乐数据到 localStorage
        function saveMusicData() {
            // 过滤掉 blob: 链接，因为它们在刷新后会失效
            // 但为了保持列表完整性，我们可以选择保留它们，只是刷新后无法播放
            // 这里我们选择全部保存，用户刷新后如果发现无法播放是正常现象（因为是临时URL）
            localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
            localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
        }

        // 计算 IndexedDB 占用空间
        async function calculateStorageSize() {
            let totalBytes = 0;
            try {
                await _transaction(DB_NAME, [STORE_NAME], async (tx) => {
                    const store = tx.objectStore(STORE_NAME);
                    const files = await _req(store.getAll());
                    for (const file of files || []) {
                        if (file && typeof file.size === 'number') totalBytes += file.size;
                    }
                });
            } catch (e) {
                return "0.00 MB";
            }

            const mb = totalBytes / (1024 * 1024);
            return mb.toFixed(2) + " MB";
        }

        // 显示存储空间弹窗
        async function showStorageModal() {
            moreOptionsMenu.classList.remove('show');
            showToast("正在计算已用空间...");
            try {
                const size = await calculateStorageSize();
                storageSizeDisplay.textContent = size;
                storageModal.classList.add('show');
            } catch (e) {
                console.error("获取空间信息失败:", e);
                showToast("获取空间信息失败");
            }
        }

        // 加载音乐数据
        function loadMusicData() {
            const savedPlaylist = localStorage.getItem(PLAYLIST_KEY);
            const savedCollections = localStorage.getItem(COLLECTIONS_KEY);
            
            let needSave = false;
            if (savedPlaylist) {
                try {
                    playlist = JSON.parse(savedPlaylist);
                } catch (e) {
                    console.error("解析播放列表失败:", e);
                    playlist = [];
                }
            }
            
            if (savedCollections) {
                try {
                    collections = JSON.parse(savedCollections);
                } catch (e) {
                    console.error("解析合集失败:", e);
                    collections = [];
                }
            }

            if (Array.isArray(playlist)) {
                playlist = playlist.map(song => {
                    if (!song || typeof song !== 'object') return song;
                    if (typeof song.src !== 'string') return song;
                    if (!LEGACY_SAMPLE_MP3_URLS.includes(song.src)) return song;
                    needSave = true;
                    return { ...song, src: DEFAULT_SAMPLE_MP3_URL };
                });
            }

            if (needSave) {
                saveMusicData();
            }
        }
        
        // ================= 一起听头像逻辑 =================
        
        // 初始化头像
        function initAvatars() {
            updateUserAvatar();
            updateFriendAvatar();
            
            // 点击右侧头像（用户自己）- 这里可以跳转到传讯页修改头像，或者直接提示
            rightAvatar.addEventListener('click', () => {
                showToast("在“传讯”中点击个人头像可修改");
            });
            
            // 点击左侧头像（好友）- 弹出选择框
            leftAvatar.addEventListener('click', () => {
                openFriendModal();
            });
            
            // 关闭模态框
            closeFriendModal.addEventListener('click', () => {
                friendModal.classList.remove('show');
            });
            
            // 点击模态框背景关闭
            friendModal.addEventListener('click', (e) => {
                if (e.target === friendModal) {
                    friendModal.classList.remove('show');
                }
            });
            
            // 监听 localStorage 变化
            window.addEventListener('storage', (e) => {
                if (e.key === 'wechatAppData' || e.key === 'wechatAppData_rev' || e.key === 'user_avatar' || (e.key && e.key.startsWith('avatar_'))) {
                    updateUserAvatar();
                    updateFriendAvatar();
                    if (friendModal.classList.contains('show')) {
                        renderFriendList();
                    }
                }
            });
        }

        function setElementImageFromStore(element, storedValue, fallbackText = '') {
            if (!element) return;
            const normalized = String(storedValue || '').trim();

            const blobUrlService = getBlobUrlService();
            const prevUrl = element.dataset ? element.dataset.tempObjectUrl : '';
            if (prevUrl) {
                if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                    blobUrlService.revoke(prevUrl);
                } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    try { URL.revokeObjectURL(prevUrl); } catch (e) {}
                }
            }
            if (element.dataset) delete element.dataset.tempObjectUrl;

            while (element.firstChild) element.removeChild(element.firstChild);
            element.style.backgroundImage = '';

            const applyText = () => {
                element.classList.remove('has-custom');
                if (fallbackText) element.innerHTML = `<span>${fallbackText}</span>`;
            };

            const applyImg = (src, isTemp) => {
                const img = document.createElement('img');
                img.alt = 'Avatar';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';
                img.style.borderRadius = '50%';
                img.style.display = 'block';
                img.style.pointerEvents = 'none';
                img.onerror = () => {
                    applyText();
                };
                img.src = src;
                element.appendChild(img);
                element.classList.add('has-custom');
                if (isTemp && element.dataset) element.dataset.tempObjectUrl = src;
            };

            if (!normalized) {
                applyText();
                return;
            }

            const plain = normalized;
            if (plain.indexOf('idb:') === 0) {
                const idbId = plain.slice(4).trim();
                const db = ensureImageStorageDB();
                if (!db || typeof db.get !== 'function') {
                    applyText();
                    return;
                }
                db.get(idbId).then(data => {
                    if (!data) { applyText(); return; }
                    if (typeof data === 'string') {
                        if (data.indexOf('idb:') === 0) { applyText(); return; }
                        applyImg(data, false);
                    } else {
                        let url;
                        if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                            url = blobUrlService.createObjectUrl(data, { groupId: GROUP_ID });
                        } else {
                            url = URL.createObjectURL(data);
                        }
                        applyImg(url, true);
                    }
                }).catch(() => applyText());
            } else {
                applyImg(plain, false);
            }
        }

        async function updateUserAvatar() {

            let appData = null;
            try {
                const db = ensureImageStorageDB();
                if (db && db.getAppData) {
                    appData = await db.getAppData('wechatAppData');
                }
            } catch (e) { console.error(e); }

            if (!appData) {
                // 尝试从StorageService获取合并后的wechatAppData（分库后）
                if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.getAppData === 'function') {
                    try {
                        appData = await window.Core.StorageService.getAppData('wechatAppData');
                        console.log('[updateUserAvatar] 从StorageService获取到分库数据');
                    } catch (e) {
                        console.warn('[updateUserAvatar] StorageService获取失败:', e);
                    }
                }
            }

            if (!appData) {
                const savedData = localStorage.getItem('wechatAppData');
                if (savedData) {
                    try {
                        appData = JSON.parse(savedData);
                    } catch (e) {}
                }
            }
            
            if (!appData) return;
            wechatCache = appData;

            try {
                const user = appData.currentUser;
                if (!user) return;

                rightAvatar.className = 'avatar right-avatar';
                // 如果没有自定义头像，添加颜色类
                if (!user.hasCustomAvatar) {
                     rightAvatar.classList.add(user.avatarColor || 'bg-sage');
                } else {
                    // 有自定义头像时，移除颜色类，避免背景色透出
                    rightAvatar.classList.remove('bg-sage', 'bg-blue', 'bg-green', 'bg-yellow', 'bg-red', 'bg-purple');
                    // 如果有具体的颜色类，也尝试移除（或者保留作为加载底色？）
                    // 这里简单处理：如果 setElementImageFromStore 设置了图片，背景色会被覆盖（因为是 background-image）
                    // 但如果图片是透明的（不太可能），背景色会显示。
                    // 为了保险，还是保留颜色类作为 fallback 样式的一部分，但 setElementImageFromStore 会覆盖 innerHTML
                }
                
                const fallback = user.name ? user.name.charAt(0) : '我';
                const avatarData = user.hasCustomAvatar ? localStorage.getItem('user_avatar') : null;
                
                setElementImageFromStore(rightAvatar, avatarData, fallback);

            } catch (e) {
                console.error('更新用户头像失败:', e);
            }
        }

        // 更新好友头像（左侧）
        async function updateFriendAvatar() {
            if (!selectedFriendId) {
                leftAvatar.innerHTML = '<i class="fas fa-user"></i>';
                const blobUrlService = getBlobUrlService();
                const prevAvatarUrl = leftAvatar.dataset ? leftAvatar.dataset.tempObjectUrl : '';
                if (prevAvatarUrl) {
                    if (blobUrlService && typeof blobUrlService.revoke === 'function') {
                        blobUrlService.revoke(prevAvatarUrl);
                    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                        try { URL.revokeObjectURL(prevAvatarUrl); } catch (e) {}
                    }
                }
                if (leftAvatar.dataset) delete leftAvatar.dataset.tempObjectUrl;

                leftAvatar.className = 'avatar left-avatar';
                leftAvatar.style.backgroundImage = '';
                // 确保移除所有颜色类
                leftAvatar.classList.remove('bg-sage', 'bg-blue', 'bg-green', 'bg-yellow', 'bg-red', 'bg-purple');
                return;
            }

            let appData = null;
            try {
                const db = ensureImageStorageDB();
                if (db && db.getAppData) {
                    appData = await db.getAppData('wechatAppData');
                }
            } catch (e) {}

            if (!appData) {
                // 尝试从StorageService获取合并后的wechatAppData（分库后）
                if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.getAppData === 'function') {
                    try {
                        appData = await window.Core.StorageService.getAppData('wechatAppData');
                        console.log('[updateFriendAvatar] 从StorageService获取到分库数据');
                    } catch (e) {
                        console.warn('[updateFriendAvatar] StorageService获取失败:', e);
                    }
                }
            }

            if (!appData) {
                const savedData = localStorage.getItem('wechatAppData');
                if (savedData) {
                    try {
                        appData = JSON.parse(savedData);
                    } catch (e) {}
                }
            }
            
            if (!appData) {
                return;
            }
            wechatCache = appData;

            try {
                const contacts = appData.contacts || appData.friends || [];
                const friend = contacts.find(c => String(c.id) === String(selectedFriendId));
                
                if (!friend) {
                    selectedFriendId = null;
                    localStorage.removeItem('music_selected_friend_id');
                    updateFriendAvatar();
                    syncGlobalPlayerStatus();
                    return;
                }

                leftAvatar.className = 'avatar left-avatar';
                // 如果没有自定义头像，添加颜色类
                if (!friend.hasCustomAvatar) {
                     leftAvatar.classList.add(friend.avatarColor || 'bg-sage');
                } else {
                    leftAvatar.classList.remove('bg-sage', 'bg-blue', 'bg-green', 'bg-yellow', 'bg-red', 'bg-purple');
                }

                const fallback = friend.name ? friend.name.charAt(0) : '?';
                const storedAvatar = friend.hasCustomAvatar ? localStorage.getItem(`avatar_${friend.id}`) : null;
                let avatarData = storedAvatar;
                if (friend.hasCustomAvatar) {
                    const trimmed = String(storedAvatar || '').trim();
                    if (!trimmed || trimmed === '[object Blob]' || trimmed.indexOf('blob:') === 0) {
                        avatarData = `idb:avatar_${friend.id}`;
                    }
                }
                const resolveFallback = () => {
                    leftAvatar.innerHTML = '';
                    leftAvatar.className = 'avatar left-avatar';
                    leftAvatar.classList.add(friend.avatarColor || 'bg-sage');
                    leftAvatar.innerHTML = `<span>${friend.avatarText || (friend.name ? friend.name.charAt(0) : '?')}</span>`;
                };
                if (avatarData && typeof avatarData === 'string' && avatarData.trim().indexOf('idb:') === 0) {
                    const blobUrlService = getBlobUrlService();
                    const idbId = avatarData.trim().slice(4).trim();
                    const db = ensureImageStorageDB();
                    db.get(idbId).then(data => {
                        if (!data) { resolveFallback(); return; }
                        let src = '';
                        if (typeof data === 'string') {
                            if (data.indexOf('idb:') === 0) { resolveFallback(); return; }
                            src = data;
                        } else {
                            if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                                src = blobUrlService.createObjectUrl(data, { groupId: GROUP_ID });
                            } else {
                                src = URL.createObjectURL(data);
                            }
                            if (leftAvatar.dataset) leftAvatar.dataset.tempObjectUrl = src;
                        }
                        leftAvatar.className = 'avatar left-avatar has-custom';
                        leftAvatar.innerHTML = '';
                        const img = document.createElement('img');
                        img.alt = 'Avatar';
                        img.src = src;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.objectPosition = 'center';
                        img.style.borderRadius = '50%';
                        img.style.display = 'block';
                        img.style.pointerEvents = 'none';
                        leftAvatar.appendChild(img);
                    }).catch(() => resolveFallback());
                } else {
                    setElementImageFromStore(leftAvatar, avatarData, fallback);
                }

            } catch (e) {
                console.error('[音乐] 更新好友头像失败:', e);
            }
        }

        // 打开好友选择弹窗
        function openFriendModal() {
            renderFriendList();
            friendModal.classList.add('show');
        }

        // 渲染好友列表
        async function renderFriendList() {
            let appData = null;
            try {
                const db = ensureImageStorageDB();
                if (db && db.getAppData) {
                    appData = await db.getAppData('wechatAppData');
                }
            } catch (e) { console.error(e); }

            if (!appData) {
                // 尝试从StorageService获取合并后的wechatAppData（分库后）
                if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.getAppData === 'function') {
                    try {
                        appData = await window.Core.StorageService.getAppData('wechatAppData');
                        console.log('[renderFriendList] 从StorageService获取到分库数据');
                    } catch (e) {
                        console.warn('[renderFriendList] StorageService获取失败:', e);
                    }
                }
            }

            if (!appData) {
                const savedData = localStorage.getItem('wechatAppData');
                if (savedData) {
                    try {
                        appData = JSON.parse(savedData);
                    } catch (e) {}
                }
            }

            if (!appData) {
                friendListEl.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无好友数据</div>';
                return;
            }

            try {
                const contacts = appData.contacts || [];

                if (contacts.length === 0) {
                    friendListEl.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无好友，请先在“传讯”中添加</div>';
                    return;
                }

                friendListEl.innerHTML = '';
                contacts.forEach(contact => {
                    const item = document.createElement('div');
                    item.className = `friend-select-item ${selectedFriendId === contact.id ? 'selected' : ''}`;

                    const avatarWrap = document.createElement('div');
                    avatarWrap.className = 'friend-select-avatar';

                    const nameEl = document.createElement('div');
                    nameEl.className = 'friend-select-name';
                    nameEl.textContent = contact.name;

                    // 优化后的头像加载逻辑
                    const fallback = contact.avatarText || (contact.name ? contact.name.charAt(0) : '?');
                    const storedAvatar = contact.hasCustomAvatar ? localStorage.getItem(`avatar_${contact.id}`) : null;
                    let avatarData = storedAvatar;
                    if (contact.hasCustomAvatar) {
                        const trimmed = String(storedAvatar || '').trim();
                        if (!trimmed || trimmed === '[object Blob]' || trimmed.indexOf('blob:') === 0) {
                            avatarData = `idb:avatar_${contact.id}`;
                        }
                    }

                    if (!contact.hasCustomAvatar) {
                        avatarWrap.classList.add(contact.avatarColor || 'bg-sage');
                        avatarWrap.innerHTML = `<span>${fallback}</span>`;
                    } else {
                        setElementImageFromStore(avatarWrap, avatarData, fallback);
                    }

                    item.appendChild(avatarWrap);
                    item.appendChild(nameEl);

                    item.onclick = () => {
                        selectedFriendId = contact.id;
                        localStorage.setItem('music_selected_friend_id', selectedFriendId);
                        updateFriendAvatar();
                        syncGlobalPlayerStatus();
                        friendModal.classList.remove('show');
                        showToast(`已选择与 ${contact.name} 一起听`);
                    };

                    friendListEl.appendChild(item);
                });
            } catch (e) {
                console.error('渲染好友列表失败:', e);
            }
        }

        // ================= 歌曲编辑逻辑 =================
        
        // 处理长按
        function handleLongPress(songId) {
            editingSongId = songId;
            editMenu.classList.add('show');
        }

        // 绑定长按事件到歌曲项
        function bindLongPressEvents(element, idOrCallback) {
            const startHandler = (e) => {
                // 如果是右键点击（在电脑上），不触发长按（可选，这里统一用长按逻辑）
                if (e.type === 'mousedown' && e.button !== 0) return;
                if (isBulkEditing) return;
                
                longPressTimer = setTimeout(() => {
                    if (typeof idOrCallback === 'function') {
                        idOrCallback();
                    } else {
                        handleLongPress(idOrCallback);
                    }
                }, 600); // 600ms 触发长按
            };

            const cancelHandler = () => {
                clearTimeout(longPressTimer);
            };

            element.addEventListener('touchstart', startHandler, { passive: true });
            element.addEventListener('touchend', cancelHandler);
            element.addEventListener('touchmove', cancelHandler);
            
            element.addEventListener('mousedown', startHandler);
            element.addEventListener('mouseup', cancelHandler);
            element.addEventListener('mouseleave', cancelHandler);
        }

        // 初始化编辑菜单事件
        function initEditMenuEvents() {
            // 取消按钮
            cancelEdit.addEventListener('click', () => {
                editMenu.classList.remove('show');
            });

            // 点击菜单外自动取消
            editMenu.addEventListener('click', (e) => {
                if (e.target === editMenu) {
                    editMenu.classList.remove('show');
                }
            });

            // 删除选项
            deleteOption.addEventListener('click', () => {
                if (editingSongId) {
                    deleteSong(editingSongId);
                    editMenu.classList.remove('show');
                }
            });

            // 移动选项
            moveOption.addEventListener('click', () => {
                if (editingSongId) {
                    showMoveModal();
                    editMenu.classList.remove('show');
                }
            });

            // 关闭移动弹窗
            closeMoveModal.addEventListener('click', () => {
                moveModal.classList.remove('show');
            });

            // 点击移动弹窗背景关闭
            moveModal.addEventListener('click', (e) => {
                if (e.target === moveModal) {
                    moveModal.classList.remove('show');
                }
            });
        }

        // 删除歌曲
        async function deleteSong(songId) {
            // 从播放列表中移除
            const songIndex = playlist.findIndex(s => s.id === songId);
            if (songIndex === -1) return;

            const song = playlist[songIndex];
            const songTitleText = song.title;
            
            // 如果是存储在 IndexedDB 中的文件，也将其删除
            if (song.src && song.src.startsWith('indexeddb://')) {
                try {
                    await deleteFileFromDB(song.id);
                } catch (e) {
                    console.error("从数据库删除文件失败:", e);
                }
            }

            playlist.splice(songIndex, 1);

            // 从所有合集中移除该歌曲 ID
            collections.forEach(collection => {
                collection.songIds = collection.songIds.filter(id => id !== songId);
            });

            // 如果删除的是当前播放的歌曲，停止播放
            if (currentPlayingSongId === songId) {
                audioPlayer.pause();
                currentPlayingSongId = null;
                songTitle.textContent = "等待播放音乐";
                safeRemoveClass(record, 'playing');
                safeRemoveClass(tonearm, 'playing');
                updatePlayButton();
                updateTurntableLayout();
            }

            // 更新 UI
            updateSongList();
            updateCollectionsList();
            saveMusicData(); // 保存更改
            showToast(`已删除歌曲: ${songTitleText}`);
        }

        function setBulkEditingState(nextState) {
            isBulkEditing = nextState;
            if (playlistPage) {
                playlistPage.classList.toggle('bulk-editing', isBulkEditing);
            }
            if (bulkActions) {
                bulkActions.classList.toggle('show', isBulkEditing);
            }
            if (!isBulkEditing) {
                bulkSelectedSongIds.clear();
            }
            updateBulkActionsState();
            updateSongList();
        }

        function updateBulkActionsState() {
            const hasSelection = bulkSelectedSongIds.size > 0;
            if (bulkMoveBtn) bulkMoveBtn.disabled = !hasSelection;
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = !hasSelection;
        }

        function toggleBulkSelection(songId, checked) {
            if (checked) {
                bulkSelectedSongIds.add(songId);
            } else {
                bulkSelectedSongIds.delete(songId);
            }
            updateBulkActionsState();
        }

        async function deleteSongsBatch(songIds) {
            const ids = Array.isArray(songIds) ? songIds : [];
            if (ids.length === 0) return;
            const idSet = new Set(ids);
            const remaining = [];
            const removed = [];
            for (const song of playlist) {
                if (idSet.has(song.id)) {
                    removed.push(song);
                } else {
                    remaining.push(song);
                }
            }
            for (const song of removed) {
                if (song.src && song.src.startsWith('indexeddb://')) {
                    try {
                        await deleteFileFromDB(song.id);
                    } catch (e) {
                        console.error("从数据库删除文件失败:", e);
                    }
                }
            }
            playlist = remaining;
            collections.forEach(collection => {
                collection.songIds = collection.songIds.filter(id => !idSet.has(id));
            });
            if (currentPlayingSongId && idSet.has(currentPlayingSongId)) {
                audioPlayer.pause();
                currentPlayingSongId = null;
                songTitle.textContent = "等待播放音乐";
                safeRemoveClass(record, 'playing');
                safeRemoveClass(tonearm, 'playing');
                updatePlayButton();
                updateTurntableLayout();
            } else if (currentPlayingSongId) {
                const newIndex = playlist.findIndex(song => song.id === currentPlayingSongId);
                if (newIndex >= 0) currentSongIndex = newIndex;
            }
            updateSongList();
            updateCollectionsList();
            saveMusicData();
            showToast(`已删除 ${removed.length} 首歌曲`);
        }

        // 显示移动到合集弹窗
        function showMoveModal(targetSongIds) {
            const ids = Array.isArray(targetSongIds) ? targetSongIds.filter(Boolean) : (editingSongId ? [editingSongId] : []);
            moveTargetSongIds = ids;
            renderMoveCollectionList();
            moveModal.classList.add('show');
        }

        // 渲染移动合集列表
        function renderMoveCollectionList() {
            moveCollectionList.innerHTML = '';
            
            if (collections.length === 0) {
                moveCollectionList.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无合集，请先创建</div>';
                return;
            }

            const targetIds = moveTargetSongIds && moveTargetSongIds.length ? moveTargetSongIds : (editingSongId ? [editingSongId] : []);

            collections.forEach(collection => {
                const item = document.createElement('div');
                item.className = 'move-collection-item';
                
                const isInCollection = targetIds.length > 0 && targetIds.every(id => collection.songIds.includes(id));
                
                item.innerHTML = `
                    <span>${collection.name}</span>
                    ${isInCollection ? '<i class="fas fa-check" style="color: #4cd964;"></i>' : '<i class="fas fa-chevron-right"></i>'}
                `;

                item.onclick = () => {
                    moveSongsToCollection(targetIds, collection.id);
                };

                moveCollectionList.appendChild(item);
            });
        }

        // 删除合集
        function deleteCollection() {
            // 如果 editingCollectionId 不存在，尝试从 addCollectionModal 获取 (如果是在编辑弹窗中点击删除)
            // 但我们的 UI 设计是在长按菜单中点击删除，所以 editingCollectionId 应该是有值的
            
            if (!editingCollectionId) {
                console.error("未找到要删除的合集ID");
                return;
            }
            
            const collection = collections.find(c => c.id === editingCollectionId);
            if (!collection) {
                console.error("未找到合集数据", editingCollectionId);
                collectionEditMenu.classList.remove('show');
                return;
            }
            
            if (confirm(`确定要删除合集 "${collection.name}" 吗？`)) {
                // 执行删除
                collections = collections.filter(c => c.id !== editingCollectionId);
                
                // 如果当前正在播放该合集，需要处理
                if (currentPlayMode === 'collection' && currentCollectionId === editingCollectionId) {
                    // 停止播放或切换回默认模式
                    currentPlayMode = 'default';
                    currentCollectionId = null;
                    // 这里不强制停止播放，只是状态改变
                }
                
                updateCollectionsList();
                saveMusicData();
                showToast(`已删除合集: ${collection.name}`);
            }
            
            collectionEditMenu.classList.remove('show');
            editingCollectionId = null;
        }
        // 移动歌曲到合集
        function moveSongsToCollection(songIds, collectionId) {
            const collection = collections.find(c => c.id === collectionId);
            if (!collection) return;

            const ids = Array.isArray(songIds) ? songIds : [];
            let addedCount = 0;

            ids.forEach(songId => {
                const song = playlist.find(s => s.id === songId);
                if (!song) return;
                if (!collection.songIds.includes(songId)) {
                    collection.songIds.push(songId);
                    addedCount += 1;
                }
            });

            moveModal.classList.remove('show');
            updateSongList(); // 更新合集计数
            saveMusicData(); // 保存更改
            if (addedCount > 0) {
                showToast(`已将 ${addedCount} 首歌曲加入 "${collection.name}"`);
            } else {
                showToast(`所选歌曲已在 "${collection.name}" 中`);
            }
            if (isBulkEditing) {
                bulkSelectedSongIds.clear();
                updateBulkActionsState();
                updateSongList();
            }
        }

        // ================= 新增功能逻辑 =================
        
        // 更新页面模糊度
        function updatePageBlur(percent) {
            // 将 0-100 映射到 0-50px
            const px = (percent / 100) * 50;
            const playerPage = document.querySelector('.player-page');
            const playlistPage = document.querySelector('.playlist-page');
            
            if (playerPage) {
                playerPage.style.backdropFilter = `blur(${px}px)`;
                playerPage.style.webkitBackdropFilter = `blur(${px}px)`;
            }
            if (playlistPage) {
                playlistPage.style.backdropFilter = `blur(${px}px)`;
                playlistPage.style.webkitBackdropFilter = `blur(${px}px)`;
            }
        }

        async function openBgSettingsModal() {
            // 加载当前模糊度
            const savedBlur = localStorage.getItem('music_bg_blur') || '10';
            blurSlider.value = savedBlur;
            blurValue.textContent = savedBlur + '%';
            
            // 加载当前图片预览
            try {
                const blob = await getFileFromDB(CUSTOM_BG_DB_ID);
                if (blob) {
                    if (bgPreviewObjectUrl) {
                        safeRevoke(bgPreviewObjectUrl);
                        bgPreviewObjectUrl = null;
                    }
                    bgPreviewObjectUrl = URL.createObjectURL(blob);
                    bgPreviewImage.src = bgPreviewObjectUrl;
                    bgPreviewImage.onerror = () => {
                        bgPreviewImage.style.display = 'none';
                        bgPreviewEmpty.style.display = 'block';
                        showToast('图片无法加载，请换一张');
                    };
                    bgPreviewImage.style.display = 'block';
                    bgPreviewEmpty.style.display = 'none';
                } else {
                    bgPreviewImage.style.display = 'none';
                    bgPreviewEmpty.style.display = 'block';
                }
                tempBgBlob = null; // 重置临时图片
            } catch (e) {
                bgPreviewImage.style.display = 'none';
                bgPreviewEmpty.style.display = 'block';
            }
            
            bgSettingsModal.classList.add('show');
        }

        // 初始化自定义背景
        async function initCustomBackground() {
            try {
                let blob = await getFileFromDB(CUSTOM_BG_DB_ID);
                const savedBlur = localStorage.getItem('music_bg_blur') || '10';
                
                // 迁移逻辑: 如果 DB 没有，尝试从旧的 localStorage 设置中恢复
                if (!blob) {
                    const legacySettingsStr = localStorage.getItem('custom_bg_settings');
                    if (legacySettingsStr) {
                        try {
                            const settings = JSON.parse(legacySettingsStr);
                            if (settings && settings.image && settings.image.startsWith('data:image')) {
                                // 将 DataURL 转换为 Blob
                                const res = await fetch(settings.image);
                                blob = await res.blob();
                                // 保存到 DB
                                await saveFileToDB(CUSTOM_BG_DB_ID, blob);
                                logDebug('Migrated custom background to IndexedDB');
                                // 可选：删除旧数据
                                // localStorage.removeItem('custom_bg_settings');
                            }
                        } catch (e) {
                            console.error('Migration failed', e);
                        }
                    }
                }

                if (blob) {
                    if (bgObjectUrl) {
                        safeRevoke(bgObjectUrl);
                        bgObjectUrl = null;
                    }

                    // Inline fallback for file:// protocol
                    if (window.location.protocol === 'file:' && typeof FileReader !== 'undefined') {
                        const dataUrl = await new Promise((resolve) => {
                            try {
                                const r = new FileReader();
                                r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
                                r.onerror = () => resolve('');
                                r.readAsDataURL(blob);
                            } catch (e) {
                                resolve('');
                            }
                        });
                        if (dataUrl) {
                            bgObjectUrl = dataUrl;
                        } else {
                            bgObjectUrl = URL.createObjectURL(blob);
                        }
                    } else {
                        bgObjectUrl = URL.createObjectURL(blob);
                    }

                    customBgImage.src = bgObjectUrl;
                    customBgImage.onerror = () => {
                        customBgImage.classList.remove('show');
                        showToast('图片无法加载，请换一张');
                    };
                    customBgImage.classList.add('show');
                    updatePageBlur(savedBlur);
                }
            } catch (e) {
                console.error("加载自定义背景失败:", e);
            }
            
            // 点击菜单项打开设置浮窗
            customBgOption.addEventListener('click', () => {
                openBgSettingsModal();
                moreOptionsMenu.classList.remove('show');
            });

            // 选择图片按钮
            selectBgBtn.addEventListener('click', () => {
                customBgInput.click();
            });
            
            // 图片选择变动
            customBgInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const lowerName = (file.name || '').toLowerCase();
                const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
                if (isHeic) {
                    showToast('该图片格式不兼容，请选 JPG/PNG');
                    tempBgBlob = null;
                    customBgInput.value = '';
                    return;
                }
                
                tempBgBlob = file;
                if (bgPreviewObjectUrl) {
                    safeRevoke(bgPreviewObjectUrl);
                    bgPreviewObjectUrl = null;
                }
                
                // Inline fallback for file:// protocol
                if (window.location.protocol === 'file:' && typeof FileReader !== 'undefined') {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        bgPreviewObjectUrl = ev.target.result;
                        bgPreviewImage.src = bgPreviewObjectUrl;
                        bgPreviewImage.style.display = 'block';
                        bgPreviewEmpty.style.display = 'none';
                    };
                    reader.onerror = () => {
                        bgPreviewImage.style.display = 'none';
                        bgPreviewEmpty.style.display = 'block';
                        showToast('图片无法加载，请换一张');
                        tempBgBlob = null;
                    };
                    reader.readAsDataURL(file);
                } else {
                    bgPreviewObjectUrl = URL.createObjectURL(file);
                    bgPreviewImage.src = bgPreviewObjectUrl;
                    bgPreviewImage.onerror = () => {
                        bgPreviewImage.style.display = 'none';
                        bgPreviewEmpty.style.display = 'block';
                        showToast('图片无法加载，请换一张');
                        tempBgBlob = null;
                    };
                    bgPreviewImage.style.display = 'block';
                    bgPreviewEmpty.style.display = 'none';
                }
            });
            
            // 模糊度滑块变动
            blurSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                blurValue.textContent = val + '%';
                updatePageBlur(val);
            });
            
            // 取消按钮
            cancelBgSettings.addEventListener('click', () => {
                bgSettingsModal.classList.remove('show');
                tempBgBlob = null;
                customBgInput.value = '';
            });
            
            // 保存按钮
            saveBgSettings.addEventListener('click', async () => {
                const blur = blurSlider.value;
                
                try {
                    // 如果有新图片，保存图片
                    if (tempBgBlob) {
                        await saveFileToDB(CUSTOM_BG_DB_ID, tempBgBlob);
                        if (bgObjectUrl) {
                            safeRevoke(bgObjectUrl);
                            bgObjectUrl = null;
                        }
                        bgObjectUrl = URL.createObjectURL(tempBgBlob);
                        customBgImage.src = bgObjectUrl;
                        customBgImage.onerror = () => {
                            customBgImage.classList.remove('show');
                            showToast('图片无法加载，请换一张');
                        };
                        customBgImage.classList.add('show');
                    }
                    
                    // 保存并应用模糊度
                    localStorage.setItem('music_bg_blur', blur);
                    updatePageBlur(blur);
                    
                    showToast("背景设置已更新");
                    bgSettingsModal.classList.remove('show');
                } catch (err) {
                    showToast("保存失败");
                    console.error(err);
                }
            });
        }
        
        // 初始化播放顺序设置
        function initPlaybackSettings() {
            updatePlaybackOrderUI();
            
            modeSequence.addEventListener('click', () => setPlaybackOrder('sequence'));
            modeLoop.addEventListener('click', () => setPlaybackOrder('loop'));
            modeShuffle.addEventListener('click', () => setPlaybackOrder('shuffle'));
            
            playbackModal.addEventListener('click', (e) => {
                if (e.target === playbackModal) {
                    playbackModal.classList.remove('show');
                }
            });
        }
        
        function updatePlaybackOrderUI() {
            [modeSequence, modeLoop, modeShuffle].forEach(el => el.classList.remove('active'));
            if (playbackOrder === 'sequence') modeSequence.classList.add('active');
            if (playbackOrder === 'loop') modeLoop.classList.add('active');
            if (playbackOrder === 'shuffle') modeShuffle.classList.add('active');
        }
        
        function setPlaybackOrder(order) {
            playbackOrder = order;
            localStorage.setItem('music_playback_order', order);
            updatePlaybackOrderUI();
            
            let modeName = "顺序播放";
            if (order === 'loop') modeName = "单曲循环";
            if (order === 'shuffle') modeName = "随机播放";
            
            showToast(`已切换至: ${modeName}`);
            playbackModal.classList.remove('show');
        }
        
        // 初始化悬浮播放器设置
        function initFloatingPlayerSetting() {
            floatingPlayerCheckbox.checked = floatingPlayerEnabled;
            toggleFloatingPlayer(floatingPlayerCheckbox.checked, true);
            
            // 复选框变更事件
            floatingPlayerCheckbox.addEventListener('change', (e) => {
                toggleFloatingPlayer(e.target.checked);
            });
            
            // 整个选项点击事件 (修复点击文字无法切换的问题)
            floatingPlayerOption.addEventListener('click', (e) => {
                // 如果点击的是复选框本身，不需要额外处理，因为会触发 change 事件
                if (e.target !== floatingPlayerCheckbox && e.target !== floatingPlayerCheckbox.nextElementSibling) {
                    floatingPlayerCheckbox.checked = !floatingPlayerCheckbox.checked;
                    // 手动触发变更逻辑
                    toggleFloatingPlayer(floatingPlayerCheckbox.checked);
                }
            });
        }
        
        function toggleFloatingPlayer(enabled, silent = false) {
            floatingPlayerEnabled = enabled;
            localStorage.setItem('music_floating_player_enabled', enabled ? 'true' : 'false');
            if (!silent) {
                showToast(floatingPlayerEnabled ? "悬浮播放器已开启" : "悬浮播放器已关闭");
            }
            
            // 通知父页面
            if (window.parent) {
                window.parent.postMessage({
                    type: 'updateFloatingPlayer',
                    enabled: floatingPlayerEnabled
                }, _getPostTargetOrigin());
            }
        }
        
        // 合集编辑逻辑
        function handleCollectionLongPress(collectionId) {
            editingCollectionId = collectionId;
            collectionEditMenu.classList.add('show');
        }
        
        function initCollectionEditEvents() {
            cancelCollectionEdit.addEventListener('click', () => {
                collectionEditMenu.classList.remove('show');
            });
            
            collectionEditMenu.addEventListener('click', (e) => {
                if (e.target === collectionEditMenu) {
                    collectionEditMenu.classList.remove('show');
                }
            });
            
            renameCollectionOption.addEventListener('click', () => {
                if (editingCollectionId) {
                    renameCollection(editingCollectionId);
                    collectionEditMenu.classList.remove('show');
                }
            });
            
            deleteCollectionOption.addEventListener('click', () => {
                if (editingCollectionId) {
                    if (confirm("确定要删除这个合集吗？合集内的歌曲不会被删除。")) {
                        deleteCollection(editingCollectionId);
                    }
                    collectionEditMenu.classList.remove('show');
                }
            });
        }
        
        function renameCollection(id) {
            const collection = collections.find(c => c.id === id);
            if (!collection) return;
            
            const newName = prompt("请输入新合集名称:", collection.name);
            if (newName && newName.trim()) {
                collection.name = newName.trim();
                saveMusicData();
                updateCollectionsList();
                showToast("合集已重命名");
            }
        }
        
        function deleteCollection(id) {
            const index = collections.findIndex(c => c.id === id);
            if (index !== -1) {
                collections.splice(index, 1);
                saveMusicData();
                updateCollectionsList();
                showToast("合集已删除");
            }
        }

        // 初始化播放器
        async function initPlayer() {
            // 初始化头像逻辑
            initAvatars();

            await initBgDisc();
            
            // 初始化新功能
            initCustomBackground();
            initPlaybackSettings();
            initFloatingPlayerSetting();
            initCollectionEditEvents();
            
            // 初始化编辑菜单事件
            initEditMenuEvents();
            
            // 设置初始音量
            audioPlayer.volume = 0.7;

            // 检查运行环境
            if (window.location.protocol === 'file:') {
                console.warn("当前运行在 file:// 协议下，加载远程音频资源可能会受限。");
                setTimeout(() => {
                    showToast("建议通过 Web 服务器运行以获得最佳兼容性");
                }, 2000);
            }

            // 添加音频错误处理
            audioPlayer.addEventListener('error', function(e) {
                const error = audioPlayer.error;
                const currentSrc = audioPlayer.src;
                console.error(`音频加载错误 [${currentSrc}]:`, e);

                const isLegacySample = LEGACY_SAMPLE_MP3_URLS.includes(currentSrc) || (currentSrc.indexOf('raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/') >= 0 && currentSrc.indexOf('sample.mp3') >= 0);
                if (!audioPlayer.dataset.legacyFallbackTried && isLegacySample) {
                    audioPlayer.dataset.legacyFallbackTried = '1';
                    const currentSong = playlist.find(s => s && s.id === currentPlayingSongId);
                    if (currentSong && LEGACY_SAMPLE_MP3_URLS.includes(currentSong.src)) {
                        currentSong.src = DEFAULT_SAMPLE_MP3_URL;
                        saveMusicData();
                    }
                    audioPlayer.src = DEFAULT_SAMPLE_MP3_URL;
                    safePlay();
                    return;
                }
                
                let message = "音频加载失败";
                if (error) {
                    switch (error.code) {
                        case 1: message = "音频加载被中止"; break;
                        case 2: message = "网络错误，音频下载失败"; break;
                        case 3: message = "音频解码错误"; break;
                        case 4: message = "资源不可用或格式不支持"; break;
                    }
                }
                
                // 优化提示内容
                const fileName = currentSrc.split('/').pop() || "未知源";
                showToast(`❌ ${message}\n资源: ${decodeURIComponent(fileName)}`);
                
                // 如果当前正在播放但出错了，停止旋转动画和“一起听”动画
                safeRemoveClass(record, 'playing');
                safeRemoveClass(tonearm, 'playing');
                togetherLine.classList.remove('playing');
                updatePlayButton();
            });
            
            // 加载保存的音乐数据
            loadMusicData();
            
            // 检查是否是第一次运行（通过检查 localStorage 是否有键）
            const hasSavedData = localStorage.getItem(PLAYLIST_KEY) !== null;
            
            // 如果没有保存的音乐且是第一次运行，则使用默认示例音乐
            if (playlist.length === 0 && !hasSavedData) {
                // Task 2: 删除预设歌曲和合集
                playlist = [];
                collections = [];
                saveMusicData();
            }
            
            // 加载保存的主题设置
            loadTheme();
            
            // 更新歌曲列表
            updateSongList();
            updateCollectionsList();
            
            // 尝试从 localStorage 恢复播放状态 (实现跨应用持久化)
            const savedStateStr = localStorage.getItem('global_music_state');
            let restored = false;
            
            if (savedStateStr) {
                try {
                    const savedState = JSON.parse(savedStateStr);
                    // 检查是否有有效的索引和播放模式
                    if (savedState.songIndex !== undefined && 
                        savedState.playMode === currentPlayMode && // 简单起见，只恢复相同模式，或者都恢复
                        ((currentPlayMode === 'default' && playlist.length > savedState.songIndex) ||
                         (currentPlayMode === 'collection' && currentCollectionSongs.length > savedState.songIndex))) {
                        
                        currentSongIndex = savedState.songIndex;
                        // 加载曲目但不自动播放
                        await loadSong(currentSongIndex);
                        
                        if (savedState.currentTime) {
                            audioPlayer.currentTime = savedState.currentTime;
                        }
                        
                        // 更新UI显示
                        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
                        
                        restored = true;
                    }
                } catch(e) {
                    console.error("恢复播放状态失败", e);
                }
            }

            // 如果没有恢复成功，且有歌曲，则默认加载第一个曲目
            if (!restored && playlist.length > 0) {
                currentSongIndex = 0;
                loadSong(currentSongIndex);
            }
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
        
        function initCropModal() {
            const cropModal = document.getElementById('cropModal');
            const cropCanvas = document.getElementById('cropCanvas');
            const cropWrapper = document.getElementById('cropWrapper');
            const cancelBtn = document.getElementById('cropCancelBtn');
            const confirmBtn = document.getElementById('cropConfirmBtn');
            const bgDiscInput = document.getElementById('bgDiscInput');
            const ctx = cropCanvas.getContext('2d');
            
            // 触摸事件处理
            cropWrapper.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    // 单指拖动
                    cropIsDragging = true;
                    cropStartX = e.touches[0].clientX - cropTranslateX;
                    cropStartY = e.touches[0].clientY - cropTranslateY;
                } else if (e.touches.length === 2) {
                    // 双指缩放
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
                        // 限制缩放范围
                        cropScale = Math.max(0.5, Math.min(5, newScale));
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
                cropScale = Math.max(0.5, Math.min(5, cropScale * delta));
                drawCropImage();
            });
            
            function drawCropImage() {
                if (!cropImage) return;
                
                // 设置画布大小为容器大小
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
                bgDiscInput.value = ''; // 清除选择
            });
            
            confirmBtn.addEventListener('click', () => {
                // 生成裁剪后的图片
                const outputCanvas = document.createElement('canvas');
                // 限制为 1024 以优化移动端性能
                const outputSize = 1024; 
                outputCanvas.width = outputSize;
                outputCanvas.height = outputSize;
                const outCtx = outputCanvas.getContext('2d');
                
                // 计算裁切参数
                // 屏幕中心点
                const cx = cropCanvas.width / 2;
                const cy = cropCanvas.height / 2;
                
                outCtx.fillStyle = '#000';
                outCtx.fillRect(0, 0, outputSize, outputSize);
                
                outCtx.save();
                // 移动到中心
                outCtx.translate(outputSize / 2, outputSize / 2);
                
                // 目标输出比例因子: target_scale = outputSize / 280 (280是overlay直径)
                const targetScale = outputSize / 280;
                
                outCtx.scale(targetScale, targetScale);
                outCtx.translate(cropTranslateX, cropTranslateY);
                outCtx.scale(cropScale, cropScale);
                
                outCtx.drawImage(cropImage, -cropImage.width / 2, -cropImage.height / 2);
                outCtx.restore();
                
                // 转换为 Blob 并保存到 IndexedDB
                outputCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        showToast('生成图片失败');
                        return;
                    }

                    const bgDiscTexture = document.getElementById('bgDiscTexture');
                    if (bgDiscTexture) {
                        // 创建本地 URL 用于立即显示
                        const url = URL.createObjectURL(blob);
                        bgDiscTexture.style.backgroundImage = `url(${url})`;
                        
                        try {
                            // 保存到 IndexedDB
                            await saveFileToDB(BG_DISC_DB_ID, blob);
                            showToast('贴图已更新');
                            
                            // 清除旧的 localStorage 数据以释放空间
                            localStorage.removeItem(BG_DISC_TEXTURE_KEY);
                        } catch (e) {
                            console.error("保存贴图失败:", e);
                            showToast('保存到数据库失败');
                        }
                    }
                    
                    cropModal.classList.remove('show');
                    bgDiscInput.value = '';
                }, 'image/jpeg', 0.9);
            });
            
            // 暴露打开裁剪器的方法
            window.openCropModal = (imgSrc) => {
                cropImage = new Image();
                cropImage.onload = () => {
                    // 重置状态
                    cropScale = 1;
                    cropTranslateX = 0;
                    cropTranslateY = 0;
                    
                    // 初始适应屏幕
                    const minDim = Math.min(cropImage.width, cropImage.height);
                    const wrapperDim = Math.min(cropWrapper.clientWidth, cropWrapper.clientHeight);
                    if (minDim > 0) {
                        cropScale = (wrapperDim * 0.8) / minDim; // 初始缩放适应屏幕80%
                    }
                    
                    drawCropImage();
                    cropModal.classList.add('show');
                };
                cropImage.src = imgSrc;
            };
        }

        // 图片压缩函数
        function compressImage(file, maxWidth = 1024, quality = 0.8) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;
                        
                        // 计算缩放比例
                        if (width > maxWidth) {
                            height = Math.round(height * (maxWidth / width));
                            width = maxWidth;
                        }
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // 转换为 Data URL
                        const dataUrl = canvas.toDataURL(file.type || 'image/jpeg', quality);
                        resolve(dataUrl);
                    };
                    img.onerror = (e) => reject(e);
                };
                reader.onerror = (e) => reject(e);
            });
        }

        async function initBgDisc() {
            if (!bgDisc || !bgDiscTexture || !bgDiscInput) return;

            // 初始化裁剪弹窗
            initCropModal();

            try {
                // 优先从 IndexedDB 读取
                const blob = await getFileFromDB(BG_DISC_DB_ID);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    bgDiscTexture.style.backgroundImage = `url(${url})`;
                } else {
                    // 兼容旧数据
                    const saved = localStorage.getItem(BG_DISC_TEXTURE_KEY);
                    if (saved) {
                        const normalized = String(saved || '').trim();
                        if (normalized && normalized !== '[object Blob]' && normalized.indexOf('idb:') !== 0) {
                            bgDiscTexture.style.backgroundImage = `url(${normalized})`;
                        } else {
                            try { localStorage.removeItem(BG_DISC_TEXTURE_KEY); } catch (e) {}
                        }
                    }
                }
            } catch (e) {
                console.error("加载自定义碟片失败:", e);
            }

            bgDisc.addEventListener('click', () => {
                bgDiscInput.value = '';
                bgDiscInput.click();
            });

            bgDiscInput.addEventListener('change', () => {
                const file = bgDiscInput.files && bgDiscInput.files[0];
                if (!file) return;

                if (!file.type || !file.type.startsWith('image/')) {
                    showToast('请选择图片文件');
                    return;
                }

                showToast('正在处理图片...');
                
                // 尝试压缩图片
                compressImage(file, 1024, 0.8)
                    .then(dataUrl => {
                        // 打开裁剪弹窗
                        if (window.openCropModal) {
                            window.openCropModal(dataUrl);
                        } else {
                            // 降级处理
                            bgDiscTexture.style.backgroundImage = `url(${dataUrl})`;
                            try {
                                localStorage.setItem(BG_DISC_TEXTURE_KEY, dataUrl);
                                showToast('贴图已更新');
                            } catch (e) {
                                showToast('贴图太大，保存失败');
                            }
                        }
                    })
                    .catch(err => {
                        console.error('图片压缩失败:', err);
                        // 压缩失败，使用原图
                        const reader = new FileReader();
                        reader.onload = () => {
                            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                            if (!dataUrl) {
                                showToast('读取图片失败');
                                return;
                            }
                            if (window.openCropModal) {
                                window.openCropModal(dataUrl);
                            } else {
                                bgDiscTexture.style.backgroundImage = `url(${dataUrl})`;
                                try {
                                    localStorage.setItem(BG_DISC_TEXTURE_KEY, dataUrl);
                                    showToast('贴图已更新');
                                } catch (e) {
                                    showToast('贴图太大，保存失败');
                                }
                            }
                        };
                        reader.readAsDataURL(file);
                    });
            });
        }
        
        // 加载主题设置
        function loadTheme() {
            const savedTheme = localStorage.getItem(THEME_KEY);
            
            if (savedTheme) {
                currentTheme = savedTheme;
            }
            
            applyTheme();
        }
        
        // 应用主题
        function applyTheme() {
            // 应用主题
            if (currentTheme === 'light') {
                document.body.classList.add('light-mode');
            } else {
                document.body.classList.remove('light-mode');
            }
            
            // 保存主题设置
            localStorage.setItem(THEME_KEY, currentTheme);
        }
        
        // 切换主题
        function toggleTheme() {
            if (currentTheme === 'dark') {
                currentTheme = 'light';
            } else {
                currentTheme = 'dark';
            }

            applyTheme();

            const themeName = currentTheme === 'dark' ? '夜间模式' : '日间模式';
            showToast(`已切换到${themeName}`);
        }
        
        // 显示提示消息 - 修改为右上角滑动通知
        function showToast(message) {
            // 如果已经有toast显示，先隐藏它
            if (toast.classList.contains('show')) {
                toast.classList.remove('show');
                toast.classList.add('hiding');
                
                setTimeout(() => {
                    toast.classList.remove('hiding');
                    showNewToast(message);
                }, 300);
            } else {
                showNewToast(message);
            }
        }
        
        function showNewToast(message) {
            toast.textContent = message;
            toast.classList.remove('hiding');
            toast.classList.add('show');
            
            // 3秒后自动隐藏
            setTimeout(() => {
                hideToast();
            }, 3000);
        }
        
        function hideToast() {
            toast.classList.remove('show');
            toast.classList.add('hiding');
            
            setTimeout(() => {
                toast.classList.remove('hiding');
            }, 400);
        }
        
        // 点击toast可以手动关闭
        toast.addEventListener('click', hideToast);
        
        // 加载指定索引的曲目
        async function loadSong(index) {
            let song;
            
            if (currentPlayMode === 'default') {
                // 默认播放列表模式
                if (playlist.length === 0) return;
                song = playlist[index];
            } else if (currentPlayMode === 'collection') {
                // 合集播放模式
                if (currentCollectionSongs.length === 0) return;
                song = currentCollectionSongs[index];
            } else {
                return;
            }

            delete audioPlayer.dataset.legacyFallbackTried;
            if (song && LEGACY_SAMPLE_MP3_URLS.includes(song.src)) {
                song.src = DEFAULT_SAMPLE_MP3_URL;
                const songInPlaylist = playlist.find(s => s && s.id === song.id);
                if (songInPlaylist) {
                    songInPlaylist.src = DEFAULT_SAMPLE_MP3_URL;
                }
                saveMusicData();
            }
            
            // 如果是存储在 IndexedDB 中的文件，需要先获取 blob
            if (song.src && song.src.startsWith('indexeddb://')) {
                try {
                    const songId = parseInt(song.src.replace('indexeddb://', ''));
                    const fileBlob = await getFileFromDB(songId);
                    if (fileBlob) {
                        // 释放之前的 Object URL (如果有)
                        let oldAudioUrl = null;
                        if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
                            oldAudioUrl = audioPlayer.src;
                        }
                        const blobUrlService = getBlobUrlService();
                        let nextAudioUrl;
                        if (blobUrlService && typeof blobUrlService.createObjectUrl === 'function') {
                            nextAudioUrl = blobUrlService.createObjectUrl(fileBlob, { groupId: GROUP_ID });
                        } else {
                            nextAudioUrl = URL.createObjectURL(fileBlob);
                        }
                        audioPlayer.src = nextAudioUrl;
                        if (oldAudioUrl && oldAudioUrl !== nextAudioUrl) {
                            safeRevoke(oldAudioUrl);
                        }
                    } else {
                        showToast("找不到存储的音频文件");
                        return;
                    }
                } catch (e) {
                    console.error("从数据库加载文件失败:", e);
                    showToast("加载音频失败");
                    return;
                }
            } else {
                audioPlayer.src = song.src;
            }
            
            songTitle.textContent = song.title;
            updateTurntableLayout();
            currentPlayingSongId = song.id;
            
            // 更新UI
            updatePlayButton();
            resetProgress();
            
            // 更新 MediaSession
            updateMediaSession();
            
            // 更新歌曲列表中的播放状态
            updateSongPlayStatus();
            
            // 预加载音频元数据
            audioPlayer.addEventListener('loadedmetadata', function() {
                durationEl.textContent = formatTime(audioPlayer.duration);
            }, { once: true });
            
            showToast(`正在播放: ${song.title}`);
        }
        
        // 安全播放音频
        function safePlay() {
            if (!audioPlayer.src || audioPlayer.src === window.location.href) {
                console.warn("尝试播放没有来源的音频");
                return;
            }
            
            const playPromise = audioPlayer.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    hasStartedPlayback = true;
                    localStorage.setItem('global_music_has_started', '1');
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                }).catch(error => {
                    console.error("播放失败:", error);
                    if (error.name === 'NotAllowedError') {
                        showToast("播放被浏览器拦截，请点击页面进行交互");
                    } else if (error.name === 'NotSupportedError') {
                        showToast("音频格式不受支持或资源不可用");
                    }
                    
                    safeRemoveClass(record, 'playing');
                    safeRemoveClass(tonearm, 'playing');
                    updatePlayButton();
                });
            }
        }

        // 播放/暂停
        function togglePlayPause() {
            if (audioPlayer.src && 
                ((currentPlayMode === 'default' && playlist.length > 0) || 
                 (currentPlayMode === 'collection' && currentCollectionSongs.length > 0))) {
                
                // 如果当前不是正在处理全局指令（即 lastPauseSource 不是 global），则视为 App 内点击
                // 注意：handleGlobalCommand 会先设置 lastPauseSource = 'global' 再调这个函数
                if (lastPauseSource !== 'global') {
                    lastPauseSource = 'app';
                }

                if (audioPlayer.paused) {
                    safePlay();
                    safeAddClass(record, 'playing');
                    safeAddClass(tonearm, 'playing');
                } else {
                    audioPlayer.pause();
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused';
                    }
                    safeRemoveClass(record, 'playing');
                    safeRemoveClass(tonearm, 'playing');
                }
                updatePlayButton();
                updateSongPlayStatus();
                
                // 重要：在 App 内点击后，确保立即同步状态，以便浮窗能感知到来源的变化
                syncGlobalPlayerStatus();
                
                // 处理完后，延迟一点将 global 状态切回 app，确保下次点击判定的准确性
                if (lastPauseSource === 'global') {
                    setTimeout(() => {
                        lastPauseSource = 'app';
                    }, 1000);
                }
            } else {
                showToast("请先添加歌曲");
            }
        }
        
        // 更新播放/暂停按钮
        function updatePlayButton() {
            if (audioPlayer.paused) {
                playPauseIcon.classList.remove('fa-pause');
                playPauseIcon.classList.add('fa-play');
                safeRemoveClass(togetherLine, 'playing');
                safeRemoveClass(togetherContainer, 'playing');
                if (bgDisc) {
                    if (hasStartedPlayback) {
                        bgDisc.classList.add('playing');
                        bgDisc.classList.add('paused');
                    } else {
                        bgDisc.classList.remove('playing');
                        bgDisc.classList.remove('paused');
                    }
                }
                safeRemoveClass(bgTonearm, 'playing');
            } else {
                playPauseIcon.classList.remove('fa-play');
                playPauseIcon.classList.add('fa-pause');
                safeAddClass(togetherLine, 'playing');
                safeAddClass(togetherContainer, 'playing');
                safeAddClass(bgDisc, 'playing');
                safeRemoveClass(bgDisc, 'paused');
                safeAddClass(bgTonearm, 'playing');
            }
            syncGlobalPlayerStatus();
        }
        
        // 同步状态到全局播放器
        async function syncGlobalPlayerStatus() {
            const currentSong = playlist.find(s => s.id === currentPlayingSongId);
            
            // 获取当前用户信息
            let userAvatar = null;
            let friendAvatar = null;
            let wechatData = wechatCache;
            
            try {
                if (!wechatData) {
                    wechatData = JSON.parse(localStorage.getItem('wechatAppData') || '{}');
                    if (wechatData && typeof wechatData === 'object') {
                        wechatCache = wechatData;
                    }
                }

                // 尝试从StorageService获取合并后的wechatAppData（分库后）
                if (window.Core && window.Core.StorageService && typeof window.Core.StorageService.getAppData === 'function') {
                    try {
                        const storageData = await window.Core.StorageService.getAppData('wechatAppData');
                        if (storageData && typeof storageData === 'object') {
                            wechatData = storageData;
                            wechatCache = storageData;
                            console.log('[syncGlobalPlayerStatus] 从StorageService获取到分库数据');
                        }
                    } catch (e) {
                        console.warn('[syncGlobalPlayerStatus] StorageService获取失败，使用缓存:', e);
                    }
                }

                // 统一在音乐应用内部解析头像引用，向全局播放器透传"可直接使用"的 src 或文字
                if (wechatData.currentUser) {
                    const user = wechatData.currentUser;
                    if (user.hasCustomAvatar) {
                        try {
                            const raw = localStorage.getItem('user_avatar') || '';
                            const plain = normalizePlainSrc(raw);
                            if (plain && plain.indexOf('idb:') === 0) {
                                userAvatar = await resolveIdbSrc(plain);
                            } else {
                                userAvatar = plain;
                            }
                        } catch (e) {}
                    }
                    if (!userAvatar && user.name) {
                        userAvatar = user.name[0];
                    }
                }
                
                if (selectedFriendId) {
                    const friend = wechatData.contacts ? wechatData.contacts.find(c => String(c && c.id) === String(selectedFriendId)) : null;
                    if (friend) {
                        if (friend.hasCustomAvatar) {
                            try {
                                const avatarId = `avatar_${friend.id}`;
                                const raw = localStorage.getItem(avatarId) || '';
                                const plain = normalizePlainSrc(raw);
                                if (plain && plain.indexOf('idb:') === 0) {
                                    friendAvatar = await resolveIdbSrc(plain);
                                } else {
                                    friendAvatar = plain;
                                }
                            } catch (e) {}
                        }
                        if (!friendAvatar) {
                            friendAvatar = friend.avatarText || (friend.name ? friend.name[0] : '?');
                        }
                    } else {
                        // 好友可能被删除了，重置状态
                        selectedFriendId = null;
                        localStorage.removeItem('music_selected_friend_id');
                        updateFriendAvatar(); // 刷新 UI
                    }
                }
            } catch (e) {
                console.error("同步头像数据失败:", e);
            }

            const state = {
                playing: !audioPlayer.paused,
                pauseSource: lastPauseSource, // 记录最后一次暂停的来源
                title: currentSong ? currentSong.title : '等待播放',
                songIndex: currentSongIndex,
                playMode: currentPlayMode,
                currentTime: audioPlayer.currentTime || 0,
                hasStarted: hasStartedPlayback,
                timestamp: Date.now(),
                userAvatar: userAvatar,
                friendAvatar: friendAvatar,
                friendId: selectedFriendId,
                isTogether: !!selectedFriendId
            };
            localStorage.setItem('global_music_state', JSON.stringify(state));
        }
        
        // 上一曲
        async function playPrev() {
            let list = currentPlayMode === 'default' ? playlist : currentCollectionSongs;
            if (list.length === 0) return;

            if (playbackOrder === 'shuffle') {
                if (list.length > 1) {
                    const current = currentSongIndex;
                    let newIndex = Math.floor(Math.random() * (list.length - 1));
                    if (newIndex >= current) newIndex += 1;
                    currentSongIndex = newIndex;
                } else {
                    currentSongIndex = 0;
                }
            } else {
                currentSongIndex--;
                if (currentSongIndex < 0) {
                    currentSongIndex = list.length - 1;
                }
            }
            
            await loadSong(currentSongIndex);
            safePlay();
            safeAddClass(record, 'playing');
            safeAddClass(tonearm, 'playing');
            updatePlayButton();
        }
        
        // 下一曲
        async function playNext(isAuto = false) {
            let list = currentPlayMode === 'default' ? playlist : currentCollectionSongs;
            if (list.length === 0) return;
            
            if (isAuto && playbackOrder === 'loop') {
                // 单曲循环且是自动播放时，保持当前索引
                // currentSongIndex = currentSongIndex; 
            } else if (playbackOrder === 'shuffle') {
                // 随机播放
                if (list.length > 1) {
                    const current = currentSongIndex;
                    let newIndex = Math.floor(Math.random() * (list.length - 1));
                    if (newIndex >= current) newIndex += 1;
                    currentSongIndex = newIndex;
                } else {
                    currentSongIndex = 0;
                }
            } else {
                // 顺序播放
                currentSongIndex++;
                if (currentSongIndex >= list.length) {
                    currentSongIndex = 0;
                }
            }
            
            await loadSong(currentSongIndex);
            // 增加100ms延迟，解决部分设备自动播放失效问题
            setTimeout(() => safePlay(), 100);
            safeAddClass(record, 'playing');
            safeAddClass(tonearm, 'playing');
            updatePlayButton();
        }
        
        // 更新进度条
        let lastSyncTime = 0;
        function updateProgress(e) {
            const target = (e && (e.target || e.srcElement)) || audioPlayer;
            const duration = target && Number.isFinite(target.duration) ? target.duration : 0;
            const currentTime = target && Number.isFinite(target.currentTime) ? target.currentTime : 0;
            const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
            progress.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(currentTime);
            
            // 每2秒同步一次状态到全局播放器，防止超时消失
            const now = Date.now();
            if (now - lastSyncTime > 2000) {
                syncGlobalPlayerStatus();
                lastSyncTime = now;
            }
        }
        
        // 设置进度
        function getProgressRatioFromEvent(e) {
            const rect = progressBar.getBoundingClientRect();
            let clientX = null;
            if (e && e.touches && e.touches[0]) clientX = e.touches[0].clientX;
            else if (e && e.changedTouches && e.changedTouches[0]) clientX = e.changedTouches[0].clientX;
            else if (e && typeof e.clientX === 'number') clientX = e.clientX;
            if (clientX === null) return null;
            const x = Math.min(Math.max(clientX - rect.left, 0), rect.width || 1);
            return rect.width > 0 ? x / rect.width : 0;
        }

        function seekToRatio(ratio) {
            if (!Number.isFinite(ratio)) return;
            const duration = audioPlayer.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;
            audioPlayer.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
        }

        function setProgress(e) {
            const ratio = getProgressRatioFromEvent(e);
            if (ratio === null) return;
            seekToRatio(ratio);
        }

        function initProgressScrubbing() {
            if (!progressBar) return;

            if (window.PointerEvent) {
                let scrubbing = false;
                let pointerId = null;

                progressBar.addEventListener('pointerdown', (e) => {
                    if (typeof e.button === 'number' && e.button !== 0) return;
                    scrubbing = true;
                    pointerId = e.pointerId;
                    try { progressBar.setPointerCapture(pointerId); } catch (err) {}
                    setProgress(e);
                    e.preventDefault();
                });

                progressBar.addEventListener('pointermove', (e) => {
                    if (!scrubbing) return;
                    setProgress(e);
                    e.preventDefault();
                });

                const end = (e) => {
                    if (!scrubbing) return;
                    scrubbing = false;
                    try {
                        if (pointerId !== null) progressBar.releasePointerCapture(pointerId);
                    } catch (err) {}
                    pointerId = null;
                };

                progressBar.addEventListener('pointerup', end);
                progressBar.addEventListener('pointercancel', end);
                return;
            }

            let scrubbing = false;

            const onStart = (e) => {
                scrubbing = true;
                setProgress(e);
                e.preventDefault();
            };
            const onMove = (e) => {
                if (!scrubbing) return;
                setProgress(e);
                e.preventDefault();
            };
            const onEnd = () => { scrubbing = false; };

            progressBar.addEventListener('touchstart', onStart, { passive: false });
            progressBar.addEventListener('touchmove', onMove, { passive: false });
            progressBar.addEventListener('touchend', onEnd, { passive: true });
            progressBar.addEventListener('touchcancel', onEnd, { passive: true });

            progressBar.addEventListener('mousedown', (e) => {
                if (typeof e.button === 'number' && e.button !== 0) return;
                onStart(e);
                const move = (ev) => onMove(ev);
                const up = () => {
                    onEnd();
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            });
        }
        
        // 重置进度条
        function resetProgress() {
            progress.style.width = '0%';
            currentTimeEl.textContent = '00:00';
            durationEl.textContent = '00:00';
        }

        function updateTurntableLayout() {
            if (!bgTurntable || !songTitle || !playerHeader) return;

            const isPlayerPage = currentPage === 0;
            bgTurntable.style.display = isPlayerPage ? 'block' : 'none';
            if (!isPlayerPage) return;

            const headerRect = playerHeader.getBoundingClientRect();
            const titleRect = songTitle.getBoundingClientRect();

            const topMenuBottom = headerRect.bottom;
            const songTitleTop = titleRect.top;
            const turntableRect = bgTurntable.getBoundingClientRect();
            const turntableHeight = turntableRect.height || 0;

            let top = topMenuBottom + (songTitleTop - topMenuBottom - turntableHeight) / 2;

            const minTop = topMenuBottom + 8;
            const maxTop = songTitleTop - turntableHeight - 8;
            if (Number.isFinite(minTop) && Number.isFinite(maxTop)) {
                if (minTop <= maxTop) {
                    top = Math.min(Math.max(top, minTop), maxTop);
                } else {
                    top = minTop;
                }
            }

            bgTurntable.style.top = `${top}px`;
        }
        
        // 切换页面
        function switchPage(pageIndex) {
            currentPage = pageIndex;
            pagesContainer.style.transform = `translateX(-${pageIndex * 50}%)`;
            
            // 更新导航栏状态
            navItems.forEach((item, index) => {
                if (index === pageIndex) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            // 如果是播放页面且正在播放，则启动唱片旋转
            if (pageIndex === 0 && !audioPlayer.paused) {
                safeAddClass(record, 'playing');
                safeAddClass(tonearm, 'playing');
            } else {
                safeRemoveClass(record, 'playing');
                safeRemoveClass(tonearm, 'playing');
            }

            updateTurntableLayout();
            setTimeout(updateTurntableLayout, 450);
        }
        
        // 格式化时间（秒 → 分:秒）
        function formatTime(seconds) {
            if (isNaN(seconds)) return "00:00";
            
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // 切换歌单标签页
        function switchTab(tabName) {
            // 更新标签样式
            tabs.forEach(tab => {
                if (tab.dataset.tab === tabName) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
            
            // 显示对应的内容
            playlistContents.forEach(content => {
                if (content.id === `${tabName}Tab`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });

            if (tabName !== 'default' && isBulkEditing) {
                setBulkEditingState(false);
            }

            if (editBtn) {
                editBtn.disabled = tabName !== 'default';
            }
        }
        
        // 显示添加菜单
        function showAddMenu() {
            addMenu.classList.add('show');
        }
        
        // 隐藏添加菜单
        function hideAddMenu() {
            addMenu.classList.remove('show');
        }
        
        // 显示添加歌曲页面
        function showAddSongsPage() {
            addSongsPage.classList.add('show');
            hideAddMenu();
            renderCollectionSelectList();
        }
        
        // 隐藏添加歌曲页面
        function hideAddSongsPage() {
            addSongsPage.classList.remove('show');
        }
        
        // 显示合集详情浮窗
        function showCollectionDetail(collectionId) {
            const collection = collections.find(c => c.id === collectionId);
            if (!collection) return;
            
            collectionDetailTitle.textContent = collection.name;
            
            // 清空之前的歌曲
            collectionDetailSongs.innerHTML = '';
            
            // 获取合集中的歌曲
            const songsInCollection = playlist.filter(song => 
                collection.songIds.includes(song.id)
            );
            
            if (songsInCollection.length === 0) {
                collectionDetailSongs.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-music"></i>
                        <p>此合集暂无歌曲</p>
                    </div>
                `;
            } else {
                // 添加歌曲到浮窗
                songsInCollection.forEach((song, index) => {
                    const songItem = document.createElement('div');
                    songItem.className = 'song-item';
                    songItem.dataset.id = song.id;
                    songItem.dataset.index = index;
                    
                    // 检查是否是当前播放的歌曲
                    const isPlaying = currentPlayingSongId === song.id && !audioPlayer.paused;
                    const isCurrent = currentPlayingSongId === song.id;
                    
                    if (isCurrent) {
                        songItem.classList.add('playing');
                    }
                    
                    songItem.innerHTML = `
                        <div class="song-info">
                            <div class="song-name">${song.title}</div>
                        </div>
                        <div class="song-play-btn ${isPlaying ? 'playing' : ''}">
                            <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </div>
                    `;
                    
                    collectionDetailSongs.appendChild(songItem);
                    
                    // 绑定长按事件
                    bindLongPressEvents(songItem, song.id);
                    
                    // 为播放按钮添加事件
                    const playBtn = songItem.querySelector('.song-play-btn');
                    playBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止事件冒泡
                        
                        // 如果点击的是当前播放的歌曲，则切换播放/暂停
                        if (currentPlayingSongId === song.id) {
                            togglePlayPause();
                            // 更新按钮图标
                            const icon = playBtn.querySelector('i');
                            if (audioPlayer.paused) {
                                icon.classList.remove('fa-pause');
                                icon.classList.add('fa-play');
                                playBtn.classList.remove('playing');
                            } else {
                                icon.classList.remove('fa-play');
                                icon.classList.add('fa-pause');
                                playBtn.classList.add('playing');
                            }
                        } else {
                            // 否则播放这首歌曲
                            playSongFromCollection(collectionId, index);
                        }
                    });
                });
            }
            
            collectionDetailModal.classList.add('show');
        }
        
        // 隐藏合集详情浮窗
        function hideCollectionDetail() {
            collectionDetailModal.classList.remove('show');
        }
        
        // 显示添加合集模态框
        function showAddCollectionModal() {
            addCollectionModal.classList.add('show');
            collectionNameInput.value = '';
            
            // 重置为创建模式
            delete addCollectionModal.dataset.mode;
            delete addCollectionModal.dataset.id;
            const modalTitle = addCollectionModal.querySelector('.add-collection-title');
            const confirmBtn = addCollectionModal.querySelector('#confirmAddCollection');
            if (modalTitle) modalTitle.textContent = '创建新合集';
            if (confirmBtn) confirmBtn.textContent = '创建';
            
            hideAddMenu();
        }
        
        // 隐藏添加合集模态框
        function hideAddCollectionModal() {
            addCollectionModal.classList.remove('show');
        }
        
        // 播放默认列表中的歌曲
        async function playSongFromDefaultList(songIndex, toggleIfCurrent = true) {
            if (songIndex >= 0 && songIndex < playlist.length) {
                const song = playlist[songIndex];
                
                // 如果点击的是当前播放的歌曲，则切换播放/暂停
                if (toggleIfCurrent && currentPlayingSongId === song.id) {
                    togglePlayPause();
                    return;
                }
                
                // 切换到默认播放模式
                currentPlayMode = 'default';
                currentCollectionId = null;
                currentCollectionSongs = [];
                
                currentSongIndex = songIndex;
                await loadSong(currentSongIndex);
                safePlay();
                safeAddClass(record, 'playing');
                safeAddClass(tonearm, 'playing');
                updatePlayButton();
                
                // 更新歌曲列表中的播放状态
                updateSongPlayStatus();
            }
        }
        
        // 播放合集中的歌曲
        async function playSongFromCollection(collectionId, songIndex, toggleIfCurrent = true) {
            const collection = collections.find(c => c.id === collectionId);
            if (!collection) return;
            
            // 获取合集中的歌曲
            currentCollectionSongs = playlist.filter(song => 
                collection.songIds.includes(song.id)
            );
            
            if (currentCollectionSongs.length === 0) {
                showToast("此合集没有歌曲");
                return;
            }
            
            const song = currentCollectionSongs[songIndex];
            
            // 如果点击的是当前播放的歌曲，则切换播放/暂停
            if (toggleIfCurrent && currentPlayingSongId === song.id) {
                togglePlayPause();
                return;
            }
            
            if (songIndex >= 0 && songIndex < currentCollectionSongs.length) {
                // 切换到合集播放模式
                currentPlayMode = 'collection';
                currentCollectionId = collectionId;
                
                currentSongIndex = songIndex;
                await loadSong(currentSongIndex);
                safePlay();
                safeAddClass(record, 'playing');
                safeAddClass(tonearm, 'playing');
                updatePlayButton();
                
                // 更新歌曲列表中的播放状态
                updateSongPlayStatus();
            }
        }
        
        // 播放整个合集
        async function playWholeCollection(collectionId) {
            const collection = collections.find(c => c.id === collectionId);
            if (!collection) return;
            
            // 获取合集中的歌曲
            currentCollectionSongs = playlist.filter(song => 
                collection.songIds.includes(song.id)
            );
            
            if (currentCollectionSongs.length === 0) {
                showToast("此合集没有歌曲");
                return;
            }
            
            // 切换到合集播放模式
            currentPlayMode = 'collection';
            currentCollectionId = collectionId;
            
            currentSongIndex = 0;
            await loadSong(currentSongIndex);
            safePlay();
            safeAddClass(record, 'playing');
            safeAddClass(tonearm, 'playing');
            updatePlayButton();
            
            // 更新歌曲列表中的播放状态
            updateSongPlayStatus();
            
            // 关闭合集详情浮窗
            hideCollectionDetail();
        }
        
        // 从URL添加音频
        async function loadFromUrl() {
            const url = urlInput.value.trim();
            
            if (!url) {
                showToast("请输入音频URL");
                return;
            }
            
            // 验证URL格式
            try {
                new URL(url);
            } catch (e) {
                showToast("URL格式不正确");
                return;
            }
            
            // 创建新曲目
            const newSong = {
                id: Date.now(),
                title: `在线音频_${playlist.length + 1}`,
                src: url,
                addedTime: Date.now()
            };
            
            // 添加到播放列表
            playlist.push(newSong);

            if (selectedAddCollectionId) {
                const collection = collections.find(c => c.id === selectedAddCollectionId);
                if (collection && !collection.songIds.includes(newSong.id)) {
                    collection.songIds.push(newSong.id);
                }
            }
            
            // 更新歌曲列表
            updateSongList();
            saveMusicData(); // 保存更改
            
            // 如果当前没有播放音乐，则播放新添加的音乐
            if (playlist.length === 1 && currentPlayMode === 'default') {
                currentSongIndex = 0;
                await loadSong(currentSongIndex);
            }
            
            // 清空输入
            urlInput.value = "";
            
            showToast("已添加URL音频");
        }
        
        // 处理文件上传
        async function handleFileUpload(files) {
            const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
            
            if (audioFiles.length === 0) {
                showToast("请选择音频文件");
                return;
            }
            
            showToast(`正在处理 ${audioFiles.length} 个文件...`);
            
            for (let i = 0; i < audioFiles.length; i++) {
                const file = audioFiles[i];
                const songId = Date.now() + i;
                
                try {
                    // 保存文件到 IndexedDB
                    await saveFileToDB(songId, file);
                    
                    // 创建新曲目，src 指向数据库
                    const newSong = {
                        id: songId,
                        title: file.name.replace(/\.[^/.]+$/, ""), // 移除扩展名
                        src: `indexeddb://${songId}`,
                        addedTime: Date.now()
                    };
                    
                    // 添加到播放列表
                    playlist.push(newSong);

                    if (selectedAddCollectionId) {
                        const collection = collections.find(c => c.id === selectedAddCollectionId);
                        if (collection && !collection.songIds.includes(newSong.id)) {
                            collection.songIds.push(newSong.id);
                        }
                    }
                } catch (e) {
                    console.error("处理文件失败:", e);
                    showToast(`处理文件 "${file.name}" 失败`);
                }
            }
            
            // 更新歌曲列表
            updateSongList();
            saveMusicData(); // 保存更改
            
            // 如果当前没有播放音乐，则播放第一个新添加的音乐
            if (playlist.length === audioFiles.length && currentPlayMode === 'default') {
                currentSongIndex = 0;
                await loadSong(currentSongIndex);
            }
            
            showToast(`已添加 ${audioFiles.length} 个音频文件`);
        }
        
        // 更新歌曲列表
        function updateSongList() {
            const defaultTab = document.getElementById('defaultTab');
            const defaultEmpty = document.getElementById('defaultEmpty');

            if (bulkSelectedSongIds.size > 0) {
                const validIds = new Set(playlist.map(song => song.id));
                bulkSelectedSongIds.forEach(id => {
                    if (!validIds.has(id)) {
                        bulkSelectedSongIds.delete(id);
                    }
                });
                updateBulkActionsState();
            }
            
            // 清空默认标签页内容（除了空状态提示）
            const existingSongs = defaultTab.querySelectorAll('.song-item');
            existingSongs.forEach(song => song.remove());
            
            // 如果有歌曲，隐藏空状态提示
            if (playlist.length > 0) {
                defaultEmpty.style.display = 'none';
                
                // 添加歌曲项
                playlist.forEach((song, index) => {
                    const songItem = document.createElement('div');
                    songItem.className = 'song-item';
                    songItem.dataset.id = song.id;
                    songItem.dataset.index = index;
                    
                    // 检查是否是当前播放的歌曲
                    const isPlaying = currentPlayingSongId === song.id && !audioPlayer.paused;
                    const isCurrent = currentPlayingSongId === song.id;
                    
                    if (isCurrent) {
                        songItem.classList.add('playing');
                    }
                    
                    const isChecked = bulkSelectedSongIds.has(song.id);

                    songItem.innerHTML = `
                        <label class="song-check">
                            <input type="checkbox" class="song-checkbox" ${isChecked ? 'checked' : ''}>
                            <span class="song-check-mark"></span>
                        </label>
                        <div class="song-info">
                            <div class="song-name">${song.title}</div>
                        </div>
                        <div class="song-play-btn ${isPlaying ? 'playing' : ''}">
                            <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </div>
                    `;
                    
                    // 插入到空状态提示之前
                    defaultTab.insertBefore(songItem, defaultEmpty);
                    
                    // 绑定长按事件
                    bindLongPressEvents(songItem, song.id);
                    
                    // 为播放按钮添加事件（小三角播放器）
                    const playBtn = songItem.querySelector('.song-play-btn');
                    playBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止事件冒泡
                        if (isBulkEditing) return;
                        playSongFromDefaultList(index, true);
                    });

                    const checkbox = songItem.querySelector('.song-checkbox');
                    checkbox.addEventListener('click', (e) => e.stopPropagation());
                    checkbox.addEventListener('change', (e) => {
                        toggleBulkSelection(song.id, e.target.checked);
                        songItem.classList.toggle('selected', e.target.checked);
                    });
                    
                    // 歌曲项点击事件（点击其他部分不跳转）
                    songItem.addEventListener('click', function(e) {
                        if (isBulkEditing && !e.target.closest('.song-play-btn')) {
                            const nextChecked = !checkbox.checked;
                            checkbox.checked = nextChecked;
                            toggleBulkSelection(song.id, nextChecked);
                            songItem.classList.toggle('selected', nextChecked);
                            return;
                        }
                    });
                });
            } else {
                defaultEmpty.style.display = 'block';
            }
            
            // 更新合集的数量和歌曲ID列表
            collections.forEach(collection => {
                // 更新合集歌曲数量显示
                const songCount = playlist.filter(song => 
                    collection.songIds.includes(song.id)
                ).length;
                collection.songCount = songCount;
            });
            
            // 更新合集列表显示
            updateCollectionsList();
        }

        function renderCollectionSelectList() {
            if (!collectionSelectList) return;
            collectionSelectList.innerHTML = '';

            const hasSelected = collections.some(c => c.id === selectedAddCollectionId);
            if (!hasSelected) selectedAddCollectionId = null;

            const noneItem = document.createElement('div');
            noneItem.className = `collection-select-item${selectedAddCollectionId ? '' : ' active'}`;
            noneItem.textContent = '不加入合集';
            noneItem.onclick = () => {
                selectedAddCollectionId = null;
                renderCollectionSelectList();
            };
            collectionSelectList.appendChild(noneItem);

            if (collections.length === 0) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'collection-select-empty';
                emptyItem.textContent = '暂无合集，先去创建';
                collectionSelectList.appendChild(emptyItem);
                return;
            }

            collections.forEach(collection => {
                const item = document.createElement('div');
                const isActive = selectedAddCollectionId === collection.id;
                item.className = `collection-select-item${isActive ? ' active' : ''}`;
                item.innerHTML = `<span>${collection.name}</span>${isActive ? '<i class="fas fa-check"></i>' : '<i class="fas fa-chevron-right"></i>'}`;
                item.onclick = () => {
                    selectedAddCollectionId = collection.id;
                    renderCollectionSelectList();
                };
                collectionSelectList.appendChild(item);
            });
        }
        
        // 更新歌曲播放状态
        function updateSongPlayStatus() {
            // 更新默认列表中的播放状态
            const songItems = document.querySelectorAll('#defaultTab .song-item');
            songItems.forEach(item => {
                const songId = parseInt(item.dataset.id);
                const playBtn = item.querySelector('.song-play-btn');
                const icon = playBtn.querySelector('i');
                
                if (currentPlayingSongId === songId) {
                    item.classList.add('playing');
                    
                    if (!audioPlayer.paused) {
                        playBtn.classList.add('playing');
                        icon.classList.remove('fa-play');
                        icon.classList.add('fa-pause');
                    } else {
                        playBtn.classList.remove('playing');
                        icon.classList.remove('fa-pause');
                        icon.classList.add('fa-play');
                    }
                } else {
                    item.classList.remove('playing');
                    playBtn.classList.remove('playing');
                    icon.classList.remove('fa-pause');
                    icon.classList.add('fa-play');
                }
            });
            
            // 更新合集详情浮窗中的播放状态
            const collectionSongItems = document.querySelectorAll('#collectionDetailSongs .song-item');
            collectionSongItems.forEach(item => {
                const songId = parseInt(item.dataset.id);
                const playBtn = item.querySelector('.song-play-btn');
                const icon = playBtn.querySelector('i');
                
                if (currentPlayingSongId === songId) {
                    item.classList.add('playing');
                    
                    if (!audioPlayer.paused) {
                        playBtn.classList.add('playing');
                        icon.classList.remove('fa-play');
                        icon.classList.add('fa-pause');
                    } else {
                        playBtn.classList.remove('playing');
                        icon.classList.remove('fa-pause');
                        icon.classList.add('fa-play');
                    }
                } else {
                    item.classList.remove('playing');
                    playBtn.classList.remove('playing');
                    icon.classList.remove('fa-pause');
                    icon.classList.add('fa-play');
                }
            });
        }
        
        // 更新合集列表
        function updateCollectionsList() {
            const collectionsTab = document.getElementById('collectionsTab');
            const collectionsEmpty = document.getElementById('collectionsEmpty');
            
            // 清空合集标签页内容
            const existingCollections = collectionsTab.querySelectorAll('.collection-item');
            existingCollections.forEach(item => item.remove());
            
            // 如果有合集，隐藏空状态提示
            if (collections.length > 0) {
                collectionsEmpty.style.display = 'none';
                
                // 添加合集项
                collections.forEach(collection => {
                    const collectionItem = document.createElement('div');
                    collectionItem.className = 'collection-item';
                    collectionItem.dataset.id = collection.id;
                    
                    collectionItem.innerHTML = `
                        <div class="collection-info">
                            <div class="collection-name">${collection.name}</div>
                            <div class="collection-song-count">${collection.songCount} 首歌曲</div>
                        </div>
                    `;
                    
                    collectionsTab.appendChild(collectionItem);
                    
                    // 添加点击事件 - 点击合集项打开合集详情浮窗
                    collectionItem.addEventListener('click', function() {
                        const collectionId = parseInt(this.dataset.id);
                        showCollectionDetail(collectionId);
                    });
                    
                    // 绑定长按事件 (编辑/删除)
                    bindLongPressEvents(collectionItem, () => {
                        handleCollectionLongPress(parseInt(collectionItem.dataset.id));
                    });
                });
            } else {
                collectionsEmpty.style.display = 'block';
            }
            renderCollectionSelectList();
        }
        
        // 添加或更新合集
        function addNewCollection() {
            const name = collectionNameInput.value.trim();
            
            if (!name) {
                showToast("请输入合集名称");
                return;
            }
            
            // 检查是否是编辑模式
            if (addCollectionModal.dataset.mode === 'edit') {
                const id = parseInt(addCollectionModal.dataset.id);
                const collection = collections.find(c => c.id === id);
                if (collection) {
                    collection.name = name;
                    updateCollectionsList();
                    saveMusicData();
                    showToast(`合集已重命名为: ${name}`);
                }
            } else {
                // 创建新合集
                const newCollection = {
                    id: Date.now(),
                    name: name,
                    songIds: [], // 初始为空，可以后续添加歌曲
                    songCount: 0,
                };
                
                // 添加到合集列表
                collections.push(newCollection);
                
                // 更新合集列表
                updateCollectionsList();
                saveMusicData(); // 保存更改
                showToast(`已创建合集: ${name}`);
            }
            
            // 隐藏模态框
            hideAddCollectionModal();
        }
        
        // 处理合集长按
        function handleCollectionLongPress(collectionId) {
            editingCollectionId = collectionId;
            collectionEditMenu.classList.add('show');
        }

        // 绑定合集长按事件
        function bindCollectionLongPressEvents(element, collectionId) {
            const startHandler = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                
                longPressTimer = setTimeout(() => {
                    handleCollectionLongPress(collectionId);
                }, 600);
            };

            const cancelHandler = () => {
                clearTimeout(longPressTimer);
            };

            element.addEventListener('touchstart', startHandler, { passive: true });
            element.addEventListener('touchend', cancelHandler);
            element.addEventListener('touchmove', cancelHandler);
            
            element.addEventListener('mousedown', startHandler);
            element.addEventListener('mouseup', cancelHandler);
            element.addEventListener('mouseleave', cancelHandler);
        }



        // 删除合集
        function deleteCollection() {
            if (editingCollectionId === null) return;
            
            const index = collections.findIndex(c => c.id === editingCollectionId);
            if (index !== -1) {
                collections.splice(index, 1);
                updateCollectionsList();
                saveMusicData();
                showToast('合集已删除');
            }
            
            collectionEditMenu.classList.remove('show');
            editingCollectionId = null;
        }

        // 重命名合集
        function renameCollection() {
            if (editingCollectionId === null) return;
            
            const collection = collections.find(c => c.id === editingCollectionId);
            if (collection) {
                // 显示编辑模式的模态框
                addCollectionModal.dataset.mode = 'edit';
                addCollectionModal.dataset.id = collection.id;
                
                const modalTitle = addCollectionModal.querySelector('.add-collection-title');
                const confirmBtn = addCollectionModal.querySelector('#confirmAddCollection');
                if (modalTitle) modalTitle.textContent = '重命名合集';
                if (confirmBtn) confirmBtn.textContent = '保存';
                
                collectionNameInput.value = collection.name;
                addCollectionModal.classList.add('show');
            }
            
            collectionEditMenu.classList.remove('show');
        }

        // 初始化背景预览功能
        function initCustomBgPreview() {
            return;
        }
        
        // 应用自定义背景
        function applyCustomBackground(settings) {
            if (!settings) {
                const saved = localStorage.getItem('custom_bg_settings');
                if (saved) {
                    try {
                        settings = JSON.parse(saved);
                    } catch(e) {}
                }
            }
            
            if (settings && settings.image) {
                document.body.style.backgroundImage = `url(${settings.image})`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundAttachment = 'fixed';
                
                // 创建或更新遮罩层以实现模糊和透明度
                let overlay = document.getElementById('bg-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'bg-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.zIndex = '-1';
                    overlay.style.pointerEvents = 'none';
                    overlay.style.backgroundColor = 'var(--bg-color)'; // 使用主题背景色
                    document.body.prepend(overlay);
                }
                
                // 这里逻辑稍微调整：body放图片，overlay放半透明背景色
                // 或者：overlay放图片并模糊
                
                // 更好的方案：
                // body 背景色保持不变
                // 添加一个 fixed div 作为背景图片层
                let bgLayer = document.getElementById('custom-bg-layer');
                if (!bgLayer) {
                    bgLayer = document.createElement('div');
                    bgLayer.id = 'custom-bg-layer';
                    bgLayer.style.position = 'fixed';
                    bgLayer.style.top = '0';
                    bgLayer.style.left = '0';
                    bgLayer.style.width = '100%';
                    bgLayer.style.height = '100%';
                    bgLayer.style.zIndex = '-2';
                    bgLayer.style.backgroundSize = 'cover';
                    bgLayer.style.backgroundPosition = 'center';
                    document.body.prepend(bgLayer);
                }
                
                bgLayer.style.backgroundImage = `url(${settings.image})`;
                bgLayer.style.filter = `blur(${settings.blur}px)`;
                bgLayer.style.opacity = settings.opacity;
            }
        }

        // 初始化事件监听器
        function initEventListeners() {
            // 播放器控制
            playPauseBtn.addEventListener('click', togglePlayPause);
            prevBtn.addEventListener('click', playPrev);
            nextBtn.addEventListener('click', playNext);
            
            audioPlayer.addEventListener('timeupdate', updateProgress);
            audioPlayer.addEventListener('play', () => {
                hasStartedPlayback = true;
                localStorage.setItem('global_music_has_started', '1');
                updatePlayButton();
                syncGlobalPlayerStatus();
            });
            audioPlayer.addEventListener('pause', () => {
                updatePlayButton();
                syncGlobalPlayerStatus();
            });
            audioPlayer.addEventListener('ended', () => {
                syncGlobalPlayerStatus();
                // 延迟一点点播放下一曲，有时能绕过浏览器的限制
                setTimeout(() => {
                    playNext(true);
                }, 100);
            });
            
            // 添加播放/暂停事件监听器来更新歌曲播放状态
            audioPlayer.addEventListener('play', updateSongPlayStatus);
            audioPlayer.addEventListener('pause', updateSongPlayStatus);

            progressBar.addEventListener('click', setProgress);
            initProgressScrubbing();
            
            // 导航栏点击事件
            navItems.forEach((item, index) => {
                item.addEventListener('click', () => switchPage(index));
            });
            
            // 歌单标签页切换
            tabs.forEach(tab => {
                tab.addEventListener('click', () => switchTab(tab.dataset.tab));
            });
            
            // 添加按钮
            addBtn.addEventListener('click', showAddMenu);

            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    setBulkEditingState(!isBulkEditing);
                });
            }

            if (bulkMoveBtn) {
                bulkMoveBtn.addEventListener('click', () => {
                    if (bulkSelectedSongIds.size === 0) {
                        showToast('请先选择歌曲');
                        return;
                    }
                    showMoveModal(Array.from(bulkSelectedSongIds));
                });
            }

            if (bulkDeleteBtn) {
                bulkDeleteBtn.addEventListener('click', async () => {
                    if (bulkSelectedSongIds.size === 0) {
                        showToast('请先选择歌曲');
                        return;
                    }
                    const confirmed = confirm('确定要删除选中的歌曲吗？');
                    if (!confirmed) return;
                    await deleteSongsBatch(Array.from(bulkSelectedSongIds));
                    bulkSelectedSongIds.clear();
                    updateBulkActionsState();
                    updateSongList();
                });
            }
            
            // 添加菜单事件
            addSongsOption.addEventListener('click', showAddSongsPage);
            
            // 更多选项菜单事件
            playbackSettingsOption.addEventListener('click', () => {
                playbackModal.classList.add('show');
                moreOptionsMenu.classList.remove('show');
            });
            


            addCollectionOption.addEventListener('click', showAddCollectionModal);
            closeAddMenu.addEventListener('click', hideAddMenu);
            
            // 添加歌曲页面事件
            backFromAddSongs.addEventListener('click', hideAddSongsPage);
            
            // 添加歌曲事件
            loadUrlBtn.addEventListener('click', loadFromUrl);
            
            // 处理URL输入回车键
            urlInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    loadFromUrl();
                }
            });
            
            // 文件上传处理
            uploadArea.addEventListener('click', () => fileInput.click());
            
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                uploadArea.style.background = 'rgba(40, 40, 40, 0.8)';
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                uploadArea.style.background = 'rgba(30, 30, 30, 0.6)';
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                uploadArea.style.background = 'rgba(30, 30, 30, 0.6)';
                
                if (e.dataTransfer.files.length) {
                    handleFileUpload(e.dataTransfer.files);
                }
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    handleFileUpload(e.target.files);
                    fileInput.value = '';
                }
            });
            
            // 合集详情浮窗事件
            collectionDetailClose.addEventListener('click', hideCollectionDetail);
            
            // 为播放合集按钮添加事件
            playCollectionBtn.addEventListener('click', () => {
                // 获取当前显示的合集ID
                const collectionDetailTitleText = collectionDetailTitle.textContent;
                const collection = collections.find(c => c.name === collectionDetailTitleText);
                if (collection) {
                    playWholeCollection(collection.id);
                }
            });
            
            // 添加合集模态框事件
            cancelAddCollection.addEventListener('click', hideAddCollectionModal);
            confirmAddCollection.addEventListener('click', addNewCollection);
            
            // 处理合集名称输入回车键
            collectionNameInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    addNewCollection();
                }
            });
            
            // 主题切换按钮点击事件
            themeToggleBtn.addEventListener('click', toggleTheme);
            
            // 更多选项按钮点击事件
            moreOptionsBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                moreOptionsMenu.classList.toggle('show');
            });

            // 点击页面其他地方关闭更多选项菜单
            document.addEventListener('click', function(e) {
                if (moreOptionsMenu && !moreOptionsMenu.contains(e.target) && e.target !== moreOptionsBtn) {
                    moreOptionsMenu.classList.remove('show');
                }
            });

            // 储备空间选项
            storageOption.addEventListener('click', showStorageModal);

            // 关闭存储空间弹窗
            closeStorageModal.addEventListener('click', function() {
                storageModal.classList.remove('show');
            });

            // 点击背景关闭存储空间弹窗
            storageModal.addEventListener('click', function(e) {
                if (e.target === storageModal) {
                    storageModal.classList.remove('show');
                }
            });
            
            // 修复滑动翻页 + 手势方向锁定
            let isSwiping = false;
            let swipeAxis = null;
            
            pagesContainer.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwiping = false;
                swipeAxis = null;
            }, { passive: true });
            
            pagesContainer.addEventListener('touchmove', (e) => {
                if (!touchStartX) return;
                
                touchEndX = e.touches[0].clientX;
                touchEndY = e.touches[0].clientY;
                
                // 计算滑动距离
                const diffX = touchStartX - touchEndX;
                const diffY = touchStartY - touchEndY;

                if (!swipeAxis) {
                    if (Math.abs(diffX) > Math.abs(diffY) + 6) {
                        swipeAxis = 'x';
                    } else if (Math.abs(diffY) > Math.abs(diffX) + 6) {
                        swipeAxis = 'y';
                    }
                }

                if (swipeAxis === 'y') {
                    // 垂直滚动，交给系统处理
                    return;
                }
                
                // 阻止横向切页时的默认行为，防止与垂直滚动竞争
                if (swipeAxis === 'x' && Math.abs(diffX) > 10) {
                    e.preventDefault();
                    isSwiping = true;
                }
            }, { passive: false });
            
            pagesContainer.addEventListener('touchend', () => {
                if (!touchStartX || !isSwiping || swipeAxis !== 'x') {
                    touchStartX = 0;
                    touchEndX = 0;
                    touchStartY = 0;
                    touchEndY = 0;
                    isSwiping = false;
                    swipeAxis = null;
                    return;
                }
                
                const diffX = touchStartX - touchEndX;
                
                if (Math.abs(diffX) > minSwipeDistance) {
                    if (diffX > 0 && currentPage < 1) {
                        // 向左滑动，切换到下一页
                        switchPage(currentPage + 1);
                    } else if (diffX < 0 && currentPage > 0) {
                        // 向右滑动，切换到上一页
                        switchPage(currentPage - 1);
                    }
                }
                
                // 重置触摸点
                touchStartX = 0;
                touchEndX = 0;
                touchStartY = 0;
                touchEndY = 0;
                isSwiping = false;
                swipeAxis = null;
            }, { passive: true });
            
            // 点击合集浮窗外区域关闭浮窗
            collectionDetailModal.addEventListener('click', (e) => {
                if (e.target === collectionDetailModal) {
                    hideCollectionDetail();
                }
            });
            
            // 点击添加菜单外区域关闭菜单
            addMenu.addEventListener('click', (e) => {
                if (e.target === addMenu) {
                    hideAddMenu();
                }
            });
            
            // 点击添加合集模态框外区域关闭模态框
            addCollectionModal.addEventListener('click', (e) => {
                if (e.target === addCollectionModal) {
                    hideAddCollectionModal();
                }
            });
        }
        
        // 初始化应用
        async function initApp() {
            // 监听点击事件并通知父页面，用于自动缩小全局播放器
            document.addEventListener('click', () => {
                window.parent.postMessage({ type: 'iframe_click' }, _getPostTargetOrigin());
            }, true);

            try {
                await initDB();
            } catch (e) {
                console.error("初始化数据库失败:", e);
                showToast("由于数据库初始化失败，本地音乐保存功能可能无法正常使用");
            }
            await initPlayer();
            initEventListeners();
            initA11y();

            updateTurntableLayout();
            if (window.EventBus) {
                window.EventBus.on('resize:throttled', updateTurntableLayout);
                window.EventBus.on('visualViewport:resize', updateTurntableLayout);
            } else {
                window.addEventListener('resize', updateTurntableLayout);
            }
            
            // 初始化同步一次状态到全局播放器
            if (typeof syncGlobalPlayerStatus === 'function') {
                syncGlobalPlayerStatus();
            }

            try {
                window.parent.postMessage({ type: 'app_ready', appId: 'yinyue' }, _getPostTargetOrigin());
            } catch (e) {
                console.error('Failed to send app_ready message:', e);
            }
        }
        
        // === 全局命令处理逻辑 ===
        function handleGlobalCommand(command) {
            if (!command || !command.type) return;
            
            // 检查命令 ID，避免重复执行（postMessage 和 storage 事件可能会触发两次）
            if (command.id && command.id === lastCommandId) {
                return;
            }
            lastCommandId = command.id;
            
            // 检查时间戳，避免处理过旧的命令（例如页面刷新后从 localStorage 读到的旧数据）
            if (command.timestamp && Date.now() - command.timestamp > 5000) {
                return;
            }
            
            switch(command.type) {
                case 'toggle':
                    lastPauseSource = 'global'; // 明确标记来源
                    togglePlayPause();
                    break;
                case 'prev':
                    lastPauseSource = 'global';
                    playPrev();
                    break;
                case 'next':
                    lastPauseSource = 'global';
                    playNext();
                    break;
            }
            // 命令处理完后立即同步一次状态，确保 pauseSource 及时更新
            syncGlobalPlayerStatus();
        }

        // 监听来自 parent 的 postMessage
        window.addEventListener('message', (e) => {
            if (!_isAllowedMessageOrigin(e.origin)) return;
            if (e.data && e.data.type) {
                if (e.data.type === 'app:ready') {
                    if (!_musicAppReadyReceived) {
                        _musicAppReadyReceived = true;
                        initApp();
                    }
                    return;
                }
                handleGlobalCommand(e.data);
            }
        });

        // 监听来自其他页面的 storage 事件
        window.addEventListener('storage', (e) => {
            if (e.key === 'global_music_command' && e.newValue) {
                try {
                    const command = JSON.parse(e.newValue);
                    handleGlobalCommand(command);
                } catch (err) {
                    console.error("解析全局命令失败:", err);
                }
            }
        });

        // 页面加载完成后初始化应用
        var _musicAppReadyReceived = false;
        var _musicAppInitialized = false;
        
        function waitForReadyAndInit() {
            var isInIframe = window.parent && window.parent !== window;
            if (isInIframe) {
                setTimeout(function() {
                    if (!_musicAppReadyReceived && !_musicAppInitialized) {
                        _musicAppInitialized = true;
                        initApp();
                    }
                }, 500);
            } else {
                _musicAppInitialized = true;
                initApp();
            }
        }
        window.addEventListener('DOMContentLoaded', waitForReadyAndInit);
