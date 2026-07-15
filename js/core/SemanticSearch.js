(function(global) {
    'use strict';

    var VectorArrayType = Float32Array;

    var SemanticSearch = {
        DB_NAME: 'Chat20SemanticIndex',
        STORE_NAME: 'vectors',
        _db: null,
        _index: null,
        _initialized: false,
        _dimension: 1536,

        init: function(options) {
            var self = this;
            options = options || {};
            self._dimension = options.dimension || 1536;

            return new Promise(function(resolve, reject) {
                if (self._initialized) {
                    resolve();
                    return;
                }

                if (!window.indexedDB) {
                    console.warn('[SemanticSearch] IndexedDB not supported');
                    self._initialized = true;
                    resolve();
                    return;
                }

                var request = indexedDB.open(self.DB_NAME, 1);

                request.onerror = function(event) {
                    console.error('[SemanticSearch.init] Failed to open IndexedDB:', event.target.error);
                    self._initialized = true;
                    resolve();
                };

                request.onsuccess = function(event) {
                    self._db = event.target.result;
                    self._initialized = true;
                    self._loadIndex().then(resolve).catch(function(err) {
                        console.error('[SemanticSearch.init] Failed to load index:', err);
                        resolve();
                    });
                };

                request.onupgradeneeded = function(event) {
                    var db = event.target.result;
                    if (!db.objectStoreNames.contains(self.STORE_NAME)) {
                        var store = db.createObjectStore(self.STORE_NAME, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('friendId', 'friendId', { unique: false });
                    }
                };
            });
        },

        _loadIndex: function() {
            var self = this;
            self._index = [];

            return new Promise(function(resolve) {
                if (!self._db) {
                    resolve();
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readonly');
                var store = transaction.objectStore(self.STORE_NAME);
                var request = store.openCursor();

                request.onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        var value = cursor.value;
                        self._index.push({
                            id: value.id,
                            vector: new VectorArrayType(value.vector),
                            metadata: value.metadata || {},
                            timestamp: value.timestamp,
                            friendId: value.friendId || null
                        });
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };

                request.onerror = function(event) {
                    console.error('[SemanticSearch._loadIndex] Cursor error:', event.target.error);
                    resolve();
                };
            });
        },

        addVector: function(id, vector, metadata) {
            var self = this;
            metadata = metadata || {};

            return new Promise(function(resolve) {
                if (!vector || (!Array.isArray(vector) && !(vector instanceof Float32Array))) {
                    console.error('[SemanticSearch.addVector] Invalid vector type for id:', id);
                    resolve();
                    return;
                }
                if (vector.length !== self._dimension) {
                    console.error('[SemanticSearch.addVector] Vector length mismatch for id:', id, 'expected:', self._dimension, 'got:', vector.length);
                    resolve();
                    return;
                }

                var vec = vector instanceof VectorArrayType ? vector : new VectorArrayType(vector);
                var friendId = metadata.friendId || null;

                var entry = {
                    id: id,
                    vector: Array.from(vec),
                    metadata: metadata,
                    timestamp: Date.now(),
                    friendId: friendId
                };

                var existingIndex = self._index.findIndex(function(item) {
                    return item.id === id;
                });
                if (existingIndex !== -1) {
                    self._index[existingIndex] = {
                        id: id,
                        vector: vec,
                        metadata: metadata,
                        timestamp: entry.timestamp,
                        friendId: friendId
                    };
                } else {
                    self._index.push({
                        id: id,
                        vector: vec,
                        metadata: metadata,
                        timestamp: entry.timestamp,
                        friendId: friendId
                    });
                }

                if (!self._db) {
                    resolve();
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readwrite');
                var store = transaction.objectStore(self.STORE_NAME);
                store.put(entry);

                transaction.oncomplete = function() {
                    resolve();
                };

                transaction.onerror = function(event) {
                    console.error('[SemanticSearch.addVector] IndexedDB transaction failed for id:', id, 'error:', event.target.error);
                    resolve();
                };
            });
        },

        removeVector: function(id) {
            var self = this;

            return new Promise(function(resolve) {
                var index = self._index.findIndex(function(item) {
                    return item.id === id;
                });
                if (index !== -1) {
                    self._index.splice(index, 1);
                }

                if (!self._db) {
                    resolve();
                    return;
                }

                var transaction = self._db.transaction([self.STORE_NAME], 'readwrite');
                var store = transaction.objectStore(self.STORE_NAME);
                store.delete(id);

                transaction.oncomplete = function() {
                    resolve();
                };

                transaction.onerror = function(event) {
                    console.error('[SemanticSearch.removeVector] IndexedDB transaction failed for id:', id, 'error:', event.target.error);
                    resolve();
                };
            });
        },

        cosineSimilarity: function(vec1, vec2) {
            if (!vec1 || !vec2 || vec1.length !== vec2.length) {
                return 0;
            }

            var dotProduct = 0;
            var norm1 = 0;
            var norm2 = 0;
            var len = vec1.length;

            for (var i = 0; i < len; i++) {
                var v1 = vec1[i];
                var v2 = vec2[i];
                dotProduct += v1 * v2;
                norm1 += v1 * v1;
                norm2 += v2 * v2;
            }

            var denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
            if (denominator === 0) {
                return 0;
            }

            return dotProduct / denominator;
        },

        search: function(queryVector, options) {
            var self = this;
            options = options || {};
            var topK = Math.max(1, Math.min(options.topK || 10, 1000));
            var threshold = Math.max(0, Math.min(options.threshold || 0, 1));
            var filter = options.filter;

            if (!queryVector || (!Array.isArray(queryVector) && !(queryVector instanceof Float32Array))) {
                console.error('[SemanticSearch.search] Invalid queryVector');
                return [];
            }

            var query = queryVector instanceof VectorArrayType ? queryVector : new VectorArrayType(queryVector);

            var results = [];

            for (var i = 0; i < self._index.length; i++) {
                var item = self._index[i];

                if (filter && !filter(item.metadata)) {
                    continue;
                }

                var similarity = self.cosineSimilarity(query, item.vector);

                if (similarity >= threshold) {
                    results.push({
                        id: item.id,
                        score: similarity,
                        metadata: item.metadata
                    });
                }
            }

            results.sort(function(a, b) {
                return b.score - a.score;
            });

            return results.slice(0, topK);
        },

        searchWithHeap: function(queryVector, options) {
            var self = this;
            options = options || {};
            var topK = Math.max(1, Math.min(options.topK || 10, 1000));
            var threshold = Math.max(0, Math.min(options.threshold || 0, 1));
            var filter = options.filter;

            if (!queryVector || (!Array.isArray(queryVector) && !(queryVector instanceof Float32Array))) {
                console.error('[SemanticSearch.searchWithHeap] Invalid queryVector');
                return [];
            }

            var query = queryVector instanceof VectorArrayType ? queryVector : new VectorArrayType(queryVector);

            var heap = [];

            for (var i = 0; i < self._index.length; i++) {
                var item = self._index[i];

                if (filter && !filter(item.metadata)) {
                    continue;
                }

                var similarity = self.cosineSimilarity(query, item.vector);

                if (similarity < threshold) {
                    continue;
                }

                if (heap.length < topK) {
                    heap.push({ id: item.id, score: similarity, metadata: item.metadata });
                    self._heapifyUp(heap, heap.length - 1);
                } else if (similarity > heap[0].score) {
                    heap[0] = { id: item.id, score: similarity, metadata: item.metadata };
                    self._heapifyDown(heap, 0);
                }
            }

            var results = [];
            while (heap.length > 0) {
                var min = heap[0];
                results.push(min);
                heap[0] = heap[heap.length - 1];
                heap.pop();
                if (heap.length > 0) {
                    self._heapifyDown(heap, 0);
                }
            }

            return results.reverse();
        },

        _heapifyUp: function(heap, index) {
            var self = this;
            while (index > 0) {
                var parentIndex = Math.floor((index - 1) / 2);
                if (heap[index].score >= heap[parentIndex].score) {
                    break;
                }
                var temp = heap[index];
                heap[index] = heap[parentIndex];
                heap[parentIndex] = temp;
                index = parentIndex;
            }
        },

        _heapifyDown: function(heap, index) {
            var self = this;
            var len = heap.length;
            while (true) {
                var smallest = index;
                var left = 2 * index + 1;
                var right = 2 * index + 2;

                if (left < len && heap[left].score < heap[smallest].score) {
                    smallest = left;
                }
                if (right < len && heap[right].score < heap[smallest].score) {
                    smallest = right;
                }

                if (smallest === index) {
                    break;
                }

                var temp = heap[index];
                heap[index] = heap[smallest];
                heap[smallest] = temp;
                index = smallest;
            }
        },

        getStats: function() {
            return {
                count: this._index.length,
                dimension: this._dimension,
                dbSupported: !!this._db,
                float16Supported: false
            };
        },

        clear: function() {
            var self = this;

            return new Promise(function(resolve) {
                self._index = [];

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

                transaction.onerror = function(event) {
                    console.error('[SemanticSearch.clear] IndexedDB transaction failed:', event.target.error);
                    resolve();
                };
            });
        },

        isFloat16Supported: function() {
            return false;
        },

        getVectorArrayType: function() {
            return VectorArrayType;
        }
    };

    global.SemanticSearch = SemanticSearch;

})(typeof window !== 'undefined' ? window : this);
