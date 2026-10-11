const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/travelGuideMasterController');
const upload = require('../middleware/upload');

/* =====================================================
   1. PUBLIC AUTH
   ===================================================== */
router.post('/travel-guides/login', ctrl.loginTravelGuide);

/* =====================================================
   2. GUIDE-AUTHENTICATED — MOST SPECIFIC FIRST
   ===================================================== */

// Exact path first
router.get('/travel-guides/me',                                ctrl.verifyGuideToken, ctrl.getMyProfile);
router.get('/travel-guides/me/guests',                         ctrl.verifyGuideToken, ctrl.getMyAssignedGuests);

// Parameterized path after
router.patch('/travel-guides/me/guests/:submissionId/approve', ctrl.verifyGuideToken, ctrl.approveGuestAsGuide);
router.post('/travel-guides/change-password',                  ctrl.verifyGuideToken, ctrl.changeOwnPassword);

/* =====================================================
   3. IMAGE UPLOAD
   ===================================================== */
router.post('/travel-guides/:id/image',   upload.single('image'), ctrl.uploadGuideImage);
router.delete('/travel-guides/:id/image', ctrl.deleteGuideImage);

/* =====================================================
   4. ADMIN CRUD
   ===================================================== */
router.post('/travel-guides',                    ctrl.createTravelGuide);
router.get('/travel-guides',                     ctrl.listTravelGuides);
router.get('/travel-guides/:id',                 ctrl.getTravelGuideById);
router.put('/travel-guides/:id',                 ctrl.updateTravelGuide);
router.patch('/travel-guides/:id/status',        ctrl.setTravelGuideStatus);
router.post('/travel-guides/:id/reset-password', ctrl.adminResetPassword);
router.delete('/travel-guides/:id',              ctrl.deleteTravelGuide);

module.exports = router;