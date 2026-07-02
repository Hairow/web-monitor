# Web Monitor — Chrome 页面监控插件

定时刷新指定页面，自动发现新条目并通过邮件通知。适用于监控各类 Web 系统的列表更新（如邮箱收件箱、工单系统、公告列表等）。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ 功能

- ⏰ **定时刷新** — 每 10 分钟自动刷新目标页面，全程后台静默运行，不打断当前工作
- 🔍 **智能提取** — 通过 CSS 选择器提取列表数据（标题、时间）
- ⏱️ **基准时间过滤** — 只处理基准时间之后的新条目，避免历史数据干扰
- ✉️ **邮件通知** — 发现新条目时自动发送邮件（基于 Resend API）
- 🚫 **去重机制** — 已处理的条目不会重复通知
- 📊 **统计面板** — 实时显示新条目数、已发邮件数
- 🤫 **静默后台** — 执行时不会激活或切换标签页，完全无感知

## 📦 安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录即可

## 🚀 快速使用

### 第一步：获取目标页面 URL

1. 在浏览器中打开你要监控的页面
2. 点击浏览器右上角的插件图标，打开控制面板
3. 点击「获取当前页面」按钮，自动填入 URL

### 第二步：配置基准时间

设置一个基准时间，插件只会关注此时间之后产生的新条目。

![screenshot](screenshots/popup.png)

### 第三步：配置邮件通知（可选）

1. 前往 [Resend.com](https://resend.com) 注册账号（免费额度 100 封/天）
2. 在 [API Keys](https://resend.com/api-keys) 页面创建 API Key
3. 将 API Key 填入插件面板的「Resend API Key」输入框
4. 填写收件人邮箱（未验证域名的账户只能发给注册邮箱）
5. 点击「发送测试邮件」验证配置

### 第四步：启动监控

点击「开始监控」按钮，插件将立即执行一次扫描，之后每 10 分钟自动检查。

---

## 🛠 自定义选择器

默认选择器适用于**邮箱**。如需监控其他网站，修改 `background.js` 顶部的 `SELECTORS` 常量：

```js
const SELECTORS = {
  listSelector: 'div[sign="letter"]',  // 列表行容器
  titleSelector: '.il0 .da0',          // 标题元素
  timeSelector: '.eO0',                // 时间元素
  attachSelector: '',                  // 附件名元素（可选）
  idSelector: ''                       // 唯一标识元素（可选）
};
```

> 修改后重载插件即可生效。

---

## ✉️ 邮件配置详解

插件直接调用 **Resend API** 发送邮件，无需自建邮件服务。

| 项目 | 说明 |
|------|------|
| **免费额度** | 100 封/天 |
| **发件地址** | `onboarding@resend.dev`（默认） |
| **收件限制** | 未验证域名时，仅能发给 Resend 注册邮箱 |
| **自定义域名** | 在 Resend 中添加并验证域名后，可任意收发 |

如需使用自定义发件域名，修改 `background.js` 中的 `from` 字段即可。

---

## 📁 文件结构

```
web-monitor/
├── manifest.json          # Chrome 扩展配置 (Manifest V3)
├── background.js          # Service Worker：定时器、监控逻辑、邮件发送
├── content.js             # Content Script：页面数据提取与时间过滤
├── popup.html             # 弹出面板界面
├── popup.js               # 弹出面板逻辑
├── icons/                 # 图标（16/48/128）
└── smtp-proxy/            # Cloudflare Worker 邮件代理（可选，进阶用户使用）
    ├── worker.js
    └── wrangler.toml
```

## ⚙️ 工作原理

```
定时器触发 / 手动执行
    │
    ▼
查找或后台创建目标标签页
    │
    ▼
刷新页面 → 等待加载完成
    │
    ▼
注入 Content Script 提取列表数据
    │
    ▼
按基准时间过滤 → 按标题+时间去重 → 排除已处理条目
    │
    ▼
有新条目 → 通过 Resend API 发送邮件通知
    │
    ▼
更新已处理记录 & 统计
```

整个过程在后台静默完成，不会弹出或激活任何标签页。

## ❓ 常见问题

<details>
<summary><b>为什么邮件发送失败？</b></summary>

1. 检查 Resend API Key 是否正确（以 `re_` 开头）
2. 未验证域名时，收件人必须是 Resend 注册邮箱
3. 检查 Resend 免费额度是否用完（100 封/天）
</details>

<details>
<summary><b>为什么提取到重复条目？</b></summary>

部分页面 DOM 存在重复结构。插件已内置按「标题 + 时间」去重，极端情况可自行配置 `idSelector` 增强去重。
</details>

<details>
<summary><b>如何修改检查频率？</b></summary>

修改 `popup.js` 第 84 行的 `periodInMinutes: 10` 即可。
</details>

<details>
<summary><b>怎么支持其他网站？</b></summary>

修改 `background.js` 中的 `SELECTORS` 常量，将 CSS 选择器改为目标网站的对应元素即可。
</details>

## 📄 License

MIT © [hairow]

---

> 💡 如果这个项目对你有帮助，欢迎 Star ⭐ 和捐赠支持！

## ☕ 捐赠支持

如果这个插件帮你省了时间，欢迎请我喝杯咖啡~

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="images/alipay-qr.jpg" width="200" alt="支付宝收款码"><br>
        <b>支付宝</b>
      </td>
    </tr>
  </table>
</div>

