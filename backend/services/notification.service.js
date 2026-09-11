const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

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

function brandLogoPath() {
    const candidates = [
        process.env.BRAND_LOGO_PATH,
        '/brand/sem-logo.webp',
        path.resolve(__dirname, '../../frontend/src/assets/sem-logo.webp'),
    ].filter(Boolean);
    return candidates.find((candidate) => {
        try { return fs.existsSync(candidate); } catch { return false; }
    }) || null;
}

function brandLogoAttachment() {
    const logoPath = brandLogoPath();
    if (!logoPath) return null;
    return {
        filename: 'sem-logo.webp',
        path: logoPath,
        cid: 'sem-logo@sem-management',
        contentType: 'image/webp',
        contentDisposition: 'inline',
    };
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

    const logoAttachment = brandLogoAttachment();
    await mailer.sendMail({
        from: `"SEM PMS Security" <${config.from}>`,
        to,
        subject: `${code} is your SEM PMS verification code`,
        text: `${greeting}\n\nYour SEM PMS verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not try to sign in, you can ignore this email.\n`,
        attachments: logoAttachment ? [logoAttachment] : [],
        html: `<!doctype html>
<html>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
          <tr><td><img src="cid:sem-logo@sem-management" alt="SEM" width="150" style="display:block;width:150px;max-width:100%;height:auto"></td></tr>
          <tr><td style="padding-top:18px;font-size:24px;font-weight:700">Security verification</td></tr>
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
