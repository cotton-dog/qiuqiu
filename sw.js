/**
 * 湫丘捕梦机 Service Worker
 * 自动生成时间: 2026-02-23 16:45:19
 * 版本: 20260223-b0bd3db547e0
 * 预缓存文件数: 32
 */

const CACHE_NAME = 'qiuqiu-v20260223-b0bd3db547e0';
const RUNTIME_CACHE = 'qiuqiu-runtime';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7天缓存时间

// 自动生成的预缓存列表（仅核心文件）
const PRECACHE_URLS = [
  "./",
  "./css/core-icons.min.css",
  "./css/core-ui.css",
  "./css/core/z-index.css",
  "./css/splash.css",
  "./icons/apple-touch-icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./index.html",
  "./js/ImageStorageDB.js",
  "./js/core/AuthService.js",
  "./js/core/BlobUrlService.js",
  "./js/core/CapacityMonitor.js",
  "./js/core/DeviceAdapter.js",
  "./js/core/ErrorLogService.js",
  "./js/core/EventManager.js",
  "./js/core/ImageService.js",
  "./js/core/LazyLoader.js",
  "./js/core/MessageBus.js",
  "./js/core/PWAInstaller.js",
  "./js/core/PageLifecycle.js",
  "./js/core/PatrolService.js",
  "./js/core/PerformanceMonitor.js",
  "./js/core/PlatformLoader.js",
  "./js/core/PopupService.js",
  "./js/core/StorageService.js",
  "./js/core/TimerManager.js",
  "./js/core/UpdateChecker.js",
  "./js/core/VisualAnomalyDetector.js",
  "./js/splash.js",
  "./manifest.json"
];

// 文件哈希映射表，用于增量更新
const FILE_HASHES = {
  "./css/core-icons.min.css": "c375e2972919",
  "./css/core-ui.css": "e9890dbeef42",
  "./css/core/z-index.css": "9dc423ac61bf",
  "./css/splash.css": "179b6f4a99b4",
  "./icons/apple-touch-icon-180.png": "99d560c90484",
  "./icons/icon-192.png": "1df48dab7ce2",
  "./icons/icon-512.png": "929c30563f4e",
  "./icons/icon.svg": "1723b4e63d55",
  "./index.html": "91ffb7ef41eb",
  "./js/ImageStorageDB.js": "d6dc1fe09c3e",
  "./js/core/AuthService.js": "1d86053969ad",
  "./js/core/BlobUrlService.js": "e48d4d6d9203",
  "./js/core/CapacityMonitor.js": "c2f4b46c4362",
  "./js/core/DeviceAdapter.js": "03e0762966e2",
  "./js/core/ErrorLogService.js": "57a758feb6c7",
  "./js/core/EventManager.js": "2876f848a168",
  "./js/core/ImageService.js": "c245ae96dd5f",
  "./js/core/LazyLoader.js": "9631f3326be4",
  "./js/core/MessageBus.js": "c81e4f82df89",
  "./js/core/PWAInstaller.js": "2e57d8fbb98f",
  "./js/core/PageLifecycle.js": "57a306ee8ad3",
  "./js/core/PatrolService.js": "27b7ea76200a",
  "./js/core/PerformanceMonitor.js": "13d6e7093ca8",
  "./js/core/PlatformLoader.js": "1ddef1bae750",
  "./js/core/PopupService.js": "f76b8099652b",
  "./js/core/StorageService.js": "57283cd3a1d2",
  "./js/core/TimerManager.js": "402782519587",
  "./js/core/UpdateChecker.js": "e264b0f1d596",
  "./js/core/VisualAnomalyDetector.js": "cbd33c540372",
  "./js/splash.js": "677f09a7888d",
  "./manifest.json": "bcf6552ab327"
};

// 安装阶段：预缓存核心资源
self.addEventListener('install', event => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 正在预缓存 ' + PRECACHE_URLS.length + ' 个核心文件');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] 核心文件预缓存完成');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] 预缓存失败:', error);
        // 不阻止安装，允许部分失败
        return Promise.resolve();
      })
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', event => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('qiuqiu-v') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] 删除旧版本缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] 激活完成，接管所有客户端');
      return self.clients.claim();
    })
  );
});

