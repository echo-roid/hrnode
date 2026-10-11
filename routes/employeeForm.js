const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploaderEmp');
const  employeeFormController  = require('../controllers/employeeFormController');





router.post('/employee-form', upload, employeeFormController.submitEmployeeForm);
router.get('/list', employeeFormController.listEmployees);
router.get('/employeeSpecific/:id', employeeFormController.getEmployeeById);

module.exports = router;
