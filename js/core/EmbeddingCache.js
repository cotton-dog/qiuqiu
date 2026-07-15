(function(global) {
    'use strict';

    var EmbeddingCache = {
        DB_NAME: 'Chat20EmbeddingCache',
        STORE_NAME: 'embeddings',
        MEMORY_CACHE_SIZE: 1000,
        _db: null,
        _memoryCache: null,
        _memoryCacheOrder: [],
        _initialized: false,
        _stats: {
            hits: 0,
            misses: 0,
            memoryHits: 0,
            dbHits: 0
        },

        init: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (self._initialized) {
                    resolve();
                    return;
                }

                self._memoryCache = {};

                if (!window.indexedDB) {
                    console.warn('[EmbeddingCache] IndexedDB not supported, using memory cache only');
                    self._initialized = true;
                    resolve();
                    return;
                }

                var request = indexedDB.open(self.DB_NAME, 1);

                request.onerror = function(event) {
                    console.warn('[EmbeddingCache] Failed to open IndexedDB:', event.target.error);
                    self._initialized = true;
                    resolve();
                };

                request.onsuccess = function(event) {
                    self._db = event.target.result;
                    self._initialized = true;
                    resolve();
                };

                request.onupgradeneeded = function(event) {
                    var db = event.target.result;
                    if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                        var store = db.createObjectStore(self.STORE_NAME, { keyPath: 'hash' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            });
        },

        _hashText: function(text, modelName) {
            var combined = (modelName || 'default') + ':' + text;
            var hash = 0;
            for (var i = 0; i < combined.length; i++) {
                var char = combined.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(16);
        },

        get: function(text, options) {
            var self = this;
            options = options || {};
            var modelName = options.model || 'default';
            var hash = self._hashText(text, modelName);

            return new Promise(function(resolve) {
                if (self._memoryCache[hash] !== undefined) {
                    self._touchMemoryCache(hash);
                    self._stats.hits++;
                    self._stats.memoryHits++;
                    resolve(self._memoryCache[hash]);
                    return;
                }

                if (!self._db) {
                    self._stats.misses++;
                    resolve(null);
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readonly');
                var store = transaction.objectStore(self.STORE_NAME);
                var request = store.get(hash);

                request.onsuccess = function(event) {
                    var result = event.target.result;
                    if (result && result.embedding) {
                        var embedding = new Float32Array(result.embedding);
                        self._setMemoryCache(hash, embedding);
                        self._stats.hits++;
                        self._stats.dbHits++;
                        resolve(embedding);
                    } else {
                        self._stats.misses++;
                        resolve(null);
                    }
                };

                request.onerror = function() {
                    self._stats.misses++;
                    resolve(null);
                };
            });
        },

        set: function(text, embedding, options) {
            var self = this;
            options = options || {};
            var modelName = options.model || 'default';
            var hash = self._hashText(text, modelName);

            return new Promise(function(resolve) {
                self._setMemoryCache(hash, embedding);

                if (!self._db) {
                    resolve();
                    return;
                }

                var data = {
                    hash: hash,
                    embedding: Array.from(embedding),
                    model: modelName,
                    textLength: text.length,
                    timestamp: Date.now()
                };

                var transaction = self._db.transaction([self.STORE_NAME], 'readwrite');
                var store = transaction.objectStore(self.STORE_NAME);
                store.put(data);

                transaction.oncomplete = function() {
                    resolve();
                };

                transaction.onerror = function() {
                    resolve();
                };
            });
        },

        _setMemoryCache: function(hash, embedding) {
            this._memoryCache[hash] = embedding;
            this._touchMemoryCache(hash);

            while (this._memoryCacheOrder.length > this.MEMORY_CACHE_SIZE) {
                var oldest = this._memoryCacheOrder.shift();
                delete this._memoryCache[oldest];
            }
        },

        _touchMemoryCache: function(hash) {
            var index = this._memoryCacheOrder.indexOf(hash);
            if (index !== -1) {
                this._memoryCacheOrder.splice(index, 1);
            }
            this._memoryCacheOrder.push(hash);
        },

        has: function(text, options) {
            var self = this;
            options = options || {};
            var modelName = options.model || 'default';
            var hash = self._hashText(text, modelName);

            if (self._memoryCache[hash] !== undefined) {
                return Promise.resolve(true);
            }

            if (!self._db) {
                return Promise.resolve(false);
            }

            return new Promise(function(resolve) {
                var transaction = self._db.transaction([self.STORE_NAME], 'readonly');
                var store = transaction.objectStore(self.STORE_NAME);
                var request = store.get(hash);

                request.onsuccess = function(event) {
                    resolve(event.target.result !== undefined);
                };

                request.onerror = function() {
                    resolve(false);
                };
            });
        },

        delete: function(text, options) {
            var self = this;
            options = options || {};
            var modelName = options.model || 'default';
            var hash = self._hashText(text, modelName);

            return new Promise(function(resolve) {
                delete self._memoryCache[hash];
                var index = self._memoryCacheOrder.indexOf(hash);
                if (index !== -1) {
                    self._memoryCacheOrder.splice(index, 1);
                }

                if (!self._db) {
                    resolve();
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readwrite');
                var store = transaction.objectStore(self.STORE_NAME);
                store.delete(hash);

                transaction.oncomplete = function() {
                    resolve();
                };

                transaction.onerror = function() {
                    resolve();
                };
            });
        },

        clear: function() {
            var self = this;

            return new Promise(function(resolve) {
                self._memoryCache = {};
                self._memoryCacheOrder = [];

                if (!self._db) {
                    resolve();
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readwrite');
                var store = transaction.objectStore(self.STORE_NAME);
                store.clear();

                transaction.oncomplete = function() {
                    resolve();
                };

                transaction.onerror = function() {
                    resolve();
                };
            });
        },

        getStats: function() {
            var self = this;
            var totalRequests = self._stats.hits + self._stats.misses;
            var hitRate = totalRequests > 0 ? (self._stats.hits / totalRequests * 100).toFixed(2) : 0;

            return new Promise(function(resolve) {
                var stats = {
                    memoryCount: Object.keys(self._memoryCache).length,
                    memoryLimit: self.MEMORY_CACHE_SIZE,
                    dbCount: 0,
                    dbSupported: !!self._db,
                    hits: self._stats.hits,
                    misses: self._stats.misses,
                    memoryHits: self._stats.memoryHits,
                    dbHits: self._stats.dbHits,
                    hitRate: hitRate + '%'
                };

                if (!self._db) {
                    resolve(stats);
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readonly');
                var store = transaction.objectStore(self.STORE_NAME);
                var request = store.count();

                request.onsuccess = function(event) {
                    stats.dbCount = event.target.result;
                    resolve(stats);
                };

                request.onerror = function() {
                    resolve(stats);
                };
            });
        },

        resetStats: function() {
            this._stats = {
                hits: 0,
                misses: 0,
                memoryHits: 0,
                dbHits: 0
            };
        }
    };

    global.EmbeddingCache = EmbeddingCache;

})(typeof window !== 'undefined' ? window : this);
