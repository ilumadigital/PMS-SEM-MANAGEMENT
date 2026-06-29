const express = require('express');
const router = express.Router();
const receptionController = require('../controllers/reception.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Προστατευμένα routes: Μόνο Admin, Management και Reception έχουν πρόσβαση
router.get('/dashboard', protect, restrictTo('admin', 'management', 'reception'), receptionController.getDailyDashboard);
router.put('/reservations/:id', protect, restrictTo('admin', 'management', 'reception'), receptionController.updateReservationDetails);

module.exports = router;