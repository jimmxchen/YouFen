# 有份 YouFen - UI/UX 设计规范

**版本**: v1.0  
**更新日期**: 2026-07-23  
**设计理念**: 高级、简约、干净清爽

---

## 1. 设计原则

### 1.1 核心理念

**简约至上** - 去除一切不必要的装饰，让内容成为主角  
**清爽透气** - 充足的留白和呼吸感，避免视觉拥挤  
**高级感** - 精致的细节、克制的配色、优雅的动效  
**全球化** - 支持多语言，适配不同文化背景的用户

### 1.2 设计目标

- ✅ 让用户专注于社群治理，而非界面本身
- ✅ 传达专业、可信的品牌形象
- ✅ 在不同设备上保持一致的视觉体验
- ✅ 通过渐变和毛玻璃营造现代科技感

---

## 2. 颜色系统

### 2.1 主色调

**白色背景系统** - 营造干净、纯粹的视觉基调

```css
/* 主背景 */
--bg-primary: #FFFFFF;        /* 纯白背景 */
--bg-secondary: #FAFAFA;      /* 次级背景（卡片、模块） */
--bg-tertiary: #F5F5F5;       /* 三级背景（hover状态） */
```

### 2.2 中性色

**黑色与灰色系统** - 用于文字、边框、按钮

```css
/* 文字颜色 */
--text-primary: #0A0A0A;      /* 主要文字（几乎纯黑） */
--text-secondary: #525252;    /* 次要文字（中灰） */
--text-tertiary: #A3A3A3;     /* 辅助文字（浅灰） */
--text-disabled: #D4D4D4;     /* 禁用状态 */

/* 边框颜色 */
--border-light: #F0F0F0;      /* 轻边框 */
--border-medium: #E5E5E5;     /* 中边框 */
--border-strong: #D4D4D4;     /* 强边框 */

/* 分隔线 */
--divider: #F0F0F0;           /* 分隔线 */
```

### 2.3 辅助色

**青绿色系统** - 代表成长、活力、社区

```css
/* 青绿色主色 */
--accent-cyan-50: #ECFDF5;    /* 最浅 - 背景高亮 */
--accent-cyan-100: #D1FAE5;   /* 很浅 */
--accent-cyan-200: #A7F3D0;   /* 浅色 */
--accent-cyan-300: #6EE7B7;   /* 中浅 */
--accent-cyan-400: #34D399;   /* 标准色 */
--accent-cyan-500: #10B981;   /* 主色调 ⭐ */
--accent-cyan-600: #059669;   /* 深色 */
--accent-cyan-700: #047857;   /* 很深 */
```

**蓝色系统** - 代表可信、专业、区块链

```css
/* 蓝色主色 */
--accent-blue-50: #EFF6FF;    /* 最浅 - 背景高亮 */
--accent-blue-100: #DBEAFE;   /* 很浅 */
--accent-blue-200: #BFDBFE;   /* 浅色 */
--accent-blue-300: #93C5FD;   /* 中浅 */
--accent-blue-400: #60A5FA;   /* 标准色 */
--accent-blue-500: #3B82F6;   /* 主色调 ⭐ */
--accent-blue-600: #2563EB;   /* 深色 */
--accent-blue-700: #1D4ED8;   /* 很深 */
```

### 2.4 功能色

```css
/* 成功 */
--color-success: #10B981;     /* 使用青绿色 */

/* 警告 */
--color-warning: #F59E0B;     /* 温暖的橙色 */

/* 错误 */
--color-error: #EF4444;       /* 柔和的红色 */

/* 信息 */
--color-info: #3B82F6;        /* 使用蓝色 */
```

### 2.5 渐变色

**顶部/底部装饰渐变** - 用于页面氛围营造

```css
/* 青绿渐变 - 用于成长、活力相关页面 */
--gradient-cyan: linear-gradient(
  135deg,
  rgba(16, 185, 129, 0.08) 0%,
  rgba(52, 211, 153, 0.05) 50%,
  rgba(167, 243, 208, 0.03) 100%
);

/* 蓝色渐变 - 用于可信、专业相关页面 */
--gradient-blue: linear-gradient(
  135deg,
  rgba(59, 130, 246, 0.08) 0%,
  rgba(96, 165, 250, 0.05) 50%,
  rgba(147, 197, 253, 0.03) 100%
);

/* 双色渐变 - 用于首页等重要页面 */
--gradient-dual: linear-gradient(
  135deg,
  rgba(16, 185, 129, 0.08) 0%,
  rgba(59, 130, 246, 0.08) 100%
);
```


---

