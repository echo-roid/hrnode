const pool = require('../config/db');
const upload = require('../middleware/upload');
const path = require('path');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const employeeController = {
createEmployee: async (req, res) => {
  try {
    const {
      empId,
      name,
      designation,
      level,
      email,
      password,
      age,
      identity_id,
      contact_number,
      house_address,
      date_of_birth,
      team_name,
      reporting_manager_id,
      reporting_manager,
      father_name,
      mother_name,
      joining_date,
      current_project,
      appraisal_points,
      leaves,
      
      // Salary & Allowances
      annual_ctc,
      basic_salary,
      hra,
      conveyance,
      special_allowance,
      other_allowance,
      total_earnings,
      pf_percentage,
      professional_tax_fixed,
      tds_percentage,
      total_deductions,
      net_salary,
      
      // Date Details
      confirm_date,
      resigned_date,
      left_date,
      marriage_date,
      retired_date,
      resign_reason,
      
      // Official Email
      official_email,
      official_email_password
    } = req.body;
    
    // Validate required fields
    if (!empId || !name || !email || !level || !designation || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate level
    const validLevels = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: 'Invalid level value' });
    }

    // Check if empId, email, or official_email already exists
    const [existingId] = await pool.execute(
      'SELECT id FROM employees WHERE id = ? OR email = ? OR (official_email IS NOT NULL AND official_email = ?)',
      [empId, email, official_email || null]
    );
    if (existingId.length > 0) {
      return res.status(409).json({ error: 'Employee ID, email, or official email already exists' });
    }

    // Hash passwords
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const hashedOfficialEmailPassword = official_email_password 
      ? await bcrypt.hash(official_email_password, saltRounds) 
      : null;

    // Handle photo upload (optional)
    const photo = req.file ? req.file.filename : null;

    // Helper functions
    const toNull = (value) => {
      return value === undefined || value === '' ? null : value;
    };

    const toNumber = (value) => {
      if (value === undefined || value === '') return 0;
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    };

    const toString = (value) => {
      return value === undefined || value === '' ? '' : value;
    };

    // Process leaves (use the 'leaves' column, not 'leave_quotas')
    let leavesJSON = null;
    if (leaves) {
      if (typeof leaves === 'string') {
        leavesJSON = leaves;
      } else {
        leavesJSON = JSON.stringify(leaves);
      }
    }

    // Define columns (without 'leave_quotas' since it doesn't exist)
    const columns = [
      'id', 'name', 'designation', 'level', 'email', 'password', 'age', 'identity_id', 
      'photo', 'contact_number', 'house_address', 'date_of_birth', 'team_name', 
      'reporting_manager', 'reporting_manager_id', 'father_name', 'mother_name', 
      'joining_date', 'current_project', 'appraisal_points', 'created_at', 'updated_at', 
      'deleted_at', 'password_plain', 'leaves',
      'annual_ctc', 'basic_salary', 'hra', 'conveyance', 'special_allowance', 'other_allowance',
      'total_earnings', 'pf_percentage', 'professional_tax_fixed', 'tds_percentage', 
      'total_deductions', 'net_salary',
      'confirm_date', 'resigned_date', 'left_date', 'marriage_date', 'retired_date', 'resign_reason',
      'official_email', 'official_email_password'
    ];

    const values = [
      toNull(empId), toNull(name), toNull(designation), toNull(level), toNull(email), 
      toNull(hashedPassword), toNumber(age), toNull(identity_id), toNull(photo), 
      toNull(contact_number), toNull(house_address), toNull(date_of_birth), 
      toString(team_name),
      toNull(reporting_manager), toNumber(reporting_manager_id), toNull(father_name), 
      toNull(mother_name), toNull(joining_date), toNull(current_project), toNumber(appraisal_points),
      new Date(), new Date(), null, toNull(password), leavesJSON,
      toNumber(annual_ctc), toNumber(basic_salary), toNumber(hra), toNumber(conveyance), 
      toNumber(special_allowance), toNumber(other_allowance), toNumber(total_earnings),
      toNumber(pf_percentage), toNumber(professional_tax_fixed), toNumber(tds_percentage),
      toNumber(total_deductions), toNumber(net_salary),
      toNull(confirm_date), toNull(resigned_date), toNull(left_date), toNull(marriage_date), 
      toNull(retired_date), toNull(resign_reason),
      toNull(official_email), toNull(hashedOfficialEmailPassword)
    ];

    // Create the SQL query
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO employees (${columns.join(', ')}) VALUES (${placeholders})`;

    console.log('Number of columns:', columns.length);
    console.log('Number of values:', values.length);

    if (columns.length !== values.length) {
      return res.status(500).json({ 
        error: 'Column count mismatch', 
        columns: columns.length, 
        values: values.length 
      });
    }

    // Check for any undefined values
    const undefinedIndex = values.findIndex(v => v === undefined);
    if (undefinedIndex !== -1) {
      console.error(`Undefined value at index ${undefinedIndex}`);
      return res.status(400).json({ error: `Missing value for parameter at position ${undefinedIndex + 1}` });
    }

    await pool.execute(sql, values);

    res.status(201).json({ message: 'Employee created successfully', empId });

  } catch (error) {
    console.error('Create Employee Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
},
  // Get all employees
getAllEmployees: async (req, res) => {
  try {
    const path = require('path');
    
    const [employees] = await pool.execute(`
      SELECT 
        id, name, designation, level, email, password, password_plain, age, identity_id, 
        photo, contact_number, house_address, date_of_birth, 
        team_name, reporting_manager, reporting_manager_id, leaves,
        father_name, mother_name, joining_date, 
        current_project, appraisal_points,
        
        -- Salary & Allowances
        annual_ctc, basic_salary, hra, conveyance, special_allowance, other_allowance,
        total_earnings, pf_percentage, professional_tax_fixed, tds_percentage, 
        total_deductions, net_salary,
        
        -- Date Details
        confirm_date, resigned_date, left_date, marriage_date, retired_date, resign_reason,
        
        -- Official Email
        official_email, official_email_password
      FROM employees
      WHERE deleted_at IS NULL
    `);

    const updatedEmployees = employees.map(emp => {
      // Parse leaves JSON if exists
      let parsedLeaves = null;
      if (emp.leaves) {
        try {
          parsedLeaves = typeof emp.leaves === 'string' ? JSON.parse(emp.leaves) : emp.leaves;
        } catch (e) {
          console.error('Error parsing leaves:', e);
        }
      }
      
      // Parse leave_quotas JSON if exists
      let parsedLeaveQuotas = [];
      if (emp.leave_quotas) {
        try {
          parsedLeaveQuotas = typeof emp.leave_quotas === 'string' 
            ? JSON.parse(emp.leave_quotas) 
            : emp.leave_quotas;
        } catch (e) {
          console.error('Error parsing leave_quotas:', e);
        }
      } else if (parsedLeaves && Array.isArray(parsedLeaves)) {
        // For backward compatibility, use leaves data if leave_quotas doesn't exist
        parsedLeaveQuotas = parsedLeaves;
      }
      
      return {
        ...emp,
        photo: emp.photo
          ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(emp.photo)}`
          : null,
        leaves: parsedLeaves,
        leave_quotas: parsedLeaveQuotas,
        official_email_password: emp.official_email_password ? '********' : null
      };
    });

    res.json(updatedEmployees);
  } catch (error) {
    console.error('Get All Employees Error:', error);
    res.status(500).json({ error: error.message });
  }
},

  // Delete an employee
  deleteEmployee: async (req, res) => {
    let connection;
    try {
      const { id } = req.params;
      connection = await pool.getConnection();

      const [employee] = await connection.query(
        'SELECT id, photo FROM employees WHERE id = ?',
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      await connection.beginTransaction();

      try {
        await connection.query('DELETE FROM leave_requests WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM leave_adjustments WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM leave_balances WHERE employee_id = ?', [id]);
        await connection.query('DELETE FROM employees WHERE id = ?', [id]);

        if (employee[0].photo) {
          const fs = require('fs');
          const photoPath = path.join(__dirname, '../uploads', employee[0].photo);
          if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
          }
        }

        await connection.commit();
        res.json({ message: 'Employee deleted successfully' });
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Delete Employee Error:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } finally {
      if (connection) connection.release();
    }
  },

  // Soft delete alternative
  softDeleteEmployee: async (req, res) => {
    try {
      const { id } = req.params;

      const [employee] = await pool.execute(
        'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
        [id]
      );

      if (employee.length === 0) {
        return res.status(404).json({ error: 'Employee not found or already deleted' });
      }

      await pool.execute(
        'UPDATE employees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      res.json({ message: 'Employee deactivated successfully' });
    } catch (error) {
      console.error('Soft Delete Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get one employee by ID
getEmployeeById: async (req, res) => {
  try {
    const { id } = req.params;
    const path = require('path');

    const [rows] = await pool.execute(`
      SELECT 
        id, name, designation, level, email, password, password_plain, age, identity_id, 
        photo, contact_number, house_address, date_of_birth, 
        team_name, reporting_manager, reporting_manager_id, leaves,
        father_name, mother_name, joining_date, 
        current_project, appraisal_points,
        
        -- Salary & Allowances
        annual_ctc, basic_salary, hra, conveyance, special_allowance, other_allowance,
        total_earnings, pf_percentage, professional_tax_fixed, tds_percentage, 
        total_deductions, net_salary,
        
        -- Date Details
        confirm_date, resigned_date, left_date, marriage_date, retired_date, resign_reason,
        
        -- Official Email
        official_email, official_email_password
        
      FROM employees 
      WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = rows[0];
    
    // Handle photo URL
    if (employee.photo) {
      employee.photo = `${req.protocol}://${req.get('host')}/uploads/${path.basename(employee.photo)}`;
    }
    
    // Parse leaves JSON if exists
    if (employee.leaves) {
      try {
        employee.leaves = typeof employee.leaves === 'string' ? JSON.parse(employee.leaves) : employee.leaves;
      } catch (e) {
        console.error('Error parsing leaves:', e);
        employee.leaves = null;
      }
    }
    
    // For backward compatibility, set leave_quotas to same as leaves
    employee.leave_quotas = employee.leaves;
    
    // Hide sensitive data
    if (employee.official_email_password) {
      employee.official_email_password = '********';
    }

    // --- STRUCTURE ALLOWANCES ---
    const basicSalary = employee.basic_salary !== null && employee.basic_salary !== undefined 
      ? parseFloat(employee.basic_salary) 
      : null;
    
    const hra = employee.hra !== null && employee.hra !== undefined 
      ? parseFloat(employee.hra) 
      : null;
    
    const conveyance = employee.conveyance !== null && employee.conveyance !== undefined 
      ? parseFloat(employee.conveyance) 
      : null;
    
    // Medical column doesn't exist, set to null
    const medical = null;
    
    const specialAllowance = employee.special_allowance !== null && employee.special_allowance !== undefined 
      ? parseFloat(employee.special_allowance) 
      : null;
    
    const otherAllowance = employee.other_allowance !== null && employee.other_allowance !== undefined 
      ? parseFloat(employee.other_allowance) 
      : null;
    
    const totalEarnings = employee.total_earnings !== null && employee.total_earnings !== undefined 
      ? parseFloat(employee.total_earnings) 
      : null;
    
    const annualCTC = employee.annual_ctc !== null && employee.annual_ctc !== undefined 
      ? parseFloat(employee.annual_ctc) 
      : null;

    employee.allowance = {
      basic_salary: basicSalary,
      hra: hra,
      conveyance: conveyance,
      medical: medical,
      special_allowance: specialAllowance,
      other_allowance: otherAllowance,
      total_earnings: totalEarnings,
      annual_ctc: annualCTC,
      calculated_total: (basicSalary !== null || hra !== null || conveyance !== null || 
                         medical !== null || specialAllowance !== null || otherAllowance !== null)
        ? (basicSalary || 0) + (hra || 0) + (conveyance || 0) + (medical || 0) + 
          (specialAllowance || 0) + (otherAllowance || 0)
        : null
    };

    // --- STRUCTURE DEDUCTIONS ---
    const pfPercentage = employee.pf_percentage !== null && employee.pf_percentage !== undefined 
      ? parseFloat(employee.pf_percentage) 
      : null;
    
    const professionalTax = employee.professional_tax_fixed !== null && employee.professional_tax_fixed !== undefined 
      ? parseFloat(employee.professional_tax_fixed) 
      : null;
    
    const tdsPercentage = employee.tds_percentage !== null && employee.tds_percentage !== undefined 
      ? parseFloat(employee.tds_percentage) 
      : null;
    
    const totalDeductions = employee.total_deductions !== null && employee.total_deductions !== undefined 
      ? parseFloat(employee.total_deductions) 
      : null;

    // Calculate PF amount if both basic salary and pf percentage exist
    let pfAmount = null;
    if (basicSalary !== null && pfPercentage !== null) {
      pfAmount = parseFloat(((basicSalary * pfPercentage) / 100).toFixed(2));
    }

    // Calculate TDS amount if both total earnings and tds percentage exist
    let tdsAmount = null;
    if (totalEarnings !== null && tdsPercentage !== null) {
      tdsAmount = parseFloat(((totalEarnings * tdsPercentage) / 100).toFixed(2));
    }

    employee.deductions = {
      pf_percentage: pfPercentage,
      pf_amount: pfAmount,
      professional_tax: professionalTax,
      tds_percentage: tdsPercentage,
      tds_amount: tdsAmount,
      total_deductions: totalDeductions,
      calculated_total: (pfAmount !== null || professionalTax !== null || tdsAmount !== null)
        ? (pfAmount || 0) + (professionalTax || 0) + (tdsAmount || 0)
        : null
    };

    // --- STRUCTURE NET SALARY ---
    employee.net_salary = employee.net_salary !== null && employee.net_salary !== undefined 
      ? parseFloat(employee.net_salary) 
      : null;

    // --- BANK DETAILS (if columns exist, otherwise null) ---
    employee.bank_details = {
      bank_name: null,
      bank_account_number: null,
      bank_ifsc: null,
      bank_branch: null,
      bank_account_name: null,
      uan_number: null,
      pan_number: null
    };

    // If you have these columns in your database, you can add them back:
    // employee.bank_details = {
    //   bank_name: employee.bank_name || null,
    //   bank_account_number: employee.bank_account_number || null,
    //   bank_ifsc: employee.bank_ifsc || null,
    //   bank_branch: employee.bank_branch || null,
    //   bank_account_name: employee.bank_account_name || null,
    //   uan_number: employee.uan_number || null,
    //   pan_number: employee.pan_number || null,
    // };

    res.json(employee);
  } catch (error) {
    console.error('Get Employee By ID Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
},

  // Get all managers
  getAllManagers: async (req, res) => {
    try {
      const [managers] = await pool.execute(`
        SELECT 
          id, name, designation, level, email, photo
        FROM employees
        WHERE designation = 'Manager' OR level IN ('Lead', 'Manager')
        AND deleted_at IS NULL
      `);

      const updatedManagers = managers.map(manager => ({
        ...manager,
        photo: manager.photo
          ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(manager.photo)}`
          : null,
      }));

      res.json(updatedManagers);
    } catch (error) {
      console.error('Get All Managers Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update employee details
 editEmployee: async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch existing employee to check presence and photo
    const [existingRows] = await pool.execute(
      'SELECT photo FROM employees WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const existingPhoto = existingRows[0].photo;

    const {
      name,
      designation,
      level,
      email,
      age,
      identity_id,
      contact_number,
      house_address,
      date_of_birth,
      team_name,
      reporting_manager_id,
      reporting_manager,
      father_name,
      mother_name,
      joining_date,
      current_project,
      appraisal_points,
      leaves,
      
      // Dynamic Leave Quotas (JSON)
      leave_quotas,
      
      // Salary & Allowances
      annual_ctc,
      basic_salary,
      hra,
      conveyance,
      special_allowance,
      other_allowance,
      total_earnings,
      pf_percentage,
      professional_tax_fixed,
      tds_percentage,
      total_deductions,
      net_salary,
      
      // Date Details
      confirm_date,
      resigned_date,
      left_date,
      marriage_date,
      retired_date,
      resign_reason,
      
      // Official Email
      official_email,
      official_email_password
    } = req.body;

    // Handle optional new photo
    const photo = req.file ? req.file.filename : existingPhoto;
    const updated_at = new Date();
    
    // Process leave quotas - store in leave_quotas JSON column
    let leaveQuotasJSON = null;
    if (leave_quotas) {
      if (typeof leave_quotas === 'string') {
        leaveQuotasJSON = leave_quotas;
      } else {
        leaveQuotasJSON = JSON.stringify(leave_quotas);
      }
    } else if (leaves) {
      // For backward compatibility, convert old leaves format
      leaveQuotasJSON = typeof leaves === 'string' ? leaves : JSON.stringify(leaves);
    }
    
    // Process leaves column for backward compatibility
    let leavesJSON = null;
    if (leaves) {
      leavesJSON = typeof leaves === 'string' ? leaves : JSON.stringify(leaves);
    } else if (leave_quotas) {
      leavesJSON = typeof leave_quotas === 'string' ? leave_quotas : JSON.stringify(leave_quotas);
    }
    
    // Hash official email password if provided and changed
    let hashedOfficialEmailPassword = undefined;
    if (official_email_password && official_email_password !== '********') {
      hashedOfficialEmailPassword = await bcrypt.hash(official_email_password, saltRounds);
    }

    const updateQuery = `
      UPDATE employees
      SET name = ?, designation = ?, level = ?, email = ?, age = ?, identity_id = ?, 
          photo = ?, contact_number = ?, house_address = ?, date_of_birth = ?, 
          team_name = ?, reporting_manager = ?, reporting_manager_id = ?, 
          father_name = ?, mother_name = ?, joining_date = ?, current_project = ?, 
          appraisal_points = ?, updated_at = ?, leaves = ?, leave_quotas = ?,
          
          -- Salary & Allowances
          annual_ctc = ?, basic_salary = ?, hra = ?, conveyance = ?, special_allowance = ?,
          other_allowance = ?, total_earnings = ?, pf_percentage = ?, professional_tax_fixed = ?,
          tds_percentage = ?, total_deductions = ?, net_salary = ?,
          
          -- Date Details
          confirm_date = ?, resigned_date = ?, left_date = ?, marriage_date = ?,
          retired_date = ?, resign_reason = ?,
          
          -- Official Email
          official_email = ?,
          official_email_password = COALESCE(?, official_email_password)
      WHERE id = ?
    `;

    const values = [
      name, designation, level, email, age || null, identity_id || null,
      photo, contact_number || null, house_address || null, date_of_birth || null,
      team_name || null, reporting_manager || null, reporting_manager_id || null,
      father_name || null, mother_name || null, joining_date || null,
      current_project || null, appraisal_points || 0, updated_at, leavesJSON, leaveQuotasJSON,
      
      // Salary values
      annual_ctc || null, basic_salary || null, hra || null, conveyance || null,
      special_allowance || null, other_allowance || null, total_earnings || null,
      pf_percentage || null, professional_tax_fixed || null, tds_percentage || null,
      total_deductions || null, net_salary || null,
      
      // Date details
      confirm_date || null, resigned_date || null, left_date || null,
      marriage_date || null, retired_date || null, resign_reason || null,
      
      // Official email
      official_email || null,
      hashedOfficialEmailPassword,
      id
    ];

    await pool.execute(updateQuery, values);

    res.json({ message: 'Employee updated successfully' });

  } catch (error) {
    console.error('Edit Employee Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
},
};

module.exports = employeeController;