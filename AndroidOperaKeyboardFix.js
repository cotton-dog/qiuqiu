/**
 * Android Opera 键盘起落闪黑修复
 * 由 PlatformLoader 在 Android 平台加载，检测到 Opera 时应用补丁
 * 原临时方案已整合到此平台模块
 */
(function() {
    'use strict';
    const ua = String(navigator.userAgent || '');
    const isAndroidOpera = /Android/i.test(ua) && /OPR\/|OPX\/|OPT\/|Opera/i.test(ua);
    if (!isAndroidOpera) return;

    const OPERA_CLASS = 'ua-android-opera';
    const STYLE_ID = 'core-opera-kbd-fix-style';
    const KBD_ATTR = 'data-kbd';
    const MARK_VALUE = '1';
    const HOLD_MS = { pointer: 900, focus: 1400, resize: 520, vvResize: 520, vvScroll: 320 };

    function ensureStyle(doc) {
        try {
            if (!doc || !doc.head) return;
            if (doc.getElementById(STYLE_ID)) return;
            const style = doc.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
html.${OPERA_CLASS},
html.${OPERA_CLASS} body { background-color: var(--bg, var(--background-color, #f8f5f2)) !important; }
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"],
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"] body { background-color: var(--bg, var(--background-color, #f8f5f2)) !important; }
html.${OPERA_CLASS}[${KBD_ATTR}="${MARK_VALUE}"] * { transition: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
            `.trim();
            doc.head.appendChild(style);
        } catch (e) {}
    }

    function createMarker(win) {
        const state = { timer: null };
        const mark = (holdMs) => {
            try {
                const doc = win.document;
                if (!doc || !doc.documentElement) return;
                doc.documentElement.setAttribute(KBD_ATTR, MARK_VALUE);
                if (state.timer) clearTimeout(state.timer);
                state.timer = setTimeout(() => {
                    try {
                        const d = win.document;
                        if (d && d.documentElement) d.documentElement.removeAttribute(KBD_ATTR);
                    } catch (err) {}
                }, Math.max(80, Number(holdMs) || 0));
            } catch (err) {}
        };
        return { mark };
    }

    function patchWindow(win) {
        try {
            const doc = win.document;
            if (!doc || !doc.documentElement) return false;
            doc.documentElement.classList.add(OPERA_CLASS);
            ensureStyle(doc);
            const marker = createMarker(win);
            win.__operaKbdMark = (holdMs) => marker.mark(holdMs || HOLD_MS.resize);
            const relayToTop = () => {
                try {
                    if (win.top && win.top !== win && typeof win.top.__operaKbdMark === 'function')
                        win.top.__operaKbdMark(HOLD_MS.focus);
                } catch (err) {}
            };
            const isInputTarget = (t) => {
                if (!t) return false;
                const tag = String(t.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
                if (t.isContentEditable) return true;
                return false;
            };
            const isLongTextInput = (t) => {
                if (!t) return false;
                if (String(t.tagName || '').toUpperCase() !== 'TEXTAREA') return false;
                try {
                    const style = win.getComputedStyle(t);
                    return parseInt(style.height, 10) >= 120;
                } catch (e) { return false; }
            };
            const manageKeyboardSpacer = (show) => {
                try {
                    const spacer = (win.document || document).querySelector('.keyboard-spacer');
                    if (spacer) {
                        spacer.style.flex = show ? '0 0 300px' : '0 0 auto';
                        if (!show) spacer.style.height = '0';
                    }
                } catch (e) {}
            };
            const onPointer = (e) => {
                const t = e && e.target;
                if (!isInputTarget(t)) return;
                if (!isLongTextInput(t)) manageKeyboardSpacer(true);
                marker.mark(HOLD_MS.pointer);
                relayToTop();
            };
            const onFocusIn = (e) => {
                const t = e && e.target;
                if (!isInputTarget(t)) return;
                if (!isLongTextInput(t)) manageKeyboardSpacer(true);
                marker.mark(HOLD_MS.focus);
                relayToTop();
            };
            const onFocusOut = (e) => {
                const t = e && e.target;
                if (!isInputTarget(t)) return;
                if (!isLongTextInput(t)) manageKeyboardSpacer(false);
                marker.mark(HOLD_MS.focus);
                relayToTop();
            };
            win.addEventListener('pointerdown', onPointer, true);
            win.addEventListener('touchstart', onPointer, { passive: true, capture: true });
            win.addEventListener('focusin', onFocusIn, true);
            win.addEventListener('focusout', onFocusOut, true);
            
            if (window.EventBus) {
                window.EventBus.on('resize', () => marker.mark(HOLD_MS.resize));
                window.EventBus.on('visualViewport:resize', () => marker.mark(HOLD_MS.vvResize));
                window.EventBus.on('visualViewport:scroll', () => marker.mark(HOLD_MS.vvScroll));
            } else {
                win.addEventListener('resize', () => marker.mark(HOLD_MS.resize), { passive: true });
                if (win.visualViewport) {
                    win.visualViewport.addEventListener('resize', () => marker.mark(HOLD_MS.vvResize), { passive: true });
                    win.visualViewport.addEventListener('scroll', () => marker.mark(HOLD_MS.vvScroll), { passive: true });
                }
            }
            return true;
        } catch (e) { return false; }
    }

    function patchIframe(iframe) {
        try {
            const win = iframe && iframe.contentWindow;
            const doc = iframe && iframe.contentDocument;
            if (win && doc) patchWindow(win);
        } catch (e) {}
    }

    function setupIframe(iframe) {
        try {
            if (!iframe || iframe.__operaKbdPatched) return;
            iframe.__operaKbdPatched = true;
            iframe.addEventListener('load', () => patchIframe(iframe), { passive: true });
            patchIframe(iframe);
        } catch (e) {}
    }

    patchWindow(window);
    try {
        document.querySelectorAll('iframe').forEach(setupIframe);
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes || []) {
                    if (!node) continue;
                    if (node.tagName === 'IFRAME') { setupIframe(node); continue; }
                    if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(setupIframe);
                }
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
})();
