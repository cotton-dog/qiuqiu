(function(window) {
    'use strict';

    class MessageBus {
        constructor() {
            this.allowedOrigins = [window.location.origin];
            // Support local file system development
            if (window.location.protocol === 'file:' || window.location.origin === 'null') {
                this.allowedOrigins.push('null');
            }
            this.handlers = new Map();
            this._initListener();
        }

        /**
         * Send a message to a target window
         * @param {Window} targetWindow - The window to send to (e.g. window.parent, iframe.contentWindow)
         * @param {string} type - Message type identifier
         * @param {any} payload - Data to send
         * @param {string} [targetOrigin] - Optional explicit target origin
         */
        send(targetWindow, type, payload = {}, targetOrigin = null) {
            if (!targetWindow) return;
            
            const message = {
                type,
                payload,
                appId: this._getAppId(),
                timestamp: Date.now(),
                nonce: Math.random().toString(36).substr(2, 9)
            };

            const origin = targetOrigin || this._getPostTargetOrigin();
            targetWindow.postMessage(message, origin);
        }

        /**
         * Register a handler for a specific message type
         * @param {string} type - Message type to listen for
         * @param {Function} callback - Function(payload, metadata)
         */
        on(type, callback) {
            if (!this.handlers.has(type)) {
                this.handlers.set(type, []);
            }
            this.handlers.get(type).push(callback);
        }

        /**
         * Remove a handler
         * @param {string} type 
         * @param {Function} callback 
         */
        off(type, callback) {
            if (!this.handlers.has(type)) return;
            const callbacks = this.handlers.get(type);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }

        // --- Internal Methods ---

        _initListener() {
            window.addEventListener('message', (event) => {
                if (!this._isAllowedOrigin(event.origin)) {
                    console.warn('[MessageBus] Blocked message from unauthorized origin:', event.origin);
                    return;
                }

                const data = event.data;
                if (!data || typeof data.type !== 'string') return;

                // Replay attack protection (valid for 60 seconds)
                // Note: In some dev environments timestamps might drift, but 60s is generous
                if (data.timestamp && Date.now() - data.timestamp > 60000) {
                    console.warn('[MessageBus] Blocked expired message:', data.type);
                    return;
                }

                if (this.handlers.has(data.type)) {
                    this.handlers.get(data.type).forEach(handler => {
                        try {
                            handler(data.payload, {
                                origin: event.origin,
                                source: event.source,
                                appId: data.appId,
                                timestamp: data.timestamp
                            });
                        } catch (e) {
                            console.error('[MessageBus] Handler error:', e);
                        }
                    });
                }
            });
        }

        _isAllowedOrigin(origin) {
            return this.allowedOrigins.includes(origin) || (origin === 'null' && this.allowedOrigins.includes('null'));
        }

        _getPostTargetOrigin() {
            const origin = window.location.origin;
            return origin && origin !== 'null' ? origin : '*';
        }

        _getAppId() {
            // Try to guess App ID from URL or window object
            const path = window.location.pathname;
            if (path.endsWith('index.html') || path === '/') return 'shell';
            
            // Extract filename without extension
            const match = path.match(/\/([^/]+)\.html$/);
            if (match) return match[1];
            
            return 'unknown_app';
        }
    }

    // Export to global scope
    window.Core = window.Core || {};
    window.Core.MessageBus = new MessageBus();

})(window);
