const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);

module.exports = router;