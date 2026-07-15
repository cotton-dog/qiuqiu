(function(window) {
    'use strict';

    class AuthService {
        constructor() {
            this.deviceId = null;
            this.installId = null;
            this.fingerprint = null;
            this.bindingId = null;
            this.policyEpoch = 1;
            this.rootPublicKeyJwk = null;
        }

        setRootPublicKeyJwk(jwk) {
            if (!jwk || typeof jwk !== 'object') return false;
            if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false;
            if (!jwk.x || !jwk.y) return false;
            this.rootPublicKeyJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true };
            return true;
        }

        async init() {
            try {
                this.fingerprint = await this._generateFingerprint();
                this.installId = this._getOrGenerateInstallId();
                this.deviceId = await this._generateDeviceId(this.fingerprint, this.installId);
                const stableFingerprint = this._generateStableFingerprint();
                this.bindingId = await this._sha256Hex(stableFingerprint);
                return this.deviceId;
            } catch (error) {
                this.installId = this._getOrGenerateInstallId();
                this.deviceId = this.installId;
                try {
                    const stableFingerprint = this._generateStableFingerprint();
                    this.bindingId = await this._sha256Hex(stableFingerprint);
                } catch (_) {}
                return this.deviceId;
            }
        }

        getDeviceId() {
            return this.deviceId;
        }

        getBindingId() {
            return this.bindingId;
        }

        getDeviceChallenge() {
            const bid = this.bindingId;
            if (!bid || typeof bid !== 'string') return '';
            return bid.slice(0, 12).toUpperCase();
        }

        /** 本地/局域网开发时跳过防盗激活（仅开发用，部署后不生效）。手机通过电脑 IP 访问时需被识别为本地。 */
        _isLocalDevBypass() {
            try {
                const host = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
                if (!host) return false;
                if (host === 'localhost' || host === '127.0.0.1') return true;
                if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
                if (/^10\.\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
                if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
                const q = typeof window !== 'undefined' && window.location && window.location.search ? window.location.search : '';
                if (/[?&]dev=1\b/.test(q) || /[?&]activation=skip\b/.test(q)) return true;
                return false;
            } catch (_) { return false; }
        }

        isActivated() {
            return true;
        }

        async verifyDevice() {
            return { ok: true };
        }

        getDeviceKey() {
            if (!this.isActivated()) return null;
            return this._safeGetLocalStorage('core_device_key');
        }

        exportActivationPublicKey() {
            const raw = this._safeGetLocalStorage('core_activation_pubkey_jwk');
            if (!raw) return null;
            const parsed = this._safeJsonParse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        }

        isActivationPublicKeyLocked() {
            const v = this._safeGetLocalStorage('core_activation_pubkey_locked_v1');
            return String(v || '') === 'true';
        }

        importActivationPublicKey(jwk) {
            if (this.isActivationPublicKeyLocked()) return false;
            if (!jwk || typeof jwk !== 'object') return false;
            if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false;
            if (!jwk.x || !jwk.y) return false;
            const ok = this._safeSetLocalStorage('core_activation_pubkey_jwk', JSON.stringify(jwk));
            if (!ok) return false;
            this._safeSetLocalStorage('core_activation_pubkey_locked_v1', 'true');
            return true;
        }

        async resetActivationPublicKeyLock(deviceKey) {
            const state = this._getActivationState();
            if (!state || !state.deviceKeyHash) return false;
            const raw = String(deviceKey || '').trim();
            if (!raw) return false;
            const actualHash = await this._sha256Hex(raw);
            if (actualHash !== state.deviceKeyHash) return false;
            this._safeRemoveLocalStorage('core_activation_pubkey_jwk');
            this._safeRemoveLocalStorage('core_activation_pubkey_locked_v1');
            return true;
        }

        async activateWithDeviceKey(deviceKey) {
            const parsed = this._parseDeviceKey(deviceKey);
            if (!parsed) return { ok: false, reason: 'invalid_device_key' };
            if (!this.bindingId) return { ok: false, reason: 'binding_unavailable' };
            if (parsed.bind !== this.bindingId) return { ok: false, reason: 'binding_mismatch' };

            const deviceKeyHash = await this._sha256Hex(deviceKey);
            const state = {
                v: 1,
                activatedAt: Date.now(),
                method: 'device_key',
                epoch: this.policyEpoch,
                bindingId: this.bindingId,
                deviceKeyHash
            };
            const okState = this._safeSetLocalStorage('core_activation_state_v1', JSON.stringify(state));
            const okKey = this._safeSetLocalStorage('core_device_key', deviceKey);
            if (!okState || !okKey) return { ok: false, reason: 'persist_failed' };
            return { ok: true };
        }

        async activateWithActivationToken(token) {
            if (!this.bindingId) return { ok: false, reason: 'binding_unavailable' };
            const parts = typeof token === 'string' ? token.trim().split('.') : [];
            if (parts.length !== 3) return { ok: false, reason: 'invalid_token' };
            if (parts[0] !== 'AT1') return { ok: false, reason: 'invalid_token' };

            let payloadBytes;
            let sigBytes;
            try {
                payloadBytes = this._base64UrlDecodeToBytes(parts[1]);
                sigBytes = this._base64UrlDecodeToBytes(parts[2]);
            } catch (_) {
                return { ok: false, reason: 'invalid_token' };
            }

            let payload;
            try {
                payload = JSON.parse(new TextDecoder().decode(payloadBytes));
            } catch (_) {
                return { ok: false, reason: 'invalid_token' };
            }

            if (!payload || payload.v !== 2) return { ok: false, reason: 'invalid_token' };
            if (typeof payload.epoch !== 'number' || payload.epoch !== this.policyEpoch) return { ok: false, reason: 'policy_mismatch' };
            const myChallenge = this.getDeviceChallenge ? this.getDeviceChallenge() : '';
            if (payload.bindShort) {
                if (!myChallenge || String(payload.bindShort).toUpperCase() !== String(myChallenge).toUpperCase()) {
                    return { ok: false, reason: 'binding_mismatch' };
                }
            } else {
                if (payload.bind !== this.bindingId) return { ok: false, reason: 'binding_mismatch' };
            }
            if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return { ok: false, reason: 'expired' };
            if (typeof payload.nonce !== 'string' || payload.nonce.length < 8) return { ok: false, reason: 'invalid_token' };
            if (this._isActivationNonceUsed(payload.nonce)) return { ok: false, reason: 'reused' };

            const cert = payload.cert;
            if (!cert || typeof cert !== 'object') return { ok: false, reason: 'missing_cert' };
            if (cert.v !== 1) return { ok: false, reason: 'invalid_cert' };
            if (!cert.kid || typeof cert.kid !== 'string') return { ok: false, reason: 'invalid_cert' };
            if (!cert.pub || typeof cert.pub !== 'object') return { ok: false, reason: 'invalid_cert' };
            if (typeof cert.exp !== 'number' || Date.now() > cert.exp) return { ok: false, reason: 'cert_expired' };
            if (!cert.sig || typeof cert.sig !== 'string') return { ok: false, reason: 'invalid_cert' };

            if (this._isKidBlocked(cert.kid)) return { ok: false, reason: 'kid_blocked' };

            const rootJwk = this._getRootPublicKeyJwk();
            if (!rootJwk) return { ok: false, reason: 'missing_root_key' };

            let rootKey;
            try {
                rootKey = await crypto.subtle.importKey('jwk', rootJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
            } catch (_) {
                return { ok: false, reason: 'invalid_root_key' };
            }

            let certSigBytes;
            try {
                certSigBytes = this._base64UrlDecodeToBytes(cert.sig);
            } catch (_) {
                return { ok: false, reason: 'invalid_cert' };
            }

            const certBody = { v: 1, kid: cert.kid, exp: cert.exp, pub: cert.pub };
            const certBodyBytes = new TextEncoder().encode(JSON.stringify(certBody));
            let certOk = false;
            try {
                certOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, rootKey, certSigBytes, certBodyBytes);
            } catch (_) {
                certOk = false;
            }
            if (!certOk) return { ok: false, reason: 'invalid_root_signature' };

            let issuerPubKey;
            try {
                issuerPubKey = await crypto.subtle.importKey('jwk', cert.pub, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
            } catch (_) {
                return { ok: false, reason: 'invalid_cert' };
            }

            let verified = false;
            try {
                verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, issuerPubKey, sigBytes, payloadBytes);
            } catch (_) {
                verified = false;
            }
            if (!verified) return { ok: false, reason: 'invalid_signature' };

            this._markActivationNonceUsed(payload.nonce);

            const deviceKey = await this._generateDeviceKey(this.bindingId);
            const deviceKeyHash = await this._sha256Hex(deviceKey);
            const state = {
                v: 1,
                activatedAt: Date.now(),
                method: 'activation_token',
                epoch: this.policyEpoch,
                bindingId: this.bindingId,
                deviceKeyHash
            };

            const okState = this._safeSetLocalStorage('core_activation_state_v1', JSON.stringify(state));
            const okKey = this._safeSetLocalStorage('core_device_key', deviceKey);
            if (!okState || !okKey) return { ok: false, reason: 'persist_failed' };
            return { ok: true, deviceKey };
        }

        resetActivation() {
            this._safeRemoveLocalStorage('core_activation_state_v1');
            this._safeRemoveLocalStorage('core_device_key');
            return true;
        }

        // --- Internal Methods ---

        _getOrGenerateInstallId() {
            let iid = localStorage.getItem('core_install_id');
            if (!iid) {
                iid = 'install_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('core_install_id', iid);
            }
            return iid;
        }

        _generateStableFingerprint() {
            const w = typeof screen !== 'undefined' ? Number(screen.width) : 0;
            const h = typeof screen !== 'undefined' ? Number(screen.height) : 0;
            const shortEdge = Math.min(w, h);
            const longEdge = Math.max(w, h);
            const colorDepth = (typeof screen !== 'undefined' && screen.colorDepth) ? Number(screen.colorDepth) : 0;
            const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? Number(window.devicePixelRatio) : 1;
            const hc = navigator.hardwareConcurrency ? Number(navigator.hardwareConcurrency) : 0;
            const dm = navigator.deviceMemory ? Number(navigator.deviceMemory) : 0;
            const tp = navigator.maxTouchPoints ? Number(navigator.maxTouchPoints) : 0;
            const tz = (() => {
                try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; }
            })();
            const langs = (() => {
                try {
                    if (Array.isArray(navigator.languages) && navigator.languages.length) return navigator.languages.join(',');
                    if (navigator.language) return String(navigator.language);
                    return '';
                } catch (_) { return ''; }
            })();
            const platform = (() => {
                try { return navigator.platform ? String(navigator.platform) : ''; } catch (_) { return ''; }
            })();

            return [
                'v1',
                `s:${shortEdge}x${longEdge}x${colorDepth}`,
                `dpr:${dpr}`,
                `hc:${hc}`,
                `dm:${dm}`,
                `tp:${tp}`,
                `tz:${tz}`,
                `lang:${langs}`,
                `pf:${platform}`
            ].join('|');
        }

        async _generateFingerprint() {
            const components = [];
            
            // 1. User Agent (Basic)
            components.push(navigator.userAgent);
            
            // 2. Screen Resolution
            components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
            
            // 3. Hardware Concurrency
            components.push(navigator.hardwareConcurrency || 'unknown');
            
            // 4. Timezone
            components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
            
            // 5. Canvas Fingerprinting (The most unique part)
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 200;
                canvas.height = 50;
                ctx.textBaseline = 'top';
                ctx.font = '14px "Arial"';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#f60';
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('PhoneOS_Auth_v1', 2, 15);
                ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
                ctx.fillText('PhoneOS_Auth_v1', 4, 17);
                components.push(canvas.toDataURL());
            } catch (e) {
                components.push('canvas_error');
            }

            return components.join('||');
        }

        async _generateDeviceId(fingerprint, installId) {
            // Use Web Crypto API for SHA-256
            if (window.crypto && window.crypto.subtle) {
                const msgBuffer = new TextEncoder().encode(fingerprint + installId);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return hashHex.substr(0, 32);
            } else {
                // Fallback for very old browsers (simple hash)
                let hash = 0, i, chr;
                const str = fingerprint + installId;
                if (str.length === 0) return hash;
                for (i = 0; i < str.length; i++) {
                    chr = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + chr;
                    hash |= 0; // Convert to 32bit integer
                }
                return 'legacy_' + Math.abs(hash);
            }
        }

        _getActivationState() {
            const raw = this._safeGetLocalStorage('core_activation_state_v1');
            if (!raw) return null;
            return this._safeJsonParse(raw);
        }

        _isActivationNonceUsed(nonce) {
            const raw = this._safeGetLocalStorage('core_activation_used_nonces_v1');
            if (!raw) return false;
            const parsed = this._safeJsonParse(raw);
            if (!parsed || typeof parsed !== 'object') return false;
            if (!parsed.nonces || !Array.isArray(parsed.nonces)) return false;
            return parsed.nonces.includes(nonce);
        }

        _markActivationNonceUsed(nonce) {
            const raw = this._safeGetLocalStorage('core_activation_used_nonces_v1');
            const parsed = raw ? this._safeJsonParse(raw) : null;
            const now = Date.now();
            const next = {
                v: 1,
                updatedAt: now,
                nonces: Array.isArray(parsed && parsed.nonces) ? parsed.nonces.slice(0) : []
            };
            if (!next.nonces.includes(nonce)) next.nonces.unshift(nonce);
            if (next.nonces.length > 80) next.nonces.length = 80;
            this._safeSetLocalStorage('core_activation_used_nonces_v1', JSON.stringify(next));
        }

        async _generateDeviceKey(bindingId) {
            const secretBytes = crypto.getRandomValues(new Uint8Array(16));
            const secret = this._base64UrlEncodeBytes(secretBytes);
            const payloadObj = { v: 1, bind: bindingId, secret, createdAt: Date.now() };
            const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
            const payloadB64 = this._base64UrlEncodeBytes(payloadBytes);
            const checksumHex = await this._sha256Hex(`${payloadB64}.${bindingId}.${secret}`);
            const checksumBytes = this._hexToBytes(checksumHex.slice(0, 32));
            const checksumB64 = this._base64UrlEncodeBytes(checksumBytes);
            return `DK1.${payloadB64}.${checksumB64}`;
        }

        _parseDeviceKey(deviceKey) {
            const parts = typeof deviceKey === 'string' ? deviceKey.trim().split('.') : [];
            if (parts.length !== 3) return null;
            if (parts[0] !== 'DK1') return null;
            let payloadBytes;
            let checksumBytes;
            try {
                payloadBytes = this._base64UrlDecodeToBytes(parts[1]);
                checksumBytes = this._base64UrlDecodeToBytes(parts[2]);
            } catch (_) {
                return null;
            }
            let payload;
            try {
                payload = JSON.parse(new TextDecoder().decode(payloadBytes));
            } catch (_) {
                return null;
            }
            if (!payload || payload.v !== 1) return null;
            if (typeof payload.bind !== 'string' || payload.bind.length < 16) return null;
            if (typeof payload.secret !== 'string' || payload.secret.length < 8) return null;
            return { bind: payload.bind, secret: payload.secret, createdAt: payload.createdAt, payloadB64: parts[1], checksumBytes };
        }

        async _sha256Hex(str) {
            const input = String(str);
            if (!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function')) {
                let hash = 0;
                for (let i = 0; i < input.length; i++) {
                    const chr = input.charCodeAt(i);
                    hash = ((hash << 5) - hash) + chr;
                    hash |= 0;
                }
                return 'legacy_' + String(Math.abs(hash));
            }
            const msgBuffer = new TextEncoder().encode(input);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        _base64UrlEncodeBytes(bytes) {
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const b64 = btoa(binary);
            return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        }

        _base64UrlDecodeToBytes(b64url) {
            const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
            const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
            const binary = atob(padded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        }

        _hexToBytes(hex) {
            const clean = String(hex).replace(/[^0-9a-f]/gi, '');
            const out = new Uint8Array(clean.length / 2);
            for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
            return out;
        }

        _safeGetLocalStorage(key) {
            try { return localStorage.getItem(key); } catch (_) { return null; }
        }

        _safeSetLocalStorage(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (_) {
                return false;
            }
        }

        _safeRemoveLocalStorage(key) {
            try { localStorage.removeItem(key); } catch (_) {}
        }

        _safeJsonParse(raw) {
            if (!raw || typeof raw !== 'string') return null;
            try { return JSON.parse(raw); } catch (_) { return null; }
        }

        _getRootPublicKeyJwk() {
            if (this.rootPublicKeyJwk) return this.rootPublicKeyJwk;
            try {
                const v = window && window.CORE_ROOT_PUBKEY_JWK ? window.CORE_ROOT_PUBKEY_JWK : null;
                if (!v || typeof v !== 'object') return null;
                if (v.kty !== 'EC' || v.crv !== 'P-256') return null;
                if (!v.x || !v.y) return null;
                return { kty: v.kty, crv: v.crv, x: v.x, y: v.y, ext: true };
            } catch (_) {
                return null;
            }
        }

        _isKidBlocked(kid) {
            const s = String(kid || '').trim();
            if (!s) return false;
            try {
                const v = window && window.CORE_BLOCK_KIDS ? window.CORE_BLOCK_KIDS : null;
                if (!Array.isArray(v) || !v.length) return false;
                for (let i = 0; i < v.length; i++) {
                    if (String(v[i] || '').trim() === s) return true;
                }
                return false;
            } catch (_) {
                return false;
            }
        }
    }

    // Export to global scope
    window.Core = window.Core || {};
    window.Core.AuthService = new AuthService();

})(window);
