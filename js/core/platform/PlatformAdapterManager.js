/**
 * 平台适配器管理器
 * 根据设备类型自动加载对应的平台适配器
 */
(function(window) {
    'use strict';

    class PlatformAdapterManager {
        constructor() {
            this.deviceAdapter = null;
            this.viewportAdapter = null;
            this.platformAdapter = null;
            this.patrolLogger = null;
        }

        setPatrolLogger(logger) {
            this.patrolLogger = logger;
        }

        async init(deviceAdapter) {
            if (!deviceAdapter) {
                console.error('[PlatformAdapterManager] DeviceAdapter未提供');
                return;
            }

            this.deviceAdapter = deviceAdapter;
            
            // 初始化视口适配器
            await this.initViewportAdapter();
            
            // 初始化平台适配器
            await this.initPlatformAdapter();
            
            // 记录初始化日志
            this.logInit();
        }

        async initViewportAdapter() {
            try {
                if (this.deviceAdapter.isIOS()) {
                    const iOSViewportAdapter = window.Core?.Platform?.iOSViewportAdapter;
                    if (iOSViewportAdapter) {
                        this.viewportAdapter = new iOSViewportAdapter(this.deviceAdapter);
                        this.viewportAdapter.init();
                        console.log('[PlatformAdapterManager] iOS视口适配器已加载');
                    } else {
                        console.warn('[PlatformAdapterManager] iOSViewportAdapter未找到');
                    }
                } else if (this.deviceAdapter.isAndroid()) {
                    const AndroidViewportAdapter = window.Core?.Platform?.AndroidViewportAdapter;
                    if (AndroidViewportAdapter) {
                        this.viewportAdapter = new AndroidViewportAdapter(this.deviceAdapter);
                        this.viewportAdapter.init();
                        console.log('[PlatformAdapterManager] Android视口适配器已加载');
                    } else {
                        console.warn('[PlatformAdapterManager] AndroidViewportAdapter未找到');
                    }
                }
            } catch (e) {
                console.error('[PlatformAdapterManager] 初始化视口适配器失败:', e);
                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'platform_adapter_error',
                        level: 'error',
                        action: 'init_viewport_adapter',
                        details: { error: e.message },
                        message: '视口适配器初始化失败: ' + e.message
                    });
                }
            }
        }

        async initPlatformAdapter() {
            try {
                if (this.deviceAdapter.isIOS()) {
                    const iOSPlatformAdapter = window.Core?.Platform?.iOSPlatformAdapter;
                    if (iOSPlatformAdapter) {
                        this.platformAdapter = new iOSPlatformAdapter(this.deviceAdapter);
                        await this.platformAdapter.init();
                        console.log('[PlatformAdapterManager] iOS平台适配器已加载');
                    } else {
                        console.warn('[PlatformAdapterManager] iOSPlatformAdapter未找到，平台适配器未加载（这是可选的扩展功能）');
                        if (this.patrolLogger) {
                            this.patrolLogger.log({
                                type: 'platform_adapter_warning',
                                level: 'warning',
                                action: 'init_platform_adapter',
                                details: { 
                                    platform: 'ios',
                                    reason: 'iOSPlatformAdapter类未找到，可能文件未加载或不存在'
                                },
                                message: 'iOS平台适配器类未找到，平台适配器未加载（这是可选的扩展功能）'
                            });
                        }
                    }
                } else if (this.deviceAdapter.isAndroid()) {
                    const AndroidPlatformAdapter = window.Core?.Platform?.AndroidPlatformAdapter;
                    if (AndroidPlatformAdapter) {
                        this.platformAdapter = new AndroidPlatformAdapter(this.deviceAdapter);
                        await this.platformAdapter.init();
                        console.log('[PlatformAdapterManager] Android平台适配器已加载');
                    } else {
                        console.warn('[PlatformAdapterManager] AndroidPlatformAdapter未找到，平台适配器未加载（这是可选的扩展功能）');
                        if (this.patrolLogger) {
                            this.patrolLogger.log({
                                type: 'platform_adapter_warning',
                                level: 'warning',
                                action: 'init_platform_adapter',
                                details: { 
                                    platform: 'android',
                                    reason: 'AndroidPlatformAdapter类未找到，可能文件未加载或不存在'
                                },
                                message: 'Android平台适配器类未找到，平台适配器未加载（这是可选的扩展功能）'
                            });
                        }
                    }
                }
            } catch (e) {
                console.error('[PlatformAdapterManager] 初始化平台适配器失败:', e);
                if (this.patrolLogger) {
                    this.patrolLogger.log({
                        type: 'platform_adapter_error',
                        level: 'error',
                        action: 'init_platform_adapter',
                        details: { error: e.message },
                        message: '平台适配器初始化失败: ' + e.message
                    });
                }
            }
        }

        logInit() {
            if (this.patrolLogger) {
                const platform = this.deviceAdapter.getPlatformAdapter();
                this.patrolLogger.log({
                    type: 'platform_adapter_init',
                    level: 'info',
                    action: 'init',
                    details: {
                        platform: platform,
                        viewportAdapter: !!this.viewportAdapter,
                        platformAdapter: !!this.platformAdapter,
                        deviceInfo: this.deviceAdapter.getDeviceInfo()
                    },
                    message: `平台适配器初始化完成: ${platform}`
                });
            }
        }

        getViewportAdapter() {
            return this.viewportAdapter;
        }

        getPlatformAdapter() {
            return this.platformAdapter;
        }

        destroy() {
            if (this.viewportAdapter && typeof this.viewportAdapter.destroy === 'function') {
                this.viewportAdapter.destroy();
            }
            if (this.platformAdapter && typeof this.platformAdapter.destroy === 'function') {
                this.platformAdapter.destroy();
            }
        }
    }

    window.Core = window.Core || {};
    window.Core.Platform = window.Core.Platform || {};
    window.Core.Platform.AdapterManager = PlatformAdapterManager;
})(window);
