const express = require('express');
const router = express.Router();
const travelGuideController = require('../controllers/travelGuideController');

// Single assign / remove
router.post('/forms/:submissionId/assign-guide', travelGuideController.assignGuideToSubmission);
router.delete('/forms/:submissionId/assign-guide', travelGuideController.removeGuideFromSubmission);

// Bulk assign
router.post('/forms/bulk-assign-guide', travelGuideController.bulkAssignGuide);

// Fetch assignments
router.get('/forms/:formId/travel-guides', travelGuideController.getGuideAssignmentsForForm);
router.get('/travel-guides/:guideId/guests', travelGuideController.getGuestsByGuide);
router.get('/travel-guides/stats', travelGuideController.getGuideStats);

module.exports = router;