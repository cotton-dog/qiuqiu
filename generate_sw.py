import os
import hashlib
import json
import datetime

# === 配置区域 ===
# 自动定位部署文件夹“小手机-部署版”
# - 兼容脚本放在项目根目录或 tools/ 目录等情况
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_deploy_dir():
    """
    获取部署目录的绝对路径。
    直接使用脚本所在目录作为部署目录。
    """
    return os.path.abspath(SCRIPT_DIR)

ROOT_DIR = get_deploy_dir()
OUTPUT_FILE = os.path.join(ROOT_DIR, 'sw.js')

# 需要忽略的目录
IGNORE_DIRS = {
    '.git', '.trae', '.vscode', 'tools', 'reports', '参考', 
    '__pycache__', 'node_modules', '.netlify'
}

# 需要忽略的文件扩展名
IGNORE_EXTS = {
    '.md', '.map', '.zip', '.toml', '.txt', '.py', '.json'
}

# 需要显式保留的特定文件（即使扩展名在忽略列表中）
KEEP_FILES = {
    'manifest.json'
}

# 必须忽略的具体文件
IGNORE_FILES = {
    'sw.js', 'package.json', 'package-lock.json', '.DS_Store',
    '.gitignore', '_redirects', 'netlify.toml'
}

# 核心文件列表：这些文件会在安装时预缓存
# 其他文件将按需缓存（运行时缓存）
CORE_FILES = {
    # 主页面
    './index.html',
    './',
    # 核心CSS
    './css/core-ui.css',
    './css/core-icons.min.css',
    './css/core/z-index.css',
    './css/splash.css',
    # 核心JS（Core服务）
    './js/core/StorageService.js',
    './js/core/BlobUrlService.js',
    './js/core/EventManager.js',
    './js/core/TimerManager.js',
    './js/core/MessageBus.js',
    './js/core/PopupService.js',
    './js/core/PageLifecycle.js',
    './js/core/ErrorLogService.js',
    './js/core/CapacityMonitor.js',
    './js/core/PerformanceMonitor.js',
    './js/core/VisualAnomalyDetector.js',
    './js/core/DeviceAdapter.js',
    './js/core/PatrolService.js',
    './js/core/UpdateChecker.js',
    './js/core/AuthService.js',
    './js/core/ImageService.js',
    './js/core/LazyLoader.js',
    './js/core/PlatformLoader.js',
    './js/core/PWAInstaller.js',
    './js/ImageStorageDB.js',
    './js/splash.js',
    # PWA配置
    './manifest.json',
    # 图标文件
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon-180.png',
}

