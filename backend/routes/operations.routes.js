const express = require('express');
const router = express.Router();
const operationsController = require('../controllers/operations.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/transfers', protect, operationsController.getTransfers);
router.put('/transfers/:id', protect, operationsController.updateTransfer);
router.get('/housekeeping-schedule', protect, operationsController.getHousekeepingSchedule);

module.exports = router;
