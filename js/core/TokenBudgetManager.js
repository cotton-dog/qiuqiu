/**
 * TokenBudgetManager - Token预算管理器
 * 提供模块级Token预算分配和截断功能
 * 兼容性：Chrome 51+ (Android 7 WebView)
 * 
 * 注意：DEFAULT_BUDGET_RATIOS 仅包含"可截断模块"
 * 必需模块（system, char_settings, card_list）从 essentialTokens 中扣除
 */
(function() {
  'use strict';

  // 默认预算分配比例（可截断模块）
  var DEFAULT_BUDGET_RATIOS = {
    world_lore: 0.20,
    milestones: 0.12,
    user_persona: 0.10,
    summary: 0.08,
    examples: 0.05,
    schedule: 0.05,
    history: 'remaining'
  };

  // 模块优先级（预算不足时优先保留高优先级模块）
  var MODULE_PRIORITY = {
    system: 100,
    char_settings: 90,
    card_list: 85,
    history: 80,
    world_lore: 70,
    milestones: 60,
    user_persona: 50,
    summary: 40,
    examples: 30,
    schedule: 25
  };

  // 必需模块（不参与预算分配，从总额中扣除）
  var ESSENTIAL_MODULES = ['system', 'char_settings', 'card_list'];

  /**
   * 计算各模块的Token预算
   * @param {number} totalBudget - 总Token预算
   * @param {Object} ratios - 自定义比例（可选）
   * @param {Object} essentialTokens - 必需模块已消耗的Token
   * @returns {Object} 各模块的Token预算
   */
  function calculateBudgets(totalBudget, ratios, essentialTokens) {
    if (!isFinite(totalBudget) || totalBudget <= 0) {
      return {};
    }

    var r = ratios || DEFAULT_BUDGET_RATIOS;
    var essential = essentialTokens || {};

    // 计算必需模块消耗
    var essentialTotal = 0;
    for (var i = 0; i < ESSENTIAL_MODULES.length; i += 1) {
      var key = ESSENTIAL_MODULES[i];
      if (essential[key]) {
        essentialTotal += Number(essential[key]) || 0;
      }
    }

    // 剩余可分配预算（96为格式开销）
    var remaining = Math.max(0, totalBudget - essentialTotal - 96);

    var budgets = {};
    var allocated = 0;

    // 按比例分配（除history外）
    var ratioKeys = Object.keys(r);
    for (var j = 0; j < ratioKeys.length; j += 1) {
      var moduleKey = ratioKeys[j];
      if (moduleKey === 'history') continue;

      var ratio = r[moduleKey];
      if (typeof ratio === 'number' && ratio > 0) {
        budgets[moduleKey] = Math.floor(remaining * ratio);
        allocated += budgets[moduleKey];
      }
    }

    // history获取剩余部分
    if (r.history === 'remaining' || !r.history) {
      budgets.history = Math.max(0, remaining - allocated);
    } else if (typeof r.history === 'number') {
      budgets.history = Math.floor(remaining * r.history);
    }

    return budgets;
  }

  /**
   * 按行截断（保留完整行）
   * @param {string} text - 待截断文本
   * @param {number} budget - Token预算
   * @param {Object} estimator - Token估算器
   * @returns {string} 截断后的文本
   */
  function trimMultilineTail(text, budget, estimator) {
    var s = String(text || '').trim();
    if (!s) return '';
    
    if (!isFinite(budget) || budget <= 0) return '';
    
    var est = estimator || window.Core.TokenEstimator;
    if (!est) return s;
    
    if (est.estimate(s, { includeOverhead: false }) <= budget) {
      return s;
    }

    var lines = s.split(/\r?\n/);
    var keep = [];
    var used = 0;

    // 从尾部开始保留行
    for (var i = lines.length - 1; i >= 0; i -= 1) {
      var line = String(lines[i] || '').trim();
      if (!line) continue;
      
      var t = est.estimate(line, { includeOverhead: false });
      if (keep.length === 0 && t > budget) {
        // 单行超预算，字符截断
        keep.push(est.truncate(line, budget, true));
        used = est.estimate(keep[0], { includeOverhead: false });
        break;
      }
      if (used + t > budget) break;
      
      keep.push(line);
      used += t;
    }

    keep.reverse();
    return keep.join('\n').trim();
  }

  /**
   * 应用预算截断
   * @param {Object} contents - 各模块内容
   * @param {Object} budgets - 各模块预算
   * @param {Object} options - 截断选项
   * @returns {Object} 截断后的内容
   */
  function applyTruncation(contents, budgets, options) {
    options = options || {};
    var estimator = options.estimator || window.Core.TokenEstimator;
    var strategy = options.strategy || {}; // { moduleKey: 'char' | 'line' }

    if (!estimator || !contents || !budgets) {
      return contents;
    }

    var result = {};

    for (var key in contents) {
      if (!Object.prototype.hasOwnProperty.call(contents, key)) continue;

      var content = contents[key];
      var budget = budgets[key];

      if (!content || !budget || budget <= 0) {
        result[key] = content;
        continue;
      }

      // 检查是否需要截断
      var currentTokens = estimator.estimate(content, { includeOverhead: false });
      if (currentTokens <= budget) {
        result[key] = content;
        continue;
      }

      // 根据策略选择截断方式
      var moduleStrategy = strategy[key] || 'char';
      if (moduleStrategy === 'line') {
        result[key] = trimMultilineTail(content, budget, estimator);
      } else {
        result[key] = estimator.truncate(content, budget, options.keepTail);
      }
    }

    return result;
  }

  /**
   * 获取模块优先级
   */
  function getModulePriority(moduleKey) {
    return MODULE_PRIORITY[moduleKey] || 50;
  }

  /**
   * 按优先级排序模块
   */
  function sortByPriority(modules) {
    if (!Array.isArray(modules)) return [];

    var sorted = modules.slice();
    sorted.sort(function(a, b) {
      return getModulePriority(b) - getModulePriority(a);
    });
    return sorted;
  }

  // 导出
  var TokenBudgetManager = {
    calculateBudgets: calculateBudgets,
    applyTruncation: applyTruncation,
    trimMultilineTail: trimMultilineTail,
    getModulePriority: getModulePriority,
    sortByPriority: sortByPriority,
    DEFAULT_RATIOS: DEFAULT_BUDGET_RATIOS,
    MODULE_PRIORITY: MODULE_PRIORITY,
    ESSENTIAL_MODULES: ESSENTIAL_MODULES
  };

  if (typeof window !== 'undefined') {
    window.Core = window.Core || {};
    window.Core.TokenBudgetManager = TokenBudgetManager;
  }

})();
