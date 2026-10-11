const pool = require('../config/db');

// Helper function to safely parse JSON strings
function tryParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
}

// Simplified Overtime Rules (matches frontend)
const DEFAULT_OVERTIME_RULES = {
  minimumOvertimeHours: 1,
  allowCompensatoryLeave: true,
  allowOvertimePayment: true,
  allowTimeOffAdjustment: false
};

// Simplified Late Threshold Rules (matches frontend)
const DEFAULT_LATE_THRESHOLD_RULES = {
  officeStartTime: '09:00',
  halfDayLateThresholdMinutes: 15,  // Default 15 minutes
  halfSalaryDeductionEnabled: true,
  allowOvertimeAdjustmentForLateArrival: true
};

module.exports = {
  // Get current leave settings
  getLeaveSettings: async (req, res) => {
    try {
      const [settings] = await pool.query('SELECT * FROM leave_settings LIMIT 1');
      
      if (settings.length === 0) {
        return res.status(200).json({
          workingHours: 8,
          workingDays: 5,
          leaveTypes: [
            'Sick Leave',
            'Casual Leave',
            'Earned Leave',
            'Maternity Leave',
            'Paternity Leave',
            'Compensatory Leave'
          ],
          customLeaves: [],
          leaveStatus: {},
          leaveQuotas: {},
          selectedLeaves: [],
          overtimeRules: DEFAULT_OVERTIME_RULES,
          lateThresholdRules: DEFAULT_LATE_THRESHOLD_RULES
        });
      }

      const setting = settings[0];
      
      // Get configs from existing columns
      let overtimeRules = setting.overtime_config 
        ? (typeof setting.overtime_config === 'string' ? tryParseJSON(setting.overtime_config) : setting.overtime_config)
        : DEFAULT_OVERTIME_RULES;
      
      let lateThresholdRules = setting.late_threshold_config 
        ? (typeof setting.late_threshold_config === 'string' ? tryParseJSON(setting.late_threshold_config) : setting.late_threshold_config)
        : DEFAULT_LATE_THRESHOLD_RULES;

      // If the stored config has old structure (with nested objects), convert to new flat structure
      if (overtimeRules && (overtimeRules.accumulation || overtimeRules.payment)) {
        overtimeRules = {
          minimumOvertimeHours: overtimeRules.accumulation?.minOvertimeForLeave || overtimeRules.leaveConversion?.minimumHours || 1,
          allowCompensatoryLeave: overtimeRules.leaveConversion?.enabled !== undefined ? overtimeRules.leaveConversion.enabled : true,
          allowOvertimePayment: overtimeRules.payment?.enabled !== undefined ? overtimeRules.payment.enabled : true,
          allowTimeOffAdjustment: false
        };
      }

      if (lateThresholdRules && (lateThresholdRules.gracePeriod || lateThresholdRules.deduction)) {
        lateThresholdRules = {
          officeStartTime: lateThresholdRules.officeStartTime || '09:00',
          halfDayLateThresholdMinutes: lateThresholdRules.attendanceMarking?.halfDayAfterMinutes || 
                                       lateThresholdRules.halfDayLateThresholdMinutes || 15,
          halfSalaryDeductionEnabled: lateThresholdRules.deduction?.enabled !== undefined ? 
                                       lateThresholdRules.deduction.enabled : 
                                       (lateThresholdRules.halfSalaryDeductionEnabled !== undefined ? 
                                       lateThresholdRules.halfSalaryDeductionEnabled : true),
          allowOvertimeAdjustmentForLateArrival: lateThresholdRules.overtimeCompensation?.enabled !== undefined ? 
                                                  lateThresholdRules.overtimeCompensation.enabled : 
                                                  (lateThresholdRules.allowOvertimeAdjustmentForLateArrival !== undefined ? 
                                                  lateThresholdRules.allowOvertimeAdjustmentForLateArrival : true)
        };
      }

      res.status(200).json({
        workingHours: setting.working_hours,
        workingDays: setting.working_days,
        leaveTypes: setting.leave_types ? (typeof setting.leave_types === 'string' ? tryParseJSON(setting.leave_types) : setting.leave_types) : [],
        customLeaves: setting.custom_leaves ? (typeof setting.custom_leaves === 'string' ? tryParseJSON(setting.custom_leaves) : setting.custom_leaves) : [],
        leaveStatus: setting.leave_status ? (typeof setting.leave_status === 'string' ? tryParseJSON(setting.leave_status) : setting.leave_status) : {},
        leaveQuotas: setting.leave_quotas ? (typeof setting.leave_quotas === 'string' ? tryParseJSON(setting.leave_quotas) : setting.leave_quotas) : {},
        selectedLeaves: setting.selected_leaves ? (typeof setting.selected_leaves === 'string' ? tryParseJSON(setting.selected_leaves) : setting.selected_leaves) : [],
        overtimeRules: overtimeRules,
        lateThresholdRules: lateThresholdRules
      });

    } catch (err) {
      console.error('Error fetching leave settings:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get all active leave types
  getActiveLeaveTypes: async (req, res) => {
    try {
      const [settings] = await pool.query(`
        SELECT leave_status, leave_types, custom_leaves, leave_quotas
        FROM leave_settings LIMIT 1
      `);
  
      if (settings.length === 0) {
        return res.status(200).json({
          activeLeaves: ['Sick Leave', 'Casual Leave'],
          leaveQuotas: {}
        });
      }
  
      const setting = settings[0];
  
      const leaveStatus = typeof setting.leave_status === 'string' 
        ? tryParseJSON(setting.leave_status) || {} 
        : setting.leave_status || {};
  
      const standardLeaves = Array.isArray(setting.leave_types) 
        ? setting.leave_types 
        : (typeof setting.leave_types === 'string' ? tryParseJSON(setting.leave_types) : []);
  
      const customLeaves = Array.isArray(setting.custom_leaves) 
        ? setting.custom_leaves 
        : (typeof setting.custom_leaves === 'string' ? tryParseJSON(setting.custom_leaves) : []);
  
      const leaveQuotas = typeof setting.leave_quotas === 'string' 
        ? tryParseJSON(setting.leave_quotas) || {} 
        : setting.leave_quotas || {};
  
      const allLeaves = [...standardLeaves, ...customLeaves];
      const activeLeaves = allLeaves.filter(leave => leaveStatus[leave]);
  
      const leaveQuotaData = activeLeaves.reduce((acc, leave) => {
        const quotas = leaveQuotas[leave] || { monthly: 0, yearly: 0 };
        acc[leave] = {
          monthly: quotas.monthly,
          yearly: quotas.yearly
        };
        return acc;
      }, {});
  
      res.status(200).json({
        activeLeaves,
        leaveQuotas: leaveQuotaData
      });
  
    } catch (err) {
      console.error('Error fetching active leave types:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Save leave settings
  saveLeaveSettings: async (req, res) => {
    try {
      const {
        workingHours,
        workingDays,
        leaveTypes = [],
        customLeaves = [],
        leaveStatus = {},
        leaveQuotas = {},
        selectedLeaves = [],
        overtimeRules = DEFAULT_OVERTIME_RULES,
        lateThresholdRules = DEFAULT_LATE_THRESHOLD_RULES
      } = req.body;

      // Ensure halfDayLateThresholdMinutes is properly set from frontend
      const updatedLateThresholdRules = {
        officeStartTime: lateThresholdRules.officeStartTime || '09:00',
        halfDayLateThresholdMinutes: lateThresholdRules.halfDayLateThresholdMinutes || 15,
        halfSalaryDeductionEnabled: lateThresholdRules.halfSalaryDeductionEnabled !== undefined ? 
                                    lateThresholdRules.halfSalaryDeductionEnabled : true,
        allowOvertimeAdjustmentForLateArrival: lateThresholdRules.allowOvertimeAdjustmentForLateArrival !== undefined ? 
                                               lateThresholdRules.allowOvertimeAdjustmentForLateArrival : true
      };

      console.log('Saving halfDayLateThresholdMinutes:', updatedLateThresholdRules.halfDayLateThresholdMinutes);

      const [existingRows] = await pool.query('SELECT * FROM leave_settings LIMIT 1');

      if (existingRows.length > 0) {
        const existing = existingRows[0];

        await pool.query(`
          UPDATE leave_settings SET
            working_hours = ?,
            working_days = ?,
            leave_types = ?,
            custom_leaves = ?,
            leave_status = ?,
            leave_quotas = ?,
            selected_leaves = ?,
            overtime_config = ?,
            late_threshold_config = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          workingHours,
          workingDays,
          JSON.stringify(leaveTypes),
          JSON.stringify(customLeaves),
          JSON.stringify(leaveStatus),
          JSON.stringify(leaveQuotas),
          JSON.stringify(selectedLeaves),
          JSON.stringify(overtimeRules),
          JSON.stringify(updatedLateThresholdRules),
          existing.id
        ]);
      } else {
        await pool.query(`
          INSERT INTO leave_settings (
            working_hours, working_days,
            leave_types, custom_leaves,
            leave_status, leave_quotas,
            selected_leaves, overtime_config,
            late_threshold_config
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          workingHours,
          workingDays,
          JSON.stringify(leaveTypes),
          JSON.stringify(customLeaves),
          JSON.stringify(leaveStatus),
          JSON.stringify(leaveQuotas),
          JSON.stringify(selectedLeaves),
          JSON.stringify(overtimeRules),
          JSON.stringify(updatedLateThresholdRules)
        ]);
      }

      res.status(200).json({
        success: true,
        message: 'Settings saved successfully',
        savedValue: updatedLateThresholdRules.halfDayLateThresholdMinutes
      });

    } catch (err) {
      console.error('Error saving leave settings:', err);
      res.status(500).json({
        success: false,
        error: `Failed to save settings: ${err.message}`
      });
    }
  },

  // ============ COMPANY BRANCHES CRUD OPERATIONS ============

  // Get all company branches
  getAllBranches: async (req, res) => {
    try {
      const [branches] = await pool.query(`
        SELECT * FROM company_branches ORDER BY is_headquarters DESC, name ASC
      `);
      
      res.status(200).json({ branches });
    } catch (err) {
      console.error('Error fetching branches:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get branch by ID
  getBranchById: async (req, res) => {
    try {
      const { id } = req.params;
      const [branches] = await pool.query('SELECT * FROM company_branches WHERE id = ?', [id]);
      
      if (branches.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }
      
      res.status(200).json({ branch: branches[0] });
    } catch (err) {
      console.error('Error fetching branch:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create new branch
  createBranch: async (req, res) => {
    try {
      const {
        name,
        address,
        city,
        state,
        country,
        pincode,
        latitude,
        longitude,
        phone,
        email,
        is_headquarters,
        working_hours,
        timezone,
        employee_count
      } = req.body;

      if (is_headquarters) {
        await pool.query('UPDATE company_branches SET is_headquarters = FALSE');
      }

      const [result] = await pool.query(`
        INSERT INTO company_branches (
          name, address, city, state, country, pincode,
          latitude, longitude, phone, email, is_headquarters,
          working_hours, timezone, employee_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, address, city, state, country || 'India', pincode,
        latitude || null, longitude || null, phone, email, is_headquarters || false,
        JSON.stringify(working_hours || { start: '09:00', end: '18:00' }),
        timezone || 'Asia/Kolkata',
        employee_count || 0
      ]);

      const [newBranch] = await pool.query('SELECT * FROM company_branches WHERE id = ?', [result.insertId]);

      res.status(201).json({
        success: true,
        message: 'Branch created successfully',
        branch: newBranch[0]
      });
    } catch (err) {
      console.error('Error creating branch:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update branch
  updateBranch: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        address,
        city,
        state,
        country,
        pincode,
        latitude,
        longitude,
        phone,
        email,
        is_headquarters,
        working_hours,
        timezone,
        employee_count
      } = req.body;

      const [existing] = await pool.query('SELECT * FROM company_branches WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      if (is_headquarters) {
        await pool.query('UPDATE company_branches SET is_headquarters = FALSE WHERE id != ?', [id]);
      }

      await pool.query(`
        UPDATE company_branches SET
          name = ?,
          address = ?,
          city = ?,
          state = ?,
          country = ?,
          pincode = ?,
          latitude = ?,
          longitude = ?,
          phone = ?,
          email = ?,
          is_headquarters = ?,
          working_hours = ?,
          timezone = ?,
          employee_count = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        name, address, city, state, country || 'India', pincode,
        latitude || null, longitude || null, phone, email, is_headquarters || false,
        JSON.stringify(working_hours || { start: '09:00', end: '18:00' }),
        timezone || 'Asia/Kolkata',
        employee_count || 0,
        id
      ]);

      const [updatedBranch] = await pool.query('SELECT * FROM company_branches WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: 'Branch updated successfully',
        branch: updatedBranch[0]
      });
    } catch (err) {
      console.error('Error updating branch:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Delete branch
  deleteBranch: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [existing] = await pool.query('SELECT * FROM company_branches WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      await pool.query('DELETE FROM company_branches WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: 'Branch deleted successfully'
      });
    } catch (err) {
      console.error('Error deleting branch:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get branch statistics
  getBranchStatistics: async (req, res) => {
    try {
      const [stats] = await pool.query(`
        SELECT 
          COUNT(*) as total_branches,
          SUM(CASE WHEN is_headquarters = TRUE THEN 1 ELSE 0 END) as headquarters_count,
          SUM(employee_count) as total_employees,
          COUNT(DISTINCT country) as countries_count
        FROM company_branches
      `);

      const [branchWiseStats] = await pool.query(`
        SELECT 
          id,
          name,
          city,
          country,
          employee_count,
          is_headquarters
        FROM company_branches
        ORDER BY employee_count DESC
      `);

      res.status(200).json({
        statistics: stats[0],
        branchWiseStats
      });
    } catch (err) {
      console.error('Error fetching branch statistics:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};