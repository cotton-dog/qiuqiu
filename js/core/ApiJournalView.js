(function() {
    'use strict';
    
    var currentPage = 1;
    var currentFriendId = null;
    var isLoading = false;
    
    function init() {
        bindEvents();
    }
    
    function bindEvents() {
        var backBtn = document.getElementById('api-journal-back');
        if (backBtn) {
            backBtn.addEventListener('click', close);
        }
        
        var exportBtn = document.getElementById('api-journal-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportData);
        }
        
        var loadMoreBtn = document.getElementById('journal-load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMore);
        }
    }
    
    function open(friendId) {
        currentFriendId = friendId || null;
        currentPage = 1;
        
        var page = document.getElementById('api-journal-page');
        if (page) {
            page.classList.add('active');
        }
        
        loadSummary();
        loadRecords();
    }
    
    function close() {
        var page = document.getElementById('api-journal-page');
        if (page) {
            page.classList.remove('active');
        }
    }
    
    function loadSummary() {
        if (!window.ApiJournalStore) return;
        
        var summary = window.ApiJournalStore.getTotalSummary(currentFriendId);
        
        var requestsEl = document.getElementById('journal-total-requests');
        var tokensEl = document.getElementById('journal-total-tokens');
        var rateEl = document.getElementById('journal-success-rate');
        
        if (requestsEl) {
            requestsEl.textContent = summary.count || 0;
        }
        if (tokensEl) {
            tokensEl.textContent = formatNumber(summary.totalTokens || 0);
        }
        if (rateEl) {
            var rate = summary.count > 0 ? Math.round((summary.successCount / summary.count) * 100) : 0;
            rateEl.textContent = rate + '%';
        }
    }
    
    function loadRecords() {
        if (!window.ApiJournalStore || isLoading) return;
        
        isLoading = true;
        
        var result = window.ApiJournalStore.query({
            friendId: currentFriendId,
            page: currentPage,
            pageSize: 20
        });
        
        var listEl = document.getElementById('api-journal-list');
        var emptyEl = document.getElementById('api-journal-empty');
        var loadMoreEl = document.getElementById('api-journal-load-more');
        
        if (!listEl) {
            isLoading = false;
            return;
        }
        
        if (currentPage === 1) {
            listEl.innerHTML = '';
        }
        
        if (result.entries.length === 0 && currentPage === 1) {
            if (emptyEl) emptyEl.style.display = 'flex';
            if (loadMoreEl) loadMoreEl.style.display = 'none';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            var grouped = groupByDate(result.entries);
            renderGroupedRecords(listEl, grouped);
            
            if (loadMoreEl) {
                loadMoreEl.style.display = currentPage < result.totalPages ? 'block' : 'none';
            }
        }
        
        isLoading = false;
    }
    
    function groupByDate(entries) {
        var groups = {};
        entries.forEach(function(e) {
            var date = e.date || 'unknown';
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(e);
        });
        return groups;
    }
    
    function renderGroupedRecords(container, groups) {
        var dates = Object.keys(groups).sort(function(a, b) {
            return b.localeCompare(a);
        });
        
        dates.forEach(function(date) {
            var entries = groups[date];
            
            var groupEl = document.createElement('div');
            groupEl.className = 'api-journal-date-group';
            
            var headerEl = document.createElement('div');
            headerEl.className = 'api-journal-date-header';
            headerEl.innerHTML = '<span>' + formatDate(date) + '</span><span class="date-count">' + entries.length + ' 条</span>';
            groupEl.appendChild(headerEl);
            
            entries.forEach(function(e) {
                var cardEl = createCard(e);
                groupEl.appendChild(cardEl);
            });
            
            var dailySummary = window.ApiJournalStore.getDailySummary(currentFriendId, date);
            var subtotalEl = document.createElement('div');
            subtotalEl.className = 'api-journal-daily-subtotal';
            subtotalEl.innerHTML = '<span>小计: ' + entries.length + ' 条</span><span>' + formatNumber(dailySummary.totalTokens) + ' tokens</span>';
            groupEl.appendChild(subtotalEl);
            
            container.appendChild(groupEl);
        });
    }
    
    function createCard(entry) {
        var card = document.createElement('div');
        card.className = 'api-journal-card';
        
        var time = formatTime(entry.timestamp);
        var purpose = entry.purpose || 'other';
        var purposeText = getPurposeText(purpose);
        var apiName = entry.apiConfigName || 'unknown';
        var modelName = entry.modelName || entry.model || 'unknown';
        var inputTokens = entry.inputTokens || 0;
        var outputTokens = entry.outputTokens || 0;
        var totalTokens = entry.totalTokens || 0;
        var duration = entry.requestDuration || entry.duration || 0;
        var success = entry.success !== false;
        var errorMsg = entry.errorMessage || '';
        
        var statusClass = success ? 'success' : 'fail';
        var statusIcon = success ? 'fa-check-circle' : 'fa-exclamation-circle';
        var statusText = success ? '成功' : '失败';
        
        card.innerHTML = 
            '<div class="api-journal-card-header">' +
                '<span class="api-journal-card-time">' + time + '</span>' +
                '<span class="api-journal-card-purpose ' + purpose + '">' + purposeText + '</span>' +
            '</div>' +
            '<div class="api-journal-card-api">' + apiName + ' (' + modelName + ')</div>' +
            '<div class="api-journal-card-tokens">' +
                '<span>输入: ' + formatNumber(inputTokens) + '</span>' +
                '<span>输出: ' + formatNumber(outputTokens) + '</span>' +
                '<span class="token-total">总计: ' + formatNumber(totalTokens) + '</span>' +
            '</div>' +
            '<div class="api-journal-card-footer">' +
                '<span>' + formatDuration(duration) + '</span>' +
                '<span class="api-journal-card-status ' + statusClass + '">' +
                    '<i class="fas ' + statusIcon + '"></i> ' + statusText +
                '</span>' +
            '</div>';
        
        if (!success && errorMsg) {
            card.title = errorMsg;
        }
        
        return card;
    }
    
    function loadMore() {
        currentPage++;
        loadRecords();
    }
    
    function exportData() {
        if (!window.ApiJournalStore) return;
        
        var result = window.ApiJournalStore.query({
            friendId: currentFriendId,
            pageSize: 10000
        });
        
        var data = {
            exportTime: new Date().toISOString(),
            friendId: currentFriendId,
            records: result.entries
        };
        
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        
        var a = document.createElement('a');
        a.href = url;
        a.download = 'token-usage-' + (currentFriendId || 'all') + '-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    function formatDate(dateStr) {
        if (!dateStr || dateStr === 'unknown') return '未知日期';
        var parts = dateStr.split('-');
        if (parts.length === 3) {
            return parts[1] + '月' + parts[2] + '日';
        }
        return dateStr;
    }
    
    function formatTime(timestamp) {
        if (!timestamp) return '--:--:--';
        var d = new Date(timestamp);
        var h = String(d.getHours()).padStart(2, '0');
        var m = String(d.getMinutes()).padStart(2, '0');
        var s = String(d.getSeconds()).padStart(2, '0');
        return h + ':' + m + ':' + s;
    }
    
    function formatDuration(ms) {
        if (!ms || ms < 0) return '0ms';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(1) + 's';
    }
    
    function formatNumber(num) {
        if (!num || num < 0) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }
    
    function getPurposeText(purpose) {
        var map = {
            'chat': '对话',
            'summary': '总结',
            'milestone': '里程碑',
            'repair': '修复',
            'test': '测试',
            'admin': '管理',
            'other': '其他'
        };
        return map[purpose] || purpose;
    }
    
    var ApiJournalView = {
        init: init,
        open: open,
        close: close,
        refresh: function() {
            currentPage = 1;
            loadSummary();
            loadRecords();
        }
    };
    
    if (typeof window !== 'undefined') {
        window.ApiJournalView = ApiJournalView;
    }
})();
