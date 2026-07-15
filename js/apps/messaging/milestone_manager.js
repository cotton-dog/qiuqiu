(function() {
    'use strict';

    const STORAGE_KEY = 'chat20.milestones';
    const DEFAULT_CONFIG = {
        enabled: false,
        tokenBudget: 200,
        step: 20,
        prompt: '',
        eventTypes: ['关系变化', '物品获取', '角色状态', '剧情转折', '地点变化', '任务进展'],
        autoStep: false
    };

    let currentFriendId = null;
    let editingMilestoneId = null;

    function ensureMilestoneMemory(friendId) {
        if (!friendId || !window.chat20) {
            return {
                items: [],
                config: { ...DEFAULT_CONFIG },
                lastIndex: 0
            };
        }
        if (!window.chat20.state) window.chat20.state = {};
        if (!window.chat20.state.milestoneMemory) window.chat20.state.milestoneMemory = {};
        if (!window.chat20.state.milestoneMemory[friendId]) {
            window.chat20.state.milestoneMemory[friendId] = {
                items: [],
                config: { ...DEFAULT_CONFIG },
                lastIndex: 0
            };
        }
        return window.chat20.state.milestoneMemory[friendId];
    }

    function saveMilestoneData() {
        if (!window.chat20 || !window.chat20.saveCustomReplies) return;
        window.chat20.saveCustomReplies();
    }

    function createMilestoneId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function getCurrentDate() {
        const now = new Date();
        return `${now.getMonth() + 1}月${now.getDate()}日`;
    }

    function formatMilestoneTime(timeValue) {
        const date = new Date(timeValue);
        if (!Number.isFinite(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    function getMilestoneText(friendId) {
        if (!friendId) return '';
        const memory = ensureMilestoneMemory(friendId);
        const items = Array.isArray(memory.items) ? memory.items : [];
        if (!items.length) return '';
        const ordered = [...items].sort((a, b) => (a.time || 0) - (b.time || 0));
        const parts = ordered.map(item => {
            const timeText = formatMilestoneTime(item.time);
            return timeText ? `${item.date}\n${item.event}` : item.event;
        }).filter(Boolean);
        return parts.join('\n\n');
    }

    function getMilestoneBlock(friendId, maxTokens = 200) {
        if (!friendId) return '';
        const memory = ensureMilestoneMemory(friendId);
        const config = memory.config || DEFAULT_CONFIG;
        const items = Array.isArray(memory.items) ? memory.items : [];
        if (!items.length) return '';

        const sortedItems = [...items].sort((a, b) => (a.time || 0) - (b.time || 0));
        const tokenBudget = maxTokens || config.tokenBudget || 200;

        let eventLines = [];
        let currentTokens = 0;

        for (const item of sortedItems) {
            const line = `• ${item.date}: ${item.event}`;
            const estimatedTokens = Math.ceil(line.length / 2);

            if (currentTokens + estimatedTokens > tokenBudget) {
                break;
            }

            eventLines.push(line);
            currentTokens += estimatedTokens;
        }

        if (!eventLines.length) return '';

        return '【重要事件】\n' + eventLines.join('\n');
    }

    function addMilestone(friendId, data) {
        if (!friendId || !data) return false;
        const memory = ensureMilestoneMemory(friendId);
        if (!Array.isArray(memory.items)) memory.items = [];

        const milestone = {
            id: data.id || createMilestoneId(),
            date: data.date || getCurrentDate(),
            event: (data.event || '').trim(),
            priority: data.priority || 50,
            tags: Array.isArray(data.tags) ? data.tags : [],
            time: data.time || Date.now()
        };

        const existing = memory.items.find(item => item && item.event === milestone.event && item.date === milestone.date);
        if (existing) {
            const basePriority = Number(existing.priority) || 0;
            const incomingPriority = Number(milestone.priority) || 0;
            existing.priority = Math.max(basePriority, incomingPriority);

            if (Array.isArray(milestone.tags) && milestone.tags.length) {
                const tagSet = new Set([...(existing.tags || []), ...milestone.tags]);
                existing.tags = Array.from(tagSet);
            }

            if (!existing.time || existing.time < milestone.time) {
                existing.time = milestone.time;
            }

            saveMilestoneData();
            return existing;
        }

        memory.items.push(milestone);
        saveMilestoneData();
        return milestone;
    }

    async function addMilestoneAsync(friendId, data, options) {
        if (!friendId || !data) return { action: 'error', error: 'Invalid parameters' };

        const opts = options || {};
        const memory = ensureMilestoneMemory(friendId);
        if (!Array.isArray(memory.items)) memory.items = [];

        const milestone = {
            id: data.id || createMilestoneId(),
            date: data.date || getCurrentDate(),
            event: (data.event || '').trim(),
            priority: data.priority || 50,
            tags: Array.isArray(data.tags) ? data.tags : [],
            time: data.time || Date.now()
        };

        if (!window.MemoryDeduplicator) {
            const added = addMilestone(friendId, data);
            return { action: 'add', milestone: added };
        }

        const dedupConfig = memory.config && memory.config.dedupConfig ? memory.config.dedupConfig : {};
        if (dedupConfig.enabled === false) {
            const added = addMilestone(friendId, data);
            return { action: 'add', milestone: added };
        }

        const result = window.MemoryDeduplicator.checkAndMerge(milestone, memory.items, opts);

        if (result.action === 'merge') {
            const index = memory.items.findIndex(item => item && item.id === result.milestone.id);
            if (index !== -1) {
                memory.items[index] = result.milestone;
                saveMilestoneData();

                if (!opts.skipNotification && window.showNotification) {
                    window.showNotification('已自动合并相似里程碑', 'info');
                }

                return {
                    action: 'merge',
                    milestone: result.milestone,
                    mergedWith: result.mergedWith,
                    similarity: result.similarity
                };
            }
        }

        memory.items.push(milestone);
        saveMilestoneData();
        return { action: 'add', milestone: milestone, similarCandidates: result.similarCandidates };
    }

    function mergeMilestones(friendId, targetId, sourceIds) {
        if (!friendId || !targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
            return false;
        }

        const memory = ensureMilestoneMemory(friendId);
        const items = Array.isArray(memory.items) ? memory.items : [];

        const targetIndex = items.findIndex(item => item && item.id === targetId);
        if (targetIndex === -1) return false;

        const target = items[targetIndex];
        const sources = [];
        const sourceIndices = [];

        for (let i = 0; i < sourceIds.length; i++) {
            const idx = items.findIndex(item => item && item.id === sourceIds[i]);
            if (idx !== -1 && idx !== targetIndex) {
                sources.push(items[idx]);
                sourceIndices.push(idx);
            }
        }

        if (sources.length === 0) return false;

        let merged;
        if (window.MemoryDeduplicator) {
            merged = target;
            for (let i = 0; i < sources.length; i++) {
                merged = window.MemoryDeduplicator.mergeMilestones(merged, sources[i]);
            }
        } else {
            merged = { ...target, mergedFrom: [] };
            for (let i = 0; i < sources.length; i++) {
                const src = sources[i];
                merged.event = merged.event.length >= src.event.length ? merged.event : src.event;
                merged.priority = Math.max(merged.priority || 50, src.priority || 50);
                const tagSet = new Set([...(merged.tags || []), ...(src.tags || [])]);
                merged.tags = Array.from(tagSet);
                merged.time = Math.min(merged.time || Date.now(), src.time || Date.now());
                merged.mergedFrom.push({
                    id: src.id,
                    event: src.event,
                    date: src.date,
                    time: Date.now()
                });
            }
        }

        items[targetIndex] = merged;

        sourceIndices.sort((a, b) => b - a);
        for (let i = 0; i < sourceIndices.length; i++) {
            items.splice(sourceIndices[i], 1);
        }

        if (window.MemoryDeduplicator) {
            window.MemoryDeduplicator.recordMergeHistory({
                targetId: targetId,
                sourceIds: sourceIds,
                sourceData: sources.map(s => ({
                    id: s.id,
                    event: s.event,
                    date: s.date,
                    priority: s.priority,
                    tags: s.tags
                }))
            });
        }

        saveMilestoneData();
        return merged;
    }

    function getMergeHistory() {
        if (window.MemoryDeduplicator) {
            return window.MemoryDeduplicator.getMergeHistory();
        }
        return [];
    }

    function clearMergeHistory() {
        if (window.MemoryDeduplicator) {
            window.MemoryDeduplicator.clearMergeHistory();
        }
    }

    function updateMilestone(friendId, itemId, data) {
        if (!friendId || !itemId) return false;
        const memory = ensureMilestoneMemory(friendId);
        const items = Array.isArray(memory.items) ? memory.items : [];
        const target = items.find(item => item && item.id === itemId);
        if (!target) return false;

        if (data.date !== undefined) target.date = data.date;
        if (data.event !== undefined) target.event = data.event;
        if (data.priority !== undefined) target.priority = data.priority;
        if (data.tags !== undefined) target.tags = Array.isArray(data.tags) ? data.tags : [];
        if (data.time !== undefined) target.time = data.time;

        saveMilestoneData();
        return true;
    }

    function deleteMilestone(friendId, itemId) {
        if (!friendId || !itemId) return false;
        const memory = ensureMilestoneMemory(friendId);
        const items = Array.isArray(memory.items) ? memory.items : [];
        const index = items.findIndex(item => item && item.id === itemId);
        if (index === -1) return false;

        items.splice(index, 1);
        saveMilestoneData();
        return true;
    }

    function clearMilestones(friendId) {
        if (!friendId) return false;
        const memory = ensureMilestoneMemory(friendId);
        memory.items = [];
        memory.lastIndex = 0;
        saveMilestoneData();
        return true;
    }

    function getMilestoneConfig(friendId) {
        if (!friendId) return { ...DEFAULT_CONFIG };
        const memory = ensureMilestoneMemory(friendId);
        return { ...DEFAULT_CONFIG, ...(memory.config || {}) };
    }

    function updateMilestoneConfig(friendId, config) {
        if (!friendId || !config) return false;
        const memory = ensureMilestoneMemory(friendId);
        memory.config = { ...DEFAULT_CONFIG, ...(memory.config || {}), ...config };
        saveMilestoneData();
        return true;
    }

    async function extractMilestones(friendId, dialogues, options) {
        if (!friendId || !dialogues || !dialogues.length) {
            console.log('[Milestone] 没有可提取的对话');
            return [];
        }

        const opts = options || {};
        const memory = ensureMilestoneMemory(friendId);
        const config = memory && memory.config ? memory.config : DEFAULT_CONFIG;

        console.log('[Milestone] 提取配置:', config);

        if (!config.enabled && !opts.ignoreEnabled) {
            console.log('[Milestone] 里程碑功能未启用');
            return [];
        }

        if (!window.AIService || typeof window.AIService.generateResponse !== 'function') {
            console.error('[Milestone] AI服务不可用');
            showNotification('AI服务未配置，请先在设置中配置AI', 'error');
            return [];
        }

        const dialogueText = dialogues.map(msg => {
            // 过滤掉系统消息和无效消息
            if (!msg || msg.type === 'system' || msg.type === 'date-separator' || msg.type === 'cmd') {
                return null;
            }

            const sender = msg.sender || msg.role || 'unknown';
            const isUser = sender === 'me' || sender === 'user';
            
            // 明确处理发送者类型
            // 'them' 是好友消息，视为角色
            // 'assistant'/'AI' 视为AI（但在角色扮演中通常也是角色）
            
            let content = '';
            
            // 优先处理特殊类型
            if (msg.type === 'transfer') {
                const payload = msg && msg.transfer ? msg.transfer : {};
                const amount = Number(payload.amount);
                const safeAmount = Number.isFinite(amount) ? amount : 0;
                const formattedAmount = `¥${safeAmount.toFixed(2)}`;
                const status = payload.status || 'pending';
                const statusText = status === 'accepted' ? '已收妥' : (status === 'returned' ? '已退回' : '待接收');
                const from = payload.from;
                let source = '';
                let target = '';
                if (from === 'me' || from === 'user') {
                    source = '{user}';
                    target = '{char}';
                } else if (from === 'other' || from === 'them' || from === 'assistant') {
                    source = '{char}';
                    target = '{user}';
                } else {
                    source = isUser ? '{user}' : '{char}';
                    target = isUser ? '{char}' : '{user}';
                }
                const remark = typeof payload.remark === 'string' ? payload.remark.trim() : '';
                const base = `[转账] ${source} 向 ${target} 发起转账 ${formattedAmount}（当前状态：${statusText}）`;
                content = remark ? `${base} 备注：${remark}` : base;
            } else if (msg.type === 'transfer_receipt') {
                const payload = msg && (msg.transferReceipt || msg.transfer_receipt)
                    ? (msg.transferReceipt || msg.transfer_receipt)
                    : (msg && msg.transferReceipt ? msg.transferReceipt : {});
                const amount = Number(payload && payload.amount);
                const safeAmount = Number.isFinite(amount) ? amount : 0;
                const formattedAmount = `¥${safeAmount.toFixed(2)}`;
                const status = (payload && payload.status) ? payload.status : 'accepted';
                
                if (status === 'returned') {
                    const actor = isUser ? '{user}' : '{char}';
                    const other = isUser ? '{char}' : '{user}';
                    content = `[退回转账] ${actor} 已将 ${other} 的款项退回，金额：${formattedAmount}`;
                } else {
                    const actor = isUser ? '{user}' : '{char}';
                    const other = isUser ? '{char}' : '{user}';
                    content = `[确认收款] ${actor} 已收下 ${other} 的款项，金额：${formattedAmount}`;
                }
            } else if (msg.type === 'image') {
                 const note = (msg.cardNote || '').trim();
                 content = note ? `[图片] ${note}` : '[图片]';
            } else if (msg.type === 'sticker') {
                 content = '[表情]';
            } else if (msg.text) {
                content = msg.text;
            } else if (msg.content) {
                content = msg.content;
            }
            
            // 特殊处理语音消息
            if (msg.voiceLike) {
                if (!content || content === '[语音消息]') {
                     content = '[语音消息]';
                } else {
                     // 避免重复前缀
                     if (!content.startsWith('[语音消息]')) {
                         content = `[语音消息] ${content}`;
                     }
                }
            } else if (!content && msg.voiceLike) {
                 content = '[语音消息]';
            }
            
            if (!content || !content.trim()) return null;

            let prefix = '';
            const t = msg.time || msg.timestamp;
            if (t) {
                const d = new Date(t);
                if (Number.isFinite(d.getTime())) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    prefix = `[${y}-${m}-${day} ${hh}:${mm}] `;
                }
            }

            if (isUser) {
                return `${prefix}{user}: ${content}`;
            } else {
                return `${prefix}{char}: ${content}`;
            }
        }).filter(Boolean).join('\n');

        console.log('[Milestone] 对话内容预览:', dialogueText.substring(0, 300) + '...');

        const prompt = await buildExtractionPrompt(friendId, dialogueText);
        console.log('[Milestone] 发送给AI的提示词:', prompt.substring(0, 300) + '...');

        try {
            console.log('[Milestone] 开始调用AI提取里程碑...');
            const response = await window.AIService.generateResponse(
                [{ role: 'user', content: prompt }],
                { temperature: 0.2, friendId: friendId, purpose: 'milestone' }
            );

            console.log('[Milestone] AI响应原始内容:', response);
            console.log('[Milestone] AI响应长度:', response?.length);

            if (!response || !response.trim()) {
                console.log('[Milestone] AI返回空响应');
                return [];
            }

            let text = response.trim();
            const fencedMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
            if (fencedMatch && fencedMatch[1]) {
                text = fencedMatch[1].trim();
                console.log('[Milestone] 从代码块中提取JSON文本');
            } else {
                const start = text.indexOf('[');
                const end = text.lastIndexOf(']');
                if (start !== -1 && end !== -1 && end > start) {
                    const sliced = text.slice(start, end + 1);
                    if (sliced.length >= 2) {
                        text = sliced;
                        console.log('[Milestone] 从响应中截取JSON数组');
                    }
                }
            }

            let eventsData;
            try {
                eventsData = JSON.parse(text);
                console.log('[Milestone] 解析后的JSON:', eventsData);
            } catch (parseError) {
                console.error('[Milestone] JSON解析失败:', parseError);
                console.log('[Milestone] 原始响应:', response);
                return [];
            }
            
            if (!Array.isArray(eventsData)) {
                console.log('[Milestone] AI返回的不是JSON数组，类型:', typeof eventsData);
                return [];
            }
            
            console.log('[Milestone] 提取到的里程碑数量:', eventsData.length);

            const newMilestones = [];
            const mergedMilestones = [];
            const filteredMilestones = [];
            const dedupStartTime = Date.now();

            for (const eventData of eventsData) {
                const milestone = {
                    date: eventData.date || getCurrentDate(),
                    event: eventData.event || '',
                    priority: eventData.priority || 50,
                    tags: Array.isArray(eventData.tags) ? eventData.tags : [],
                    time: Date.now()
                };

                const result = await addMilestoneAsync(friendId, milestone, { skipNotification: true });
                if (result && result.milestone) {
                    if (result.action === 'add') {
                        newMilestones.push(result.milestone);
                    } else if (result.action === 'merge') {
                        mergedMilestones.push({
                            milestone: result.milestone,
                            mergedWith: result.mergedWith,
                            similarity: result.similarity
                        });
                    }
                }
            }

            const dedupDuration = Date.now() - dedupStartTime;
            if (dedupDuration > 100) {
                console.warn('[Milestone] 去重验证耗时较长:', dedupDuration + 'ms');
            }

            if (typeof opts.totalMessages === 'number' && Number.isFinite(opts.totalMessages) && opts.totalMessages >= 0) {
                memory.lastIndex = opts.totalMessages;
            } else if (Array.isArray(dialogues)) {
                const previousIndex = Number(memory.lastIndex) || 0;
                memory.lastIndex = previousIndex + dialogues.length;
            }
            saveMilestoneData();

            console.log('[Milestone] 提取完成，新增:', newMilestones.length, '合并:', mergedMilestones.length);
            return {
                added: newMilestones,
                merged: mergedMilestones,
                filtered: filteredMilestones,
                total: newMilestones.length + mergedMilestones.length
            };
        } catch (e) {
            console.error('里程碑提取失败:', e);
            showNotification('里程碑提取失败: ' + e.message, 'error');
            return [];
        }
    }

    async function buildExtractionPrompt(friendId, dialogueText) {
        const effectiveFriendId = friendId || currentFriendId || null;

        const memory = effectiveFriendId ? ensureMilestoneMemory(effectiveFriendId) : null;
        const config = memory && memory.config ? memory.config : DEFAULT_CONFIG;
        const customPrompt = config.prompt || '';

        if (customPrompt) {
            const eventTypesText = buildEventTypesText(config.eventTypes || DEFAULT_CONFIG.eventTypes);
            return customPrompt.replace('{text}', dialogueText) + '\n\n' + eventTypesText;
        }

        const eventTypes = config.eventTypes || DEFAULT_CONFIG.eventTypes;
        const eventTypesText = buildEventTypesText(eventTypes);

        let defaultPrompt = `【格式要求（必须严格遵守）】
1. 只输出JSON数组本身，不要任何说明文字、不要代码块、不要Markdown。
2. 不要输出\`\`\`json 或其它围栏，只输出数组内容。
3. 如果没有重要事件，直接输出空数组：[]。
4. 数组元素格式：{"date": "日期", "event": "事件描述", "priority": 优先级数字, "tags": ["标签1", "标签2"]}。
5. 日期必须严格依据每行开头的方括号时间戳（如 "[2026-01-27 10:30]"）确定，输出为 "1月27日" 或 "2026-01-27" 之一；若某行缺失时间戳，则以最近一行的日期为准。
6. 转账与收/退必须严格依据对话内容中的标记解析，不得颠倒：
   - "[转账] A 向 B 发起转账" 表示 A 是发送方，B 是接收方。
   - "[确认收款] A 已收下 B 的款项" 表示 A 确认收到了钱，转账成功。
   - "[退回转账] A 已将 B 的款项退回" 表示 A 拒收，钱退回给了 B。
7. 事件描述必须使用第三人称旁白视角，面向“记忆条目"而不是聊天内容回放：
   - 用 {user} 指代现实中的使用者，用 {char} 指代聊天中的虚拟角色/AI。
   - 禁止出现“我”“你”“我们”等第一、第二人称，也不要直接写“用户”“角色”。
   - 示例（转账类）：" {user} 收到来自 {char} 的 8.88 元转账"、"{user} 退回了 {char} 发起的 0.01 元转账，结束了测试"。
8. 事件描述简洁明了，不超过50字。
9. 优先级为0-100的数字，数字越大越重要。

【任务说明】
你是一个专业的剧情分析师，擅长从角色扮演对话中提取关键事件（里程碑）。

${eventTypesText}
【对话内容】
${dialogueText}`;

        return defaultPrompt;
    }

    function buildEventTypesText(eventTypes) {
        if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
            eventTypes = DEFAULT_CONFIG.eventTypes;
        }
        const defaultDescriptions = {
            '关系变化': '建立友谊、结盟、背叛、和解等',
            '物品获取': '获得重要物品、装备、宝藏等',
            '角色状态': '受伤、恢复、觉醒、死亡等',
            '剧情转折': '揭开秘密、发现真相、重大决策等',
            '地点变化': '到达新地点、离开旧地点等',
            '任务进展': '接受任务、完成任务、任务失败等'
        };
        
        let text = '【重要事件类型】\n';
        for (let i = 0; i < eventTypes.length; i++) {
            const eventType = eventTypes[i];
            const desc = defaultDescriptions[eventType] || '';
            text += (i + 1) + '. ' + eventType + (desc ? '：' + desc : '') + '\n';
        }
        return text;
    }

    async function renderMilestoneCards() {
        if (!currentFriendId) return;
        const memory = ensureMilestoneMemory(currentFriendId);
        const items = Array.isArray(memory.items) ? memory.items : [];
        const track = document.getElementById('milestone-card-track');
        if (!track) return;

        track.innerHTML = '';

        if (!items.length) {
            track.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-size: 13px;">暂无里程碑</div>';
            return;
        }

        const sortedItems = [...items].sort((a, b) => (b.time || 0) - (a.time || 0));

        let userName = '';
        let charName = '';

        try {
            if (window.AIService && typeof window.AIService.loadPersonaLibrary === 'function') {
                if (window.chat20 && window.chat20.state) {
                    const contactId = currentFriendId;
                    const data = await window.AIService.loadPersonaLibrary();
                    const list = Array.isArray(data.list) ? data.list : [];
                    const defaultId = data.defaultId || '';

                    let selectedId = '';
                    if (window.chat20.state.friendMyPersonaSettings && contactId) {
                        selectedId = window.chat20.state.friendMyPersonaSettings[contactId] || '';
                    }

                    const effectiveId = selectedId || defaultId;
                    if (effectiveId) {
                        const profile = list.find(p => p && p.id === effectiveId);
                        if (profile && profile.name) {
                            userName = profile.name;
                        }
                    }
                }
            }
        } catch (e) {}

        if (!userName) {
            try {
                if (window.appData && window.appData.currentUser && window.appData.currentUser.name) {
                    userName = window.appData.currentUser.name;
                }
            } catch (e) {}
        }

        if (!userName) {
            userName = '用户';
        }

        try {
            if (window.chat20 && typeof window.chat20.getChatByContactId === 'function') {
                const chat = window.chat20.getChatByContactId(currentFriendId);
                if (chat && chat.name) {
                    charName = chat.name;
                }
            }
        } catch (e) {}

        if (!charName) {
            charName = '助手';
        }

        sortedItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'summary-card';
            card.dataset.id = item.id;

            const tagsHtml = item.tags && item.tags.length
                ? item.tags.map(tag => `<span style="background: #f0f2f5; color: #666; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${tag}</span>`).join(' ')
                : '';

            const renderedEvent = String(item.event || '')
                .replace(/\{char\}/g, charName)
                .replace(/\{user\}/g, userName);

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: #999;">${item.date}</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="milestone-edit-btn" data-id="${item.id}" style="background: none; border: none; color: #8aa5c7; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="milestone-delete-btn" data-id="${item.id}" style="background: none; border: none; color: #d8a8a8; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div style="font-size: 14px; color: #333; line-height: 1.5; margin-bottom: 8px;">${renderedEvent}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">${tagsHtml}</div>
                    <div style="font-size: 11px; color: #999; background: #f0f2f5; padding: 2px 6px; border-radius: 4px;">优先级: ${item.priority}</div>
                </div>
            `;

            track.appendChild(card);
        });

        track.querySelectorAll('.milestone-edit-btn').forEach(btn => {
            btn.style.position = 'relative';
            btn.style.zIndex = '10';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[MilestoneManager] Edit button clicked', btn.dataset.id);
                const itemId = btn.dataset.id;
                openMilestoneEditDialog(itemId);
            });
        });

        track.querySelectorAll('.milestone-delete-btn').forEach(btn => {
            btn.style.position = 'relative';
            btn.style.zIndex = '10';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[MilestoneManager] Delete button clicked', btn.dataset.id);
                const itemId = btn.dataset.id;
                
                if (window.uiDialog && window.uiDialog.openConfirm) {
                    window.uiDialog.openConfirm({
                        title: '删除里程碑',
                        message: '确定要删除这个里程碑吗？',
                        confirmText: '删除',
                        variant: 'danger'
                    }).then(confirmed => {
                        if (confirmed) {
                            deleteMilestone(currentFriendId, itemId);
                            renderMilestoneCards();
                            updateMilestoneStatus();
                            showNotification('里程碑已删除', 'success');
                        }
                    });
                } else if (confirm('确定要删除这个里程碑吗？')) {
                    deleteMilestone(currentFriendId, itemId);
                    renderMilestoneCards();
                    updateMilestoneStatus();
                }
            });
        });
    }

    function updateMilestoneStatus() {
        if (!currentFriendId) return;
        const memory = ensureMilestoneMemory(currentFriendId);
        const config = memory.config || DEFAULT_CONFIG;
        const items = Array.isArray(memory.items) ? memory.items : [];

        const statusEl = document.getElementById('current-milestone-status');
        if (statusEl) {
            if (config.enabled) {
                statusEl.textContent = `已启用 (${items.length}个)`;
            } else {
                statusEl.textContent = `未开启 (${items.length}个)`;
            }
        }

        const runManualBtn = document.getElementById('milestone-run-manual');
        if (runManualBtn) {
            const chat = window.chat20 ? window.chat20.getChatByContactId(currentFriendId) : null;
            if (chat) {
                const pending = Math.max(0, (chat.messages || []).length - (Number(memory.lastIndex) || 0));
                if (pending > 0) {
                    if (runManualBtn.textContent !== '提取中...') {
                        runManualBtn.textContent = `手动提取 (${pending})`;
                    }
                } else {
                    if (runManualBtn.textContent !== '提取中...') {
                        runManualBtn.textContent = '手动提取';
                    }
                }
            }
        }
    }

    function openMilestoneEditDialog(itemId = null) {
        const dialog = document.getElementById('milestone-edit-dialog');
        if (!dialog) return;

        editingMilestoneId = itemId;
        const titleEl = document.getElementById('milestone-edit-title');
        const dateInput = document.getElementById('milestone-edit-date');
        const eventInput = document.getElementById('milestone-edit-event');
        const priorityInput = document.getElementById('milestone-edit-priority');
        const tagsInput = document.getElementById('milestone-edit-tags');

        if (itemId) {
            titleEl.textContent = '编辑里程碑';
            const memory = ensureMilestoneMemory(currentFriendId);
            const items = Array.isArray(memory.items) ? memory.items : [];
            const item = items.find(i => i && i.id === itemId);
            if (item) {
                dateInput.value = item.date || '';
                eventInput.value = item.event || '';
                priorityInput.value = item.priority || 50;
                tagsInput.value = (item.tags || []).join(', ');
            }
        } else {
            titleEl.textContent = '添加里程碑';
            dateInput.value = getCurrentDate();
            eventInput.value = '';
            priorityInput.value = 50;
            tagsInput.value = '';
        }

        // 使用 classList 控制显示，配合 CSS 的 opacity/visibility 过渡
        dialog.classList.add('show');
        // 清除可能存在的内联样式，避免冲突
        dialog.style.display = '';
    }

    function closeMilestoneEditDialog() {
        const dialog = document.getElementById('milestone-edit-dialog');
        if (dialog) {
            dialog.classList.remove('show');
            // 移除内联样式，让 CSS 接管
            dialog.style.display = '';
        }
        editingMilestoneId = null;
    }

    async function executeMilestoneExtraction(friendId, chat, limit) {
        const runManualBtn = document.getElementById('milestone-run-manual');
        if (runManualBtn) {
            runManualBtn.disabled = true;
            runManualBtn.textContent = '提取中...';
        }

        try {
            const messages = chat.messages || [];
            const dialogues = messages.slice(-limit);
            const totalMessages = messages.length;

            console.log(`[Milestone] 手动提取: limit=${limit}, total=${totalMessages}, dialogues=${dialogues.length}`);

            const result = await extractMilestones(friendId, dialogues, { 
                ignoreEnabled: true, 
                totalMessages: totalMessages 
            });

            if (result && result.total > 0) {
                const addedCount = result.added ? result.added.length : 0;
                const mergedCount = result.merged ? result.merged.length : 0;
                let message = '提取到 ' + result.total + ' 个里程碑';
                if (mergedCount > 0) {
                    message += '（其中 ' + mergedCount + ' 个已自动合并）';
                }
                showNotification(message, 'success');
                renderMilestoneCards();
                updateMilestoneStatus();
            } else {
                showNotification('没有提取到新的重要事件', 'info');
            }
        } catch (e) {
            console.error('手动提取失败:', e);
            showNotification('提取失败', 'error');
        } finally {
            if (runManualBtn) {
                runManualBtn.disabled = false;
                runManualBtn.textContent = '手动提取';
                updateMilestoneStatus();
            }
        }
    }

    function openMilestoneSelectionOverlay(friendId, pendingCount, chat) {
        const existing = document.getElementById('milestoneSelectionOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'milestoneSelectionOverlay';
        overlay.className = 'batch-import-overlay show';
        // 使用CSS变量设置遮罩层级
        const overlayZIndex = getComputedStyle(document.documentElement).getPropertyValue('--z-modal') || '2100';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: ${overlayZIndex}; display: flex; align-items: center; justify-content: center;`;

        overlay.innerHTML = `
            <div class="batch-import-card" style="background: #fff; border-radius: 16px; padding: 20px; width: 85%; max-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
                <button class="card-close" id="closeMilestoneOverlay" style="position: absolute; top: 15px; right: 15px; border: none; background: none; font-size: 18px; color: #999; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
                <div class="batch-import-title" style="font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #333;">提取范围</div>
                <div class="batch-import-content" style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="font-size: 13px; color: #666; line-height: 1.4;">
                        当前有 <span style="color: #ff6b6b; font-weight: 600;">${pendingCount}</span> 条消息未提取。<br>
                        请选择要分析最近的多少条消息？
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #f5f7fa; border-radius: 8px; cursor: pointer;">
                            <span style="font-size: 14px; color: #333;">最近 20 条</span>
                            <input type="radio" name="milestone-count" value="20" checked>
                        </label>
                        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #f5f7fa; border-radius: 8px; cursor: pointer;">
                            <span style="font-size: 14px; color: #333;">最近 50 条</span>
                            <input type="radio" name="milestone-count" value="50">
                        </label>
                        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #f5f7fa; border-radius: 8px; cursor: pointer;">
                            <span style="font-size: 14px; color: #333;">全部未提取 (${pendingCount})</span>
                            <input type="radio" name="milestone-count" value="${pendingCount}">
                        </label>
                    </div>

                    <div class="batch-import-actions" style="margin-top: 10px;">
                        <button id="confirmMilestoneExtraction" style="width: 100%; height: 44px; background: #8aa5c7; color: #fff; border: none; border-radius: 22px; font-size: 15px; font-weight: 600; cursor: pointer;">
                            开始提取
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);

        const closeBtn = document.getElementById('closeMilestoneOverlay');
        closeBtn.addEventListener('click', () => overlay.remove());
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const confirmBtn = document.getElementById('confirmMilestoneExtraction');
        confirmBtn.addEventListener('click', () => {
            const selected = document.querySelector('input[name="milestone-count"]:checked');
            let count = selected ? parseInt(selected.value) : 20;
            if (isNaN(count)) count = 20;
            
            overlay.remove();
            executeMilestoneExtraction(friendId, chat, count);
        });
    }

    function saveMilestoneFromDialog() {
        const dateInput = document.getElementById('milestone-edit-date');
        const eventInput = document.getElementById('milestone-edit-event');
        const priorityInput = document.getElementById('milestone-edit-priority');
        const tagsInput = document.getElementById('milestone-edit-tags');

        const date = dateInput.value.trim();
        const event = eventInput.value.trim();
        const priority = parseInt(priorityInput.value) || 50;
        const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);

        if (!event) {
            alert('请输入事件描述');
            return;
        }

        const data = { date, event, priority, tags };

        if (editingMilestoneId) {
            updateMilestone(currentFriendId, editingMilestoneId, data);
        } else {
            addMilestone(currentFriendId, data);
        }

        closeMilestoneEditDialog();
        renderMilestoneCards();
        updateMilestoneStatus();
    }

    let eventsBound = false;

    function bindMilestoneEvents() {
        if (eventsBound) return;
        eventsBound = true;

        const milestoneItem = document.getElementById('friend-milestone-item');
        if (milestoneItem) {
            milestoneItem.addEventListener('click', () => {
                if (!currentFriendId) return;
                const memory = ensureMilestoneMemory(currentFriendId);
                const config = memory.config || DEFAULT_CONFIG;

                document.getElementById('milestone-enabled-toggle').checked = config.enabled;
                document.getElementById('milestone-token-input').value = config.tokenBudget;
                document.getElementById('milestone-step-input').value = config.step;

                renderMilestoneCards();
                showPage('milestone-settings-page');
            });
        }

        const backBtn = document.getElementById('milestone-settings-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                showPage('friend-settings-page');
            });
        }

        const promptSettingsBtn = document.getElementById('milestone-prompt-settings');
        if (promptSettingsBtn) {
            promptSettingsBtn.addEventListener('click', () => {
                const memory = ensureMilestoneMemory(currentFriendId);
                const config = memory.config || DEFAULT_CONFIG;
                const promptInput = document.getElementById('milestone-prompt-input');
                if (promptInput) {
                    promptInput.value = config.prompt || '';
                }
                showPage('milestone-prompt-page');
            });
        }

        const promptBackBtn = document.getElementById('milestone-prompt-back');
        if (promptBackBtn) {
            promptBackBtn.addEventListener('click', () => {
                showPage('milestone-settings-page');
            });
        }

        const promptSaveBtn = document.getElementById('milestone-prompt-save');
        if (promptSaveBtn) {
            promptSaveBtn.addEventListener('click', () => {
                const promptInput = document.getElementById('milestone-prompt-input');
                if (promptInput) {
                    updateMilestoneConfig(currentFriendId, { prompt: promptInput.value });
                    showNotification('提取提示词已保存', 'success');
                    showPage('milestone-settings-page');
                }
            });
        }

        const enabledToggle = document.getElementById('milestone-enabled-toggle');
        if (enabledToggle) {
            enabledToggle.addEventListener('change', (e) => {
                updateMilestoneConfig(currentFriendId, { enabled: e.target.checked });
                updateMilestoneStatus();
            });
        }

        const tokenInput = document.getElementById('milestone-token-input');
        if (tokenInput) {
            tokenInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value) || 200;
                updateMilestoneConfig(currentFriendId, { tokenBudget: Math.max(100, Math.min(1000, value)) });
            });
        }

        const stepInput = document.getElementById('milestone-step-input');
        if (stepInput) {
            stepInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value) || 20;
                updateMilestoneConfig(currentFriendId, { step: Math.max(10, Math.min(50, value)) });
            });
        }

        const addManualBtn = document.getElementById('milestone-add-manual');
        if (addManualBtn) {
            addManualBtn.addEventListener('click', () => {
                openMilestoneEditDialog();
            });
        }

        const runManualBtn = document.getElementById('milestone-run-manual');
        if (runManualBtn) {
            runManualBtn.addEventListener('click', async () => {
                if (!currentFriendId) {
                    console.log('[Milestone] currentFriendId为空');
                    showNotification('请先打开好友设置', 'info');
                    return;
                }

                // 使用 chat20 的方法获取对话
                const targetChat = window.chat20?.getChatByContactId(currentFriendId);
                
                if (!targetChat || !targetChat.messages || !targetChat.messages.length) {
                    showNotification('没有可提取的对话', 'info');
                    return;
                }

                const memory = ensureMilestoneMemory(currentFriendId);
                const lastIndex = Number(memory.lastIndex) || 0;
                const pendingCount = Math.max(0, targetChat.messages.length - lastIndex);

                if (pendingCount > 20) {
                    openMilestoneSelectionOverlay(currentFriendId, pendingCount, targetChat);
                } else {
                    executeMilestoneExtraction(currentFriendId, targetChat, 20);
                }
            });
        }

        const clearBtn = document.getElementById('milestone-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (window.uiDialog && window.uiDialog.openConfirm) {
                    window.uiDialog.openConfirm({
                        title: '清空里程碑',
                        message: '确定要清空所有里程碑吗？',
                        confirmText: '清空',
                        variant: 'danger'
                    }).then(confirmed => {
                        if (confirmed) {
                            clearMilestones(currentFriendId);
                            renderMilestoneCards();
                            updateMilestoneStatus();
                            showNotification('里程碑已清空', 'success');
                        }
                    });
                } else if (confirm('确定要清空所有里程碑吗？')) {
                    clearMilestones(currentFriendId);
                    renderMilestoneCards();
                    updateMilestoneStatus();
                    showNotification('里程碑已清空', 'success');
                }
            });
        }

        const cancelEditBtn = document.getElementById('cancel-edit-milestone');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', closeMilestoneEditDialog);
        }

        const saveEditBtn = document.getElementById('save-edit-milestone');
        if (saveEditBtn) {
            saveEditBtn.addEventListener('click', saveMilestoneFromDialog);
        }

        const editDialog = document.getElementById('milestone-edit-dialog');
        if (editDialog) {
            editDialog.addEventListener('click', (e) => {
                if (e.target === editDialog) {
                    closeMilestoneEditDialog();
                }
            });
        }
    }

    function showPage(pageId) {
        console.log('[MilestoneManager] 切换到页面:', pageId);
        
        // 隐藏所有子页面（里程碑设置、提示词等）
        document.querySelectorAll('.friend-settings-page').forEach(page => {
            if (page.id === 'friend-settings-page') {
                // 保持主设置页面的 active 类
                return;
            }
            // 移除 active 类并隐藏
            page.classList.remove('active');
            page.style.display = 'none';
        });
        
        // 显示目标页面
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.style.display = 'flex';
            targetPage.classList.add('active');
            console.log('[MilestoneManager] 页面已显示:', pageId);
        } else {
            console.error('[MilestoneManager] 页面未找到:', pageId);
        }
    }

    function showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    window.MilestoneManager = {
        init: function(friendId) {
            console.log('[MilestoneManager] 初始化, friendId:', friendId);
            currentFriendId = friendId;
            bindMilestoneEvents();
            updateMilestoneStatus();
            console.log('[MilestoneManager] 初始化完成');
        },

        getText: getMilestoneText,
        getBlock: getMilestoneBlock,
        extract: extractMilestones,
        add: addMilestone,
        addAsync: addMilestoneAsync,
        update: updateMilestone,
        delete: deleteMilestone,
        clear: clearMilestones,
        merge: mergeMilestones,
        getMergeHistory: getMergeHistory,
        clearMergeHistory: clearMergeHistory,
        getConfig: getMilestoneConfig,
        updateConfig: updateMilestoneConfig,
        render: renderMilestoneCards,
        updateStatus: updateMilestoneStatus
    };

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            if (window.friendSettings) {
                const originalInit = window.friendSettings.init;
                window.friendSettings.init = function() {
                    originalInit.call(this);
                    if (this.currentFriendId) {
                        window.MilestoneManager.init(this.currentFriendId);
                    }
                };
                
                const originalOpenFriendSettings = window.friendSettings.openFriendSettings;
                window.friendSettings.openFriendSettings = function() {
                    originalOpenFriendSettings.call(this);
                    if (this.currentFriendId) {
                        window.MilestoneManager.init(this.currentFriendId);
                    }
                };
            }
        }, 1000);
    });
})();
