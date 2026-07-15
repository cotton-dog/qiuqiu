# 浮窗系统迁移指南

## 概述

本指南说明如何将现有浮窗迁移到统一的 `Core.ModalWrapper` 系统。

## 核心原则

- ✅ **只统一控制逻辑和基础行为**（键盘适配、高度固定、输入框滚动）
- ✅ **保持各应用原有 CSS 样式**（不强制统一）
- ✅ **保持 HTML 结构不变**（如果无法适配，暂不改动）

## 迁移步骤

### 1. 识别浮窗

搜索应用中的所有浮窗：

```javascript
// HTML 中搜索
// - id 包含 "modal"、"popup"、"dialog"
// - class 包含 "modal"、"popup"
// - style="display: none" 或 style="display: flex"

// JavaScript 中搜索
// - getElementById.*[Mm]odal
// - style.display\s*=
// - classList\.(add|remove)\(.*active
```

### 2. 建立清单

记录每个浮窗的信息：

```
浮窗ID       | HTML位置 | CSS位置 | JS控制位置 | 控制方式        | 迁移优先级
-------------|----------|---------|------------|-----------------|----------
nameModal    | L2521    | 内联    | L2819      | classList.active | P0
statsModal   | L2579    | 内联    | L2833      | classList.active | P0
```

### 3. 包装浮窗

使用 `Core.ModalWrapper.wrap()` 包装现有元素：

```javascript
// 方式1：自动检测显示方式
const nameModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('nameModal')
);

// 方式2：手动指定显示方式
const statsModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('statsModal'),
    {
        showMethod: 'classList.add',
        showValue: 'active',
        hideMethod: 'classList.remove',
        hideValue: 'active'
    }
);
```

### 4. 替换控制逻辑

将原有的显示/隐藏代码替换为统一 API：

```javascript
// 旧代码
function showNameModal() {
    nameModal.classList.add('active');
}

function hideNameModal() {
    nameModal.classList.remove('active');
}

// 新代码
function showNameModal() {
    nameModalWrapper.open(); // 内部仍使用 classList.add('active')
}

function hideNameModal() {
    nameModalWrapper.close(); // 内部仍使用 classList.remove('active')
}
```

### 5. 测试验证

- [ ] 打开/关闭所有浮窗
- [ ] 测试表单输入（键盘弹起）
- [ ] 测试输入框自动滚动
- [ ] 测试遮罩层点击关闭
- [ ] 测试 ESC 键关闭
- [ ] 测试滚动场景
- [ ] 验证原有样式不受影响
- [ ] 跨浏览器测试（iOS Safari, Android Opera）

### 6. 清理验证

- [ ] 确认所有控制逻辑使用 ModalWrapper API
- [ ] 确认原有显示方式保持不变
- [ ] 确认样式正常工作
- [ ] 记录无法适配的浮窗及原因

## 常见场景

### 场景1：使用 classList.add/remove('active')

```javascript
// 旧代码
const modal = document.getElementById('myModal');
modal.classList.add('active');    // 显示
modal.classList.remove('active');  // 隐藏

// 新代码
const modalWrapper = Core.ModalWrapper.wrap(modal);
modalWrapper.open();   // 内部仍使用 classList.add('active')
modalWrapper.close();  // 内部仍使用 classList.remove('active')
```

### 场景2：使用 style.display

```javascript
// 旧代码
const modal = document.getElementById('myModal');
modal.style.display = 'flex';  // 显示
modal.style.display = 'none';  // 隐藏

// 新代码
const modalWrapper = Core.ModalWrapper.wrap(modal, {
    showMethod: 'style.display',
    showValue: 'flex',
    hideMethod: 'style.display',
    hideValue: 'none'
});
modalWrapper.open();   // 内部仍使用 style.display = 'flex'
modalWrapper.close();  // 内部仍使用 style.display = 'none'
```

### 场景3：多个浮窗

```javascript
// 批量包装
const modals = Core.ModalWrapper.wrapAll([
    document.getElementById('modal1'),
    document.getElementById('modal2'),
    document.getElementById('modal3')
]);

// 分别控制
modals[0].open();
modals[1].open();
modals[2].close();
```

### 场景4：需要回调

```javascript
const modalWrapper = Core.ModalWrapper.wrap(modal, {
    onOpen: () => {
        console.log('浮窗已打开');
        // 执行打开后的操作
    },
    onClose: () => {
        console.log('浮窗已关闭');
        // 执行关闭后的操作
    }
});
```

## 无法适配的情况

如果遇到以下情况，**暂不改动**，保持原代码不变：

1. **样式冲突**：包装后样式出现异常，无法解决
2. **结构特殊**：浮窗结构过于特殊，无法适配
3. **功能冲突**：基础行为与现有功能冲突
4. **性能问题**：包装后出现性能问题

**处理方式**：
- 记录问题浮窗 ID 和原因
- 保持原代码不变
- 后续统一处理

## 迁移检查清单

### 迁移前

- [ ] 已识别所有浮窗
- [ ] 已建立浮窗清单
- [ ] 已了解每个浮窗的控制方式
- [ ] 已备份代码

### 迁移中

- [ ] 逐个包装浮窗
- [ ] 替换控制逻辑
- [ ] 测试每个浮窗的功能
- [ ] 记录遇到的问题

### 迁移后

- [ ] 所有浮窗使用统一 API
- [ ] 基础功能正常（键盘适配、高度固定、输入框滚动）
- [ ] 原有样式不受影响
- [ ] 无法适配的浮窗已记录
- [ ] 代码已提交

## 注意事项

1. **渐进式迁移**：逐个应用迁移，不要一次性改动所有应用
2. **保持兼容**：迁移过程中保持向后兼容
3. **充分测试**：每个浮窗迁移后立即测试
4. **记录问题**：无法适配的浮窗要详细记录
5. **及时回滚**：如果出现问题，及时回滚

## 示例：日记应用迁移

### 1. 识别浮窗

```javascript
// 日记.html 中的浮窗
- nameModal (L2521)
- statsModal (L2579)
- notebookModal (L2634)
- notebookRoleModal (L2678)
```

### 2. 包装浮窗

```javascript
// 在日记应用的初始化代码中
const nameModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('nameModal')
);

const statsModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('statsModal')
);

const notebookModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('notebookModal')
);

const notebookRoleModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('notebookRoleModal')
);
```

### 3. 替换控制逻辑

```javascript
// 旧代码
function showNameModal() {
    nameModal.classList.add('active');
}

// 新代码
function showNameModal() {
    nameModalWrapper.open();
}
```

### 4. 测试验证

- 打开所有浮窗 ✓
- 测试键盘弹起 ✓
- 测试输入框滚动 ✓
- 验证样式正常 ✓

## 支持

如有问题，请参考：
- [Modal 组件使用指南](modal-guide.md)
- 项目文档
- 代码注释
