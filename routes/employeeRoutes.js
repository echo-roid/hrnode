const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const employeeController = require('../controllers/employeeController');

// Upload photo and create employee

const {
  uploadEmployeePhoto,
  saveEmployeePhotoToR2
} = require('../middleware/employeePhotoR2');

// CREATE EMPLOYEE
router.post(
  '/',
  uploadEmployeePhoto.single('photo'),
  saveEmployeePhotoToR2,
  employeeController.createEmployee
);

// EDIT EMPLOYEE
router.put(
  '/employees/:id',
  uploadEmployeePhoto.single('photo'),
  saveEmployeePhotoToR2,
  employeeController.editEmployee
);

// Get all employees
router.get('/', employeeController.getAllEmployees);

router.get('/allmanagers', employeeController.getAllManagers);


// Get employee by ID with full data
router.get('/:id', employeeController.getEmployeeById);

router.delete('/:id', employeeController.deleteEmployee);

// For soft deletion (alternative)
router.patch('/:id/deactivate', employeeController.softDeleteEmployee);



module.exports = router;
