/**
 * PromptManager模块构建器
 * 每个构建器是一个函数，接收context对象，返回Promise<string>
 */
(function() {
  'use strict';

  var MAX_HISTORY_MESSAGES = 100;

  var REPLACEMENT_REGEX = {
    char: /\{\{char\}\}/g,
    user: /\{\{user\}\}/g,
    charSimple: /\{char\}/g,
    userSimple: /\{user\}/g
  };

  function applyCommonReplacements(text, charName, userName) {
    if (!text) return '';
    return text
      .replace(REPLACEMENT_REGEX.char, charName || '')
      .replace(REPLACEMENT_REGEX.user, userName || '')
      .replace(REPLACEMENT_REGEX.charSimple, charName || '')
      .replace(REPLACEMENT_REGEX.userSimple, userName || '');
  }

  function debugLog(moduleName, message) {
    if (window.DEBUG_MODE) {
      console.warn('[PromptManagerBuilders] ' + moduleName + ': ' + message);
    }
  }

  var PromptManagerBuilders = {
    buildSystemModule: function(context) {
      var subTemplates = context.subTemplates || {};
      var sysVal = context.sysVal || '';
      var timeContext = context.timeContext || '';
      var formatConstraint = context.formatConstraint || '';
      var charName = context.charName || 'Assistant';
      var userName = context.userName || 'User';

      var finalSysVal = (subTemplates.system || '{{system_prompt}}')
        .replace(/\{\{system_prompt\}\}/g, sysVal);

      if (timeContext) {
        finalSysVal += '\n\n[时间]\n' + timeContext;
      }
      finalSysVal += formatConstraint;

      return Promise.resolve(applyCommonReplacements(finalSysVal, charName, userName));
    },

    buildWorldLoreModule: function(context) {
      return new Promise(function(resolve) {
        var subTemplates = context.subTemplates || {};
        var worldBookVal = context.worldBookVal || '';
        var recentMessages = context.recentMessages || [];
        var contactId = context.contactId;

        function buildResult(worldContent) {
          return (subTemplates.world_lore || '{{world_lore_content}}')
            .replace(/\{\{world_lore_content\}\}/g, worldContent);
        }

        if (window.LorebookIntegration && typeof window.LorebookIntegration.scanAndInject === 'function') {
          var userMessage = recentMessages.length > 0 ? 
            recentMessages[recentMessages.length - 1].content : '';
          
          var result = window.LorebookIntegration.scanAndInject(userMessage, recentMessages, contactId);
          var lorePromise = (result && typeof result.then === 'function') ? result : Promise.resolve(result || '');
          
          lorePromise.then(function(dynamicLore) {
            if (dynamicLore && typeof dynamicLore === 'string') {
              worldBookVal = worldBookVal ? (worldBookVal + '\n\n' + dynamicLore) : dynamicLore;
            }
            resolve(buildResult(worldBookVal));
          }).catch(function(err) {
            debugLog('buildWorldLoreModule', err);
            resolve(buildResult(worldBookVal));
          });
        } else {
          resolve(buildResult(worldBookVal));
        }
      });
    },

    buildSummaryModule: function(context) {
      var contactId = context.contactId;
      var summaryText = '';
      
      if (window.chat20 && typeof window.chat20.getSummaryText === 'function') {
        try {
          summaryText = window.chat20.getSummaryText(contactId) || '';
        } catch (e) {
          debugLog('buildSummaryModule', e);
        }
      }
      
      return Promise.resolve(summaryText);
    },

    buildMilestonesModule: function(context) {
      var contactId = context.contactId;
      var milestoneText = '';
      
      if (window.MilestoneManager && typeof window.MilestoneManager.getBlock === 'function') {
        try {
          milestoneText = window.MilestoneManager.getBlock(contactId) || '';
        } catch (e) {
          debugLog('buildMilestonesModule', e);
        }
      }
      
      return Promise.resolve(milestoneText);
    },

    buildCharSettingsModule: function(context) {
      var subTemplates = context.subTemplates || {};
      var charName = context.charName || 'Assistant';
      var charDesc = context.charDesc || '';
      var userName = context.userName || 'User';

      var finalCharVal = (subTemplates.char_settings || '{{char_desc}}')
        .replace(/\{\{char_name\}\}/g, charName)
        .replace(/\{\{char_desc\}\}/g, charDesc);

      return Promise.resolve(applyCommonReplacements(finalCharVal, charName, userName));
    },

    buildUserPersonaModule: function(context) {
      return new Promise(function(resolve) {
        var contactId = context.contactId;
        var userName = context.userName || 'User';

        if (typeof window.getUserPersonaName === 'function' && typeof window.buildUserPersonaText === 'function') {
          window.getUserPersonaName(contactId).then(function(userVal) {
            if (userVal == null) {
              return userName;
            }
            return window.buildUserPersonaText(contactId, userVal);
          }).then(function(userPersonaText) {
            resolve(userPersonaText || userName);
          }).catch(function(err) {
            debugLog('buildUserPersonaModule', err);
            resolve(userName);
          });
        } else {
          resolve(userName);
        }
      });
    },

    buildExamplesModule: function(context) {
      var subTemplates = context.subTemplates || {};
      var examplesVal = context.examplesVal || '';
      var charName = context.charName || 'Assistant';
      var userName = context.userName || 'User';

      var finalExamplesVal = (subTemplates.examples || '{{examples_content}}')
        .replace(/\{\{examples_content\}\}/g, examplesVal);

      return Promise.resolve(applyCommonReplacements(finalExamplesVal, charName, userName));
    },

    buildHistoryModule: function(context) {
      return new Promise(function(resolve) {
        var subTemplates = context.subTemplates || {};
        var recentMessages = context.recentMessages || [];
        var historyTimeEnabled = context.historyTimeEnabled || false;
        var scheduleContext = context.scheduleContext || '';
        var charName = context.charName || 'Assistant';
        var userName = context.userName || 'User';

        var messages = recentMessages.slice(-MAX_HISTORY_MESSAGES);

        var historyVal = '';
        var lastHistoryDateLabel = '';

        if (messages.length > 0) {
          historyVal = '### 对话历史 (每条消息前的 [#ID] 是其唯一标识...)\n';
        }

        messages.forEach(function(m, index) {
          if (!m) return;
          
          var tempId = index + 1;
          var content = '';
          if (m.content != null) {
            content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          }
          var isSystem = m.role === 'system';
          var roleName = isSystem ? '系统' : (m.role === 'user' ? userName : charName);
          
          var dateLabel = '';
          var timeLabel = '';
          
          if (historyTimeEnabled && m.time) {
            var dt = new Date(m.time);
            if (!isNaN(dt.getTime())) {
              dateLabel = dt.getFullYear() + '年' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
              var hours = dt.getHours();
              var minutes = dt.getMinutes();
              timeLabel = (hours < 10 ? '0' + hours : hours) + ':' + (minutes < 10 ? '0' + minutes : minutes);
            }
          }

          var line = (subTemplates.history_line || '[#{{id}}] {{role}}: {{content}}')
            .replace(/\{\{id\}\}/g, tempId)
            .replace(/\{\{role\}\}/g, roleName)
            .replace(/\{\{content\}\}/g, content);

          if (historyTimeEnabled) {
            if (dateLabel && dateLabel !== lastHistoryDateLabel) {
              if (historyVal && !historyVal.endsWith('\n')) historyVal += '\n';
              historyVal += dateLabel + '\n';
              lastHistoryDateLabel = dateLabel;
            }
            if (timeLabel) {
              historyVal += '- ' + timeLabel + ' ' + line + '\n';
            } else {
              historyVal += line + '\n';
            }
          } else {
            historyVal += line + '\n';
          }
        });

        if (scheduleContext) {
          if (!historyVal) {
            historyVal = '### 对话历史\n';
          }
          historyVal += '\n### 日程\n' + scheduleContext + '\n';
        }

        resolve(historyVal);
      });
    },

    buildCardListModule: function(context) {
      var isCardMode = context.isCardMode || false;
      var contactId = context.contactId;
      var cardListVal = '';

      if (!isCardMode) {
        return Promise.resolve('');
      }

      if (contactId == null) {
        return Promise.resolve('');
      }

      var allCards = [];
      
      if (window.chat20 && window.chat20.state) {
        var customReplies = window.chat20.state.customReplies || {};
        if (customReplies[contactId] && Array.isArray(customReplies[contactId])) {
          customReplies[contactId].forEach(function(card) {
            allCards.push(card);
          });
        }
        
        var presetFolders = window.chat20.state.presetFolders || {};
        var folderEnabled = window.chat20.state.folderEnabled || {};
        var folderEnabledMap = folderEnabled[contactId] || {};
        
        Object.keys(presetFolders).forEach(function(folderName) {
          if (folderEnabledMap[folderName] !== false && Array.isArray(presetFolders[folderName])) {
            presetFolders[folderName].forEach(function(card) {
              allCards.push(card);
            });
          }
        });
      }

      if (allCards.length === 0) {
        return Promise.resolve('');
      }

      var maxReplies = 1;
      if (window.chat20 && window.chat20.state) {
        var friendRandomReplies = window.chat20.state.friendRandomMultipleRepliesEnabled || {};
        var randomMultipleEnabled = friendRandomReplies[contactId] || false;
        var maxRepliesMap = window.chat20.state.friendMaxRandomReplies || {};
        maxReplies = randomMultipleEnabled ? (maxRepliesMap[contactId] || 3) : 1;
      }

      cardListVal = '\n[可用字卡列表]\n(请分析对话历史，从下方列表选出 1 到 ' + maxReplies + ' 个最恰当的回复ID)\n';
      allCards.forEach(function(card, idx) {
        cardListVal += '#' + (idx + 1) + ': ' + card + '\n';
      });

      return Promise.resolve(cardListVal);
    }
  };

  if (typeof window !== 'undefined') {
    window.Core = window.Core || {};
    window.Core.PromptManagerBuilders = PromptManagerBuilders;
  }

})();
