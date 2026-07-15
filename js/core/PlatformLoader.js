/**
 * 平台加载器
 * 在页面加载时检测平台并自动加载对应的资源
 */
(function(window) {
    'use strict';

    class PlatformLoader {
        constructor() {
            this.platform = null;
            this.loaded = false;
        }

        detectPlatform() {
            try {
                const ua = navigator.userAgent || '';
                
                if (/iPhone|iPad|iPod/i.test(ua)) {
                    return 'ios';
                }
                
                if (/Android/i.test(ua)) {
                    return 'android';
                }
                
                return 'unknown';
            } catch (e) {
                console.warn('[PlatformLoader] 平台检测失败:', e);
                return 'unknown';
            }
        }

        async loadPlatformResources() {
            if (this.loaded) {
                console.log('[PlatformLoader] 资源已加载，跳过');
                return;
            }
            
            this.platform = this.detectPlatform();
            console.log('[PlatformLoader] 检测到平台:', this.platform);
            
            try {
                // 加载平台特定的CSS
                await this.loadPlatformCSS();
                
                // 加载平台特定的JS适配器
                await this.loadPlatformJS();
                
                // 验证关键脚本是否加载成功
                if (window.Core && window.Core.Platform && window.Core.Platform.AdapterManager) {
                    console.log('[PlatformLoader] 平台适配器管理器已加载');
                } else {
                    console.warn('[PlatformLoader] 警告：平台适配器管理器未找到，可能脚本加载失败');
                    console.warn('[PlatformLoader] 调试信息:', {
                        hasCore: !!window.Core,
                        hasPlatform: !!(window.Core && window.Core.Platform),
                        hasAdapterManager: !!(window.Core && window.Core.Platform && window.Core.Platform.AdapterManager),
                        platform: this.platform,
                        expectedScripts: this.platform === 'ios' ? ['iOSViewportAdapter.js', 'PlatformAdapterManager.js'] : 
                                        this.platform === 'android' ? ['AndroidViewportAdapter.js', 'AndroidOperaKeyboardFix.js', 'AndroidPlatformAdapter.js', 'PlatformAdapterManager.js'] : []
                    });
                }
                
                this.loaded = true;
                console.log('[PlatformLoader] 资源加载完成');
            } catch (e) {
                console.error('[PlatformLoader] 资源加载出错:', e);
                this.loaded = true; // 即使出错也标记为已加载，避免无限重试
            }
        }

        loadPlatformCSS() {
            return new Promise((resolve) => {
                const platform = this.platform;
                
                if (platform === 'ios') {
                    this.injectCSS('css/platform/ios.css');
                } else if (platform === 'android') {
                    this.injectCSS('css/platform/android.css');
                }
                
                // 延迟一下确保CSS加载完成
                setTimeout(resolve, 50);
            });
        }

        loadPlatformJS() {
            return new Promise((resolve) => {
                const platform = this.platform;
                const scripts = [];
                
                if (platform === 'ios') {
                    scripts.push('js/core/platform/iOSViewportAdapter.js');
                } else                 if (platform === 'android') {
                    scripts.push('js/core/platform/AndroidViewportAdapter.js');
                    scripts.push('js/core/platform/AndroidOperaKeyboardFix.js');
                    scripts.push('js/core/platform/AndroidPlatformAdapter.js');
                }
                
                // 加载平台适配器管理器
                scripts.push('js/core/platform/PlatformAdapterManager.js');
                
                this.loadScripts(scripts, resolve);
            });
        }

        injectCSS(href) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-platform', this.platform);
            document.head.appendChild(link);
            console.log('[PlatformLoader] 已加载CSS:', href);
        }

        loadScripts(scripts, callback) {
            if (scripts.length === 0) {
                callback();
                return;
            }
            
            let loaded = 0;
            let failed = 0;
            const total = scripts.length;
            const failedScripts = [];
            const loadedScripts = [];
            
            scripts.forEach((src) => {
                const script = document.createElement('script');
                script.src = src;
                script.setAttribute('data-platform', this.platform);
                script.onload = () => {
                    loaded++;
                    loadedScripts.push(src);
                    console.log('[PlatformLoader] 已加载JS:', src, `(${loaded}/${total})`);
                    if (loaded + failed === total) {
                        if (failed > 0) {
                            console.warn(`[PlatformLoader] ${failed}个脚本加载失败，${loaded}个成功`);
                            console.warn('[PlatformLoader] 失败的脚本:', failedScripts);
                            console.log('[PlatformLoader] 成功的脚本:', loadedScripts);
                        } else {
                            console.log('[PlatformLoader] 所有脚本加载完成');
                        }
                        callback();
                    }
                };
                script.onerror = (error) => {
                    failed++;
                    failedScripts.push(src);
                    console.error('[PlatformLoader] 加载失败:', src, `(${loaded + failed}/${total})`, error);
                    // 记录详细的错误信息
                    if (error && error.message) {
                        console.error('[PlatformLoader] 错误详情:', error.message);
                    }
                    if (loaded + failed === total) {
                        console.warn(`[PlatformLoader] ${failed}个脚本加载失败，${loaded}个成功`);
                        console.warn('[PlatformLoader] 失败的脚本:', failedScripts);
                        console.log('[PlatformLoader] 成功的脚本:', loadedScripts);
                        // 即使部分脚本失败，也继续执行回调，确保系统能继续工作
                        callback();
                    }
                };
                document.head.appendChild(script);
            });
        }

        getPlatform() {
            return this.platform;
        }
    }

    // 立即执行平台检测和加载
    const loader = new PlatformLoader();
    window.Core = window.Core || {};
    window.Core.PlatformLoader = loader;
    
    // 立即开始加载资源，不等待DOMContentLoaded
    // 这样可以确保脚本在DOMContentLoaded之前就开始加载
    loader.loadPlatformResources();
    
    // 如果DOM还在加载，也监听DOMContentLoaded作为备用
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // 如果还没加载完成，再次尝试
            if (!loader.loaded) {
                loader.loadPlatformResources();
            }
        });
    }
})(window);
