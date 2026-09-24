const express = require('express');
const router = express.Router();
const hosthub = require('../services/hosthub.service');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const readers = restrictTo('admin', 'manager', 'management', 'reception', 'supervisor', 'cleaneradmin', 'driversadmin', 'dispatcher');

router.get('/status', protect, readers, async (_req, res) => {
    const config = hosthub.getConfig();
    res.json({
        provider: 'hosthub',
        environment: config.environment,
        baseUrl: config.baseUrl,
        configured: config.configured,
    });
});

router.post('/test', protect, restrictTo('admin'), async (_req, res) => {
    try {
        const result = await hosthub.testConnection();
        res.json(result);
    } catch (error) {
        console.error('[HOSTHUB TEST]', error.message, error.payload || '');
        res.status(error.status || (error.code === 'HOSTHUB_NOT_CONFIGURED' ? 503 : 502)).json({
            error: error.message,
            code: error.code || 'HOSTHUB_TEST_FAILED',
            details: error.payload || null,
        });
    }
});

router.get('/rentals', protect, readers, async (_req, res) => {
    try {
        const result = await hosthub.getRentals();
        res.json(result);
    } catch (error) {
        console.error('[HOSTHUB RENTALS]', error.message, error.payload || '');
        res.status(error.status || (error.code === 'HOSTHUB_NOT_CONFIGURED' ? 503 : 502)).json({
            error: error.message,
            code: error.code || 'HOSTHUB_RENTALS_FAILED',
            details: error.payload || null,
        });
    }
});

router.get('/rentals/:rentalId/calendar-events', protect, readers, async (req, res) => {
    try {
        const result = await hosthub.getRentalCalendarEvents(req.params.rentalId, req.query);
        res.json(result);
    } catch (error) {
        console.error('[HOSTHUB CALENDAR EVENTS]', error.message, error.payload || '');
        res.status(error.status || (error.code === 'HOSTHUB_NOT_CONFIGURED' ? 503 : 502)).json({
            error: error.message,
            code: error.code || 'HOSTHUB_CALENDAR_EVENTS_FAILED',
            details: error.payload || null,
        });
    }
});

module.exports = router;
