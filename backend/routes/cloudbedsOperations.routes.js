const express = require('express');
const router = express.Router();
const operations = require('../services/cloudbedsOperations.service');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const actor = (req) => ({ userId: req.user?.userId, role: req.user?.role });

const sendError = (res, error) => {
    console.error('❌ [CLOUDBEDS WRITE]:', error.message);
    return res.status(error.status || 502).json({
        success: false,
        error: error.code || 'CLOUDBEDS_WRITE_ERROR',
        message: error.message,
        requestId: error.requestId || null,
    });
};

router.get('/capabilities', protect, restrictTo('admin', 'management', 'reception', 'supervisor', 'cleaner', 'cleaning'), async (_req, res) => {
    res.json({ success: true, ...operations.getCapabilities() });
});

router.get('/audit', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.getAudit(req.query.limit);
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.get('/reference-data', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.getReferenceData(req.query || {});
        res.json({ success: true, ...data });
    } catch (error) { sendError(res, error); }
});

router.put('/reservations/:reservationId', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.updateReservation(req.params.reservationId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Reservation synced to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.post('/reservations/:reservationId/room-assignment', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.assignRoom(req.params.reservationId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Room assignment synced to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.post('/reservations/:reservationId/charges', protect, restrictTo('admin', 'management', 'reception'), async (req, res) => {
    try {
        const data = await operations.postCustomCharge(req.params.reservationId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Custom folio item posted to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.put('/guests/:guestId', protect, restrictTo('admin', 'management', 'reception'), async (req, res) => {
    try {
        const data = await operations.updateGuest(req.params.guestId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Guest profile synced to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.put('/rooms/:roomId/housekeeping', protect, restrictTo('admin', 'management', 'reception', 'supervisor', 'cleaner', 'cleaning'), async (req, res) => {
    try {
        const data = await operations.updateHousekeeping(req.params.roomId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Housekeeping status synced to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.get('/room-blocks', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.listRoomBlocks(req.query.propertyId || req.query.propertyID);
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.post('/room-blocks', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.createRoomBlock(req.body || {}, actor(req));
        res.json({ success: true, message: 'Room block created in Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.put('/room-blocks/:roomBlockId', protect, restrictTo('admin', 'management', 'reception', 'supervisor'), async (req, res) => {
    try {
        const data = await operations.updateRoomBlock(req.params.roomBlockId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Room block updated in Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
