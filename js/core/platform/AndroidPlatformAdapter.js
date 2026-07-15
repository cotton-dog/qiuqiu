/**
 * Android 平台适配器（占位实现）
 * 可选扩展，用于巡查/兼容性检测；实际视口与键盘由 AndroidViewportAdapter / AndroidOperaKeyboardFix 处理。
 */
(function(window) {
    'use strict';

    if (!window.Core) window.Core = {};
    if (!window.Core.Platform) window.Core.Platform = {};

    class AndroidPlatformAdapter {
        constructor(deviceAdapter) {
            this.deviceAdapter = deviceAdapter;
        }

        async init() {
            return Promise.resolve();
        }

        destroy() {}
    }

    window.Core.Platform.AndroidPlatformAdapter = AndroidPlatformAdapter;
})(typeof window !== 'undefined' ? window : this);
