const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');

// Form creation
router.post('/', formController.createForm);

// Get forms by lead ID
router.get('/lead/:leadId', formController.getFormsByLead);

// Get lead forms with submissions
router.get('/lead-submissions/:leadId', formController.getLeadFormsWithSubmissions);

// Get shared form
router.get('/shared/:shareId', formController.getSharedForm);
router.delete('/:submissionId/submissionsRowDelete', formController.deleteSubmissionById)
// Submit form response
router.post('/submit', formController.submitFormResponse);

// Get form submissions
router.get('/:formId/submissions', formController.getFormSubmissions);

router.put('/:formId', formController.updateForm); 

router.post('/:formId/clone', formController.cloneForm);

router.get('/submissions/:id', formController.getSubmissionById); 
router.put('/submissions/:id', formController.editSubmissionValueById); // Note: Uses submission ID, not form ID

router.delete("/forms/:formId", formController.deleteForm);

router.delete('/leads/:leadId/forms/:formId', formController.deleteLeadFormWithSubmissions);
module.exports = router;



