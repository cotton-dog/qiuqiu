# 页面管理核心服务使用指南

## 概述

本项目提供了三个核心服务来统一管理事件监听器、定时器和页面生命周期：

- **EventManager** - 统一事件管理
- **TimerManager** - 统一定时器管理  
- **PageLifecycle** - 页面生命周期管理

## 特点

- ✅ **向后兼容**：不影响现有代码，原生 API 继续可用
- ✅ **可选使用**：各应用按需使用，不强制迁移
- ✅ **内存安全**：使用 WeakMap 避免内存泄漏
- ✅ **分组管理**：支持按页面/功能分组清理资源
- ✅ **调试支持**：提供调试 API 和开发模式

## 快速开始

### 1. EventManager - 事件管理

#### 基础用法

```javascript
// 方式1：直接使用（推荐）
const cleanup = window.Core.EventManager.on(btn, 'click', handler, { groupId: 'cart' });

// 方式2：链式API
window.Core.EventManager
  .group('cart')
  .on(btn, 'click', handler)
  .on(btn2, 'click', handler2);

// 方式3：批量注册
const cleanup = window.Core.EventManager.onGroup('cart', [
  [btn, 'click', handler1],
  [btn2, 'click', handler2]
]);
```

#### 清理事件

```javascript
// 移除单个事件
window.Core.EventManager.off(btn, 'click', handler);

// 移除分组的所有事件
window.Core.EventManager.offGroup('cart');

// 移除元素的所有事件
window.Core.EventManager.offTarget(btn);
```

### 2. TimerManager - 定时器管理

#### 基础用法

```javascript
// 方式1：直接使用（推荐）
const timerId = window.Core.TimerManager.setTimeout(() => {
  console.log('1秒后执行');
}, 1000, { groupId: 'cart' });

// 方式2：链式API
const timerGroup = window.Core.TimerManager.group('cart');
timerGroup.setTimeout(() => {}, 1000);
timerGroup.setInterval(() => {}, 2000);
timerGroup.clear(); // 清理该分组的所有定时器
```

#### 清理定时器

```javascript
// 清除单个定时器
window.Core.TimerManager.clearTimeout(timerId);
window.Core.TimerManager.clearInterval(timerId);

// 清除分组的所有定时器
window.Core.TimerManager.clearGroup('cart');
```

### 3. PageLifecycle - 页面生命周期

#### 注册页面

```javascript
window.Core.PageLifecycle.register('cart', {
  onShow: () => {
    console.log('购物车页面显示');
    // 初始化页面数据
  },
  onHide: () => {
    console.log('购物车页面隐藏');
    // 清理资源（自动清理事件和定时器）
  },
  onBeforeShow: async () => {
    // 显示前的准备工作
  },
  onBeforeHide: async () => {
    // 隐藏前的清理工作
  },
  autoCleanup: true // 默认 true，自动清理该页面的所有事件和定时器
});
```

#### 页面切换

```javascript
// 显示页面
await window.Core.PageLifecycle.show('cart');

// 隐藏页面
await window.Core.PageLifecycle.hide('cart');

// 获取当前页面
const currentPage = window.Core.PageLifecycle.getCurrentPage();
```

#### 自动检测（可选）

```javascript
// 启用自动检测（监听 DOM 的 active 类变化）
window.Core.PageLifecycle.setAutoDetect(true, {
  selector: '.page, [data-page]',
  activeClass: 'active'
});
```

## 完整示例

### 购物车页面示例

```javascript
// 1. 注册页面
window.Core.PageLifecycle.register('cart', {
  onShow: () => {
    // 显示时初始化
    loadCartItems();
  },
  onHide: () => {
    // 隐藏时清理（自动清理事件和定时器）
    console.log('购物车页面已隐藏，资源已清理');
  }
});

// 2. 使用 EventManager 注册事件
const eventManager = window.Core.EventManager.group('cart');
eventManager.on(addBtn, 'click', handleAddItem);
eventManager.on(removeBtn, 'click', handleRemoveItem);
eventManager.on(checkoutBtn, 'click', handleCheckout);

// 3. 使用 TimerManager 创建定时器
const timerManager = window.Core.TimerManager.group('cart');
timerManager.setInterval(() => {
  updateCartTotal();
}, 5000);

// 4. 页面切换时自动清理
// 当调用 PageLifecycle.hide('cart') 时，会自动清理：
// - 所有 groupId 为 'cart' 的事件监听器
// - 所有 groupId 为 'cart' 的定时器
```