// 消息处理
self.addEventListener('message', event => {
  try {
    const data = event.data;
    const t = (data && typeof data === 'object') ? data.type : data;
    if (t === 'SKIP_WAITING') {
      self.skipWaiting();
    } else if (t === 'FORCE_UPDATE') {
      self.skipWaiting();
      event.ports[0]?.postMessage({ status: 'updating' });
    } else if (t === 'CLEAR_CACHE') {
      caches.keys().then(names => {
        return Promise.all(names.map(name => caches.delete(name)));
      }).then(() => {
        event.ports[0]?.postMessage({ status: 'cleared' });
      });
    }
  } catch (e) {}
});

// 检查文件是否需要更新（基于哈希）
async function shouldUpdateCache(request, cachedResponse) {
  if (!cachedResponse) return true;
  
  const requestUrl = new URL(request.url);
  const path = './' + requestUrl.pathname.substring(1);
  
  // 如果该文件有哈希记录，检查 ETag 或 Last-Modified
  if (FILE_HASHES[path]) {
    try {
      const response = await fetch(request, { method: 'HEAD' });
      const etag = response.headers.get('ETag');
      const lastModified = response.headers.get('Last-Modified');
      
      // 如果文件有变更（ETag 或 Last-Modified 变化），需要更新
      const cachedEtag = cachedResponse.headers.get('ETag');
      if (etag && etag !== cachedEtag) {
        console.log('[SW] 文件已更新:', path);
        return true;
      }
      if (lastModified) {
        const cachedLastModified = cachedResponse.headers.get('Last-Modified');
        if (cachedLastModified && lastModified !== cachedLastModified) {
          console.log('[SW] 文件已更新:', path);
          return true;
        }
      }
    } catch (e) {
      // HEAD 请求失败，使用缓存
      console.log('[SW] HEAD 请求失败，使用缓存:', path);
      return false;
    }
  }
  
  return false;
}

// 缓存策略：网络优先，但缓存可复用
async function networkFirstStrategy(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      // 检查是否需要更新缓存
      const shouldUpdate = await shouldUpdateCache(request, cachedResponse);
      if (shouldUpdate) {
        const responseToCache = response.clone();
        await cache.put(request, responseToCache);
        console.log('[SW] 已缓存:', new URL(request.url).pathname);
      }
    }
    return response;
  } catch (error) {
    // 网络失败，返回缓存
    if (cachedResponse) {
      console.log('[SW] 网络失败，使用缓存:', new URL(request.url).pathname);
      return cachedResponse;
    }
    // 无缓存可用
    return new Response('离线且无缓存', { status: 503, statusText: 'Offline' });
  }
}

// 缓存策略：缓存优先，后台更新
async function cacheFirstStrategy(request, cacheName = RUNTIME_CACHE) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // 后台更新缓存
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  }).catch(() => null);
  
  // 立即返回缓存（如果有）
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 没有缓存，等待网络请求
  return fetchPromise.then(response => {
    if (response) return response;
    return new Response('离线且无缓存', { status: 503, statusText: 'Offline' });
  });
}

// 拦截请求：策略路由
self.addEventListener('fetch', event => {
  // 跳过非 GET 请求和跨域请求
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const path = requestUrl.pathname || '';

  // 策略 1: HTML 文件 -> 网络优先（确保内容最新）
  if (path.endsWith('.html') || path.endsWith('/')) {
    event.respondWith(networkFirstStrategy(event.request, CACHE_NAME));
    return;
  }

  // 策略 2: 核心文件（预缓存） -> 缓存优先
  const relativePath = './' + path.substring(1);
  if (PRECACHE_URLS.includes(relativePath)) {
    event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
    return;
  }

  // 策略 3: CSS/JS 文件 -> 网络优先（支持按需更新）
  if (path.endsWith('.css') || path.endsWith('.js')) {
    event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
    return;
  }

  // 策略 4: 图片/字体/其他资源 -> 缓存优先
  if (path.match(/\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/)) {
    event.respondWith(cacheFirstStrategy(event.request, RUNTIME_CACHE));
    return;
  }

  // 策略 5: 其他资源 -> 网络优先
  event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
});
