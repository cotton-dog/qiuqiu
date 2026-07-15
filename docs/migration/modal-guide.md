# Modal 组件使用指南

## 概述

`Core.Modal` 是统一的浮窗组件，提供标准化的浮窗交互体验，支持键盘处理、输入框自动滚动、样式定制等功能。

## 文件位置

- JavaScript: `js/core/Modal.js`
- CSS: `css/core/modal.css`

## 基本用法

### 方式一：实例化后调用

```javascript
const modal = new Core.Modal({
    id: 'myModal',
    title: '我的浮窗',
    content: '<p>这是浮窗内容</p>',
    footer: `
        <button class="modal-btn-secondary" onclick="modal.close()">取消</button>
        <button class="modal-btn-primary" onclick="confirm()">确认</button>
    `
});

modal.open();
```

### 方式二：静态方法快速创建

```javascript
const modal = Core.Modal.open({
    title: '快速浮窗',
    content: '<p>这是快速创建的浮窗</p>'
});
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | String | `modal-时间戳` | 浮窗唯一标识符 |
| `title` | String | `''` | 浮窗标题 |
| `content` | String | `''` | 浮窗内容（HTML字符串） |
| `footer` | String | `''` | 浮窗底部按钮（HTML字符串） |
| `onOpen` | Function | `null` | 浮窗打开时的回调函数 |
| `onClose` | Function | `null` | 浮窗关闭时的回调函数 |
| `onBeforeOpen` | Function | `null` | 浮窗打开前的回调函数，返回 `false` 可阻止打开 |
| `onBeforeClose` | Function | `null` | 浮窗关闭前的回调函数，返回 `false` 可阻止关闭 |
| `closeOnOverlayClick` | Boolean | `true` | 点击遮罩层是否关闭浮窗 |
| `closeOnEscape` | Boolean | `true` | 按 ESC 键是否关闭浮窗 |

## API 方法

### `open()`

打开浮窗。

```javascript
modal.open();
```

### `close()`

关闭浮窗。

```javascript
modal.close();
```

### `isOpen()`

检查浮窗是否已打开。

```javascript
if (modal.isOpen()) {
    console.log('浮窗已打开');
}
```

### `setContent(content)`

更新浮窗内容。

```javascript
modal.setContent('<p>新的内容</p>');
```

### `setTitle(title)`

更新浮窗标题。

```javascript
modal.setTitle('新的标题');
```

### `setFooter(footer)`

更新浮窗底部内容。

```javascript
modal.setFooter(`
    <button class="modal-btn-secondary" onclick="modal.close()">取消</button>
    <button class="modal-btn-primary" onclick="save()">保存</button>
`);
```

### `destroy()`

销毁浮窗，移除 DOM 元素和事件监听器。

```javascript
modal.destroy();
```

## 样式定制

### CSS 变量

通过修改 CSS 变量可以定制浮窗样式：

```css
:root {
    --modal-bg: rgba(255, 255, 255, 0.95);
    --modal-radius: 20px;
    --modal-width: 90%;
    --modal-max-width: 400px;
    --modal-max-height: 80vh;
    --modal-header-height: 60px;
    --modal-footer-height: 60px;
    --modal-overlay-bg: rgba(0, 0, 0, 0.5);
    --modal-z-index: 2100;
    --modal-overlay-z-index: 2000;
}
```

### 应用级定制

为特定应用定制样式：

```css
.sleep-aid .modal {
    --modal-bg: rgba(30, 30, 40, 0.95);
    --modal-radius: 20px;
    --modal-max-width: 500px;
}
```

### 深色模式支持

样式文件已包含深色模式支持，使用 `prefers-color-scheme: dark` 媒体查询自动切换。

## 键盘处理

### 自动滚动到输入框

当键盘弹出时，浮窗会自动滚动输入框到可视区域：

```javascript
const modal = new Core.Modal({
    title: '表单',
    content: `
        <input type="text" placeholder="用户名">
        <input type="password" placeholder="密码">
        <textarea placeholder="备注"></textarea>
    `
});

modal.open();
```

### 键盘事件监听

组件使用 `visualViewport` API 监听键盘状态：
- 高度减少超过 100px 判断为键盘弹出
- 高度增加超过 100px 判断为键盘收起

## 浮窗结构

标准浮窗 HTML 结构：

```html
<div class="modal-overlay">
    <div class="modal" id="modal-id">
        <div class="modal-header">
            <h3 class="modal-title">标题</h3>
            <button class="modal-close">×</button>
        </div>
        <div class="modal-content">
            <!-- 内容区域 -->
        </div>
        <div class="modal-footer">
            <!-- 按钮区域 -->
        </div>
    </div>
