const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const cloudbedsService = require('./cloudbeds.service');

const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const TOKEN_TTL_DAYS = Number(process.env.GUEST_PORTAL_TOKEN_TTL_DAYS || 90);

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portals (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        external_reservation_id VARCHAR(128) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        guest_email VARCHAR(255) NULL,
        guest_name VARCHAR(255) NULL,
        property_id VARCHAR(128) NULL,
        property_name VARCHAR(255) NULL,
        reservation_snapshot_json LONGTEXT NOT NULL,
        submitted_json LONGTEXT NULL,
        addon_requests_json LONGTEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'invited',
        sent_at DATETIME NULL,
        opened_at DATETIME NULL,
        completed_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_guest_portal_reservation (source, external_reservation_id),
        UNIQUE KEY uniq_guest_portal_token (token_hash),
        INDEX idx_guest_portal_expiry (expires_at)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portal_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        guest_portal_id BIGINT NOT NULL,
        channel VARCHAR(32) NOT NULL DEFAULT 'email',
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NULL,
        status VARCHAR(32) NOT NULL,
        provider_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_guest_portal_messages_portal (guest_portal_id)
    )`);

    await db.query(`ALTER TABLE guest_portal_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(64) NULL AFTER guest_portal_id`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portal_stay_info (
        source VARCHAR(32) NOT NULL DEFAULT 'cloudbeds',
        external_reservation_id VARCHAR(128) NOT NULL,
        room_access_code VARCHAR(255) NULL,
        building_access_code VARCHAR(255) NULL,
        wifi_name VARCHAR(255) NULL,
        wifi_password VARCHAR(255) NULL,
        property_address VARCHAR(500) NULL,
        checkin_instructions TEXT NULL,
        checkout_instructions TEXT NULL,
        parking_info TEXT NULL,
        hot_water_info TEXT NULL,
        emergency_contact VARCHAR(255) NULL,
        support_phone VARCHAR(255) NULL,
        useful_info TEXT NULL,
        access_released TINYINT(1) NOT NULL DEFAULT 0,
        updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (source, external_reservation_id)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_service_catalog (
        id VARCHAR(80) PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'service',
        description TEXT NULL,
        price_label VARCHAR(100) NULL,
        price_amount DECIMAL(10,2) NULL,
        requires_schedule TINYINT(1) NOT NULL DEFAULT 0,
        available_prearrival TINYINT(1) NOT NULL DEFAULT 1,
        available_instay TINYINT(1) NOT NULL DEFAULT 1,
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 100,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_service_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        guest_portal_id BIGINT NOT NULL,
        service_id VARCHAR(80) NOT NULL,
        service_name VARCHAR(180) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        requested_for DATETIME NULL,
        guest_notes TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'requested',
        price_amount DECIMAL(10,2) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guest_service_portal (guest_portal_id),
        INDEX idx_guest_service_status (status)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id VARCHAR(100) NULL,
        property_id VARCHAR(100) NULL,
        guest_name VARCHAR(160) NOT NULL,
        guest_phone VARCHAR(80) NULL,
        transfer_type VARCHAR(40) NOT NULL DEFAULT 'airport_pickup',
        pickup_location VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        scheduled_at DATETIME NOT NULL,
        passengers INT NOT NULL DEFAULT 1,
        luggage INT NOT NULL DEFAULT 0,
        flight_info VARCHAR(120) NULL,
        driver VARCHAR(120) NULL,
        vehicle VARCHAR(120) NULL,
        notes TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'unassigned',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transfer_schedule (scheduled_at),
        INDEX idx_transfer_status (status),
        INDEX idx_transfer_property (property_id)
    )`);

    const catalogCount = await db.query('SELECT COUNT(*) total FROM guest_service_catalog');
    if (Number(catalogCount[0]?.total || 0) === 0) {
        const seeds = [
            ['airport-transfer', 'Airport Transfer', 'mobility', 'Private airport pickup or drop-off arranged by SEM.', 'By request', null, 1, 10],
            ['port-transfer', 'Port Transfer', 'mobility', 'Private transfer to or from the port.', 'By request', null, 1, 20],
            ['private-driver', 'Private Driver', 'mobility', 'Private driver for a scheduled route or custom itinerary.', 'By request', null, 1, 30],
            ['early-checkin', 'Early Check-in', 'stay', 'Request access before the standard check-in time, subject to availability.', 'From €20', 20, 1, 40],
            ['late-checkout', 'Late Check-out', 'stay', 'Request a later departure time, subject to availability.', 'From €20', 20, 1, 50],
            ['extra-cleaning', 'Extra Cleaning', 'housekeeping', 'Additional cleaning service during your stay.', 'By request', null, 1, 60],
            ['linen-change', 'Fresh Linen & Towels', 'housekeeping', 'Request an extra linen or towel change.', 'By request', null, 0, 70],
            ['baby-cot', 'Baby Cot', 'stay', 'Request a baby cot for the property.', 'By request', null, 0, 80],
            ['luggage-storage', 'Luggage Assistance', 'stay', 'Request luggage storage or assistance before arrival or after departure.', 'By request', null, 1, 90],
            ['welcome-package', 'Welcome Package', 'experience', 'Arrange groceries, refreshments or a custom welcome setup.', 'By request', null, 0, 100],
            ['celebration-setup', 'Celebration Setup', 'experience', 'Flowers, birthday, anniversary or special occasion setup.', 'By request', null, 1, 110],
            ['local-experience', 'Local Experience', 'experience', 'Ask SEM to arrange activities, dining or a custom local experience.', 'By request', null, 1, 120],
        ];
        for (const seed of seeds) {
            await db.query(`INSERT INTO guest_service_catalog
                (id, name, category, description, price_label, price_amount, requires_schedule, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, seed);
        }
    }

    tablesReady = true;
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeJson(value, fallback) {
    try {
        if (!value) return fallback;
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return fallback;
    }
}

function publicReservationSnapshot(reservation) {
    return {
        id: reservation.id,
        guestName: reservation.guestName || 'Guest',
        guestEmail: reservation.guestEmail || '',
        guestPhone: reservation.guestPhone || '',
        propertyId: reservation.propertyId || '',
        propertyName: reservation.property?.name || 'SEM Property',
        propertyCity: reservation.property?.city || '',
        roomNumber: reservation.roomNumber || 'Unassigned',
        roomType: reservation.roomType || '',
        arrivalDate: reservation.arrivalDate || '',
        arrivalTime: reservation.arrivalTime || '',
        departureDate: reservation.departureDate || '',
        departureTime: reservation.departureTime || '',
        nights: reservation.nights || null,
        status: reservation.status || 'confirmed',
        source: reservation.source || 'cloudbeds',
    };
}

async function findReservation(reservationId) {
    const snapshot = await cloudbedsService.listReservations();
    return snapshot.reservations.find((item) => String(item.id) === String(reservationId)) || null;
}

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465,
        auth: { user, pass },
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
    });
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

function darkEmailLogoHtml() {
    return '<img src="cid:sem-logo@sem-management" alt="SEM" width="150" style="display:block;width:150px;max-width:100%;height:auto;filter:brightness(0) invert(1);-webkit-filter:brightness(0) invert(1);">';
}

function guestPortalSecret() {
    const secret = process.env.GUEST_PORTAL_SECRET || process.env.JWT_SECRET || process.env.INTEGRATION_SECRET;
    if (!secret) {
        const error = new Error('GUEST_PORTAL_SECRET or JWT_SECRET is required for stable guest links.');
        error.code = 'GUEST_PORTAL_SECRET_MISSING';
        throw error;
    }
    return secret;
}

function portalTokenForReservation(reservationId) {
    return crypto
        .createHmac('sha256', guestPortalSecret())
        .update(`cloudbeds:guest-portal:${String(reservationId)}`)
        .digest('base64url');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDateForGuest(value) {
    if (!value) return 'To be confirmed';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

function pdfSafe(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function bookingConfirmationHtml(reservation) {
    const firstName = escapeHtml(String(reservation.guestName || 'Guest').trim().split(/\s+/)[0] || 'Guest');
    const propertyName = escapeHtml(reservation.propertyName || 'SEM Property');
    const bookingRef = escapeHtml(reservation.id || '');
    const arrival = escapeHtml(formatDateForGuest(reservation.arrivalDate));
    const departure = escapeHtml(formatDateForGuest(reservation.departureDate));
    const room = escapeHtml([reservation.roomNumber, reservation.roomType].filter(Boolean).join(' - ') || 'To be assigned');

    return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#102a5e">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f4f6fb"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce3ef">
        <tr><td style="padding:20px 26px;background:#0b2f7f;color:#fff">
          ${darkEmailLogoHtml()}
          <div style="margin-top:10px;font-size:13px;font-weight:700">booking confirmation</div>
        </td></tr>
        <tr><td style="padding:28px 30px">
          <div style="font-size:15px;color:#667085">Hello ${firstName}, your reservation is confirmed.</div>
          <div style="margin-top:24px;background:#f3f6fb;padding:24px;text-align:center">
            <div style="font-size:14px">Booking reference</div>
            <div style="margin-top:4px;font-size:30px;font-weight:800;letter-spacing:.05em;color:#0b2f7f">${bookingRef}</div>
          </div>
          <h2 style="margin:30px 0 12px;font-size:26px;color:#0b2f7f">Your stay</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;line-height:1.6">
            <tr><td style="width:120px;color:#667085;padding:5px 0">Property</td><td style="font-weight:700;padding:5px 0">${propertyName}</td></tr>
            <tr><td style="color:#667085;padding:5px 0">Check-in</td><td style="font-weight:700;padding:5px 0">${arrival}</td></tr>
            <tr><td style="color:#667085;padding:5px 0">Check-out</td><td style="font-weight:700;padding:5px 0">${departure}</td></tr>
            <tr><td style="color:#667085;padding:5px 0">Room</td><td style="font-weight:700;padding:5px 0">${room}</td></tr>
          </table>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#667085">A printable booking confirmation PDF is attached to this email. Please keep this message for your records.</p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
}

function portalInviteHtml(portal) {
    const reservation = portal.reservation;
    const firstName = escapeHtml(String(reservation.guestName || 'Guest').trim().split(/\s+/)[0] || 'Guest');
    const propertyName = escapeHtml(reservation.propertyName || 'SEM Property');
    const arrival = escapeHtml(formatDateForGuest(reservation.arrivalDate));
    const departure = escapeHtml(formatDateForGuest(reservation.departureDate));

    return `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:Arial,sans-serif;color:#211e1a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;background:#f5f2ec"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#fffdf9;border:1px solid #e3dbd0;border-radius:22px;overflow:hidden">
        <tr><td style="padding:28px 30px;background:#171612;color:#fff">
          ${darkEmailLogoHtml()}
          <div style="margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.18em;color:#d9c4a3">GUEST EXPERIENCE</div>
          <div style="margin-top:8px;font-size:27px;font-weight:800">Complete your stay details</div>
        </td></tr>
        <tr><td style="padding:30px">
          <p style="margin:0;font-size:16px;line-height:1.6">Hi ${firstName}, your private Guest Portal is ready.</p>
          <div style="margin:22px 0;padding:18px;border-radius:14px;background:#f7f3ed">
            <div style="font-size:17px;font-weight:800">${propertyName}</div>
            <div style="margin-top:8px;font-size:14px;color:#746d63">${arrival} &rarr; ${departure}</div>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#625b52">Please complete your online check-in. After completion, this same private portal becomes your stay hub for property information, room access, Wi-Fi, transfers, services and requests.</p>
          <p style="margin:26px 0"><a href="${escapeHtml(portal.checkinUrl)}" style="display:inline-block;background:#171612;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">Complete online check-in</a></p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8176">Keep this private link secure. You can return to your Guest Portal at any time: <a href="${escapeHtml(portal.portalUrl)}" style="color:#72583a">${escapeHtml(portal.portalUrl)}</a></p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
}

function completedPortalHtml(portalUrl, reservation, stayInfo = {}) {
    const firstName = escapeHtml(String(reservation.guestName || 'Guest').trim().split(/\s+/)[0] || 'Guest');
    const propertyName = escapeHtml(reservation.propertyName || 'SEM Property');
    const accessMessage = stayInfo.accessReleased
        ? 'Your room and building access information is available in the portal now.'
        : 'Your room and building access codes will appear in the portal as soon as SEM releases them.';

    return `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:Arial,sans-serif;color:#211e1a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;background:#f5f2ec"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#fffdf9;border:2px solid #c7a66d;border-radius:22px;overflow:hidden">
        <tr><td style="padding:26px 30px;background:#171612;color:#fff">
          ${darkEmailLogoHtml()}
          <div style="margin-top:14px;font-size:11px;font-weight:800;letter-spacing:.18em;color:#e6c991">IMPORTANT - KEEP THIS EMAIL</div>
          <div style="margin-top:8px;font-size:27px;font-weight:800">Your stay portal is active</div>
        </td></tr>
        <tr><td style="padding:30px">
          <p style="margin:0;font-size:16px;line-height:1.7">Hi ${firstName}, your online check-in for <strong>${propertyName}</strong> is complete.</p>
          <p style="margin:18px 0;font-size:14px;line-height:1.7;color:#625b52">This email contains the private link you should keep for your entire stay. The Guest Portal is where you can return for <strong>room/building access codes, Wi-Fi, check-in and checkout instructions, property information, transfers, services and support</strong>.</p>
          <div style="margin:20px 0;padding:16px;border-radius:14px;background:#f7f0e4;font-size:13px;font-weight:700;color:#6b5233">${escapeHtml(accessMessage)}</div>
          <p style="margin:26px 0"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#171612;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">Open my Guest Portal</a></p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8176">Private stay link: <a href="${escapeHtml(portalUrl)}" style="color:#72583a">${escapeHtml(portalUrl)}</a><br>Please do not forward this email because the portal can contain access credentials for your room.</p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
}

function buildBookingConfirmationPdf(reservation) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `SEM Booking Confirmation ${reservation.id || ''}` } });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.rect(0, 0, 595.28, 112).fill('#0b2f7f');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28).text('SEM', 48, 34);
        doc.fontSize(13).text('BOOKING CONFIRMATION', 48, 72);

        doc.fillColor('#102a5e').font('Helvetica').fontSize(12).text('Booking reference', 48, 150);
        doc.font('Helvetica-Bold').fontSize(27).text(pdfSafe(reservation.id || ''), 48, 170);

        doc.moveDown(2);
        doc.font('Helvetica-Bold').fontSize(22).text('Your stay', 48, 235);
        doc.moveTo(48, 268).lineTo(547, 268).strokeColor('#d8e0ec').stroke();

        const rows = [
            ['Property', reservation.propertyName || 'SEM Property'],
            ['Check-in', formatDateForGuest(reservation.arrivalDate)],
            ['Check-out', formatDateForGuest(reservation.departureDate)],
            ['Room', [reservation.roomNumber, reservation.roomType].filter(Boolean).join(' - ') || 'To be assigned'],
            ['Guest', reservation.guestName || 'Guest'],
            ['Email', reservation.guestEmail || ''],
        ];
        let y = 292;
        for (const [label, value] of rows) {
            doc.fillColor('#667085').font('Helvetica').fontSize(11).text(pdfSafe(label), 48, y, { width: 110 });
            doc.fillColor('#102a5e').font('Helvetica-Bold').fontSize(12).text(pdfSafe(value), 165, y, { width: 360 });
            y += 34;
        }

        doc.roundedRect(48, y + 14, 499, 92, 10).fill('#f3f6fb');
        doc.fillColor('#102a5e').font('Helvetica-Bold').fontSize(14).text('Reservation confirmed', 68, y + 35);
        doc.fillColor('#5d6b82').font('Helvetica').fontSize(10.5).text(
            'Keep this PDF for your records. A separate email contains your private SEM Guest Portal link for online check-in and stay information.',
            68, y + 58, { width: 455, lineGap: 3 }
        );

        doc.fillColor('#98a2b3').fontSize(9).text('SEM Estate & Mobility', 48, 780, { align: 'center', width: 499 });
        doc.end();
    });
}

async function successfulMessageExists(portalId, messageType) {
    const rows = await db.query(
        `SELECT id FROM guest_portal_messages WHERE guest_portal_id=? AND message_type=? AND status='sent' LIMIT 1`,
        [portalId, messageType]
    );
    return rows.length > 0;
}

async function sendTypedEmail({ portal, to, messageType, subject, html, attachments = [], priority = 'normal', force = false }) {
    if (!force && await successfulMessageExists(portal.id, messageType)) {
        return { sent: false, skipped: true, status: 'already_sent', messageType };
    }

    const transporter = createTransporter();
    if (!transporter) {
        await db.query(
            `INSERT INTO guest_portal_messages (guest_portal_id, message_type, recipient, subject, status, error_message) VALUES (?, ?, ?, ?, 'not_configured', ?)`,
            [portal.id, messageType, to, subject, 'SMTP is not configured on the backend.']
        );
        return { sent: false, skipped: false, status: 'not_configured', messageType };
    }

    const from = process.env.GUEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
    try {
        const logoAttachment = brandLogoAttachment();
        const emailAttachments = logoAttachment ? [logoAttachment, ...attachments] : attachments;
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
            attachments: emailAttachments,
            priority,
            headers: priority === 'high'
                ? { Importance: 'high', 'X-Priority': '1', 'X-MSMail-Priority': 'High' }
                : undefined,
        });
        await db.query(
            `INSERT INTO guest_portal_messages (guest_portal_id, message_type, recipient, subject, status, provider_message_id) VALUES (?, ?, ?, ?, 'sent', ?)`,
            [portal.id, messageType, to, subject, info.messageId || null]
        );
        return { sent: true, skipped: false, status: 'sent', messageType, messageId: info.messageId || null };
    } catch (error) {
        await db.query(
            `INSERT INTO guest_portal_messages (guest_portal_id, message_type, recipient, subject, status, error_message) VALUES (?, ?, ?, ?, 'failed', ?)`,
            [portal.id, messageType, to, subject, String(error.message || error)]
        );
        throw Object.assign(error, { status: 502, code: 'GUEST_EMAIL_SEND_FAILED' });
    }
}

async function createOrRefreshPortal(reservation) {
    await ensureTables();
    const token = portalTokenForReservation(reservation.id);
    const hash = tokenHash(token);
    const snapshot = publicReservationSnapshot(reservation);
    const departure = snapshot.departureDate ? new Date(`${snapshot.departureDate}T23:59:59`) : null;
    const departureExpiry = departure && !Number.isNaN(departure.getTime()) ? new Date(departure.getTime() + 14 * 86400000) : null;
    const defaultExpiry = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000);
    const expiresAt = departureExpiry && departureExpiry > defaultExpiry ? departureExpiry : defaultExpiry;

    await db.query(`INSERT INTO guest_portals
        (source, external_reservation_id, token_hash, guest_email, guest_name, property_id, property_name, reservation_snapshot_json, status, expires_at)
        VALUES ('cloudbeds', ?, ?, ?, ?, ?, ?, ?, 'invited', ?)
        ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash), guest_email=VALUES(guest_email), guest_name=VALUES(guest_name),
        property_id=VALUES(property_id), property_name=VALUES(property_name), reservation_snapshot_json=VALUES(reservation_snapshot_json),
        expires_at=VALUES(expires_at), updated_at=NOW()`, [
        String(reservation.id), hash, snapshot.guestEmail || null, snapshot.guestName || null,
        snapshot.propertyId || null, snapshot.propertyName || null, JSON.stringify(snapshot), expiresAt,
    ]);

    const rows = await db.query(`SELECT id FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservation.id)]);
    return {
        id: rows[0]?.id,
        token,
        reservation: snapshot,
        checkinUrl: `${FRONTEND_URL}/guest/${token}/check-in`,
        portalUrl: `${FRONTEND_URL}/guest/${token}`,
        expiresAt,
    };
}

