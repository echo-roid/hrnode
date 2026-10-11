const express = require('express');
const router = express.Router();
const TravelHubController = require('../controllers/travelHubController');

// Get travel hub data by form ID
router.get('/form/:formId', TravelHubController.getTravelHubByFormId);

// Save travel hub data
router.post('/', TravelHubController.saveTravelHubData);

// Delete travel hub entry
router.delete('/:id', TravelHubController.deleteTravelHubEntry);

module.exports = router;