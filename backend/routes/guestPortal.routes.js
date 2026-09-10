const express = require('express');
const router = express.Router();
const guestPortalController = require('../controllers/guestPortal.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const manageGuestRoles = ['admin', 'management', 'reception'];
const manageCatalogRoles = ['admin', 'management'];

router.post(
    '/reservations/:reservationId/send-instructions',
    protect,
    restrictTo(...manageGuestRoles),
    guestPortalController.sendInstructions
);

router.get(
    '/reservations/:reservationId/status',
    protect,
    restrictTo(...manageGuestRoles),
    guestPortalController.reservationStatus
);

router.get(
    '/reservations/:reservationId/config',
    protect,
    restrictTo(...manageGuestRoles),
    guestPortalController.reservationConfig
);

router.put(
    '/reservations/:reservationId/config',
    protect,
    restrictTo(...manageGuestRoles),
    guestPortalController.saveReservationConfig
);

router.get(
    '/catalog',
    protect,
    restrictTo(...manageCatalogRoles),
    guestPortalController.getCatalog
);

router.put(
    '/catalog/:serviceKey',
    protect,
    restrictTo(...manageCatalogRoles),
    guestPortalController.updateCatalog
);

router.get('/:token', guestPortalController.getPortal);
router.put('/:token/check-in', guestPortalController.completeCheckin);
router.post('/:token/service-requests', guestPortalController.createServiceRequest);
router.post('/:token/transfers', guestPortalController.createTransferRequest);

module.exports = router;