## 3. 排版系统

### 3.1 字体家族

```css
/* 西文字体 */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, 'Helvetica Neue', Arial, sans-serif;

/* 中文字体 */
--font-chinese: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 
                'WenQuanYi Micro Hei', sans-serif;

/* 等宽字体（用于代码、哈希值） */
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', 
             'Monaco', 'Courier New', monospace;
```

### 3.2 字体大小

```css
/* 标题 */
--text-5xl: 48px;    /* 页面主标题 */
--text-4xl: 36px;    /* 章节标题 */
--text-3xl: 30px;    /* 大标题 */
--text-2xl: 24px;    /* 中标题 */
--text-xl: 20px;     /* 小标题 */

/* 正文 */
--text-lg: 18px;     /* 大正文 */
--text-base: 16px;   /* 标准正文 ⭐ */
--text-sm: 14px;     /* 小正文 */
--text-xs: 12px;     /* 辅助文字 */
```

### 3.3 字重

```css
--font-light: 300;      /* 轻字重 */
--font-normal: 400;     /* 常规字重 ⭐ */
--font-medium: 500;     /* 中等字重 */
--font-semibold: 600;   /* 半粗字重 */
--font-bold: 700;       /* 粗字重 */
```

### 3.4 行高

```css
--leading-tight: 1.25;    /* 紧凑行高（标题） */
--leading-normal: 1.5;    /* 标准行高（正文）⭐ */
--leading-relaxed: 1.75;  /* 宽松行高（长文本） */
```

---

## 4. 组件设计规范

### 4.1 按钮系统

#### 主按钮（Primary Button）

**用途**：最重要的操作（创建社群、确认投票等）

```css
/* 黑色主按钮 */
.button-primary {
  background: #0A0A0A;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.button-primary:hover {
  background: #262626;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.button-primary:active {
  transform: translateY(0);
}
```

#### 次级按钮（Secondary Button）

**用途**：次要操作（取消、返回等）

```css
.button-secondary {
  background: #FFFFFF;
  color: #0A0A0A;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.button-secondary:hover {
  background: #FAFAFA;
  border-color: #D4D4D4;
}
```

#### 辅助色按钮（Accent Button）

**用途**：特殊强调操作（发放发言权、生成可信记录等）

```css
/* 青绿色按钮 */
.button-accent-cyan {
  background: linear-gradient(135deg, #10B981 0%, #34D399 100%);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.button-accent-cyan:hover {
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  transform: translateY(-1px);
}

/* 蓝色按钮 */
.button-accent-blue {
  background: linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.button-accent-blue:hover {
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
}
```

### 4.2 导航栏（毛玻璃效果）

**设计特点**：
- 固定在顶部
- 毛玻璃（Glassmorphism）效果
- 半透明背景 + 背景模糊
- 细边框增强层次感

```css
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  
  /* 毛玻璃效果 */
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  
  /* 细边框 */
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  
  /* 阴影 */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  
  height: 64px;
  padding: 0 24px;
}

/* 导航项 */
.navbar-item {
  color: #525252;
  font-size: 15px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.navbar-item:hover {
  color: #0A0A0A;
  background: rgba(0, 0, 0, 0.04);
}

.navbar-item.active {
  color: #0A0A0A;
  background: rgba(0, 0, 0, 0.06);
}
```

### 4.3 卡片（Card）

**设计特点**：
- 白色背景
- 细边框
- 轻微圆角
- 悬停时提升

```css
.card {
  background: #FFFFFF;
  border: 1px solid #F0F0F0;
  border-radius: 12px;
  padding: 24px;
  transition: all 0.3s ease;
}

.card:hover {
  border-color: #E5E5E5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

/* 带渐变装饰的卡片 */
.card-decorated {
  position: relative;
  overflow: hidden;
}

.card-decorated::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--gradient-dual);
}
```


### 4.4 输入框（Input）

```css
.input {
  background: #FFFFFF;
  border: 1px solid #E5E5E5;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  color: #0A0A0A;
  transition: all 0.2s ease;
}

.input:focus {
  outline: none;
  border-color: #10B981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.input::placeholder {
  color: #A3A3A3;
}
```

### 4.5 发言权徽章（Voice Power Badge）

**设计特点**：使用渐变背景，突出显示发言权数值

```css
.vp-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  background: linear-gradient(135deg, #10B981 0%, #34D399 100%);
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
}

.vp-badge-large {
  padding: 10px 20px;
  font-size: 18px;
  border-radius: 24px;
}
```

---

## 5. 布局规范

