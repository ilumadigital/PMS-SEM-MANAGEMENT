const express = require('express');
const router = express.Router();
const guestPortalController = require('../controllers/guestPortal.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const managementAccess = [protect, restrictTo('admin', 'management', 'reception', 'supervisor')];
const adminAccess = [protect, restrictTo('admin', 'management')];

router.post(
    '/reservations/:reservationId/send-instructions',
    protect,
    restrictTo('admin', 'management', 'reception'),
    guestPortalController.sendInstructions
);

router.get(
    '/reservations/:reservationId/status',
    protect,
    restrictTo('admin', 'management', 'reception', 'supervisor'),
    guestPortalController.reservationStatus
);

router.get('/reservations/:reservationId/manage', ...managementAccess, guestPortalController.reservationManagement);
router.put('/reservations/:reservationId/stay-info', ...managementAccess, guestPortalController.saveStayInfo);
router.put('/catalog', ...adminAccess, guestPortalController.saveCatalog);
router.patch('/service-requests/:requestId', ...managementAccess, guestPortalController.updateServiceRequestStatus);

router.get('/:token', guestPortalController.getPortal);
router.put('/:token/check-in', guestPortalController.completeCheckin);
router.post('/:token/service-requests', guestPortalController.createServiceRequest);
router.post('/:token/transfers', guestPortalController.createTransferRequest);

module.exports = router;
