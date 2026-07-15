(function(window) {
    'use strict';

    class ImageService {
        
        // --- Compression ---

        /**
         * Compress an image Blob/File
         * @param {Blob} source 
         * @param {number} maxSize - Max width/height
         * @param {number} quality - JPEG quality (0-1)
         * @returns {Promise<Blob>}
         */
        async compressImage(source, maxSize = 512, quality = 0.82) {
            let blob = source;
            if (!(blob instanceof Blob)) {
                const isBlobLike = !!(blob && typeof blob === 'object' && typeof blob.arrayBuffer === 'function');
                if (!isBlobLike) {
                    return Promise.reject(new Error('Invalid source type: must be Blob or File'));
                }
                const buffer = await blob.arrayBuffer();
                blob = new Blob([buffer], { type: blob.type || 'application/octet-stream' });
            }
            return this._processBlob(blob, maxSize, quality);
        }

        // --- IDB Protocol Handling ---

        /**
         * Parse an image reference string (idb:..., url(...), or raw src)
         * @param {string} input 
         * @returns {{kind: 'idb'|'direct'|'empty', id?: string, src?: string}}
         */
        parseRef(input) {
            const raw = String(input || '');
            const trimmed = raw.trim();
            if (!trimmed) return { kind: 'empty' };

            if (trimmed.indexOf('idb:') === 0) {
                return { kind: 'idb', id: trimmed.slice(4).trim() };
            }

            if (trimmed.indexOf('url(') === 0) {
                const m = trimmed.match(/^url\((['"]?)(.*?)\1\)$/i);
                const inner = (m && m[2]) ? String(m[2]).trim() : '';
                if (!inner) return { kind: 'empty' };
                if (inner.indexOf('idb:') === 0) return { kind: 'idb', id: inner.slice(4).trim() };
                return { kind: 'direct', src: inner };
            }

            const idbAt = trimmed.indexOf('idb:');
            if (idbAt >= 0) {
                const tail = trimmed.slice(idbAt + 4).trim();
                if (tail) return { kind: 'idb', id: tail };
            }

            return { kind: 'direct', src: trimmed };
        }

        toCssUrl(input) {
            const safe = String(input || '').trim().replace(/"/g, '%22');
            return safe ? `url("${safe}")` : '';
        }

        // --- Internal Methods ---

        async _processBlob(blob, maxSize, quality) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(blob);
                
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        // Calculate scale
                        if (width > maxSize || height > maxSize) {
                            const ratio = Math.min(maxSize / width, maxSize / height);
                            width = Math.floor(width * ratio);
                            height = Math.floor(height * ratio);
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, width, height);

                        canvas.toBlob((resultBlob) => {
                            if (resultBlob) resolve(resultBlob);
                            else reject(new Error('Canvas compression failed'));
                        }, 'image/jpeg', quality);
                    } catch (e) {
                        reject(e);
                    }
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Image load failed'));
                };

                img.src = url;
            });
        }
    }

    window.Core = window.Core || {};
    window.Core.ImageService = new ImageService();

})(window);
