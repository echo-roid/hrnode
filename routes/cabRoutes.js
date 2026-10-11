const express = require('express');
const router = express.Router();
const cabController = require('../controllers/cabController');

// Get all cabs
router.get('/', cabController.getAllCabs);

// Search cabs
router.get('/searchAllTransport', cabController.getAllTransportVendorsSimple);

// Get single cab
router.get('/:id', cabController.getCabById);

// Create new cab
router.post('/', cabController.createCab);

// Update cab
router.put('/:id', cabController.updateCab);

// Delete cab
router.delete('/:id', cabController.deleteCab);

// Assign passenger to cab
router.post('/:id/assign-passenger', cabController.assignPassenger);

// Remove passenger from cab
router.post('/:id/remove-passenger', cabController.removePassenger);

// Clear all passengers from cab
router.post('/:id/clear-passengers', cabController.clearAllPassengers);



router.post('/:pnrId/assign', cabController.assignCab);

// Remove cab assignment
router.post('/:pnrId/remove', cabController.removeCabAssignment);

// Get PNR with cab assignments
router.get('/:pnrId', cabController.getPNRWithCabAssignments);

// Bulk update cab assignments
router.post('/bulk-update', cabController.bulkUpdateCabAssignments);

module.exports = router;