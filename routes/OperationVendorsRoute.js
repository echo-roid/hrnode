// In your routes file
const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/OperationVendors');

// Operation vendor routes
router.get('/operation-vendors/lead/:lead_id', vendorController.getOperationVendorsByLeadId);
router.post('/operation-vendors', vendorController.createOperationVendor);
router.get('/operation-vendors/:id', vendorController.getOperationVendorById);
router.put('/operation-vendors/:id', vendorController.updateOperationVendor);
router.delete('/operation-vendors/:id', vendorController.deleteOperationVendor);

module.exports = router;