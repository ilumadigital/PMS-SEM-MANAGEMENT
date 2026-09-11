const nodemailer = require('nodemailer');

let transporter = null;

function smtpConfig() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    const from = String(process.env.SMTP_FROM || user).trim();

    if (!host || !user || !pass || !from) {
        const error = new Error('SMTP is not fully configured. SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM are required.');
        error.code = 'SMTP_CONFIG_MISSING';
        throw error;
    }

    return { host, port, secure, user, pass, from };
}

function getTransporter() {
    if (transporter) return transporter;
    const config = smtpConfig();
    transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
    return transporter;
}

async function sendTwoFactorCode({ to, code, firstName }) {
    const config = smtpConfig();
    const mailer = getTransporter();
    const displayName = String(firstName || '').trim();
    const greeting = displayName ? `Hi ${displayName},` : 'Hello,';

    await mailer.sendMail({
        from: `"SEM PMS Security" <${config.from}>`,
        to,
        subject: `${code} is your SEM PMS verification code`,
        text: `${greeting}\n\nYour SEM PMS verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not try to sign in, you can ignore this email.\n`,
        html: `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
          <tr><td style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#2563eb">SEM PMS</td></tr>
          <tr><td style="padding-top:14px;font-size:24px;font-weight:700">Security verification</td></tr>
          <tr><td style="padding-top:16px;font-size:15px;line-height:1.6;color:#475569">${greeting} Use the code below to finish signing in.</td></tr>
          <tr><td align="center" style="padding:28px 0">
            <div style="display:inline-block;padding:16px 24px;border-radius:14px;background:#eff6ff;color:#1d4ed8;font-size:30px;font-weight:700;letter-spacing:8px">${code}</div>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.6;color:#64748b">The code expires in 10 minutes. If you did not try to sign in, no action is required.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
    });
}

module.exports = { sendTwoFactorCode };
