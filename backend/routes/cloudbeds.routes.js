const express = require('express');
const router = express.Router();
const cloudbedsController = require('../controllers/cloudbeds.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Sandbox authorization flow. These two routes must remain public because Cloudbeds redirects to them.
router.get('/connect', cloudbedsController.connect);
router.get('/callback', cloudbedsController.callback);

// PMS-only read endpoints.
router.get(
    '/status',
    protect,
    restrictTo('admin', 'management', 'reception'),
    cloudbedsController.status
);

router.get(
    '/config',
    protect,
    restrictTo('admin', 'management'),
    cloudbedsController.config
);

router.post(
    '/disconnect',
    protect,
    restrictTo('admin', 'management'),
    cloudbedsController.disconnect
);

router.get(
    '/snapshot',
    protect,
    restrictTo('admin', 'management', 'reception'),
    cloudbedsController.snapshot
);

router.get(
    '/reservations',
    protect,
    restrictTo('admin', 'management', 'reception'),
    cloudbedsController.reservations
);

router.put(
    '/reservations/:reservationId/operations',
    protect,
    restrictTo('admin', 'management', 'reception'),
    cloudbedsController.updateReservationOperations
);

module.exports = router;
