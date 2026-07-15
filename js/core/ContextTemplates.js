/**
 * ContextTemplates - Context模板管理器
 * 提供多种模型格式的消息模板
 * 兼容性：Chrome 51+ (Android 7 WebView)
 */
(function() {
  'use strict';

  var customTemplates = {};

  var PRESET_TEMPLATES = {
    'default': {
      id: 'default',
      name: '默认格式',
      description: '通用格式，使用原生role字段',
      format: {
        useRoleField: true,
        messageSeparator: '\n'
      }
    },
    'chatml': {
      id: 'chatml',
      name: 'ChatML',
      description: 'OpenAI ChatML格式',
      format: {
        useRoleField: true,
        messageSeparator: '\n'
      }
    },
    'alpaca': {
      id: 'alpaca',
      name: 'Alpaca',
      description: 'LLaMA系列模型格式',
      format: {
        useRoleField: false,
        userStart: '### Instruction:\n',
        userEnd: '\n\n### Response:',
        assistantStart: '',
        assistantEnd: '',
        systemStart: '### System:\n',
        systemEnd: '\n\n',
        messageSeparator: '\n'
      }
    },
    'vicuna': {
      id: 'vicuna',
      name: 'Vicuna',
      description: 'Vicuna系列模型格式',
      format: {
        useRoleField: false,
        userStart: 'USER: ',
        userEnd: '\nASSISTANT:',
        assistantStart: '',
        assistantEnd: '',
        systemStart: 'SYSTEM: ',
        systemEnd: '\n',
        messageSeparator: '\n'
      }
    }
  };

  var isArray = Array.isArray || function(a) {
    return Object.prototype.toString.call(a) === '[object Array]';
  };

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    var typeStr = Object.prototype.toString.call(obj);

    if (typeStr === '[object Date]') {
      return new Date(obj.getTime());
    }

    if (typeStr === '[object RegExp]') {
      var flags = '';
      if (obj.global) flags += 'g';
      if (obj.ignoreCase) flags += 'i';
      if (obj.multiline) flags += 'm';
      if (obj.sticky) flags += 'y';
      if (obj.unicode) flags += 'u';
      return new RegExp(obj.source, flags);
    }

    if (isArray(obj)) {
      var arrCopy = [];
      for (var i = 0; i < obj.length; i += 1) {
        if (i in obj) {
          arrCopy[i] = deepClone(obj[i]);
        }
      }
      return arrCopy;
    }

    var objCopy = {};
    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; j += 1) {
      var k = keys[j];
      objCopy[k] = deepClone(obj[k]);
    }
    return objCopy;
  }

  var TemplateParser = {
    _cache: {},
    _cacheOrder: [],
    MAX_CACHE_SIZE: 50,
    MAX_INHERITANCE_DEPTH: 10,

    parse: function(templateDef) {
      if (!templateDef || typeof templateDef !== 'object') {
        return null;
      }
      var cacheKey = this._generateCacheKey(templateDef);
      if (this._cache[cacheKey]) {
        this._touchCache(cacheKey);
        return this._cache[cacheKey];
      }
      var result = this._doParse(templateDef);
      this._addToCache(cacheKey, result);
      return result;
    },

    _generateCacheKey: function(templateDef) {
      var id = String(templateDef.id || '__unnamed__').replace(/[\x00-\x1f]/g, '');
      var ext = templateDef.extends ? String(templateDef.extends).replace(/[\x00-\x1f]/g, '') : '';
      return '\x01' + id + '\x00' + ext + '\x01';
    },

    _touchCache: function(key) {
      var idx = this._cacheOrder.indexOf(key);
      if (idx !== -1) {
        this._cacheOrder.splice(idx, 1);
        this._cacheOrder.push(key);
      }
    },

    _doParse: function(templateDef) {
      var result = {
        id: templateDef.id || 'unknown',
        name: templateDef.name || 'Unknown',
        description: templateDef.description || '',
        format: this._parseFormat(templateDef.format),
        extends: templateDef.extends || null
      };
      if (result.extends) {
        result = this._resolveInheritance(result, {}, 0);
      }
      return result;
    },

    _parseFormat: function(formatDef) {
      if (!formatDef || typeof formatDef !== 'object') {
        return { useRoleField: true, messageSeparator: '\n' };
      }
      var result = {};
      var keys = Object.keys(formatDef);
      for (var i = 0; i < keys.length; i++) {
        result[keys[i]] = formatDef[keys[i]];
      }
      return result;
    },

    _resolveInheritance: function(template, visitedIds, depth) {
      if (depth > this.MAX_INHERITANCE_DEPTH) {
        console.warn('[TemplateParser] Inheritance depth exceeded');
        return template;
      }
      
      var templateId = template.id || ('__anon_' + depth);
      if (visitedIds[templateId]) {
        console.warn('[TemplateParser] Circular inheritance: ' + templateId);
        return template;
      }
      
      var newVisited = {};
      for (var k in visitedIds) {
        if (Object.prototype.hasOwnProperty.call(visitedIds, k)) {
          newVisited[k] = true;
        }
      }
      newVisited[templateId] = true;
      
      var parent = getTemplate(template.extends);
      if (!parent) {
        console.warn('[TemplateParser] Parent not found: ' + template.extends);
        return template;
      }
      
      if (parent.extends) {
        parent = this._resolveInheritance(parent, newVisited, depth + 1);
      }
      
      return {
        id: template.id,
        name: template.name,
        description: template.description || parent.description,
        format: this._mergeFormats(parent.format, template.format)
      };
    },

    _mergeFormats: function(parentFormat, childFormat) {
      var result = {};
      var key;
      for (key in parentFormat) {
        if (Object.prototype.hasOwnProperty.call(parentFormat, key)) {
          result[key] = parentFormat[key];
        }
      }
      for (key in childFormat) {
        if (Object.prototype.hasOwnProperty.call(childFormat, key)) {
          result[key] = childFormat[key];
        }
      }
      return result;
    },

    _addToCache: function(key, value) {
      if (this._cache[key]) {
        this._touchCache(key);
        return;
      }
      
      while (this._cacheOrder.length >= this.MAX_CACHE_SIZE) {
        var oldestKey = this._cacheOrder.shift();
        delete this._cache[oldestKey];
      }
      
      this._cache[key] = value;
      this._cacheOrder.push(key);
    },

    clearCache: function() {
      this._cache = {};
      this._cacheOrder = [];
    }
  };

  var VariableEngine = {
    _markerCounter: 0,
    
    _generateMarker: function() {
      return '\x02UNIQ_' + 
             Date.now().toString(36) + '_' + 
             (this._markerCounter++) + '_' +
             Math.random().toString(36).slice(2, 7) + 
             '\x03';
    },
    
    replaceAll: function(text, context, options) {
      if (!text || typeof text !== 'string') return '';
      if (!context) return text;
      
      options = options || {};
      
      var self = this;
      var replaced = {};
      
      var pattern = /\{\{([a-zA-Z0-9_\.]+)(?:\|((?:[^}]|\}(?!\}))*))?\}\}/g;
      
      var result = text.replace(pattern, function(match, key, defaultVal) {
        var value = self._getValue(context, key);
        if (value === undefined || value === null) {
          if (defaultVal !== undefined) {
            value = defaultVal;
          } else {
            if (options.strictMode) {
              console.warn('[VariableEngine] Missing variable: ' + key);
            }
            value = '';
          }
        }
        
        var marker = self._generateMarker();
        replaced[marker] = String(value);
        return marker;
      });
      
      var keys = Object.keys(replaced);
      if (keys.length > 0) {
        var markerRegex = new RegExp(
          keys.map(function(m) {
            return m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          }).join('|'),
          'g'
        );
        result = result.replace(markerRegex, function(match) {
          return replaced[match];
        });
      }
      
      var legacyMap = { 
        char: 'charName', 
        user: 'userName',
        char_name: 'charName',
        char_desc: 'charDesc',
        user_id: 'userId'
      };
      result = result.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, key) {
        if (legacyMap[key]) {
          return Object.prototype.hasOwnProperty.call(context, legacyMap[key])
            ? String(context[legacyMap[key]]) : match;
        }
        return match;
      });
      
      return result;
    },
    
    _getValue: function(context, key) {
      if (key.indexOf('.') === -1) {
        return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : undefined;
      }
      
      var parts = key.split('.');
      var value = context;
      for (var i = 0; i < parts.length; i++) {
        if (value === null || value === undefined) return undefined;
        if (typeof value !== 'object') return undefined;
        value = value[parts[i]];
      }
      return value;
    }
  };

  function replaceVariables(content, context, strictMode) {
    return VariableEngine.replaceAll(content, context, { strictMode: strictMode });
  }

  function validateTemplate(template) {
    if (!template || typeof template !== 'object') {
      return { valid: false, error: 'Template must be an object' };
    }
    if (!template.id || typeof template.id !== 'string') {
      return { valid: false, error: 'Template must have string id' };
    }
    if (!template.format || typeof template.format !== 'object') {
      return { valid: false, error: 'Template must have format object' };
    }
    return { valid: true, error: null };
  }

  function getTemplate(templateId) {
    var template = customTemplates[templateId] 
      || PRESET_TEMPLATES[templateId] 
      || PRESET_TEMPLATES['default'];
    return deepClone(template);
  }

  function getPresetTemplate(templateId) {
    var template = PRESET_TEMPLATES[templateId] || PRESET_TEMPLATES['default'];
    return deepClone(template);
  }

  function getAllPresets() {
    return deepClone(PRESET_TEMPLATES);
  }

  function registerTemplate(template) {
    var validation = validateTemplate(template);
    if (!validation.valid) {
      throw new Error('Invalid template: ' + validation.error);
    }
    if (PRESET_TEMPLATES[template.id]) {
      console.warn('[ContextTemplates] Overriding preset template: ' + template.id);
    }
    customTemplates[template.id] = deepClone(template);
    return true;
  }

  function unregisterTemplate(templateId) {
    if (PRESET_TEMPLATES[templateId]) {
      return false;
    }
    return delete customTemplates[templateId];
  }

  function getTemplateList() {
    var list = [];
    var added = {};

    for (var id in PRESET_TEMPLATES) {
      if (Object.prototype.hasOwnProperty.call(PRESET_TEMPLATES, id)) {
        var t = PRESET_TEMPLATES[id];
        list.push({ id: t.id, name: t.name, description: t.description, isPreset: true });
        added[id] = true;
      }
    }

    for (var id in customTemplates) {
      if (Object.prototype.hasOwnProperty.call(customTemplates, id) && !added[id]) {
        var t = customTemplates[id];
        list.push({ id: t.id, name: t.name, description: t.description, isPreset: false });
      }
    }

    return list;
  }

  function formatMessage(message, template, opts) {
    opts = opts || {};
    var safeMessage = message || { role: 'user', content: '' };
    var safeTemplate = template || getTemplate('default');
    var context = opts.context || {};

    var role = safeMessage.role || 'user';
    var content = String(safeMessage.content || '');
    var format = safeTemplate.format || {};

    content = replaceVariables(content, context, opts.strictMode);

    if (format.useRoleField) {
      return { role: role, content: content };
    }

    var formatted = '';
    if (role === 'system') {
      formatted = (format.systemStart || '') + content + (format.systemEnd || '');
    } else if (role === 'user') {
      formatted = (format.userStart || '') + content + (format.userEnd || '');
    } else if (role === 'assistant') {
      formatted = (format.assistantStart || '') + content + (format.assistantEnd || '');
    } else {
      formatted = content;
    }

    return { role: role, content: formatted };
  }

  function formatMessages(messages, templateOrId, opts) {
    if (!Array.isArray(messages)) {
      return [];
    }

    opts = opts || {};
    var template = typeof templateOrId === 'string' 
      ? getTemplate(templateOrId) 
      : templateOrId;

    if (!template) {
      template = getTemplate('default');
    }

    var returnMode = opts.returnMode || 'array';
    var result = [];
    var separator = (template.format && template.format.messageSeparator) || '\n';

    for (var i = 0; i < messages.length; i += 1) {
      var formatted = formatMessage(messages[i], template, opts);
      result.push(formatted);
    }

    if (returnMode === 'string') {
      var contents = [];
      for (var j = 0; j < result.length; j += 1) {
        contents.push(result[j].content);
      }
      return contents.join(separator);
    }

    return result;
  }

  function formatMessagesEnhanced(messages, templateOrId, opts) {
    if (!Array.isArray(messages)) {
      return [];
    }
    
    opts = opts || {};
    var template = typeof templateOrId === 'string' 
      ? getTemplate(templateOrId) 
      : templateOrId;
    
    if (!template) {
      template = getTemplate('default');
    }
    
    var format = template.format || {};
    var separator = format.messageSeparator || '\n';
    var trimWhitespace = opts.trimWhitespace !== false;
    var maxLen = opts.maxMessageLength || 0;
    var continuationMarker = opts.continuationMarker || '...';
    
    var result = [];
    
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (!msg) continue;
      
      var formatted = formatMessage(msg, template, opts);
      
      if (trimWhitespace && formatted.content) {
        formatted.content = formatted.content.trim();
      }
      
      if (maxLen > 0 && formatted.content && formatted.content.length > maxLen) {
        formatted.content = formatted.content.substring(0, maxLen - continuationMarker.length) + continuationMarker;
        formatted._truncated = true;
      }
      
      result.push(formatted);
    }
    
    if (opts.returnMode === 'string') {
      var contents = [];
      for (var j = 0; j < result.length; j++) {
        contents.push(result[j].content);
      }
      return contents.join(separator);
    }
    
    return result;
  }

  var ErrorHandler = {
    ERROR_TYPES: {
      PARSE_ERROR: 'PARSE_ERROR',
      VARIABLE_MISSING: 'VARIABLE_MISSING',
      FORMAT_ERROR: 'FORMAT_ERROR',
      INHERITANCE_LOOP: 'INHERITANCE_LOOP'
    },
    
    handle: function(error, context) {
      var errorInfo = {
        type: error.type || 'UNKNOWN',
        message: error.message || String(error),
        timestamp: Date.now(),
        context: context
      };
      
      console.error('[ContextTemplates] Error:', errorInfo);
      
      if (window.ErrorLogService && typeof window.ErrorLogService.log === 'function') {
        window.ErrorLogService.log(errorInfo);
      }
      
      return this.fallback(error);
    },
    
    fallback: function(error) {
      var defaultTemplate = null;
      try {
        defaultTemplate = getTemplate('default');
      } catch (e) {
        defaultTemplate = {
          id: 'default',
          name: 'Default',
          format: { useRoleField: true, messageSeparator: '\n' }
        };
      }
      
      return {
        valid: false,
        error: error.message || 'Unknown error',
        fallbackTemplate: defaultTemplate
      };
    }
  };

  var ContextTemplates = {
    get: getTemplate,
    getPreset: getPresetTemplate,
    getAllPresets: getAllPresets,
    list: getTemplateList,
    register: registerTemplate,
    unregister: unregisterTemplate,
    validate: validateTemplate,
    formatMessage: formatMessage,
    formatMessages: formatMessages,
    formatMessagesEnhanced: formatMessagesEnhanced,
    TemplateParser: TemplateParser,
    VariableEngine: VariableEngine,
    ErrorHandler: ErrorHandler
  };

  if (typeof window !== 'undefined') {
    window.Core = window.Core || {};
    window.Core.ContextTemplates = ContextTemplates;
  }

})();
