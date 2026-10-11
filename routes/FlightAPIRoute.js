// routes/flightRoutes.js - UPDATED WITH ROUNDTRIP SUPPORT
const express = require('express');
const router = express.Router();
const flightController = require('../controllers/FlightAPI');

// One-way flight search endpoint (EXISTING - NO CHANGE)
router.get('/search', flightController.searchFlights); // One-way only

// NEW: Roundtrip flight search endpoint (ADDED)
router.get('/search/roundtrip', flightController.searchFlights);

// // Test API endpoint (EXISTING - NO CHANGE)
// router.get('/test', flightController.testAPI);

// // Cache management endpoints (EXISTING - NO CHANGE)
// router.delete('/cache', flightController.clearCache);
// router.get('/cache/stats', flightController.getCacheStats);

module.exports = router;