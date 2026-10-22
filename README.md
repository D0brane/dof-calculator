# 平面机构自由度计算器

在线使用：<https://d0brane.github.io/dof-calculator/>

按 F = 3n − 2P<sub>L</sub> − P<sub>H</sub> − F′ 计算平面机构自由度，自动处理复合铰链、局部自由度和虚约束。

## 功能

- **结构化录入**：逐个添加构件和运动副（转动副、移动副、高副）。
  - 转动副勾选 k 个构件时，按复合铰链计 k−1 个转动副。
  - 构件可以设置局部自由度，构件和运动副都可以标为虚约束。
  - 给出逐项明细、结果判断、原动件数判断、拓扑图，以及对孤立构件、重复导路等问题的提示。
- **数值计算**：直接输入 n、P<sub>L</sub>、P<sub>H</sub>、F′、p′，按 F = 3n − (2P<sub>L</sub> + P<sub>H</sub> − p′) − F′ 计算。
- **内置例题**：10 个，包括四杆、曲柄滑块、五杆、齿轮、凸轮、行星轮系、复合铰链六杆等。
- **数据**：支持导入和导出 JSON，数据只保存在本机浏览器。

## 本地运行

不需要安装任何依赖：

- 直接用浏览器打开 `index.html`。
- 或打开单文件版 `dist/dof-calculator.html`（由 `node scripts/build-single.js` 生成）。

## 测试

```bash
node --test tests/
```

## 文件结构

| 路径 | 内容 |
|---|---|
| `index.html`、`css/style.css` | 页面和样式 |
| `js/dof.js` | 自由度计算核心 |
| `js/examples.js` | 内置例题 |
| `js/app.js` | 界面交互和拓扑图 |
| `tests/dof.test.js` | 单元测试 |
| `scripts/build-single.js` | 生成单文件版 |
