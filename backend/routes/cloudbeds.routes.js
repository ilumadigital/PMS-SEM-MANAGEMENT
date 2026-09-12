const express = require('express');
const router = express.Router();
const cloudbedsController = require('../controllers/cloudbeds.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Cloudbeds redirects to these during automatic API-key delivery.
router.get('/connect', cloudbedsController.connect);
router.get('/callback', cloudbedsController.callback);

const operationalReaders = restrictTo('admin', 'manager', 'management', 'reception', 'supervisor', 'cleaneradmin', 'driversadmin', 'dispatcher');

router.get('/status', protect, operationalReaders, cloudbedsController.status);
router.get('/config', protect, restrictTo('admin'), cloudbedsController.config);
router.post('/disconnect', protect, restrictTo('admin'), cloudbedsController.disconnect);
router.get('/snapshot', protect, operationalReaders, cloudbedsController.snapshot);
router.get('/reservations', protect, operationalReaders, cloudbedsController.reservations);

router.put(
    '/reservations/:reservationId/operations',
    protect,
    restrictTo('admin', 'manager', 'management', 'reception', 'supervisor'),
    cloudbedsController.updateReservationOperations
);

module.exports = router;