## 调试

### 启用调试模式

```javascript
// 手动启用
window.Core.EventManager.setDebug(true);
window.Core.TimerManager.setDebug(true);
window.Core.PageLifecycle.setDebug(true);

// 开发环境自动启用（localhost）
```

### 查看调试信息

```javascript
// 查看事件管理器状态
console.log(window.Core.EventManager.debug());

// 查看定时器管理器状态
console.log(window.Core.TimerManager.debug());

// 查看页面生命周期状态
console.log(window.Core.PageLifecycle.debug());
```

## 迁移策略

### 渐进式迁移（推荐）

1. **新功能使用新服务**：在新开发的页面/功能中使用核心服务
2. **逐步替换旧代码**：按优先级逐步替换现有代码
3. **保持向后兼容**：旧代码继续使用原生 API，不影响功能

### 示例：迁移事件监听器

```javascript
// 旧代码（继续可用）
btn.addEventListener('click', handler);

// 新代码（使用 EventManager）
window.Core.EventManager.on(btn, 'click', handler, { groupId: 'cart' });
```

## 注意事项

1. **分组ID一致性**：确保同一页面的所有事件和定时器使用相同的 `groupId`
2. **页面注册**：使用 PageLifecycle 时，记得先注册页面
3. **异步钩子**：生命周期钩子支持 async/await
4. **错误处理**：钩子执行错误不会阻止页面切换，但会在控制台输出错误

## API 参考

### EventManager

- `on(target, event, handler, options)` - 注册事件监听器
- `off(target, event, handler)` - 移除事件监听器
- `offGroup(groupId)` - 移除分组的所有事件
- `offTarget(target)` - 移除元素的所有事件
- `group(groupId)` - 创建分组上下文（链式API）
- `onGroup(groupId, listeners)` - 批量注册事件
- `debug()` - 获取调试信息
- `clear()` - 清理所有事件

### TimerManager

- `setTimeout(handler, delay, options)` - 创建延迟定时器
- `setInterval(handler, delay, options)` - 创建间隔定时器
- `clearTimeout(timerId)` - 清除延迟定时器
- `clearInterval(timerId)` - 清除间隔定时器
- `clearGroup(groupId)` - 清除分组的所有定时器
- `group(groupId)` - 创建分组上下文（链式API）
- `debug()` - 获取调试信息
- `clear()` - 清理所有定时器

### PageLifecycle

- `register(pageId, hooks)` - 注册页面
- `unregister(pageId)` - 注销页面
- `show(pageId, options)` - 显示页面
- `hide(pageId, options)` - 隐藏页面
- `getCurrentPage()` - 获取当前页面ID
- `isRegistered(pageId)` - 检查页面是否已注册
- `setAutoDetect(enabled, options)` - 启用/禁用自动检测
- `setDebug(enabled)` - 启用/禁用调试模式
- `debug()` - 获取调试信息
- `clear()` - 清理所有页面

## 浏览器兼容性

- 支持所有现代浏览器（Chrome、Firefox、Safari、Edge）
- 使用 WeakMap、Promise、async/await 等现代特性
- 如需支持旧浏览器，需要添加 polyfill

## 性能考虑

- 使用 WeakMap 存储引用，避免内存泄漏
- 事件和定时器跟踪有轻微性能开销，但可忽略不计
- 生产环境建议关闭调试模式

## 故障排查

### 事件监听器未清理

检查是否正确使用了 `groupId`，并确保调用 `offGroup()` 或使用 `PageLifecycle.hide()`

### 定时器未清理

检查是否正确使用了 `groupId`，并确保调用 `clearGroup()` 或使用 `PageLifecycle.hide()`

### 页面切换不生效

检查页面是否正确注册，并确保调用 `show()`/`hide()` 方法
