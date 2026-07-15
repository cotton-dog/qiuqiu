(function(global) {
    'use strict';

    var SecureKeyStore = {
        STORAGE_PREFIX: 'chat20.secure.',
        _keyCache: {},
        _masterKey: null,

        _getMasterKey: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (self._masterKey) {
                    resolve(self._masterKey);
                    return;
                }

                var storedKey = localStorage.getItem('chat20.master.key');
                if (storedKey) {
                    try {
                        crypto.subtle.importKey(
                            'jwk',
                            JSON.parse(storedKey),
                            { name: 'AES-GCM' },
                            true,
                            ['encrypt', 'decrypt']
                        ).then(function(key) {
                            self._masterKey = key;
                            resolve(key);
                        }).catch(function(e) {
                            console.warn('[SecureKeyStore] Failed to import master key, creating new one');
                            self._createMasterKey().then(resolve).catch(reject);
                        });
                    } catch (e) {
                        self._createMasterKey().then(resolve).catch(reject);
                    }
                } else {
                    self._createMasterKey().then(resolve).catch(reject);
                }
            });
        },

        _createMasterKey: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                crypto.subtle.generateKey(
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                ).then(function(key) {
                    self._masterKey = key;
                    return crypto.subtle.exportKey('jwk', key);
                }).then(function(jwk) {
                    localStorage.setItem('chat20.master.key', JSON.stringify(jwk));
                    resolve(self._masterKey);
                }).catch(reject);
            });
        },

        _encrypt: function(plaintext) {
            var self = this;
            return new Promise(function(resolve, reject) {
                self._getMasterKey().then(function(key) {
                    var iv = crypto.getRandomValues(new Uint8Array(12));
                    var encoder = new TextEncoder();
                    var data = encoder.encode(plaintext);

                    return crypto.subtle.encrypt(
                        { name: 'AES-GCM', iv: iv },
                        key,
                        data
                    ).then(function(encrypted) {
                        var combined = new Uint8Array(iv.length + encrypted.byteLength);
                        combined.set(iv, 0);
                        combined.set(new Uint8Array(encrypted), iv.length);
                        resolve(combined);
                    });
                }).catch(reject);
            });
        },

        _decrypt: function(encryptedData) {
            var self = this;
            return new Promise(function(resolve, reject) {
                self._getMasterKey().then(function(key) {
                    var iv = encryptedData.slice(0, 12);
                    var data = encryptedData.slice(12);

                    return crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: iv },
                        key,
                        data
                    );
                }).then(function(decrypted) {
                    var decoder = new TextDecoder();
                    resolve(decoder.decode(decrypted));
                }).catch(reject);
            });
        },

        store: function(keyName, value) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!keyName) {
                    reject(new Error('Key name is required'));
                    return;
                }

                self._encrypt(value).then(function(encrypted) {
                    var base64 = self._arrayBufferToBase64(encrypted);
                    localStorage.setItem(self.STORAGE_PREFIX + keyName, base64);
                    self._keyCache[keyName] = value;
                    resolve();
                }).catch(reject);
            });
        },

        retrieve: function(keyName) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!keyName) {
                    reject(new Error('Key name is required'));
                    return;
                }

                if (self._keyCache[keyName] !== undefined) {
                    resolve(self._keyCache[keyName]);
                    return;
                }

                var stored = localStorage.getItem(self.STORAGE_PREFIX + keyName);
                if (!stored) {
                    resolve(null);
                    return;
                }

                try {
                    var encrypted = self._base64ToArrayBuffer(stored);
                    self._decrypt(encrypted).then(function(decrypted) {
                        self._keyCache[keyName] = decrypted;
                        resolve(decrypted);
                    }).catch(function(e) {
                        console.warn('[SecureKeyStore] Failed to decrypt key:', e);
                        resolve(null);
                    });
                } catch (e) {
                    console.warn('[SecureKeyStore] Failed to parse stored key:', e);
                    resolve(null);
                }
            });
        },

        remove: function(keyName) {
            var self = this;
            return new Promise(function(resolve) {
                localStorage.removeItem(self.STORAGE_PREFIX + keyName);
                delete self._keyCache[keyName];
                resolve();
            });
        },

        exists: function(keyName) {
            return localStorage.getItem(this.STORAGE_PREFIX + keyName) !== null;
        },

        mask: function(value, visibleChars) {
            if (!value) return '';
            visibleChars = visibleChars || 4;
            if (value.length <= visibleChars) {
                return this._repeatString('*', value.length);
            }
            return value.substring(0, visibleChars) + this._repeatString('*', value.length - visibleChars);
        },

        _arrayBufferToBase64: function(buffer) {
            var binary = '';
            var bytes = new Uint8Array(buffer);
            for (var i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        },

        _base64ToArrayBuffer: function(base64) {
            var binary = atob(base64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        },

        isSupported: function() {
            return typeof crypto !== 'undefined' && 
                   typeof crypto.subtle !== 'undefined' &&
                   typeof TextEncoder !== 'undefined' &&
                   typeof TextDecoder !== 'undefined';
        },

        isSecureContext: function() {
            if (typeof window !== 'undefined') {
                if (window.isSecureContext === true) {
                    return true;
                }
                if (window.location && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                    return true;
                }
            }
            return false;
        },

        getSecurityStatus: function() {
            var isSupported = this.isSupported();
            var isSecure = this.isSecureContext();
            return {
                canEncrypt: isSupported && isSecure,
                isSupported: isSupported,
                isSecureContext: isSecure,
                reason: !isSupported ? 'Web Crypto API not supported' : (!isSecure ? 'Requires HTTPS or localhost' : 'OK')
            };
        },

        _repeatString: function(char, count) {
            var result = '';
            for (var i = 0; i < count; i++) {
                result += char;
            }
            return result;
        }
    };

    global.SecureKeyStore = SecureKeyStore;

})(typeof window !== 'undefined' ? window : this);
