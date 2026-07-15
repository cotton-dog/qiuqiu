        // 独立运行时的核心服务初始化
        window.addEventListener('DOMContentLoaded', function() {
            window.Core = window.Core || {};
        });
        
        document.addEventListener('DOMContentLoaded', function() {
            const promptAdjustmentPage = document.getElementById('prompt-adjustment-page');
            const promptAdjustmentEntry = document.getElementById('prompt-adjustment');
            const promptAdjustmentBack = document.getElementById('prompt-adjustment-back');
            const savePromptTemplatesBtn = document.getElementById('save-prompt-templates');
            const resetPromptTemplatesBtn = document.getElementById('reset-prompt-templates');
            const resetSystemPromptOnlyBtn = document.getElementById('reset-system-prompt-only');
            const resetCardPromptBtn = document.getElementById('reset-card-prompt');
            const promptOrderList = document.getElementById('prompt-order-list');
            const promptSystemInput = document.getElementById('prompt-system-input');
            const promptCardInput = document.getElementById('prompt-card-input');
            const variableDescArea = document.getElementById('variable-desc-area');
            const promptPresetButtons = document.getElementById('prompt-preset-buttons');
            const PROMPT_MODULES = [
                { key: 'system', label: '系统指令', token: '{{system}}', desc: '全局规则、格式要求与输出边界' },
                { key: 'world_lore', label: '世界书', token: '{{world_lore}}', desc: '来自世界书管理与好友绑定的条目，按关键词或始终生效' },
                { key: 'summary', label: '聊天总结', token: '{{summary}}', desc: '自动/手动沉淀的对话摘要与长期记忆' },
                { key: 'milestones', label: '里程碑', token: '{{milestones}}', desc: '重要事件记录，从对话中自动提取的关键节点' },
                { key: 'char_settings', label: '角色设定', token: '{{char_settings}}', desc: '好友人设与角色身份、性格、说话风格' },
                { key: 'user_persona', label: '用户设定', token: '{{user_persona}}', desc: '我的人设与用户侧设定信息' },
                { key: 'examples', label: '示例对话', token: '{{examples}}', desc: '用于对话风格的示例内容' },
                { key: 'history', label: '聊天历史', token: '{{history}}', desc: '最近消息上下文（含日程信息）' },
                { key: 'card_list', label: '字卡列表', token: '{{card_list}}', desc: '字卡模式可用回复集合' }
            ];

            const DEFAULT_ORDER = ['system', 'world_lore', 'summary', 'milestones', 'char_settings', 'user_persona', 'examples', 'history', 'card_list'];
            const DEFAULT_SUB_TEMPLATES = {
                char_settings: '{{char_desc}}',
                system: '{{system_prompt}}',
                examples: '{{examples_content}}',
                history_line: '[#{{id}}] {{role}}: {{content}}',
                world_lore: '{{world_lore_content}}'
            };
            const DEFAULT_SYSTEM_PROMPT = `你就是 {char}。你只以这个身份存在和思考，正在和 {user} 对话。

[身份与视角]
1. 始终以 {char} 的第一人称说话，把 {user} 当作“你”，不要使用“用户”“玩家”“NPC”“AI”等称呼。
2. 只负责表达 {char} 自己的想法、感受和行为，不替 {user} 安排具体动作或台词，也不要代替 {user} 做决定。

[表达风格]
3. 保持稳定的人设与情绪基调，优先细腻、真诚、具体的情绪描写，避免空洞的鸡汤或模板化回复。
4. 回复应围绕当前对话展开，尊重上下文和剧情发展，不随意跳话题或跳过关键过程；当需要换话题或引入新话题时，要给出自然的过渡。
5. 叙述行动或安排时，避免变成干巴巴的“流水账”，不要在一段话里简单罗列“先做A、再做B、然后做C”；请选择对当前场景最重要的细节展开描写，其余可以含蓄略过。
6. 动作描写和心理旁白时，避免滥用“突然”“忽然”“一下子”等生硬的转场词；只有在场景确实需要突变或强烈反差时再用这些词，更多时候请通过环境变化、动作细节和内心感受来顺滑承接前后情绪和剧情。

[系统能力]
7. 你可以通过“引用、语音、系统描写、转账”等能力与 {user} 互动，但这些能力的具体格式和标签由系统的强制规则（System Mandate / God Prompt）统一约束，不要自行发明新格式。
8. 使用这些能力时要结合语境、保持克制：通常情况下以和 {user} 的自然对话为主，只有在确实需要强调上下文、情绪或环境时才使用引用、语音或系统描写，不要在每条回复里都使用，更不要只给出系统描写而不直接回应 {user}。
9. 不伪造系统通知或功能提示，不假装自己可以直接控制现实世界中的设备、账号或资金，只能在对话层面做情绪陪伴和建议。`;

            const DEFAULT_CARD_PROMPT = `[重要指令]
当前为"字卡模式"。你必须完全沉浸在你的角色设定中，但你受到了“失语诅咒”，无法自由说话。
你只能通过从[可用字卡列表]中选择最符合你当前心理活动和角色语气的卡片来表达自己。

规则：
1. 始终把自己当成 {char}，用 {char} 的思维去思考回复。
2. 从[可用字卡列表]中选出最能代表你（作为该角色）想说的话的字卡。
3. 必须仅输出字卡ID（格式如 #12）。
4. 严禁输出字卡的内容文本。
5. 严禁输出任何解释、寒暄或标点符号。
6. 引用：若要回复特定消息，请在ID后追加 {{quote:ID}} (例如 #12 {{quote:5}})。
7. 如果没有完美匹配的字卡，请选择最接近的一张，不要留空。`;

            const ONLINE_CHAT_SYSTEM_PROMPT = `你就是 {char}。你正在通过即时通讯软件和 {user} 聊天。

[核心规则]
1. 你只能发送文字消息，就像在微信/QQ上聊天一样。
2. 严禁任何动作描写、神态描写、环境描写。不要用括号、星号等包裹动作。
3. 严禁心理活动描写。不要写"心想"、"暗自"之类的内容。

[语言风格]
4. 回复要简短自然，像真人发微信一样。一条回复通常1-3句话，总字数控制在50字以内。
5. 使用口语化表达，避免书面语和长句。
6. 如果角色设定中包含活泼、年轻等特质，可以适当使用表情符号；严肃或正式角色避免使用。

[身份保持]
7. 始终以 {char} 的第一人称说话，把 {user} 当作"你"。
8. 不要使用"用户""玩家""NPC""AI"等称呼。

[可用能力]
9. 可以使用"引用"功能回复特定消息，格式为 {{quote:ID}}。
10. 禁止使用语音、系统描写、转账等功能。`;

            const STORY_MODE_SYSTEM_PROMPT = `你就是 {char}。你正在参与一个长线故事，与 {user} 共同推进剧情发展。

[叙事风格]
1. 注重场景描写和氛围营造，让故事有画面感。
2. 回复可以较长（200-500字），充分展开情节和细节。
3. 推动剧情发展，引入新的事件、冲突或转折。
4. 保持故事的连贯性，呼应之前发生的事件。

[角色扮演]
5. 始终以 {char} 的第一人称视角叙述和对话。
6. 描写角色的内心活动、情绪变化和成长。
7. 与其他角色互动时，保持角色性格的一致性。

[世界观]
8. 尊重世界书中的设定，保持世界观一致性。
9. 可以主动引入世界观元素丰富故事。
10. 注意时间线、地点、人物关系的逻辑。

[可用能力]
11. 可以使用"引用"功能回复特定消息，格式为 {{quote:ID}}。
12. 可以使用"系统描写"功能描述环境变化或事件发生（格式由系统约束）。`;

            const CARD_CHAT_SYSTEM_PROMPT = `你是 {char}。当前为字卡模式，你需要从可用字卡列表中选择最符合角色心理的回复。

选择字卡时考虑：
1. 角色的当前情绪状态
2. 对话上下文的语境
3. 字卡内容与角色性格的匹配度

始终以 {char} 的身份思考，选择最能表达角色想法的字卡。`;

            const PROMPT_PRESETS = [
                {
                    id: 'general_chat',
                    label: '日常聊天',
                    category: '通用',
                    description: '适合角色扮演对话，包含动作、神态、环境描写。',
                    order: DEFAULT_ORDER.slice(),
                    disabledKeys: [],
                    systemPrompt: DEFAULT_SYSTEM_PROMPT,
                    cardPrompt: DEFAULT_CARD_PROMPT
                },
                {
                    id: 'online_chat',
                    label: '即时聊天',
                    category: '线上聊天',
                    description: '模拟微信/QQ聊天风格，简短口语化，无动作描写。',
                    order: ['system', 'char_settings', 'history', 'summary', 'milestones', 'user_persona', 'examples', 'world_lore', 'card_list'],
                    disabledKeys: [],
                    systemPrompt: ONLINE_CHAT_SYSTEM_PROMPT,
                    cardPrompt: DEFAULT_CARD_PROMPT
                },
                {
                    id: 'card_chat',
                    label: '字卡模式',
                    category: '字卡聊天',
                    description: '专为AI字卡模式设计，从预设字卡中选择回复。',
                    order: ['system', 'char_settings', 'card_list', 'history', 'world_lore', 'summary', 'milestones', 'user_persona', 'examples'],
                    disabledKeys: [],
                    systemPrompt: CARD_CHAT_SYSTEM_PROMPT,
                    cardPrompt: DEFAULT_CARD_PROMPT
                },
                {
                    id: 'story_mode',
                    label: '长线剧情',
                    category: '剧情',
                    description: '适合连载故事、跑团，强调叙事和世界观。',
                    order: ['system', 'world_lore', 'char_settings', 'summary', 'milestones', 'examples', 'history', 'user_persona', 'card_list'],
                    disabledKeys: [],
                    systemPrompt: STORY_MODE_SYSTEM_PROMPT,
                    cardPrompt: DEFAULT_CARD_PROMPT
                }
            ];

            const PROMPT_PRESET_STORAGE_KEY = 'chat20.userPromptPresets';
            const PROMPT_PRESET_ACTIVE_KEY = 'chat20.currentPromptPresetId';

            const moduleMap = {};
            PROMPT_MODULES.forEach(item => {
                moduleMap[item.key] = item;
            });

            let currentOrder = DEFAULT_ORDER.slice();

            let currentDisabledKeys = new Set();

            function ensureOrder(list) {
                if (!Array.isArray(list) || list.length === 0) return DEFAULT_ORDER.slice();
                const filtered = list.filter(key => moduleMap[key]);
                return filtered.length > 0 ? filtered : DEFAULT_ORDER.slice();
            }

            function renderOrder() {
                if (!promptOrderList) return;
                promptOrderList.innerHTML = '';

                currentOrder.forEach((key, idx) => {
                    const item = moduleMap[key];
                    if (!item) return;

                    const isEnabled = !currentDisabledKeys.has(item.key);

                    const row = document.createElement('div');
                    row.className = 'prompt-order-item';
                    row.classList.toggle('is-disabled', !isEnabled);
                    row.innerHTML = `
                        <div class="prompt-order-main">
                            <div class="prompt-order-title">${item.label}</div>
                            <div class="prompt-order-desc">${item.desc}</div>
                        </div>
                        <div class="prompt-order-actions">
                            <label class="switch prompt-order-switch" title="启用/禁用">
                                <input type="checkbox" class="prompt-order-enabled" data-key="${item.key}" ${isEnabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <button class="order-move-btn order-up" type="button" aria-label="上移">↑</button>
                            <button class="order-move-btn order-down" type="button" aria-label="下移">↓</button>
                        </div>
                    `;

                    const enabledInput = row.querySelector('.prompt-order-enabled');
                    if (enabledInput) {
                        enabledInput.onchange = function(e) {
                            const checked = !!enabledInput.checked;
                            if (checked) currentDisabledKeys.delete(item.key);
                            else currentDisabledKeys.add(item.key);
                            row.classList.toggle('is-disabled', !checked);
                            e.stopPropagation();
                        };
                    }

                    const upBtn = row.querySelector('.order-up');
                    if (upBtn) {
                        upBtn.onclick = function(e) {
                            e.preventDefault();
                            if (idx <= 0) return;
                            const tmp = currentOrder[idx - 1];
                            currentOrder[idx - 1] = currentOrder[idx];
                            currentOrder[idx] = tmp;
                            renderOrder();
                        };
                    }

                    const downBtn = row.querySelector('.order-down');
                    if (downBtn) {
                        downBtn.onclick = function(e) {
                            e.preventDefault();
                            if (idx >= currentOrder.length - 1) return;
                            const tmp = currentOrder[idx + 1];
                            currentOrder[idx + 1] = currentOrder[idx];
                            currentOrder[idx] = tmp;
                            renderOrder();
                        };
                    }

                    promptOrderList.appendChild(row);
                });
            }

            function getCustomPresets() {
                try {
                    const raw = localStorage.getItem(PROMPT_PRESET_STORAGE_KEY);
                    if (!raw) return [];
                    const list = JSON.parse(raw);
                    if (Array.isArray(list)) return list;
                } catch(e) {}
                return [];
            }

            function saveCustomPresets(list) {
                try {
                    localStorage.setItem(PROMPT_PRESET_STORAGE_KEY, JSON.stringify(list || []));
                } catch(e) {}
            }

            function getAllPresets() {
                const customs = getCustomPresets();
                return PROMPT_PRESETS.concat(customs);
            }

            function getActivePresetId() {
                const val = localStorage.getItem(PROMPT_PRESET_ACTIVE_KEY);
                return val || '';
            }

            function setActivePresetId(id) {
                if (!id) {
                    localStorage.removeItem(PROMPT_PRESET_ACTIVE_KEY);
                } else {
                    localStorage.setItem(PROMPT_PRESET_ACTIVE_KEY, id);
                }
            }

            function applyPromptPreset(presetId) {
                const preset = getAllPresets().find(p => p.id === presetId);
                if (!preset) return;
                if (Array.isArray(preset.order) && preset.order.length) {
                    currentOrder = ensureOrder(preset.order);
                } else {
                    currentOrder = DEFAULT_ORDER.slice();
                }
                if (Array.isArray(preset.disabledKeys)) {
                    currentDisabledKeys = new Set(preset.disabledKeys.filter(k => moduleMap[k]));
                } else {
                    currentDisabledKeys = new Set();
                }
                renderOrder();
                if (promptSystemInput && typeof preset.systemPrompt === 'string') {
                    promptSystemInput.value = preset.systemPrompt;
                }
                if (promptCardInput && typeof preset.cardPrompt === 'string') {
                    promptCardInput.value = preset.cardPrompt;
                }
                try {
                    const subChar = document.getElementById('prompt-sub-char-settings');
                    const subSystem = document.getElementById('prompt-sub-system');
                    const subExamples = document.getElementById('prompt-sub-examples');
                    const subHistory = document.getElementById('prompt-sub-history-line');
                    const subWorld = document.getElementById('prompt-sub-world-lore');
                    if (preset.subTemplates && typeof preset.subTemplates === 'object') {
                        const src = preset.subTemplates;
                        if (subChar && typeof src.char_settings === 'string') subChar.value = src.char_settings;
                        if (subSystem && typeof src.system === 'string') subSystem.value = src.system;
                        if (subExamples && typeof src.examples === 'string') subExamples.value = src.examples;
                        if (subHistory && typeof src.history_line === 'string') subHistory.value = src.history_line;
                        if (subWorld && typeof src.world_lore === 'string') subWorld.value = src.world_lore;
                    }
                } catch(e) {}
                setActivePresetId(preset.id);
                renderPromptPresets();
                showNotification(`已应用预设「${preset.label}」，请确认后点击保存。`, 'success');
            }

            function renderPromptPresets() {
                if (!promptPresetButtons) return;
                promptPresetButtons.innerHTML = '';
                const activeId = getActivePresetId();
                const list = getAllPresets();
                list.forEach(preset => {
                    const item = document.createElement('div');
                    item.className = 'prompt-preset-item';
                    if (preset.id === activeId) {
                        item.classList.add('is-active');
                    }
                    item.dataset.presetId = preset.id;

                    const main = document.createElement('div');
                    main.className = 'prompt-preset-item-main';

                    const titleRow = document.createElement('div');
                    titleRow.className = 'prompt-preset-item-title-row';

                    const title = document.createElement('div');
                    title.className = 'prompt-preset-item-title';
                    title.textContent = typeof preset.label === 'string' ? preset.label : '';
                    titleRow.appendChild(title);

                    const categoryText = typeof preset.category === 'string' ? preset.category : '自定义';
                    if (categoryText) {
                        const tag = document.createElement('div');
                        tag.className = 'prompt-preset-item-tag';
                        tag.textContent = categoryText;
                        titleRow.appendChild(tag);
                    }

                    main.appendChild(titleRow);

                    if (preset.description && typeof preset.description === 'string') {
                        const desc = document.createElement('div');
                        desc.className = 'prompt-preset-item-desc';
                        desc.textContent = preset.description;
                        main.appendChild(desc);
                    }

                    const meta = document.createElement('div');
                    meta.className = 'prompt-preset-item-meta';

                    if (preset.id === activeId) {
                        const badge = document.createElement('div');
                        badge.className = 'prompt-preset-active-badge';
                        badge.textContent = '正在使用';
                        meta.appendChild(badge);
                    }

                    item.appendChild(main);
                    item.appendChild(meta);

                    item.onclick = function() {
                        applyPromptPreset(preset.id);
                    };

                    promptPresetButtons.appendChild(item);
                });
            }

            // --- 正则净化逻辑 ---
            const DEFAULT_REGEX_RULES = [
                { pattern: '^\\[ID:\\d+\\]\\s*[^:]+:\\s*', flags: 'i', replacement: '' },
                { pattern: '^NPC:\\s*', flags: 'i', replacement: '' },
                { pattern: '^玩家:\\s*', flags: 'i', replacement: '' }
            ];
            
            const regexListEl = document.getElementById('regex-list');
            const addRegexBtn = document.getElementById('add-regex-btn');
            const resetRegexBtn = document.getElementById('reset-regex-settings');

            function renderRegexList(rules) {
                if (!regexListEl) return;
                regexListEl.innerHTML = '';
                rules.forEach((rule) => {
                    const div = document.createElement('div');
                    div.className = 'regex-item';
                    div.innerHTML = `
                        <div class="regex-input-group">
                            <input type="text" class="regex-input regex-pattern" placeholder="正则 (如 ^NPC:)" value="${rule.pattern.replace(/"/g, '&quot;')}">
                            <div style="display:flex; gap:2px;">
                                <input type="text" class="regex-input regex-flags" placeholder="flags" value="${rule.flags || ''}">
                                <input type="text" class="regex-input regex-replacement" placeholder="替换为" value="${rule.replacement || ''}">
                            </div>
                        </div>
                        <div class="regex-remove-btn">
                            <i class="fas fa-times"></i>
                        </div>
                    `;
                    div.querySelector('.regex-remove-btn').onclick = function() {
                        div.remove();
                    };
                    regexListEl.appendChild(div);
                });
            }

            function getRegexRulesFromUI() {
                if (!regexListEl) return DEFAULT_REGEX_RULES;
                const items = regexListEl.querySelectorAll('.regex-item');
                const rules = [];
                items.forEach(item => {
                    const pattern = item.querySelector('.regex-pattern').value;
                    const flags = item.querySelector('.regex-flags').value;
                    const replacement = item.querySelector('.regex-replacement').value;
                    if(pattern) {
                        rules.push({ pattern, flags, replacement });
                    }
                });
                return rules;
            }

            if (addRegexBtn) {
                addRegexBtn.onclick = function() {
                    if (!regexListEl) return;
                    const div = document.createElement('div');
                    div.className = 'regex-item';
                    div.innerHTML = `
                        <div class="regex-input-group">
                            <input type="text" class="regex-input regex-pattern" placeholder="正则 (如 ^NPC:)">
                            <div style="display:flex; gap:2px;">
                                <input type="text" class="regex-input regex-flags" placeholder="flags">
                                <input type="text" class="regex-input regex-replacement" placeholder="替换为">
                            </div>
                        </div>
                        <div class="regex-remove-btn">
                            <i class="fas fa-times"></i>
                        </div>
                    `;
                    div.querySelector('.regex-remove-btn').onclick = function() {
                        div.remove();
                    };
                    regexListEl.appendChild(div);
                };
            }

            if (resetRegexBtn) {
                resetRegexBtn.onclick = function() {
                    if(confirm('确定要恢复默认正则规则吗？')) {
                        renderRegexList(DEFAULT_REGEX_RULES);
                    }
                };
            }

            function loadPromptSettings() {
                let savedOrder = null;
                try {
                    savedOrder = JSON.parse(localStorage.getItem('chat20.userPromptOrder'));
                } catch (e) {
                    savedOrder = null;
                }
                currentOrder = ensureOrder(savedOrder);

                let disabledKeys = null;
                try {
                    disabledKeys = JSON.parse(localStorage.getItem('chat20.userPromptDisabledKeys'));
                } catch (e) {
                    disabledKeys = null;
                }
                if (Array.isArray(disabledKeys)) {
                    currentDisabledKeys = new Set(disabledKeys.filter(k => moduleMap[k]));
                } else {
                    currentDisabledKeys = new Set();
                }
                renderOrder();

                const savedSys = localStorage.getItem('chat20.userSystemPrompt');
                if (promptSystemInput) promptSystemInput.value = savedSys || DEFAULT_SYSTEM_PROMPT;

                const savedCardPrompt = localStorage.getItem('chat20.userCardPrompt');
                if (promptCardInput) promptCardInput.value = savedCardPrompt || DEFAULT_CARD_PROMPT;

                if (variableDescArea) {
                    variableDescArea.textContent = '点击模块查看详细说明；世界书条目请在“世界书”管理中维护';
                    variableDescArea.style.color = '#777';
                }

                // 加载正则
                let savedRegex = null;
                try {
                    savedRegex = JSON.parse(localStorage.getItem('chat20.userRegexRules'));
                } catch(e) {}
                renderRegexList(savedRegex || DEFAULT_REGEX_RULES);

                try {
                    const rawSub = localStorage.getItem('chat20.userPromptSubTemplates');
                    let savedSub = null;
                    if (rawSub) savedSub = JSON.parse(rawSub);
                    const mergedSub = Object.assign({}, DEFAULT_SUB_TEMPLATES, savedSub || {});
                    const subChar = document.getElementById('prompt-sub-char-settings');
                    const subSystem = document.getElementById('prompt-sub-system');
                    const subExamples = document.getElementById('prompt-sub-examples');
                    const subHistory = document.getElementById('prompt-sub-history-line');
                    const subWorld = document.getElementById('prompt-sub-world-lore');
                    if (subChar) subChar.value = mergedSub.char_settings || DEFAULT_SUB_TEMPLATES.char_settings;
                    if (subSystem) subSystem.value = mergedSub.system || DEFAULT_SUB_TEMPLATES.system;
                    if (subExamples) subExamples.value = mergedSub.examples || DEFAULT_SUB_TEMPLATES.examples;
                    if (subHistory) subHistory.value = mergedSub.history_line || DEFAULT_SUB_TEMPLATES.history_line;
                    if (subWorld) subWorld.value = mergedSub.world_lore || DEFAULT_SUB_TEMPLATES.world_lore;
                } catch(e) {}

                // 加载AI格式修复设置
                try {
                    const repairSettings = JSON.parse(localStorage.getItem('chat20.aiFormatRepairSettings') || '{}');
                    const repairToggle = document.getElementById('ai-format-repair-toggle');
                    const repairSelect = document.getElementById('ai-format-repair-profile');
                    const repairPrompt = document.getElementById('ai-format-repair-prompt');
                    const repairSettingsDiv = document.getElementById('ai-format-repair-settings');
                    
                    if (repairSelect) {
                        const aiData = AIService.getProfiles();
                        const profiles = aiData && aiData.profiles ? aiData.profiles : [];
                        repairSelect.innerHTML = '<option value="" disabled selected>请选择配置方案</option>';
                        profiles.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.id;
                            opt.textContent = p.name;
                            repairSelect.appendChild(opt);
                        });
                        if (repairSettings.profileId) repairSelect.value = repairSettings.profileId;
                    }
                    
                    if (repairToggle) {
                        repairToggle.checked = !!repairSettings.enabled;
                        if (repairSettingsDiv) {
                            repairSettingsDiv.style.display = repairToggle.checked ? 'block' : 'none';
                        }
                    }

                    if (repairPrompt) {
                        const defaultRepairPrompt = "你是一个文本格式修复工具。你的任务是修复以下文本的格式以符合系统要求。\n规则：\n1. 引用必须使用 {{quote:ID:x}} 或 {{quote:ID}} 格式。\n2. 严禁修改对话的实际内容、语气或含义。\n3. 严禁添加任何无关的对话文本（如'这是修复后的文本'）。\n4. 只返回修复后的纯文本。\n5. 确保多条回复的分隔符 '---' 前后有换行。";
                        repairPrompt.value = repairSettings.prompt || defaultRepairPrompt;
                    }

                    const repairCardPrompt = document.getElementById('ai-format-repair-card-prompt');
                    if (repairCardPrompt) {
                         const defaultCardRepairPrompt = "你是一个文本格式修复工具。任务：从文本中提取字卡ID和引用信息。规则：\n1. 保持 #ID 格式。\n2. 保持 {{quote:ID}} 格式。\n3. 移除其他所有无关文本。";
                         repairCardPrompt.value = repairSettings.cardPrompt || defaultCardRepairPrompt;
                    }
                } catch(e) { console.error('Error loading AI repair settings', e); }
            }

            function savePromptSettings() {
                const order = currentOrder && currentOrder.length ? currentOrder : DEFAULT_ORDER.slice();
                localStorage.setItem('chat20.userPromptOrder', JSON.stringify(order));

                const enabledKeys = order.filter(key => !currentDisabledKeys.has(key));
                if (enabledKeys.length === 0) {
                    enabledKeys.push('system');
                    currentDisabledKeys.delete('system');
                }
                localStorage.setItem('chat20.userPromptDisabledKeys', JSON.stringify([...currentDisabledKeys]));

                const sysText = promptSystemInput ? promptSystemInput.value.trim() : '';
                if (sysText) {
                    localStorage.setItem('chat20.userSystemPrompt', sysText);
                } else {
                    localStorage.removeItem('chat20.userSystemPrompt');
                }

                const cardText = promptCardInput ? promptCardInput.value.trim() : '';
                if (cardText) {
                    localStorage.setItem('chat20.userCardPrompt', cardText);
                } else {
                    localStorage.removeItem('chat20.userCardPrompt');
                }

                // 保存正则
                const regexRules = getRegexRulesFromUI();
                localStorage.setItem('chat20.userRegexRules', JSON.stringify(regexRules));

                const subChar = document.getElementById('prompt-sub-char-settings');
                const subSystem = document.getElementById('prompt-sub-system');
                const subExamples = document.getElementById('prompt-sub-examples');
                const subHistory = document.getElementById('prompt-sub-history-line');
                const subWorld = document.getElementById('prompt-sub-world-lore');
                const subTemplates = {
                    char_settings: subChar && subChar.value ? subChar.value : DEFAULT_SUB_TEMPLATES.char_settings,
                    system: subSystem && subSystem.value ? subSystem.value : DEFAULT_SUB_TEMPLATES.system,
                    examples: subExamples && subExamples.value ? subExamples.value : DEFAULT_SUB_TEMPLATES.examples,
                    history_line: subHistory && subHistory.value ? subHistory.value : DEFAULT_SUB_TEMPLATES.history_line,
                    world_lore: subWorld && subWorld.value ? subWorld.value : DEFAULT_SUB_TEMPLATES.world_lore
                };
                localStorage.setItem('chat20.userPromptSubTemplates', JSON.stringify(subTemplates));

                // 保存AI格式修复设置
                const repairToggle = document.getElementById('ai-format-repair-toggle');
                const repairSelect = document.getElementById('ai-format-repair-profile');
                const repairPrompt = document.getElementById('ai-format-repair-prompt');
                const repairCardPrompt = document.getElementById('ai-format-repair-card-prompt');
                
                let previousRepair = {};
                try {
                    previousRepair = JSON.parse(localStorage.getItem('chat20.aiFormatRepairSettings') || '{}');
                } catch (e) {
                    previousRepair = {};
                }
                
                const repairSettings = {
                    enabled: repairToggle ? repairToggle.checked : false,
                    profileId: repairSelect ? repairSelect.value : '',
                    prompt: repairPrompt ? repairPrompt.value : '',
                    cardPrompt: repairCardPrompt ? repairCardPrompt.value : (previousRepair.cardPrompt || '')
                };
                localStorage.setItem('chat20.aiFormatRepairSettings', JSON.stringify(repairSettings));

                const template = enabledKeys.map(key => moduleMap[key].token).join('\n');
                localStorage.setItem('chat20.userPromptMasterTemplate', template);

                showNotification('提示词与正则设置已保存', 'success');
                if (promptAdjustmentPage) promptAdjustmentPage.style.display = 'none';
            }

            function resetPromptSettings() {
                if (confirm('确定要重置所有设置（包括正则）为默认吗？')) {
                    localStorage.removeItem('chat20.userPromptOrder');
                    localStorage.removeItem('chat20.userPromptDisabledKeys');
                    localStorage.removeItem('chat20.userSystemPrompt');
                    localStorage.removeItem('chat20.userPromptMasterTemplate');
                    localStorage.removeItem('chat20.userRegexRules'); // 重置正则
                    localStorage.removeItem('chat20.userPromptSubTemplates');
                    localStorage.removeItem(PROMPT_PRESET_ACTIVE_KEY);
                    
                    currentOrder = DEFAULT_ORDER.slice();
                    currentDisabledKeys = new Set();
                    if (promptSystemInput) promptSystemInput.value = DEFAULT_SYSTEM_PROMPT;
                    renderOrder();
                    renderRegexList(DEFAULT_REGEX_RULES); // 重置正则UI
                    try {
                        const subChar = document.getElementById('prompt-sub-char-settings');
                        const subSystem = document.getElementById('prompt-sub-system');
                        const subExamples = document.getElementById('prompt-sub-examples');
                        const subHistory = document.getElementById('prompt-sub-history-line');
                        const subWorld = document.getElementById('prompt-sub-world-lore');
                        if (subChar) subChar.value = DEFAULT_SUB_TEMPLATES.char_settings;
                        if (subSystem) subSystem.value = DEFAULT_SUB_TEMPLATES.system;
                        if (subExamples) subExamples.value = DEFAULT_SUB_TEMPLATES.examples;
                        if (subHistory) subHistory.value = DEFAULT_SUB_TEMPLATES.history_line;
                        if (subWorld) subWorld.value = DEFAULT_SUB_TEMPLATES.world_lore;
                    } catch(e) {}
                    
                    showNotification('已重置全部默认设置', 'success');
                }
            }

            function initPromptGroups() {
                if (!promptAdjustmentPage) return;
                const groups = promptAdjustmentPage.querySelectorAll('.prompt-group');
                groups.forEach(group => {
                    // 只有在未初始化的情况下才添加
                    if (group.dataset.initialized === 'true') return;
                    
                    group.classList.add('collapsed');
                    const header = group.querySelector('.prompt-group-header');
                    if (!header) return;
                    
                    header.addEventListener('click', function() {
                        group.classList.toggle('collapsed');
                    });
                    
                    group.dataset.initialized = 'true';
                });
            }

            function clearFloatingOverlays() {
                const selector = [
                    '.card-overlay',
                    '.batch-import-overlay',
                    '.folders-manager-overlay',
                    '.menu-overlay',
                    '.dark-overlay',
                    '.ui-dialog',
                    '.add-friend-modal',
                    '.mode-menu'
                ].join(',');
                document.querySelectorAll(selector).forEach(el => {
                    el.classList.remove('show');
                    el.classList.remove('active');
                    if (el.style && el.style.display) {
                        el.style.display = '';
                    }
                });
            }

            if (promptAdjustmentEntry) {
                promptAdjustmentEntry.onclick = function() {
                    loadPromptSettings();
                    renderPromptPresets();
                    initPromptGroups();
                    clearFloatingOverlays();
                    if (promptAdjustmentPage) promptAdjustmentPage.style.display = 'flex';
                };
            }

            if (promptAdjustmentBack) {
                promptAdjustmentBack.onclick = function() {
                    if (promptAdjustmentPage) promptAdjustmentPage.style.display = 'none';
                };
            }

            if (savePromptTemplatesBtn) {
                savePromptTemplatesBtn.onclick = savePromptSettings;
            }

            if (resetPromptTemplatesBtn) {
                resetPromptTemplatesBtn.onclick = resetPromptSettings;
            }

            if (resetSystemPromptOnlyBtn) {
                resetSystemPromptOnlyBtn.onclick = function() {
                    if (confirm('确定要恢复默认系统指令吗？')) {
                        if (promptSystemInput) promptSystemInput.value = DEFAULT_SYSTEM_PROMPT;
                        showNotification('已恢复默认系统指令', 'success');
                    }
                };
            }

            if (resetCardPromptBtn) {
                resetCardPromptBtn.onclick = function() {
                    if (confirm('确定要恢复默认字卡模式提示词吗？')) {
                        if (promptCardInput) promptCardInput.value = DEFAULT_CARD_PROMPT;
                        showNotification('已恢复默认字卡模式提示词', 'success');
                    }
                };
            }

            const resetSubTemplatesBtn = document.getElementById('reset-sub-templates');
            if (resetSubTemplatesBtn) {
                resetSubTemplatesBtn.onclick = function() {
                    if (confirm('确定要恢复默认子模板吗？')) {
                        const subChar = document.getElementById('prompt-sub-char-settings');
                        const subSystem = document.getElementById('prompt-sub-system');
                        const subExamples = document.getElementById('prompt-sub-examples');
                        const subHistory = document.getElementById('prompt-sub-history-line');
                        const subWorld = document.getElementById('prompt-sub-world-lore');
                        if (subChar) subChar.value = DEFAULT_SUB_TEMPLATES.char_settings;
                        if (subSystem) subSystem.value = DEFAULT_SUB_TEMPLATES.system;
                        if (subExamples) subExamples.value = DEFAULT_SUB_TEMPLATES.examples;
                        if (subHistory) subHistory.value = DEFAULT_SUB_TEMPLATES.history_line;
                        if (subWorld) subWorld.value = DEFAULT_SUB_TEMPLATES.world_lore;
                        localStorage.setItem('chat20.userPromptSubTemplates', JSON.stringify(DEFAULT_SUB_TEMPLATES));
                        showNotification('已恢复默认子模板', 'success');
                    }
                };
            }

            const resetPromptOrderBtn = document.getElementById('reset-prompt-order');
            if (resetPromptOrderBtn) {
                resetPromptOrderBtn.onclick = function() {
                    if (confirm('确定要恢复默认发送顺序吗？')) {
                        currentOrder = DEFAULT_ORDER.slice();
                        currentDisabledKeys = new Set();
                        renderOrder();
                        showNotification('已恢复默认发送顺序', 'success');
                    }
                };
            }

            // AI Format Repair Listeners
            const repairToggle = document.getElementById('ai-format-repair-toggle');
            if (repairToggle) {
                repairToggle.addEventListener('change', () => {
                    const settingsDiv = document.getElementById('ai-format-repair-settings');
                    if (settingsDiv) settingsDiv.style.display = repairToggle.checked ? 'block' : 'none';
                });
            }
            
            const resetRepairPromptBtn = document.getElementById('reset-repair-prompt');
            if (resetRepairPromptBtn) {
                resetRepairPromptBtn.addEventListener('click', () => {
                    const repairPrompt = document.getElementById('ai-format-repair-prompt');
                    if (repairPrompt) {
                        const defaultRepairPrompt = "你是一个文本格式修复工具。你的任务是修复以下文本的格式以符合系统要求。\n规则：\n1. 引用必须使用 {{quote:ID:x}} 或 {{quote:ID}} 格式。\n2. 严禁修改对话的实际内容、语气或含义。\n3. 严禁添加任何无关的对话文本（如'这是修复后的文本'）。\n4. 只返回修复后的纯文本。\n5. 确保多条回复的分隔符 '---' 前后有换行。";
                        repairPrompt.value = defaultRepairPrompt;
                        showNotification('已恢复默认修复提示词', 'success');
                    }
                });
            }

            const resetRepairCardPromptBtn = document.getElementById('reset-repair-card-prompt');
            if (resetRepairCardPromptBtn) {
                resetRepairCardPromptBtn.addEventListener('click', () => {
                     const repairCardPrompt = document.getElementById('ai-format-repair-card-prompt');
                     if (repairCardPrompt) {
                          const defaultCardRepairPrompt = "你是一个文本格式修复工具。任务：从文本中提取字卡ID和引用信息。规则：\n1. 保持 #ID 格式。\n2. 保持 {{quote:ID}} 格式。\n3. 移除其他所有无关文本。";
                          repairCardPrompt.value = defaultCardRepairPrompt;
                          showNotification('已恢复默认字卡模式修复提示词', 'success');
                     }
                });
            }

            const saveRepairSettingsBtn = document.getElementById('save-repair-settings');
            if (saveRepairSettingsBtn) {
                saveRepairSettingsBtn.onclick = savePromptSettings;
            }

            const addPromptPresetBtn = document.getElementById('add-prompt-preset-btn');
            if (addPromptPresetBtn) {
                addPromptPresetBtn.onclick = function() {
                    const order = currentOrder && currentOrder.length ? currentOrder.slice() : DEFAULT_ORDER.slice();
                    const disabled = Array.from(currentDisabledKeys || []);
                    const name = prompt('请输入预设名称（例如：我的聊天预设）');
                    if (!name) return;
                    const desc = prompt('可以为预设写一句说明（可留空）：') || '';
                    const sysText = promptSystemInput ? promptSystemInput.value.trim() : '';
                    const cardText = promptCardInput ? promptCardInput.value.trim() : '';
                    const subChar = document.getElementById('prompt-sub-char-settings');
                    const subSystem = document.getElementById('prompt-sub-system');
                    const subExamples = document.getElementById('prompt-sub-examples');
                    const subHistory = document.getElementById('prompt-sub-history-line');
                    const subWorld = document.getElementById('prompt-sub-world-lore');
                    const custom = {
                        id: 'custom_' + Date.now(),
                        label: name,
                        category: '自定义',
                        description: desc,
                        order: order,
                        disabledKeys: disabled,
                        systemPrompt: sysText || undefined,
                        cardPrompt: cardText || undefined,
                        subTemplates: {
                            char_settings: subChar && subChar.value ? subChar.value : undefined,
                            system: subSystem && subSystem.value ? subSystem.value : undefined,
                            examples: subExamples && subExamples.value ? subExamples.value : undefined,
                            history_line: subHistory && subHistory.value ? subHistory.value : undefined,
                            world_lore: subWorld && subWorld.value ? subWorld.value : undefined
                        }
                    };
                    const list = getCustomPresets();
                    list.push(custom);
                    saveCustomPresets(list);
                    setActivePresetId(custom.id);
                    renderPromptPresets();
                    showNotification('已保存为新的模板预设', 'success');
                };
            }
        });