# === Service Worker 模板 ===
SW_TEMPLATE = r"""/**
 * 湫丘捕梦机 Service Worker
 * 自动生成时间: {timestamp}
 * 版本: {version}
 * 预缓存文件数: {core_count}
 */

const CACHE_NAME = 'qiuqiu-v{version}';
const RUNTIME_CACHE = 'qiuqiu-runtime';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7天缓存时间

// 自动生成的预缓存列表（仅核心文件）
const PRECACHE_URLS = {file_list};

// 文件哈希映射表，用于增量更新
const FILE_HASHES = {file_hashes};

// 安装阶段：预缓存核心资源
self.addEventListener('install', event => {{
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {{
        console.log('[SW] 正在预缓存 ' + PRECACHE_URLS.length + ' 个核心文件');
        return cache.addAll(PRECACHE_URLS);
      }})
      .then(() => {{
        console.log('[SW] 核心文件预缓存完成');
        return self.skipWaiting();
      }})
      .catch(error => {{
        console.error('[SW] 预缓存失败:', error);
        // 不阻止安装，允许部分失败
        return Promise.resolve();
      }})
  );
}});

// 激活阶段：清理旧缓存
self.addEventListener('activate', event => {{
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(cacheNames => {{
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('qiuqiu-v') && name !== CACHE_NAME)
          .map(name => {{
            console.log('[SW] 删除旧版本缓存:', name);
            return caches.delete(name);
          }})
      );
    }}).then(() => {{
      console.log('[SW] 激活完成，接管所有客户端');
      return self.clients.claim();
    }})
  );
}});

// 消息处理
self.addEventListener('message', event => {{
  try {{
    const data = event.data;
    const t = (data && typeof data === 'object') ? data.type : data;
    if (t === 'SKIP_WAITING') {{
      self.skipWaiting();
    }} else if (t === 'FORCE_UPDATE') {{
      self.skipWaiting();
      event.ports[0]?.postMessage({{ status: 'updating' }});
    }} else if (t === 'CLEAR_CACHE') {{
      caches.keys().then(names => {{
        return Promise.all(names.map(name => caches.delete(name)));
      }}).then(() => {{
        event.ports[0]?.postMessage({{ status: 'cleared' }});
      }});
    }}
  }} catch (e) {{}}
}});

// 检查文件是否需要更新（基于哈希）
async function shouldUpdateCache(request, cachedResponse) {{
  if (!cachedResponse) return true;
  
  const requestUrl = new URL(request.url);
  const path = './' + requestUrl.pathname.substring(1);
  
  // 如果该文件有哈希记录，检查 ETag 或 Last-Modified
  if (FILE_HASHES[path]) {{
    try {{
      const response = await fetch(request, {{ method: 'HEAD' }});
      const etag = response.headers.get('ETag');
      const lastModified = response.headers.get('Last-Modified');
      
      // 如果文件有变更（ETag 或 Last-Modified 变化），需要更新
      const cachedEtag = cachedResponse.headers.get('ETag');
      if (etag && etag !== cachedEtag) {{
        console.log('[SW] 文件已更新:', path);
        return true;
      }}
      if (lastModified) {{
        const cachedLastModified = cachedResponse.headers.get('Last-Modified');
        if (cachedLastModified && lastModified !== cachedLastModified) {{
          console.log('[SW] 文件已更新:', path);
          return true;
        }}
      }}
    }} catch (e) {{
      // HEAD 请求失败，使用缓存
      console.log('[SW] HEAD 请求失败，使用缓存:', path);
      return false;
    }}
  }}
  
  return false;
}}

// 缓存策略：网络优先，但缓存可复用
async function networkFirstStrategy(request, cacheName = RUNTIME_CACHE) {{
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  try {{
    const response = await fetch(request);
    
    if (response && response.status === 200) {{
      // 检查是否需要更新缓存
      const shouldUpdate = await shouldUpdateCache(request, cachedResponse);
      if (shouldUpdate) {{
        const responseToCache = response.clone();
        await cache.put(request, responseToCache);
        console.log('[SW] 已缓存:', new URL(request.url).pathname);
      }}
    }}
    return response;
  }} catch (error) {{
    // 网络失败，返回缓存
    if (cachedResponse) {{
      console.log('[SW] 网络失败，使用缓存:', new URL(request.url).pathname);
      return cachedResponse;
    }}
    // 无缓存可用
    return new Response('离线且无缓存', {{ status: 503, statusText: 'Offline' }});
  }}
}}

// 缓存策略：缓存优先，后台更新
async function cacheFirstStrategy(request, cacheName = RUNTIME_CACHE) {{
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // 后台更新缓存
  const fetchPromise = fetch(request).then(response => {{
    if (response && response.status === 200) {{
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }}
    return response;
  }}).catch(() => null);
  
  // 立即返回缓存（如果有）
  if (cachedResponse) {{
    return cachedResponse;
  }}
  
  // 没有缓存，等待网络请求
  return fetchPromise.then(response => {{
    if (response) return response;
    return new Response('离线且无缓存', {{ status: 503, statusText: 'Offline' }});
  }});
}}

// 拦截请求：策略路由
self.addEventListener('fetch', event => {{
  // 跳过非 GET 请求和跨域请求
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {{
    return;
  }}

  const requestUrl = new URL(event.request.url);
  const path = requestUrl.pathname || '';

  // 策略 1: HTML 文件 -> 网络优先（确保内容最新）
  if (path.endsWith('.html') || path.endsWith('/')) {{
    event.respondWith(networkFirstStrategy(event.request, CACHE_NAME));
    return;
  }}

  // 策略 2: 核心文件（预缓存） -> 缓存优先
  const relativePath = './' + path.substring(1);
  if (PRECACHE_URLS.includes(relativePath)) {{
    event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
    return;
  }}

  // 策略 3: CSS/JS 文件 -> 网络优先（支持按需更新）
  if (path.endsWith('.css') || path.endsWith('.js')) {{
    event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
    return;
  }}

  // 策略 4: 图片/字体/其他资源 -> 缓存优先
  if (path.match(/\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/)) {{
    event.respondWith(cacheFirstStrategy(event.request, RUNTIME_CACHE));
    return;
  }}

  // 策略 5: 其他资源 -> 网络优先
  event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
}});
"""

