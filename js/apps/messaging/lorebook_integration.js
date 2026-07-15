(function() {
    'use strict';

    let loreEngine = null;
    let isInitialized = false;
    let initPromise = null;
    let currentFriendId = null;
    let allWorldbookData = null;
    let entryIdMap = null;

    function waitForChat20(maxWait = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                if (window.chat20 && window.chat20.state) {
                    resolve(true);
                    return;
                }
                if (Date.now() - startTime > maxWait) {
                    console.warn('[Lorebook] Timeout waiting for chat20');
                    resolve(false);
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

    async function initLorebookEngine() {
        if (isInitialized && loreEngine) {
            return;
        }

        if (initPromise) {
            return initPromise;
        }

        if (!window.LorebookEngine) {
            console.warn('[Lorebook] LorebookEngine not available');
            return;
        }

        initPromise = (async () => {
            loreEngine = new window.LorebookEngine(2000, 3);
            console.log('[Lorebook] Engine created, loading data...');
            await loadAllWorldbookData();
            isInitialized = true;
            console.log('[Lorebook] Engine initialized');
        })();

        return initPromise;
    }

    async function loadAllWorldbookData() {
        console.log('[Lorebook] loadAllWorldbookData called');
        
        try {
            const storage = window.ChatStorageDB || window.ImageStorageDB;
            console.log('[Lorebook] Storage check:', {
                ChatStorageDB: !!window.ChatStorageDB,
                ImageStorageDB: !!window.ImageStorageDB,
                hasGetAppData: !!(storage && storage.getAppData)
            });
            
            if (!storage || !storage.getAppData) {
                console.warn('[Lorebook] Storage not available, retrying in 1s...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                return loadAllWorldbookData();
            }
            
            allWorldbookData = await storage.getAppData('worldBookStructure');
            console.log('[Lorebook] Raw worldbook data:', allWorldbookData);
            
            if (allWorldbookData && allWorldbookData.__categories__) {
                entryIdMap = new Map();
                console.log('[Lorebook] Categories:', allWorldbookData.__categories__);
                
                allWorldbookData.__categories__.forEach(categoryName => {
                    const entries = allWorldbookData[categoryName];
                    console.log('[Lorebook] Category:', categoryName, 'entries:', entries ? entries.length : 0);
                    if (entries && Array.isArray(entries)) {
                        entries.forEach(entry => {
                            if (entry && entry.id) {
                                entryIdMap.set(String(entry.id), entry);
                            }
                        });
                    }
                });
                console.log('[Lorebook] Loaded all worldbook data with', allWorldbookData.__categories__.length, 'categories and', entryIdMap.size, 'entries');
            } else {
                console.log('[Lorebook] No worldbook data found or invalid structure. Data:', allWorldbookData);
            }
        } catch (e) {
            console.error('[Lorebook] Failed to load worldbook data:', e);
        }
    }

    async function loadFriendWorldbook(friendId) {
        console.log('[Lorebook] loadFriendWorldbook called for:', friendId);
        
        if (!loreEngine) {
            await initLorebookEngine();
        }
        if (!loreEngine) {
            console.error('[Lorebook] loreEngine not available after init');
            return;
        }

        if (!entryIdMap) {
            console.log('[Lorebook] entryIdMap not ready, loading data...');
            await loadAllWorldbookData();
        }
        if (!entryIdMap) {
            console.warn('[Lorebook] entryIdMap not available after loading');
            return;
        }

        try {
            let bindingEntryIds = [];
            
            if (!window.chat20 || !window.chat20.state) {
                console.log('[Lorebook] chat20 not ready, waiting...');
                await waitForChat20();
            }
            
            if (window.chat20 && window.chat20.state && window.chat20.state.friendWorldBookBindings) {
                bindingEntryIds = window.chat20.state.friendWorldBookBindings[friendId] || [];
            }
            console.log('[Lorebook] Friend bindings for', friendId, ':', bindingEntryIds);
            console.log('[Lorebook] entryIdMap size:', entryIdMap.size);

            loreEngine.entries = [];
            loreEngine.compiledPatterns.clear();
            loreEngine.activeMatches.clear();
            loreEngine.combinationRules = [];

            if (bindingEntryIds.length === 0) {
                console.log('[Lorebook] No worldbook bindings for friend', friendId);
                return;
            }

            let loadedCount = 0;
            for (const id of bindingEntryIds) {
                const entry = entryIdMap.get(String(id));
                if (entry) {
                    const loreEntry = new window.LoreEntry(
                        entry.keywords || [],
                        entry.content || '',
                        entry.priority || 0
                    );
                    loreEntry.id = String(id);
                    loreEntry.enabled = entry.enabled !== false;
                    loreEngine.addEntry(loreEntry);
                    loadedCount++;
                } else {
                    console.warn('[Lorebook] Entry not found for id:', id, 'available ids:', Array.from(entryIdMap.keys()).slice(0, 10));
                }
            }

            console.log('[Lorebook] Loaded', loadedCount, 'entries for friend', friendId);
        } catch (e) {
            console.error('[Lorebook] Failed to load friend worldbook:', e);
        }
    }

    async function reloadForFriend(friendId) {
        console.log('[Lorebook] reloadForFriend called:', friendId, 'current:', currentFriendId);
        
        if (!loreEngine) {
            await initLorebookEngine();
        }

        if (currentFriendId === String(friendId)) {
            console.log('[Lorebook] Already loaded for friend', friendId);
            return;
        }

        currentFriendId = String(friendId);
        if (loreEngine) {
            loreEngine.clearActiveMatches();
        }
        await loadFriendWorldbook(friendId);
        console.log('[Lorebook] Reloaded for friend', friendId);
    }

    async function scanAndInjectLorebook(userMessage, conversationHistory, friendId) {
        if (!loreEngine) {
            await initLorebookEngine();
        }

        if (friendId && currentFriendId !== String(friendId)) {
            await reloadForFriend(friendId);
        }

        if (!loreEngine || loreEngine.entries.length === 0) {
            return '';
        }

        const matches = loreEngine.scanText(userMessage);
        loreEngine.updateStickyMatches(matches);

        if (matches.length === 0) {
            return '';
        }

        const sortedMatches = matches.sort((a, b) => 
            b.entry.priority - a.entry.priority || 
            b.matchedKeywords.size - a.matchedKeywords.size
        );

        const loreSections = sortedMatches.map(m => {
            const keywordsStr = Array.from(m.matchedKeywords).join(', ');
            return `[${m.entry.keywords[0]}] ${m.entry.content}`;
        });

        const loreContent = '【世界书】\n' + loreSections.join('\n');
        console.log('[Lorebook] Injected', matches.length, 'entries for friend', currentFriendId);
        
        return loreContent;
    }

    function getLorebookStatistics() {
        if (!loreEngine) {
            return {
                totalEntries: 0,
                enabledEntries: 0,
                activeMatches: 0,
                totalKeywords: 0,
                estimatedTokens: 0
            };
        }
        return loreEngine.getStatistics();
    }

    function clearLorebookActiveMatches() {
        if (loreEngine) {
            loreEngine.clearActiveMatches();
            console.log('[Lorebook] Cleared active matches');
        }
    }

    window.LorebookIntegration = {
        init: initLorebookEngine,
        load: loadAllWorldbookData,
        loadFriend: loadFriendWorldbook,
        reloadForFriend: reloadForFriend,
        scanAndInject: scanAndInjectLorebook,
        getStats: getLorebookStatistics,
        clearMatches: clearLorebookActiveMatches,
        getEngine: () => loreEngine,
        getCurrentFriendId: () => currentFriendId,
        getEntryIdMap: () => entryIdMap,
        getAllWorldbookData: () => allWorldbookData
    };

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(async () => {
            await initLorebookEngine();
            
            if (window.LorebookIntegration && window.LorebookIntegration.load) {
                window.LorebookIntegration.load();
            }
        }, 800);
    });

    window.addEventListener('storage', function(e) {
        if (e.key === 'wechatAppData_rev' || e.key === 'worldBookStructure') {
            loadAllWorldbookData().then(() => {
                if (currentFriendId) {
                    loadFriendWorldbook(currentFriendId);
                }
            });
        }
    });
    
    window.LorebookIntegration.waitForChat20 = waitForChat20;
})();
