(function(window) {
    'use strict';

    class LazyLoader {
        constructor() {
            this.loadedModules = new Map();
            this.loadingPromises = new Map();
            this.loadQueue = [];
            this.idleCallbacks = [];
            this.isIdle = false;

            this._setupIdleDetection();
        }

        _setupIdleDetection() {
            if (typeof requestIdleCallback !== 'undefined') {
                const idleCallbackId = requestIdleCallback(() => {
                    this.isIdle = true;
                    this._processQueue();
                }, { timeout: 3000 });
            }
        }

        static getModuleConfig() {
            return {
                core: {
                    priority: 'immediate',
                    modules: [
                        'js/core/EventManager.js',
                        'js/core/TimerManager.js',
                        'js/core/MessageBus.js',
                        'js/core/PopupService.js'
                    ]
                },
                messaging: {
                    priority: 'idle',
                    modules: [
                        'js/apps/messaging/main.js',
                        'js/apps/messaging/storage.js'
                    ]
                },
                gallery: {
                    priority: 'idle',
                    modules: [
                        'js/apps/gallery/main.js'
                    ]
                },
                calendar: {
                    priority: 'idle',
                    modules: []
                },
                aiChat: {
                    priority: 'on-demand',
                    trigger: 'user-clicks-ai-tab',
                    modules: [
                        'js/apps/messaging/ai-chat.js'
                    ]
                },
                galleryEditor: {
                    priority: 'on-demand',
                    trigger: 'user-enters-gallery-edit',
                    modules: [
                        'js/apps/gallery/editor.js'
                    ]
                }
            };
        }

        loadModule(path) {
            if (this.loadedModules.has(path)) {
                return Promise.resolve(true);
            }

            if (this.loadingPromises.has(path)) {
                return this.loadingPromises.get(path);
            }

            const promise = new Promise((resolve, reject) => {
                try {
                    const script = document.createElement('script');
                    script.src = path;
                    script.async = true;
                    script.defer = true;

                    script.onload = () => {
                        this.loadedModules.set(path, true);
                        this.loadingPromises.delete(path);
                        resolve(true);
                    };

                    script.onerror = () => {
                        this.loadedModules.set(path, false);
                        this.loadingPromises.delete(path);
                        console.warn(`[LazyLoader] Failed to load: ${path}`);
                        resolve(false);
                    };

                    document.head.appendChild(script);
                } catch (e) {
                    console.error(`[LazyLoader] Error loading ${path}:`, e);
                    resolve(false);
                }
            });

            this.loadingPromises.set(path, promise);
            return promise;
        }

        async loadModuleGroup(groupName) {
            const config = LazyLoader.getModuleConfig();
            const group = config[groupName];

            if (!group) {
                console.warn(`[LazyLoader] Unknown module group: ${groupName}`);
                return [];
            }

            if (group.priority === 'immediate') {
                return Promise.all(
                    group.modules.map(path => this.loadModule(path))
                );
            } else if (group.priority === 'idle') {
                return this._loadIdle(group.modules);
            } else {
                return Promise.all(
                    group.modules.map(path => this.loadModule(path))
                );
            }
        }

        _loadIdle(modules) {
            return new Promise((resolve) => {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(async () => {
                        const results = await Promise.all(
                            modules.map(path => this.loadModule(path))
                        );
                        resolve(results);
                    }, { timeout: 5000 });
                } else {
                    setTimeout(async () => {
                        const results = await Promise.all(
                            modules.map(path => this.loadModule(path))
                        );
                        resolve(results);
                    }, 100);
                }
            });
        }

        _processQueue() {
            while (this.idleCallbacks.length > 0) {
                const callback = this.idleCallbacks.shift();
                if (typeof callback === 'function') {
                    callback();
                }
            }
        }

        queueIdleCallback(callback) {
            this.idleCallbacks.push(callback);
        }

        async loadHeavyService(serviceName) {
            const config = LazyLoader.getModuleConfig();
            const service = config[serviceName];

            if (!service) {
                console.warn(`[LazyLoader] Unknown service: ${serviceName}`);
                return { success: false, error: 'Unknown service' };
            }

            if (service.priority !== 'on-demand') {
                console.warn(`[LazyLoader] Service ${serviceName} is not marked as on-demand`);
            }

            const startTime = performance.now();

            const results = await Promise.all(
                service.modules.map(path => this.loadModule(path))
            );

            const loadTime = performance.now() - startTime;
            const successCount = results.filter(r => r).length;

            console.log(`[LazyLoader] ${serviceName} loaded: ${successCount}/${service.modules.length} in ${loadTime.toFixed(2)}ms`);

            if (window.Core && window.Core.EventManager) {
                window.Core.EventManager.emit('service-loaded', {
                    serviceName,
                    loadTime,
                    successCount,
                    totalModules: service.modules.length
                });
            }

            return {
                success: successCount === service.modules.length,
                loaded: successCount,
                total: service.modules.length,
                loadTime
            };
        }

        isModuleLoaded(path) {
            return this.loadedModules.get(path) === true;
        }

        getLoadedModules() {
            const modules = [];
            this.loadedModules.forEach((loaded, path) => {
                if (loaded) modules.push(path);
            });
            return modules;
        }

        getStats() {
            const config = LazyLoader.getModuleConfig();
            let totalModules = 0;
            let loadedModules = 0;

            Object.values(config).forEach(group => {
                totalModules += group.modules.length;
                group.modules.forEach(path => {
                    if (this.loadedModules.get(path)) {
                        loadedModules++;
                    }
                });
            });

            return {
                totalModules,
                loadedModules,
                pendingModules: totalModules - loadedModules,
                loadingPromises: this.loadingPromises.size
            };
        }
    }

    class CSSLoader {
        constructor() {
            this.loadedCSS = new Set();
            this.loadingCSS = new Map();
        }

        loadCSS(href) {
            if (this.loadedCSS.has(href)) {
                return Promise.resolve(true);
            }

            if (this.loadingCSS.has(href)) {
                return this.loadingCSS.get(href);
            }

            const promise = new Promise((resolve) => {
                const link = document.createElement('link');
                link.href = href;
                // 在 index 页不应用样式，仅预加载，避免应用 CSS 污染首页
                // 使用 prefetch 而不是 preload，避免触发"未使用"警告
                const isIndexPage = (document.documentElement && document.documentElement.getAttribute('data-page') === 'index') ||
                    (document.getElementById('phoneContainer') && typeof window !== 'undefined' && window === window.top);
                if (isIndexPage) {
                    link.rel = 'prefetch';
                    link.as = 'style';
                } else {
                    link.rel = 'stylesheet';
                }

                link.onload = () => {
                    this.loadedCSS.add(href);
                    this.loadingCSS.delete(href);
                    resolve(true);
                };

                link.onerror = () => {
                    this.loadedCSS.add(href);
                    this.loadingCSS.delete(href);
                    console.warn(`[CSSLoader] Failed to load: ${href}`);
                    resolve(false);
                };

                document.head.appendChild(link);
            });

            this.loadingCSS.set(href, promise);
            return promise;
        }

        async preloadCoreApps() {
            const coreApps = [
                'css/apps/messaging.css',
                'css/apps/gallery.css',
                'css/apps/calendar.css',
                'css/apps/archives.css'
            ];

            const startTime = performance.now();
            await Promise.all(coreApps.map(href => this.loadCSS(href)));
            const loadTime = performance.now() - startTime;

            console.log(`[CSSLoader] Core apps CSS loaded in ${loadTime.toFixed(2)}ms`);

            window.__CSS_PRELOAD_STATUS = {
                core: true,
                loadedAt: Date.now(),
                loadTime
            };
        }

        async preloadSecondaryApps() {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(async () => {
                    const secondaryApps = [
                        'css/apps/sleep_aid.css',
                        'css/apps/study_room.css',
                        'css/apps/worldbook.css',
                        'css/music.css'
                    ];

                    await Promise.all(secondaryApps.map(href => this.loadCSS(href)));

                    window.__CSS_PRELOAD_STATUS = {
                        ...window.__CSS_PRELOAD_STATUS,
                        secondary: true
                    };
                }, { timeout: 5000 });
            }
        }
    }

    window.Core = window.Core || {};
    window.Core.LazyLoader = LazyLoader;
    window.Core.CSSLoader = new CSSLoader();
})(window);
