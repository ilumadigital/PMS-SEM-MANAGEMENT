const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const cloudbedsService = require('./cloudbeds.service');

const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const TOKEN_TTL_DAYS = Number(process.env.GUEST_PORTAL_TOKEN_TTL_DAYS || 30);

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_portals (
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
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_portal_messages (
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
        )
    `);

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
    });
}

function emailHtml({ guestName, propertyName, checkinUrl, portalUrl }) {
    const firstName = String(guestName || 'Guest').trim().split(/\s+/)[0] || 'Guest';
    return `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f4f7fb">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e4e9f0">
        <tr><td style="padding:28px 30px;background:#111827;color:#fff">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#93c5fd">SEM Guest Experience</div>
          <h1 style="margin:10px 0 0;font-size:26px">Welcome ${firstName}</h1>
        </td></tr>
        <tr><td style="padding:30px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6">Your reservation at <strong>${propertyName}</strong> is confirmed.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563">Please complete your pre-arrival details, expected check-in/check-out times and any add-on requests. After completion, the same secure link becomes your Guest Portal for your stay.</p>
          <p style="margin:0 0 24px"><a href="${checkinUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Complete online check-in</a></p>
          <p style="margin:0;font-size:13px;color:#6b7280">Guest Portal: <a href="${portalUrl}" style="color:#0284c7">${portalUrl}</a></p>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9ca3af">This is a private secure link for your reservation. Please do not share it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function createOrRefreshPortal(reservation) {
    await ensureTables();

    const token = crypto.randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const snapshot = publicReservationSnapshot(reservation);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.query(
        `INSERT INTO guest_portals
            (source, external_reservation_id, token_hash, guest_email, guest_name, property_id, property_name,
             reservation_snapshot_json, status, expires_at)
         VALUES ('cloudbeds', ?, ?, ?, ?, ?, ?, ?, 'invited', ?)
         ON DUPLICATE KEY UPDATE
            token_hash = VALUES(token_hash),
            guest_email = VALUES(guest_email),
            guest_name = VALUES(guest_name),
            property_id = VALUES(property_id),
            property_name = VALUES(property_name),
            reservation_snapshot_json = VALUES(reservation_snapshot_json),
            expires_at = VALUES(expires_at),
            updated_at = NOW()`,
        [
            String(reservation.id),
            hash,
            snapshot.guestEmail || null,
            snapshot.guestName || null,
            snapshot.propertyId || null,
            snapshot.propertyName || null,
            JSON.stringify(snapshot),
            expiresAt,
        ]
    );

    const rows = await db.query(
        `SELECT id FROM guest_portals WHERE source = 'cloudbeds' AND external_reservation_id = ? LIMIT 1`,
        [String(reservation.id)]
    );

    return {
        id: rows[0]?.id,
        token,
        reservation: snapshot,
        checkinUrl: `${FRONTEND_URL}/guest/${token}/check-in`,
        portalUrl: `${FRONTEND_URL}/guest/${token}`,
        expiresAt,
    };
}

async function sendInstructions(reservationId) {
    const reservation = await findReservation(reservationId);
    if (!reservation) {
        const error = new Error('Reservation was not found in the connected Cloudbeds property.');
        error.status = 404;
        error.code = 'RESERVATION_NOT_FOUND';
        throw error;
    }

    if (!reservation.guestEmail) {
        const error = new Error('This reservation has no guest email in Cloudbeds.');
        error.status = 422;
        error.code = 'GUEST_EMAIL_MISSING';
        throw error;
    }

    const portal = await createOrRefreshPortal(reservation);
    const transporter = createTransporter();

    if (!transporter) {
        await db.query(
            `INSERT INTO guest_portal_messages (guest_portal_id, recipient, subject, status, error_message)
             VALUES (?, ?, ?, 'not_configured', ?)`,
            [portal.id, reservation.guestEmail, 'Complete your online check-in', 'SMTP is not configured on the backend.']
        );

        return {
            ...portal,
            emailSent: false,
            emailStatus: 'not_configured',
            message: 'Secure guest link created, but SMTP is not configured.',
        };
    }

    const from = process.env.GUEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
    const subject = `Complete your online check-in – ${portal.reservation.propertyName}`;

    try {
        const info = await transporter.sendMail({
            from,
            to: reservation.guestEmail,
            subject,
            html: emailHtml({
                guestName: reservation.guestName,
                propertyName: portal.reservation.propertyName,
                checkinUrl: portal.checkinUrl,
                portalUrl: portal.portalUrl,
            }),
        });

        await db.query(`UPDATE guest_portals SET sent_at = NOW(), status = 'invited' WHERE id = ?`, [portal.id]);
        await db.query(
            `INSERT INTO guest_portal_messages
                (guest_portal_id, recipient, subject, status, provider_message_id)
             VALUES (?, ?, ?, 'sent', ?)`,
            [portal.id, reservation.guestEmail, subject, info.messageId || null]
        );

        return { ...portal, emailSent: true, emailStatus: 'sent' };
    } catch (error) {
        await db.query(
            `INSERT INTO guest_portal_messages
                (guest_portal_id, recipient, subject, status, error_message)
             VALUES (?, ?, ?, 'failed', ?)`,
            [portal.id, reservation.guestEmail, subject, String(error.message || error)]
        );
        error.status = 502;
        error.code = 'GUEST_EMAIL_SEND_FAILED';
        throw error;
    }
}

