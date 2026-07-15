(function(window) {
    'use strict';

    const core = window.Core || (window.Core = {});
    if (core.SafeArea) return;

    const SafeArea = {
        _initialized: false,
        _listener: null,

        init(options = {}) {
            if (this._initialized) return;
            this._initialized = true;
            const config = {
                listen: options.listen !== false,
                request: options.request !== false,
                useStored: options.useStored !== false
            };

            if (config.useStored) {
                this._applyStoredNotchHeight();
            }

            if (config.listen) {
                this._listener = (event) => this._handleMessage(event);
                window.addEventListener('message', this._listener, { passive: true });
            }

            if (config.request) {
                this.requestSafeArea();
            }
        },

        requestSafeArea() {
            try {
                if (window.parent && window.parent !== window) {
                    const origin = this._getPostTargetOrigin();
                    window.parent.postMessage({ type: 'requestSafeArea' }, origin);
                }
            } catch (e) {}
        },

        _applyStoredNotchHeight() {
            try {
                const raw = localStorage.getItem('notchHeight');
                const parsed = parseInt(String(raw || ''), 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                    this._applySafeInsetTop(`${Math.max(0, parsed)}px`);
                }
            } catch (e) {}
        },

        _handleMessage(event) {
            if (!this._isAllowedMessageOrigin(event.origin)) return;
            const data = event && event.data ? event.data : null;
            if (!data || typeof data !== 'object') return;
            const type = data.type;

            if (type === 'clearSafeArea') {
                this._applySafeInsetTop('');
                return;
            }

            if (type === 'updateSafeArea' || type === 'APP_EVENT:updateSafeArea') {
                const payload = data && data.payload && typeof data.payload === 'object' ? data.payload : null;
                const direct = Object.prototype.hasOwnProperty.call(data, 'value') ? data.value : '';
                const nested = payload && (Object.prototype.hasOwnProperty.call(payload, 'value') ? payload.value : payload.top);
                const next = direct !== '' && typeof direct !== 'undefined' ? direct : nested;
                this._applySafeInsetTop(next);
            }
        },

        _applySafeInsetTop(value) {
            const v = String(value == null ? '' : value).trim();
            if (!v) {
                document.documentElement.style.removeProperty('--safe-inset-top');
                return;
            }
            document.documentElement.style.setProperty('--safe-inset-top', v);
        },

        _getPostTargetOrigin() {
            const origin = window.location.origin;
            return origin && origin !== 'null' ? origin : '*';
        },

        _isAllowedMessageOrigin(origin) {
            const expected = window.location.origin;
            if (!expected || expected === 'null') return true;
            return origin === expected;
        }
    };

    core.SafeArea = SafeArea;
    SafeArea.init();
})(window);
