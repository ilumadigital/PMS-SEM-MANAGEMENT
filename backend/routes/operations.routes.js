const express = require('express');
const router = express.Router();
const operationsController = require('../controllers/operations.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

router.get('/revision', protect, operationsController.getRealtimeRevision);
router.get('/transfers', protect, restrictTo('admin','manager','management','reception','supervisor','driversadmin','dispatcher'), operationsController.getTransfers);
router.put('/transfers/:id', protect, restrictTo('admin','manager','management','reception','supervisor','driversadmin','dispatcher'), operationsController.updateTransfer);
router.get('/housekeeping-schedule', protect, restrictTo('admin','manager','management','reception','supervisor','cleaneradmin'), operationsController.getHousekeepingSchedule);

router.get('/reservations', protect, restrictTo('admin','manager','management','reception','supervisor','cleaneradmin'), operationsController.getReservationOperations);
router.put('/reservations/:reservationId', protect, restrictTo('admin','manager','management','reception','supervisor'), operationsController.updateReservationOperation);

router.get('/housekeeping', protect, restrictTo('admin','manager','management','reception','supervisor','cleaneradmin'), operationsController.getHousekeepingStatus);
router.put('/housekeeping/:roomId', protect, restrictTo('admin','manager','management','reception','supervisor','cleaneradmin','cleaner','cleaning'), operationsController.updateHousekeepingStatus);

module.exports = router;
