const express = require('express');
const router = express.Router();
const leaveSettingsController = require('../controllers/GlobalLeaveSetting');

// Leave settings routes
router.get('/leave-settings', leaveSettingsController.getLeaveSettings);
router.get('/active-leave-types', leaveSettingsController.getActiveLeaveTypes);
router.post('/leave-settings', leaveSettingsController.saveLeaveSettings);

// Company branches routes (only CRUD operations)
router.get('/company-branches', leaveSettingsController.getAllBranches);
router.get('/company-branches/:id', leaveSettingsController.getBranchById);
router.post('/company-branches', leaveSettingsController.createBranch);
router.put('/company-branches/:id', leaveSettingsController.updateBranch);
router.delete('/company-branches/:id', leaveSettingsController.deleteBranch);
router.get('/branch-statistics', leaveSettingsController.getBranchStatistics);

module.exports = router;