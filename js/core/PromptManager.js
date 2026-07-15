/**
 * PromptManager - 统一的Prompt构建管理器
 * 负责模块化组装prompt，支持变量替换、模块启用/禁用、顺序调整
 * 兼容性：Chrome 51+ (Android 7 WebView)
 */
(function() {
  'use strict';

  function PromptManager() {
    this.modules = {};
    this.moduleBuilders = {};
    this.order = [];
    this.disabledKeys = {};
    this.subTemplates = {};
    this.variableContext = {
      charName: '',
      charDesc: '',
      userName: '',
      userId: ''
    };
  }

  PromptManager.prototype.initDefaultModules = function(modules) {
    var self = this;
    if (!Array.isArray(modules)) return;
    
    modules.forEach(function(m) {
      if (!m || !m.key) return;
      self.modules[m.key] = {
        label: m.label || m.key,
        token: m.token || '',
        desc: m.desc || ''
      };
    });
    
    if (self.order.length === 0) {
      self.order = Object.keys(self.modules);
    }
  };

  PromptManager.prototype.registerModuleBuilder = function(key, builder) {
    if (!key || typeof key !== 'string') {
      console.warn('[PromptManager] registerModuleBuilder: invalid key');
      return;
    }
    if (typeof builder !== 'function') {
      console.warn('[PromptManager] registerModuleBuilder: builder must be a function');
      return;
    }
    this.moduleBuilders[key] = builder;
  };

  PromptManager.prototype.unregisterModuleBuilder = function(key) {
    delete this.moduleBuilders[key];
  };

  PromptManager.prototype.clearModuleBuilders = function() {
    this.moduleBuilders = {};
  };

  PromptManager.prototype.setModuleOrder = function(order) {
    var self = this;
    if (!Array.isArray(order)) return;
    this.order = order.filter(function(key) {
      return self.modules[key];
    });
  };

  PromptManager.prototype.getModuleOrder = function() {
    var self = this;
    return this.order.filter(function(key) {
      return !self.disabledKeys[key];
    });
  };

  PromptManager.prototype.enableModule = function(key, enabled) {
    if (enabled) {
      delete this.disabledKeys[key];
    } else {
      this.disabledKeys[key] = true;
    }
  };

  PromptManager.prototype.isModuleEnabled = function(key) {
    return !this.disabledKeys[key] && !!this.modules[key];
  };

  PromptManager.prototype.getModuleConfig = function(key) {
    return this.modules[key] || null;
  };

  PromptManager.prototype.setSubTemplate = function(key, template) {
    if (typeof template === 'string') {
      this.subTemplates[key] = template;
    }
  };

  PromptManager.prototype.getSubTemplate = function(key) {
    return this.subTemplates[key] || '';
  };

  PromptManager.prototype.setVariableContext = function(ctx) {
    var self = this;
    if (!ctx || typeof ctx !== 'object') return;
    
    var allowedKeys = ['charName', 'charDesc', 'userName', 'userId'];
    allowedKeys.forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(ctx, key)) {
        self.variableContext[key] = ctx[key];
      }
    });
  };

  PromptManager.prototype.replaceVariables = function(text) {
    if (!text || typeof text !== 'string') return '';
    
    var ctx = this.variableContext;
    
    if (window.Core && window.Core.ContextTemplates && window.Core.ContextTemplates.VariableEngine) {
      return window.Core.ContextTemplates.VariableEngine.replaceAll(text, ctx);
    }
    
    return text
      .replace(/\{\{char_name\}\}/g, ctx.charName || '')
      .replace(/\{\{char_desc\}\}/g, ctx.charDesc || '')
      .replace(/\{\{char\}\}/g, ctx.charName || '')
      .replace(/\{\{user\}\}/g, ctx.userName || '')
      .replace(/\{\{user_id\}\}/g, ctx.userId || '')
      .replace(/\{char\}/g, ctx.charName || '')
      .replace(/\{user\}/g, ctx.userName || '');
  };

  function createTimeoutPromise(ms, message) {
    var timerId;
    var promise = new Promise(function(_, reject) {
      timerId = setTimeout(function() {
        reject(new Error(message));
      }, ms);
    });
    promise.cancel = function() {
      if (timerId) clearTimeout(timerId);
    };
    return promise;
  }

  PromptManager.prototype.buildPrompt = function(context, options) {
    var self = this;
    context = context || {};
    options = options || {};
    
    var timeout = options.timeout || 30000;
    var fallbackOnError = options.fallbackOnError !== false;
    var parts = [];
    var errors = [];
    var activeTimeouts = [];

    var result = self.order.reduce(function(promise, key) {
      return promise.then(function() {
        if (self.disabledKeys[key]) return;

        var builder = self.moduleBuilders[key];
        if (typeof builder !== 'function') return;

        var timeoutPromise = createTimeoutPromise(
          timeout,
          'Builder ' + key + ' timeout'
        );
        activeTimeouts.push(timeoutPromise);

        var builderResult;
        try {
          builderResult = builder.call(self, context);
        } catch (e) {
          builderResult = Promise.reject(e);
        }

        var builderPromise = Promise.resolve(builderResult);

        return Promise.race([builderPromise, timeoutPromise])
          .then(function(content) {
            timeoutPromise.cancel();
            if (content && typeof content === 'string' && content.trim()) {
              parts.push(content);
            }
          })
          .catch(function(e) {
            timeoutPromise.cancel();
            console.error('[PromptManager] Builder ' + key + ' failed:', e);
            errors.push({ key: key, error: e.message });
            if (!fallbackOnError) {
              throw new Error('Prompt构建失败: ' + key + ' - ' + e.message);
            }
          });
      });
    }, Promise.resolve());

    function cleanupTimeouts() {
      activeTimeouts.forEach(function(t) {
        if (t.cancel) t.cancel();
      });
    }

    return result.then(
      function() {
        cleanupTimeouts();
        if (errors.length > 0) {
          console.warn('[PromptManager] ' + errors.length + ' module(s) failed:', errors);
        }
        return self.replaceVariables(parts.join('\n\n'));
      },
      function(err) {
        cleanupTimeouts();
        throw err;
      }
    );
  };

  PromptManager.prototype.getStatistics = function() {
    var self = this;
    return {
      totalModules: Object.keys(this.modules).length,
      enabledModules: this.order.filter(function(k) { return !self.disabledKeys[k]; }).length,
      disabledModules: Object.keys(this.disabledKeys).length,
      hasBuilders: Object.keys(this.moduleBuilders).length
    };
  };

  if (typeof window !== 'undefined') {
    window.Core = window.Core || {};
    if (window.Core.PromptManager) {
      console.warn('[PromptManager] window.Core.PromptManager already exists, overwriting');
    }
    window.Core.PromptManager = PromptManager;
  }

})();
