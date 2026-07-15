/**
 * 视觉异常检测模块
 * 检测闪屏、黑屏等视觉异常现象
 */
(function(window) {
    'use strict';

    class FlickerDetector {
        constructor() {
            this.visibilityChangeCount = 0;
            this.styleChangeCount = 0;
            this.classChangeCount = 0;
            this.keyboardRelatedChanges = 0; // 键盘相关的类变化计数
            this.lastCheckTime = Date.now();
            this.checkWindow = 2000; // 2秒窗口
            this.flickerThreshold = 15; // 2秒内15次变化视为闪屏（降低阈值以捕获键盘闪黑屏）
            this.flickerHistory = [];
            this.maxHistory = 50;
            this.patrolLogger = null;
            this.mutationObserver = null;
            
            // 新增：跟踪元素变化频率，识别真正的闪屏
            this.elementChangeMap = new Map(); // element -> {count, lastChangeTime, changes, isKeyboardRelated, classNameChanges, styleChanges}
            this.elementChangeWindow = 500; // 500ms窗口
            this.suspiciousElementThreshold = 3; // 同一元素500ms内3次变化视为可疑
            
            // 记录详细的变化信息（用于诊断）
            this.changeDetails = []; // 记录最近的变化详情
            this.maxChangeDetails = 100; // 最多记录100条详情
            
            // 键盘相关的类名（这些变化需要特别关注）
            this.keyboardClassNames = new Set([
                'keyboard-open', 'keyboard-close', 'is-typing'
            ]);
            
            // 常见UI操作类名白名单（这些类变化不应视为闪屏，但不包括键盘相关）
            this.ignoredClassNames = new Set([
                'active', 'show', 'hide', 'open', 'close', 'expanded', 'collapsed',
                'selected', 'disabled', 'loading', 'empty', 'has-custom',
                'is-open', 'flip-active', 'shake', 'selected', 'danger',
                // mini 播放器相关的常见状态类，属于预期内 UI 状态切换
                'minimized', 'playing'
            ]);
            
            // 防抖：合并短时间内的多次变化
            this.debounceTimer = null;
            this.debounceDelay = 50; // 50ms防抖（缩短以更快响应键盘变化）
            this.pendingMutations = [];
            
            // 性能监控：结合帧率下降判断
            this.lastFpsCheck = Date.now();
            this.fpsDropDetected = false;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        start() {
            // 监听可见性变化
            document.addEventListener('visibilitychange', () => {
                this.visibilityChangeCount++;
                this.checkFlicker();
            });

            // 监听样式和类变化
            this.mutationObserver = new MutationObserver((mutations) => {
                // 使用防抖合并短时间内的变化
                this.pendingMutations.push(...mutations);
                
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                
                this.debounceTimer = setTimeout(() => {
                    this.processMutations(this.pendingMutations);
                    this.pendingMutations = [];
                }, this.debounceDelay);
            });

            this.mutationObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['style', 'class'],
                subtree: true
            });

            console.log('[FlickerDetector] 闪屏检测已启动（优化版）');
        }

        processMutations(mutations) {
            const now = Date.now();
            let hasSuspiciousChange = false;
            let hasKeyboardChange = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    
                    if (mutation.attributeName === 'style') {
                        this.styleChangeCount++;
                        
                        // 记录样式变化的详细信息
                        const styleInfo = this.recordStyleChange(target, now);
                        if (styleInfo.isSuspicious) {
                            hasSuspiciousChange = true;
                        }
                        
                        // 检查样式变化是否影响可见性
                        if (this.isVisibilityStyleChange(target)) {
                            hasSuspiciousChange = true;
                        }
                    } else if (mutation.attributeName === 'class') {
                        // 检查是否是键盘相关的类变化
                        const isKeyboardRelated = this.isKeyboardRelatedChange(target);
                        
                        // 记录类变化的详细信息
                        const classInfo = this.recordClassChange(target, now, isKeyboardRelated);
                        
                        if (isKeyboardRelated) {
                            hasKeyboardChange = true;
                            this.keyboardRelatedChanges++;
                            this.classChangeCount++;
                            
                            // 键盘相关的变化总是可疑的
                            hasSuspiciousChange = true;
                            
                            // 跟踪键盘相关元素的变化
                            const elementId = this.getElementId(target);
                            this.trackElementChange(elementId, now, true, classInfo.changedClasses);
                        } else if (!this.shouldIgnoreClassChange(target)) {
                            this.classChangeCount++;
                            
                            // 跟踪元素变化频率
                            const elementId = this.getElementId(target);
                            this.trackElementChange(elementId, now, false, classInfo.changedClasses);
                            
                            // 检查是否有可疑的重复变化
                            if (this.isSuspiciousElementChange(elementId)) {
                                hasSuspiciousChange = true;
                            }
                        }
                    }
                }
            }
            
            // 清理过期的元素变化记录
            this.cleanupElementChanges(now);
            
            // 键盘相关变化或可疑变化立即检查
            if (hasKeyboardChange || hasSuspiciousChange) {
                this.checkFlicker();
            } else {
                // 延迟检查，避免正常UI操作触发误报
                setTimeout(() => this.checkFlicker(), 300);
            }
        }
        
        recordStyleChange(element, timestamp) {
            const elementInfo = this.getElementInfo(element);
            const oldValue = element.getAttribute('style') || '';
            const newValue = element.style.cssText || '';
            
            // 提取变化的样式属性
            const changedProperties = this.extractChangedStyleProperties(oldValue, newValue);
            
            const changeDetail = {
                type: 'style',
                timestamp: timestamp,
                element: elementInfo,
                changedProperties: changedProperties,
                isSuspicious: changedProperties.some(prop => 
                    ['display', 'visibility', 'opacity', 'transform', 'height', 'width'].includes(prop)
                )
            };
            
            this.addChangeDetail(changeDetail);
            return changeDetail;
        }
        
        recordClassChange(element, timestamp, isKeyboardRelated) {
            const elementInfo = this.getElementInfo(element);
            const oldValue = element.getAttribute('class') || '';
            const newValue = element.className || '';
            
            // 提取变化的类名
            const oldClasses = new Set(oldValue.split(' ').filter(c => c));
            const newClasses = new Set(newValue.split(' ').filter(c => c));
            const addedClasses = [...newClasses].filter(c => !oldClasses.has(c));
            const removedClasses = [...oldClasses].filter(c => !newClasses.has(c));
            
            const changeDetail = {
                type: 'class',
                timestamp: timestamp,
                element: elementInfo,
                addedClasses: addedClasses,
                removedClasses: removedClasses,
                changedClasses: [...addedClasses, ...removedClasses],
                isKeyboardRelated: isKeyboardRelated,
                isSuspicious: isKeyboardRelated || addedClasses.length + removedClasses.length > 3
            };
            
            this.addChangeDetail(changeDetail);
            return changeDetail;
        }
        
        getElementInfo(element) {
            return {
                tagName: element.tagName,
                id: element.id || null,
                className: element.className || '',
                selector: this.getElementSelector(element)
            };
        }
        
        getElementSelector(element) {
            if (element.id) return `#${element.id}`;
            const classes = element.className ? element.className.split(' ').filter(c => c).slice(0, 2) : [];
            if (classes.length > 0) {
                return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
            }
            return element.tagName.toLowerCase();
        }
        
        extractChangedStyleProperties(oldStyle, newStyle) {
            // 简单提取：找出新增或修改的属性
            const oldProps = new Set();
            const newProps = new Set();
            
            oldStyle.split(';').forEach(rule => {
                const match = rule.match(/^\s*([^:]+):/);
                if (match) oldProps.add(match[1].trim());
            });
            
            newStyle.split(';').forEach(rule => {
                const match = rule.match(/^\s*([^:]+):/);
                if (match) newProps.add(match[1].trim());
            });
            
            // 返回新增或修改的属性
            return [...new Set([...newProps].filter(p => !oldProps.has(p) || oldStyle !== newStyle))];
        }
        
        addChangeDetail(detail) {
            this.changeDetails.push(detail);
            if (this.changeDetails.length > this.maxChangeDetails) {
                this.changeDetails.shift();
            }
        }
        
        isKeyboardRelatedChange(element) {
            // 检查类变化是否与键盘相关
            const classList = element.classList;
            if (!classList) return false;
            
            for (const className of this.keyboardClassNames) {
                if (classList.contains(className)) {
                    return true;
                }
            }
            
            // 检查元素是否在键盘相关的容器中
            const keyboardContainer = element.closest('.keyboard-open, .keyboard-spacer, [data-kbd="1"]');
            return !!keyboardContainer;
        }

        getElementId(element) {
            // 生成元素的唯一标识
            if (element.id) return `#${element.id}`;
            if (element.className) {
                const classes = element.className.split(' ').filter(c => c && !this.ignoredClassNames.has(c));
                if (classes.length > 0) return `.${classes[0]}`;
            }
            return element.tagName || 'unknown';
        }

        shouldIgnoreClassChange(element) {
            // 检查类变化是否应该被忽略
            const classList = element.classList;
            if (!classList) return false;
            
            // 如果变化只涉及白名单类名，忽略
            for (const className of this.ignoredClassNames) {
                if (classList.contains(className)) {
                    // 检查是否是常见的UI状态切换
                    const commonPatterns = ['active', 'show', 'hide', 'open', 'close'];
                    if (commonPatterns.some(pattern => className.includes(pattern))) {
                        return true;
                    }
                }
            }
            
            return false;
        }

        isVisibilityStyleChange(element) {
            // 检查样式变化是否影响可见性
            const style = window.getComputedStyle(element);
            const display = style.display;
            const visibility = style.visibility;
            const opacity = parseFloat(style.opacity);
            
            // 如果元素变为不可见或透明度变化，可能是闪屏
            return display === 'none' || visibility === 'hidden' || opacity < 0.1;
        }

        trackElementChange(elementId, timestamp, isKeyboardRelated = false, changedClasses = []) {
            if (!this.elementChangeMap.has(elementId)) {
                this.elementChangeMap.set(elementId, {
                    count: 0,
                    lastChangeTime: timestamp,
                    changes: [],
                    isKeyboardRelated: isKeyboardRelated,
                    classNameChanges: new Map(), // 类名 -> 变化次数
                    styleChanges: []
                });
            }
            
            const record = this.elementChangeMap.get(elementId);
            record.count++;
            record.lastChangeTime = timestamp;
            record.changes.push(timestamp);
            record.isKeyboardRelated = record.isKeyboardRelated || isKeyboardRelated;
            
            // 记录类名变化
            changedClasses.forEach(className => {
                if (!record.classNameChanges.has(className)) {
                    record.classNameChanges.set(className, 0);
                }
                record.classNameChanges.set(className, record.classNameChanges.get(className) + 1);
            });
            
            // 只保留最近的变化记录
            const cutoff = timestamp - this.elementChangeWindow;
            record.changes = record.changes.filter(t => t > cutoff);
        }

        isSuspiciousElementChange(elementId) {
            const record = this.elementChangeMap.get(elementId);
            if (!record) return false;
            
            // 如果同一元素在短时间内多次变化，可能是闪屏
            const recentChanges = record.changes.length;
            return recentChanges >= this.suspiciousElementThreshold;
        }

        cleanupElementChanges(now) {
            const cutoff = now - this.elementChangeWindow * 2;
            for (const [elementId, record] of this.elementChangeMap.entries()) {
                if (record.lastChangeTime < cutoff) {
                    this.elementChangeMap.delete(elementId);
                }
            }
        }

        checkFlicker() {
            const now = Date.now();
            const elapsed = now - this.lastCheckTime;

            if (elapsed >= this.checkWindow) {
                const totalChanges = this.visibilityChangeCount + 
                                   this.styleChangeCount + 
                                   this.classChangeCount;

                // 键盘期（data-kbd="1"）或导航忙碌期（data-nav="1"）适当提高上报阈值，减少对预期内降级/节流阶段的误报
                const docEl = typeof document !== 'undefined' && document.documentElement;
                const isKeyboardPeriod = docEl && docEl.getAttribute('data-kbd') === '1';
                const isNavPeriod = docEl && docEl.getAttribute('data-nav') === '1';
                let effectiveThreshold = this.flickerThreshold;
                if (isKeyboardPeriod) {
                    effectiveThreshold = 50;
                } else if (isNavPeriod) {
                    // 导航忙碌期：应用打开/关闭时 UI 集中变化，适当提高阈值以避免误报
                    effectiveThreshold = 80;
                }

                // 检查是否有键盘相关的频繁变化
                const hasKeyboardFlicker = this.keyboardRelatedChanges > 5; // 键盘相关变化超过5次
                const hasHighChangeRate = totalChanges > effectiveThreshold;
                const hasVisibilityIssue = this.visibilityChangeCount > 0;
                
                // 检查是否有可疑的重复变化（特别是键盘相关的）
                const suspiciousRecords = Array.from(this.elementChangeMap.values())
                    .filter(record => record.changes.length >= this.suspiciousElementThreshold);
                const hasSuspiciousElements = suspiciousRecords.length > 0;
                const hasKeyboardSuspiciousElements = suspiciousRecords.some(r => r.isKeyboardRelated);

                // 判断条件：
                // 1. 高变化率 + (可见性问题 或 可疑元素 或 键盘相关变化)
                // 2. 键盘相关变化较多（即使总数不高，键盘相关变化多也说明有问题）；键盘期要求更高 totalChanges 再报
                const shouldReport = (hasHighChangeRate && (hasVisibilityIssue || hasSuspiciousElements || hasKeyboardFlicker)) ||
                                    (hasKeyboardFlicker && totalChanges > (isKeyboardPeriod ? 40 : 10)) ||
                                    (hasKeyboardSuspiciousElements && totalChanges > (isKeyboardPeriod ? 25 : 5));

                if (shouldReport) {
                    this.recordFlicker(totalChanges, elapsed);
                }

                this.reset();
                this.lastCheckTime = now;
            }
        }

        recordFlicker(totalChanges, windowMs) {
            // 分析最近的变化详情，找出主要问题
            const recentChanges = this.changeDetails.filter(c => 
                c.timestamp >= Date.now() - windowMs
            );
            
            // 统计最频繁变化的元素和类名
            const elementFrequency = new Map();
            const classNameFrequency = new Map();
            const stylePropertyFrequency = new Map();
            
            recentChanges.forEach(change => {
                // 统计元素频率
                const elementKey = change.element.selector;
                elementFrequency.set(elementKey, (elementFrequency.get(elementKey) || 0) + 1);
                
                // 统计类名频率
                if (change.type === 'class') {
                    change.changedClasses.forEach(className => {
                        classNameFrequency.set(className, (classNameFrequency.get(className) || 0) + 1);
                    });
                }
                
                // 统计样式属性频率
                if (change.type === 'style' && change.changedProperties) {
                    change.changedProperties.forEach(prop => {
                        stylePropertyFrequency.set(prop, (stylePropertyFrequency.get(prop) || 0) + 1);
                    });
                }
            });
            
            // 找出最频繁变化的元素（前5个）
            const topElements = Array.from(elementFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([element, count]) => ({ element, count }));
            
            // 找出最频繁变化的类名（前10个）
            const topClassNames = Array.from(classNameFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([className, count]) => ({ className, count }));
            
            // 找出最频繁变化的样式属性（前10个）
            const topStyleProperties = Array.from(stylePropertyFrequency.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([property, count]) => ({ property, count }));
            
            // 找出可疑元素（频繁变化的元素）
            const suspiciousElements = Array.from(this.elementChangeMap.entries())
                .filter(([elementId, record]) => record.changes.length >= this.suspiciousElementThreshold)
                .map(([elementId, record]) => {
                    const topClasses = Array.from(record.classNameChanges.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([className, count]) => ({ className, count }));
                    
                    return {
                        element: elementId,
                        changeCount: record.changes.length,
                        isKeyboardRelated: record.isKeyboardRelated,
                        topClasses: topClasses
                    };
                });
            
            const flickerInfo = {
                totalChanges: totalChanges,
                visibilityChanges: this.visibilityChangeCount,
                styleChanges: this.styleChangeCount,
                classChanges: this.classChangeCount,
                keyboardRelatedChanges: this.keyboardRelatedChanges,
                windowMs: windowMs,
                timestamp: Date.now(),
                isKeyboardRelated: this.keyboardRelatedChanges > 0,
                // 诊断信息
                topElements: topElements,
                topClassNames: topClassNames,
                topStyleProperties: topStyleProperties,
                suspiciousElements: suspiciousElements,
                changeDetailsCount: recentChanges.length
            };

            this.flickerHistory.push(flickerInfo);
            if (this.flickerHistory.length > this.maxHistory) {
                this.flickerHistory.shift();
            }

            if (this.patrolLogger) {
                const keyboardHint = this.keyboardRelatedChanges > 0 ? ` [键盘相关:${this.keyboardRelatedChanges}]` : '';
                
                // 构建详细消息
                let detailMessage = '';
                if (topElements.length > 0) {
                    detailMessage += `\n  主要变化元素: ${topElements.map(e => `${e.element}(${e.count}次)`).join(', ')}`;
                }
                if (topClassNames.length > 0) {
                    detailMessage += `\n  主要变化类名: ${topClassNames.map(c => `${c.className}(${c.count}次)`).join(', ')}`;
                }
                if (topStyleProperties.length > 0) {
                    detailMessage += `\n  主要样式变化: ${topStyleProperties.map(s => `${s.property}(${s.count}次)`).join(', ')}`;
                }
                if (suspiciousElements.length > 0) {
                    detailMessage += `\n  可疑元素: ${suspiciousElements.map(e => `${e.element}(${e.changeCount}次变化${e.isKeyboardRelated ? ',键盘相关' : ''})`).join(', ')}`;
                }
                
                this.patrolLogger.log({
                    type: 'visual_flicker_detected',
                    level: 'warning',
                    action: 'detect_flicker',
                    details: flickerInfo,
                    message: `检测到闪屏现象：${totalChanges}次变化/${(windowMs/1000).toFixed(1)}秒 (可见性:${this.visibilityChangeCount}, 样式:${this.styleChangeCount}, 类:${this.classChangeCount})${keyboardHint}${detailMessage}`
                });
            }
        }

        reset() {
            this.visibilityChangeCount = 0;
            this.styleChangeCount = 0;
            this.classChangeCount = 0;
            this.keyboardRelatedChanges = 0;
        }

        getStats() {
            return {
                flickerDetected: this.flickerHistory.length > 0,
                flickerCount: this.flickerHistory.length,
                recentFlickers: this.flickerHistory.slice(-10)
            };
        }

        stop() {
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
                this.mutationObserver = null;
            }
        }
    }

    class BlackScreenDetector {
        constructor() {
            this.lastActivityTime = Date.now();
            this.lastDomChangeTime = Date.now();
            this.lastUserInteractionTime = Date.now();
            this.blackScreenThreshold = 5000; // 5秒无活动视为黑屏
            this.briefBlackScreenThreshold = 200; // 200ms短暂黑屏（用于检测键盘起落时的闪黑）
            this.checkInterval = 100; // 100ms检查一次（更频繁以捕获短暂黑屏）
            this.checkTimer = null;
            this.blackScreenHistory = [];
            this.briefBlackScreenHistory = []; // 短暂黑屏历史
            this.maxHistory = 50;
            this.patrolLogger = null;
            this.mutationObserver = null;
            this.isRunning = false;
            
            // 跟踪键盘状态
            this.isKeyboardOpen = false;
            this.lastKeyboardChangeTime = 0;
            this.keyboardChangeWindow = 1000; // 键盘变化后1秒内检测短暂黑屏
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        start() {
            if (this.isRunning) return;
            this.isRunning = true;

            // 监听用户交互
            const userEvents = ['click', 'touchstart', 'keydown', 'scroll', 'mousemove'];
            userEvents.forEach(event => {
                document.addEventListener(event, () => {
                    this.lastActivityTime = Date.now();
                    this.lastUserInteractionTime = Date.now();
                }, { passive: true });
            });

            // 监听键盘相关事件
            document.addEventListener('focusin', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    this.isKeyboardOpen = true;
                    this.lastKeyboardChangeTime = Date.now();
                }
            }, { passive: true });
            
            document.addEventListener('focusout', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    this.isKeyboardOpen = false;
                    this.lastKeyboardChangeTime = Date.now();
                }
            }, { passive: true });
            
            // 监听键盘相关类变化
            const keyboardObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList.contains('keyboard-open')) {
                            this.isKeyboardOpen = true;
                            this.lastKeyboardChangeTime = Date.now();
                        } else if (this.isKeyboardOpen && !target.classList.contains('keyboard-open')) {
                            // 检查是否所有相关元素都没有keyboard-open了
                            const hasKeyboardOpen = document.querySelector('.keyboard-open');
                            if (!hasKeyboardOpen) {
                                this.isKeyboardOpen = false;
                                this.lastKeyboardChangeTime = Date.now();
                            }
                        }
                    }
                }
            });
            
            keyboardObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class'],
                subtree: true
            });

            // 监听DOM变化
            this.mutationObserver = new MutationObserver(() => {
                this.lastDomChangeTime = Date.now();
                this.lastActivityTime = Date.now();
            });

            this.mutationObserver.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // 定期检查
            this.checkTimer = setInterval(() => {
                this.checkBlackScreen();
                this.checkBriefBlackScreen(); // 检查短暂黑屏
            }, this.checkInterval);

            console.log('[BlackScreenDetector] 黑屏检测已启动（包含短暂黑屏检测）');
        }
        
        checkBriefBlackScreen() {
            // 只在键盘变化后的一段时间内检查短暂黑屏
            const now = Date.now();
            const timeSinceKeyboardChange = now - this.lastKeyboardChangeTime;
            
            if (timeSinceKeyboardChange > this.keyboardChangeWindow) {
                return; // 不在键盘变化窗口内，跳过
            }
            
            // 检查页面是否短暂变黑
            const hasContent = this._checkPageContent();
            const isVisible = document.visibilityState === 'visible';
            
            // 如果页面可见但没有内容，可能是短暂黑屏
            if (isVisible && !hasContent) {
                // 检查是否是真正的黑屏（而不是正常的空状态）
                const body = document.body;
                if (body && body.style.backgroundColor === 'transparent' || 
                    window.getComputedStyle(body).backgroundColor === 'rgba(0, 0, 0, 0)') {
                    // 可能是背景透明导致的，检查是否有其他可见元素
                    const visibleElements = body.querySelectorAll('*');
                    let hasVisibleElement = false;
                    for (const el of visibleElements) {
                        const style = window.getComputedStyle(el);
                        if (style.display !== 'none' && 
                            style.visibility !== 'hidden' && 
                            parseFloat(style.opacity) > 0.1 &&
                            (el.offsetWidth > 0 || el.offsetHeight > 0)) {
                            hasVisibleElement = true;
                            break;
                        }
                    }
                    
                    if (!hasVisibleElement) {
                        this.recordBriefBlackScreen(timeSinceKeyboardChange);
                    }
                }
            }
        }
        
        recordBriefBlackScreen(duration) {
            const briefBlackScreenInfo = {
                duration: duration,
                timeSinceKeyboardChange: duration,
                isKeyboardRelated: true,
                timestamp: Date.now()
            };

            this.briefBlackScreenHistory.push(briefBlackScreenInfo);
            if (this.briefBlackScreenHistory.length > this.maxHistory) {
                this.briefBlackScreenHistory.shift();
            }

            if (this.patrolLogger) {
                this.patrolLogger.log({
                    type: 'visual_brief_black_screen_detected',
                    level: 'warning',
                    action: 'detect_brief_black_screen',
                    details: briefBlackScreenInfo,
                    message: `检测到短暂黑屏现象：键盘变化后${(duration/1000).toFixed(2)}秒出现黑屏（可能是键盘起落导致的闪黑）`
                });
            }
        }

        checkBlackScreen() {
            if (!this.isRunning) return;

            const now = Date.now();
            const timeSinceActivity = now - Math.max(
                this.lastActivityTime,
                this.lastDomChangeTime,
                this.lastUserInteractionTime
            );

            // 只在页面可见时检查
            if (timeSinceActivity > this.blackScreenThreshold && 
                document.visibilityState === 'visible') {
                
                // 检查页面内容是否为空
                const hasContent = this._checkPageContent();

                if (!hasContent) {
                    this.recordBlackScreen(timeSinceActivity);
                }
            }
        }

        _checkPageContent() {
            try {
                // 检查body是否存在且有内容
                if (!document.body) {
                    return false;
                }

                // 检查是否有子元素
                if (document.body.children.length > 0) {
                    return true;
                }

                // 检查是否有文本内容
                const textContent = document.body.textContent || '';
                if (textContent.trim().length > 0) {
                    return true;
                }

                // 检查是否有可见的图片
                const images = document.body.querySelectorAll('img');
                for (const img of images) {
                    if (img.offsetWidth > 0 && img.offsetHeight > 0) {
                        return true;
                    }
                }

                // 检查是否有可见的canvas
                const canvases = document.body.querySelectorAll('canvas');
                for (const canvas of canvases) {
                    if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
                        return true;
                    }
                }

                return false;
            } catch (e) {
                // 检查失败，假设有内容（避免误报）
                return true;
            }
        }

        recordBlackScreen(duration) {
            const blackScreenInfo = {
                duration: duration,
                timeSinceActivity: duration,
                timeSinceDomChange: Date.now() - this.lastDomChangeTime,
                timeSinceUserInteraction: Date.now() - this.lastUserInteractionTime,
                visibilityState: document.visibilityState,
                timestamp: Date.now()
            };

            this.blackScreenHistory.push(blackScreenInfo);
            if (this.blackScreenHistory.length > this.maxHistory) {
                this.blackScreenHistory.shift();
            }

            if (this.patrolLogger) {
                this.patrolLogger.log({
                    type: 'visual_black_screen_detected',
                    level: 'error',
                    action: 'detect_black_screen',
                    details: blackScreenInfo,
                    message: `检测到黑屏现象：${(duration/1000).toFixed(1)}秒无活动，页面可见但内容为空`
                });
            }
        }

        getStats() {
            return {
                blackScreenDetected: this.blackScreenHistory.length > 0,
                blackScreenCount: this.blackScreenHistory.length,
                recentBlackScreens: this.blackScreenHistory.slice(-10),
                briefBlackScreenDetected: this.briefBlackScreenHistory.length > 0,
                briefBlackScreenCount: this.briefBlackScreenHistory.length,
                recentBriefBlackScreens: this.briefBlackScreenHistory.slice(-10),
                timeSinceLastActivity: Date.now() - this.lastActivityTime
            };
        }

        stop() {
            this.isRunning = false;
            if (this.checkTimer) {
                clearInterval(this.checkTimer);
                this.checkTimer = null;
            }
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
                this.mutationObserver = null;
            }
        }
    }

    class VisualAnomalyDetector {
        constructor() {
            this.flickerDetector = new FlickerDetector();
            this.blackScreenDetector = new BlackScreenDetector();
            this.patrolLogger = null;
            this.isRunning = false;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
            this.flickerDetector.setPatrolLogger(logger);
            this.blackScreenDetector.setPatrolLogger(logger);
        }

        start() {
            if (this.isRunning) return;
            
            this.flickerDetector.start();
            this.blackScreenDetector.start();
            
            this.isRunning = true;
            console.log('[VisualAnomalyDetector] 视觉异常检测已启动');
        }

        stop() {
            this.flickerDetector.stop();
            this.blackScreenDetector.stop();
            this.isRunning = false;
        }

        getStats() {
            return {
                flicker: this.flickerDetector.getStats(),
                blackScreen: this.blackScreenDetector.getStats()
            };
        }

        reset() {
            this.flickerDetector.reset();
            // BlackScreenDetector不需要reset
        }
    }

    const detector = new VisualAnomalyDetector();
    window.Core = window.Core || {};
    window.Core.VisualAnomalyDetector = detector;

    // 页面可见时自动启动
    if (document.visibilityState === 'visible') {
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => detector.start(), { timeout: 3000 });
        } else {
            setTimeout(() => detector.start(), 2000);
        }
    } else {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !detector.isRunning) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => detector.start(), { timeout: 3000 });
                } else {
                    setTimeout(() => detector.start(), 2000);
                }
            } else if (document.visibilityState === 'hidden' && detector.isRunning) {
                detector.stop();
            }
        });
    }
})(window);
