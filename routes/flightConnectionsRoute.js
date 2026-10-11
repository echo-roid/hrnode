// routes/flightConnections.js
const express = require('express');
const router = express.Router();
const {
  createJourney,
  getJourneys,
  getJourney,
  updateJourney,
  deleteJourney,
  getAirportInfo,
  getJourneyStats,
  getLeadAirports
} = require('../controllers/flightConnectionController');

// Create a new journey
router.post('/journeys', createJourney);

// Get all journeys for a lead
router.get('/journeys/lead/:lead_id', getJourneys);

// Get specific journey
router.get('/journeys/:journey_id/lead/:lead_id', getJourney);

// Update a journey
router.put('/journeys/:journey_id/lead/:lead_id', updateJourney);

// Delete a journey
router.delete('/journeys/:journey_id/lead/:lead_id', deleteJourney);

// Get airport information
router.get('/airports/:airport_code', getAirportInfo);

// Get journey statistics
router.get('/stats/lead/:lead_id', getJourneyStats);

// Get all airports used by a lead
router.get('/airports/lead/:lead_id', getLeadAirports);

module.exports = router;