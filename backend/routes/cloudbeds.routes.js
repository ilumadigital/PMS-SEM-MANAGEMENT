const express = require('express');
const router = express.Router();
const cloudbedsController = require('../controllers/cloudbeds.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Cloudbeds redirects to these during automatic API-key delivery.
router.get('/connect', cloudbedsController.connect);
router.get('/callback', cloudbedsController.callback);

const operationalReaders = restrictTo('admin', 'management', 'reception', 'supervisor', 'cleaner', 'cleaning');

router.get('/status', protect, operationalReaders, cloudbedsController.status);
router.get('/config', protect, restrictTo('admin', 'management'), cloudbedsController.config);
router.post('/disconnect', protect, restrictTo('admin', 'management'), cloudbedsController.disconnect);
router.get('/snapshot', protect, operationalReaders, cloudbedsController.snapshot);
router.get('/reservations', protect, operationalReaders, cloudbedsController.reservations);

router.put(
    '/reservations/:reservationId/operations',
    protect,
    restrictTo('admin', 'management', 'reception', 'supervisor'),
    cloudbedsController.updateReservationOperations
);

module.exports = router;
