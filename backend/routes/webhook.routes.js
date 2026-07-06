const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// Δυναμικό endpoint που δέχεται την πηγή ως παράμετρο (:source)
router.post('/:source', webhookController.handleWebhook);

module.exports = router;