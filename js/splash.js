document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const canvas = document.getElementById('splash-canvas');
    if (!splashScreen || !canvas) return;

    const ctx = canvas.getContext('2d');
    const loadingBar = document.querySelector('.loading-bar');

    function preloadAppCSS() {
        if (typeof window.Core === 'undefined' || !window.Core.CSSLoader) {
            return;
        }

        const cssLoader = window.Core.CSSLoader;

        cssLoader.preloadCoreApps().then(() => {
            cssLoader.preloadSecondaryApps();
            window.__CSS_PRELOAD_DONE = true;
        });
    }

    preloadAppCSS();

    let width, height;
    let particles = [];
    let ripples = [];
    const particleCount = 40; // Adjust for phone screen
    const connectionDistance = 120;

    function resize() {
        // Use the parent container size (phone-container)
        width = splashScreen.offsetWidth;
        height = splashScreen.offsetHeight;
        canvas.width = width;
        canvas.height = height;
    }

    class Ripple {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.radius = 0;
            this.maxRadius = Math.random() * 80 + 20; // 20 to 100
            this.speed = Math.random() * 0.5 + 0.2;
            this.alpha = Math.random() * 0.3 + 0.1;
            this.isStroke = Math.random() > 0.5; // 50% chance of being an outline
        }

        update() {
            this.radius += this.speed;
            this.alpha -= 0.002;
        }

        draw() {
            if (this.alpha <= 0) return;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            if (this.isStroke) {
                ctx.strokeStyle = `rgba(100, 100, 100, ${this.alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.fillStyle = `rgba(200, 200, 200, ${this.alpha * 0.5})`; // Lighter fill
                ctx.fill();
            }
        }
    }

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 1.0;
            this.vy = (Math.random() - 0.5) * 1.0;
            this.size = Math.random() * 3 + 1; // 1 to 4px
            
            // Randomly choose a color: grey, or subtle brand colors if applicable
            // For point-line-plane, simple geometry often uses black/grey/white or primary colors.
            // Let's stick to dark grey for elegance on the light background.
            this.color = `rgba(50, 50, 50, ${Math.random() * 0.4 + 0.1})`; 
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Bounce off edges
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        ripples = [];
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Manage Ripples
        if (Math.random() < 0.02) { // 2% chance per frame to spawn a ripple
            ripples.push(new Ripple());
        }

        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.update();
            r.draw();
            if (r.alpha <= 0 || r.radius >= r.maxRadius) {
                ripples.splice(i, 1);
            }
        }

        // Draw connections (Lines)
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < connectionDistance) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(50, 50, 50, ${0.15 * (1 - distance / connectionDistance)})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        // Update and draw particles (Points)
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // Add some "Plane" elements - subtle geometric shapes floating?
        // Let's keep it simple "Point-Line" first as it forms planes visually.

        if (!splashScreen.classList.contains('fade-out')) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(() => {
        window.__splashFirstPainted = true;
        try {
            window.dispatchEvent(new Event('splash:first-paint'));
        } catch (e) {}
    });

    let progress = 0;
    const maxLoadingTime = 10000;
    const appIframes = Array.from(document.querySelectorAll('.phone-app-container iframe'));
    const trackedIframes = appIframes.filter((f) => {
        const src = String(f.getAttribute('src') || '').trim();
        return src && src !== 'about:blank';
    });

    const totalApps = trackedIframes.length;
    if (totalApps === 0) {
        if (loadingBar) loadingBar.style.width = '100%';
        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 800);
        }, 200);
    } else {
        const updateInterval = 50;
        const startTime = Date.now();
        let isLoadComplete = false;

        const appReadyStatus = {};

        const appMapping = {
            '传讯.html': 'chuanxun',
            '日记.html': 'riji',
            '相册.html': 'xiangce',
            '信箱.html': 'xinxiang',
            '音乐.html': 'yinyue',
            '助眠.html': 'zhumian',
            '自习室.html': 'zixishi',
            '地图.html': 'ditu',
            '日历.html': 'rili',
            '他的日常.html': 'hisdaily',
            '同人文.html': 'tongrenwen',
            '情侣空间.html': 'couple',
            'archives.html': 'archives',
            'worldbook.html': 'worldbook',
            'forum.html': 'forum',
            '购物.html': 'gouwu'
        };

        trackedIframes.forEach((iframe) => {
            const src = String(iframe.getAttribute('src') || '').trim();
            const appId = appMapping[src];
            if (appId) {
                appReadyStatus[appId] = false;
            }
        });

        function markAppReady(appId) {
            if (appReadyStatus.hasOwnProperty(appId)) {
                appReadyStatus[appId] = true;
            }
        }

        function getAllReadyCount() {
            return Object.values(appReadyStatus).filter(v => v).length;
        }

        function isAllReady() {
            return getAllReadyCount() >= totalApps;
        }

        window.addEventListener('message', (event) => {
            try {
                const data = event.data;
                if (data && data.type === 'app_ready' && data.appId) {
                    markAppReady(data.appId);
                }
            } catch (e) {}
        });

        function updateProgress(percent) {
            if (loadingBar) loadingBar.style.width = `${percent}%`;
        }

        function finishLoading() {
            if (isLoadComplete) return;
            isLoadComplete = true;
            updateProgress(100);
            clearInterval(progressTimer);
            setTimeout(() => {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 800);
            }, 260);
        }

        const progressTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const readyApps = getAllReadyCount();

            const timePercent = Math.min((elapsed / maxLoadingTime) * 100, 99);

            let realPercent = (readyApps / totalApps) * 100;

            if (readyApps >= totalApps) {
                finishLoading();
                return;
            }
            if (elapsed >= maxLoadingTime) {
                finishLoading();
                return;
            }

            let visual = Math.max(realPercent, timePercent);
            if (visual > 95 && readyApps < totalApps) visual = 95;
            progress = visual;
            updateProgress(progress);
        }, updateInterval);
    }

    window.addEventListener('resize', () => {
        resize();
        initParticles();
    });
    
    // Initial setup
    resize();
    initParticles();
    animate();
});
