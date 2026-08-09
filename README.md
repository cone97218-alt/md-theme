# 🎨 Morandi Theme Studio — 阅读美化转换工具

一个极速、零依赖、100% 离线计算的 **阅读美化转换网页应用**。支持将 **Reeden (`.red`)** 及 **Arc / MD3 (`.zip`)** 格式的美化主题转换为标准的 **阅读 MD3** 界面美化包与阅读排版美化包。

---

## 🚀 性能优势 (原生 HTML/JS vs Vue)

本系统采用 **原生 HTML5 + 莫兰迪 CSS 变量系统 + JSZip 原生 ES 模块** 架构，相比 Vue / React 等重型框架具有绝对优势：

1. **首屏毫秒级加载**：零框架 Runtime 开销，网页加载体积 < 30KB，即开即用。
2. **零构建部署**：无需 `npm run build` 或 Node.js 编译步骤，支持直接部署至 GitHub Pages。
3. **本地计算与隐私安全**：基于客户端 `JSZip` 库直接处理二进制 ZIP 包，文件 100% 在用户浏览器本地完成转换，不占用任何服务器资源。

---

## 🌐 部署到 GitHub Pages 获取网页链接 (三步极简指南)

只需 3 步，即可将本项目免费部署至 GitHub Pages 并获得公网访问链接：

### 步骤 1：上传项目至 GitHub
1. 打开 [GitHub](https://github.com/) 并登录账号，点击右上角 `+` -> **New repository**；
2. 填写仓库名称（例如 `yuedu-theme-studio`），选择 **Public**（公开），点击 **Create repository**；
3. 将本项目文件夹中的所有文件（`index.html`、`styles.css`、`app.js`、`lib/` 文件夹、`convert.py`、`README.md`）上传或 `git push` 到仓库的 `main` 分支。

### 步骤 2：开启 GitHub Pages
1. 在 GitHub 仓库页面顶部菜单栏，点击 **Settings**（设置）；
2. 在左侧侧边栏中找到并点击 **Pages**；
3. 在 **Build and deployment** 下方的 Source 选择 **Deploy from a branch**；
4. Branch 选择 **main** 分支，目录保持默认的 **/(root)**，点击 **Save** 保存。

### 步骤 3：获取网页链接
- 保存后等待约 10 - 30 秒，刷新 Pages 页面即可在顶部看到生成的专属公网网页链接：
  ```text
  https://<你的GitHub用户名>.github.io/yuedu-theme-studio/
  ```
- 任何人在手机或电脑浏览器中打开该链接即可使用转换工具！

---

## ✨ 核心功能特性

- **莫兰迪 (Morandi) 双美学配色**：支持莫兰迪日间 (`#f4f1ec`) 与夜间 (`#1e2428`) 全局主题一键平滑切换。
- **真机模型 1:1 实时预览**：
  - **应用界面 Tab**：预览导出的背景图、5 键浮动导航栏、书单分类与书籍卡片。
  - **阅读排版 Tab**：预览提取到的阅读排版纹理背景、正文文字色彩、字号大小、行间距与段落缩进。
- **界面美化 + 阅读排版美化双模解析**：
  - **Reeden (`.red`)**：自动解析并提供 **界面美化包** 与 **阅读排版包** 独立导出 / 一键打包导出。
  - **Arc / MD3 (`.zip`)**：自动识别包内容类型（界面包 `appearance_kit.json`/`manifest.json` 或 排版包 `readConfig.json`），精准导出为合规 MD3 格式。

---

## 🐍 命令行 Python CLI 工具 (`convert.py`)

除网页端外，项目根目录下附带独立的 Python 命令行脚本，适合批量处理：

```powershell
# 1. 转换 .red 主题 (自动识别并输出界面包与排版包)
python convert.py "主题包.red"

# 2. 转换 Arc / MD3 .zip 主题包
python convert.py "Arc美化.zip"
```

---

## 📄 开源许可

© 2026 Morandi Theme Studio. MIT License.
