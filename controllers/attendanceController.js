const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const attendanceService = require('./services/attendanceService');
const pool = require('../config/db');

const {
  S3Client,
  GetObjectCommand
} = require('@aws-sdk/client-s3');

const {
  getSignedUrl
} = require('@aws-sdk/s3-request-presigner');


// ======================================================
// R2 Client (shared for all photo access)
// ======================================================
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${"39ad8f0adb576f69d3c5de646f7f2277"}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: "db4232305608047502f8a475b3de1bd6",
    secretAccessKey: "a7881c22ff7b8b0997539ff060d92b78498a0e1dbce60e717f8503ccbf6ae71a",
  }
});;

const getR2ImageUrl = async (key) => {
  try {
    if (!key) return null;

    // Already a full URL
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return key;
    }

    const command = new GetObjectCommand({
      Bucket: "marketingereignis",
      Key: key,
    });

    const url = await getSignedUrl(r2, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    console.error('R2 signed URL error:', error);
    return null;
  }
};


// ======================================================
// Shared helpers
// ======================================================

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Load global leave settings once, normalized with defaults.
 * Used by both checkIn and checkOut so they never diverge.
 */
const loadSettings = async () => {
  const [rows] = await pool.query(
    `SELECT working_hours, working_days, late_threshold_config, overtime_config
       FROM leave_settings
      LIMIT 1`
  );

  const defaults = {
    workingHours: 8,
    workingDays: [1, 2, 3, 4, 5],
    officeStartTime: '09:00',
    halfDayLateThresholdMinutes: 15,
    halfSalaryDeductionEnabled: false,
    allowOvertimeAdjustmentForLateArrival: false,
    minimumOvertimeHours: 1,
    allowOvertimePayment: false,
    allowCompensatoryLeave: false,
  };

  if (!rows.length) return defaults;

  const s = rows[0];
  const lateCfg = parseJsonSafe(s.late_threshold_config, {});
  const otCfg = parseJsonSafe(s.overtime_config, {});
  const workingDays = parseJsonSafe(s.working_days, defaults.workingDays);

  return {
    workingHours:
      typeof s.working_hours === 'number' && s.working_hours > 0
        ? s.working_hours
        : defaults.workingHours,
    workingDays:
      Array.isArray(workingDays) && workingDays.length
        ? workingDays
        : defaults.workingDays,
    officeStartTime: lateCfg.officeStartTime || defaults.officeStartTime,
    halfDayLateThresholdMinutes:
      lateCfg.halfDayLateThresholdMinutes ??
      defaults.halfDayLateThresholdMinutes,
    halfSalaryDeductionEnabled:
      lateCfg.halfSalaryDeductionEnabled ??
      defaults.halfSalaryDeductionEnabled,
    allowOvertimeAdjustmentForLateArrival:
      lateCfg.allowOvertimeAdjustmentForLateArrival ??
      defaults.allowOvertimeAdjustmentForLateArrival,
    minimumOvertimeHours:
      otCfg.minimumOvertimeHours ?? defaults.minimumOvertimeHours,
    allowOvertimePayment:
      otCfg.allowOvertimePayment ?? defaults.allowOvertimePayment,
    allowCompensatoryLeave:
      otCfg.allowCompensatoryLeave ?? defaults.allowCompensatoryLeave,
  };
};

/** Minutes between office start and check-in. > 0 means late. */
const minutesLate = (checkInTime, officeStartTime) => {
  const start = moment(officeStartTime, 'HH:mm');
  const checkIn = moment(checkInTime, 'HH:mm:ss');
  return checkIn.diff(start, 'minutes', true);
};


