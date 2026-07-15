/**
 * 设备适配器（DeviceAdapter）
 * 检测设备类型和能力，提供适配策略
 */
(function(window) {
    'use strict';

    const DeviceType = {
        ANDROID: 'android',
        IOS: 'ios',
        UNKNOWN: 'unknown'
    };

    const DeviceStrategy = {
        storage: {
            [DeviceType.ANDROID]: 'indexeddb',
            [DeviceType.IOS]: 'indexeddb',
            fallback: 'localStorage'
        },
        rendering: {
            [DeviceType.ANDROID]: 'webgl',
            [DeviceType.IOS]: 'webgl',
            fallback: 'canvas'
        }
    };

    class DeviceAdapter {
        constructor() {
            this.deviceType = DeviceType.UNKNOWN;
            this.capabilities = new Map();
            this.patrolLogger = null;
            this.platformInfo = {
                os: null,
                osVersion: null,
                browser: null,
                browserVersion: null,
                isOpera: false,
                isChrome: false,
                isSafari: false,
                isStandalone: false
            };
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        async init() {
            this.deviceType = await this.detectDevice();
            await this.detectPlatformInfo();
            await this.detectCapabilities();
            this.applyPlatformClass();
        }

        async detectDevice() {
            try {
                const ua = navigator.userAgent || '';
                if (/Android/i.test(ua)) {
                    return DeviceType.ANDROID;
                }
                if (/iPhone|iPad|iPod/i.test(ua)) {
                    return DeviceType.IOS;
                }
            } catch (e) {
                console.warn('[DeviceAdapter] detectDevice error:', e);
            }
            return DeviceType.UNKNOWN;
        }

        async detectPlatformInfo() {
            try {
                const ua = navigator.userAgent || '';
                
                // iOS检测
                if (/iPhone|iPad|iPod/i.test(ua)) {
                    this.platformInfo.os = 'iOS';
                    const iosMatch = ua.match(/OS (\d+)[._](\d+)/);
                    if (iosMatch) {
                        this.platformInfo.osVersion = `${iosMatch[1]}.${iosMatch[2]}`;
                    }
                    
                    // Safari检测
                    if (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua)) {
                        this.platformInfo.browser = 'Safari';
                        const safariMatch = ua.match(/Version\/(\d+)[._](\d+)/);
                        if (safariMatch) {
                            this.platformInfo.browserVersion = `${safariMatch[1]}.${safariMatch[2]}`;
                        }
                        this.platformInfo.isSafari = true;
                    } else if (/CriOS/i.test(ua)) {
                        this.platformInfo.browser = 'Chrome';
                        this.platformInfo.isChrome = true;
                    }
                }
                
                // Android检测
                if (/Android/i.test(ua)) {
                    this.platformInfo.os = 'Android';
                    const androidMatch = ua.match(/Android (\d+)[._](\d+)/);
                    if (androidMatch) {
                        this.platformInfo.osVersion = `${androidMatch[1]}.${androidMatch[2]}`;
                    }
                    
                    // Opera检测
                    if (/OPR\/|OPX\/|OPT\/|Opera/i.test(ua)) {
                        this.platformInfo.browser = 'Opera';
                        this.platformInfo.isOpera = true;
                        const operaMatch = ua.match(/(?:OPR|OPX|OPT)\/(\d+)/);
                        if (operaMatch) {
                            this.platformInfo.browserVersion = operaMatch[1];
                        }
                    } else if (/Chrome/i.test(ua)) {
                        this.platformInfo.browser = 'Chrome';
                        this.platformInfo.isChrome = true;
                        const chromeMatch = ua.match(/Chrome\/(\d+)/);
                        if (chromeMatch) {
                            this.platformInfo.browserVersion = chromeMatch[1];
                        }
                    }
                }
                
                // PWA standalone检测
                this.platformInfo.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                    (window.navigator.standalone === true) ||
                    document.referrer.includes('android-app://');
                    
            } catch (e) {
                console.warn('[DeviceAdapter] detectPlatformInfo error:', e);
            }
        }

        applyPlatformClass() {
            const html = document.documentElement;
            const classesBefore = Array.from(html.classList).filter(cls => 
                cls.startsWith('platform-') || cls.startsWith('browser-') || cls === 'standalone-mode'
            );
            
            // 移除旧的类
            html.classList.remove('platform-ios', 'platform-android', 'platform-unknown');
            html.classList.remove('browser-opera', 'browser-chrome', 'browser-safari');
            html.classList.remove('standalone-mode');
            
            const classesToAdd = [];
            
            // 添加平台类
            if (this.deviceType === DeviceType.IOS) {
                html.classList.add('platform-ios');
                classesToAdd.push('platform-ios');
                if (this.platformInfo.isSafari) {
                    html.classList.add('browser-safari');
                    classesToAdd.push('browser-safari');
                } else if (this.platformInfo.isChrome) {
                    html.classList.add('browser-chrome');
                    classesToAdd.push('browser-chrome');
                }
            } else if (this.deviceType === DeviceType.ANDROID) {
                html.classList.add('platform-android');
                classesToAdd.push('platform-android');
                if (this.platformInfo.isOpera) {
                    html.classList.add('browser-opera');
                    classesToAdd.push('browser-opera');
                } else if (this.platformInfo.isChrome) {
                    html.classList.add('browser-chrome');
                    classesToAdd.push('browser-chrome');
                }
            } else {
                html.classList.add('platform-unknown');
                classesToAdd.push('platform-unknown');
            }
            
            // PWA standalone模式
            if (this.platformInfo.isStandalone) {
                html.classList.add('standalone-mode');
                classesToAdd.push('standalone-mode');
            }

            // 记录平台CSS类应用情况
            if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                const classesAfter = Array.from(html.classList).filter(cls => 
                    cls.startsWith('platform-') || cls.startsWith('browser-') || cls === 'standalone-mode'
                );
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'apply_platform_classes',
                    details: {
                        before: classesBefore,
                        after: classesAfter,
                        added: classesToAdd,
                        deviceType: this.deviceType,
                        browser: this.platformInfo.browser || 'unknown',
                        isStandalone: this.platformInfo.isStandalone
                    },
                    message: '应用平台CSS类：' + (classesToAdd.length > 0 ? classesToAdd.join(', ') : '无')
                });
            }
        }

        async detectCapabilities() {
            try {
                this.capabilities.set('indexeddb', !!window.indexedDB);
                this.capabilities.set('localStorage', typeof Storage !== 'undefined' && typeof localStorage !== 'undefined');
                this.capabilities.set('web_animations', typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function');
                this.capabilities.set('web_audio', typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined');
                this.capabilities.set('webgl', !!(document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl')));
                this.capabilities.set('service_worker', 'serviceWorker' in navigator);
                this.capabilities.set('background_fetch', 'BackgroundFetchManager' in window);
                this.capabilities.set('file_system_access', typeof showOpenFilePicker !== 'undefined');
            } catch (e) {
                console.warn('[DeviceAdapter] detectCapabilities error:', e);
            }
        }

        getStrategy(feature) {
            const strategy = DeviceStrategy[feature];
            if (!strategy) {
                return null;
            }

            const implementation = strategy[this.deviceType] || strategy.fallback;

            if (this.capabilities.get(implementation)) {
                return implementation;
            }

            if (strategy.fallback && this.capabilities.get(strategy.fallback)) {
                this.reportIncompatibility(feature, strategy[this.deviceType], strategy.fallback, 'warning');
                return strategy.fallback;
            }

            this.reportIncompatibility(feature, strategy[this.deviceType], null, 'error');
            return null;
        }

        reportIncompatibility(feature, expected, actual, level) {
            const message = actual
                ? '设备不支持' + feature + '的' + expected + '实现，已降级为' + actual
                : '设备不支持' + feature + '的' + expected + '实现，且无替换方案';

            if (level === 'error' && this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                this.patrolLogger.log({
                    type: 'device_incompatibility',
                    level: 'error',
                    action: 'check_device_compatibility',
                    details: {
                        deviceType: this.deviceType,
                        feature: feature,
                        expected: expected,
                        actual: actual
                    },
                    message: message
                });
            }

            if (level === 'error') {
                try {
                    const popup = window.Core && window.Core.Popup;
                    if (popup && typeof popup.showNotification === 'function') {
                        popup.showNotification({
                            title: '设备兼容性警告',
                            content: message,
                            type: 'error',
                            duration: 5000
                        });
                    }
                } catch (e) {}
            }

            console.warn('[DeviceAdapter]', message);
        }

        getDeviceInfo() {
            return {
                type: this.deviceType,
                platformInfo: { ...this.platformInfo },
                capabilities: Object.fromEntries(this.capabilities),
                userAgent: navigator.userAgent || '',
                platform: navigator.platform || ''
            };
        }

        isIOS() {
            return this.deviceType === DeviceType.IOS;
        }

        isAndroid() {
            return this.deviceType === DeviceType.ANDROID;
        }

        isOpera() {
            return this.platformInfo.isOpera;
        }

        isStandalone() {
            return this.platformInfo.isStandalone;
        }

        getPlatformAdapter() {
            if (this.deviceType === DeviceType.IOS) {
                return 'ios';
            } else if (this.deviceType === DeviceType.ANDROID) {
                return 'android';
            }
            return 'unknown';
        }

        async checkDevice() {
            // 记录设备识别结果
            const deviceInfo = this.getDeviceInfo();
            if (this.patrolLogger && typeof this.patrolLogger.log === 'function') {
                // 记录设备类型识别
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'detect_device_type',
                    details: { deviceType: this.deviceType },
                    message: '设备识别：' + this.deviceType
                });

                // 记录平台信息
                const platformInfoStr = this.platformInfo.os 
                    ? `${this.platformInfo.os} ${this.platformInfo.osVersion || ''}${this.platformInfo.browser ? ', ' + this.platformInfo.browser + (this.platformInfo.browserVersion ? ' ' + this.platformInfo.browserVersion : '') : ''}`.trim()
                    : '未知平台';
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'detect_platform_info',
                    details: { ...this.platformInfo },
                    message: '平台信息：' + platformInfoStr
                });

                // 记录能力检测结果
                const capabilitiesList = [];
                const capabilitiesDetails = {};
                this.capabilities.forEach((value, key) => {
                    capabilitiesDetails[key] = value;
                    if (value) {
                        capabilitiesList.push(key);
                    }
                });
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'detect_capabilities',
                    details: capabilitiesDetails,
                    message: '能力检测：' + (capabilitiesList.length > 0 ? capabilitiesList.join(', ') : '无') + ' (' + this.capabilities.size + '项检测)'
                });

                // 记录适配策略
                const storageStrategy = this.getStrategy('storage');
                const renderingStrategy = this.getStrategy('rendering');
                const strategies = {
                    storage: storageStrategy,
                    rendering: renderingStrategy
                };
                const strategyStr = [
                    storageStrategy ? '存储=' + storageStrategy : null,
                    renderingStrategy ? '渲染=' + renderingStrategy : null
                ].filter(Boolean).join(', ') || '无';
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'apply_strategy',
                    details: strategies,
                    message: '适配策略：' + (strategyStr || '未应用')
                });

                // 记录平台CSS类应用情况
                const html = document.documentElement;
                const appliedClasses = Array.from(html.classList).filter(cls => 
                    cls.startsWith('platform-') || cls.startsWith('browser-') || cls === 'standalone-mode'
                );
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'apply_platform_classes',
                    details: { classes: appliedClasses },
                    message: '平台CSS类：' + (appliedClasses.length > 0 ? appliedClasses.join(', ') : '无')
                });

                // 汇总日志
                this.patrolLogger.log({
                    type: 'device_check',
                    level: 'info',
                    action: 'check_device',
                    details: deviceInfo,
                    message: '设备检查完成：' + deviceInfo.type + '，已检测' + Object.keys(deviceInfo.capabilities).length + '项能力'
                });
            }
        }
    }

    window.Core = window.Core || {};
    window.Core.DeviceAdapter = DeviceAdapter;
    window.Core.DeviceType = DeviceType;
})(window);
