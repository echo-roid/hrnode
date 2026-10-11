const express = require('express');
const router = express.Router();
const guestListController = require('../controllers/guestListController');

// Upload guest list
router.post('/leads/:leadId/guestlist', guestListController.uploadGuestList);

// Fetch guest list by lead
router.get('/leads/:leadId/guestlist', guestListController.getGuestListByLead);

router.get('/leads/:leadId/guest-list/headers', guestListController.getGuestListHeaders);

router.delete('/leads/:leadId/remove-row', guestListController.removeGuestRow);
router.delete('/leads/:leadId/bulk-remove', guestListController.bulkRemoveGuestRows);
router.delete('/leads/:leadId/clear', guestListController.clearGuestList);
router.put('/leads/:leadId/update-row', guestListController.updateGuestRow);
// Rename a column header
router.put('/leads/:leadId/rename-header', guestListController.renameGuestListHeader);


module.exports = router;
