(function(global) {
    'use strict';

    var EmbeddingService = {
        PROVIDERS: {},
        DEFAULT_PROVIDER: 'openai',
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        BATCH_SIZE: 100,
        MAX_CONCURRENT: 5,
        _initialized: false,

        init: function() {
            var self = this;
            return new Promise(function(resolve) {
                if (self._initialized) {
                    resolve();
                    return;
                }
                var promises = [];
                if (global.EmbeddingCache) {
                    promises.push(global.EmbeddingCache.init());
                }
                for (var name in self.PROVIDERS) {
                    if (self.PROVIDERS[name].init) {
                        promises.push(self.PROVIDERS[name].init());
                    }
                }
                Promise.all(promises).then(function() {
                    self._initialized = true;
                    resolve();
                }).catch(function() {
                    self._initialized = true;
                    resolve();
                });
            });
        },

        registerProvider: function(name, provider) {
            if (!name || !provider) {
                throw new Error('Provider name and instance are required');
            }
            if (typeof provider.embed !== 'function') {
                throw new Error('Provider must implement embed() method');
            }
            this.PROVIDERS[name] = provider;
        },

        getProvider: function(name) {
            var providerName = name || this.DEFAULT_PROVIDER;
            var provider = this.PROVIDERS[providerName];
            if (!provider) {
                throw new Error('Provider not found: ' + providerName);
            }
            return provider;
        },

        setDefaultProvider: function(name) {
            if (!this.PROVIDERS[name]) {
                throw new Error('Cannot set default: provider not registered: ' + name);
            }
            this.DEFAULT_PROVIDER = name;
        },

        embed: function(text, options) {
            var self = this;
            options = options || {};
            var providerName = options.provider || this.DEFAULT_PROVIDER;
            var useCache = options.useCache !== false;
            var retries = 0;
            var maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.MAX_RETRIES;

            return new Promise(function(resolve, reject) {
                if (useCache && global.EmbeddingCache) {
                    global.EmbeddingCache.get(text, { model: providerName })
                        .then(function(cached) {
                            if (cached) {
                                resolve(cached);
                                return;
                            }
                            self._embedWithRetry(text, options, providerName, maxRetries)
                                .then(function(result) {
                                    global.EmbeddingCache.set(text, result, { model: providerName })
                                        .then(function() { resolve(result); })
                                        .catch(function() { resolve(result); });
                                })
                                .catch(reject);
                        })
                        .catch(function() {
                            self._embedWithRetry(text, options, providerName, maxRetries)
                                .then(resolve)
                                .catch(reject);
                        });
                } else {
                    self._embedWithRetry(text, options, providerName, maxRetries)
                        .then(resolve)
                        .catch(reject);
                }
            });
        },

        _embedWithRetry: function(text, options, providerName, maxRetries) {
            var self = this;
            var retries = 0;

            return new Promise(function(resolve, reject) {
                function attempt() {
                    var provider = self.getProvider(providerName);
                    provider.embed(text, options)
                        .then(function(result) {
                            resolve(result);
                        })
                        .catch(function(error) {
                            retries++;
                            if (retries < maxRetries && self._isRetryableError(error)) {
                                console.warn('[EmbeddingService] Retrying (' + retries + '/' + maxRetries + '):', error.message);
                                setTimeout(attempt, self.RETRY_DELAY * retries);
                            } else {
                                reject(error);
                            }
                        });
                }
                attempt();
            });
        },

        embedBatch: function(texts, options) {
            var self = this;
            options = options || {};
            var providerName = options.provider || this.DEFAULT_PROVIDER;
            var batchSize = options.batchSize || this.BATCH_SIZE;
            var maxConcurrent = options.maxConcurrent || this.MAX_CONCURRENT;

            return new Promise(function(resolve, reject) {
                if (!Array.isArray(texts) || texts.length === 0) {
                    resolve([]);
                    return;
                }

                var provider = self.getProvider(providerName);
                if (typeof provider.embedBatch === 'function') {
                    provider.embedBatch(texts, options)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                var results = new Array(texts.length);
                var currentIndex = 0;
                var activeCount = 0;
                var hasError = false;

                function processNext() {
                    if (hasError) return;
                    if (currentIndex >= texts.length) {
                        if (activeCount === 0) {
                            resolve(results);
                        }
                        return;
                    }

                    while (activeCount < maxConcurrent && currentIndex < texts.length) {
                        var index = currentIndex;
                        currentIndex++;
                        activeCount++;

                        self.embed(texts[index], options)
                            .then(function(result) {
                                results[index] = result;
                                activeCount--;
                                processNext();
                            })
                            .catch(function(error) {
                                hasError = true;
                                reject(error);
                            });
                    }
                }

                processNext();
            });
        },

        _isRetryableError: function(error) {
            if (!error) return false;
            var message = error.message || '';
            var status = error.status || error.statusCode || 0;

            if (status === 429) return true;
            if (status >= 500 && status < 600) return true;
            if (message.indexOf('network') !== -1) return true;
            if (message.indexOf('timeout') !== -1) return true;
            if (message.indexOf('rate limit') !== -1) return true;

            return false;
        },

        getDimension: function(providerName) {
            var provider = this.getProvider(providerName || this.DEFAULT_PROVIDER);
            return provider.dimension || 1536;
        },

        getMaxTokens: function(providerName) {
            var provider = this.getProvider(providerName || this.DEFAULT_PROVIDER);
            return provider.maxTokens || 8191;
        }
    };

    var EmbeddingProvider = {
        name: 'base',
        dimension: 0,
        maxTokens: 8191,

        embed: function(text, options) {
            throw new Error('embed() must be implemented by subclass');
        },

        embedBatch: function(texts, options) {
            throw new Error('embedBatch() must be implemented by subclass');
        },

        isReady: function() {
            return false;
        },

        init: function() {
            return Promise.resolve();
        },

        _truncateText: function(text, maxTokens) {
            var maxChars = maxTokens * 4;
            if (text.length > maxChars) {
                return text.substring(0, maxChars);
            }
            return text;
        }
    };

    global.EmbeddingService = EmbeddingService;
    global.EmbeddingProvider = EmbeddingProvider;

})(typeof window !== 'undefined' ? window : this);
