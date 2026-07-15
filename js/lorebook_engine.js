(function() {
    'use strict';

    class LoreEntry {
        constructor(keywords, content, priority = 0) {
            this.id = this.generateId();
            this.keywords = Array.isArray(keywords) ? keywords : [keywords];
            this.content = content;
            this.priority = priority;
            this.triggerCount = 0;
            this.enabled = true;
        }

        generateId() {
            return 'lore_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        }
    }

    class LorebookEngine {
        constructor(maxLoreTokens = 2000, stickyRounds = 3) {
            this.maxLoreTokens = maxLoreTokens;
            this.stickyRounds = stickyRounds;
            this.entries = [];
            this.compiledPatterns = new Map();
            this.activeMatches = new Map();
            this.combinationRules = [];
        }

        compileKeywordPattern(keyword) {
            const hasChinese = /[\u4e00-\u9fff]/.test(keyword);
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (hasChinese) {
                return new RegExp(escaped, 'gi');
            } else {
                return new RegExp('\\b' + escaped + '\\b', 'gi');
            }
        }

        addEntry(entry) {
            this.entries.push(entry);
            entry.keywords.forEach(keyword => {
                if (!this.compiledPatterns.has(keyword)) {
                    this.compiledPatterns.set(keyword, this.compileKeywordPattern(keyword));
                }
            });
        }

        addCombinationRule(keywords, content, priority = 0) {
            this.combinationRules.push({
                id: 'combo_' + Date.now().toString(36),
                keywords: Array.isArray(keywords) ? keywords : [keywords],
                content: content,
                priority: priority,
                enabled: true
            });
        }

        scanText(text) {
            if (!text || this.entries.length === 0) return [];

            const matchedEntries = new Map();
            const textLower = text.toLowerCase();

            this.compiledPatterns.forEach((pattern, keyword) => {
                if (pattern.test(text)) {
                    this.entries.forEach(entry => {
                        if (!entry.enabled) return;
                        if (entry.keywords.includes(keyword)) {
                            if (!matchedEntries.has(entry.id)) {
                                matchedEntries.set(entry.id, {
                                    entry: entry,
                                    matchedKeywords: new Set(),
                                    stickyCounter: 0,
                                    estimatedTokens: this.estimateTokens(entry.content)
                                });
                            }
                            matchedEntries.get(entry.id).matchedKeywords.add(keyword);
                        }
                    });
                }
            });

            const results = Array.from(matchedEntries.values());

            this.combinationRules.forEach(rule => {
                if (!rule.enabled) return;
                const allKeywordsMatched = rule.keywords.every(kw => {
                    const pattern = this.compiledPatterns.get(kw);
                    return pattern && pattern.test(text);
                });

                if (allKeywordsMatched) {
                    const comboEntry = new LoreEntry(rule.keywords, rule.content, rule.priority);
                    comboEntry.id = rule.id;
                    results.push({
                        entry: comboEntry,
                        matchedKeywords: new Set(rule.keywords),
                        stickyCounter: 0,
                        estimatedTokens: this.estimateTokens(rule.content),
                        isCombination: true
                    });
                }
            });

            return this.applyTokenBudget(results);
        }

        estimateTokens(text) {
            const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
            const englishWords = (text.match(/\b[a-zA-Z]+\b/g) || []).length;
            return Math.floor(chineseChars * 1.5 + englishWords * 1.3);
        }

        applyTokenBudget(matches) {
            const totalTokens = matches.reduce((sum, m) => sum + m.estimatedTokens, 0);

            if (totalTokens <= this.maxLoreTokens) {
                return matches.sort((a, b) =>
                    b.entry.priority - a.entry.priority ||
                    b.matchedKeywords.size - a.matchedKeywords.size
                );
            }

            const sorted = matches.sort((a, b) =>
                b.entry.priority - a.entry.priority ||
                b.matchedKeywords.size - a.matchedKeywords.size
            );

            const result = [];
            let currentTokens = 0;

            for (const match of sorted) {
                if (currentTokens + match.estimatedTokens <= this.maxLoreTokens) {
                    result.push(match);
                    currentTokens += match.estimatedTokens;
                } else {
                    break;
                }
            }

            return result;
        }

        injectToContext(systemPrompt, conversationHistory = [], position = 0) {
            if (this.activeMatches.size === 0) return systemPrompt;

            const sortedMatches = Array.from(this.activeMatches.values()).sort((a, b) =>
                b.entry.priority - a.entry.priority ||
                b.matchedKeywords.size - a.matchedKeywords.size
            );

            const loreSections = sortedMatches.map(m => {
                const keywordsStr = Array.from(m.matchedKeywords).join(', ');
                return `[${m.entry.keywords[0]}] ${m.entry.content}`;
            });

            if (loreSections.length === 0) return systemPrompt;

            const loreContent = '【世界书】\n' + loreSections.join('\n');

            if (position === 0) {
                return systemPrompt + '\n\n' + loreContent;
            } else if (position === 1 && conversationHistory.length > 0) {
                return systemPrompt + '\n\n' + loreContent;
            } else {
                return systemPrompt + '\n\n' + loreContent;
            }
        }

        updateStickyMatches(matches) {
            matches.forEach(match => {
                const entryId = match.entry.id;
                if (this.activeMatches.has(entryId)) {
                    this.activeMatches.get(entryId).stickyCounter = this.stickyRounds;
                } else {
                    this.activeMatches.set(entryId, {
                        ...match,
                        stickyCounter: this.stickyRounds
                    });
                }
            });

            for (const [entryId, match] of this.activeMatches) {
                match.stickyCounter--;
                if (match.stickyCounter <= 0) {
                    this.activeMatches.delete(entryId);
                }
            }
        }

        clearActiveMatches() {
            this.activeMatches.clear();
        }

        getStatistics() {
            return {
                totalEntries: this.entries.length,
                enabledEntries: this.entries.filter(e => e.enabled).length,
                activeMatches: this.activeMatches.size,
                totalKeywords: this.entries.reduce((sum, e) => sum + e.keywords.length, 0),
                estimatedTokens: Array.from(this.activeMatches.values())
                    .reduce((sum, m) => sum + m.estimatedTokens, 0)
            };
        }

        exportData() {
            return {
                entries: this.entries.map(e => ({
                    id: e.id,
                    keywords: e.keywords,
                    content: e.content,
                    priority: e.priority,
                    triggerCount: e.triggerCount,
                    enabled: e.enabled
                })),
                combinationRules: this.combinationRules.map(r => ({
                    id: r.id,
                    keywords: r.keywords,
                    content: r.content,
                    priority: r.priority,
                    enabled: r.enabled
                }))
            };
        }

        importData(data) {
            this.entries = [];
            this.compiledPatterns.clear();
            this.combinationRules = [];
            this.activeMatches.clear();

            if (data.entries) {
                data.entries.forEach(e => {
                    const entry = new LoreEntry(e.keywords, e.content, e.priority);
                    entry.id = e.id;
                    entry.triggerCount = e.triggerCount || 0;
                    entry.enabled = e.enabled !== false;
                    this.addEntry(entry);
                });
            }

            if (data.combinationRules) {
                data.combinationRules.forEach(r => {
                    this.combinationRules.push({
                        id: r.id,
                        keywords: r.keywords,
                        content: r.content,
                        priority: r.priority,
                        enabled: r.enabled !== false
                    });
                });
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LoreEntry, LorebookEngine };
    } else {
        window.LoreEntry = LoreEntry;
        window.LorebookEngine = LorebookEngine;
    }
})();
