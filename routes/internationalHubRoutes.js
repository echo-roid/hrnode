const express = require('express');
const router = express.Router();
const InternationalHubController = require('../controllers/internationalHubController');

// Get all international hub data
router.get('/', InternationalHubController.getInternationalHubData);

router.get('/leads/:leadId/international-hubs', InternationalHubController.getInternationalHubsByLeadId);

// Create or update international hub data
router.post('/', InternationalHubController.saveInternationalHubData);

// Get international hub data by form ID
router.get('/form/:formId', InternationalHubController.getInternationalHubByFormId);

// Delete international hub entry
router.delete('/:id', InternationalHubController.deleteInternationalHubEntry);

router.post('/update-value', InternationalHubController.updateInternationalHubValue);

module.exports = router;