// ======================================================
// Exports
// ======================================================
module.exports = {

  // ----------------------------------------------------
  // CHECK-IN
  // ----------------------------------------------------
  checkIn: async (req, res) => {
    try {
      const { employeeId, latitude, longitude } = req.body;
      const photoKey = req.file?.path || null;

      const today = moment().format('YYYY-MM-DD');
      const currentTime = moment().format('HH:mm:ss');

      if (!employeeId) {
        return res.status(400).json({ error: 'employeeId is required' });
      }

      // 1. Get employee
      const [employeeRows] = await pool.query(
        `SELECT id, team_name FROM employees WHERE id = ? AND deleted_at IS NULL`,
        [employeeId]
      );

      if (employeeRows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      const employee = employeeRows[0];

      // 2. Check approved leave
      const [leaveRows] = await pool.query(
        `SELECT leave_type FROM leave_records 
         WHERE employee_id = ? 
           AND ? BETWEEN start_date AND end_date
           AND status = 'approved'`,
        [employeeId, today]
      );

      if (leaveRows.length > 0) {
        return res.status(400).json({
          error: 'Cannot check in during approved leave',
          leave_type: leaveRows[0].leave_type
        });
      }

      // 3. Load settings
      const settings = await loadSettings();

      // 4. Working day check
      const todayWeekday = moment().isoWeekday();
      if (!settings.workingDays.includes(todayWeekday)) {
        return res.status(400).json({ error: 'Today is not a working day' });
      }

      // 5. Already checked in?
      const [existingRows] = await pool.query(
        'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
        [employeeId, today]
      );

      if (existingRows.length > 0) {
        return res.status(400).json({ error: 'Already checked in today' });
      }

      // 6. Determine late / half-day status
      const lateMinutes = Math.max(
        0,
        Math.round(minutesLate(currentTime, settings.officeStartTime))
      );
      const isLate = lateMinutes > 0;
      const isHalfDay =
        isLate && lateMinutes >= settings.halfDayLateThresholdMinutes;
      const halfSalaryDeduction =
        isHalfDay && settings.halfSalaryDeductionEnabled;

      let status = 'present';
      if (halfSalaryDeduction) status = 'half_day';
      else if (isLate) status = 'late';

      // 7. Insert attendance (all metrics persisted server-side)
      const attendanceId = uuidv4();
      await pool.query(
        `INSERT INTO attendance (
           id, employee_id, date, check_in, status,
           check_in_photo, check_in_latitude, check_in_longitude,
           team_name, late_minutes, is_half_day, half_salary_deduction
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attendanceId,
          employeeId,
          today,
          currentTime,
          status,
          photoKey,
          latitude ?? null,
          longitude ?? null,
          employee.team_name,
          lateMinutes,
          isHalfDay ? 1 : 0,
          halfSalaryDeduction ? 1 : 0
        ]
      );

      // 8. Flattened response — frontend expects check_in as a STRING
      const photoUrl = await getR2ImageUrl(photoKey);

      return res.status(201).json({
        message: 'Checked in successfully',
        id: attendanceId,
        check_in: currentTime,          // "HH:mm:ss"
        photo_in: photoUrl,             // signed URL
        photo_in_key: photoKey,
        status,
        late_minutes: lateMinutes,
        is_late: isLate,
        is_half_day: isHalfDay,
        half_salary_deduction: halfSalaryDeduction,
        date: today,
      });

    } catch (err) {
      console.error('Check-in error:', err);
      return res.status(500).json({
        error: 'Server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  },


  // ----------------------------------------------------
  // CHECK-OUT
  // ----------------------------------------------------
  checkOut: async (req, res) => {
    try {
      const { employeeId, latitude, longitude } = req.body;
      const photoKey = req.file?.path || null;

      const today = moment().format('YYYY-MM-DD');
      const currentTime = moment().format('HH:mm:ss');

      if (!employeeId) {
        return res.status(400).json({ error: 'employeeId is required' });
      }

      // 1. Verify employee
      const [employeeRows] = await pool.query(
        `SELECT id, team_name FROM employees WHERE id = ? AND deleted_at IS NULL`,
        [employeeId]
      );

      if (employeeRows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // 2. Today's open record
      const [attendanceRows] = await pool.query(
        `SELECT id, check_in, late_minutes, is_half_day, half_salary_deduction
           FROM attendance
          WHERE employee_id = ? AND date = ? AND check_out IS NULL`,
        [employeeId, today]
      );

      if (attendanceRows.length === 0) {
        return res.status(400).json({
          error: 'No check-in record found or already checked out'
        });
      }
      const attendance = attendanceRows[0];

      // 3. Load settings
      const settings = await loadSettings();

      // 4. Times in one consistent frame
      const checkInMoment = moment(
        `${today} ${attendance.check_in}`,
        'YYYY-MM-DD HH:mm:ss'
      );
      const checkOutMoment = moment(
        `${today} ${currentTime}`,
        'YYYY-MM-DD HH:mm:ss'
      );
      const totalHours = Math.max(
        0,
        Math.round(
          (checkOutMoment.diff(checkInMoment, 'minutes', true) / 60) * 100
        ) / 100
      );

      // 5. Overtime — computed on backend (single source of truth)
      let effectiveWorkingHours = settings.workingHours;

      if (
        attendance.late_minutes > 0 &&
        !settings.allowOvertimeAdjustmentForLateArrival
      ) {
        effectiveWorkingHours =
          settings.workingHours - attendance.late_minutes / 60;
        if (effectiveWorkingHours < 0) effectiveWorkingHours = 0;
      }

      let overtime = totalHours - effectiveWorkingHours;
      overtime = overtime > 0 ? Math.round(overtime * 100) / 100 : 0;

      // Minimum overtime rule
      if (overtime > 0 && overtime < settings.minimumOvertimeHours) {
        overtime = 0;
      }

      // 6. Day status semantics (matches your original checkout statuses)
      const officeStartMoment = moment(
        `${today} ${settings.officeStartTime}`,
        'YYYY-MM-DD HH:mm'
      );
      const expectedEnd = moment(officeStartMoment).add(
        settings.workingHours,
        'hours'
      );
      const overtimeLimit = moment(expectedEnd).add(
        settings.minimumOvertimeHours,
        'hours'
      );

      let status = 'left_on_time';
      if (checkOutMoment.isAfter(overtimeLimit) && overtime > 0) {
        status = 'overtime';
      } else if (checkOutMoment.isBefore(expectedEnd)) {
        status = 'left_early';
      }

      // 7. Persist everything
      await pool.query(
        `UPDATE attendance
            SET check_out = ?,
                check_out_photo = ?,
                check_out_latitude = ?,
                check_out_longitude = ?,
                status = ?,
                total_hours = ?,
                overtime_hours = ?,
                overtime_payment_allowed = ?,
                compensatory_leave_allowed = ?,
                overtime_status = ?
          WHERE id = ?`,
        [
          currentTime,
          photoKey,
          latitude ?? null,
          longitude ?? null,
          status,
          totalHours,
          overtime,
          settings.allowOvertimePayment ? 1 : 0,
          settings.allowCompensatoryLeave ? 1 : 0,
          overtime > 0 ? 'earned' : 'none',
          attendance.id
        ]
      );

      // 8. Flattened response
      const photoUrl = await getR2ImageUrl(photoKey);

      return res.status(200).json({
        message: 'Checked out successfully',
        id: attendance.id,
        check_in: attendance.check_in,     // echo back so frontend never uses stale state
        check_out: currentTime,
        photo_out: photoUrl,
        photo_out_key: photoKey,
        status,
        total_hours: totalHours,
        overtime_hours: overtime,
        overtime_payment_allowed: settings.allowOvertimePayment,
        compensatory_leave_allowed: settings.allowCompensatoryLeave,
        is_half_day: !!attendance.is_half_day,
        half_salary_deduction: !!attendance.half_salary_deduction,
        late_minutes: attendance.late_minutes || 0,
        date: today,
      });

    } catch (err) {
      console.error('Check-out error:', err);
      return res.status(500).json({
        error: 'Server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  },


  // ----------------------------------------------------
  // GET attendance records (with optional filters)
  // ----------------------------------------------------
  getAttendanceRecords: async (req, res) => {
    try {
      const { date, team, status } = req.query;

      let query = `
        SELECT 
          a.*, 
          e.name AS employee_name, 
          e.photo AS employee_photo
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
      `;

      const params = [];
      const conditions = [];

      if (date) {
        conditions.push('a.date = ?');
        params.push(date);
      }

      if (team) {
        conditions.push('a.team_name = ?');
        params.push(team);
      }

      if (status) {
        conditions.push('a.status = ?');
        params.push(status);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY a.date DESC';

      const [records] = await pool.query(query, params);

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const formattedRecords = records.map((record) => ({
        ...record,

        check_in_photo: record.check_in_photo
          ? `${baseUrl}/api/storage/image?key=${encodeURIComponent(
              record.check_in_photo
            )}`
          : null,

        check_out_photo: record.check_out_photo
          ? `${baseUrl}/api/storage/image?key=${encodeURIComponent(
              record.check_out_photo
            )}`
          : null
      }));

      res.status(200).json(formattedRecords);

    } catch (err) {
      console.error('Get attendance error:', err);

      res.status(500).json({
        error: 'Failed to fetch attendance records'
      });
    }
  },


  // ----------------------------------------------------
  // Get specific employee's attendance
  // ----------------------------------------------------
  getEmployeeAttendance: async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate } = req.query;

      const [employeeDetails] = await pool.query(
        `SELECT name AS employee_name, photo AS employee_photo, designation FROM employees WHERE id = ?`,
        [employeeId]
      );

      if (employeeDetails.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const { employee_name, employee_photo, designation } = employeeDetails[0];

      let query = 'SELECT * FROM attendance WHERE employee_id = ?';
      const params = [employeeId];

      if (startDate && endDate) {
        query += ' AND date BETWEEN ? AND ?';
        params.push(startDate, endDate);
      }

      query += ' ORDER BY date DESC';
      const [records] = await pool.query(query, params);

      const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
      const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
      const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

      const [weeklyData] = await pool.query(
        `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
        [employeeId, startOfWeek, endOfWeek]
      );

      const [monthlyData] = await pool.query(
        `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
        [employeeId, startOfMonth, endOfMonth]
      );

      let presentDays = 0;
      let leaveDays = 0;
      let absentDays = 0;
      let totalOvertime = 0;

      monthlyData.forEach(record => {
        if (record.status === 'Present') presentDays++;
        else if (record.status === 'Leave') leaveDays++;
        else if (record.status === 'Absent') absentDays++;

        if (record.overtime_hours) {
          totalOvertime += parseFloat(record.overtime_hours);
        }
      });

      const totalWorkingDays = presentDays + leaveDays + absentDays;
      const attendancePercentage = totalWorkingDays > 0
        ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
        : '0.00';

      res.status(200).json({
        employee: {
          employeeId,
          name: employee_name,
          photo: employee_photo,
          designation
        },
        history: records,
        summary: {
          weekly: {
            days: weeklyData.length,
            records: weeklyData
          },
          monthly: {
            presentDays,
            leaveDays,
            absentDays,
            totalWorkingDays,
            attendancePercentage: `${attendancePercentage}%`,
            totalOvertimeHours: totalOvertime
          }
        }
      });

    } catch (err) {
      console.error('Get employee attendance error:', err);
      res.status(500).json({ error: 'Failed to fetch employee attendance' });
    }
  },


  // ----------------------------------------------------
  // Get team attendance
  // ----------------------------------------------------
  getTeamAttendance: async (req, res) => {
    try {
      const { teamName } = req.params;
      const { date } = req.query;

      let query = `
        SELECT a.*, e.name as employee_name, e.photo as employee_photo, e.designation, e.team_name
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE e.team_name = ?
      `;
      const params = [teamName];

      if (date) {
        query += ' AND a.date = ?';
        params.push(date);
      }

      query += ' ORDER BY a.date DESC, e.name ASC';

      const [records] = await pool.query(query, params);

      const employeeMap = {};
      records.forEach((r) => {
        if (!employeeMap[r.employee_id]) {
          employeeMap[r.employee_id] = [];
        }
        employeeMap[r.employee_id].push(r);
      });

      const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD');
      const endOfWeek = moment().endOf('isoWeek').format('YYYY-MM-DD');
      const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');

      const teamSummary = [];

      for (const employeeId of Object.keys(employeeMap)) {
        const firstRecord = employeeMap[employeeId][0];
        const name = firstRecord?.employee_name;
        const photo = firstRecord?.employee_photo;
        const designation = firstRecord?.designation;

        const [weeklyData] = await pool.query(
          `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
          [employeeId, startOfWeek, endOfWeek]
        );

        const [monthlyData] = await pool.query(
          `SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
          [employeeId, startOfMonth, endOfMonth]
        );

        let presentDays = 0;
        let leaveDays = 0;
        let absentDays = 0;
        let totalOvertime = 0;

        monthlyData.forEach(record => {
          if (record.status === 'Present') presentDays++;
          else if (record.status === 'Leave') leaveDays++;
          else if (record.status === 'Absent') absentDays++;

          if (record.overtime_hours) {
            totalOvertime += parseFloat(record.overtime_hours);
          }
        });

        const totalWorkingDays = presentDays + leaveDays + absentDays;
        const attendancePercentage = totalWorkingDays > 0
          ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
          : '0.00';

        teamSummary.push({
          employee_id: employeeId,
          name,
          photo,
          designation,
          weekly: {
            days: weeklyData.length,
          },
          monthly: {
            presentDays,
            leaveDays,
            absentDays,
            totalWorkingDays,
            attendancePercentage: `${attendancePercentage}%`,
            totalOvertimeHours: totalOvertime
          }
        });
      }

      res.status(200).json({ summary: teamSummary });

    } catch (err) {
      console.error('Get team attendance error:', err);
      res.status(500).json({ error: 'Failed to fetch team attendance' });
    }
  },


  // ----------------------------------------------------
  // Today's attendance summary
  // ----------------------------------------------------
  getAttendanceSummary: async (req, res) => {
    try {
      const today = moment().format('YYYY-MM-DD');

      const [allEmployees] = await pool.query(
        `SELECT id, name, photo, team_name FROM employees WHERE deleted_at IS NULL`
      );

      const [attendance] = await pool.query(
        `SELECT employee_id FROM attendance WHERE date = ?`,
        [today]
      );
      const presentIds = new Set(attendance.map(a => a.employee_id));

      const [leaves] = await pool.query(
        `SELECT employee_id FROM leave_records 
         WHERE status = 'approved' AND ? BETWEEN start_date AND end_date`,
        [today]
      );
      const onLeaveIds = new Set(leaves.map(l => l.employee_id));

      const presentEmployees = [];
      const leaveEmployees = [];
      const absentEmployees = [];

      for (const emp of allEmployees) {
        if (presentIds.has(emp.id)) {
          presentEmployees.push(emp);
        } else if (onLeaveIds.has(emp.id)) {
          leaveEmployees.push(emp);
        } else {
          absentEmployees.push(emp);
        }
      }

      res.status(200).json({
        totalEmployees: allEmployees.length,
        totalPresent: presentEmployees.length,
        totalOnLeave: leaveEmployees.length,
        totalAbsent: absentEmployees.length,
        presentEmployees,
        leaveEmployees,
        absentEmployees,
        allEmployees
      });

    } catch (err) {
      console.error('Attendance summary error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },


  // ----------------------------------------------------
  // Attendance summary (all employees, by period)
  // ----------------------------------------------------
  getAttendanceSummaryAll: async (req, res) => {
    try {
      const { period = 'month', employeeId } = req.query;
      const today = moment();

      let startDate;
      if (period === 'week') {
        startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
      } else {
        startDate = today.clone().startOf('month').format('YYYY-MM-DD');
      }
      const endDate = today.format('YYYY-MM-DD');

      let employeeQuery = `SELECT id, name, team_name, photo FROM employees WHERE deleted_at IS NULL`;
      const params = [];

      if (employeeId) {
        employeeQuery += ' AND id = ?';
        params.push(employeeId);
      }

      const [employees] = await pool.query(employeeQuery, params);

      if (employees.length === 0) {
        return res.status(404).json({ error: 'No employees found' });
      }

      const [settingsRows] = await pool.query(`SELECT working_days FROM leave_settings LIMIT 1`);
      let workingDays = [1, 2, 3, 4, 5];

      if (settingsRows.length > 0 && settingsRows[0].working_days) {
        try {
          const parsed = JSON.parse(settingsRows[0].working_days);
          if (Array.isArray(parsed)) workingDays = parsed;
        } catch {}
      }

      const summary = [];

      for (const emp of employees) {
        const [attendance] = await pool.query(
          `SELECT date, status FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
          [emp.id, startDate, endDate]
        );

        const presentDays = attendance.filter(a => ['present', 'late'].includes(a.status)).length;

        let totalWorkingDays = 0;
        let current = moment(startDate);
        const end = moment(endDate);

        while (current <= end) {
          if (workingDays.includes(current.isoWeekday())) {
            totalWorkingDays++;
          }
          current.add(1, 'day');
        }

        const presentPercentage = totalWorkingDays > 0
          ? ((presentDays / totalWorkingDays) * 100).toFixed(2)
          : '0.00';

        summary.push({
          employee_id: emp.id,
          name: emp.name,
          team_name: emp.team_name,
          photo: emp.photo,
          period,
          startDate,
          endDate,
          total_working_days: totalWorkingDays,
          days_present: presentDays,
          present_percentage: `${presentPercentage}%`,
          attendance_records: attendance,
        });
      }

      res.status(200).json(summary);
    } catch (err) {
      console.error('Get all employee summary error:', err);
      res.status(500).json({ error: 'Failed to fetch attendance summary' });
    }
  },


  // ----------------------------------------------------
  // Today present employees grouped by team
  // ----------------------------------------------------
  getTodayPresentEmployeesByTeam: async (req, res) => {
    try {
      const today = moment().format('YYYY-MM-DD');

      const [presentEmployees] = await pool.query(`
        SELECT 
          e.team_name,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', e.id,
              'name', e.name,
              'photo', e.photo,
              'designation', e.designation,
              'check_in', a.check_in,
              'check_out', a.check_out,
              'status', a.status,
              'check_in_photo', a.check_in_photo,
              'check_out_photo', a.check_out_photo
            )
          ) AS employees
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ?
        GROUP BY e.team_name
        ORDER BY e.team_name ASC
      `, [today]);

      const formattedResult = presentEmployees.map(team => {
        const employees = typeof team.employees === 'string'
          ? JSON.parse(team.employees)
          : team.employees;

        return {
          team_name: team.team_name,
          employees,
          count: employees.length
        };
      });

      const [allEmployeesByTeam] = await pool.query(`
        SELECT 
          team_name,
          COUNT(*) AS total
        FROM employees
        WHERE deleted_at IS NULL
        GROUP BY team_name
        ORDER BY team_name ASC
      `);

      const [onLeaveEmployees] = await pool.query(`
        SELECT 
          e.team_name,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', e.id,
              'name', e.name,
              'photo', e.photo,
              'designation', e.designation,
              'leave_type', l.leave_type,
              'start_date', l.start_date,
              'end_date', l.end_date
            )
          ) AS employees
        FROM leave_records l
        JOIN employees e ON l.employee_id = e.id
        WHERE ? BETWEEN l.start_date AND l.end_date
          AND l.status = 'approved'
          AND e.deleted_at IS NULL
        GROUP BY e.team_name
        ORDER BY e.team_name ASC
      `, [today]);

      const formattedLeaveResult = onLeaveEmployees.map(team => {
        const employees = typeof team.employees === 'string'
          ? JSON.parse(team.employees)
          : team.employees;

        return {
          team_name: team.team_name,
          employees,
          count: employees.length
        };
      });

      const teamSummaries = allEmployeesByTeam.map(team => {
        const presentTeam = formattedResult.find(t => t.team_name === team.team_name);
        const leaveTeam = formattedLeaveResult.find(t => t.team_name === team.team_name);

        return {
          team_name: team.team_name,
          total_employees: team.total,
          present_count: presentTeam ? presentTeam.count : 0,
          leave_count: leaveTeam ? leaveTeam.count : 0,
          present_percentage: team.total
            ? ((presentTeam?.count || 0) / team.total * 100).toFixed(2) + '%'
            : '0%',
          leave_percentage: team.total
            ? ((leaveTeam?.count || 0) / team.total * 100).toFixed(2) + '%'
            : '0%'
        };
      });

      const total_employees = allEmployeesByTeam.reduce((sum, t) => sum + t.total, 0);
      const total_present = formattedResult.reduce((sum, t) => sum + t.count, 0);
      const total_on_leave = formattedLeaveResult.reduce((sum, t) => sum + t.count, 0);

      res.status(200).json({
        date: today,
        by_team: {
          present: formattedResult,
          on_leave: formattedLeaveResult,
          summary: teamSummaries
        },
        overall_summary: {
          total_employees,
          total_present,
          total_on_leave
        }
      });

    } catch (err) {
      console.error('Get today present employees by team error:', err);
      res.status(500).json({
        error: 'Failed to fetch today present employees by team',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  },


  // ----------------------------------------------------
  // All employees attendance (with date-range summary)
  // ----------------------------------------------------
  getAllEmployeesAttendance: async (req, res) => {
    try {
      const { startDate, endDate, month, year, status } = req.query;

      console.log('Query params:', { startDate, endDate, month, year, status });

      let dateFilter = '';
      const params = [];

      if (startDate && endDate) {
        dateFilter = 'AND date BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (month && year) {
        const startOfMonth = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
        const endOfMonth = moment(startOfMonth).endOf('month').format('YYYY-MM-DD');
        dateFilter = 'AND date BETWEEN ? AND ?';
        params.push(startOfMonth, endOfMonth);
      } else {
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');
        dateFilter = 'AND date BETWEEN ? AND ?';
        params.push(startOfMonth, endOfMonth);
      }

      const [allEmployees] = await pool.query(
        `SELECT id, name, photo, designation, team_name, email, contact_number FROM employees WHERE deleted_at IS NULL`
      );

      console.log('Found employees:', allEmployees.length);

      if (allEmployees.length === 0) {
        return res.status(404).json({ error: 'No employees found' });
      }

      const employeesWithAttendance = [];

      for (const emp of allEmployees) {
        try {
          const query = `SELECT * FROM attendance WHERE employee_id = ? ${dateFilter} ORDER BY date DESC`;
          console.log('Executing query:', query, 'with params:', [emp.id, ...params]);

          const [attendanceRecords] = await pool.query(query, [emp.id, ...params]);

          console.log(`Employee ${emp.id} has ${attendanceRecords.length} records`);

          let presentDays = 0;
          let leaveDays = 0;
          let absentDays = 0;
          let halfDays = 0;
          let lateDays = 0;
          let totalOvertime = 0;
          let totalWorkingHours = 0;

          attendanceRecords.forEach(record => {
            if (record.status === 'present') presentDays++;
            else if (record.status === 'leave') leaveDays++;
            else if (record.status === 'absent') absentDays++;
            else if (record.status === 'half_day') halfDays++;

            if (record.late_minutes && record.late_minutes > 0) lateDays++;

            if (record.overtime_hours) {
              totalOvertime += parseFloat(record.overtime_hours) || 0;
            }

            if (record.total_hours) {
              totalWorkingHours += parseFloat(record.total_hours) || 0;
            }
          });

          let expectedWorkingDays = 0;
          if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            let current = new Date(start);
            while (current <= end) {
              const dayOfWeek = current.getDay();
              if (dayOfWeek !== 0) {
                expectedWorkingDays++;
              }
              current.setDate(current.getDate() + 1);
            }
          } else if (month && year) {
            const daysInMonth = new Date(year, parseInt(month) + 1, 0).getDate();
            expectedWorkingDays = daysInMonth;
            for (let i = 1; i <= daysInMonth; i++) {
              const date = new Date(year, parseInt(month), i);
              if (date.getDay() === 0) {
                expectedWorkingDays--;
              }
            }
          } else {
            const now = moment();
            const daysInMonth = now.daysInMonth();
            expectedWorkingDays = daysInMonth;
            const startOfMonth = moment().startOf('month');
            for (let i = 0; i < daysInMonth; i++) {
              if (startOfMonth.clone().add(i, 'days').day() === 0) {
                expectedWorkingDays--;
              }
            }
          }

          const attendancePercentage = expectedWorkingDays > 0
            ? ((presentDays / expectedWorkingDays) * 100).toFixed(2)
            : '0.00';

          employeesWithAttendance.push({
            employee_id: emp.id,
            employee_name: emp.name,
            photo: emp.photo,
            designation: emp.designation,
            team_name: emp.team_name,
            email: emp.email,
            contact_number: emp.contact_number,
            attendance_records: attendanceRecords,
            summary: {
              presentDays,
              leaveDays,
              absentDays,
              halfDays,
              lateDays,
              expectedWorkingDays,
              totalWorkingDays: attendanceRecords.length,
              attendancePercentage: `${attendancePercentage}%`,
              totalOvertimeHours: totalOvertime.toFixed(2),
              totalWorkingHours: totalWorkingHours.toFixed(2)
            }
          });

        } catch (empErr) {
          console.error(`Error processing employee ${emp.id}:`, empErr);
        }
      }

      let filteredEmployees = employeesWithAttendance;
      if (status) {
        filteredEmployees = employeesWithAttendance.filter(emp =>
          emp.attendance_records.some(record => record.status === status)
        );
      }

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLeave = 0;
      let totalHalfDay = 0;
      let totalLate = 0;
      let totalOvertime = 0;

      filteredEmployees.forEach(emp => {
        totalPresent += emp.summary.presentDays;
        totalAbsent += emp.summary.absentDays;
        totalLeave += emp.summary.leaveDays;
        totalHalfDay += emp.summary.halfDays;
        totalLate += emp.summary.lateDays;
        totalOvertime += parseFloat(emp.summary.totalOvertimeHours);
      });

      const averageAttendance = filteredEmployees.length > 0
        ? (filteredEmployees.reduce((sum, emp) => sum + parseFloat(emp.summary.attendancePercentage), 0) / filteredEmployees.length).toFixed(2)
        : '0.00';

      res.status(200).json({
        success: true,
        data: {
          employees: filteredEmployees,
          summary: {
            period: {
              start_date: startDate || (month && year ? `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01` : moment().startOf('month').format('YYYY-MM-DD')),
              end_date: endDate || (month && year ? moment(`${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD') : moment().endOf('month').format('YYYY-MM-DD'))
            },
            overall: {
              totalEmployees: filteredEmployees.length,
              totalPresent,
              totalAbsent,
              totalLeave,
              totalHalfDay,
              totalLate,
              totalOvertimeHours: totalOvertime.toFixed(2),
              averageAttendancePercentage: `${averageAttendance}%`
            }
          }
        }
      });

    } catch (err) {
      console.error('Get all employees attendance error:', err);
      console.error('Error details:', err.sql, err.sqlMessage);
      res.status(500).json({
        error: 'Failed to fetch employees attendance data',
        details: err.message
      });
    }
  }
};
