const express = require('express');
const router = express.Router();
const pnrController = require('../controllers/PnrController');

// Existing routes
router.get('/lead/:leadId', pnrController.getPnrsByLead);
router.get('/', pnrController.getAllPnrs);
router.get('/stats', pnrController.getStats);
router.post('/', pnrController.createPnr);
router.put('/:id', pnrController.updatePnr);
router.delete('/:id', pnrController.deletePnr);
router.get('/:id', pnrController.getPnr);

// New deactivation routes
router.patch('/:id/deactivate', pnrController.deactivatePnr);
router.patch('/:id/reactivate', pnrController.reactivatePnr);
router.get('/:id/deactivation-history', pnrController.getDeactivationHistory);
router.get('/status/:status', pnrController.getPnrsByStatus);

module.exports = router;