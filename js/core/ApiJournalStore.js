(function() {
    'use strict';
    
    var STORAGE_KEY = 'chat20.apiJournal';
    var MAX_ENTRIES = 1000;
    var MAX_PER_FRIEND = 500;
    
    function getData() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { version: 1, entries: [] };
            var data = JSON.parse(raw);
            if (!data || !Array.isArray(data.entries)) {
                return { version: 1, entries: [] };
            }
            return data;
        } catch(e) {
            return { version: 1, entries: [] };
        }
    }
    
    function saveData(data) {
        try {
            data.lastUpdated = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch(e) {
            console.error('[ApiJournalStore] Save failed:', e);
        }
    }
    
    function getLocalDateString(timestamp) {
        if (timestamp == null || !isFinite(timestamp)) {
            timestamp = Date.now();
        }
        var d = new Date(timestamp);
        if (isNaN(d.getTime())) d = new Date();
        if (d.getTime() > Date.now() + 86400000) d = new Date();
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }
    
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }
    
    function record(entry) {
        if (!entry || entry.timestamp == null) return null;
        
        var data = getData();
        
        var record = {
            id: generateId(),
            timestamp: entry.timestamp,
            date: getLocalDateString(entry.timestamp),
            friendId: entry.friendId || null,
            apiProfileId: entry.apiProfileId || null,
            apiConfigName: entry.apiConfigName || 'unknown',
            modelName: entry.modelName || entry.model || 'unknown',
            purpose: entry.purpose || 'other',
            inputTokens: entry.inputTokens || entry.promptTokens || 0,
            outputTokens: entry.outputTokens || entry.completionTokens || 0,
            totalTokens: entry.totalTokens || 0,
            isEstimated: entry.isEstimated || false,
            requestDuration: entry.requestDuration || entry.duration || 0,
            success: entry.success !== false,
            httpStatus: entry.httpStatus || null,
            providerType: entry.providerType || entry.provider || 'other',
            errorMessage: entry.errorMessage || null
        };
        
        if (record.totalTokens === 0 && (record.inputTokens > 0 || record.outputTokens > 0)) {
            record.totalTokens = record.inputTokens + record.outputTokens;
        }
        
        data.entries.push(record);
        
        if (data.entries.length > MAX_ENTRIES) {
            data.entries = data.entries.slice(-MAX_ENTRIES);
        }
        
        enforceFriendLimit(data);
        
        saveData(data);
        
        if (window.EventBus) {
            if (record.success) {
                window.EventBus.emit('api:usage:recorded', record);
            } else {
                window.EventBus.emit('api:usage:error', record);
            }
        }
        
        return record.id;
    }
    
    function enforceFriendLimit(data) {
        var byFriend = {};
        data.entries.forEach(function(e) {
            if (e.friendId) {
                byFriend[e.friendId] = (byFriend[e.friendId] || 0) + 1;
            }
        });
        
        Object.keys(byFriend).forEach(function(fid) {
            if (byFriend[fid] > MAX_PER_FRIEND) {
                var count = 0;
                var toRemove = byFriend[fid] - MAX_PER_FRIEND;
                data.entries = data.entries.filter(function(e) {
                    if (e.friendId === fid && count < toRemove) {
                        count++;
                        return false;
                    }
                    return true;
                });
            }
        });
    }
    
    function query(options) {
        var data = getData();
        var entries = data.entries.slice();
        
        if (options && options.friendId) {
            entries = entries.filter(function(e) {
                return e.friendId === options.friendId;
            });
        }
        
        if (options && options.purpose) {
            entries = entries.filter(function(e) {
                return e.purpose === options.purpose;
            });
        }
        
        if (options && options.date) {
            entries = entries.filter(function(e) {
                return e.date === options.date;
            });
        }
        
        if (options && options.success !== undefined) {
            entries = entries.filter(function(e) {
                return e.success === options.success;
            });
        }
        
        entries.sort(function(a, b) {
            return b.timestamp - a.timestamp;
        });
        
        var page = (options && options.page) || 1;
        var pageSize = (options && options.pageSize) || 20;
        var start = (page - 1) * pageSize;
        var end = start + pageSize;
        
        return {
            entries: entries.slice(start, end),
            total: entries.length,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(entries.length / pageSize)
        };
    }
    
    function getDailySummary(friendId, date) {
        var data = getData();
        var entries = data.entries.filter(function(e) {
            return (!friendId || e.friendId === friendId) && 
                   (!date || e.date === date);
        });
        
        var summary = {
            date: date,
            friendId: friendId,
            count: entries.length,
            totalInput: 0,
            totalOutput: 0,
            totalTokens: 0,
            successCount: 0,
            failCount: 0,
            totalDuration: 0
        };
        
        entries.forEach(function(e) {
            summary.totalInput += e.inputTokens || 0;
            summary.totalOutput += e.outputTokens || 0;
            summary.totalTokens += e.totalTokens || 0;
            summary.totalDuration += e.requestDuration || 0;
            if (e.success) summary.successCount++;
            else summary.failCount++;
        });
        
        return summary;
    }
    
    function getTotalSummary(friendId) {
        var data = getData();
        var entries = data.entries.filter(function(e) {
            return !friendId || e.friendId === friendId;
        });
        
        var summary = {
            friendId: friendId,
            count: entries.length,
            totalInput: 0,
            totalOutput: 0,
            totalTokens: 0,
            successCount: 0,
            failCount: 0,
            totalDuration: 0
        };
        
        entries.forEach(function(e) {
            summary.totalInput += e.inputTokens || 0;
            summary.totalOutput += e.outputTokens || 0;
            summary.totalTokens += e.totalTokens || 0;
            summary.totalDuration += e.requestDuration || 0;
            if (e.success) summary.successCount++;
            else summary.failCount++;
        });
        
        return summary;
    }
    
    function getDatesWithRecords(friendId) {
        var data = getData();
        var dates = {};
        
        data.entries.forEach(function(e) {
            if (!friendId || e.friendId === friendId) {
                dates[e.date] = (dates[e.date] || 0) + 1;
            }
        });
        
        return Object.keys(dates).sort(function(a, b) {
            return b.localeCompare(a);
        }).map(function(date) {
            return {
                date: date,
                count: dates[date]
            };
        });
    }
    
    function deleteFriendRecords(friendId) {
        if (!friendId) return;
        var data = getData();
        var before = data.entries.length;
        data.entries = data.entries.filter(function(e) {
            return e.friendId !== friendId;
        });
        saveData(data);
        return before - data.entries.length;
    }
    
    function clear() {
        localStorage.removeItem(STORAGE_KEY);
    }
    
    function getStorageInfo() {
        var data = getData();
        var size = 0;
        try {
            size = JSON.stringify(data).length;
        } catch(e) {}
        
        return {
            totalEntries: data.entries.length,
            sizeBytes: size,
            storageKey: STORAGE_KEY
        };
    }
    
    window.ApiJournalStore = {
        record: record,
        query: query,
        getDailySummary: getDailySummary,
        getTotalSummary: getTotalSummary,
        getDatesWithRecords: getDatesWithRecords,
        deleteFriendRecords: deleteFriendRecords,
        clear: clear,
        getStorageInfo: getStorageInfo
    };
})();
