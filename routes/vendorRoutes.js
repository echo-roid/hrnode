const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');

// GET /api/vendors - Get all vendors with pagination and filters
router.get('/', vendorController.getAllVendors);
router.get('/hotels', vendorController.getAllHotelVendorsSimple);
// GET /api/vendors/stats - Get vendor statistics
// router.get('/stats', vendorController.getVendorStats);

// GET /api/vendors/:id - Get vendor by ID
// router.get('/:id', vendorController.getVendorById);

// POST /api/vendors - Create new vendor
router.post('/', vendorController.createVendor);

// PUT /api/vendors/:id - Update vendor
router.put('/:id', vendorController.updateVendor);

// PATCH /api/vendors/:id/status - Update vendor status
router.patch('/:id/status', vendorController.updateVendorStatus);
    router.post('/pnr/:pnrId/hotels', vendorController.addHotelToPassenger);


// Assign room number to a specific passenger
router.put('/pnr/:pnrId/passenger/:paxCode/room-number', vendorController.assignRoomNumber);
router.put(
  '/pnr/:pnrId/passengers/room-numbers/',
  vendorController.batchAssignRoomNumbers
);

// Batch assign room numbers to multiple passengers

// // Passenger management routes using lead_id
// router.put('/pnr/lead/:leadId/passenger/:paxCode', vendorController.updatePassenger);
// router.post('/pnr/lead/:leadId/passenger', vendorController.addPassenger);
// router.delete('/pnr/lead/:leadId/passenger/:paxCode', vendorController.deletePassenger);
// router.put('/pnr/lead/:leadId/passengers/bulk', vendorController.bulkUpdatePassengers);

// DELETE /api/vendors/:id - Delete vendor
// router.delete('/:id', vendorController.deleteVendor);

module.exports = router;