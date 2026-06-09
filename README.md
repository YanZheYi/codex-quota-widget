# 🚀 Codex Monitor (ChatGPT 额度监控桌面小组件)

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Codex Monitor Logo" width="80" height="80" style="border-radius: 20%; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</p>

<p align="center">
  一款基于 <b>Tauri + React + TypeScript</b> 构建的极简 Windows 桌面挂件。<br />
  专为 ChatGPT 开发者与重度 API 使用者打造，提供低打扰的<b>额度监控、速率重置倒计时与多账号热切换</b>能力。
</p>

<p align="center">
  <a href="#-核心特色"><b>核心特色</b></a> • 
  <a href="#-本地开发与编译"><b>快速上手</b></a> • 
  <a href="#-配置文件与账号热切换"><b>配置文件与多账号切换</b></a>
</p>

<p align="center">
  <img width="360" height="356" alt="ScreenShot_2026-06-09_183437_183" src="https://github.com/user-attachments/assets/658aef22-1dec-4d48-98f7-e920418dea02" />
  <img width="360" height="356" alt="ScreenShot_2026-06-09_183454_872" src="https://github.com/user-attachments/assets/fad0ba13-3e7d-4d18-98c4-292a1abb3f6e" />
</p>

---

## 🌟 核心特色

* 🎨 **极简玻璃拟态设计**：无系统边框，搭配精致的毛玻璃渐变背景，适配 Windows 10/11 桌面。
* 📏 **自适应窗口大小**：采用 `ResizeObserver` 动态监听前端布局尺寸。无论是展开设置面板还是显示错误日志，窗口都能根据卡片内容自动贴合，减少传统网页容器中的“点击穿透”和“操作遮挡”问题。
* 📊 **双维度额度同步**：

  * **动态环形进度条**：直观展示 5 小时速率限制下的额度使用情况，并配合流畅的 Ease 缓动动画。
  * **醒目的重置时间显示**：展示 5 小时与 7 天限额的预计重置时间，精确到分钟。
* 🔄 **多账号无缝热切换**：刷新时自动重新读取磁盘配置文件，支持 JWT 解码，并在底部栏实时显示当前登录的**用户名与邮箱**。
* ⚡ **防重复点击保护**：手动刷新按钮具备 **3 秒冷却保护**与加载状态动画，避免频繁调用接口导致请求浪费或触发限流。
* 📦 **绿色轻量化**：打包后的单文件 `.exe` 约 **6.6MB**，无需安装，适合即开即用。
* 🔒 **直连与隐私安全**：请求由 Tauri 客户端直接发起，不经过第三方代理或云中转，尽量降低账户 Token 暴露风险。

---

## 🛠️ 技术底座

- **前端框架**：React 18, Vite, Tailwind CSS, TypeScript
- **状态与图标**：Lucide React, CSS Variables (动态主题切换)
- **后端外壳**：Tauri 1.x (Rust)
- **系统要求**：Windows 10/11 (系统需具备 Webview2 运行时)

---

## 🚀 本地开发与编译

项目内置了针对 Windows 环境优化的一键批处理脚本，免去手动配置复杂的 Rust 与 MSVC 编译环境变量：

### 1. 启动本地开发 (Dev Mode)
双击运行根目录下的 **`run-dev.cmd`** 即可：
- 脚本会自动检测并清理本地冲突的 `3000` 端口。
- 自动提取并向进程中注入您的 Windows 代理，解决国内网络连接超时的问题。
- 一键拉起 React 调试挂载 Tauri 界面。

### 2. 打包生成独立的 `.exe` 程序 (Production Build)
双击运行根目录下的 **`run-build.cmd`**：
- 编译引擎将执行 Release 级代码优化与打包。
- 打包完成后，可在 `src-tauri\target\release\` 目录下获取纯绿色的可执行程序 **`codex-monitor.exe`**。

### 3. 如何自定义与替换应用 Logo (Icon)
> [!IMPORTANT]
> **Tauri Icon 图标源图片的尺寸要求：**
> 输入的源图片**必须是完美的正方形**（即长与宽的像素比例必须是 1:1，例如 512x512 或 1024x1024）。如果长宽不相等，构建命令行将抛出 `Source image must be square` 并退出。

准备好正方形图片后，在项目根目录下打开终端，执行以下命令：
```bash
npm run tauri icon path/to/your/square-logo.png
```
Tauri CLI 将自动为您生成 Windows `.ico` 及全套尺寸图标并覆盖 `src-tauri/icons/` 目录。重新编译打包即可生效。

---

## ⚙️ 配置文件与账号热切换

应用通过动态读取 JSON 配置文件以获取您的 OpenAI 凭证。

### 1. 配置文件路径
* **方式 A：默认预设路径 (推荐)**
  在您系统的用户目录下新建 `.codex` 目录，并在其中创建名为 `auth.json` 的文件：
  - **默认路径**：`C:\Users\您的用户名\.codex\auth.json`
  - **JSON 样例**：
    ```json
    {
      "tokens": {
        "access_token": "您的 ChatGPT Access Token 粘贴在此",
        "id_token": "您的 id_token (可选，用于提取账号用户名及邮箱)"
      },
      "account_id": "您的账户 ID (可选，一般以 personal- 开头)"
    }
    ```
* **方式 B：在应用内自定义路径**
  启动程序，点击右上角的 **设置 (Cog 图标)**，在配置路径栏输入您本地文件的真实绝对路径即可。

### 2. 🔄 多账号无缝热切换机制
> [!TIP]
> **如何快速热切账号？**
> 本应用在刷新时**不会在内存中进行任何凭证的永久缓存**。当您通过外部工具或脚本在磁盘上更改、覆写 `auth.json` 文件时，小组件会在**下次刷新（无论是手动点击还是定时器触发）**时自动读取最新的文件内容并：
> - 重新解析最新的 JWT 凭证，提取对应的**注册用户名与邮箱**。
> - 使用最新账号的凭证发起请求，实时渲染新的**限额比例、订阅等级以及各限额倒计时**。
> - 双击底部的账号文字即可轻松复制邮箱。

---

## 🤝 鸣谢与说明

* 接口解析与安全通信逻辑参考了开源社区的相关实践，特此感谢。
* 本项目仅供学习与技术交流使用。由于涉及非公开接口或非官方调用方式，仍存在极低概率的账号风控风险，请在了解风险后使用。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。
