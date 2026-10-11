// routes/hotelAssignRoutes.js
const express = require('express');
const router = express.Router();
const {
    PreHotelAssign,
    PostHotelAssign,
    GetPreHotelAssignments,
    GetPostHotelAssignments,
    GetPreHotelAssignmentById,
    GetPostHotelAssignmentById,
    UpdatePreHotelAssign,
    UpdatePostHotelAssign,
    DeletePreHotelAssign,
    DeletePostHotelAssign
} = require('../controllers/Pre_PostHotelAssign');

// Create assignments
router.post('/pre-hotel/assign', PreHotelAssign);
router.post('/post-hotel/assign', PostHotelAssign);

// Get all assignments
router.get('/pre-hotel/assignments', GetPreHotelAssignments);
router.get('/post-hotel/assignments', GetPostHotelAssignments);

// Get single assignment by ID
router.get('/pre-hotel/assign/:id', GetPreHotelAssignmentById);
router.get('/post-hotel/assign/:id', GetPostHotelAssignmentById);

// Update assignments
router.put('/pre-hotel/assign/:id', UpdatePreHotelAssign);
router.put('/post-hotel/assign/:id', UpdatePostHotelAssign);

// Delete assignments
router.delete('/pre-hotel/assign/:id', DeletePreHotelAssign);
router.delete('/post-hotel/assign/:id', DeletePostHotelAssign);

module.exports = router;