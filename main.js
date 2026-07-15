(function() {
    'use strict';

    var isAndroid = /Android/i.test(navigator.userAgent || '');
    var isOpera = /OPR\/|Opera/i.test(navigator.userAgent || '');
    var isAndroidOpera = isAndroid && isOpera;

    if (isAndroidOpera) {
        document.documentElement.classList.add('ua-android-opera');
    }

    var _debugEnabled = (function() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('debug') === '1';
        } catch (e) { return false; }
    })();

    function _dbg(line) { if (_debugEnabled) console.log('[OfflineMode]', line); }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function formatTime(timeString) {
        var date = new Date(timeString);
        if (isNaN(date.getTime())) return '';
        var now = new Date();
        if (date.toDateString() === now.toDateString()) {
            var h = date.getHours().toString();
            var m = date.getMinutes().toString();
            return (h.length < 2 ? '0' + h : h) + ':' + (m.length < 2 ? '0' + m : m);
        }
        var yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            var h2 = date.getHours().toString();
            var m2 = date.getMinutes().toString();
            return '昨天 ' + (h2.length < 2 ? '0' + h2 : h2) + ':' + (m2.length < 2 ? '0' + m2 : m2);
        }
        var h3 = date.getHours().toString();
        var m3 = date.getMinutes().toString();
        return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + (h3.length < 2 ? '0' + h3 : h3) + ':' + (m3.length < 2 ? '0' + m3 : m3);
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function beautifyMessageText(text) {
        if (!text || typeof text !== 'string') return '';
        var result = escapeHtml(text);
        result = result.replace(/\*([^*]+)\*/g, function(match, p1) {
            if (match.indexOf('**') === 0 && match.lastIndexOf('**') === match.length - 2) return match;
            return '<span class="text-whisper">' + p1 + '</span>';
        });
        result = result.replace(/（心里话[：:]\s*([^）]+)）/g, '<span class="text-whisper">$1</span>');
        result = result.replace(/\(心里话[：:]\s*([^)]+)\)/g, '<span class="text-whisper">$1</span>');
        result = result.replace(/\*\*([^*]+)\*\*/g, '<span class="text-highlight">$1</span>');
        result = result.replace(/"([^"]+)"/g, '<span class="text-quote">"$1"</span>');
        result = result.replace(/「([^」]+)」/g, '<span class="text-quote">「$1」</span>');
        result = result.replace(/\n/g, '<br>');
        return result;
    }

    var StorageManager = {
        _appDataCache: null,
        _appDataLoading: null,
        
        getAppData: function() {
            try {
                var raw = localStorage.getItem('chat20.appData');
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        },

        getAppDataAsync: async function() {
            if (this._appDataCache) {
                return this._appDataCache;
            }
            if (this._appDataLoading) {
                return this._appDataLoading;
            }
            
            this._appDataLoading = (async () => {
                var localData = this.getAppData();
                if (localData && localData.contacts && localData.contacts.length > 0) {
                    this._appDataCache = localData;
                    return localData;
                }
                
                if (window.Core && window.Core.StorageService) {
                    try {
                        var idbData = await window.Core.StorageService.getAppData('wechatAppData');
                        if (idbData && idbData.contacts) {
                            this._appDataCache = idbData;
                            return idbData;
                        }
                    } catch (e) {
                        console.error('[StorageManager] 从IndexedDB获取数据失败:', e);
                    }
                }
                
                return localData;
            })();
            
            var result = await this._appDataLoading;
            this._appDataLoading = null;
            return result;
        },

        getContact: function(friendId) {
            var appData = this.getAppData();
            if (!appData || !appData.contacts) return null;
            for (var i = 0; i < appData.contacts.length; i++) {
                if (appData.contacts[i].id === friendId) {
                    return appData.contacts[i];
                }
            }
            return null;
        },

        getContactAsync: async function(friendId) {
            var appData = await this.getAppDataAsync();
            if (!appData || !appData.contacts) return null;
            for (var i = 0; i < appData.contacts.length; i++) {
                if (appData.contacts[i] && appData.contacts[i].id === friendId) {
                    return appData.contacts[i];
                }
            }
            return null;
        },

        getChatByContactId: function(friendId) {
            var appData = this.getAppData();
            if (!appData || !appData.chats) return null;
            for (var i = 0; i < appData.chats.length; i++) {
                if (appData.chats[i].contactId === friendId) {
                    return appData.chats[i];
                }
            }
            return null;
        },

        getChatByContactIdAsync: async function(friendId) {
            var appData = await this.getAppDataAsync();
            if (!appData || !appData.chats) return null;
            for (var i = 0; i < appData.chats.length; i++) {
                if (appData.chats[i] && appData.chats[i].contactId === friendId) {
                    return appData.chats[i];
                }
            }
            return null;
        },

        getUserProfile: function() {
            try {
                var raw = localStorage.getItem('chat20.userProfile');
                return raw ? JSON.parse(raw) : { name: '我' };
            } catch (e) { return { name: '我' }; }
        },

        getPersonaLibrary: function() {
            try {
                var raw = localStorage.getItem('chat20.personaLibrary');
                if (!raw) {
                    raw = localStorage.getItem('personaLibrary');
                }
                if (!raw) return { list: [], defaultId: '' };
                var data = JSON.parse(raw);
                var list = Array.isArray(data) ? data : (data.list || []);
                var defaultId = localStorage.getItem('chat20.personaDefaultId') || data.defaultId || '';
                return { list: list, defaultId: defaultId };
            } catch (e) { return { list: [], defaultId: '' }; }
        },

        getFriendMyPersonaId: function(friendId) {
            try {
                var raw = localStorage.getItem('friendMyPersonaSettings');
                var all = raw ? JSON.parse(raw) : {};
                return all[friendId] || null;
            } catch (e) { return null; }
        },

        getUserPersonaInfo: function(friendId) {
            var library = this.getPersonaLibrary();
            var personaId = this.getFriendMyPersonaId(friendId);
            var effectiveId = personaId || library.defaultId;
            
            if (effectiveId && library.list) {
                for (var i = 0; i < library.list.length; i++) {
                    if (library.list[i] && library.list[i].id === effectiveId) {
                        return library.list[i];
                    }
                }
            }
            return null;
        },

        getUserDisplayName: function(friendId) {
            var persona = this.getUserPersonaInfo(friendId);
            if (persona && persona.name) return persona.name;
            
            var profile = this.getUserProfile();
            return (profile && profile.name) ? profile.name : '我';
        },

        getUserPersonaAvatar: function(friendId) {
            var persona = this.getUserPersonaInfo(friendId);
            if (persona && persona.avatar) return persona.avatar;
            return null;
        },

        getAIServiceConfig: function() {
            try {
                var raw = localStorage.getItem('ai_service_config');
                if (!raw) return null;
                var data = JSON.parse(raw);
                if (!data || !data.profiles || data.profiles.length === 0) return null;
                var activeId = data.activeId || data.profiles[0].id;
                for (var i = 0; i < data.profiles.length; i++) {
                    if (data.profiles[i].id === activeId) {
                        return data.profiles[i];
                    }
                }
                return data.profiles[0];
            } catch (e) { return null; }
        },

        getFriendPersonaSettings: function(friendId) {
            if (!friendId) return null;
            try {
                var raw = localStorage.getItem('chat20.friendPersonaSettings');
                var all = raw ? JSON.parse(raw) : {};
                return all[friendId] || null;
            } catch (e) { return null; }
        },

        getGlobalPromptSettings: function() {
            try {
                var systemPrompt = localStorage.getItem('chat20.userSystemPrompt') || '';
                return { systemPrompt: systemPrompt };
            } catch (e) { return { systemPrompt: '' }; }
        },

        getWorldBookContent: async function() {
            try {
                if (window.Core && window.Core.StorageService) {
                    var content = await window.Core.StorageService.getAppData('worldBookContent');
                    return content || '';
                }
            } catch (e) {}
            return '';
        },

        buildUserPersonaText: function(friendId, baseName) {
            var text = String(baseName || '').trim();
            var library = this.getPersonaLibrary();
            var list = library.list || [];
            var defaultId = library.defaultId || '';
            
            var selectedId = this.getFriendMyPersonaId(friendId) || '';
            var effectiveId = selectedId || defaultId;
            
            if (effectiveId) {
                var profile = null;
                for (var i = 0; i < list.length; i++) {
                    if (list[i] && list[i].id === effectiveId) {
                        profile = list[i];
                        break;
                    }
                }
                if (profile) {
                    var name = profile.name || '';
                    var desc = profile.description || profile.summary || '';
                    var lines = [];
                    if (name) lines.push('人设名称：' + name);
                    if (desc) lines.push('人设描述：' + desc);
                    if (lines.length) {
                        text = text ? (text + '\n' + lines.join('\n')) : lines.join('\n');
                    }
                }
            }
            
            return text || String(baseName || '').trim();
        },

        resolveFriendPersonaPrompt: function(personaData) {
            if (!personaData) return '';
            
            var result = '';
            
            if (typeof personaData === 'string') {
                result = personaData;
            } else if (typeof personaData === 'object') {
                if (personaData.prompt) {
                    result = personaData.prompt;
                }
                if (personaData.charDesc) {
                    result = result ? (result + '\n\n' + personaData.charDesc) : personaData.charDesc;
                }
            }
            
            return result;
        },

        getFriendPersonaExamples: function(friendId) {
            var settings = this.getFriendPersonaSettings(friendId);
            if (settings && settings.examples) {
                return settings.examples;
            }
            return '';
        },

        getFriendPersonaTemperature: function(friendId) {
            var settings = this.getFriendPersonaSettings(friendId);
            if (settings && settings.temperature !== undefined) {
                return Number(settings.temperature);
            }
            return 0.8;
        },

        getFriendPersonaTopP: function(friendId) {
            var settings = this.getFriendPersonaSettings(friendId);
            if (settings && settings.topP !== undefined && settings.topP !== null) {
                return Number(settings.topP);
            }
            return undefined;
        },

        getFriendPersonaFreqPenalty: function(friendId) {
            var settings = this.getFriendPersonaSettings(friendId);
            if (settings && settings.freqPenalty !== undefined && settings.freqPenalty !== null) {
                return Number(settings.freqPenalty);
            }
            return undefined;
        },

        getFriendPersonaMaxTokens: function(friendId) {
            var settings = this.getFriendPersonaSettings(friendId);
            if (settings && settings.maxTokens !== undefined && settings.maxTokens !== null) {
                return Number(settings.maxTokens);
            }
            return undefined;
        },

        validateFriendId: function(friendId) {
            if (!friendId || typeof friendId !== 'string') {
                return { valid: false, reason: 'friendId必须是非空字符串' };
            }
            if (!/^[a-z0-9]+$/i.test(friendId)) {
                return { valid: false, reason: 'friendId格式无效' };
            }
            var appData = this.getAppData();
            if (!appData || !appData.contacts) {
                return { valid: true, deferred: true };
            }
            var exists = false;
            for (var i = 0; i < appData.contacts.length; i++) {
                if (appData.contacts[i] && appData.contacts[i].id === friendId) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                return { valid: false, reason: '好友不存在于联系人列表' };
            }
            return { valid: true };
        },

        validateFriendIdAsync: async function(friendId) {
            if (!friendId || typeof friendId !== 'string') {
                return { valid: false, reason: 'friendId必须是非空字符串' };
            }
            if (!/^[a-z0-9]+$/i.test(friendId)) {
                return { valid: false, reason: 'friendId格式无效' };
            }
            var appData = await this.getAppDataAsync();
            if (!appData || !appData.contacts) {
                return { valid: false, reason: '无法获取联系人数据' };
            }
            var exists = false;
            for (var i = 0; i < appData.contacts.length; i++) {
                if (appData.contacts[i] && appData.contacts[i].id === friendId) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                return { valid: false, reason: '好友不存在于联系人列表' };
            }
            return { valid: true };
        },

        getOfflineMessages: function(friendId) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] getOfflineMessages验证失败:', validation.reason);
                return [];
            }
            try {
                var key = 'chat20.offlineMessages.' + friendId;
                var raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        },

        getOfflineMessagesAsync: async function(friendId) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] getOfflineMessagesAsync验证失败:', validation.reason);
                return [];
            }
            try {
                if (window.Core && window.Core.StorageService) {
                    var data = await window.Core.StorageService.getAppData('offlineMessages.' + friendId);
                    if (data && Array.isArray(data)) return data;
                }
                var key = 'chat20.offlineMessages.' + friendId;
                var raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        },

        saveOfflineMessages: function(friendId, messages) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] saveOfflineMessages验证失败:', validation.reason);
                return;
            }
            try {
                var key = 'chat20.offlineMessages.' + friendId;
                localStorage.setItem(key, JSON.stringify(messages));
            } catch (e) { console.error('[StorageManager] 保存线下消息失败:', e); }
        },

        saveOfflineMessagesAsync: async function(friendId, messages) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] saveOfflineMessagesAsync验证失败:', validation.reason);
                return;
            }
            try {
                if (window.Core && window.Core.StorageService) {
                    await window.Core.StorageService.setAppData('offlineMessages.' + friendId, messages);
                }
                var key = 'chat20.offlineMessages.' + friendId;
                localStorage.setItem(key, JSON.stringify(messages));
            } catch (e) { console.error('[StorageManager] 保存线下消息失败:', e); }
        },

        getOfflineMessageCount: async function(friendId) {
            var messages = await this.getOfflineMessagesAsync(friendId);
            return messages.length;
        },

        getOfflineSettings: function(friendId) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] getOfflineSettings验证失败:', validation.reason);
                return this.getDefaultSettings();
            }
            try {
                var key = 'chat20.offlineSettings.' + friendId;
                var raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : this.getDefaultSettings();
            } catch (e) { return this.getDefaultSettings(); }
        },

        saveOfflineSettings: function(friendId, settings) {
            var validation = this.validateFriendId(friendId);
            if (!validation.valid) {
                console.error('[StorageManager] saveOfflineSettings验证失败:', validation.reason);
                return;
            }
            try {
                var key = 'chat20.offlineSettings.' + friendId;
                localStorage.setItem(key, JSON.stringify(settings));
            } catch (e) { console.error('[StorageManager] 保存线下设置失败:', e); }
        },

        getDefaultSettings: function() {
            return {
                aiWordCount: 500,
                aiStyle: '',
                viewpoint: 'first',
                bgStyle: 'default',
                customBgColor: '#f8f5f2',
                cardStyle: 'rounded',
                cardOpacity: 0.95,
                darkMode: false,
                autoSync: false
            };
        },

        getSummary: function(friendId) {
            if (!friendId) return '';
            try {
                return localStorage.getItem('chat20.summaries.' + friendId) || '';
            } catch (e) { return ''; }
        },

        getMilestones: function(friendId) {
            if (!friendId) return '';
            try {
                return localStorage.getItem('chat20.milestones.' + friendId) || '';
            } catch (e) { return ''; }
        },

        getFriendAvatar: function(friendId) {
            if (!friendId) return null;
            try {
                return localStorage.getItem('avatar_' + friendId);
            } catch (e) { return null; }
        },

        getUserAvatar: function() {
            try {
                return localStorage.getItem('user_avatar');
            } catch (e) { return null; }
        },

        saveSummary: function(friendId, summary) {
            if (!friendId) return;
            try {
                localStorage.setItem('chat20.summaries.' + friendId, summary);
            } catch (e) {}
        },

        getAvatarFromIDB: function(idbKey) {
            return new Promise(function(resolve) {
                if (!idbKey || idbKey.indexOf('idb:') !== 0) {
                    resolve(null);
                    return;
                }
                var id = idbKey.slice(4);
                if (!window.Core || !window.Core.StorageService) {
                    resolve(null);
                    return;
                }
                window.Core.StorageService.transaction('PhoneAppImages', ['images'], function(tx) {
                    return new Promise(function(res, rej) {
                        var store = tx.objectStore('images');
                        var request = store.get(id);
                        request.onsuccess = function() {
                            var result = request.result;
                            if (result && result.data) {
                                res(result.data);
                            } else {
                                res(null);
                            }
                        };
                        request.onerror = function() {
                            res(null);
                        };
                    });
                }).then(function(data) {
                    resolve(data);
                }).catch(function() {
                    resolve(null);
                });
            });
        }
    };

    var OfflineAIService = {
        _fixUrl: function(base, suffix) {
            var url = String(base || '').trim();
            if (!url) return '';
            if (url.indexOf(suffix) !== -1) return url;
            if (url.indexOf('/messages') !== -1 || url.indexOf('/completions') !== -1) return url;
            if (url.slice(-3) === '/v1' || url.slice(-4) === '/v1/') {
                return url.replace(/\/+$/, '') + suffix;
            }
            return url.replace(/\/+$/, '') + '/v1' + suffix;
        },

        isAvailable: function() {
            var config = StorageManager.getAIServiceConfig();
            return !!(config && config.enabled !== false && config.url && config.key);
        },

        generateResponse: async function(messages, options) {
            var config = StorageManager.getAIServiceConfig();
            if (!config || config.enabled === false || !config.url || !config.key) {
                throw new Error('AI服务未配置或未启用');
            }

            var timeout = options.timeout || 90000;
            var hardTimeout = timeout + 5000;
            var controller = null;
            var timeoutId = null;
            var hardTimeoutId = null;
            var signal = undefined;
            var settled = false;

            var requestBody = {
                model: config.model || 'gpt-3.5-turbo',
                messages: messages,
                temperature: options.temperature !== undefined ? options.temperature : 0.8,
                max_tokens: options.max_tokens || 500
            };

            if (options.topP !== undefined) requestBody.top_p = options.topP;
            else if (config.topP !== undefined) requestBody.top_p = config.topP;
            
            if (options.freqPenalty !== undefined) requestBody.frequency_penalty = options.freqPenalty;
            else if (config.freqPenalty !== undefined) requestBody.frequency_penalty = config.freqPenalty;
            
            if (config.temp !== undefined) requestBody.temperature = config.temp;
            if (config.maxTokens !== undefined) requestBody.max_tokens = config.maxTokens;

            var fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.key
                },
                body: JSON.stringify(requestBody)
            };

            if (typeof AbortController !== 'undefined') {
                controller = new AbortController();
                signal = controller.signal;
                fetchOptions.signal = signal;
                timeoutId = setTimeout(function() {
                    if (settled) return;
                    settled = true;
                    try { controller.abort(); } catch (e) {}
                }, timeout);
                hardTimeoutId = setTimeout(function() {
                    if (settled) return;
                    settled = true;
                    try { controller.abort(); } catch (e) {}
                }, hardTimeout);
            }

            var finalUrl = this._fixUrl(config.url, '/chat/completions');
            var fetchPromise = fetch(finalUrl, fetchOptions);

            var timeoutPromise = new Promise(function(resolve, reject) {
                setTimeout(function() {
                    if (settled) return;
                    settled = true;
                    reject(new Error('请求超时，请检查网络连接'));
                }, hardTimeout);
            });

            var response;
            try {
                if (typeof AbortController !== 'undefined') {
                    response = await fetchPromise;
                } else {
                    response = await Promise.race([fetchPromise, timeoutPromise]);
                }

                if (timeoutId) clearTimeout(timeoutId);

                if (!response.ok) {
                    settled = true;
                    if (hardTimeoutId) clearTimeout(hardTimeoutId);
                    var errText = await response.text();
                    var errorMsg = 'HTTP ' + response.status;
                    if (response.status === 401) errorMsg = '认证失败：API密钥无效';
                    else if (response.status === 404) errorMsg = 'API地址无效(404)，请检查URL是否正确';
                    else if (response.status === 429) errorMsg = '请求频率过高，请稍后重试';
                    else if (response.status >= 500) errorMsg = '服务器错误，请稍后重试';
                    throw new Error(errorMsg);
                }

                var data = await response.json();
                settled = true;
                if (hardTimeoutId) clearTimeout(hardTimeoutId);
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    return data.choices[0].message.content;
                }
                throw new Error('AI未返回有效内容');
            } catch (e) {
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                if (hardTimeoutId) clearTimeout(hardTimeoutId);
                if (e.name === 'AbortError') {
                    throw new Error('请求超时，请检查网络连接');
                }
                if (e instanceof SyntaxError) throw new Error('AI返回数据格式错误');
                console.error('[OfflineAIService] 请求失败:', e);
                throw e;
            }
        },

        buildConversationHistory: function(messages, maxCount) {
            var history = [];
            var recentMessages = messages.slice(-maxCount);
            for (var i = 0; i < recentMessages.length; i++) {
                var msg = recentMessages[i];
                history.push({
                    role: msg.sender === 'me' ? 'user' : 'assistant',
                    content: msg.text
                });
            }
            return history;
        }
    };

    function OfflineModeApp() {
        if (OfflineModeApp.instance) return OfflineModeApp.instance;
        OfflineModeApp.instance = this;

        this.friendId = null;
        this.contactInfo = null;
        this.personaSettings = null;
        this.userInfo = null;
        this.messages = [];
        this.settings = {};
        this.isTyping = false;
        this.confirmCallback = null;
        this._inBFCache = false;
        this._isLoading = false;
        this.elements = {};

        this.init();
    }

    OfflineModeApp.instance = null;

    OfflineModeApp.prototype.resetState = function() {
        this.friendId = null;
        this.contactInfo = null;
        this.personaSettings = null;
        this.userInfo = null;
        this.messages = [];
        this.settings = StorageManager.getDefaultSettings();
        this.isTyping = false;
        this.confirmCallback = null;
        this._inBFCache = false;
        this._isLoading = false;
        
        this.hideTypingIndicator();
        
        if (this.elements.messagesList) {
            var existingMessages = this.elements.messagesList.querySelectorAll('.offline-message-card');
            for (var i = 0; i < existingMessages.length; i++) {
                var el = existingMessages[i];
                var url1 = el.getAttribute('data-temp-url');
                var url2 = el.getAttribute('data-temp-url-user');
                if (url1 && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    try { URL.revokeObjectURL(url1); } catch (e) {}
                }
                if (url2 && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                    try { URL.revokeObjectURL(url2); } catch (e) {}
                }
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = 'auto';
        }
        if (this.elements.welcomeView) {
            this.elements.welcomeView.style.display = 'flex';
        }
        this.closeSettings();
        this.closeTextEditor();
        this.closeConfirm();
    };

    OfflineModeApp.prototype.init = async function() {
        _dbg('初始化线下模式应用');
        this.cacheElements();
        this.friendId = this.getFriendIdFromUrl();
        await this.loadData();
        this.bindEvents();
        this.render();
        _dbg('初始化完成');
    };

    OfflineModeApp.prototype.cacheElements = function() {
        this.elements = {
            pageBg: document.getElementById('page-bg'),
            headerTitle: document.getElementById('header-title'),
            backBtn: document.getElementById('back-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            messagesContainer: document.getElementById('messages-container'),
            messagesList: document.getElementById('messages-list'),
            welcomeView: document.getElementById('welcome-view'),
            messageInput: document.getElementById('message-input'),
            sendBtn: document.getElementById('send-btn'),
            textEditorBtn: document.getElementById('text-editor-btn'),
            textEditorPanel: document.getElementById('text-editor-panel'),
            textEditorBack: document.getElementById('text-editor-back'),
            textEditorTextarea: document.getElementById('text-editor-textarea'),
            textEditorInsert: document.getElementById('text-editor-insert'),
            textEditorCount: document.getElementById('text-editor-count'),
            settingsPage: document.getElementById('settings-page'),
            settingsBack: document.getElementById('settings-back'),
            aiWordCount: document.getElementById('ai-word-count'),
            aiStyle: document.getElementById('ai-style'),
            viewpointOptions: document.querySelectorAll('input[name="viewpoint"]'),
            bgPreviews: document.querySelectorAll('.offline-bg-preview'),
            bgStyle: document.getElementById('bg-style'),
            customBgColorItem: document.getElementById('custom-bg-color-item'),
            customBgColor: document.getElementById('custom-bg-color'),
            cardPreviews: document.querySelectorAll('.offline-card-preview'),
            cardStyle: document.getElementById('card-style'),
            cardOpacity: document.getElementById('card-opacity'),
            opacityValue: document.getElementById('opacity-value'),
            darkModeToggle: document.getElementById('dark-mode-toggle'),
            exportBtn: document.getElementById('export-btn'),
            importBtn: document.getElementById('import-btn'),
            importFile: document.getElementById('import-file'),
            clearBtn: document.getElementById('clear-btn'),
                syncToMainBtn: document.getElementById('sync-to-main-btn'),
                autoSyncToggle: document.getElementById('auto-sync-toggle'),
                confirmDialog: document.getElementById('confirm-dialog'),
                confirmMask: document.getElementById('confirm-mask'),
                confirmTitle: document.getElementById('confirm-title'),
                confirmMessage: document.getElementById('confirm-message'),
                confirmCancel: document.getElementById('confirm-cancel'),
                confirmOk: document.getElementById('confirm-ok'),
                toast: document.getElementById('toast'),
                toastText: document.getElementById('toast-text'),
                typingIndicator: document.getElementById('typing-indicator')
            };
        }

    OfflineModeApp.prototype.getFriendIdFromUrl = function() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('friendId') || null;
        } catch (e) { return null; }
    };

    OfflineModeApp.prototype.loadData = async function() {
        if (this._isLoading) return;
        this._isLoading = true;
        
        try {
            this.userInfo = StorageManager.getUserProfile();

            if (this.friendId) {
                this.contactInfo = await StorageManager.getContactAsync(this.friendId);
                this.personaSettings = StorageManager.getFriendPersonaSettings(this.friendId);
                this.messages = StorageManager.getOfflineMessages(this.friendId);
                this.settings = StorageManager.getOfflineSettings(this.friendId);
                this.userPersonaInfo = StorageManager.getUserPersonaInfo(this.friendId);
                
                _dbg('好友信息: ' + JSON.stringify(this.contactInfo));
                _dbg('人设设置: ' + JSON.stringify(this.personaSettings));
            } else {
                this.settings = StorageManager.getDefaultSettings();
            }
        } finally {
            this._isLoading = false;
        }
    };

    OfflineModeApp.prototype.getFriendDisplayName = function() {
        if (this.personaSettings && this.personaSettings.name) {
            return this.personaSettings.name;
        }
        if (this.contactInfo && this.contactInfo.name) {
            return this.contactInfo.name;
        }
        return '好友';
    };

    OfflineModeApp.prototype.bindEvents = function() {
            var self = this;
            this._eventListeners = [];

            function addListener(target, type, handler) {
                if (!target) return;
                target.addEventListener(type, handler);
                self._eventListeners.push({ target: target, type: type, handler: handler });
            }

            addListener(this.elements.backBtn, 'click', function() { self.handleBack(); });
            addListener(this.elements.settingsBtn, 'click', function() { self.openSettings(); });
            addListener(this.elements.settingsBack, 'click', function() { self.closeSettings(); });

            addListener(this.elements.sendBtn, 'click', function() { self.sendMessage(); });
            addListener(this.elements.messageInput, 'keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessage();
                }
            });
            addListener(this.elements.messageInput, 'input', function() { self.adjustInputHeight(); });

            addListener(this.elements.textEditorBtn, 'click', function() { self.openTextEditor(); });
            addListener(this.elements.textEditorBack, 'click', function() { self.closeTextEditor(); });
            addListener(this.elements.textEditorInsert, 'click', function() { self.insertTextFromEditor(); });
            addListener(this.elements.textEditorTextarea, 'input', function() { self.updateTextEditorCount(); });

            addListener(this.elements.aiWordCount, 'change', function() {
                self.settings.aiWordCount = parseInt(self.elements.aiWordCount.value) || 500;
                self.saveSettings();
                self.showToast('回复字数已设为 ' + self.settings.aiWordCount + ' 字', 'success');
            });

            addListener(this.elements.aiStyle, 'input', function() {
                self.settings.aiStyle = self.elements.aiStyle.value;
                self.saveSettings();
            });

            addListener(this.elements.aiStyle, 'change', function() {
                if (self.settings.aiStyle) {
                    self.showToast('文风设置已保存', 'success');
                }
            });

            var viewpointOptions = this.elements.viewpointOptions;
            for (var i = 0; i < viewpointOptions.length; i++) {
                (function(radio) {
                    addListener(radio, 'change', function(e) {
                        if (e.target.checked) {
                            self.settings.viewpoint = e.target.value;
                            self.saveSettings();
                            var label = e.target.value === 'first' ? '第一人称' : '第三人称';
                            self.showToast('视角已切换为' + label, 'success');
                        }
                    });
                })(viewpointOptions[i]);
            }

            var bgPreviews = this.elements.bgPreviews;
            for (var j = 0; j < bgPreviews.length; j++) {
                (function(preview) {
                    addListener(preview, 'click', function(e) {
                        var bg = e.currentTarget.dataset.bg;
                        self.settings.bgStyle = bg;
                        self.elements.bgStyle.value = bg;
                        var bgPrevs = self.elements.bgPreviews;
                        for (var k = 0; k < bgPrevs.length; k++) {
                            bgPrevs[k].classList.remove('active');
                        }
                        e.currentTarget.classList.add('active');
                        self.applyBgStyle();
                        self.saveSettings();
                        if (bg === 'custom') {
                            self.elements.customBgColorItem.style.display = 'flex';
                        } else {
                            self.elements.customBgColorItem.style.display = 'none';
                        }
                        self.showToast('背景样式已更新', 'success');
                    });
                })(bgPreviews[j]);
            }

            addListener(this.elements.customBgColor, 'change', function() {
                self.settings.customBgColor = self.elements.customBgColor.value;
                self.applyBgStyle();
                self.saveSettings();
            });

            var cardPreviews = this.elements.cardPreviews;
            for (var m = 0; m < cardPreviews.length; m++) {
                (function(preview) {
                    addListener(preview, 'click', function(e) {
                        var card = e.currentTarget.dataset.card;
                        self.settings.cardStyle = card;
                        self.elements.cardStyle.value = card;
                        var cardPrevs = self.elements.cardPreviews;
                        for (var n = 0; n < cardPrevs.length; n++) {
                            cardPrevs[n].classList.remove('active');
                        }
                        e.currentTarget.classList.add('active');
                        self.applyCardStyle();
                        self.saveSettings();
                        self.showToast('卡片样式已更新', 'success');
                    });
                })(cardPreviews[m]);
            }

            addListener(this.elements.cardOpacity, 'input', function() {
                self.settings.cardOpacity = parseFloat(self.elements.cardOpacity.value);
                self.applyCardOpacity();
                if (self.elements.opacityValue) {
                    self.elements.opacityValue.textContent = Math.round(self.settings.cardOpacity * 100) + '%';
                }
            });
            addListener(this.elements.cardOpacity, 'change', function() {
                self.saveSettings();
            });

            addListener(this.elements.darkModeToggle, 'click', function() { self.toggleDarkMode(); });

            addListener(this.elements.exportBtn, 'click', function() { self.exportMessages(); });
            addListener(this.elements.importBtn, 'click', function() { self.elements.importFile.click(); });
            addListener(this.elements.importFile, 'change', function(e) { self.importMessages(e); });
            addListener(this.elements.clearBtn, 'click', function() { self.confirmClearMessages(); });

            addListener(this.elements.syncToMainBtn, 'click', function() { self.syncToMain(); });
            addListener(this.elements.autoSyncToggle, 'click', function() {
                self.settings.autoSync = !self.settings.autoSync;
                self.elements.autoSyncToggle.setAttribute('aria-pressed', self.settings.autoSync);
                self.saveSettings();
                self.showToast(self.settings.autoSync ? '已开启自动同步' : '已关闭自动同步', 'success');
            });

            addListener(this.elements.confirmMask, 'click', function() { self.closeConfirm(); });
            addListener(this.elements.confirmCancel, 'click', function() { self.closeConfirm(); });
            addListener(this.elements.confirmOk, 'click', function() { self.handleConfirmOk(); });

            addListener(window, 'pagehide', function(e) {
                self.saveMessages();
                if (e.persisted) {
                    self._inBFCache = true;
                }
            });
            addListener(window, 'pageshow', function(e) {
                if (e.persisted || self._inBFCache) {
                    self._inBFCache = false;
                    var currentFriendId = self.getFriendIdFromUrl();
                    if (currentFriendId !== self.friendId) {
                        self.resetState();
                        self.friendId = currentFriendId;
                    }
                    self.loadData().then(function() { self.render(); });
                }
            });
            addListener(document, 'visibilitychange', function() {
                if (document.hidden) self.saveMessages();
            });
        };

    OfflineModeApp.prototype.unbindEvents = function() {
        if (!this._eventListeners) return;
        for (var i = 0; i < this._eventListeners.length; i++) {
            var listener = this._eventListeners[i];
            if (listener.target) {
                try {
                    listener.target.removeEventListener(listener.type, listener.handler);
                } catch (e) {}
            }
        }
        this._eventListeners = [];
    };

    OfflineModeApp.prototype.render = function() {
        this.renderHeader();
        this.renderMessages();
        this.applySettings();
        this.scrollToBottom();
    };

    OfflineModeApp.prototype.renderHeader = function() {
        var friendName = this.getFriendDisplayName();
        if (this.elements.headerTitle) {
            this.elements.headerTitle.textContent = friendName + ' · 线下模式';
        }
    };

    OfflineModeApp.prototype.renderMessages = function() {
        if (!this.elements.messagesList) return;
        var existingMessages = this.elements.messagesList.querySelectorAll('.offline-message-card');
        for (var i = 0; i < existingMessages.length; i++) {
            var el = existingMessages[i];
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }

        if (this.messages.length === 0) {
            if (this.elements.welcomeView) {
                this.elements.welcomeView.style.display = 'flex';
            }
            return;
        }

        if (this.elements.welcomeView) {
            this.elements.welcomeView.style.display = 'none';
        }
        for (var i = 0; i < this.messages.length; i++) {
            this.renderMessage(this.messages[i]);
        }
    };

    OfflineModeApp.prototype.renderMessage = function(msg) {
        var isSent = msg.sender === 'me';
        var messageEl = document.createElement('div');
        messageEl.className = 'offline-message-card card-style-' + (this.settings.cardStyle || 'rounded');
        messageEl.id = 'message-' + msg.id;

        var userName = (this.userPersonaInfo && this.userPersonaInfo.name) ? this.userPersonaInfo.name : StorageManager.getUserDisplayName(this.friendId);
        var friendName = this.getFriendDisplayName();
        
        var friendAvatarHtml = this.getFriendAvatarHtml(friendName, messageEl);
        var userAvatarHtml = this.getUserAvatarHtml(userName, messageEl);

        messageEl.innerHTML = 
            '<div class="offline-message-header">' +
                '<div class="offline-message-avatar offline-message-avatar-left">' + friendAvatarHtml + '</div>' +
                '<div class="offline-message-names">' +
                    '<span class="offline-message-name">' + friendName + '</span>' +
                    '<span class="offline-message-name-sep">&</span>' +
                    '<span class="offline-message-name">' + userName + '</span>' +
                '</div>' +
                '<div class="offline-message-avatar offline-message-avatar-right">' + userAvatarHtml + '</div>' +
            '</div>' +
            '<div class="offline-message-divider"></div>' +
            '<div class="offline-message-sender">' + (isSent ? userName : friendName) + '</div>' +
            '<div class="offline-message-content">' + beautifyMessageText(msg.text) + '</div>' +
            '<div class="offline-message-time">' + formatTime(msg.time) + '</div>';

        if (this.elements.messagesList) {
            this.elements.messagesList.appendChild(messageEl);
        }
    };

    OfflineModeApp.prototype.getFriendAvatarHtml = function(friendName, messageEl) {
        if (this.contactInfo && this.contactInfo.hasCustomAvatar) {
            var avatarData = StorageManager.getFriendAvatar(this.friendId);
            if (avatarData) {
                if (avatarData.indexOf('idb:') === 0) {
                    var avatarText = (this.contactInfo && this.contactInfo.avatarText) || friendName.charAt(0);
                    StorageManager.getAvatarFromIDB(avatarData).then(function(blob) {
                        if (!blob || !messageEl || !document.body.contains(messageEl)) return;
                        var avatarContainer = messageEl.querySelector('.offline-message-avatar-left');
                        if (!avatarContainer) return;
                        var src = '';
                        if (typeof blob === 'string') {
                            src = blob;
                        } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                            src = URL.createObjectURL(blob);
                            messageEl.setAttribute('data-temp-url', src);
                        }
                        if (src) {
                            avatarContainer.innerHTML = '<img src="' + src + '" alt="' + friendName + '">';
                        }
                    });
                    return '<span class="offline-message-avatar-text">' + avatarText + '</span>';
                }
                return '<img src="' + avatarData + '" alt="' + friendName + '">';
            }
        }
        var avatarColor = (this.contactInfo && this.contactInfo.avatarColor) || 'bg-sage';
        var avatarText = (this.contactInfo && this.contactInfo.avatarText) || friendName.charAt(0);
        return '<span class="offline-message-avatar-text">' + avatarText + '</span>';
    };

    OfflineModeApp.prototype.getUserAvatarHtml = function(userName, messageEl) {
        var personaAvatar = (this.userPersonaInfo && this.userPersonaInfo.avatar) ? this.userPersonaInfo.avatar : StorageManager.getUserPersonaAvatar(this.friendId);
        if (personaAvatar) {
            if (personaAvatar.indexOf('idb:') === 0) {
                StorageManager.getAvatarFromIDB(personaAvatar).then(function(blob) {
                    if (!blob || !messageEl || !document.body.contains(messageEl)) return;
                    var avatarContainer = messageEl.querySelector('.offline-message-avatar-right');
                    if (!avatarContainer) return;
                    var src = '';
                    if (typeof blob === 'string') {
                        src = blob;
                    } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                        src = URL.createObjectURL(blob);
                        messageEl.setAttribute('data-temp-url-user', src);
                    }
                    if (src) {
                        avatarContainer.innerHTML = '<img src="' + src + '" alt="' + userName + '">';
                    }
                }).catch(function(err) {
                    console.error('[getUserAvatarHtml] 获取IDB头像失败:', err);
                });
                return '<span class="offline-message-avatar-text">' + userName.charAt(0) + '</span>';
            }
            return '<img src="' + personaAvatar + '" alt="' + userName + '">';
        }
        
        var avatarData = StorageManager.getUserAvatar();
        if (avatarData) {
            if (avatarData.indexOf('idb:') === 0) {
                StorageManager.getAvatarFromIDB(avatarData).then(function(blob) {
                    if (!blob || !messageEl || !document.body.contains(messageEl)) return;
                    var avatarContainer = messageEl.querySelector('.offline-message-avatar-right');
                    if (!avatarContainer) return;
                    var src = '';
                    if (typeof blob === 'string') {
                        src = blob;
                    } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                        src = URL.createObjectURL(blob);
                        messageEl.setAttribute('data-temp-url-user', src);
                    }
                    if (src) {
                        avatarContainer.innerHTML = '<img src="' + src + '" alt="' + userName + '">';
                    }
                }).catch(function(err) {
                    console.error('[getUserAvatarHtml] 获取IDB头像失败:', err);
                });
                return '<span class="offline-message-avatar-text">' + userName.charAt(0) + '</span>';
            }
            return '<img src="' + avatarData + '" alt="' + userName + '">';
        }
        return '<span class="offline-message-avatar-text">' + userName.charAt(0) + '</span>';
    };

    OfflineModeApp.prototype.sendMessage = async function() {
        if (!this.elements.messageInput) return;
        var text = this.elements.messageInput.value.trim();
        if (!text || this.isTyping) return;

        var message = {
            id: generateId(),
            text: text,
            sender: 'me',
            time: new Date().toISOString()
        };

        this.messages.push(message);
        if (this.elements.welcomeView) {
            this.elements.welcomeView.style.display = 'none';
        }
        this.renderMessage(message);
        this.elements.messageInput.value = '';
        this.adjustInputHeight();
        this.scrollToBottom();
        this.saveMessages();

        if (OfflineAIService.isAvailable()) {
            await this.triggerAIResponse();
        } else {
            this.showToast('AI服务未配置，请在传讯中配置API', 'warning');
        }
    };

    OfflineModeApp.prototype.triggerAIResponse = async function() {
        if (this.isTyping) return;

        this.isTyping = true;
        this.showTypingIndicator();

        try {
            var systemPrompt = await this.buildSystemPrompt();
            var history = OfflineAIService.buildConversationHistory(this.messages, 20);
            var messages = [
                { role: 'system', content: systemPrompt }
            ];
            for (var i = 0; i < history.length; i++) {
                messages.push(history[i]);
            }

            var friendMaxTokens = StorageManager.getFriendPersonaMaxTokens(this.friendId);
            var maxTokens = friendMaxTokens !== undefined ? friendMaxTokens : (this.settings.aiWordCount || 500);
            var temperature = StorageManager.getFriendPersonaTemperature(this.friendId);
            var topP = StorageManager.getFriendPersonaTopP(this.friendId);
            var freqPenalty = StorageManager.getFriendPersonaFreqPenalty(this.friendId);

            var aiOptions = {
                temperature: temperature,
                max_tokens: maxTokens,
                timeout: 90000
            };
            if (topP !== undefined) aiOptions.topP = topP;
            if (freqPenalty !== undefined) aiOptions.freqPenalty = freqPenalty;

            var response = await OfflineAIService.generateResponse(messages, aiOptions);

            var aiMessage = {
                id: generateId(),
                text: response,
                sender: 'other',
                time: new Date().toISOString()
            };

            this.messages.push(aiMessage);
            this.hideTypingIndicator();
            this.renderMessage(aiMessage);
            this.scrollToBottom();
            this.saveMessages();

        } catch (e) {
            console.error('[OfflineMode] AI响应失败:', e);
            this.hideTypingIndicator();
            this.showToast('AI响应失败: ' + e.message, 'error');
        }

        this.isTyping = false;
    };

    OfflineModeApp.prototype.buildSystemPrompt = async function() {
        var friendName = this.getFriendDisplayName();
        var userName = StorageManager.getUserDisplayName(this.friendId);
        var globalPrompt = StorageManager.getGlobalPromptSettings();

        var prompt = '';

        if (globalPrompt.systemPrompt) {
            prompt = globalPrompt.systemPrompt
                .replace(/{char}/g, friendName)
                .replace(/{user}/g, userName);
        } else {
            prompt = '你是' + friendName + '，正在与' + userName + '进行深度对话。';
        }

        var friendPersonaPrompt = StorageManager.resolveFriendPersonaPrompt(this.personaSettings);
        if (friendPersonaPrompt) {
            prompt += '\n\n【角色设定】\n' + friendPersonaPrompt;
        }

        var examples = StorageManager.getFriendPersonaExamples(this.friendId);
        if (examples) {
            prompt += '\n\n【对话示例】\n' + examples;
        }

        var userPersonaText = StorageManager.buildUserPersonaText(this.friendId, userName);
        if (userPersonaText && userPersonaText !== userName) {
            prompt += '\n\n【用户人设】\n' + userPersonaText;
        }

        var worldBook = await StorageManager.getWorldBookContent();
        if (worldBook) {
            prompt += '\n\n【世界书/背景设定】\n' + worldBook;
        }

        if (this.settings.aiStyle) {
            prompt += '\n\n【文风要求】\n' + this.settings.aiStyle;
        }

        var viewpoint = this.settings.viewpoint || 'first';
        if (viewpoint === 'first') {
            prompt += '\n\n【视角】请使用第一人称视角进行叙述。';
        } else {
            prompt += '\n\n【视角】请使用第三人称视角进行叙述。';
        }

        var wordCount = this.settings.aiWordCount || 500;
        prompt += '\n\n【回复长度】请控制回复在' + wordCount + '字左右。';

        var summary = StorageManager.getSummary(this.friendId);
        if (summary) {
            prompt += '\n\n【记忆摘要】\n' + summary;
        }

        var milestones = StorageManager.getMilestones(this.friendId);
        if (milestones) {
            prompt += '\n\n【剧情里程碑】\n' + milestones;
        }

        return prompt;
    };

    OfflineModeApp.prototype.showTypingIndicator = function() {
        if (this.elements.typingIndicator) {
            this.elements.typingIndicator.style.display = 'flex';
        }
        this.scrollToBottom();
    };

    OfflineModeApp.prototype.hideTypingIndicator = function() {
        if (this.elements.typingIndicator) {
            this.elements.typingIndicator.style.display = 'none';
        }
    };

    OfflineModeApp.prototype.adjustInputHeight = function() {
        var input = this.elements.messageInput;
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    };

    OfflineModeApp.prototype.scrollToBottom = function() {
        var self = this;
        setTimeout(function() {
            if (self.elements.messagesContainer) {
                self.elements.messagesContainer.scrollTop = self.elements.messagesContainer.scrollHeight;
            }
        }, 50);
    };

    OfflineModeApp.prototype.saveMessages = function() {
        if (this.friendId) {
            StorageManager.saveOfflineMessages(this.friendId, this.messages);
            if (window.Core && window.Core.StorageService) {
                StorageManager.saveOfflineMessagesAsync(this.friendId, this.messages);
            }
        }
    };

    OfflineModeApp.prototype.saveSettings = function() {
        if (this.friendId) {
            StorageManager.saveOfflineSettings(this.friendId, this.settings);
        }
    };

    OfflineModeApp.prototype.applySettings = function() {
        if (this.elements.aiWordCount) {
            this.elements.aiWordCount.value = this.settings.aiWordCount || 500;
        }
        if (this.elements.aiStyle) {
            this.elements.aiStyle.value = this.settings.aiStyle || '';
        }
        
        if (this.elements.viewpointOptions) {
            for (var i = 0; i < this.elements.viewpointOptions.length; i++) {
                var radio = this.elements.viewpointOptions[i];
                radio.checked = radio.value === (this.settings.viewpoint || 'first');
            }
        }

        if (this.elements.bgStyle) {
            this.elements.bgStyle.value = this.settings.bgStyle || 'default';
        }
        if (this.elements.bgPreviews) {
            for (var j = 0; j < this.elements.bgPreviews.length; j++) {
                var preview = this.elements.bgPreviews[j];
                preview.classList.toggle('active', preview.dataset.bg === (this.settings.bgStyle || 'default'));
            }
        }
        if (this.settings.bgStyle === 'custom' && this.elements.customBgColorItem) {
            this.elements.customBgColorItem.style.display = 'flex';
        }
        if (this.elements.customBgColor) {
            this.elements.customBgColor.value = this.settings.customBgColor || '#f8f5f2';
        }

        if (this.elements.cardStyle) {
            this.elements.cardStyle.value = this.settings.cardStyle || 'rounded';
        }
        if (this.elements.cardPreviews) {
            for (var k = 0; k < this.elements.cardPreviews.length; k++) {
                var cp = this.elements.cardPreviews[k];
                cp.classList.toggle('active', cp.dataset.card === (this.settings.cardStyle || 'rounded'));
            }
        }
        if (this.elements.cardOpacity) {
            this.elements.cardOpacity.value = this.settings.cardOpacity || 0.95;
        }
        if (this.elements.opacityValue) {
            this.elements.opacityValue.textContent = Math.round((this.settings.cardOpacity || 0.95) * 100) + '%';
        }

        if (this.elements.autoSyncToggle) {
            this.elements.autoSyncToggle.setAttribute('aria-pressed', this.settings.autoSync ? 'true' : 'false');
        }

        if (this.settings.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (this.elements.darkModeToggle) {
                this.elements.darkModeToggle.setAttribute('aria-pressed', 'true');
            }
        }

        this.applyBgStyle();
        this.applyCardStyle();
        this.applyCardOpacity();
        this.applyDarkMode();
    };

    OfflineModeApp.prototype.applyBgStyle = function() {
        var bg = this.elements.pageBg;
        if (!bg) return;
        bg.className = 'offline-page-bg';
        
        var style = this.settings.bgStyle || 'default';
        if (style === 'custom') {
            bg.classList.add('bg-custom');
            bg.style.setProperty('--custom-bg-color', this.settings.customBgColor || '#f8f5f2');
        } else if (style !== 'default') {
            bg.classList.add('bg-' + style);
        }
    };

    OfflineModeApp.prototype.applyCardStyle = function() {
        document.documentElement.style.setProperty('--offline-card-radius', 
            this.settings.cardStyle === 'sharp' ? '4px' :
            this.settings.cardStyle === 'soft' ? '20px' :
            this.settings.cardStyle === 'minimal' ? '2px' : '12px'
        );
        
        document.documentElement.style.setProperty('--offline-card-shadow',
            this.settings.cardStyle === 'soft' ? '0 8px 32px rgba(0, 0, 0, 0.12)' :
            this.settings.cardStyle === 'minimal' ? 'none' : '0 2px 12px rgba(0, 0, 0, 0.08)'
        );
        
        document.documentElement.style.setProperty('--offline-card-border',
            this.settings.cardStyle === 'minimal' ? '1px solid var(--offline-border)' : 'none'
        );
    };

    OfflineModeApp.prototype.applyCardOpacity = function() {
        document.documentElement.style.setProperty('--offline-card-opacity', this.settings.cardOpacity || 0.95);
    };

    OfflineModeApp.prototype.applyDarkMode = function() {
        if (this.settings.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.style.backgroundColor = '#1a1a1f';
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body.style.backgroundColor = '';
        }
    };

    OfflineModeApp.prototype.toggleDarkMode = function() {
        this.settings.darkMode = !this.settings.darkMode;
        this.applyDarkMode();
        if (this.elements.darkModeToggle) {
            this.elements.darkModeToggle.setAttribute('aria-pressed', this.settings.darkMode ? 'true' : 'false');
        }
        this.saveSettings();
        this.showToast(this.settings.darkMode ? '已开启深色模式' : '已关闭深色模式', 'success');
    };

    OfflineModeApp.prototype.openSettings = function() {
        if (this.elements.settingsPage) {
            this.elements.settingsPage.classList.add('active');
            this.elements.settingsPage.setAttribute('aria-hidden', 'false');
            var firstFocusable = this.elements.settingsPage.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                var self = this;
                setTimeout(function() { 
                    firstFocusable.focus(); 
                }, 100);
            }
        }
    };

    OfflineModeApp.prototype.closeSettings = function() {
        if (this.elements.settingsPage) {
            this.elements.settingsPage.classList.remove('active');
            this.elements.settingsPage.setAttribute('aria-hidden', 'true');
        }
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.focus();
        }
    };

    OfflineModeApp.prototype.openTextEditor = function() {
        if (this.elements.textEditorPanel) {
            this.elements.textEditorPanel.classList.add('active');
            this.elements.textEditorPanel.setAttribute('aria-hidden', 'false');
        }
        if (this.elements.textEditorTextarea && this.elements.messageInput) {
            this.elements.textEditorTextarea.value = this.elements.messageInput.value;
        }
        this.updateTextEditorCount();
        if (this.elements.textEditorTextarea) {
            this.elements.textEditorTextarea.focus();
        }
    };

    OfflineModeApp.prototype.closeTextEditor = function() {
        if (this.elements.textEditorPanel) {
            this.elements.textEditorPanel.classList.remove('active');
            this.elements.textEditorPanel.setAttribute('aria-hidden', 'true');
        }
        if (this.elements.textEditorTextarea) {
            this.elements.textEditorTextarea.value = '';
        }
    };

    OfflineModeApp.prototype.insertTextFromEditor = function() {
        if (!this.elements.messageInput || !this.elements.textEditorTextarea) return;
        this.elements.messageInput.value = this.elements.textEditorTextarea.value;
        this.adjustInputHeight();
        this.closeTextEditor();
        this.elements.messageInput.focus();
    };

    OfflineModeApp.prototype.updateTextEditorCount = function() {
        if (!this.elements.textEditorTextarea || !this.elements.textEditorCount) return;
        var count = this.elements.textEditorTextarea.value.length;
        this.elements.textEditorCount.textContent = count + ' 字';
    };

    OfflineModeApp.prototype.handleBack = function() {
        if (this.settings.autoSync && this.messages.length > 0) {
            this.syncToMain();
        }
        
        if (this.friendId) {
            var chat = StorageManager.getChatByContactId(this.friendId);
            if (chat) {
                window.location.href = '传讯.html?openChat=' + encodeURIComponent(chat.id);
            } else {
                window.location.href = '传讯.html?friendId=' + encodeURIComponent(this.friendId);
            }
        } else {
            window.location.href = '传讯.html';
        }
    };

    OfflineModeApp.prototype.syncToMain = function() {
        if (!this.friendId || this.messages.length === 0) {
            this.showToast('没有可同步的内容', 'info');
            return;
        }

        var lines = [];
        for (var i = 0; i < this.messages.length; i++) {
            var m = this.messages[i];
            lines.push((m.sender === 'me' ? '用户' : 'AI') + ': ' + m.text);
        }
        var conversationText = lines.join('\n');

        var keywords = this.extractKeywords(conversationText);
        
        var summary = StorageManager.getSummary(this.friendId) || '';
        summary += '\n[线下模式同步 ' + new Date().toLocaleDateString() + ']\n关键词: ' + keywords.join(', ');
        StorageManager.saveSummary(this.friendId, summary);

        this.showToast('已同步到普通对话', 'success');
    };

    OfflineModeApp.prototype.extractKeywords = function(text) {
        var stopWords = ['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '有', '和', '与', '或', '但', '如果', '因为', '所以', '可以', '会', '能', '要', '想', '去', '来', '到', '从', '向', '对', '把', '被', '让', '给', '很', '太', '更', '最', '都', '也', '还', '就', '才', '已经', '正在', '将', '会', '应该', '必须', '可能', '一定', '不', '没', '别', '只', '什么', '怎么', '为什么', '哪', '谁', '多少', '几', '怎样', '如何'];
        
        var allWords = text.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, ' ').split(/\s+/);
        var words = [];
        for (var i = 0; i < allWords.length; i++) {
            var w = allWords[i];
            if (w.length >= 2 && stopWords.indexOf(w) === -1) {
                words.push(w);
            }
        }
        
        var wordCount = {};
        for (var j = 0; j < words.length; j++) {
            var w = words[j];
            wordCount[w] = (wordCount[w] || 0) + 1;
        }
        
        var entries = [];
        for (var key in wordCount) {
            if (wordCount.hasOwnProperty(key)) {
                entries.push([key, wordCount[key]]);
            }
        }
        entries.sort(function(a, b) { return b[1] - a[1]; });
        var topEntries = entries.slice(0, 5);
        var result = [];
        for (var i = 0; i < topEntries.length; i++) {
            result.push(topEntries[i][0]);
        }
        return result;
    };

    OfflineModeApp.prototype.exportMessages = function() {
        if (!this.friendId) {
            this.showToast('无法导出：缺少好友信息', 'error');
            return;
        }

        var data = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            friendId: this.friendId,
            friendName: this.getFriendDisplayName(),
            messages: this.messages,
            settings: this.settings
        };

        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'offline-chat-' + this.friendId + '-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('导出成功', 'success');
    };

    OfflineModeApp.prototype.importMessages = function(e) {
        var file = e.target.files[0];
        if (!file) return;

        if (!this.friendId) {
            this.showToast('无法导入：未选择好友', 'error');
            e.target.value = '';
            return;
        }

        var maxFileSize = 5 * 1024 * 1024;
        if (file.size > maxFileSize) {
            this.showToast('导入失败：文件大小不能超过5MB', 'error');
            e.target.value = '';
            return;
        }

        var self = this;
        var reader = new FileReader();
        reader.onload = function(event) {
            try {
                var data = JSON.parse(event.target.result);
                
                if (!data.friendId) {
                    self.showToast('导入失败：数据缺少好友标识', 'error');
                    return;
                }
                if (data.friendId !== self.friendId) {
                    self.showToast('导入失败：该数据属于其他好友，无法导入', 'error');
                    return;
                }

                if (!data.messages || !Array.isArray(data.messages)) {
                    throw new Error('无效的数据格式：缺少消息列表');
                }

                var maxMessages = 1000;
                if (data.messages.length > maxMessages) {
                    throw new Error('消息数量超出限制（最多' + maxMessages + '条）');
                }

                for (var i = 0; i < data.messages.length; i++) {
                    var msg = data.messages[i];
                    if (!msg || typeof msg !== 'object') {
                        throw new Error('第' + (i + 1) + '条消息格式无效');
                    }
                    if (!msg.id || typeof msg.id !== 'string') {
                        throw new Error('第' + (i + 1) + '条消息缺少有效ID');
                    }
                    if (msg.text === undefined || msg.text === null) {
                        throw new Error('第' + (i + 1) + '条消息缺少内容');
                    }
                    if (!msg.sender || (msg.sender !== 'me' && msg.sender !== 'other')) {
                        throw new Error('第' + (i + 1) + '条消息发送者无效');
                    }
                    if (!msg.time || typeof msg.time !== 'string') {
                        throw new Error('第' + (i + 1) + '条消息时间无效');
                    }
                }

                self.messages = data.messages;
                if (data.settings) {
                    var mergedSettings = {};
                    for (var k in self.settings) {
                        if (self.settings.hasOwnProperty(k)) {
                            mergedSettings[k] = self.settings[k];
                        }
                    }
                    for (var k in data.settings) {
                        if (data.settings.hasOwnProperty(k)) {
                            mergedSettings[k] = data.settings[k];
                        }
                    }
                    self.settings = mergedSettings;
                }

                self.saveMessages();
                self.saveSettings();
                self.renderMessages();
                self.applySettings();
                self.showToast('导入成功，共' + data.messages.length + '条消息', 'success');
            } catch (err) {
                self.showToast('导入失败：' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    OfflineModeApp.prototype.confirmClearMessages = function() {
        var self = this;
        this.showConfirm('清空对话', '确定要清空所有对话记录吗？此操作不可撤销。', function() {
            self.messages = [];
            self.saveMessages();
            self.renderMessages();
            self.showToast('已清空对话记录', 'success');
        });
    };

    OfflineModeApp.prototype.showConfirm = function(title, message, callback) {
        if (this.elements.confirmTitle) {
            this.elements.confirmTitle.textContent = title;
        }
        if (this.elements.confirmMessage) {
            this.elements.confirmMessage.textContent = message;
        }
        this.confirmCallback = callback;
        if (this.elements.confirmDialog) {
            this.elements.confirmDialog.classList.add('active');
            this.elements.confirmDialog.setAttribute('aria-hidden', 'false');
        }
    };

    OfflineModeApp.prototype.closeConfirm = function() {
        if (this.elements.confirmDialog) {
            this.elements.confirmDialog.classList.remove('active');
            this.elements.confirmDialog.setAttribute('aria-hidden', 'true');
        }
        this.confirmCallback = null;
    };

    OfflineModeApp.prototype.handleConfirmOk = function() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.closeConfirm();
    };

    OfflineModeApp.prototype.showToast = function(message, type) {
        if (this.elements.toastText) {
            this.elements.toastText.textContent = message;
        }
        if (this.elements.toast) {
            this.elements.toast.className = 'offline-toast active ' + (type || '');
            var toastEl = this.elements.toast;
            setTimeout(function() {
                toastEl.classList.remove('active');
            }, 2500);
        }
    };

    document.addEventListener('DOMContentLoaded', function() {
        window.OfflineModeApp = new OfflineModeApp();
    });

})();
