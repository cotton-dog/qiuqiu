# 日记应用浮窗迁移清单

## 浮窗列表

| 浮窗ID | HTML位置 | CSS位置 | JS控制位置 | 控制方式 | 迁移优先级 | 状态 |
|--------|----------|---------|------------|----------|------------|------|
| modalOverlay | L2409 | 内联样式 | L2789, L4769, L4774 | classList.add('active') | P2 | 待迁移 |
| nameModal | L2521 | 内联样式 (L1463) | L2819, L4840, L4846 | classList.add('active') | P0 | 待迁移 |
| statsModal | L2579 | 内联样式 (L2064) | L2833, L2894, L2899 | classList.add('active') | P0 | 待迁移 |
| cancelPromptOverlay | L2622 | modal.css | L4997, L5003 | classList.add('active') | P2 | 待迁移 |
| notebookModal | L2634 | 内联样式 (L1463) | L3008, L6742, L6765, L6772, L6781 | classList.add('active') | P1 | 待迁移 |
| notebookRoleModal | L2678 | 内联样式 (L1463) | L3023, L3381, L3386 | classList.add('active') | P1 | 待迁移 |
| notebookRenameModal | L2716 | modal.css | L2856, L6629, L6636, L6654 | classList.add('active') | P2 | 待迁移 |

## 详细说明

### P0 优先级（核心浮窗）

#### nameModal (L2521)
- **用途**: 模板命名浮窗
- **结构**: `<div class="name-modal" id="nameModal">`
- **控制方式**: `classList.add/remove('active')`
- **控制位置**: 
  - L4840: `nameModal.classList.add('active')`
  - L4846: `nameModal.classList.remove('active')`
- **迁移说明**: 核心功能浮窗，优先迁移

#### statsModal (L2579)
- **用途**: 日记统计浮窗
- **结构**: `<div class="stats-modal" id="statsModal">`
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L2894: `statsModal.classList.add('active')`
  - L2899: `statsModal.classList.remove('active')`
- **迁移说明**: 核心功能浮窗，优先迁移

### P1 优先级（重要浮窗）

#### notebookModal (L2634)
- **用途**: 新建/编辑日记本浮窗
- **结构**: `<div class="name-modal" id="notebookModal">`
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L6742: `notebookModal.classList.add('active')`
  - L6765: `notebookModal.classList.add('active')`
  - L6772: `notebookModal.classList.add('active')`
  - L6781: `notebookModal.classList.remove('active')`
- **迁移说明**: 重要功能浮窗，第二优先级

#### notebookRoleModal (L2678)
- **用途**: 选择关联角色浮窗
- **结构**: `<div class="name-modal" id="notebookRoleModal">`
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L3381: `notebookRoleModal.classList.add('active')`
  - L3386: `notebookRoleModal.classList.remove('active')`
- **迁移说明**: 重要功能浮窗，第二优先级

### P2 优先级（辅助浮窗）

#### modalOverlay (L2409)
- **用途**: 编辑模式选择浮窗
- **结构**: `<div class="modal-overlay" id="modalOverlay">` (已有 modal 结构)
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L4769: `modalOverlay.classList.add('active')`
  - L4774: `modalOverlay.classList.remove('active')`
- **迁移说明**: 已有 modal 结构，可以包装但优先级较低

#### cancelPromptOverlay (L2622)
- **用途**: 确认放弃编辑浮窗
- **结构**: `<div class="modal-overlay" id="cancelPromptOverlay">` (已有 modal 结构)
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L4997: `cancelPromptOverlay.classList.add('active')`
  - L5003: `cancelPromptOverlay.classList.remove('active')`
- **迁移说明**: 已有 modal 结构，可以包装但优先级较低

#### notebookRenameModal (L2716)
- **用途**: 日记本改名浮窗
- **结构**: `<div class="modal-overlay" id="notebookRenameModal">` (已有 modal 结构)
- **控制方式**: `classList.add/remove('active')`
- **控制位置**:
  - L6629: `notebookRenameModal.classList.add('active')`
  - L6636: `notebookRenameModal.classList.remove('active')`
  - L6654: `notebookRenameModal.classList.remove('active')`
- **迁移说明**: 已有 modal 结构，可以包装但优先级较低

## 迁移策略

### 步骤1：包装 P0 优先级浮窗
1. nameModal
2. statsModal

### 步骤2：包装 P1 优先级浮窗
1. notebookModal
2. notebookRoleModal

### 步骤3：包装 P2 优先级浮窗（可选）
1. modalOverlay
2. cancelPromptOverlay
3. notebookRenameModal

## 注意事项

1. **保持 HTML 结构不变**：所有浮窗的 HTML 结构保持原样
2. **保持 CSS 样式不变**：不修改任何 CSS 类名或样式
3. **只替换控制逻辑**：将 `classList.add/remove('active')` 替换为 `modalWrapper.open/close()`
4. **测试验证**：每个浮窗迁移后立即测试

## 迁移进度

- [ ] nameModal
- [ ] statsModal
- [ ] notebookModal
- [ ] notebookRoleModal
- [ ] modalOverlay
- [ ] cancelPromptOverlay
- [ ] notebookRenameModal
