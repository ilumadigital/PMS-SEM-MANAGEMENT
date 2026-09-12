const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

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

async function sendFreeShuttleConfirmation({ to, guestName, propertyName, reservationId, portalUrl, transfer }) {
    if (!to) return { sent: false, status: 'guest_email_missing' };
    const config = smtpConfig();
    const mailer = getTransporter();
    const logoAttachment = brandLogoAttachment();
    const airportTime = transfer?.approximateArrivalTimeAirport || (transfer?.scheduledAt ? String(transfer.scheduledAt).slice(11, 16) : '');
    const subject = `Your free airport shuttle - ${propertyName || 'SEM Property'}`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden"><tr><td style="background:#11110f;padding:28px 30px"><img src="cid:sem-logo@sem-management" alt="SEM" width="150" style="display:block;width:150px;max-width:100%;height:auto;filter:brightness(0) invert(1)"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#92774f">SEM Mobility</div><h1 style="margin:8px 0 12px;font-size:26px;line-height:1.2">Your free airport shuttle is registered</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569">Hello ${escapeHtml(guestName || 'Guest')}, your free shuttle for ${escapeHtml(propertyName || 'SEM Property')} has been added to reservation ${escapeHtml(reservationId || '')}.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:14px;padding:6px 18px"><tr><td style="padding:10px 0;color:#64748b;font-size:13px">Approx. airport arrival</td><td align="right" style="padding:10px 0;font-weight:800">${escapeHtml(airportTime || 'To be confirmed')}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:13px">Guests</td><td align="right" style="padding:10px 0;font-weight:800">${escapeHtml(transfer?.passengers || 1)}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:13px">Cabin luggages</td><td align="right" style="padding:10px 0;font-weight:800">${escapeHtml(transfer?.cabinLuggages || 0)}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:13px">Luggages</td><td align="right" style="padding:10px 0;font-weight:800">${escapeHtml(transfer?.luggages ?? transfer?.luggage ?? 0)}</td></tr><tr><td style="padding:10px 0;color:#64748b;font-size:13px">Flight</td><td align="right" style="padding:10px 0;font-weight:800">${escapeHtml(transfer?.flightInfo || 'Not provided')}</td></tr></table><p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b">Driver, vehicle and shuttle status will be updated in your Guest Portal.</p>${portalUrl ? `<p style="margin:22px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#171612;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">Open my Guest Portal</a></p>` : ''}</td></tr></table></td></tr></table></body></html>`;
    const info = await mailer.sendMail({
        from: `"SEM Mobility" <${config.from}>`,
        to, subject, html,
        attachments: logoAttachment ? [logoAttachment] : [],
    });
    return { sent: true, status: 'sent', messageId: info.messageId || null };
}
module.exports = { sendTwoFactorCode, sendFreeShuttleConfirmation };
