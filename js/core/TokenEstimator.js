/**
 * TokenEstimator - Token估算器
 * 提供中英文混合文本的Token数量估算
 * 兼容性：Chrome 51+ (Android 7 WebView)
 * 
 * 注意：此实现仅处理BMP内字符（U+0000-U+FFFF）
 * BMP外字符（如emoji）会被代理对拆分为两个char处理
 * 在中文场景下此简化可接受，emoji估算可能偏高约2倍
 */
(function() {
  'use strict';

  var CHAR_WEIGHTS = {
    chinese: 0.55,
    english: 0.25,
    number: 0.25,
    punctuation: 0.5,
    space: 0.1,
    other: 0.3
  };

  var MODEL_FACTORS = {
    'gpt-3.5-turbo': 1.0,
    'gpt-4': 1.05,
    'gpt-4-turbo': 1.0,
    'claude': 0.95,
    'default': 1.0
  };

  function getCharType(code) {
    if (code >= 0x4e00 && code <= 0x9fff) {
      return 'chinese';
    }
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      return 'english';
    }
    if (code >= 0x30 && code <= 0x39) {
      return 'number';
    }
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      return 'space';
    }
    if ((code >= 0x21 && code <= 0x2f) ||
        (code >= 0x3a && code <= 0x40) ||
        (code >= 0x5b && code <= 0x60) ||
        (code >= 0x7b && code <= 0x7e) ||
        (code >= 0x3000 && code <= 0x303f)) {
      return 'punctuation';
    }
    return 'other';
  }

  function estimateTokens(text, options) {
    options = options || {};
    var s = String(text || '');
    if (!s) return 0;

    var weights = options.weights || CHAR_WEIGHTS;
    var modelFactor = MODEL_FACTORS[options.model] || MODEL_FACTORS['default'];
    
    var counts = {
      chinese: 0,
      english: 0,
      number: 0,
      punctuation: 0,
      space: 0,
      other: 0
    };

    for (var i = 0; i < s.length; i += 1) {
      var code = s.charCodeAt(i);
      var type = getCharType(code);
      counts[type] += 1;
    }

    var tokens = 0;
    tokens += counts.chinese * weights.chinese;
    tokens += counts.english * weights.english;
    tokens += counts.number * weights.number;
    tokens += counts.punctuation * weights.punctuation;
    tokens += counts.space * weights.space;
    tokens += counts.other * weights.other;

    tokens = tokens * modelFactor;
    var baseOverhead = options.includeOverhead !== false ? 4 : 0;

    return Math.ceil(tokens + baseOverhead);
  }

  function estimateTokensBatch(texts, options) {
    if (!texts || !Array.isArray(texts)) {
      return { total: 0, details: [] };
    }

    var total = 0;
    var details = [];

    for (var i = 0; i < texts.length; i += 1) {
      var t = estimateTokens(texts[i], options);
      details.push(t);
      total += t;
    }

    return { total: total, details: details };
  }

  function truncateByBudget(text, budget, keepTail) {
    var s = String(text || '').trim();
    if (!s) return '';
    
    var currentBudget = Number(budget);
    if (!isFinite(currentBudget) || currentBudget <= 0) return '';

    if (estimateTokens(s, { includeOverhead: false }) <= currentBudget) {
      return s;
    }

    var charWeights = [];
    for (var i = 0; i < s.length; i += 1) {
      var code = s.charCodeAt(i);
      var type = getCharType(code);
      charWeights.push(CHAR_WEIGHTS[type] || CHAR_WEIGHTS.other);
    }

    var prefixSum = [0];
    for (var j = 0; j < charWeights.length; j += 1) {
      prefixSum.push(prefixSum[j] + charWeights[j]);
    }

    var lo = 0;
    var hi = s.length;
    while (lo < hi) {
      var mid = Math.floor((lo + hi + 1) / 2);
      var tokens;
      if (keepTail) {
        tokens = prefixSum[s.length] - prefixSum[s.length - mid];
      } else {
        tokens = prefixSum[mid];
      }
      if (tokens <= currentBudget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    var result = keepTail ? s.slice(s.length - lo) : s.slice(0, lo);
    return String(result || '').trim();
  }

  var TokenEstimator = {
    estimate: estimateTokens,
    estimateBatch: estimateTokensBatch,
    truncate: truncateByBudget,
    CHAR_WEIGHTS: CHAR_WEIGHTS,
    MODEL_FACTORS: MODEL_FACTORS
  };

  if (typeof window !== 'undefined') {
    window.Core = window.Core || {};
    window.Core.TokenEstimator = TokenEstimator;
  }

})();
