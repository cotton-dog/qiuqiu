(function(window) {
    'use strict';

    // Broadcast Channel for cross-app communication
    const bus = new BroadcastChannel('phone_app_bus');

    // State
    let contacts = [];
    let isSelectorOpen = false;
    let onSelectCallback = null;
    const avatarUrlCache = new Map();

    async function resolveAvatarSrc(raw) {
        const input = String(raw || '').trim();
        if (!input) return '';
        if (!window.Core || !window.Core.ImageService || !window.Core.StorageService) return input;
        const parsed = window.Core.ImageService.parseRef(input);
        if (parsed.kind === 'direct') return parsed.src || '';
        if (parsed.kind !== 'idb') return '';
        const id = parsed.id ? String(parsed.id) : '';
        if (!id) return '';
        if (avatarUrlCache.has(id)) return avatarUrlCache.get(id) || '';
        try {
            await window.Core.StorageService.openDB('PhoneAppImages', 5);
            const data = await window.Core.StorageService.transaction('PhoneAppImages', ['images'], async (tx) => {
                const store = tx.objectStore('images');
                return new Promise((resolve, reject) => {
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result ? req.result.data : null);
                    req.onerror = () => reject(req.error);
                });
            });
            if (!data) return '';
            const url = typeof data === 'string' ? data : (typeof URL !== 'undefined' ? URL.createObjectURL(data) : '');
            if (url) {
                avatarUrlCache.set(id, url);
                return url;
            }
        } catch (e) {
            return '';
        }
        return '';
    }

    function getMessageLabel(type, payload) {
        if (type === 'product_share') {
            const name = payload && payload.product && payload.product.name ? payload.product.name : '商品';
            return `[分享] ${name}`;
        }
        const total = payload && payload.order ? Number(payload.order.total) : NaN;
        const priceText = Number.isFinite(total) ? `¥${total.toFixed(2)}` : '订单';
        return `[代付] ${priceText}`;
    }

    async function persistMessage(type, payload) {
        if (!window.Core || !window.Core.StorageService) return;
        const contactId = payload && payload.contactId ? String(payload.contactId) : '';
        if (!contactId) return;
        try {
            const appData = await window.Core.StorageService.getAppData('wechatAppData');
            if (!appData || !Array.isArray(appData.contacts) || !Array.isArray(appData.chats)) return;
            const contact = appData.contacts.find(c => c && String(c.id) === contactId);
            if (!contact) return;

            let chat = appData.chats.find(c => c && String(c.contactId) === contactId);
            if (!chat) {
                chat = {
                    id: `chat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                    contactId: contactId,
                    name: contact.name,
                    avatarText: contact.avatarText,
                    avatarColor: contact.avatarColor,
                    lastMessage: '',
                    lastMessageTime: new Date().toISOString(),
                    messages: [],
                    unread: 0
                };
                appData.chats.push(chat);
            }

            const now = new Date();
            const time = now.toISOString();
            const recent = chat.messages.slice(-10).some(m => {
                if (!m || m.sender !== 'me' || m.type !== type) return false;
                if (type === 'product_share') {
                    if (!m.product || !payload.product) return false;
                    if (String(m.product.id || '') !== String(payload.product.id || '')) return false;
                } else if (type === 'pay_request') {
                    if (!m.order || !payload.order) return false;
                    if (String(m.order.id || '') !== String(payload.order.id || '')) return false;
                }
                const t = m.time || m.timestamp;
                if (!t) return false;
                const diff = Math.abs(new Date(t).getTime() - now.getTime());
                return diff <= 10000;
            });
            if (recent) return;

            const newMessage = {
                id: Date.now(),
                sender: 'me',
                type,
                time,
                timestamp: time,
                ...payload
            };
            chat.messages.push(newMessage);
            chat.lastMessage = getMessageLabel(type, payload);
            chat.lastMessageTime = time;
            chat.unread = Number.isFinite(chat.unread) ? chat.unread + 1 : 1;

            await window.Core.StorageService.setAppData('wechatAppData', appData);
            try {
                localStorage.setItem('wechatAppData', JSON.stringify(appData));
            } catch (e) {}
        } catch (e) {}
    }

    // Helper: Create Modal
    function createSelectorModal() {
        if (document.getElementById('contactSelectorModal')) return;

        const modal = document.createElement('div');
        modal.id = 'contactSelectorModal';
        // 使用 z-index 2000 确保在最上层
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 2000;
            display: none; align-items: flex-end; justify-content: center;
            opacity: 0; transition: opacity 0.2s;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: var(--surface, #fff); width: 100%; max-height: 80vh;
            border-top-left-radius: 20px; border-top-right-radius: 20px;
            display: flex; flex-direction: column; overflow: hidden;
            transform: translateY(100%); transition: transform 0.3s;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px; text-align: center; font-weight: bold;
            border-bottom: 1px solid var(--hair, rgba(0,0,0,0.1));
            display: flex; justify-content: space-between; align-items: center;
        `;
        header.innerHTML = `
            <span style="width: 40px"></span>
            <span>选择好友</span>
            <button id="closeSelectorBtn" style="border:none;background:none;font-size:24px;color:var(--text, #333);width:40px;cursor:pointer">&times;</button>
        `;

        const list = document.createElement('div');
        list.id = 'contactSelectorList';
        list.style.cssText = `
            flex: 1; overflow-y: auto; padding: 10px; min-height: 200px;
        `;

        content.appendChild(header);
        content.appendChild(list);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Events
        document.getElementById('closeSelectorBtn').onclick = hideSelector;
        modal.onclick = (e) => {
            if (e.target === modal) hideSelector();
        };
    }

    // Helper: Render Contacts
    function renderContacts(listEl) {
        if (!contacts || contacts.length === 0) {
            listEl.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--muted, #999);font-size:14px">暂无联系人<br>请先在传讯APP添加好友</div>';
            return;
        }

        listEl.innerHTML = contacts.map(c => `
            <div class="contact-item" data-id="${c.id}" style="
                display: flex; align-items: center; gap: 12px; padding: 12px;
                border-bottom: 1px solid var(--hair, rgba(0,0,0,0.05)); cursor: pointer;
            ">
                <div style="
                    width: 44px; height: 44px; border-radius: 50%; background: #eee;
                    overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
                ">
                    ${c.avatar ? `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : '<span style="font-size:20px">👤</span>'}
                </div>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:15px;color:var(--text, #333)">${c.name || '未知'}</div>
                    <div style="font-size:12px;color:var(--muted, #999);margin-top:2px">${c.intro || ''}</div>
                </div>
                <div style="
                    padding: 6px 14px; background: #FF9F43; color: white;
                    border-radius: 14px; font-size: 13px; font-weight: 600;
                ">选择</div>
            </div>
        `).join('');

        // Bind clicks
        listEl.querySelectorAll('.contact-item').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.id;
                const contact = contacts.find(c => c.id === id);
                if (contact && onSelectCallback) {
                    onSelectCallback(contact);
                    hideSelector();
                }
            };
        });
    }

    function showSelector(callback) {
        onSelectCallback = callback;
        createSelectorModal();
        loadContacts().then(() => {
            const modal = document.getElementById('contactSelectorModal');
            const listEl = document.getElementById('contactSelectorList');
            if (modal && listEl) {
                renderContacts(listEl);
                modal.style.display = 'flex';
                // Force reflow
                modal.offsetHeight; 
                modal.style.opacity = '1';
                modal.firstElementChild.style.transform = 'translateY(0)';
            }
        });
    }

    function hideSelector() {
        const modal = document.getElementById('contactSelectorModal');
        if (modal) {
            modal.style.opacity = '0';
            modal.firstElementChild.style.transform = 'translateY(100%)';
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }

    // Data Loader
    async function loadContacts() {
        if (!window.Core || !window.Core.StorageService) {
            console.error('StorageService not available');
            return;
        }

        try {
            const data = await window.Core.StorageService.getAppData('wechatAppData');

            if (data && Array.isArray(data.contacts)) {
                // Enrich contacts with avatars if needed (images are in 'images' store, but we might just use data URI if stored in contact, 
                // but usually messaging app stores avatar as blob in 'images' store and key in contact)
                // For simplicity, we just load contacts. If avatar is a key, we might need to fetch it. 
                // In messaging app, avatar logic is complex (see setImgSrcFromStore).
                // For now, we'll try to use what's in contact object or default.
                
                // Fetch avatars for contacts
                const contactsWithAvatars = await Promise.all(data.contacts.map(async (c) => {
                    let avatarSrc = '';
                    if (c && c.avatar) {
                        avatarSrc = await resolveAvatarSrc(c.avatar);
                    }
                    if (!avatarSrc && c && c.hasCustomAvatar) {
                        const raw = localStorage.getItem(`avatar_${c.id}`);
                        if (raw) {
                            avatarSrc = await resolveAvatarSrc(raw);
                        }
                    }
                    return { ...c, avatar: avatarSrc };
                }));
                contacts = contactsWithAvatars;
            }
        } catch (e) {
            console.error('Failed to load contacts:', e);
            // Fallback to localStorage if DB fails
            try {
                const lsData = localStorage.getItem('wechatAppData');
                if (lsData) {
                    const parsed = JSON.parse(lsData);
                    if (parsed && parsed.contacts) {
                        contacts = parsed.contacts;
                    }
                }
            } catch (err) {}
        }
    }

    // API
    window.ShoppingExtension = {
        showSelector,
        
        sendShare: (contact, product) => {
            if (!contact || !product) return;
            const payload = {
                contactId: contact.id,
                product: {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    brief: product.brief
                }
            };
            bus.postMessage({
                type: 'product_share',
                payload
            });
            persistMessage('product_share', payload);
            // Show toast
            showToast(`已分享给 ${contact.name}`);
        },

        sendPayRequest: (contact, order) => {
            if (!contact || !order) return;
            const payload = {
                contactId: contact.id,
                order: {
                    id: order.id,
                    total: order.total,
                    items: order.items
                }
            };
            bus.postMessage({
                type: 'pay_request',
                payload
            });
            persistMessage('pay_request', payload);
            showToast(`已发送代付请求给 ${contact.name}`);
        }
    };

    function showToast(msg) {
        // Reuse Shopping App's toast if available, or create one
        if (window.showToast) {
            window.showToast(msg);
        } else {
            const div = document.createElement('div');
            div.textContent = msg;
            div.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.7); color: white; padding: 10px 20px;
                border-radius: 20px; font-size: 14px; z-index: 3000;
            `;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 2000);
        }
    }

})(window);