### 5.1 间距系统

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
```

### 5.2 容器宽度

```css
--container-sm: 640px;    /* 小容器（表单） */
--container-md: 768px;    /* 中等容器（内容页） */
--container-lg: 1024px;   /* 大容器（后台页面）⭐ */
--container-xl: 1280px;   /* 超大容器（数据展示） */
--container-2xl: 1536px;  /* 最大容器 */
```

### 5.3 响应式断点

```css
/* 移动设备 */
@media (max-width: 640px) { /* sm */ }

/* 平板设备 */
@media (min-width: 641px) and (max-width: 1024px) { /* md */ }

/* 桌面设备 */
@media (min-width: 1025px) { /* lg+ */ }
```

### 5.4 页面布局原则

**顶部渐变装饰**：在页面顶部添加轻微渐变晕

```css
.page-header-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 300px;
  background: var(--gradient-dual);
  opacity: 0.6;
  pointer-events: none;
  z-index: -1;
}
```

**底部渐变装饰**：在页面底部添加轻微渐变晕

```css
.page-footer-decoration {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 200px;
  background: var(--gradient-cyan);
  opacity: 0.4;
  pointer-events: none;
  z-index: -1;
}
```

---

## 6. 动效规范

### 6.1 过渡时长

```css
--duration-fast: 150ms;     /* 快速交互 */
--duration-normal: 200ms;   /* 标准交互 ⭐ */
--duration-slow: 300ms;     /* 慢速交互 */
--duration-slower: 400ms;   /* 更慢交互 */
```

### 6.2 缓动函数

```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);  /* 推荐 ⭐ */
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### 6.3 常见动效

**悬停提升**：
```css
.hover-lift {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
```

**淡入淡出**：
```css
.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 7. 特殊页面设计指引

### 7.1 首页（Landing Page）

**设计重点**：
- 顶部使用双色渐变装饰（--gradient-dual）
- 主标题使用 48px，半粗字重
- 三个价值卡片使用轻微阴影和悬停效果
- CTA 按钮使用黑色主按钮

### 7.2 社群后台（Admin Dashboard）

**设计重点**：
- 侧边栏使用浅灰背景（#FAFAFA）
- 数据卡片使用白色背景 + 细边框
- 关键数据使用青绿色或蓝色高亮
- 表格使用斑马纹（交替行颜色）

### 7.3 投票页（Vote Page）

**设计重点**：
- 移动端全屏卡片设计
- 投票选项使用大卡片，圆角 12px
- 当前得票使用青绿色进度条
- 确认按钮使用青绿色渐变按钮

### 7.4 公开社群页（Public Community）

**设计重点**：
- 顶部社群信息使用青绿渐变背景
- 贡献者榜单使用卡片 + 排名徽章
- 可信记录使用蓝色强调
- 底部渐变装饰使用 --gradient-cyan

---

## 8. 图标系统

### 8.1 图标库选择

推荐使用：**Lucide Icons** 或 **Heroicons**

特点：
- 简约、现代
- 笔画粗细一致（2px）
- 圆角风格
- 支持多种尺寸

### 8.2 图标尺寸

```css
--icon-xs: 16px;
--icon-sm: 20px;
--icon-base: 24px;  /* 标准尺寸 ⭐ */
--icon-lg: 32px;
--icon-xl: 48px;
```

### 8.3 图标颜色

```css
/* 默认跟随文字颜色 */
.icon {
  color: currentColor;
}

/* 辅助色图标 */
.icon-cyan {
  color: #10B981;
}

.icon-blue {
  color: #3B82F6;
}
```

---

## 9. 暗色模式（P2 功能）

暂不实现，预留设计：

```css
/* 暗色模式变量（未来使用） */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0A0A0A;
    --bg-secondary: #171717;
    --text-primary: #FAFAFA;
    --text-secondary: #A3A3A3;
    /* ... */
  }
}
```

---

## 10. 设计检查清单

在实现每个页面/组件前，请确认：

- [ ] 是否使用了正确的颜色变量？
- [ ] 主按钮是否使用黑色（#0A0A0A）？
- [ ] 导航栏是否应用了毛玻璃效果？
- [ ] 是否添加了适当的渐变装饰？
- [ ] 间距是否符合 4px 基础网格？
- [ ] 过渡动画是否使用了 200ms 标准时长？
- [ ] 移动端是否做了响应式适配？
- [ ] 悬停状态是否有视觉反馈？
- [ ] 文字对比度是否符合 WCAG AA 标准？
- [ ] 组件是否保持了简约、干净的风格？

---

**文档完成时间**: 2026-07-23  
**下一步**: 应用到实际开发中