def compute_file_hash(abs_path):
    """
    计算文件内容的 MD5 哈希值
    """
    hash_obj = hashlib.md5()
    try:
        with open(abs_path, 'rb') as f:
            # 分块读取大文件，避免内存问题
            for chunk in iter(lambda: f.read(8192), b''):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()[:12]
    except (IOError, OSError):
        return None

def generate_file_list(root_dir):
    """
    生成文件列表，分为核心文件（预缓存）和其他文件（按需缓存）
    返回：(core_files, all_files)
    """
    core_files = []
    all_files = []
    
    # 始终包含根路径
    all_files.append('./')
    
    for root, dirs, files in os.walk(root_dir):
        # 过滤目录
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            if file in IGNORE_FILES:
                continue
            
            _, ext = os.path.splitext(file)
            if ext in IGNORE_EXTS and file not in KEEP_FILES:
                continue
                
            # 获取相对路径
            rel_path = os.path.relpath(os.path.join(root, file), root_dir)
            # 转换为 web 路径 (/)
            web_path = './' + rel_path.replace('\\', '/')
            all_files.append(web_path)
            
            # 检查是否是核心文件
            if web_path in CORE_FILES:
                core_files.append(web_path)
    
    # 确保核心文件列表包含所有必需的核心文件
    for core_file in CORE_FILES:
        if core_file not in core_files:
            # 检查文件是否存在
            rel_path = core_file[2:] if core_file.startswith('./') else core_file
            abs_path = os.path.join(root_dir, rel_path.replace('/', os.sep))
            if os.path.exists(abs_path):
                core_files.append(core_file)
    
    return sorted(core_files), sorted(all_files)

def generate_file_hashes(root_dir, file_list):
    """
    生成文件哈希映射表，用于增量更新检测
    返回: {web_path: hash_value}
    """
    file_hashes = {}
    
    for web_path in file_list:
        if web_path == './':
            continue
        
        rel_path = web_path[2:] if web_path.startswith('./') else web_path
        abs_path = os.path.join(root_dir, rel_path.replace('/', os.sep))
        
        try:
            file_hash = compute_file_hash(abs_path)
            if file_hash:
                file_hashes[web_path] = file_hash
        except Exception as e:
            print(f"警告: 无法计算文件哈希 {web_path}: {e}")
            continue
    
    return file_hashes

def compute_version_hash(root_dir, file_list):
    """
    基于文件内容哈希计算版本号
    这样只有文件内容变化时，版本号才会改变
    """
    file_hashes = generate_file_hashes(root_dir, file_list)
    
    # 收集所有文件的哈希值并排序，确保稳定性
    sorted_hashes = sorted(file_hashes.items())
    
    # 将哈希值拼接成字符串，计算最终版本哈希
    signature = '|'.join([f"{path}:{hash_val}" for path, hash_val in sorted_hashes])
    
    return hashlib.md5(signature.encode('utf-8')).hexdigest()[:12]

def main():
    print(f"正在扫描项目目录: {ROOT_DIR}")
    core_files, all_files = generate_file_list(ROOT_DIR)
    
    print(f"找到 {len(all_files)} 个文件。")
    print(f"核心文件（预缓存）: {len(core_files)} 个")
    print(f"其他文件（按需缓存）: {len(all_files) - len(core_files)} 个")
    
    # 生成文件哈希映射表（用于增量更新检测）
    print("正在计算文件哈希...")
    file_hashes = generate_file_hashes(ROOT_DIR, core_files)
    print(f"已生成 {len(file_hashes)} 个文件的哈希映射")
    
    # 生成版本号（基于核心文件内容哈希）
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    content_hash = compute_version_hash(ROOT_DIR, core_files)
    version = f"{datetime.datetime.now().strftime('%Y%m%d')}-{content_hash}"
    
    # 格式化 JS 数组字符串
    file_list_json = json.dumps(core_files, indent=2)
    file_hashes_json = json.dumps(file_hashes, indent=2)
    
    # 生成最终内容
    sw_content = SW_TEMPLATE.format(
        timestamp=timestamp,
        version=version,
        core_count=len(core_files),
        file_list=file_list_json,
        file_hashes=file_hashes_json
    )
    
    # 写入文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(sw_content)
    
    print(f"✅ Service Worker 已生成: {OUTPUT_FILE}")
    print(f"版本: {version}")
    print(f"预缓存文件数: {len(core_files)}")
    print(f"文件哈希映射: {len(file_hashes)} 个")

if __name__ == '__main__':
    main()
