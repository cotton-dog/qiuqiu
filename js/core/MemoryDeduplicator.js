(function(global) {
    'use strict';

    var MAX_TEXT_LENGTH = 200;
    var DEFAULT_CONFIG = {
        enabled: true,
        semanticDedup: false,
        lightweightThreshold: 0.75,
        autoMergeThreshold: 0.92,
        maxCompareCount: 50
    };

    var MemoryDeduplicator = {
        config: null,
        mergeHistory: [],
        MAX_HISTORY: 50,

        init: function(options) {
            var self = this;
            options = options || {};
            self.config = {};
            for (var key in DEFAULT_CONFIG) {
                if (DEFAULT_CONFIG.hasOwnProperty(key)) {
                    self.config[key] = options[key] !== undefined ? options[key] : DEFAULT_CONFIG[key];
                }
            }
            self.mergeHistory = [];
            return self;
        },

        jaccardSimilarity: function(text1, text2) {
            if (!text1 || !text2) return 0;

            var normalizeText = function(text) {
                return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').split('');
            };

            var set1 = normalizeText(text1);
            var set2 = normalizeText(text2);

            if (set1.length === 0 || set2.length === 0) return 0;

            var intersection = 0;
            var union = {};

            for (var i = 0; i < set1.length; i++) {
                union[set1[i]] = true;
            }
            for (var j = 0; j < set2.length; j++) {
                if (union[set2[j]]) {
                    intersection++;
                }
                union[set2[j]] = true;
            }

            var unionSize = 0;
            for (var key in union) {
                if (union.hasOwnProperty(key)) {
                    unionSize++;
                }
            }

            return unionSize > 0 ? intersection / unionSize : 0;
        },

        editDistance: function(text1, text2) {
            if (!text1 || !text2) return Math.max((text1 || '').length, (text2 || '').length);
            if (text1 === text2) return 0;

            var t1 = text1.length > MAX_TEXT_LENGTH ? text1.substring(0, MAX_TEXT_LENGTH) : text1;
            var t2 = text2.length > MAX_TEXT_LENGTH ? text2.substring(0, MAX_TEXT_LENGTH) : text2;

            var len1 = t1.length;
            var len2 = t2.length;

            var prev = [];
            var curr = [];

            for (var j = 0; j <= len2; j++) {
                prev[j] = j;
            }

            for (var i = 1; i <= len1; i++) {
                curr[0] = i;
                for (var j = 1; j <= len2; j++) {
                    var cost = t1.charAt(i - 1) === t2.charAt(j - 1) ? 0 : 1;
                    curr[j] = Math.min(
                        prev[j] + 1,
                        curr[j - 1] + 1,
                        prev[j - 1] + cost
                    );
                }
                var temp = prev;
                prev = curr;
                curr = temp;
            }

            return prev[len2];
        },

        normalizedEditSimilarity: function(text1, text2) {
            if (!text1 && !text2) return 1;
            if (!text1 || !text2) return 0;

            var maxLen = Math.max(text1.length, text2.length);
            if (maxLen === 0) return 1;

            var dist = this.editDistance(text1, text2);
            return 1 - (dist / maxLen);
        },

        lightweightSimilarity: function(text1, text2) {
            var jaccard = this.jaccardSimilarity(text1, text2);
            var editSim = this.normalizedEditSimilarity(text1, text2);

            return 0.5 * jaccard + 0.5 * editSim;
        },

        findSimilarMilestones: function(targetEvent, existingMilestones, options) {
            var self = this;
            options = options || {};
            var threshold = options.threshold || self.config.lightweightThreshold;
            var maxCount = options.maxCompareCount || self.config.maxCompareCount;

            if (!targetEvent || !existingMilestones || existingMilestones.length === 0) {
                return [];
            }

            var candidates = existingMilestones.slice(-maxCount);
            var results = [];

            for (var i = 0; i < candidates.length; i++) {
                var item = candidates[i];
                if (!item || !item.event) continue;

                var similarity = self.lightweightSimilarity(targetEvent, item.event);

                if (similarity >= threshold) {
                    results.push({
                        milestone: item,
                        similarity: similarity
                    });
                }
            }

            results.sort(function(a, b) {
                return b.similarity - a.similarity;
            });

            return results;
        },

        shouldMerge: function(similarity) {
            var self = this;
            return similarity >= self.config.autoMergeThreshold;
        },

        selectBetterDescription: function(desc1, desc2) {
            var hasNumber1 = /\d+/.test(desc1);
            var hasNumber2 = /\d+/.test(desc2);

            if (hasNumber1 && !hasNumber2) return desc1;
            if (!hasNumber1 && hasNumber2) return desc2;

            var hasDate1 = /\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/.test(desc1);
            var hasDate2 = /\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/.test(desc2);

            if (hasDate1 && !hasDate2) return desc1;
            if (!hasDate1 && hasDate2) return desc2;

            return desc1.length >= desc2.length ? desc1 : desc2;
        },

        mergeMilestones: function(target, source, options) {
            var self = this;
            options = options || {};

            var merged = {
                id: target.id,
                date: target.date,
                event: self.selectBetterDescription(target.event, source.event),
                priority: Math.max(target.priority || 50, source.priority || 50),
                tags: [],
                time: Math.min(target.time || Date.now(), source.time || Date.now()),
                mergedFrom: []
            };

            var tagSet = {};
            var addTags = function(tags) {
                if (!Array.isArray(tags)) return;
                for (var i = 0; i < tags.length; i++) {
                    if (tags[i] && !tagSet[tags[i]]) {
                        tagSet[tags[i]] = true;
                        merged.tags.push(tags[i]);
                    }
                }
            };

            addTags(target.tags);
            addTags(source.tags);

            if (target.mergedFrom && Array.isArray(target.mergedFrom)) {
                merged.mergedFrom = target.mergedFrom.slice();
            }
            merged.mergedFrom.push({
                id: source.id,
                event: source.event,
                date: source.date,
                time: Date.now()
            });

            return merged;
        },

        recordMergeHistory: function(mergeRecord) {
            var self = this;

            self.mergeHistory.push({
                id: 'merge_' + Date.now().toString(36),
                timestamp: Date.now(),
                targetId: mergeRecord.targetId,
                sourceIds: mergeRecord.sourceIds,
                sourceData: mergeRecord.sourceData
            });

            while (self.mergeHistory.length > self.MAX_HISTORY) {
                self.mergeHistory.shift();
            }
        },

        getMergeHistory: function() {
            return this.mergeHistory.slice();
        },

        clearMergeHistory: function() {
            this.mergeHistory = [];
        },

        checkAndMerge: function(newMilestone, existingMilestones, options) {
            var self = this;
            options = options || {};

            if (!self.config.enabled) {
                return { action: 'add', milestone: newMilestone };
            }

            var similar = self.findSimilarMilestones(
                newMilestone.event,
                existingMilestones,
                { threshold: self.config.lightweightThreshold }
            );

            if (similar.length === 0) {
                return { action: 'add', milestone: newMilestone };
            }

            var bestMatch = similar[0];

            if (self.shouldMerge(bestMatch.similarity)) {
                var merged = self.mergeMilestones(bestMatch.milestone, newMilestone);

                self.recordMergeHistory({
                    targetId: merged.id,
                    sourceIds: [newMilestone.id],
                    sourceData: {
                        id: newMilestone.id,
                        event: newMilestone.event,
                        date: newMilestone.date,
                        priority: newMilestone.priority,
                        tags: newMilestone.tags
                    }
                });

                return {
                    action: 'merge',
                    milestone: merged,
                    mergedWith: bestMatch.milestone,
                    similarity: bestMatch.similarity
                };
            }

            return {
                action: 'add',
                milestone: newMilestone,
                similarCandidates: similar
            };
        },

        setConfig: function(key, value) {
            var self = this;
            if (self.config && self.config.hasOwnProperty(key)) {
                self.config[key] = value;
            }
        },

        getConfig: function() {
            var self = this;
            var result = {};
            for (var key in self.config) {
                if (self.config.hasOwnProperty(key)) {
                    result[key] = self.config[key];
                }
            }
            return result;
        }
    };

    MemoryDeduplicator.init();

    global.MemoryDeduplicator = MemoryDeduplicator;

})(typeof window !== 'undefined' ? window : this);
