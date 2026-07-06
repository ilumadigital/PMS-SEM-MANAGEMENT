const express = require('express');
const router = express.Router();
const cleaningController = require('../controllers/cleaning.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

// Μόνο οι καθαριστές (και οι supervisors/admins) μπορούν να αλληλεπιδράσουν
router.get('/my-tasks', protect, restrictTo('cleaner', 'supervisor', 'admin'), cleaningController.getMyTasks);
router.put('/tasks/:id/status', protect, restrictTo('cleaner', 'supervisor', 'admin'), cleaningController.updateTaskStatus);

module.exports = router;