</div>
```

## 使用示例

### 示例 1：简单提示浮窗

```javascript
const alertModal = Core.Modal.open({
    title: '提示',
    content: '<p>操作成功！</p>',
    footer: `
        <button class="modal-btn-primary" onclick="alertModal.close()">确定</button>
    `
});
```

### 示例 2：表单浮窗

```javascript
const formModal = new Core.Modal({
    title: '添加项目',
    content: `
        <div class="form-group">
            <label>名称</label>
            <input type="text" id="itemName" placeholder="请输入名称">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="itemDesc" placeholder="请输入描述"></textarea>
        </div>
    `,
    footer: `
        <button class="modal-btn-secondary" onclick="formModal.close()">取消</button>
        <button class="modal-btn-primary" onclick="saveItem()">保存</button>
    `,
    onOpen: () => {
        console.log('表单浮窗已打开');
    }
});

function saveItem() {
    const name = document.getElementById('itemName').value;
    const desc = document.getElementById('itemDesc').value;
    console.log('保存:', name, desc);
    formModal.close();
}

formModal.open();
```

### 示例 3：确认对话框

```javascript
const confirmModal = Core.Modal.open({
    title: '确认删除',
    content: '<p>确定要删除这个项目吗？此操作不可撤销。</p>',
    footer: `
        <button class="modal-btn-secondary" onclick="confirmModal.close()">取消</button>
        <button class="modal-btn-primary" onclick="deleteItem()">删除</button>
    `,
    closeOnOverlayClick: false
});

function deleteItem() {
    console.log('删除项目');
    confirmModal.close();
}
```

### 示例 4：动态内容浮窗

```javascript
const listModal = new Core.Modal({
    title: '选择项目',
    content: '<div id="itemList"></div>'
});

function loadItems() {
    const items = ['项目1', '项目2', '项目3'];
    const html = items.map(item => `
        <div class="item" onclick="selectItem('${item}')">${item}</div>
    `).join('');
    document.getElementById('itemList').innerHTML = html;
}

function selectItem(item) {
    console.log('选择了:', item);
    listModal.close();
}

listModal.onOpen = loadItems;
listModal.open();
```

## 注意事项

1. **避免内存泄漏**：使用完毕后调用 `destroy()` 方法清理
2. **事件绑定**：浮窗关闭时，绑定的键盘事件会自动解绑
3. **键盘兼容性**：使用 `visualViewport` API，旧版浏览器可能不支持
4. **z-index 管理**：使用 CSS 变量控制浮窗层级，避免与其他元素冲突
5. **无障碍支持**：组件已包含 ARIA 属性，支持屏幕阅读器

## 浏览器兼容性

- Chrome 62+
- Safari 13+
- Firefox 69+
- Opera 49+
- Edge 79+

## 迁移指南

### 从旧浮窗迁移

**旧代码：**
```javascript
const modal = document.getElementById('oldModal');
modal.style.display = 'flex';
```

**新代码：**
```javascript
const modal = new Core.Modal({
    id: 'oldModal',
    title: '标题',
    content: '内容'
});
modal.open();
```

### 删除旧代码

迁移完成后，删除：
- 旧的浮窗 HTML 结构
- 旧的浮窗 CSS 样式
- 旧的浮窗控制逻辑（`style.display`、`classList.add('active')` 等）

## 常见问题

### Q: 浮窗内容超出高度怎么办？

A: 浮窗内容区（`.modal-content`）已设置 `overflow-y: auto`，超出高度会自动出现滚动条。

### Q: 如何禁用 ESC 键关闭浮窗？

A: 设置 `closeOnEscape: false`：
```javascript
const modal = new Core.Modal({
    title: '不能关闭的浮窗',
    closeOnEscape: false
});
```

### Q: 如何阻止浮窗关闭？

A: 使用 `onBeforeClose` 回调：
```javascript
const modal = new Core.Modal({
    title: '表单',
    onBeforeClose: () => {
        if (hasUnsavedChanges()) {
            alert('请先保存修改');
            return false;
        }
    }
});
```

### Q: 如何自定义浮窗宽度？

A: 修改 CSS 变量或使用选择器覆盖：
```css
:root {
    --modal-width: 95%;
    --modal-max-width: 600px;
}

/* 或针对特定浮窗 */
#myModal {
    width: 600px;
    max-width: 600px;
}
```

## 包装现有浮窗（ModalWrapper）

### 概述

`Core.ModalWrapper` 用于包装现有浮窗元素，只添加基础行为（键盘适配、高度固定、输入框滚动），**不修改 HTML 结构和 CSS 样式**，保持各应用原有视觉风格。

### 基本用法

```javascript
// 包装现有浮窗元素
const nameModal = document.getElementById('nameModal');
const modalWrapper = Core.ModalWrapper.wrap(nameModal);

