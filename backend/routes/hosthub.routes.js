const express = require('express');
const router = express.Router();
const hosthub = require('../services/hosthub.service');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const readers = restrictTo('admin', 'manager', 'management', 'reception', 'supervisor', 'cleaneradmin', 'driversadmin', 'dispatcher');

function sendError(res, error, fallback = 500) {
    console.error('[HOSTHUB]', error.message, error.payload || '');
    return res.status(error.status || (error.code === 'HOSTHUB_NOT_CONFIGURED' ? 503 : fallback)).json({
        success: false,
        error: error.code || 'HOSTHUB_ERROR',
        message: error.message,
        details: error.payload || null,
    });
}

router.get('/status', protect, readers, async (_req, res) => {
    try {
        const config = await hosthub.getConfig({ includeSecret: false });
        res.json({
            success: true,
            provider: 'hosthub',
            environment: config.environment,
            baseUrl: config.baseUrl,
            configured: config.configured,
            source: config.source,
            updatedAt: config.updatedAt,
            lastSyncAt: config.lastSyncAt,
        });
    } catch (error) {
        sendError(res, error);
    }
});

router.put('/credentials', protect, restrictTo('admin'), async (req, res) => {
    try {
        const result = await hosthub.saveCredentials({
            environment: req.body?.environment,
            apiKey: req.body?.apiKey,
            baseUrl: req.body?.baseUrl,
            userId: req.user?.userId,
        });
        res.json({
            success: true,
            message: 'Hosthub credentials saved securely.',
            provider: 'hosthub',
            ...result,
        });
    } catch (error) {
        sendError(res, error, 422);
    }
});

router.delete('/credentials', protect, restrictTo('admin'), async (req, res) => {
    try {
        const result = await hosthub.disconnect(req.query.environment);
        res.json({ success: true, message: 'Hosthub credentials removed.', ...result });
    } catch (error) {
        sendError(res, error);
    }
});

router.post('/test', protect, restrictTo('admin'), async (_req, res) => {
    try {
        const result = await hosthub.testConnection();
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error, 502);
    }
});

router.get('/rentals', protect, readers, async (_req, res) => {
    try {
        const result = await hosthub.getRentals();
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error, 502);
    }
});

router.get('/rentals/:rentalId/calendar-events', protect, readers, async (req, res) => {
    try {
        const result = await hosthub.getRentalCalendarEvents(req.params.rentalId, req.query);
        res.json({ success: true, ...result });
    } catch (error) {
        sendError(res, error, 502);
    }
});

module.exports = router;
