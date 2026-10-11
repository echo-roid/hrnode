// routes/flightStatus.js
const express = require('express');
const router = express.Router();
const {
  getFlightStatusDashboard,
  getFlightStatus,
  getLiveFlightUpdates,
  getFlightDetails
} = require('../controllers/flightStatusController');

// Dashboard route
router.get('/dashboard/:lead_id', getFlightStatusDashboard);

// Single flight status
router.get('/status/:lead_id/:connection_id', getFlightStatus);

// Live updates
router.get('/live-updates/:lead_id', getLiveFlightUpdates);

// Flight details (all flights for lead_id)
router.get('/flight-details/:lead_id', getFlightDetails);

module.exports = router;