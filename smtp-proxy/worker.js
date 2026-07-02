// ==================== SMTP 代理服务 (Cloudflare Worker 免费版) ====================
// 通过 Resend API 发送邮件 — 免费 100 封/天，无需 Paid 计划
//
// 部署步骤:
//   1. 注册 https://resend.com (免费)
//   2. 获取 API Key: https://resend.com/api-keys
//   3. 设置 wrangler secret:  wrangler secret put RESEND_API_KEY
//   4. 部署:                    wrangler deploy
//
// 如果想用自己的域名发件 (如 xxx@126.com):
//   在 Resend 中添加并验证你的域名 https://resend.com/domains
//   然后修改下方 FROM_EMAIL 为你的域名邮箱
//   未验证域名时，可使用 Resend 默认发件地址

// ============ 邮件配置 ============
const FROM_NAME = 'Web Monitor';
const FROM_EMAIL = 'onboarding@resend.dev';  // 验证域名后可改为你的邮箱



// ==================================

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { to, subject, html } = await request.json();

      if (!to || !subject || !html) {
        return new Response(JSON.stringify({ error: '缺少必填参数: to, subject, html' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const recipients = Array.isArray(to) ? to : to.split(',').map(s => s.trim());

      // ⚠️ 测试域名只能发到 Resend 注册邮箱，这里写死你自己的邮箱
      //    验证域名后，可以删除这行，让它从请求中读取收件人
      const MY_EMAIL = env.MY_EMAIL;
      // 测试域名限制：始终只发给自己，
      const actualTo = [MY_EMAIL];
      // 验证域名后可以发给他人
      //const actualTo=recipients

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: actualTo,
          subject: subject,
          html: html
        })
      });

      if (!resendResp.ok) {
        const errText = await resendResp.text();
        throw new Error(`Resend API error (${resendResp.status}): ${errText}`);
      }

      const result = await resendResp.json();

      return new Response(JSON.stringify({ success: true, id: result.id }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Email error:', err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
