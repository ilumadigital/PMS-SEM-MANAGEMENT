const express = require('express');
const router = express.Router();
const operationsController = require('../controllers/operations.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

router.get('/transfers', protect, operationsController.getTransfers);
router.put('/transfers/:id', protect, operationsController.updateTransfer);
router.get('/housekeeping-schedule', protect, operationsController.getHousekeepingSchedule);

router.get('/reservations', protect, restrictTo('admin','management','reception','supervisor'), operationsController.getReservationOperations);
router.put('/reservations/:reservationId', protect, restrictTo('admin','management','reception','supervisor'), operationsController.updateReservationOperation);

router.get('/housekeeping', protect, restrictTo('admin','management','reception','supervisor','cleaner','cleaning'), operationsController.getHousekeepingStatus);
router.put('/housekeeping/:roomId', protect, restrictTo('admin','management','reception','supervisor','cleaner','cleaning'), operationsController.updateHousekeepingStatus);

module.exports = router;
