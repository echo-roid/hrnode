const express = require('express');
const router = express.Router();
const hotelController = require('../controllers/hotelController');

// Existing route
router.get('/done-passengers/lead/:lead_id', hotelController.getPnrPassengerByLeadId);

// New route for grouped hotel assignments
router.get('/lead/:leadId/hotel-groups', hotelController.getGroupedHotelAssignments);

module.exports = router;