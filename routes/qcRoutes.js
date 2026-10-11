const express = require('express');
const router = express.Router();
const qcController = require('../controllers/qcController');

// QC routes
router.post('/leads/:leadId/approve', qcController.approveSubmission);
router.post('/leads/:leadId/reject', qcController.rejectSubmission);
router.post('/leads/bulk-update', qcController.bulkUpdateSubmissions);
router.get('/leads/pending', qcController.getPendingSubmissions);
router.get('/leads/:leadId', qcController.getSubmissionDetails);
router.put('/leads/:leadId/status', qcController.updateSubmissionStatus);
router.post('/leads/status', qcController.getQCStatusForLeads);

module.exports = router;