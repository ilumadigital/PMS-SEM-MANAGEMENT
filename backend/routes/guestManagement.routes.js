const express = require('express');
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

function safeJson(value, fallback) {
    try {
        if (!value) return fallback;
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return fallback;
    }
}

router.get(
    '/reservations/:reservationId/journey',
    protect,
    restrictTo('admin', 'management', 'reception', 'supervisor'),
    async (req, res) => {
        try {
            const rows = await db.query(
                `SELECT status, submitted_json, addon_requests_json, sent_at, opened_at, completed_at, expires_at
                 FROM guest_portals
                 WHERE source = 'cloudbeds' AND external_reservation_id = ?
                 LIMIT 1`,
                [String(req.params.reservationId)]
            );

            const row = rows[0];
            if (!row) {
                return res.json({
                    success: true,
                    data: {
                        portalStatus: null,
                        submitted: {},
                        addonRequests: [],
                        sentAt: null,
                        openedAt: null,
                        completedAt: null,
                        expiresAt: null,
                    },
                });
            }

            return res.json({
                success: true,
                data: {
                    portalStatus: row.status,
                    submitted: safeJson(row.submitted_json, {}),
                    addonRequests: safeJson(row.addon_requests_json, []),
                    sentAt: row.sent_at,
                    openedAt: row.opened_at,
                    completedAt: row.completed_at,
                    expiresAt: row.expires_at,
                },
            });
        } catch (error) {
            console.error('❌ [GUEST MANAGEMENT]:', error.message);
            return res.status(500).json({
                success: false,
                error: 'GUEST_JOURNEY_LOAD_FAILED',
                message: 'Guest arrival and departure details could not be loaded.',
            });
        }
    }
);

module.exports = router;
