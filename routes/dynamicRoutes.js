const express = require('express');
const router = express.Router();
const dynamicController = require('../controllers/dynamicController');

// ✅ Routes
router.get('/dynamic-values/:leadId', dynamicController.getAllDynamicValues);
router.post('/dynamic-values/:leadId', dynamicController.createDynamicValue);

module.exports = router;
