(function() {
    'use strict';

    /** 按需加载 html2canvas，仅在截图时使用 */
    function loadHtml2Canvas() {
        if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
        return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = 'js/html2canvas.min.js';
            s.onload = function() { resolve(window.html2canvas); };
            s.onerror = function() { reject(new Error('html2canvas 加载失败')); };
            document.head.appendChild(s);
        });
    }

    // === 档案应用模块 ===
    class ArchivesAppModule {
        constructor() {
            this.archivesAppContainer = document.getElementById('archivesAppContainer');
            this.archivesAppContent = document.getElementById('archivesAppContent');
            this.archivesAppToast = document.getElementById('appToast');
            
            // 共享“传讯”好友列表
            this.friends = this.loadSharedFriends();
            
            // 跟踪当前打开的图标位置
            this.openIconPosition = { x: 0, y: 0 };
        }

        // 加载共享的好友列表
        loadSharedFriends() {
            try {
                const raw = localStorage.getItem('wechatAppData');
                const summaryRaw = localStorage.getItem('friendSummaryMemory');
                const personaRaw = localStorage.getItem('friendPersonaSettings');
                
                const summaryMemory = summaryRaw ? JSON.parse(summaryRaw) : {};
                const personaSettings = personaRaw ? JSON.parse(personaRaw) : {};

                if (raw) {
                    const appData = JSON.parse(raw);
                    if (appData && Array.isArray(appData.contacts)) {
                        // 将传讯的 contact 结构映射为档案应用需要的格式
                        return appData.contacts.map(contact => {
                            const personaData = personaSettings[contact.id];
                            let persona = null;
                            let age = null;
                            let gender = contact.gender || '保密';

                            if (personaData) {
                                if (typeof personaData === 'string') {
                                    persona = personaData;
                                } else {
                                    persona = personaData.prompt || null;
                                    if (personaData.roleInfo) {
                                        const { ageGender } = personaData.roleInfo;
                                        if (ageGender) {
                                            // 尝试解析 "20岁 / 女" 或 "20 / 女"
                                            const parts = ageGender.split(/[\/／,，|｜]/);
                                            if (parts.length >= 1) {
                                                const agePart = parts[0].trim();
                                                const ageMatch = agePart.match(/\d+/);
                                                if (ageMatch) age = ageMatch[0];
                                                
                                                if (parts.length >= 2) {
                                                    gender = parts[1].trim();
                                                } else if (!ageMatch && agePart) {
                                                    // 如果没有数字，可能第一个部分就是性别
                                                    gender = agePart;
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            return {
                                id: contact.id,
                                name: contact.name,
                                gender: gender,
                                age: age,
                                intro: contact.intro || '这个人很懒，什么都没有留下...',
                                avatarText: contact.avatarText || (contact.name ? contact.name.charAt(0).toUpperCase() : '?'),
                                avatarColor: contact.avatarColor || null,
                                avatarImage: contact.hasCustomAvatar ? `idb:avatar_${contact.id}` : null,
                                persona: persona,
                                summaryItems: summaryMemory[contact.id] ? summaryMemory[contact.id].items : [],
                                addedTime: contact.addedTime || null,
                                lastActive: '在线'
                            };
                        });
                    }
                }
            } catch (e) {
                console.error('[ArchivesApp] 加载共享好友失败:', e);
            }
            return [];
        }

        init() {
            this.render();
            
            // 监听传讯数据变化
            window.addEventListener('storage', (e) => {
                if (e.key === 'wechatAppData' || e.key === 'wechatAppData_rev' || 
                    e.key === 'friendPersonaSettings' || e.key === 'friendSummaryMemory') {
                    this.friends = this.loadSharedFriends();
                    this.updateFriendList();
                }
            });

            // 监听来自 iframe 的消息 (传讯内部修改数据后会发消息)
            window.addEventListener('message', (e) => {
                // if (!_isAllowedMessageOrigin(e.origin)) return; // Iframe 内部不需要此检查，或者需要 parent origin
                if (e.data && e.data.type === 'wechatAppDataChanged') {
                    this.friends = this.loadSharedFriends();
                    this.updateFriendList();
                    
                    // 如果当前正打开某个好友的档案，同步更新详情
                    if (this.currentFriend) {
                        const updatedFriend = this.friends.find(f => f.id === this.currentFriend.id);
                        if (updatedFriend) {
                            console.log('[ArchivesApp] 检测到当前打开的档案数据已更新，正在同步渲染...');
                            this.currentFriend = updatedFriend;
                            this.renderDetail(updatedFriend);
                            // 同时刷新统计数据
                            this.requestChatStats(updatedFriend.id);
                        }
                    }
                } else if (e.data && e.data.type === 'chatStatsResponse') {
                    this.handleChatStatsResponse(e.data);
                }
            });

            return this;
        }

        handleChatStatsResponse(data) {
            const { contactId, stats } = data;
            console.log(`[ArchivesApp] 收到好友 ${contactId} 的统计数据:`, stats);
            
            // 查找对应的元素并更新
            const totalMessagesEl = document.getElementById('stat-total-messages');
            const totalWordsEl = document.getElementById('stat-total-words');
            const mostActiveHourEl = document.getElementById('stat-active-hour');
            const sentMessagesEl = document.getElementById('stat-sent-messages');

            if (totalMessagesEl) totalMessagesEl.textContent = stats.totalMessages;
            if (totalWordsEl) totalWordsEl.textContent = stats.totalWords.toLocaleString();
            if (mostActiveHourEl) mostActiveHourEl.textContent = stats.mostActiveHour;
            if (sentMessagesEl) sentMessagesEl.textContent = stats.sentMessages;
        }

        requestChatStats(contactId) {
            // Iframe 模式下，无法直接查询兄弟 iframe，需要请求父窗口转发
            if (window.parent) {
                window.parent.postMessage({
                    type: 'PROXY_REQUEST',
                    targetApp: 'chuanXun',
                    action: 'getChatStats',
                    payload: { contactId }
                }, '*');
            }
        }

        render() {
            // 渲染好友列表
            this.updateFriendList();
        }

        // 打开档案应用 (Modified for Iframe)
        openArchivesApp(iconElement) {
            // Iframe 模式下，不需要计算位置动画，直接显示
            if (this.archivesAppContainer) {
                this.archivesAppContainer.classList.add('active');
                this.archivesAppContainer.style.display = 'flex'; // Ensure visible
            }
            
            // 更新列表
            this.updateFriendList();

            // Notify parent if needed (handled by wrapper)
        }

        // 关闭档案应用 (Modified for Iframe)
        closeArchivesApp() {
            // Notify parent to close this iframe
            if (window.parent) {
                window.parent.postMessage({ type: 'CLOSE_APP', appId: 'archives' }, '*');
            }
        }

        // 打开设置
        openSettings() {
            const friend = this.currentFriend;
            if (!friend) {
                if (window.showAppToast) window.showAppToast('请先打开一个档案', 'info');
                return;
            }

            // 创建设置面板内容
            const menuItems = [
                {
                    icon: 'fa-file-image',
                    text: '生成报告 (长图)',
                    onClick: () => this.generateReportImage(friend)
                },
                {
                    icon: 'fa-file-export',
                    text: '导出角色 (TXT)',
                    onClick: () => this.exportCharacterTxt(friend)
                }
            ];

            // 检查是否已有面板
            let panel = document.getElementById('archivesSettingsPanel');
            if (panel) panel.remove();

            panel = document.createElement('div');
            panel.id = 'archivesSettingsPanel';
            panel.style.cssText = `
                position: absolute;
                top: 55px;
                right: 15px;
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                z-index: 1000;
                overflow: hidden;
                width: 180px;
                animation: slideDown 0.2s ease-out;
            `;

            panel.innerHTML = menuItems.map(item => `
                <div class="archives-settings-item" style="
                    padding: 12px 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    border-bottom: 1px solid #f0f0f0;
                    transition: background 0.2s;
                ">
                    <i class="fas ${item.icon}" style="color: #6a6a6a; width: 20px;"></i>
                    <span style="font-size: 14px; color: #333;">${item.text}</span>
                </div>
            `).join('');

            this.archivesAppContainer.appendChild(panel);

            // 添加点击外部关闭
            const closePanel = (e) => {
                if (!panel.contains(e.target) && !e.target.closest('.phone-app-settings-btn')) {
                    panel.remove();
                    document.removeEventListener('mousedown', closePanel);
                }
            };
            document.addEventListener('mousedown', closePanel);

            // 绑定点击事件
            panel.querySelectorAll('.archives-settings-item').forEach((el, index) => {
                el.onclick = () => {
                    menuItems[index].onClick();
                    panel.remove();
                    document.removeEventListener('mousedown', closePanel);
                };
                el.onmouseenter = () => el.style.background = '#f5f5f5';
                el.onmouseleave = () => el.style.background = '#fff';
            });
        }

        async generateReportImage(friend) {
            if (window.showAppToast) window.showAppToast('正在生成报告，请稍候...', 'info');
            
            try {
                const pagesWrapper = this.archivesAppContent.querySelector('.archives-detail-pages-wrapper');
                if (!pagesWrapper) throw new Error('未找到内容容器');

                // 创建一个临时容器来平铺所有页面
                const tempContainer = document.createElement('div');
                tempContainer.style.cssText = `
                    position: absolute;
                    left: -9999px;
                    top: 0;
                    width: 360px; /* 匹配手机视图宽度 */
                    background: #f1f3f4;
                `;
                document.body.appendChild(tempContainer);

                // 克隆所有页面并移除 hidden 类
                const pages = pagesWrapper.querySelectorAll('.archives-detail-page');
                for (let page of pages) {
                    const clone = page.cloneNode(true);
                    clone.classList.remove('hidden');
                    clone.style.display = 'block';
                    clone.style.marginBottom = '20px'; // 页面间距
                    
                    // 处理克隆后的 Canvas 或特殊元素（如果有）
                    // 这里主要是处理头像
                    const avatars = clone.querySelectorAll('[data-has-custom-avatar="true"]');
                    for (let avatar of avatars) {
                        const originalId = avatar.id;
                        const originalAvatar = pagesWrapper.querySelector(`#${originalId}`);
                        if (originalAvatar && originalAvatar.style.backgroundImage) {
                            avatar.style.backgroundImage = originalAvatar.style.backgroundImage;
                            avatar.textContent = '';
                        }
                    }

                    tempContainer.appendChild(clone);
                }

                // 按需加载 html2canvas 后截取
                const html2canvasFn = await loadHtml2Canvas();
                const canvas = await html2canvasFn(tempContainer, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#f1f3f4',
                    scale: 2 // 提高清晰度
                });

                // 导出图片
                const link = document.createElement('a');
                link.download = `档案报告_${friend.name}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                document.body.removeChild(tempContainer);
                if (window.showAppToast) window.showAppToast('报告生成成功！', 'success');
            } catch (e) {
                console.error('生成报告失败:', e);
                if (window.showAppToast) window.showAppToast('报告生成失败', 'error');
            }
        }

        exportCharacterTxt(friend) {
            if (window.showAppToast) window.showAppToast('正在准备角色数据...', 'info');

            const sections = [
                `【基础信息】`,
                `姓名：${friend.name}`,
                `性别：${friend.gender || '保密'}`,
                `年龄：${friend.age || '???'}${friend.age ? ' 岁' : ''}`,
                `背景：${friend.intro || '暂无介绍'}`,
                ``,
                `【角色人设】`,
                `${friend.persona || '暂无详细人设'}`,
                ``,
                `【历史总结】`,
                friend.summaryItems && friend.summaryItems.length > 0 
                    ? friend.summaryItems.map(item => `[${new Date(item.time).toLocaleString()}] ${item.text}`).join('\n')
                    : '暂无历史总结记录'
            ];

            const content = sections.join('\n');
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const blobUrlService = window.Core && window.Core.BlobUrlService ? window.Core.BlobUrlService : null;
            const url = blobUrlService ? blobUrlService.createObjectUrl(blob) : URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.download = `角色档案_${friend.name}.txt`;
            link.href = url;
            link.click();
            
            if (blobUrlService) blobUrlService.scheduleRevoke(url, 10000);
            else setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 10000);
            if (window.showAppToast) window.showAppToast('角色导出成功！', 'success');
        }

        // 打开特定好友的详细档案
        openFriendArchive(friendId) {
            const friend = this.friends.find(f => f.id === friendId);
            if (!friend) return;
            
            this.currentFriend = friend;

            // 渲染详情视图
            this.renderDetail(friend);

            // 请求统计数据
            this.requestChatStats(friend.id);

            // 更新 Header 标题
            const titleEl = this.archivesAppContainer.querySelector('.phone-app-title');
            if (titleEl) {
                titleEl.textContent = `FILE: ${friend.name.toUpperCase()}`;
                titleEl.style.fontSize = '14px';
            }

            // 更新返回按钮行为
            const backBtn = this.archivesAppContainer.querySelector('.phone-app-back-btn');
            if (backBtn) {
                backBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.showList();
                };
            }
        }

        // 返回列表视图
        showList() {
            this.updateFriendList();

            // 恢复 Header 标题
            const titleEl = this.archivesAppContainer.querySelector('.phone-app-title');
            if (titleEl) {
                titleEl.textContent = 'PERSONNEL FILES';
                titleEl.style.fontSize = '';
            }

            // 恢复返回按钮行为
            const backBtn = this.archivesAppContainer.querySelector('.phone-app-back-btn');
            if (backBtn) {
                backBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.mainApp) window.mainApp.closeCurrentApp();
                    else this.closeArchivesApp();
                };
            }
        }

        // 渲染详情内容
        renderDetail(friend) {
            console.log('[ArchivesApp] 正在渲染详情:', friend.name, friend);
            const avatarColor = this.getAvatarColor(friend);
            const hasCustomAvatar = friend.avatarImage && friend.avatarImage.startsWith('idb:');
            const avatarId = hasCustomAvatar ? friend.avatarImage.replace('idb:', '') : '';
            
            // 模拟一些档案字段
            let regDate = '2026/01/19';
            if (friend.addedTime) {
                const date = new Date(friend.addedTime);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                regDate = `${y}/${m}/${d}`;
            }
            const status = 'ACTIVE / 已激活';
            const clearance = 'LEVEL 1 / 公开';
            const age = friend.age || '???';

            const sharedMetaHTML = `
                <div class="archives-detail-header-right">
                    <div class="archives-detail-name-row">
                        <div class="archives-detail-name">${friend.name}</div>
                    </div>
                    <div class="archives-detail-meta-row">
                        <div class="archives-detail-meta-item">
                            <div class="archives-detail-meta-label">GENDER</div>
                            <div class="archives-detail-meta-value">${friend.gender || '???'}</div>
                        </div>
                        <div class="archives-detail-meta-item">
                            <div class="archives-detail-meta-label">AGE</div>
                            <div class="archives-detail-meta-value">${age}${age === '???' ? '' : ' 岁'}</div>
                        </div>
                        <div class="archives-detail-meta-item">
                            <div class="archives-detail-meta-label">REF NO</div>
                            <div class="archives-detail-meta-value" style="font-family: monospace; font-size: 11px;">${String(friend.id).substring(0, 12).toUpperCase()}</div>
                        </div>
                    </div>
                </div>
            `;

            const sideInfoHTML = (suffix = '') => `
                <div class="archives-detail-side-container">
                    <div class="archives-detail-side-info">
                        <div class="archives-detail-side-item">
                            <div class="archives-detail-side-label">STATUS</div>
                            <div class="archives-detail-side-value" style="color: #8faadc;">${status}</div>
                        </div>
                        <div class="archives-detail-side-item">
                            <div class="archives-detail-side-label">REG DATE</div>
                            <div class="archives-detail-side-value">${regDate}</div>
                        </div>
                        <div class="archives-detail-side-item">
                            <div class="archives-detail-side-label">CLEARANCE</div>
                            <div class="archives-detail-side-value">${clearance}</div>
                        </div>
                    </div>
                    <div class="archives-detail-side-stack" id="detailSideStack${suffix}" data-friend-id="${friend.id}">
                        <div class="archives-detail-side-stack-bottom"></div>
                        <div class="archives-detail-side-stack-top" id="detailSideStackTop${suffix}">
                            <i class="fas fa-image"></i>
                        </div>
                    </div>
                </div>
            `;

            const bottomTagsHTML = `
                <div class="archives-detail-bottom-tags">
                    <div class="archives-detail-bottom-tag">
                        <span class="tag-label">STATUS</span>
                        <span class="tag-value" style="color: #8faadc;">${status}</span>
                    </div>
                    <div class="archives-detail-bottom-tag">
                        <span class="tag-label">REG DATE</span>
                        <span class="tag-value">${regDate}</span>
                    </div>
                    <div class="archives-detail-bottom-tag">
                        <span class="tag-label">CLEARANCE</span>
                        <span class="tag-value">${clearance}</span>
                    </div>
                </div>
            `;

            this.archivesAppContent.innerHTML = `
                <div class="archives-detail-view">
                    <div class="archives-detail-pages-wrapper">
                        <!-- 第一页：首页 (封面) -->
                        <div class="archives-detail-page archives-detail-page-front" id="detailPage1">
                            <div class="archives-detail-paper" style="padding: 0; overflow: hidden;">
                                <div class="archives-detail-cover-avatar-container" id="coverAvatarBg" style="background-color: ${hasCustomAvatar ? '#eee' : avatarColor}" data-has-custom-avatar="${hasCustomAvatar}" data-avatar-id="${avatarId}">
                                    <div class="archives-detail-cover-mask"></div>
                                    
                                    <div class="archives-detail-cover-main-content" style="position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; flex: 1; padding: 15px;">
                                        <div style="flex: 1.2;"></div> <!-- 顶部间距，将内容推向中部 -->

                                        <div class="archives-detail-header" style="margin-bottom: 10px;">
                                            <div class="archives-detail-header-left">
                                                <div class="archives-detail-cover-card" id="coverAvatarCard" style="background-color: ${hasCustomAvatar ? '#fff' : avatarColor}" data-has-custom-avatar="${hasCustomAvatar}" data-avatar-id="${avatarId}">
                                                    ${!hasCustomAvatar ? friend.avatarText : ''}
                                                </div>
                                            </div>
                                            ${sharedMetaHTML}
                                        </div>

                                        ${bottomTagsHTML}

                                        <div style="flex: 1;"></div> <!-- 底部间距 -->

                                        <button class="archives-detail-flip-btn" style="position: relative; align-self: flex-end; margin: 0;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(2)">
                                            <i class="fas fa-book-open"></i> VIEW DETAILS
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 第二页：背景介绍 -->
                        <div class="archives-detail-page archives-detail-page-back hidden" id="detailPage2">
                            <div class="archives-detail-paper">
                                <div class="archives-detail-header">
                                    <div class="archives-detail-header-left">
                                        <div class="archives-detail-avatar" id="detailAvatar2" style="background-color: ${avatarColor}" data-has-custom-avatar="${hasCustomAvatar}" data-avatar-id="${avatarId}">
                                            ${!hasCustomAvatar ? friend.avatarText : ''}
                                        </div>
                                    </div>
                                    ${sharedMetaHTML}
                                </div>
                                <div class="archives-detail-section">
                                    <div class="archives-detail-section-title">BACKGROUND / 个人介绍</div>
                                    <div class="archives-detail-intro-box">
                                        ${friend.intro || '该人员尚未录入背景信息。'}
                                    </div>
                                </div>
                                ${sideInfoHTML('2')}

                                <div class="archives-detail-signature">
                                    <div class="archives-detail-signature-label">CHIEF ARCHIVIST</div>
                                    <div class="archives-detail-signature-line">${friend.name}</div>
                                </div>

                                <div class="archives-detail-stamp" style="border-color: #d5a6a6; color: #d5a6a6;">FILE<br>VERIFIED</div>

                                <div style="flex: 1;"></div>

                                <div style="margin-top: 20px; text-align: center; display: flex; flex-direction: row; justify-content: space-between; gap: 10px; width: 100%;">
                                    <button class="archives-detail-flip-btn" style="position: static; flex: 1;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(1)">
                                        <i class="fas fa-arrow-left"></i> COVER
                                    </button>
                                    <button class="archives-detail-flip-btn" style="position: static; flex: 1;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(3)">
                                        NEXT PAGE <i class="fas fa-arrow-right"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 第三页：好友人设 -->
                        <div class="archives-detail-page archives-detail-page-back hidden" id="detailPage3">
                            <div class="archives-detail-paper">
                                <div class="archives-detail-header">
                                    <div class="archives-detail-header-left">
                                        <div class="archives-detail-avatar" id="detailAvatar3" style="background-color: ${avatarColor}" data-has-custom-avatar="${hasCustomAvatar}" data-avatar-id="${avatarId}">
                                            ${!hasCustomAvatar ? friend.avatarText : ''}
                                        </div>
                                    </div>
                                    ${sharedMetaHTML}
                                </div>

                                <div class="archives-detail-section">
                                    <div class="archives-detail-section-title">PERSONALITY / 好友人设</div>
                                    <div class="archives-detail-intro-box" style="white-space: pre-wrap; font-family: inherit; line-height: 1.6; color: #444;">${friend.persona || '该人员尚未配置详细人设。'}</div>
                                </div>

                                <div class="archives-detail-signature">
                                    <div class="archives-detail-signature-label">FIELD AGENT</div>
                                    <div class="archives-detail-signature-line">${friend.name}</div>
                                </div>

                                <div class="archives-detail-stamp" style="border-color: #a8dadc; color: #a8dadc;">SECRET<br>FILE</div>

                                <div style="flex: 1;"></div>

                                <div style="margin-top: 20px; text-align: center; display: flex; flex-direction: row; justify-content: space-between; gap: 10px; width: 100%;">
                                    <button class="archives-detail-flip-btn" style="position: static; flex: 1;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(2)">
                                        <i class="fas fa-arrow-left"></i> PREVIOUS PAGE
                                    </button>
                                    <button class="archives-detail-flip-btn" style="position: static; flex: 1;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(4)">
                                        NEXT PAGE <i class="fas fa-arrow-right"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 第四页：信息统计 -->
                        <div class="archives-detail-page archives-detail-page-back hidden" id="detailPage4">
                            <div class="archives-detail-paper">
                                <div class="archives-detail-header">
                                    <div class="archives-detail-header-left">
                                        <div class="archives-detail-avatar" id="detailAvatar4" style="background-color: ${avatarColor}" data-has-custom-avatar="${hasCustomAvatar}" data-avatar-id="${avatarId}">
                                            ${!hasCustomAvatar ? friend.avatarText : ''}
                                        </div>
                                    </div>
                                    ${sharedMetaHTML}
                                </div>

                                <div class="archives-detail-section">
                                    <div class="archives-detail-section-title">COMMUNICATION / 传讯统计</div>
                                    <div class="archives-detail-stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                        <div class="archives-detail-stat-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #999; margin-bottom: 5px;">TOTAL MESSAGES</div>
                                            <div id="stat-total-messages" style="font-size: 18px; font-weight: bold; color: #555;">...</div>
                                        </div>
                                        <div class="archives-detail-stat-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #999; margin-bottom: 5px;">TOTAL WORDS</div>
                                            <div id="stat-total-words" style="font-size: 18px; font-weight: bold; color: #555;">...</div>
                                        </div>
                                        <div class="archives-detail-stat-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #999; margin-bottom: 5px;">MOST ACTIVE</div>
                                            <div id="stat-active-hour" style="font-size: 18px; font-weight: bold; color: #555;">...</div>
                                        </div>
                                        <div class="archives-detail-stat-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; text-align: center;">
                                            <div style="font-size: 10px; color: #999; margin-bottom: 5px;">SENT BY ME</div>
                                            <div id="stat-sent-messages" style="font-size: 18px; font-weight: bold; color: #555;">...</div>
                                        </div>
                                    </div>
                                </div>

                                <div class="archives-detail-section">
                                    <div class="archives-detail-section-title">LOGS / 系统日志</div>
                                    <div class="archives-detail-stats-container" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; max-height: 180px; overflow-y: auto;">
                                        ${friend.summaryItems && friend.summaryItems.length > 0 ? 
                                            friend.summaryItems.map(item => `
                                                <div class="archives-detail-stat-item" style="border-left: 3px solid #a3b1c6; padding-left: 10px; margin-bottom: 5px;">
                                                    <div style="font-size: 10px; color: #999; font-family: monospace; margin-bottom: 3px;">
                                                        TIMESTAMP: ${new Date(item.time).toLocaleString('zh-CN', {hour12: false})}
                                                    </div>
                                                    <div style="font-size: 13px; color: #555; line-height: 1.4;">${item.text}</div>
                                                </div>
                                            `).join('') : 
                                            '<div style="text-align: center; color: #999; padding: 20px 0; font-style: italic;">暂无系统日志记录。</div>'
                                        }
                                    </div>
                                </div>

                                <div class="archives-detail-signature">
                                    <div class="archives-detail-signature-label">DATA ANALYST</div>
                                    <div class="archives-detail-signature-line">${friend.name}</div>
                                </div>

                                <div class="archives-detail-stamp" style="border-color: #d4a373; color: #d4a373;">SYSTEM<br>LOGGED</div>

                                <div style="flex: 1;"></div>

                                <div style="margin-top: 20px; text-align: center; display: flex; flex-direction: row; justify-content: center; width: 100%;">
                                    <button class="archives-detail-flip-btn" style="position: static; width: auto; min-width: 150px;" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.flipPage(3)">
                                        <i class="fas fa-arrow-left"></i> PREVIOUS PAGE
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // 稍微延迟确保 DOM 渲染完成
            setTimeout(() => {
                this.loadDetailAvatar();
            }, 50);
        }

        // 翻页逻辑
        flipPage(pageNum) {
            const page1 = document.getElementById('detailPage1');
            const page2 = document.getElementById('detailPage2');
            const page3 = document.getElementById('detailPage3');
            const page4 = document.getElementById('detailPage4');
            const view = this.archivesAppContainer.querySelector('.archives-detail-view');
            
            // 先隐藏所有页面
            [page1, page2, page3, page4].forEach(p => {
                if (p) p.classList.add('hidden');
            });

            // 显示目标页面
            if (pageNum === 1 && page1) {
                page1.classList.remove('hidden');
            } else if (pageNum === 2 && page2) {
                page2.classList.remove('hidden');
            } else if (pageNum === 3 && page3) {
                page3.classList.remove('hidden');
            } else if (pageNum === 4 && page4) {
                page4.classList.remove('hidden');
            }

            if (view) view.scrollTop = 0;
        }

        async loadDetailAvatar() {
            console.log('[ArchivesApp] 开始加载详情头像及侧边叠放图...');
            if (!window.ImageStorageDB) {
                console.error('[ArchivesApp] ImageStorageDB 不存在');
                return;
            }
            
            const avatars = [
                document.getElementById('detailAvatar2'),
                document.getElementById('detailAvatar3'),
                document.getElementById('detailAvatar4'),
                document.getElementById('coverAvatarBg'),
                document.getElementById('coverAvatarCard')
            ];

            console.log('[ArchivesApp] 待处理头像元素数量:', avatars.filter(a => a !== null).length);

            for (const avatarEl of avatars) {
                if (!avatarEl) continue;
                
                const hasCustom = avatarEl.dataset.hasCustomAvatar === 'true';
                const avatarId = avatarEl.dataset.avatarId;
                
                if (hasCustom && avatarId) {
                    try {
                        const stored = await window.ImageStorageDB.get(avatarId);
                        if (stored) {
                            let src = '';
                            if (typeof stored === 'string') {
                                src = stored;
                            } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                                src = URL.createObjectURL(stored);
                            }
                            
                            if (src) {
                                avatarEl.style.background = `url(${src}) center/cover no-repeat`;
                                avatarEl.style.backgroundColor = 'transparent';
                                
                                if (avatarEl.id !== 'coverAvatarBg') {
                                    avatarEl.textContent = '';
                                }
                                
                                if (avatarEl.id === 'coverAvatarCard') {
                                    avatarEl.style.display = 'flex';
                                    avatarEl.style.zIndex = '10';
                                    avatarEl.style.border = '6px solid #fff';
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[ArchivesApp] 加载详情头像异常:', avatarId, e);
                    }
                }
            }

            // 加载侧边叠放图
            const loadSideStack = async (suffix) => {
                const sideStackTop = document.getElementById(`detailSideStackTop${suffix}`);
                const sideStack = document.getElementById(`detailSideStack${suffix}`);
                if (!sideStack || !sideStackTop) return;

                const friendId = sideStack.getAttribute('data-friend-id');
                let photoData = null;

                try {
                    // 1. 尝试从相册获取最新图片
                    const albumsRaw = localStorage.getItem(`photo_albums_${friendId}`);
                    if (albumsRaw) {
                        const albums = JSON.parse(albumsRaw);
                        let latestPhoto = null;
                        if (Array.isArray(albums)) {
                            const allPhotos = albums.flatMap(a => a.photos || []);
                            if (allPhotos.length > 0) {
                                latestPhoto = allPhotos.reduce((prev, current) => 
                                    (prev.id > current.id) ? prev : current
                                );
                            }
                        }

                        if (latestPhoto && latestPhoto.id) {
                            const photoId = `photo_${latestPhoto.id}`;
                            photoData = await window.ImageStorageDB.get(photoId);
                        }
                    }

                    // 2. 如果没有相册图片，拉取角色头像
                    if (!photoData) {
                        const avatarEl = document.getElementById(`detailAvatar${suffix}`);
                        const avatarId = avatarEl ? avatarEl.getAttribute('data-avatar-id') : null;
                        const hasCustom = avatarEl ? avatarEl.getAttribute('data-has-custom-avatar') === 'true' : false;

                        if (hasCustom && avatarId) {
                            photoData = await window.ImageStorageDB.get(avatarId);
                        } else if (avatarEl) {
                            sideStackTop.style.backgroundColor = avatarEl.style.backgroundColor;
                            sideStackTop.innerHTML = avatarEl.textContent;
                        }
                    }

                    // 3. 应用图片
                    if (photoData) {
                        let src = '';
                        if (typeof photoData === 'string') {
                            src = photoData;
                        } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                            src = URL.createObjectURL(photoData);
                        }

                        if (src) {
                            sideStackTop.style.background = `url(${src}) center/cover no-repeat`;
                            sideStackTop.style.backgroundColor = 'transparent';
                            sideStackTop.textContent = '';
                        }
                    }
                } catch (e) {
                    console.error(`[ArchivesApp] 加载侧边叠放图失败 (suffix: ${suffix}):`, e);
                }
            };

            await Promise.all([loadSideStack('2')]);
        }

        // 打开与特定好友的聊天
        openChatWithFriend(contactId) {
            // Iframe 模式下，请求 Shell 处理
            if (window.parent) {
                window.parent.postMessage({
                    type: 'PROXY_REQUEST',
                    targetApp: 'chuanXun',
                    action: 'openContactChat',
                    payload: { contactId }
                }, '*');
            }
        }

        // 更新好友列表（以档案卡片形式）
        updateFriendList() {
            if (this.friends.length === 0) {
                this.archivesAppContent.innerHTML = `
                    <div class="archives-app-empty-state">
                        <i class="fas fa-id-card"></i>
                        <h3>暂无档案信息</h3>
                        <p>请先在“传讯”应用中添加好友</p>
                    </div>
                `;
                return;
            }

            let friendsHTML = `
                <div class="archives-app-stats">
                    共收录 ${this.friends.length} 份人物档案
                </div>
                <div class="archives-app-cards-grid">
            `;

            this.friends.forEach(friend => {
                const avatarColor = this.getAvatarColor(friend);
                const hasCustomAvatar = friend.avatarImage && friend.avatarImage.startsWith('idb:');
                const avatarId = hasCustomAvatar ? friend.avatarImage.replace('idb:', '') : '';
                
                // 性别图标
                let genderIcon = '<i class="fas fa-genderless"></i>';
                if (friend.gender === '男') genderIcon = '<i class="fas fa-mars" style="color: #4a90e2;"></i>';
                else if (friend.gender === '女') genderIcon = '<i class="fas fa-venus" style="color: #e91e63;"></i>';

                friendsHTML += `
                    <div class="archives-app-card" data-friend-id="${friend.id}" data-avatar-id="${avatarId}" onclick="if(window.mainApp && window.mainApp.archivesAppModule) window.mainApp.archivesAppModule.openFriendArchive('${friend.id}')">
                        <div class="archives-app-card-header">
                            <div class="archives-app-card-avatar" style="background-color: ${avatarColor}" data-has-custom-avatar="${hasCustomAvatar}">
                                ${friend.avatarText}
                            </div>
                            <div class="archives-app-card-main-info">
                                <div class="archives-app-card-name">
                                    ${friend.name}
                                    <span class="archives-app-card-gender">${genderIcon}</span>
                                </div>
                                <div class="archives-app-card-id">FILE NO. ${String(friend.id).substring(0, 8).toUpperCase()}</div>
                            </div>
                        </div>
                        <div class="archives-app-card-body">
                            <div class="archives-app-card-label">DESCRIPTION / 个人介绍</div>
                            <div class="archives-app-card-intro">${friend.intro}</div>
                        </div>
                    </div>
                `;
            });

            friendsHTML += `</div>`;
            this.archivesAppContent.innerHTML = friendsHTML;

            // 加载自定义头像
            this.loadCustomAvatars();
        }

        getAvatarColor(friend) {
            const colorMap = {
                'bg-mauve': '#c9b1be',
                'bg-dusty-rose': '#d8a8a8',
                'bg-sage': '#b1c2a9',
                'bg-stone': '#a8a8a8',
                'bg-clay': '#b8a38d',
                'bg-slate': '#8a9ba3',
                'bg-moss': '#8a9d8a',
                'bg-sand': '#d9c7b4'
            };
            const friendObj = friend && typeof friend === 'object' ? friend : { id: friend };
            const colorKey = friendObj && friendObj.avatarColor ? String(friendObj.avatarColor) : '';
            if (colorKey && colorMap[colorKey]) return colorMap[colorKey];
            if (colorKey && /^#/.test(colorKey)) return colorKey;
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471'];
            let hash = 0;
            const idStr = String(friendObj && friendObj.id != null ? friendObj.id : colorKey || '');
            for (let i = 0; i < idStr.length; i++) {
                hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
            }
            return colors[Math.abs(hash) % colors.length];
        }

        async loadCustomAvatars() {
            if (!window.ImageStorageDB) return;
            const avatarElements = document.querySelectorAll('.archives-app-card-avatar[data-has-custom-avatar="true"]');
            for (const avatarEl of avatarElements) {
                const friendItem = avatarEl.closest('.archives-app-card');
                const avatarId = friendItem && friendItem.dataset ? friendItem.dataset.avatarId : '';
                if (avatarId) {
                    try {
                        const stored = await window.ImageStorageDB.get(avatarId);
                        if (stored) {
                            let src = '';
                            if (typeof stored === 'string') {
                                src = stored;
                            } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                                src = URL.createObjectURL(stored);
                            }
                            if (src) {
                                avatarEl.style.backgroundImage = `url(${src})`;
                                avatarEl.style.backgroundSize = 'cover';
                                avatarEl.style.backgroundPosition = 'center';
                                avatarEl.textContent = '';
                            }
                        }
                    } catch (e) {
                        console.error('[ArchivesApp] 加载头像失败:', avatarId, e);
                    }
                }
            }
        }
    }

    // === 初始化逻辑 ===
    // 兼容层：Mock mainApp 用于 iframe 环境
    if (!window.mainApp) {
        window.mainApp = {
            onAppOpen: () => {},
            onAppClose: () => {
                window.parent.postMessage({ type: 'CLOSE_APP', appId: 'archives' }, '*');
            },
            closeCurrentApp: () => {
                window.parent.postMessage({ type: 'CLOSE_APP', appId: 'archives' }, '*');
            },
            archivesAppModule: null
        };
    }

    // Helper functions global scope
    window.showAppToast = (msg, type) => {
        // Fallback simple toast
        const toast = document.getElementById('appToast') || document.createElement('div');
        toast.id = 'appToast';
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: #fff; padding: 10px 20px;
            border-radius: 20px; z-index: var(--z-toast, 2300); display: none;
        `;
        if (!document.body.contains(toast)) document.body.appendChild(toast);
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 2000);
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.app = new ArchivesAppModule();
        window.mainApp.archivesAppModule = window.app;
        window.app.init();

        try {
            window.parent.postMessage({ type: 'app_ready', appId: 'archives' }, '*');
        } catch (e) {
            console.error('Failed to send app_ready message:', e);
        }

        // 在 Iframe 中，加载即视为打开
        window.app.openArchivesApp();
    });

})();
