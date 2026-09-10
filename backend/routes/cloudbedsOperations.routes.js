const express = require('express');
const router = express.Router();
const operations = require('../services/cloudbedsOperations.service');
const roomAssignments = require('../services/cloudbedsRoomAssignment.service');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const actor = (req) => ({ userId: req.user?.userId, role: req.user?.role });

const sendError = (res, error) => {
    console.error('❌ [CLOUDBEDS WRITE]:', error.message);
    return res.status(error.status || 502).json({
        success: false,
        error: error.code || 'CLOUDBEDS_WRITE_ERROR',
        message: error.message,
        requestId: error.requestId || null,
        details: error.details || null,
    });
};

const READ_ROLES = ['admin', 'management', 'reception', 'supervisor'];
const WRITE_ROLES = ['admin', 'management', 'reception', 'supervisor'];
const CREATE_ROLES = ['admin', 'management', 'reception'];

router.get('/capabilities', protect, restrictTo('admin', 'management', 'reception', 'supervisor', 'cleaner', 'cleaning'), async (_req, res) => {
    res.json({ success: true, ...operations.getCapabilities() });
});

router.get('/audit', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.getAudit(req.query.limit);
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.get('/reference-data', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.getReferenceData(req.query || {});
        res.json({ success: true, ...data });
    } catch (error) { sendError(res, error); }
});

router.get('/availability', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.getAvailability(req.query || {});
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.get('/calendar', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.getCalendarData(req.query || {});
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.get('/reservations/:reservationId/details', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.getReservationDetails(req.params.reservationId, req.query || {});
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.post('/reservations', protect, restrictTo(...CREATE_ROLES), async (req, res) => {
    try {
        const data = await operations.createReservation(req.body || {}, actor(req));
        res.status(201).json({
            success: true,
            message: data.partial
                ? 'Reservation created in Cloudbeds, but physical room assignment requires attention.'
                : 'Reservation created and assigned in Cloudbeds.',
            data,
        });
    } catch (error) { sendError(res, error); }
});

router.put('/reservations/:reservationId', protect, restrictTo(...WRITE_ROLES), async (req, res) => {
    try {
        const data = await operations.updateReservation(req.params.reservationId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Reservation synced to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.post('/reservations/:reservationId/room-assignment', protect, restrictTo(...WRITE_ROLES), async (req, res) => {
    try {
        const data = await roomAssignments.assignRoom(req.params.reservationId, req.body || {}, actor(req));
        res.json({
            success: true,
            message: data.alreadyAssigned
                ? 'The selected room is already assigned in Cloudbeds.'
                : 'Room assignment synced and verified in Cloudbeds.',
            data,
        });
    } catch (error) { sendError(res, error); }
});

router.post('/reservations/:reservationId/charges', protect, restrictTo(...CREATE_ROLES), async (req, res) => {
    try {
        const data = await operations.postCustomCharge(req.params.reservationId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Custom folio item posted to Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.put('/guests/:guestId', protect, restrictTo(...CREATE_ROLES), async (req, res) => {
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

router.get('/room-blocks', protect, restrictTo(...READ_ROLES), async (req, res) => {
    try {
        const data = await operations.listRoomBlocks(req.query.propertyId || req.query.propertyID);
        res.json({ success: true, data });
    } catch (error) { sendError(res, error); }
});

router.post('/room-blocks', protect, restrictTo(...WRITE_ROLES), async (req, res) => {
    try {
        const data = await operations.createRoomBlock(req.body || {}, actor(req));
        res.json({ success: true, message: 'Room block created in Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

router.put('/room-blocks/:roomBlockId', protect, restrictTo(...WRITE_ROLES), async (req, res) => {
    try {
        const data = await operations.updateRoomBlock(req.params.roomBlockId, req.body || {}, actor(req));
        res.json({ success: true, message: 'Room block updated in Cloudbeds.', data });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
