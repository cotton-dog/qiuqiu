/**
 * iOS Safari 滑动问题诊断工具
 * 在浏览器控制台运行此脚本来检测潜在的滚动问题
 */

(function() {
    'use strict';
    
    const results = {
        errors: [],
        warnings: [],
        info: [],
        passed: []
    };
    
    // 检测是否为iOS设备
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    console.log('%c🔍 iOS滑动兼容性诊断工具', 'font-size: 16px; font-weight: bold; color: #007AFF;');
    console.log(`设备: ${isIOS ? 'iOS设备' : '非iOS设备'}`);
    console.log('-----------------------------------');
    
    // 1. 检查html/body高度链
    function checkHeightChain() {
        console.log('%c📏 检查高度链配置...', 'font-weight: bold;');
        
        const html = document.documentElement;
        const body = document.body;
        const htmlStyle = getComputedStyle(html);
        const bodyStyle = getComputedStyle(body);
        
        const htmlHeight = htmlStyle.height;
        const bodyHeight = bodyStyle.height;
        
        if (htmlHeight === '0px' || htmlHeight === 'auto') {
            results.warnings.push('html元素没有设置height: 100%');
        } else {
            results.passed.push(`html高度: ${htmlHeight}`);
        }
        
        if (bodyHeight === '0px' || bodyHeight === 'auto') {
            results.warnings.push('body元素没有设置height: 100%');
        } else {
            results.passed.push(`body高度: ${bodyHeight}`);
        }
        
        console.log(`  html高度: ${htmlHeight}`);
        console.log(`  body高度: ${bodyHeight}`);
    }
    
    // 2. 检查body overflow设置
    function checkBodyOverflow() {
        console.log('%c📦 检查body overflow设置...', 'font-weight: bold;');
        
        const bodyStyle = getComputedStyle(document.body);
        const overflowX = bodyStyle.overflowX;
        const overflowY = bodyStyle.overflowY;
        
        console.log(`  overflow-x: ${overflowX}`);
        console.log(`  overflow-y: ${overflowY}`);
        
        if (overflowY === 'hidden') {
            results.info.push('body overflow-y: hidden - 使用内部容器滚动模式');
        } else if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'visible') {
            results.info.push('body overflow-y: ' + overflowY + ' - body滚动模式');
        }
    }
    
    // 3. 检查滚动容器配置
    function checkScrollContainers() {
        console.log('%c📜 检查滚动容器配置...', 'font-weight: bold;');
        
        // 查找所有可能的滚动容器
        const selectors = [
            '.scroll-y', '.scroll-y-hidebar', '.scroll-x', '.scroll-x-hidebar',
            '.flex-scroll', '.main-content', '.app-scroll', '.letters-container',
            '.space-scroll', '.main', '[class*="scroll"]'
        ];
        
        const containers = document.querySelectorAll(selectors.join(','));
        console.log(`  找到 ${containers.length} 个潜在滚动容器`);
        
        let issues = 0;
        
        containers.forEach((el, index) => {
            const style = getComputedStyle(el);
            const problems = [];
            
            // 检查overflow
            if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') {
                problems.push(`overflow-y: ${style.overflowY} (应为auto/scroll)`);
            }
            
            // 检查-webkit-overflow-scrolling
            if (style.webkitOverflowScrolling !== 'touch') {
                problems.push('缺少 -webkit-overflow-scrolling: touch');
            }
            
            // 检查touch-action
            if (style.touchAction === 'none') {
                problems.push('touch-action: none 会阻止滚动');
            }
            
            // 检查flex子项的min-height
            const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
            if (parentStyle && (parentStyle.display === 'flex' || parentStyle.display === 'inline-flex')) {
                if (style.flex && style.minHeight !== '0px') {
                    problems.push('flex子项缺少 min-height: 0');
                }
            }
            
            // 检查高度
            if (style.height === '0px' && style.minHeight === '0px' && style.maxHeight === 'none') {
                problems.push('容器高度为0');
            }
            
            if (problems.length > 0) {
                issues++;
                const className = el.className || el.id || el.tagName;
                console.log(`  ❌ ${className.substring(0, 50)}:`);
                problems.forEach(p => {
                    console.log(`     - ${p}`);
                    results.errors.push(`${className}: ${p}`);
                });
            }
        });
        
        if (issues === 0) {
            results.passed.push('所有滚动容器配置正确');
            console.log('  ✅ 所有滚动容器配置正确');
        }
        
        return containers;
    }
    
    // 4. 检查touch-action设置
    function checkTouchAction() {
        console.log('%c👆 检查touch-action设置...', 'font-weight: bold;');
        
        const allElements = document.querySelectorAll('*');
        const problematicElements = [];
        
        allElements.forEach(el => {
            const style = getComputedStyle(el);
            if (style.touchAction === 'none') {
                const isScrollContainer = 
                    style.overflowY === 'auto' || 
                    style.overflowY === 'scroll' ||
                    el.classList.contains('scroll-y') ||
                    el.classList.contains('scroll-y-hidebar');
                
                if (isScrollContainer || el === document.body) {
                    problematicElements.push(el);
                }
            }
        });
        
        if (problematicElements.length > 0) {
            console.log(`  ⚠️ 发现 ${problematicElements.length} 个元素设置了 touch-action: none 可能影响滚动:`);
            problematicElements.forEach(el => {
                const id = el.className || el.id || el.tagName;
                console.log(`     - ${id.substring(0, 50)}`);
                results.warnings.push(`touch-action: none 在 ${id.substring(0, 30)}`);
            });
        } else {
            results.passed.push('无阻止滚动的touch-action设置');
            console.log('  ✅ 无阻止滚动的touch-action设置');
        }
    }
    
    // 5. 检查passive事件监听器
    function checkEventListeners() {
        console.log('%c🎧 检查触摸事件...', 'font-weight: bold;');
        console.log('  (此检查需要查看源代码，无法自动检测已注册的事件监听器)');
        results.info.push('建议手动检查touchmove事件中的preventDefault调用');
    }
    
    // 6. 检查position: fixed元素
    function checkFixedElements() {
        console.log('%c📌 检查fixed定位元素...', 'font-weight: bold;');
        
        const fixedElements = [];
        document.querySelectorAll('*').forEach(el => {
            if (getComputedStyle(el).position === 'fixed') {
                fixedElements.push(el);
            }
        });
        
        console.log(`  找到 ${fixedElements.length} 个fixed定位元素`);
        
        if (fixedElements.length > 0) {
            results.info.push(`${fixedElements.length} 个fixed元素，确保滚动容器有正确的padding`);
        }
    }
    
    // 7. 检查CSS变量
    function checkCSSVariables() {
        console.log('%c🎨 检查CSS变量...', 'font-weight: bold;');
        
        const style = getComputedStyle(document.documentElement);
        const vars = ['--safe-inset-top', '--safe-inset-bottom', '--app-height'];
        
        vars.forEach(v => {
            const value = style.getPropertyValue(v).trim();
            console.log(`  ${v}: ${value || '未定义'}`);
        });
    }
    
    // 8. 输出诊断报告
    function printReport() {
        console.log('\n%c📋 诊断报告', 'font-size: 14px; font-weight: bold; color: #007AFF;');
        console.log('===================================');
        
        if (results.errors.length > 0) {
            console.log('%c❌ 错误 (' + results.errors.length + ')', 'color: red; font-weight: bold;');
            results.errors.forEach(e => console.log('  - ' + e));
        }
        
        if (results.warnings.length > 0) {
            console.log('%c⚠️ 警告 (' + results.warnings.length + ')', 'color: orange; font-weight: bold;');
            results.warnings.forEach(w => console.log('  - ' + w));
        }
        
        if (results.info.length > 0) {
            console.log('%cℹ️ 信息', 'color: blue; font-weight: bold;');
            results.info.forEach(i => console.log('  - ' + i));
        }
        
        if (results.passed.length > 0) {
            console.log('%c✅ 通过 (' + results.passed.length + ')', 'color: green; font-weight: bold;');
            results.passed.forEach(p => console.log('  - ' + p));
        }
        
        console.log('\n%c🔧 修复建议', 'font-size: 14px; font-weight: bold; color: #007AFF;');
        console.log('===================================');
        console.log('1. 确保 html, body { height: 100% }');
        console.log('2. 滚动容器必须有:');
        console.log('   - overflow-y: auto');
        console.log('   - -webkit-overflow-scrolling: touch');
        console.log('   - overscroll-behavior-y: contain');
        console.log('   - touch-action: pan-y');
        console.log('3. flex子项滚动容器需要 min-height: 0');
        console.log('4. 避免在滚动容器上使用 touch-action: none');
        console.log('5. touchmove事件使用 { passive: true } 或避免 preventDefault()');
        
        return results;
    }
    
    // 运行所有检查
    checkHeightChain();
    checkBodyOverflow();
    checkScrollContainers();
    checkTouchAction();
    checkEventListeners();
    checkFixedElements();
    checkCSSVariables();
    
    return printReport();
})();
