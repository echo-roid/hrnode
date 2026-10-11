const express = require('express');
const router = express.Router();
const paxListController = require('../controllers/PaxListController');

// @route   GET /api/paxlist/lead/:leadId
// @desc    Get all passengers for a specific lead with pagination and filtering
// @access  Public
router.get('/lead/:leadId', paxListController.getPaxByLead);

// @route   POST /api/paxlist
// @desc    Create a new passenger
// @access  Public
router.post('/', paxListController.createPax);

// @route   POST /api/paxlist/bulk
// @desc    Create multiple passengers at once
// @access  Public
router.post('/bulk', paxListController.createMultiplePax);

// @route   PUT /api/paxlist/:paxId/lead/:leadId
// @desc    Update a passenger
// @access  Public
router.put('/:paxId/lead/:leadId', paxListController.updatePax);
    
// @route   PATCH /api/paxlist/:paxId/lead/:leadId/guest-data
// @desc    Update guest data for a passenger
// @access  Public
router.patch('/:paxId/lead/:leadId/guest-data', paxListController.updateGuestData);

// @route   PATCH /api/paxlist/:paxId/lead/:leadId/form-data
// @desc    Update form data for a passenger
// @access  Public
router.patch('/:paxId/lead/:leadId/form-data', paxListController.updateFormData);

// @route   DELETE /api/paxlist/:paxId/lead/:leadId
// @desc    Delete a passenger
// @access  Public
router.delete('/:paxId/lead/:leadId', paxListController.deletePax);

// @route   GET /api/paxlist/lead/:leadId/statistics
// @desc    Get passenger statistics for a lead
// @access  Public
router.get('/lead/:leadId/statistics', paxListController.getPaxStatistics);

// @route   PUT /api/paxlist/lead/:leadId/bulk-status
// @desc    Bulk update passenger status
// @access  Public
router.put('/lead/:leadId/bulk-status', paxListController.bulkUpdateStatus);

// @route   GET /api/paxlist/search
// @desc    Search passengers across all leads
// @access  Public
router.get('/search', paxListController.searchPax);

// @route   DELETE /api/paxlist/clear-all
// @desc    Clear all passengers (for testing/reset)
// @access  Public
router.delete('/clear-all', paxListController.clearAllPax);
// Add this route to your existing routes
router.post('/pax/:leadId/process-selected', paxListController.processSelectedPassengers);

router.post('/pax/:leadId/multiple', paxListController.createMultiplePaxByLeadId);
router.get('/selected-passengers/:leadId', paxListController.listSelectedPassengers);
module.exports = router;    