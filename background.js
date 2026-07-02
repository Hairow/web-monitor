// ==================== Background Service Worker ====================

// 选择器配置（适用于网易邮箱 126.com）
const SELECTORS = {
  listSelector: 'div[sign="letter"]',
  titleSelector: '.il0 .da0',
  timeSelector: '.eO0',
  attachSelector: '',
  idSelector: ''
};
//发件人邮箱地址 
const FROM = 'Web Monitor <onboarding@resend.dev>'

// 定时器触发
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'monitorRefresh') {
    console.log('[WebMonitor] 定时器触发，执行监控...');
    runMonitor();
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'runMonitor') {
    runMonitor().then(() => sendResponse({ ok: true }));
    return true; // 保持消息通道
  }
  if (msg.action === 'testEmail') {
    sendTestEmail(msg.recipients).then(result => sendResponse(result));
    return true;
  }
});

// 核心监控逻辑
async function runMonitor() {
  console.log('[WebMonitor] ====== 开始监控周期 ======');

  const config = await chrome.storage.local.get([
    'targetUrl', 'baseTime', 'recipients', 'isRunning', 'resendApiKey'
  ]);

  if (!config.isRunning) {
    console.log('[WebMonitor] 监控未启用，跳过');
    return;
  }

  if (!config.targetUrl) {
    console.error('[WebMonitor] 未配置目标 URL');
    return;
  }

  try {
    // 1. 查找或打开目标标签页
    let tab = await findOrCreateTab(config.targetUrl);

    // 2. 等待页面加载完成，然后刷新
    await chrome.tabs.reload(tab.id);
    await waitForTabLoad(tab.id);

    // 3. 注入 content script 并提取数据（带重试，content.js 内部按 baseTime 过滤）
    console.log('[WebMonitor] 准备向 tab', tab.id, '发送 extractItems 消息...');
    const results = await sendMessageWithRetry(tab.id, {
      action: 'extractItems',
      config: {
        ...SELECTORS,
        baseTime: config.baseTime
      }
    });

    console.log('[WebMonitor] 提取结果:', results);

    if (!results || !results.items || results.items.length === 0) {
      console.log('[WebMonitor] 未提取到任何条目');
      await updateStats();
      return;
    }

    // 3.5 去重：按 标题+时间 组合去重（页面 DOM 可能存在重复结构）
    const seenKeys = new Set();
    const uniqueItems = results.items.filter(item => {
      const key = (item.titleText || '') + '||' + (item.timeText || '');
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    if (uniqueItems.length < results.items.length) {
      console.log(`[WebMonitor] 去重: ${results.items.length} -> ${uniqueItems.length}`);
    }

    // 4. 过滤未处理过的条目（时间过滤已在 content.js 完成）
    const { processedItems = [] } = await chrome.storage.local.get('processedItems');

    const newItems = uniqueItems.filter(item => {
      const itemKey = SELECTORS.idSelector
        ? (item.idText || item.titleText + item.timeText)
        : (item.titleText + item.timeText);
      return !processedItems.includes(itemKey);
    });

    console.log(`[WebMonitor] 新条目: ${newItems.length} / 去重后: ${uniqueItems.length}`);

    if (newItems.length === 0) {
      console.log('[WebMonitor] 没有新条目');
      await updateStats();
      return;
    }

    // 5. 发送邮件通知（只发送标题、日期、附件名称，不下载文件）
    let emailedCount = 0;
    if (config.recipients && newItems.length > 0) {
      try {
        await sendEmailNotification(config, newItems);
        emailedCount = newItems.length;
        console.log('[WebMonitor] 邮件已发送');
      } catch (err) {
        console.error('[WebMonitor] 发送邮件失败:', err);
        chrome.notifications.create('email-error', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Web Monitor - 邮件发送失败',
          message: err.message
        });
      }
    }

    // 6. 记录已处理条目（避免重复）
    const newKeys = newItems.map(item => {
      return SELECTORS.idSelector
        ? (item.idText || item.titleText + item.timeText)
        : (item.titleText + item.timeText);
    });

    const updatedProcessed = [...new Set([...processedItems, ...newKeys])];
    await chrome.storage.local.set({ processedItems: updatedProcessed });

    // 7. 更新统计
    const { stats = { new: 0, emailed: 0 } } = await chrome.storage.local.get('stats');
    stats.new += newItems.length;
    stats.emailed += emailedCount;
    await chrome.storage.local.set({ stats });

    // 通知 popup 更新
    chrome.runtime.sendMessage({ action: 'updateStats', stats }).catch(() => { });

    // 系统通知
    chrome.notifications.create('monitor-done', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Web Monitor - 发现新条目',
      message: `发现 ${newItems.length} 个新条目${emailedCount > 0 ? '，邮件已发送' : ''}`
    });

    console.log(`[WebMonitor] ====== 监控周期完成: ${newItems.length} 新条目 ======`);

  } catch (err) {
    console.error('[WebMonitor] 监控执行出错:', err);
  }
}

