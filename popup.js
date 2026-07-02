// ==================== Popup 逻辑 ====================

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');

let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + type;
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2500);
}

// 加载已保存的配置
async function loadConfig() {
  const config = await chrome.storage.local.get([
    'targetUrl', 'baseTime', 'recipients', 'resendApiKey', 'isRunning', 'stats'
  ]);
  if (config.targetUrl) $('currentUrl').textContent = config.targetUrl;
  if (config.baseTime) $('baseTime').value = config.baseTime;
  if (config.recipients) $('recipients').value = config.recipients;
  if (config.resendApiKey) $('resendApiKey').value = config.resendApiKey;

  updateStatus(config.isRunning || false);
  updateStats(config.stats || { new: 0, emailed: 0 });
}

function updateStatus(running) {
  const badge = $('statusBadge');
  if (running) {
    badge.textContent = '运行中';
    badge.className = 'status-badge running';
    $('btnStart').textContent = '⏸ 更新配置';
  } else {
    badge.textContent = '已停止';
    badge.className = 'status-badge stopped';
    $('btnStart').textContent = '▶ 开始监控';
  }
}

function updateStats(stats) {
  $('statNew').textContent = stats.new || 0;
  $('statEmailed').textContent = stats.emailed || 0;
}

// 保存配置
async function saveConfig() {
  const config = {
    targetUrl: $('currentUrl').textContent === '请打开目标页面后点击"获取当前页面"' ? '' : $('currentUrl').textContent,
    baseTime: $('baseTime').value,
    recipients: $('recipients').value.trim(),
    resendApiKey: $('resendApiKey').value.trim(),
  };
  await chrome.storage.local.set(config);
  return config;
}

// 获取当前活动标签页 URL
$('btnGetUrl').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith('http')) {
      $('currentUrl').textContent = tab.url;
      // 自动存储
      await chrome.storage.local.set({ targetUrl: tab.url });
      showToast('已获取当前页面 URL', 'success');
    } else {
      showToast('请先打开一个网页', 'error');
    }
  } catch (e) {
    showToast('获取页面失败: ' + e.message, 'error');
  }
});

// 开始监控
$('btnStart').addEventListener('click', async () => {
  const config = await saveConfig();

  // 验证必填项
  if (!config.targetUrl) return showToast('请先获取目标页面 URL', 'error');
  if (!config.baseTime) return showToast('请设置基准时间', 'error');

  // 设置定时器（每 10 分钟）
  await chrome.alarms.create('monitorRefresh', { periodInMinutes: 10 });

  await chrome.storage.local.set({ isRunning: true });
  updateStatus(true);

  // 立即执行一次
  chrome.runtime.sendMessage({ action: 'runMonitor' });

  showToast('监控已启动，每 10 分钟刷新一次', 'success');
});

// 停止监控
$('btnStop').addEventListener('click', async () => {
  await chrome.alarms.clear('monitorRefresh');
  await chrome.storage.local.set({ isRunning: false });
  updateStatus(false);
  showToast('监控已停止');
});

// 手动执行
$('btnManual').addEventListener('click', async () => {
  const config = await saveConfig();
  if (!config.targetUrl) {
    return showToast('请先获取目标页面 URL', 'error');
  }
  chrome.runtime.sendMessage({ action: 'runMonitor' });
  showToast('手动执行中...');
});

// 测试邮件
$('btnTestEmail').addEventListener('click', async () => {
  const recipients = $('recipients').value.trim();
  if (!recipients) return showToast('请先填写收件人邮箱', 'error');

  showToast('正在发送测试邮件...');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'testEmail', recipients });
    if (response && response.ok) {
      showToast('测试邮件发送成功 ✓', 'success');
    } else {
      showToast('发送失败: ' + (response?.error || '未知错误'), 'error');
    }
  } catch (err) {
    showToast('发送失败: ' + err.message, 'error');
  }
});

// 清除已处理记录
$('btnClear').addEventListener('click', async () => {
  if (confirm('确定要清除所有已处理记录和统计数据吗？')) {
    await chrome.storage.local.set({
      processedItems: [],
      stats: { new: 0, emailed: 0 }
    });
    updateStats({ new: 0, emailed: 0 });
    showToast('记录已清除', 'success');
  }
});

// 监听来自 background 的统计更新
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateStats') {
    updateStats(msg.stats);
  }
});

// ==================== 输入框失焦时自动保存 ====================
['baseTime', 'recipients', 'resendApiKey'].forEach(id => {
  $(id).addEventListener('blur', () => {
    const val = $(id).value.trim();
    chrome.storage.local.set({ [id]: val });
  });
});

// 初始化
loadConfig();

// 定期刷新统计
setInterval(async () => {
  const { stats } = await chrome.storage.local.get('stats');
  if (stats) updateStats(stats);
}, 2000);
