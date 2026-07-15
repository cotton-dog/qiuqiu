/**
 * Opera 键盘修复入口（薄包装）
 * 仅 Android + Opera 时动态加载 platform/AndroidOperaKeyboardFix.js，避免其他环境 404
 */
(function() {
    'use strict';
    var ua = navigator.userAgent || '';
    if (!/Android/i.test(ua) || !/OPR\/|OPX\/|OPT\/|Opera/i.test(ua)) return;
    var s = document.createElement('script');
    s.src = 'js/core/platform/AndroidOperaKeyboardFix.js';
    s.async = false;
    document.head.appendChild(s);
})();
