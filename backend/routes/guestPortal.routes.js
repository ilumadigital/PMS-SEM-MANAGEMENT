const express = require('express');
const router = express.Router();
const guestPortalController = require('../controllers/guestPortal.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

router.post(
    '/reservations/:reservationId/send-instructions',
    protect,
    restrictTo('admin', 'management', 'reception'),
    guestPortalController.sendInstructions
);

router.get(
    '/reservations/:reservationId/status',
    protect,
    restrictTo('admin', 'management', 'reception'),
    guestPortalController.reservationStatus
);

router.get('/:token', guestPortalController.getPortal);
router.put('/:token/check-in', guestPortalController.completeCheckin);

module.exports = router;