// 查找或创建标签页
async function findOrCreateTab(url) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => {
    try {
      const tabUrl = new URL(t.url);
      const targetUrl = new URL(url);
      return tabUrl.origin === targetUrl.origin && tabUrl.pathname === targetUrl.pathname;
    } catch { return false; }
  });

  if (existing) {
    return existing;
  }

  return await chrome.tabs.create({ url, active: false });
}

// 等待标签页加载完成
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // 超时不阻塞
    }, 15000);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // 额外等待确保动态内容渲染
        setTimeout(resolve, 3000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 带重试的 sendMessage（解决 reload 后 content script 未就绪的竞态）
async function sendMessageWithRetry(tabId, message, maxRetries = 5, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[WebMonitor] sendMessage 尝试 ${i + 1}/${maxRetries}...`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log('[WebMonitor] sendMessage 成功收到响应');
      return response;
    } catch (err) {
      console.warn(`[WebMonitor] sendMessage 第 ${i + 1} 次失败:`, err.message);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(`sendMessage 重试 ${maxRetries} 次后仍然失败`);
}

// 解析时间文本
function parseTime(timeText) {
  if (!timeText) return null;
  const cleaned = timeText.trim();
  // 尝试解析常见格式
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  // 尝试中文日期格式: 2024-01-15 14:30:00
  const cnMatch = cleaned.match(/(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})[日\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (cnMatch) {
    const [, y, m, d, h, min, s] = cnMatch;
    return new Date(+y, +m - 1, +d, +h, +min, +(s || 0)).getTime();
  }
  return null;
}


// ==================== 邮件通知 (Resend API) ====================
const RESEND_API_URL = 'https://api.resend.com/emails';

// 发送邮件通知 — 直接从 storage 读取用户配置的 Resend API Key，调用 Resend API
async function sendEmailNotification(config, items) {
  const { resendApiKey } = config.resendApiKey;

  if (!resendApiKey) {
    throw new Error('未配置 Resend API Key，请在插件面板中填写');
  }

  const recipients = config.recipients.split(',').map(s => s.trim());
  if (recipients.length === 0) {
    throw new Error('未配置收件人，请在插件面板中填写');
  }

  const subject = `[Web Monitor] 发现 ${items.length} 个新条目`;
  const body = buildEmailBody(items, config.targetUrl);


  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM,
      to: recipients,
      subject: subject,
      html: body
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Resend API 返回 ${response.status}`);
  }

  const result = await response.json();
  console.log('[WebMonitor] 邮件发送成功, id:', result.id);
}

function buildEmailBody(items, targetUrl) {
  const now = new Date().toLocaleString('zh-CN');
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #1a73e8;">📡 Web Monitor 监控报告</h2>
      <p><strong>监控时间：</strong>${now}</p>
      <p><strong>目标页面：</strong><a href="${targetUrl}">${targetUrl}</a></p>
      <p><strong>发现新条目：</strong>${items.length} 个</p>
      <hr style="border: 1px solid #e0e0e0;">
      <h3>新条目列表：</h3>
      <table style="width:100%; border-collapse:collapse; border:1px solid #ddd;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">标题</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">日期</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">附件</th>
        </tr>`;

  items.forEach(item => {
    html += `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${item.titleText || '—'}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.timeText || 'N/A'}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.attachName || '—'}</td>
        </tr>`;
  });

  html += `
      </table>
      <hr style="border: 1px solid #e0e0e0;">
      <p style="color:#888;font-size:12px;">此邮件由 Web Monitor Chrome 扩展自动发送</p>
    </div>`;

  return html;
}

// 发送测试邮件
async function sendTestEmail(recipients) {
  const { resendApiKey } = await chrome.storage.local.get('resendApiKey');

  if (!resendApiKey) {
    return { ok: false, error: '未配置 Resend API Key' };
  }

  console.log('[WebMonitor] 发送测试邮件到:', recipients);
  const now = new Date().toLocaleString('zh-CN');
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #1a73e8;">📡 Web Monitor 测试邮件</h2>
      <p>这是一封测试邮件，用于验证邮件通知功能是否正常。</p>
      <p><strong>发送时间：</strong>${now}</p>
      <hr style="border: 1px solid #e0e0e0;">
      <p style="color:#888;font-size:12px;">如果你收到这封邮件，说明邮件功能配置成功 ✓</p>
    </div>`;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: recipients.split(',').map(s => s.trim()),
        subject: '[Web Monitor] 测试邮件',
        html
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { ok: false, error: errData.message || `Resend API 返回 ${response.status}` };
    }

    console.log('[WebMonitor] 测试邮件发送成功');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// 更新统计
async function updateStats() {
  const { stats = { new: 0, emailed: 0 } } = await chrome.storage.local.get('stats');
  chrome.runtime.sendMessage({ action: 'updateStats', stats }).catch(() => { });
}

console.log('[WebMonitor] Background Service Worker 已启动');