async function getPortalByToken(token, markOpened = true) {
    await ensureTables();
    const rows = await db.query(
        `SELECT * FROM guest_portals
         WHERE token_hash = ? AND expires_at >= NOW()
         LIMIT 1`,
        [tokenHash(token)]
    );

    const row = rows[0];
    if (!row) {
        const error = new Error('This guest link is invalid or has expired.');
        error.status = 404;
        error.code = 'GUEST_PORTAL_LINK_INVALID';
        throw error;
    }

    if (markOpened && !row.opened_at) {
        await db.query(
            `UPDATE guest_portals SET opened_at = NOW(), status = IF(status = 'invited', 'opened', status) WHERE id = ?`,
            [row.id]
        );
    }

    return {
        id: row.id,
        status: row.status,
        reservation: safeJson(row.reservation_snapshot_json, {}),
        submitted: safeJson(row.submitted_json, {}),
        addonRequests: safeJson(row.addon_requests_json, []),
        sentAt: row.sent_at,
        openedAt: row.opened_at,
        completedAt: row.completed_at,
        expiresAt: row.expires_at,
        addons: [
            { id: 'airport-transfer', name: 'Airport Transfer', description: 'Request a private airport transfer.', priceLabel: 'By request' },
            { id: 'early-checkin', name: 'Early Check-in', description: 'Request access before the standard check-in time.', priceLabel: 'From €20' },
            { id: 'late-checkout', name: 'Late Check-out', description: 'Request a later departure time, subject to availability.', priceLabel: 'From €20' },
        ],
    };
}

async function saveCheckin(token, payload) {
    const portal = await getPortalByToken(token, false);
    const submitted = {
        guestPhone: String(payload.guestPhone || portal.reservation.guestPhone || ''),
        arrivalTime: String(payload.arrivalTime || ''),
        departureTime: String(payload.departureTime || ''),
        arrivalMethod: String(payload.arrivalMethod || ''),
        flightNumber: String(payload.flightNumber || ''),
        specialRequests: String(payload.specialRequests || ''),
        termsAccepted: Boolean(payload.termsAccepted),
    };
    const addons = Array.isArray(payload.addonRequests) ? payload.addonRequests : [];

    if (!submitted.arrivalTime || !submitted.departureTime) {
        const error = new Error('Arrival and departure times are required.');
        error.status = 422;
        error.code = 'CHECKIN_TIMES_REQUIRED';
        throw error;
    }
    if (!submitted.termsAccepted) {
        const error = new Error('The guest must accept the house rules and terms before completing check-in.');
        error.status = 422;
        error.code = 'TERMS_REQUIRED';
        throw error;
    }

    await db.query(
        `UPDATE guest_portals
         SET submitted_json = ?, addon_requests_json = ?, status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(submitted), JSON.stringify(addons), portal.id]
    );

    await cloudbedsService.saveReservationOperations(portal.reservation.id, {
        arrivalTime: submitted.arrivalTime,
        departureTime: submitted.departureTime,
        specialRequests: [
            submitted.specialRequests,
            submitted.arrivalMethod ? `Arrival method: ${submitted.arrivalMethod}` : '',
            submitted.flightNumber ? `Flight: ${submitted.flightNumber}` : '',
            ...addons.map((addon) => `Add-on request: ${addon.name || addon.id}`),
        ].filter(Boolean),
    });

    return getPortalByToken(token, false);
}

async function getReservationPortalStatus(reservationId) {
    await ensureTables();
    const rows = await db.query(
        `SELECT status, guest_email, sent_at, opened_at, completed_at, expires_at
         FROM guest_portals
         WHERE source = 'cloudbeds' AND external_reservation_id = ?
         LIMIT 1`,
        [String(reservationId)]
    );
    return rows[0] || null;
}

module.exports = {
    sendInstructions,
    getPortalByToken,
    saveCheckin,
    getReservationPortalStatus,
};
