const express = require('express');
const router = express.Router();
const AssignPnrToPax = require('../controllers/AssignPnrToPax');
router.get('/pnr-removals', AssignPnrToPax.getPnrRemovalHistory);
router.post('/:leadId/passengers/:passengerId/assign-pnr', AssignPnrToPax.assignPnr);
router.post('/:leadId/passengers/:paxCode/assign-multiple-pnrs', AssignPnrToPax.assignMultiplePnrs);
router.post('/:leadId/passengers/:paxCode/remove-pnr', AssignPnrToPax.removePnr);

router.delete('/:leadId/passengers/:paxCode/clear-pnrs', AssignPnrToPax.clearAllPnrs);
router.get('/passengers/by-pnr/:pnr', AssignPnrToPax.getPaxByPnr);
router.post('/:leadId/passengers/bulk-assign-pnr', AssignPnrToPax.bulkAssignPnr);


module.exports = router;