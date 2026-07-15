(function(window) {
    'use strict';

    window.Core = window.Core || {};

    /**
     * ModalWrapper - 轻量级浮窗包装工具
     * 
     * 用于包装现有浮窗元素，只添加基础行为（键盘适配、高度固定、输入框滚动）
     * 不修改 HTML 结构和 CSS 样式，保持各应用原有视觉风格
     */
    Core.ModalWrapper = {
        /**
         * 包装现有浮窗元素
         * @param {HTMLElement|string} element - 要包装的浮窗元素或选择器
         * @param {Object} options - 配置选项
         * @returns {Core.Modal} Modal 实例
         */
        wrap: function(element, options = {}) {
            // 解析元素
            let el = element;
            if (typeof element === 'string') {
                el = document.querySelector(element);
            }
            
            if (!el || !el.nodeType) {
                console.warn('ModalWrapper.wrap: 无效的元素', element);
                return null;
            }
            
            // 如果已经包装过，返回现有实例
            if (el._modalInstance) {
                return el._modalInstance;
            }
            
            // 自动检测原有显示方式
            const detectedMethods = this._detectShowHideMethods(el);
            
            // 合并配置
            const config = {
                useExisting: true,
                existingElement: el,
                preserveStyles: true,
                // 使用检测到的显示方式，或使用传入的配置
                showMethod: options.showMethod || detectedMethods.showMethod,
                showValue: options.showValue || detectedMethods.showValue,
                hideMethod: options.hideMethod || detectedMethods.hideMethod,
                hideValue: options.hideValue || detectedMethods.hideValue,
                // 基础功能开关（默认全部启用）
                enableKeyboardHandling: options.enableKeyboardHandling !== false,
                enableHeightFix: options.enableHeightFix !== false,
                enableInputScroll: options.enableInputScroll !== false,
                // 其他 Modal 选项
                onOpen: options.onOpen || null,
                onClose: options.onClose || null,
                onBeforeOpen: options.onBeforeOpen || null,
                onBeforeClose: options.onBeforeClose || null,
                closeOnOverlayClick: options.closeOnOverlayClick !== false,
                closeOnEscape: options.closeOnEscape !== false
            };
            
            // 创建 Modal 实例
            const modal = new Core.Modal(config);
            
            // 保存引用，避免重复包装
            el._modalInstance = modal;
            
            return modal;
        },
        
        /**
         * 自动检测元素的显示/隐藏方式
         * @param {HTMLElement} element - 要检测的元素
         * @returns {Object} 检测结果
         */
        _detectShowHideMethods: function(element) {
            const computedStyle = window.getComputedStyle(element);
            const hasActiveClass = element.classList.contains('active');
            const isDisplayNone = computedStyle.display === 'none';
            const isDisplayFlex = computedStyle.display === 'flex';
            const isDisplayBlock = computedStyle.display === 'block';
            
            // 检测显示方式
            let showMethod, showValue, hideMethod, hideValue;
            
            // 优先检测 classList 方式
            if (hasActiveClass) {
                // 使用 active 类
                showMethod = 'classList.add';
                showValue = 'active';
                hideMethod = 'classList.remove';
                hideValue = 'active';
            } else if (element.classList.length > 0) {
                // 检查是否有其他常见的显示类
                const commonShowClasses = ['show', 'visible', 'open', 'display'];
                for (const cls of commonShowClasses) {
                    if (element.classList.contains(cls)) {
                        showMethod = 'classList.add';
                        showValue = cls;
                        hideMethod = 'classList.remove';
                        hideValue = cls;
                        break;
                    }
                }
            }
            
            // 如果没有检测到 classList 方式，使用 style.display
            if (!showMethod) {
                if (isDisplayFlex) {
                    showMethod = 'style.display';
                    showValue = 'flex';
                    hideMethod = 'style.display';
                    hideValue = 'none';
                } else if (isDisplayBlock) {
                    showMethod = 'style.display';
                    showValue = 'block';
                    hideMethod = 'style.display';
                    hideValue = 'none';
                } else {
                    // 默认使用 flex（移动端常用）
                    showMethod = 'style.display';
                    showValue = 'flex';
                    hideMethod = 'style.display';
                    hideValue = 'none';
                }
            }
            
            return {
                showMethod: showMethod,
                showValue: showValue,
                hideMethod: hideMethod,
                hideValue: hideValue
            };
        },
        
        /**
         * 批量包装多个浮窗
         * @param {Array} elements - 元素数组或选择器数组
         * @param {Object} options - 通用配置选项
         * @returns {Array} Modal 实例数组
         */
        wrapAll: function(elements, options = {}) {
            const modals = [];
            for (let i = 0; i < elements.length; i++) {
                const modal = this.wrap(elements[i], options);
                if (modal) {
                    modals.push(modal);
                }
            }
            return modals;
        },
        
        /**
         * 获取已包装的 Modal 实例
         * @param {HTMLElement|string} element - 元素或选择器
         * @returns {Core.Modal|null} Modal 实例或 null
         */
        getInstance: function(element) {
            let el = element;
            if (typeof element === 'string') {
                el = document.querySelector(element);
            }
            
            if (!el || !el.nodeType) {
                return null;
            }
            
            return el._modalInstance || null;
        }
    };

})(window);
