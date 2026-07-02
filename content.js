// ==================== Content Script ====================
// 注入到目标页面，负责提取列表数据

console.log('[WebMonitor Content] 已注入页面');

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'extractItems') {
    const items = extractItems(msg.config);
    sendResponse({ items });
  }
  return true;
});

/**
 * 解析时间文本（与 background.js 保持一致）
 */
function parseTime(timeText) {
  if (!timeText) return null;
  const cleaned = timeText.trim();
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  const cnMatch = cleaned.match(/(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})[日\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (cnMatch) {
    const [, y, m, d, h, min, s] = cnMatch;
    return new Date(+y, +m - 1, +d, +h, +min, +(s || 0)).getTime();
  }
  return null;
}

/**
 * 根据配置的选择器从页面提取列表条目，并按基准时间过滤
 */
function extractItems(config) {
  const { listSelector, titleSelector, timeSelector, attachSelector, idSelector, baseTime } = config;

  console.log('[WebMonitor Content] 提取数据，选择器:', config);

  // 获取所有列表行
  const rows = document.querySelectorAll(listSelector);
  console.log(`[WebMonitor Content] 找到 ${rows.length} 个列表行`);

  const baseTimestamp = baseTime ? new Date(baseTime).getTime() : 0;
  const items = [];

  rows.forEach((row, index) => {
    try {
      // 提取标题
      let titleText = '';
      if (titleSelector) {
        const titleEl = row.querySelector(titleSelector);
        if (titleEl) {
          titleText = titleEl.textContent.trim();
        }
      }

      // 提取时间（优先读取 title 属性，如 126 邮箱的 .eO0）
      let timeText = '';
      if (timeSelector) {
        const timeEl = row.querySelector(timeSelector);
        if (timeEl) {
          timeText = (timeEl.getAttribute('title') || timeEl.textContent || '').trim();
        }
      }

      // 按基准时间过滤：只保留基准时间之后的条目
      if (baseTimestamp > 0) {
        const itemTime = parseTime(timeText);
        if (!itemTime || itemTime <= baseTimestamp) return;
      }

      // 提取附件名称（只取文本，不下载）
      let attachName = '';
      if (attachSelector) {
        const attachEl = row.querySelector(attachSelector);
        if (attachEl) {
          attachName = attachEl.textContent.trim() || attachEl.getAttribute('title') || '';
        }
      }

      // 提取唯一标识（优先读取元素 id 属性）
      let idText = '';
      if (idSelector) {
        const idEl = row.querySelector(idSelector);
        if (idEl) {
          idText = idEl.getAttribute('id') || idEl.textContent.trim() || '';
        }
      } else {
        // 默认使用条目自身的 id 属性
        idText = row.getAttribute('id') || '';
      }

      items.push({
        index,
        titleText,
        timeText,
        attachName,
        idText,
        rowHtml: row.outerHTML.substring(0, 500)
      });
    } catch (err) {
      console.error(`[WebMonitor Content] 解析第 ${index} 行出错:`, err);
    }
  });

  console.log(`[WebMonitor Content] 找到 ${rows.length} 行，时间过滤后剩余 ${items.length} 行`);
  return items;
}
