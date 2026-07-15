(function(global) {
    'use strict';

    var OpenAIEmbeddingProvider = {
        name: 'openai',
        dimension: 1536,
        maxTokens: 8191,
        model: 'text-embedding-3-small',
        endpoint: 'https://api.openai.com/v1/embeddings',
        _apiKey: null,
        _initialized: false,

        setModel: function(modelName) {
            var models = {
                'text-embedding-3-small': { dimension: 1536, maxTokens: 8191 },
                'text-embedding-3-large': { dimension: 3072, maxTokens: 8191 },
                'text-embedding-ada-002': { dimension: 1536, maxTokens: 8191 }
            };
            var config = models[modelName];
            if (!config) {
                throw new Error('Unknown model: ' + modelName);
            }
            this.model = modelName;
            this.dimension = config.dimension;
            this.maxTokens = config.maxTokens;
        },

        setApiKey: function(apiKey) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (!apiKey) {
                    reject(new Error('API key is required'));
                    return;
                }
                if (!SecureKeyStore || !SecureKeyStore.isSupported()) {
                    self._apiKey = apiKey;
                    self._initialized = true;
                    resolve();
                    return;
                }
                SecureKeyStore.store('openai_embedding_key', apiKey)
                    .then(function() {
                        self._apiKey = apiKey;
                        self._initialized = true;
                        resolve();
                    })
                    .catch(function(e) {
                        console.warn('[OpenAIEmbedding] Failed to store key securely, using memory only');
                        self._apiKey = apiKey;
                        self._initialized = true;
                        resolve();
                    });
            });
        },

        _getApiKey: function() {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (self._apiKey) {
                    resolve(self._apiKey);
                    return;
                }
                if (!SecureKeyStore) {
                    reject(new Error('API key not set'));
                    return;
                }
                SecureKeyStore.retrieve('openai_embedding_key')
                    .then(function(key) {
                        if (key) {
                            self._apiKey = key;
                            resolve(key);
                        } else {
                            reject(new Error('API key not set'));
                        }
                    })
                    .catch(reject);
            });
        },

        isReady: function() {
            return this._initialized && this._apiKey !== null;
        },

        init: function() {
            var self = this;
            return new Promise(function(resolve) {
                if (self._apiKey) {
                    self._initialized = true;
                    resolve();
                    return;
                }
                if (!SecureKeyStore) {
                    resolve();
                    return;
                }
                SecureKeyStore.retrieve('openai_embedding_key')
                    .then(function(key) {
                        if (key) {
                            self._apiKey = key;
                            self._initialized = true;
                        }
                        resolve();
                    })
                    .catch(function() {
                        resolve();
                    });
            });
        },

        embed: function(text, options) {
            var self = this;
            options = options || {};
            var timeout = options.timeout || 30000;

            return new Promise(function(resolve, reject) {
                self._getApiKey()
                    .then(function(apiKey) {
                        var truncatedText = self._truncateText(text, self.maxTokens);
                        var controller = null;
                        var signal = null;
                        var timeoutId = null;

                        if (typeof AbortController !== 'undefined') {
                            controller = new AbortController();
                            signal = controller.signal;
                            timeoutId = setTimeout(function() {
                                if (controller) {
                                    controller.abort();
                                }
                            }, timeout);
                        }

                        return fetch(self.endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + apiKey
                            },
                            body: JSON.stringify({
                                model: self.model,
                                input: truncatedText
                            }),
                            signal: signal
                        }).then(function(response) {
                            if (timeoutId) clearTimeout(timeoutId);
                            if (!response.ok) {
                                return response.json().then(function(err) {
                                    var error = new Error(err.error ? err.error.message : 'API request failed');
                                    error.status = response.status;
                                    throw error;
                                });
                            }
                            return response.json();
                        }).then(function(data) {
                            if (data.data && data.data[0] && data.data[0].embedding) {
                                resolve(new Float32Array(data.data[0].embedding));
                            } else {
                                reject(new Error('Invalid response format'));
                            }
                        }).catch(function(error) {
                            if (timeoutId) clearTimeout(timeoutId);
                            if (error.name === 'AbortError') {
                                var timeoutError = new Error('Request timed out after ' + timeout + 'ms');
                                timeoutError.status = 408;
                                reject(timeoutError);
                            } else {
                                reject(error);
                            }
                        });
                    })
                    .catch(reject);
            });
        },

        embedBatch: function(texts, options) {
            var self = this;
            options = options || {};
            var timeout = options.timeout || 60000;

            return new Promise(function(resolve, reject) {
                if (!Array.isArray(texts) || texts.length === 0) {
                    resolve([]);
                    return;
                }

                self._getApiKey()
                    .then(function(apiKey) {
                        var truncatedTexts = texts.map(function(text) {
                            return self._truncateText(text, self.maxTokens);
                        });

                        var controller = null;
                        var signal = null;
                        var timeoutId = null;

                        if (typeof AbortController !== 'undefined') {
                            controller = new AbortController();
                            signal = controller.signal;
                            timeoutId = setTimeout(function() {
                                if (controller) {
                                    controller.abort();
                                }
                            }, timeout);
                        }

                        return fetch(self.endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + apiKey
                            },
                            body: JSON.stringify({
                                model: self.model,
                                input: truncatedTexts
                            }),
                            signal: signal
                        }).then(function(response) {
                            if (timeoutId) clearTimeout(timeoutId);
                            if (!response.ok) {
                                return response.json().then(function(err) {
                                    var error = new Error(err.error ? err.error.message : 'API request failed');
                                    error.status = response.status;
                                    throw error;
                                });
                            }
                            return response.json();
                        }).then(function(data) {
                            if (data.data && Array.isArray(data.data)) {
                                var sorted = data.data.sort(function(a, b) {
                                    return a.index - b.index;
                                });
                                var results = sorted.map(function(item) {
                                    return new Float32Array(item.embedding);
                                });
                                resolve(results);
                            } else {
                                reject(new Error('Invalid response format'));
                            }
                        }).catch(function(error) {
                            if (timeoutId) clearTimeout(timeoutId);
                            if (error.name === 'AbortError') {
                                var timeoutError = new Error('Request timed out after ' + timeout + 'ms');
                                timeoutError.status = 408;
                                reject(timeoutError);
                            } else {
                                reject(error);
                            }
                        });
                    })
                    .catch(reject);
            });
        },

        _truncateText: function(text, maxTokens) {
            var maxChars = maxTokens * 4;
            if (text.length > maxChars) {
                return text.substring(0, maxChars);
            }
            return text;
        }
    };

    if (global.EmbeddingService) {
        global.EmbeddingService.registerProvider('openai', OpenAIEmbeddingProvider);
        global.EmbeddingService.DEFAULT_PROVIDER = 'openai';
    }

    global.OpenAIEmbeddingProvider = OpenAIEmbeddingProvider;

})(typeof window !== 'undefined' ? window : this);
