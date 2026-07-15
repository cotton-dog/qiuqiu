/**
 * PWA 安装与生命周期管理
 * 挂载点: window.Core.PWA
 */
window.Core = window.Core || {};

(function() {
    let deferredPrompt;
    
    const isIos = () => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(userAgent);
    };
    
    // 检查是否已经是独立应用模式 (PWA已安装并运行)
    const isInStandaloneMode = () => {
        return ('standalone' in window.navigator) && (window.navigator.standalone);
    };

    const PWA = {
        init() {
            this.registerSW();
            this.listenForInstall();
            this.checkIOS();
        },

        /** 是否为本机/局域网开发地址（与 AuthService 一致，供 SW 注册与安检跳过用） */
        _isLocalDevHost() {
            try {
                const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
                if (!host) return false;
                if (host === 'localhost' || host === '127.0.0.1') return true;
                if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
                if (/^10\.\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
                if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
                return false;
            } catch (_) { return false; }
        },

        registerSW() {
            // 检查运行环境
            const isFileProtocol = window.location.protocol === 'file:';
            const isIframe = window.self !== window.top;
            const isSecureContext = window.isSecureContext;
            const isIdePreview = window.location.search.includes('ide_webview') || 
                               window.location.search.includes('trae-preview');
            const isLocalDev = this._isLocalDevHost();

            // 在预览环境或非安全上下文中，Service Worker 注册通常会失败
            if (isFileProtocol) {
                console.info('[PWA] Service Worker 不支持 file:// 协议。如需测试 PWA 功能，请使用本地服务器环境 (http://localhost)。');
                return;
            }

            if (isIframe || isIdePreview) {
                // IDE 预览窗口通常不支持 Service Worker 注册，抛出 InvalidStateError 是其常见限制
                console.info('[PWA] 检测到处于 IDE 预览环境。Service Worker 在此环境下通常不可用。如需测试离线功能，请点击“在浏览器中打开”并在独立标签页中访问。');
                return;
            }

            // 非安全上下文（如手机通过 http://电脑IP:端口 访问）时，仅在本机/局域网开发地址下仍尝试注册，避免被直接拦截
            if (!isSecureContext && !isLocalDev) {
                console.warn('[PWA] 当前非安全上下文 (Non-Secure Context)，Service Worker 注册可能失败。');
                return;
            }

            if ('serviceWorker' in navigator) {
                const startRegistration = () => {
                    // 检查文档状态，避免在卸载或未激活时注册
                    if (document.readyState === 'uninitialized') return;

                    navigator.serviceWorker.register('./sw.js')
                        .then(registration => {
                            console.log('[PWA] SW 注册成功:', registration.scope);

                            if (!window.__pwaSwControllerChangeHooked) {
                                window.__pwaSwControllerChangeHooked = true;
                                let _isRefreshing = false;
                                navigator.serviceWorker.addEventListener('controllerchange', () => {
                                    if (_isRefreshing) return;
                                    _isRefreshing = true;
                                    try { window.location.reload(); } catch (e) {}
                                });
                            }
                            
                            // 监听更新
                            registration.onupdatefound = () => {
                                const installingWorker = registration.installing;
                                if (!installingWorker) return;

                                installingWorker.onstatechange = () => {
                                    if (installingWorker.state === 'installed') {
                                        if (navigator.serviceWorker.controller) {
                                            try {
                                                const w = registration.waiting;
                                                if (w) w.postMessage({ type: 'SKIP_WAITING' });
                                            } catch (e) {}
                                            console.log('[PWA] 新内容可用，正在切换到新版本');
                                        } else {
                                            console.log('[PWA] 内容已缓存，可离线使用');
                                        }
                                    }
                                };
                            };
                        })
                        .catch(error => {
                            // 针对 InvalidStateError 提供更具体的解释
                            if (error.name === 'InvalidStateError') {
                                console.warn('[PWA] SW 注册受限 (InvalidStateError): 当前环境不允许注册 Service Worker。这通常是因为页面处于 IDE 预览窗格或正在快速重载。请在独立浏览器窗口中测试 PWA 功能。');
                            } else if (error.name === 'SecurityError') {
                                console.warn('[PWA] SW 注册受限 (SecurityError): 安全限制（请确保使用 HTTPS 或 localhost）。');
                            } else {
                                console.error('[PWA] SW 注册异常:', error);
                            }
                        });
                };

                // 确保在页面加载完成后注册，并使用较长的延迟以避开预览环境的初始抖动
                const waitAndRegister = () => {
                    if (window.requestIdleCallback) {
                        window.requestIdleCallback(() => setTimeout(startRegistration, 2000));
                    } else {
                        setTimeout(startRegistration, 2000);
                    }
                };

                if (document.readyState === 'complete') {
                    waitAndRegister();
                } else {
                    window.addEventListener('load', waitAndRegister);
                }
            }
        },

        listenForInstall() {
            window.addEventListener('beforeinstallprompt', (e) => {
                // 防止 Chrome 67+ 自动显示提示
                e.preventDefault();
                // 保存事件以便稍后触发
                deferredPrompt = e;
                console.log('[PWA] 安装事件已捕获，等待用户触发');
                
                // 可以在这里通知 UI 显示安装按钮
                // document.body.classList.add('pwa-install-available');
            });
        },

        /**
         * 触发安装流程 (需绑定到按钮点击事件)
         */
        async install() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`[PWA] 用户安装选择: ${outcome}`);
                deferredPrompt = null;
            } else if (isIos()) {
                // iOS 无法通过 JS 触发安装，只能提示
                alert('为了获得最佳体验，请点击浏览器底部的“分享”按钮，然后选择“添加到主屏幕”。');
            } else {
                console.log('[PWA] 当前环境不支持自动安装或已安装');
            }
        },

        checkIOS() {
            if (isIos() && !isInStandaloneMode()) {
                console.log('[PWA] 检测到 iOS 浏览器环境，建议添加到主屏幕');
            }
        }
    };

    window.Core.PWA = PWA;
    
    // 自动初始化
    PWA.init();
})();