async function findReservationWithRetry(reservationId) {
    const delays = [0, 1000, 2500, 5000, 8000];
    for (const delay of delays) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const reservation = await findReservation(reservationId);
        if (reservation) return reservation;
    }
    return null;
}

async function sendBookingConfirmation(reservation, portal, force = false) {
    const pdf = await buildBookingConfirmationPdf(portal.reservation);
    const propertyName = portal.reservation.propertyName || 'SEM Property';
    const subject = `Reservation confirmed - ${propertyName} - ${portal.reservation.arrivalDate || ''} to ${portal.reservation.departureDate || ''}`;
    return sendTypedEmail({
        portal,
        to: reservation.guestEmail,
        messageType: 'booking_confirmation',
        subject,
        html: bookingConfirmationHtml(portal.reservation),
        attachments: [{
            filename: `SEM-Booking-${String(portal.reservation.id || 'confirmation').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
        }],
        force,
    });
}

async function sendPortalInvite(reservation, portal, force = false) {
    const propertyName = portal.reservation.propertyName || 'SEM Property';
    const subject = `Complete your Guest Portal - ${propertyName} - ${portal.reservation.arrivalDate || ''} to ${portal.reservation.departureDate || ''}`;
    const result = await sendTypedEmail({
        portal,
        to: reservation.guestEmail,
        messageType: 'portal_invite',
        subject,
        html: portalInviteHtml(portal),
        force,
    });
    if (result.sent) {
        await db.query(`UPDATE guest_portals SET sent_at=NOW(), status=IF(status='completed','completed','invited') WHERE id=?`, [portal.id]);
    }
    return result;
}

async function sendAutomaticReservationEmails(reservationId) {
    if (String(process.env.GUEST_AUTO_EMAILS || 'true').toLowerCase() === 'false') {
        return { skipped: true, reason: 'disabled' };
    }

    const reservation = await findReservationWithRetry(reservationId);
    if (!reservation) {
        throw Object.assign(new Error('Reservation was not available from Cloudbeds after retrying.'), { status: 404, code: 'RESERVATION_NOT_FOUND' });
    }
    if (!reservation.guestEmail) {
        return { skipped: true, reason: 'guest_email_missing', reservationId: String(reservationId) };
    }
    if (['cancelled', 'canceled', 'no_show'].includes(String(reservation.status || '').toLowerCase())) {
        return { skipped: true, reason: 'reservation_not_active', reservationId: String(reservationId) };
    }

    const portal = await createOrRefreshPortal(reservation);
    const results = {};

    try {
        results.bookingConfirmation = await sendBookingConfirmation(reservation, portal, false);
    } catch (error) {
        console.error('❌ [BOOKING CONFIRMATION EMAIL]:', error.message);
        results.bookingConfirmation = { sent: false, status: 'failed', error: error.message };
    }

    try {
        results.portalInvite = await sendPortalInvite(reservation, portal, false);
    } catch (error) {
        console.error('❌ [GUEST PORTAL INVITE EMAIL]:', error.message);
        results.portalInvite = { sent: false, status: 'failed', error: error.message };
    }

    return { reservationId: String(reservationId), portalUrl: portal.portalUrl, ...results };
}

async function sendInstructions(reservationId) {
    const reservation = await findReservationWithRetry(reservationId);
    if (!reservation) throw Object.assign(new Error('Reservation was not found in the connected Cloudbeds property.'), { status: 404, code: 'RESERVATION_NOT_FOUND' });
    if (!reservation.guestEmail) throw Object.assign(new Error('This reservation has no guest email in Cloudbeds.'), { status: 422, code: 'GUEST_EMAIL_MISSING' });

    const portal = await createOrRefreshPortal(reservation);
    const email = await sendPortalInvite(reservation, portal, true);
    return { ...portal, emailSent: email.sent, emailStatus: email.status, messageType: 'portal_invite' };
}

async function sendCompletionEmail(token, portal) {
    const reservation = portal.reservation || {};
    if (!reservation.guestEmail) return { sent: false, status: 'guest_email_missing' };
    const portalUrl = `${FRONTEND_URL}/guest/${token}`;
    const subject = `IMPORTANT - Keep this email: ${reservation.propertyName || 'SEM Property'} Guest Portal & room access`;

    return sendTypedEmail({
        portal: { id: portal.id },
        to: reservation.guestEmail,
        messageType: 'portal_completed',
        subject,
        html: completedPortalHtml(portalUrl, reservation, portal.stayInfo || {}),
        priority: 'high',
        force: false,
    });
}

function mapStayInfo(row, includeSecrets) {
    if (!row) return { accessReleased: false };
    const released = Boolean(row.access_released);
    return {
        accessReleased: released,
        roomAccessCode: includeSecrets || released ? row.room_access_code || '' : '',
        buildingAccessCode: includeSecrets || released ? row.building_access_code || '' : '',
        wifiName: includeSecrets || released ? row.wifi_name || '' : '',
        wifiPassword: includeSecrets || released ? row.wifi_password || '' : '',
        propertyAddress: row.property_address || '',
        checkinInstructions: includeSecrets || released ? row.checkin_instructions || '' : '',
        checkoutInstructions: row.checkout_instructions || '',
        parkingInfo: row.parking_info || '',
        hotWaterInfo: row.hot_water_info || '',
        emergencyContact: row.emergency_contact || '',
        supportPhone: row.support_phone || '',
        usefulInfo: row.useful_info || '',
        updatedAt: row.updated_at || null,
    };
}

function mapCatalog(row) {
    return {
        id: row.id, name: row.name, category: row.category, description: row.description || '',
        priceLabel: row.price_label || (row.price_amount != null ? `€${Number(row.price_amount).toFixed(2)}` : 'By request'),
        priceAmount: row.price_amount == null ? null : Number(row.price_amount), requiresSchedule: Boolean(row.requires_schedule),
        availablePrearrival: Boolean(row.available_prearrival), availableInstay: Boolean(row.available_instay), active: Boolean(row.active), sortOrder: Number(row.sort_order || 100),
    };
}

function mapServiceRequest(row) {
    return { id: String(row.id), serviceId: row.service_id, serviceName: row.service_name, quantity: Number(row.quantity || 1), requestedFor: row.requested_for, guestNotes: row.guest_notes || '', status: row.status, priceAmount: row.price_amount == null ? null : Number(row.price_amount), createdAt: row.created_at };
}

function mapTransfer(row) {
    return { id: String(row.id), type: row.transfer_type, pickupLocation: row.pickup_location, destination: row.destination, scheduledAt: row.scheduled_at, passengers: Number(row.passengers || 1), luggage: Number(row.luggage || 0), flightInfo: row.flight_info || '', driver: row.driver || '', vehicle: row.vehicle || '', notes: row.notes || '', status: row.status, createdAt: row.created_at };
}

async function loadPortalRow(token) {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM guest_portals WHERE token_hash=? AND expires_at>=NOW() LIMIT 1`, [tokenHash(token)]);
    const row = rows[0];
    if (!row) throw Object.assign(new Error('This guest link is invalid or has expired.'), { status: 404, code: 'GUEST_PORTAL_LINK_INVALID' });
    return row;
}

async function getPortalByToken(token, markOpened = true) {
    const row = await loadPortalRow(token);
    if (markOpened && !row.opened_at) await db.query(`UPDATE guest_portals SET opened_at=NOW(), status=IF(status='invited','opened',status) WHERE id=?`, [row.id]);

    const [stayRows, catalogRows, requestRows, transferRows] = await Promise.all([
        db.query(`SELECT * FROM guest_portal_stay_info WHERE source=? AND external_reservation_id=? LIMIT 1`, [row.source, row.external_reservation_id]),
        db.query(`SELECT * FROM guest_service_catalog WHERE active=1 ORDER BY sort_order, name`),
        db.query(`SELECT * FROM guest_service_requests WHERE guest_portal_id=? ORDER BY created_at DESC`, [row.id]),
        db.query(`SELECT * FROM transfers WHERE reservation_id=? ORDER BY scheduled_at DESC`, [row.external_reservation_id]),
    ]);

    const reservation = safeJson(row.reservation_snapshot_json, {});
    const submitted = safeJson(row.submitted_json, {});
    const checkinComplete = row.status === 'completed';
    return {
        id: row.id, status: row.status, reservation, submitted,
        addonRequests: safeJson(row.addon_requests_json, []), sentAt: row.sent_at, openedAt: row.opened_at, completedAt: row.completed_at, expiresAt: row.expires_at,
        stayInfo: mapStayInfo(stayRows[0], false),
        services: catalogRows.map(mapCatalog).filter((item) => checkinComplete ? item.availableInstay : item.availablePrearrival),
        addons: catalogRows.map(mapCatalog).filter((item) => item.availablePrearrival),
        serviceRequests: requestRows.map(mapServiceRequest),
        transfers: transferRows.map(mapTransfer),
        phase: checkinComplete ? 'stay' : 'prearrival',
    };
}

async function saveCheckin(token, payload) {
    const portal = await getPortalByToken(token, false);
    const submitted = {
        guestPhone: String(payload.guestPhone || portal.reservation.guestPhone || ''),
        arrivalTime: String(payload.arrivalTime || ''), departureTime: String(payload.departureTime || ''),
        arrivalMethod: String(payload.arrivalMethod || ''), flightNumber: String(payload.flightNumber || ''),
        specialRequests: String(payload.specialRequests || ''), termsAccepted: Boolean(payload.termsAccepted),
    };
    const addons = Array.isArray(payload.addonRequests) ? payload.addonRequests : [];
    if (!submitted.arrivalTime || !submitted.departureTime) throw Object.assign(new Error('Arrival and departure times are required.'), { status: 422, code: 'CHECKIN_TIMES_REQUIRED' });
    if (!submitted.termsAccepted) throw Object.assign(new Error('The guest must accept the house rules and terms before completing check-in.'), { status: 422, code: 'TERMS_REQUIRED' });

    await db.query(`UPDATE guest_portals SET submitted_json=?, addon_requests_json=?, status='completed', completed_at=NOW() WHERE id=?`, [JSON.stringify(submitted), JSON.stringify(addons), portal.id]);
    await cloudbedsService.saveReservationOperations(portal.reservation.id, {
        arrivalTime: submitted.arrivalTime, departureTime: submitted.departureTime,
        specialRequests: [submitted.specialRequests, submitted.arrivalMethod ? `Arrival method: ${submitted.arrivalMethod}` : '', submitted.flightNumber ? `Flight: ${submitted.flightNumber}` : '', ...addons.map((addon) => `Add-on request: ${addon.name || addon.id}`)].filter(Boolean),
    });

    for (const addon of addons) {
        const existing = await db.query(`SELECT id FROM guest_service_requests WHERE guest_portal_id=? AND service_id=? LIMIT 1`, [portal.id, addon.id]);
        if (!existing.length) await createServiceRequest(token, { serviceId: addon.id, quantity: 1, guestNotes: 'Requested during online check-in' });
    }

    const completedPortal = await getPortalByToken(token, false);
    let completionEmail;
    try {
        completionEmail = await sendCompletionEmail(token, completedPortal);
    } catch (error) {
        console.error('❌ [GUEST PORTAL COMPLETION EMAIL]:', error.message);
        completionEmail = { sent: false, status: 'failed', error: error.message };
    }

    return { ...completedPortal, completionEmail };
}

async function createServiceRequest(token, payload) {
    const row = await loadPortalRow(token);
    const serviceRows = await db.query(`SELECT * FROM guest_service_catalog WHERE id=? AND active=1 LIMIT 1`, [String(payload.serviceId || '')]);
    const service = serviceRows[0];
    if (!service) throw Object.assign(new Error('This service is not currently available.'), { status: 404, code: 'SERVICE_NOT_AVAILABLE' });
    const quantity = Math.max(1, Math.min(20, Number(payload.quantity || 1)));
    const requestedFor = payload.requestedFor ? new Date(payload.requestedFor) : null;
    if (service.requires_schedule && (!requestedFor || Number.isNaN(requestedFor.getTime()))) throw Object.assign(new Error('Please select a date and time for this service.'), { status: 422, code: 'SERVICE_SCHEDULE_REQUIRED' });
    const result = await db.query(`INSERT INTO guest_service_requests (guest_portal_id, service_id, service_name, quantity, requested_for, guest_notes, status, price_amount) VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)`, [row.id, service.id, service.name, quantity, requestedFor, String(payload.guestNotes || ''), service.price_amount]);
    const rows = await db.query(`SELECT * FROM guest_service_requests WHERE id=?`, [result.insertId]);
    return mapServiceRequest(rows[0]);
}

async function createTransferRequest(token, payload) {
    const row = await loadPortalRow(token);
    const reservation = safeJson(row.reservation_snapshot_json, {});
    const pickupLocation = String(payload.pickupLocation || '').trim();
    const destination = String(payload.destination || '').trim();
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    if (!pickupLocation || !destination || !scheduledAt || Number.isNaN(scheduledAt.getTime())) throw Object.assign(new Error('Pickup, destination and date/time are required.'), { status: 422, code: 'TRANSFER_FIELDS_REQUIRED' });
    const result = await db.query(`INSERT INTO transfers (reservation_id, property_id, guest_name, guest_phone, transfer_type, pickup_location, destination, scheduled_at, passengers, luggage, flight_info, notes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unassigned', NULL)`, [
        row.external_reservation_id, row.property_id || reservation.propertyId || null, row.guest_name || reservation.guestName || 'Guest',
        safeJson(row.submitted_json, {}).guestPhone || reservation.guestPhone || null, String(payload.transferType || 'airport_pickup'), pickupLocation, destination, scheduledAt,
        Math.max(1, Number(payload.passengers || 1)), Math.max(0, Number(payload.luggage || 0)), String(payload.flightInfo || ''), String(payload.notes || ''),
    ]);
    const rows = await db.query(`SELECT * FROM transfers WHERE id=?`, [result.insertId]);
    return mapTransfer(rows[0]);
}

async function getReservationPortalStatus(reservationId) {
    await ensureTables();
    const rows = await db.query(`SELECT status, guest_email, sent_at, opened_at, completed_at, expires_at FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]);
    return rows[0] || null;
}

async function getReservationManagement(reservationId) {
    await ensureTables();
    const [portalRows, stayRows, catalogRows] = await Promise.all([
        db.query(`SELECT id,status,guest_email,sent_at,opened_at,completed_at,expires_at FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]),
        db.query(`SELECT * FROM guest_portal_stay_info WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]),
        db.query(`SELECT * FROM guest_service_catalog ORDER BY sort_order,name`),
    ]);
    let requests = []; let transfers = [];
    if (portalRows[0]) requests = await db.query(`SELECT * FROM guest_service_requests WHERE guest_portal_id=? ORDER BY created_at DESC`, [portalRows[0].id]);
    transfers = await db.query(`SELECT * FROM transfers WHERE reservation_id=? ORDER BY scheduled_at DESC`, [String(reservationId)]);
    return { portal: portalRows[0] || null, stayInfo: mapStayInfo(stayRows[0], true), catalog: catalogRows.map(mapCatalog), serviceRequests: requests.map(mapServiceRequest), transfers: transfers.map(mapTransfer) };
}

async function saveStayInfo(reservationId, payload, userId) {
    await ensureTables();
    const p = payload || {};
    await db.query(`INSERT INTO guest_portal_stay_info
        (source,external_reservation_id,room_access_code,building_access_code,wifi_name,wifi_password,property_address,checkin_instructions,checkout_instructions,parking_info,hot_water_info,emergency_contact,support_phone,useful_info,access_released,updated_by)
        VALUES ('cloudbeds',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE room_access_code=VALUES(room_access_code),building_access_code=VALUES(building_access_code),wifi_name=VALUES(wifi_name),wifi_password=VALUES(wifi_password),property_address=VALUES(property_address),checkin_instructions=VALUES(checkin_instructions),checkout_instructions=VALUES(checkout_instructions),parking_info=VALUES(parking_info),hot_water_info=VALUES(hot_water_info),emergency_contact=VALUES(emergency_contact),support_phone=VALUES(support_phone),useful_info=VALUES(useful_info),access_released=VALUES(access_released),updated_by=VALUES(updated_by)`, [
        String(reservationId), p.roomAccessCode || null, p.buildingAccessCode || null, p.wifiName || null, p.wifiPassword || null,
        p.propertyAddress || null, p.checkinInstructions || null, p.checkoutInstructions || null, p.parkingInfo || null, p.hotWaterInfo || null,
        p.emergencyContact || null, p.supportPhone || null, p.usefulInfo || null, p.accessReleased ? 1 : 0, userId || null,
    ]);
    const rows = await db.query(`SELECT * FROM guest_portal_stay_info WHERE source='cloudbeds' AND external_reservation_id=?`, [String(reservationId)]);
    return mapStayInfo(rows[0], true);
}

async function saveCatalog(items) {
    await ensureTables();
    if (!Array.isArray(items)) throw Object.assign(new Error('Catalog must be an array.'), { status: 422, code: 'CATALOG_INVALID' });
    for (const item of items) {
        if (!item.id || !item.name) continue;
        await db.query(`INSERT INTO guest_service_catalog (id,name,category,description,price_label,price_amount,requires_schedule,available_prearrival,available_instay,active,sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),description=VALUES(description),price_label=VALUES(price_label),price_amount=VALUES(price_amount),requires_schedule=VALUES(requires_schedule),available_prearrival=VALUES(available_prearrival),available_instay=VALUES(available_instay),active=VALUES(active),sort_order=VALUES(sort_order)`, [
            String(item.id), String(item.name), String(item.category || 'service'), String(item.description || ''), String(item.priceLabel || ''), item.priceAmount === '' || item.priceAmount == null ? null : Number(item.priceAmount),
            item.requiresSchedule ? 1 : 0, item.availablePrearrival === false ? 0 : 1, item.availableInstay === false ? 0 : 1, item.active === false ? 0 : 1, Number(item.sortOrder || 100),
        ]);
    }
    return (await db.query(`SELECT * FROM guest_service_catalog ORDER BY sort_order,name`)).map(mapCatalog);
}

async function updateServiceRequestStatus(requestId, status) {
    const allowed = ['requested','confirmed','in_progress','completed','declined','cancelled'];
    if (!allowed.includes(status)) throw Object.assign(new Error('Invalid request status.'), { status: 422, code: 'REQUEST_STATUS_INVALID' });
    await db.query(`UPDATE guest_service_requests SET status=? WHERE id=?`, [status, requestId]);
    const rows = await db.query(`SELECT * FROM guest_service_requests WHERE id=?`, [requestId]);
    if (!rows.length) throw Object.assign(new Error('Service request not found.'), { status: 404, code: 'REQUEST_NOT_FOUND' });
    return mapServiceRequest(rows[0]);
}

module.exports = {
    sendInstructions, sendAutomaticReservationEmails, getPortalByToken, saveCheckin, createServiceRequest, createTransferRequest,
    getReservationPortalStatus, getReservationManagement, saveStayInfo, saveCatalog, updateServiceRequestStatus,
};