// 使用统一 API 控制
modalWrapper.open();  // 内部仍使用原有的显示方式（如 classList.add('active')）
modalWrapper.close(); // 内部仍使用原有的隐藏方式（如 classList.remove('active')）
```

### 自动检测显示方式

ModalWrapper 会自动检测元素的显示/隐藏方式：

- 如果元素有 `active` 类：使用 `classList.add/remove('active')`
- 如果元素使用 `style.display`：自动检测 `flex` 或 `block`
- 可以手动指定显示方式

```javascript
// 手动指定显示方式
const modalWrapper = Core.ModalWrapper.wrap(element, {
    showMethod: 'classList.add',
    showValue: 'active',
    hideMethod: 'classList.remove',
    hideValue: 'active'
});
```

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `showMethod` | String | 自动检测 | 显示方式：'classList.add' 或 'style.display' |
| `showValue` | String | 自动检测 | 显示值：'active'、'flex'、'block' 等 |
| `hideMethod` | String | 自动检测 | 隐藏方式：'classList.remove' 或 'style.display' |
| `hideValue` | String | 自动检测 | 隐藏值：'active'、'none' 等 |
| `enableKeyboardHandling` | Boolean | `true` | 启用键盘处理 |
| `enableHeightFix` | Boolean | `true` | 启用高度固定（确保不受键盘影响） |
| `enableInputScroll` | Boolean | `true` | 启用输入框自动滚动 |
| `onOpen` | Function | `null` | 打开回调 |
| `onClose` | Function | `null` | 关闭回调 |

### 批量包装

```javascript
// 批量包装多个浮窗
const modals = Core.ModalWrapper.wrapAll([
    document.getElementById('modal1'),
    document.getElementById('modal2'),
    document.getElementById('modal3')
], {
    enableKeyboardHandling: true,
    enableInputScroll: true
});
```

### 获取已包装的实例

```javascript
// 获取已包装的 Modal 实例
const modal = Core.ModalWrapper.getInstance('#nameModal');
if (modal) {
    modal.open();
}
```

### 迁移示例

**旧代码：**
```javascript
const nameModal = document.getElementById('nameModal');

function showModal() {
    nameModal.classList.add('active');
}

function hideModal() {
    nameModal.classList.remove('active');
}
```

**新代码（保持原有显示方式，添加基础行为）：**
```javascript
const nameModal = document.getElementById('nameModal');
const nameModalWrapper = Core.ModalWrapper.wrap(nameModal);

function showModal() {
    nameModalWrapper.open(); // 内部仍使用 classList.add('active')，但添加了键盘处理等
}

function hideModal() {
    nameModalWrapper.close(); // 内部仍使用 classList.remove('active')
}
```

### 注意事项

1. **不修改样式**：ModalWrapper 不会修改元素的 CSS 类名或样式
2. **保持原有行为**：显示/隐藏方式保持不变，只添加基础功能
3. **自动检测**：会自动检测元素的显示方式，通常无需手动配置
4. **避免重复包装**：同一个元素只会包装一次，重复调用会返回现有实例

## 迁移指南

### 从旧浮窗迁移到 ModalWrapper

#### 步骤 1：保持 HTML 结构不变

```html
<!-- 完全保持原结构，不添加任何类名 -->
<div class="name-modal" id="nameModal">
    <div class="name-modal-content">...</div>
</div>
```

#### 步骤 2：包装现有元素

```javascript
// 在初始化代码中包装浮窗
const nameModalWrapper = Core.ModalWrapper.wrap(
    document.getElementById('nameModal')
);
```

#### 步骤 3：替换控制逻辑

```javascript
// 旧代码
nameModal.classList.add('active');

// 新代码（保持原有显示方式，添加基础行为）
nameModalWrapper.open();
```

#### 步骤 4：验证功能

- 验证键盘弹起时浮窗高度固定
- 验证输入框自动滚动
- 验证原有样式不受影响
- 如果出现问题，回滚并记录

### 如果无法适配

如果浮窗无法适配（样式冲突、结构特殊等），**暂不改动**，保持原代码不变，记录问题以便后续处理。

## 更新日志

### v1.1.0 (2026-02-09)
- 新增 ModalWrapper 包装工具
- 支持包装现有浮窗元素
- 自动检测显示/隐藏方式
- 只添加基础行为，不修改样式
- 保持各应用原有视觉风格

### v1.0.0 (2026-02-09)
- 初始版本
- 支持基本浮窗功能
- 键盘处理和输入框自动滚动
- 样式定制支持
- 深色模式支持
