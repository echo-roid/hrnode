const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
module.exports = {
  // 1. Get employee leave information (balance + history)
getEmployeeLeaveInfo: async (req, res) => {
    try {
      const { employeeId } = req.params;
  
      // Verify employee exists and get joining date
      const [employee] = await pool.query(
        'SELECT id, name, designation, joining_date FROM employees WHERE id = ? AND deleted_at IS NULL',
        [employeeId]
      );
  
      if (!employee.length) {
        return res.status(404).json({ error: 'Employee not found' });
      }
  
      const joiningDate = moment(employee[0].joining_date);
      const joiningMonth = joiningDate.month() + 1; // 1-12
      const joiningYear = joiningDate.year();
  
      // Get leave settings (quotas)
      const [settings] = await pool.query('SELECT leave_quotas FROM leave_settings LIMIT 1');
      const leaveQuotas = settings.length
        ? typeof settings[0].leave_quotas === 'string'
          ? JSON.parse(settings[0].leave_quotas)
          : settings[0].leave_quotas
        : {};
  
      // Get current month and year
      const currentDate = moment();
      const currentMonth = currentDate.month() + 1; // 1-12
      const currentYear = currentDate.year();
  
      // Get all approved leaves for this year
      const [approvedLeaves] = await pool.query(`
        SELECT leave_type, MONTH(start_date) as month, SUM(days) as used_days
        FROM leave_records
        WHERE employee_id = ? AND status = 'approved'
          AND YEAR(start_date) = ?
        GROUP BY leave_type, MONTH(start_date)
      `, [employeeId, currentYear]);
  
      // Calculate monthly leave balance with rollover
      const monthlyLeaveBalance = {};
      const yearlyLeaveBalance = {};
  
      for (const [type, quota] of Object.entries(leaveQuotas)) {
        // Initialize monthly balance for each leave type
        monthlyLeaveBalance[type] = {};
        yearlyLeaveBalance[type] = {
          yearly_quota: quota.yearly,
          used: 0,
          remaining: quota.yearly
        };
  
        let cumulativeRemaining = 0;
  
        // Calculate for each month from joining month to current month
        for (let month = 1; month <= currentMonth; month++) {
          let monthlyQuota = quota.monthly;
  
          // Skip months before joining month
          if (currentYear === joiningYear && month < joiningMonth) {
            monthlyLeaveBalance[type][month] = {
              monthly_quota: 0,
              used: 0,
              available: 0,
              remaining: 0,
              rollover: 0,
              note: 'Before joining date'
            };
            continue;
          }
  
          // For joining month, check if joining date has passed
          if (currentYear === joiningYear && month === joiningMonth) {
            const joiningDay = joiningDate.date();
            const currentDay = currentDate.date();
  
            if (currentDay < joiningDay) {
              monthlyLeaveBalance[type][month] = {
                monthly_quota: 0,
                used: 0,
                available: 0,
                remaining: 0,
                rollover: 0,
                note: 'Joining date not yet reached'
              };
              continue;
            }
  
            // Prorate quota for joining month based on remaining days
            const daysInMonth = joiningDate.daysInMonth();
            const remainingDays = daysInMonth - joiningDay + 1;
            const prorateFactor = remainingDays / daysInMonth;
            const adjustedMonthlyQuota = Math.floor(monthlyQuota * prorateFactor * 10) / 10; // Round to 1 decimal
  
            monthlyQuota = adjustedMonthlyQuota;
          }
  
          const usedThisMonth = approvedLeaves
            .filter(l => l.leave_type === type && l.month === month)
            .reduce((sum, l) => sum + l.used_days, 0);
  
          // Calculate available including rollover from previous eligible months
          const availableThisMonth = monthlyQuota + cumulativeRemaining;
          const usedFromAvailable = Math.min(usedThisMonth, availableThisMonth);
          const remainingThisMonth = availableThisMonth - usedFromAvailable;
  
          // Track rollover (max 2x monthly quota)
          cumulativeRemaining = Math.min(remainingThisMonth, monthlyQuota * 2);
  
          monthlyLeaveBalance[type][month] = {
            monthly_quota: monthlyQuota,
            used: usedThisMonth,
            available: availableThisMonth,
            remaining: remainingThisMonth,
            rollover: cumulativeRemaining,
            ...(month === joiningMonth && currentYear === joiningYear ? { note: 'Prorated for joining month' } : {})
          };
  
          // Update yearly totals
          yearlyLeaveBalance[type].used += usedThisMonth;
          yearlyLeaveBalance[type].remaining -= usedThisMonth;
        }
  
        // Add current month's data
        if (currentMonth in monthlyLeaveBalance[type]) {
          monthlyLeaveBalance[type].current = {
            month: currentMonth,
            ...monthlyLeaveBalance[type][currentMonth]
          };
        } else {
          monthlyLeaveBalance[type].current = {
            month: currentMonth,
            monthly_quota: 0,
            used: 0,
            available: 0,
            remaining: 0,
            rollover: 0,
            note: 'Before joining date'
          };
        }
      }
  
      // Get pending leaves
      const [pendingLeaves] = await pool.query(`
        SELECT id, leave_type, start_date, end_date, days, status, requested_at
        FROM leave_records
        WHERE employee_id = ? AND status = 'pending'
        ORDER BY requested_at DESC
      `, [employeeId]);
  
      // Get leave history
      const [leaveHistory] = await pool.query(`
        SELECT lr.*, e.name as approver_name
        FROM leave_records lr
        LEFT JOIN employees e ON lr.approved_by = e.id
        WHERE lr.employee_id = ? AND lr.status != 'pending'
        ORDER BY lr.requested_at DESC
        LIMIT 10
      `, [employeeId]);
  
      // FIX: Format dates properly before sending response
      const formatDate = (date) => {
        if (!date) return null;
        return moment(date).format('YYYY-MM-DD'); // Returns date in YYYY-MM-DD format without time
      };
  
      // Format dates in employee data
      const formattedEmployee = {
        ...employee[0],
        joining_date: formatDate(employee[0].joining_date)
      };
  
      // Format dates in leave history
      const formattedLeaveHistory = leaveHistory.map(record => ({
        ...record,
        start_date: formatDate(record.start_date),
        end_date: formatDate(record.end_date),
        requested_at: record.requested_at,
        approved_at: record.approved_at,
        updated_at: record.updated_at,
        rejected_at: record.rejected_at
      }));
  
      // Format dates in pending leaves
      const formattedPendingLeaves = pendingLeaves.map(record => ({
        ...record,
        start_date: formatDate(record.start_date),
        end_date: formatDate(record.end_date),
        requested_at: record.requested_at
      }));
  
      res.status(200).json({
        employee: formattedEmployee,
        yearly_balance: yearlyLeaveBalance,
        monthly_balance: monthlyLeaveBalance,
        pending_leaves: formattedPendingLeaves,
        leave_history: formattedLeaveHistory,
        current_month: currentMonth,
        current_year: currentYear,
        joining_date: formatDate(employee[0].joining_date)
      });
  
    } catch (err) {
      console.error('Error fetching leave info:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },



createLeaveRequest: async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { leave_type, start_date, end_date, reason, managerId } = req.body; // Added managerId from payload
      
      // Validate dates using moment
      const start = moment(start_date);
      const end = moment(end_date);
      if (!start.isValid() || !end.isValid()) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      if (start.isAfter(end)) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
  
      // Check if leave within same month (business rule)
      if (!start.isSame(end, 'month')) {
        return res.status(400).json({ error: 'Leave must be within the same month' });
      }
  
      // Fetch employee joining date
      const [employeeData] = await pool.query(
        'SELECT joining_date, reporting_manager_id FROM employees WHERE id = ?',
        [employeeId]
      );
  
      if (!employeeData.length) {
        return res.status(404).json({ error: 'Employee not found' });
      }
  
      const joiningDate = moment(employeeData[0].joining_date);
      const joinMonthEnd = joiningDate.clone().endOf('month');
  
      // if (start.isSameOrBefore(joinMonthEnd)) {
      //   return res.status(400).json({
      //     error: `Leave requests are allowed only from next month after joining. Your joining month ends on ${joinMonthEnd.format('YYYY-MM-DD')}`
      //   });
      // }
  
      const leaveMonth = start.month() + 1;
      const leaveYear = start.year();
  
      // Calculate business days (Mon-Fri)
      let days = 0;
      let current = start.clone();
      while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() < 6) days++;
        current.add(1, 'day');
      }
      if (days <= 0) {
        return res.status(400).json({ error: 'No working days in selected period' });
      }
  
      // Get leave quotas from settings
      const [settings] = await pool.query('SELECT leave_quotas FROM leave_settings LIMIT 1');
      const leaveQuotas = settings.length
        ? (typeof settings[0].leave_quotas === 'string'
            ? JSON.parse(settings[0].leave_quotas)
            : settings[0].leave_quotas)
        : {};
  
      if (!leaveQuotas[leave_type]) {
        return res.status(400).json({ error: 'Invalid leave type' });
      }
      const monthlyQuota = leaveQuotas[leave_type].monthly;
  
      // Get monthly usage
      const [monthlyUsage] = await pool.query(`
        SELECT COALESCE(SUM(days), 0) as used_days
        FROM leave_records
        WHERE employee_id = ? 
          AND leave_type = ? 
          AND status = 'approved'
          AND MONTH(start_date) = ?
          AND YEAR(start_date) = ?
      `, [employeeId, leave_type, leaveMonth, leaveYear]);
  
      // Get approved leaves in previous months
      const [allUsage] = await pool.query(`
        SELECT MONTH(start_date) as month, SUM(days) as used_days
        FROM leave_records
        WHERE employee_id = ? 
          AND leave_type = ? 
          AND status = 'approved'
          AND YEAR(start_date) = ?
          AND MONTH(start_date) < ?
        GROUP BY MONTH(start_date)
        ORDER BY MONTH(start_date)
      `, [employeeId, leave_type, leaveYear, leaveMonth]);
  
      // Calculate rollover
      let cumulativeRollover = 0;
      for (let m = 1; m < leaveMonth; m++) {
        const used = allUsage.find(u => u.month === m)?.used_days || 0;
        const available = monthlyQuota + cumulativeRollover;
        const usedFromAvailable = Math.min(used, available);
        const remaining = available - usedFromAvailable;
        cumulativeRollover = Math.min(remaining, monthlyQuota * 2);
      }
  
      // Calculate available leaves
      const availableThisMonth = monthlyQuota + cumulativeRollover;
      const remainingThisMonth = availableThisMonth - monthlyUsage[0].used_days;
  
      if (days > remainingThisMonth) {
        return res.status(400).json({ 
          error: 'Insufficient monthly leave balance',
          monthly_quota: monthlyQuota,
          rollover: cumulativeRollover,
          used_this_month: monthlyUsage[0].used_days,
          available_this_month: availableThisMonth,
          requested: days
        });
      }
  
      // Use managerId from payload if provided, otherwise from employee record
      const reporting_manager_id = managerId || employeeData[0].reporting_manager_id;
      
      if (!reporting_manager_id) {
        return res.status(400).json({ error: 'No reporting manager assigned' });
      }
  
      // Create leave request
      const leaveId = uuidv4();
      await pool.query(`
        INSERT INTO leave_records (
          id, employee_id, leave_type, 
          start_date, end_date, days, 
          reason, status, requested_at,
          reporting_manager_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        leaveId,
        employeeId,
        leave_type,
        start.format('YYYY-MM-DD'),
        end.format('YYYY-MM-DD'),
        days,
        reason,
        'pending',
        new Date(),
        reporting_manager_id
      ]);
  
      return res.status(201).json({ 
        success: true,
        leave_id: leaveId,
        message: 'Leave request submitted successfully',
        monthly_balance: {
          monthly_quota: monthlyQuota,
          rollover: cumulativeRollover,
          used: monthlyUsage[0].used_days + days,
          remaining: remainingThisMonth - days
        }
      });
  
    } catch (err) {
      console.error('Error creating leave request:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  },



createCorporateEvent: async (req, res) => {
  try {
    const { employeeId } = req.params; // organizer_id
    const {
      title,
      description,
      start_date,
      end_date,
      lead_id,      // kept for reference, but not stored (optional)
      managerId     // optional, from payload
    } = req.body;

    // Validate dates
    const start = moment(start_date);
    const end = moment(end_date);
    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (start.isAfter(end)) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    if (!start.isSame(end, 'month')) {
      return res.status(400).json({ error: 'Event must be within the same month' });
    }

    // 1. Fetch employee details to get reporting_manager_id
    const [employeeData] = await pool.query(
      'SELECT reporting_manager_id FROM employees WHERE id = ?',
      [employeeId]
    );
    if (!employeeData.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // 2. Determine reporting manager (use provided managerId or fallback to employee's)
    const reporting_manager_id = managerId || employeeData[0].reporting_manager_id;
    if (!reporting_manager_id) {
      return res.status(400).json({ error: 'No reporting manager assigned for this employee' });
    }

    // 3. Insert into calendar_events (now including reporting_manager_id and status)
    const [result] = await pool.execute(
      `INSERT INTO calendar_events (
        title,
        description,
        start_date,
        end_date,
        start_time,
        end_time,
        event_type,
        is_recurring,
        recurrence_pattern,
        is_meeting,
        google_meet_link,
        attendees,
        timezone,
        organizer_id,
        reporting_manager_id,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description,
        start.format('YYYY-MM-DD'),
        end.format('YYYY-MM-DD'),
        null,                          // start_time not used
        null,                          // end_time not used
        'corporate_event',
        0,                             // is_recurring
        null,                          // recurrence_pattern
        0,                             // is_meeting = false
        null,                          // google_meet_link
        JSON.stringify([]),            // attendees – empty
        'Asia/Kolkata',                // timezone
        employeeId,                    // organizer_id
        reporting_manager_id,          // store the manager
        'pending'                      // status – pending approval
      ]
    );

    // 4. (Optional) Notify the manager – insert into notifications or send email
    // Example: insert a notification record
   // 4. (Optional) Notify the manager
await pool.query(
  `INSERT INTO notifications (id, employee_id, title, message, type, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [
    uuidv4(),                          // id (VARCHAR(36) PK)
    reporting_manager_id,              // employee_id (the manager receiving the notification)
    'Corporate Event Approval Required', // title
    `New corporate event "${title}" requires your approval.`, // message
    'corporate_event_request',         // type
    new Date()                         // created_at
  ]
);
    // 5. Retrieve the inserted event
    const [event] = await pool.execute(
      'SELECT * FROM calendar_events WHERE event_id = ?',
      [result.insertId]
    );

    const formattedEvent = {
      ...event[0],
      attendees: event[0]?.attendees ? JSON.parse(event[0].attendees) : []
    };

    res.status(201).json({
      success: true,
      data: formattedEvent,
      message: 'Corporate event created and sent to manager for approval'
    });

  } catch (err) {
    console.error('Error creating corporate event:', err);
    res.status(500).json({ error: 'Server error' });
  }
},
  

// Get pending corporate events for a specific manager
getPendingCorporateEvents: async (req, res) => {
  try {
    const { managerId } = req.params;

    const [events] = await pool.query(`
      SELECT 
        ce.event_id,
        ce.title,
        ce.description,
        ce.start_date,
        ce.end_date,
        ce.created_at,
        e.id as employee_id,
        e.name as employee_name,
        e.email as employee_email,
        e.photo as employee_photo,
        ce.reporting_manager_id,
        ce.status
      FROM calendar_events ce
      JOIN employees e ON ce.organizer_id = e.id
      WHERE ce.reporting_manager_id = ? 
        AND ce.status = 'pending'
      ORDER BY ce.created_at ASC
    `, [managerId]);

    res.json({
      success: true,
      events
    });
  } catch (err) {
    console.error('Error fetching pending corporate events:', err);
    res.status(500).json({ error: 'Server error' });
  }
},

getCorporateNotifications: async (req, res) => {
  try {
    // Get employee_id from JWT token (assumes you have middleware that sets req.user)
    const employee_id = req.user?.id || req.query.userId;

    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Fetch corporate event notifications for this employee
    // Optionally filter by type if you have other notification types in the same table
    const [notifications] = await pool.query(
      `SELECT id, employee_id, title, message, type, created_at
       FROM notifications
       WHERE employee_id = ?
         AND type = 'corporate_event_request'
       ORDER BY created_at DESC`,
      [employee_id]
    );

    res.json({
      success: true,
      notifications
    });
  } catch (err) {
    console.error('Error fetching corporate notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
},


// ================== APPROVE CORPORATE EVENT ==================
approveCorporateEvent: async (req, res) => {
  try {
    const { eventId } = req.params;
    const { managerId, comments } = req.body;

    // 1. Verify manager exists
    const [manager] = await pool.query(
      'SELECT id, level FROM employees WHERE id = ? AND deleted_at IS NULL',
      [managerId]
    );
    if (!manager.length) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // 2. Fetch event with employee details (to get employee_id for notification)
    const [event] = await pool.query(`
      SELECT ce.*, e.name as employee_name, e.reporting_manager_id
      FROM calendar_events ce
      JOIN employees e ON ce.organizer_id = e.id
      WHERE ce.event_id = ? AND ce.status = 'pending'
    `, [eventId]);

    if (!event.length) {
      return res.status(404).json({ error: 'Event not found or already processed' });
    }

    const eventData = event[0];
    const currentDate = new Date();

    // 3. Authorization check
    const isAuthorized = eventData.reporting_manager_id === managerId || manager[0].level === 'admin';
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to approve this event' });
    }

    // 4. Prevent approval if event has already started (optional)
    if (new Date(eventData.start_date) < currentDate) {
      return res.status(400).json({ error: 'Cannot approve an event that has already started' });
    }

    // 5. (Optional) Check for overlapping events – skip if not needed

    // 6. Start transaction
    await pool.query('START TRANSACTION');

    try {
      // 6a. Update event status to approved
      await pool.query(`
        UPDATE calendar_events SET
          status = 'approved',
          approved_by = ?,
          approved_at = ?,
          manager_comments = ?,
          updated_at = ?
        WHERE event_id = ?
      `, [managerId, currentDate, comments || null, currentDate, eventId]);

      // 6b. Notify the organizer (employee)
      await pool.query(`
        INSERT INTO notifications (
          id, employee_id, title, message, type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        uuidv4(),
        eventData.organizer_id,
        'Corporate Event Approved',
        `Your corporate event "${eventData.title}" from ${eventData.start_date} to ${eventData.end_date} has been approved.`,
        'corporate_approval',
        currentDate
      ]);

      await pool.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Corporate event approved successfully',
        event_id: eventId,
        approved_at: currentDate,
        approved_by: managerId
      });

    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

  } catch (err) {
    console.error('Error approving corporate event:', err);
    return res.status(500).json({
      error: 'Failed to approve corporate event',
      details: err.message
    });
  }
},

// ================== REJECT CORPORATE EVENT ==================
rejectCorporateEvent: async (req, res) => {
  try {
    const { eventId } = req.params;
    const { managerId, comments } = req.body;

    // 1. Verify manager exists
    const [manager] = await pool.query(
      'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL',
      [managerId]
    );
    if (!manager.length) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    // 2. Fetch event details
    const [event] = await pool.query(`
      SELECT ce.*, e.reporting_manager_id
      FROM calendar_events ce
      JOIN employees e ON ce.organizer_id = e.id
      WHERE ce.event_id = ? AND ce.status = 'pending'
    `, [eventId]);

    if (!event.length) {
      return res.status(404).json({ error: 'Event not found or already processed' });
    }

    const eventData = event[0];

    // 3. Authorization: only the reporting manager can reject
    if (eventData.reporting_manager_id !== managerId) {
      return res.status(403).json({ error: 'Not authorized to reject this event' });
    }

    // 4. Update event status to rejected
    await pool.query(`
      UPDATE calendar_events SET
        status = 'rejected',
        rejected_by = ?,
        rejected_at = ?,
        manager_comments = ?,
        updated_at = ?
      WHERE event_id = ?
    `, [
      managerId,
      new Date(),
      comments || null,
      new Date(),
      eventId
    ]);

    // 5. Notify the organizer (optional)
    await pool.query(`
      INSERT INTO notifications (
        id, employee_id, title, message, type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      eventData.organizer_id,
      'Corporate Event Rejected',
      `Your corporate event "${eventData.title}" from ${eventData.start_date} to ${eventData.end_date} has been rejected.`,
      'corporate_rejection',
      new Date()
    ]);

    res.status(200).json({
      success: true,
      message: 'Corporate event rejected successfully'
    });

  } catch (err) {
    console.error('Error rejecting corporate event:', err);
    res.status(500).json({ error: 'Server error' });
  }
},


approveLeaveRequest: async (req, res) => {
      try {
        const { leaveId } = req.params;
        const { managerId, comments } = req.body;
    
       
        const [manager] = await pool.query(
          `SELECT id, level FROM employees WHERE id = ? AND deleted_at IS NULL`,
          [managerId]
        );
    
        if (!manager.length) {
          return res.status(404).json({ error: 'Manager not found' });
        }
    
        const [leave] = await pool.query(`
          SELECT lr.*, e.name as employee_name, e.joining_date, 
                e.reporting_manager_id, e.team_name
          FROM leave_records lr
          JOIN employees e ON lr.employee_id = e.id
          WHERE lr.id = ? AND lr.status = 'pending'
        `, [leaveId]);
    
        
        if (!leave.length) {
          return res.status(404).json({ error: 'Leave request not found or already processed' });
        }
        
        const leaveRequest = leave[0];
        const currentDate = new Date();
        
        const isAuthorized = leaveRequest.reporting_manager_id === managerId || manager[0].level === 'admin';
        if (!isAuthorized) {
          return res.status(403).json({ error: 'Not authorized to approve this leave' });
        }
    
        if (new Date(leaveRequest.start_date) < currentDate) {
          return res.status(400).json({ error: 'Cannot approve leave that has already started' });
        }
    
        const joiningDate = new Date(leaveRequest.joining_date);
        if (joiningDate > new Date(leaveRequest.start_date)) {
          return res.status(400).json({ error: 'Employee was not employed during requested leave period' });
        }
    
        const [overlappingLeaves] = await pool.query(`
          SELECT id FROM leave_records 
          WHERE employee_id = ? 
            AND status = 'approved'
            AND ((start_date BETWEEN ? AND ?) 
                OR (end_date BETWEEN ? AND ?)
                OR (start_date <= ? AND end_date >= ?))
            AND id != ?
        `, [
          leaveRequest.employee_id,
          leaveRequest.start_date,
          leaveRequest.end_date,
          leaveRequest.start_date,
          leaveRequest.end_date,
          leaveRequest.start_date,
          leaveRequest.end_date,
          leaveId
        ]);
    
        if (overlappingLeaves.length > 0) {
          return res.status(400).json({ error: 'Overlapping with existing approved leave' });
        }
    
        await pool.query('START TRANSACTION');
    
        try {
          // Step 1: Approve the leave
          await pool.query(`
            UPDATE leave_records SET
              status = 'approved',
              approved_by = ?,
              approved_at = ?,
              manager_comments = ?,
              updated_at = ?
            WHERE id = ?
          `, [managerId, currentDate, comments, currentDate, leaveId]);
    
          // Step 2: Deduct from global leave settings (basic logic)
          const [settings] = await pool.query('SELECT leave_quotas FROM leave_settings LIMIT 1');
          const leaveQuotas = settings.length > 0
            ? typeof settings[0].leave_quotas === 'string'
              ? JSON.parse(settings[0].leave_quotas)
              : settings[0].leave_quotas
            : {};
    
          const leaveType = leaveRequest.leave_type;
          const daysUsed = leaveRequest.days;
    
          if (leaveQuotas[leaveType]) {
            leaveQuotas[leaveType].yearly = Math.max(0, leaveQuotas[leaveType].yearly - daysUsed);
            // Optionally: leaveQuotas[leaveType].monthly -= ...
          }
    
          await pool.query(`
            UPDATE leave_settings SET leave_quotas = ?
          `, [JSON.stringify(leaveQuotas)]);
    
          // Step 3: Create notification for employee
          await pool.query(`
            INSERT INTO notifications (
              id, employee_id, title, message, type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `, [
            uuidv4(),
            leaveRequest.employee_id,
            'Leave Approved',
            `Your ${leaveType} leave from ${leaveRequest.start_date} to ${leaveRequest.end_date} has been approved.`,
            'leave_approval',
            currentDate
          ]);
    
          await pool.query('COMMIT');
    
          return res.status(200).json({
            success: true,
            message: 'Leave approved and deducted successfully',
            leave_id: leaveId,
            approved_at: currentDate,
            approved_by: managerId
          });
    
        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }
    
      } catch (err) {
        console.error('Error approving leave:', err);
        return res.status(500).json({
          error: 'Failed to approve leave',
          details: err.message
        });
      }
},
  // 4. Get all leaves for an employee (history)
  getEmployeeLeaves: async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { status, year } = req.query;

      // Build query
      let query = `
        SELECT lr.*, e.name as approver_name 
        FROM leave_records lr
        LEFT JOIN employees e ON lr.approved_by = e.id
        WHERE lr.employee_id = ?
      `;
      const params = [employeeId];

      if (status) {
        query += ' AND lr.status = ?';
        params.push(status);
      }

      if (year) {
        query += ' AND YEAR(lr.start_date) = ?';
        params.push(year);
      }

      query += ' ORDER BY lr.requested_at DESC';

      const [leaves] = await pool.query(query, params);

      res.status(200).json(leaves);

    } catch (err) {
      console.error('Error fetching employee leaves:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // 5. Get all leaves (admin view)
getAllLeaves: async (req, res) => {
    try {
      const { status, department, startDate, endDate, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          lr.id, lr.leave_type, lr.start_date, lr.end_date, 
          lr.days, lr.status, lr.requested_at, lr.reason,
          lr.manager_comments,
          e.id as employee_id, e.name as employee_name,
          e.designation, e.team_name, e.photo as employee_photo,
          m.id as manager_id, m.name as manager_name,
          m.photo as manager_photo
        FROM leave_records lr
        JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN employees m ON lr.reporting_manager_id = m.id
        WHERE e.deleted_at IS NULL
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total
        FROM leave_records lr
        JOIN employees e ON lr.employee_id = e.id
        WHERE e.deleted_at IS NULL
      `;
      
      const params = [];
      const countParams = [];

      // Apply filters to both queries
      if (status) {
        query += ' AND lr.status = ?';
        countQuery += ' AND lr.status = ?';
        params.push(status);
        countParams.push(status);
      }

      if (department) {
        query += ' AND e.team_name = ?';
        countQuery += ' AND e.team_name = ?';
        params.push(department);
        countParams.push(department);
      }

      if (startDate && endDate) {
        query += ' AND lr.start_date BETWEEN ? AND ?';
        countQuery += ' AND lr.start_date BETWEEN ? AND ?';
        params.push(startDate, endDate);
        countParams.push(startDate, endDate);
      }

      // Add sorting and pagination
      query += ' ORDER BY lr.requested_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      // Execute both queries in parallel
      const [leaves, [totalCount]] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams)
      ]);

      // Format profile photo URLs and handle null manager cases
      const formattedLeaves = leaves[0].map(leave => {
        const formattedLeave = {
          ...leave,
          employee_photo: leave.employee_photo 
            ? `http://agencytravelform.s3-website.eu-north-1.amazonaws.com/uploads/${leave.employee_photo}`
            : null,
          manager_name: leave.manager_name || 'Not Assigned',
          manager_photo: leave.manager_photo 
            ? `http://agencytravelform.s3-website.eu-north-1.amazonaws.com/uploads/${leave.manager_photo}`
            : null,
          manager_id: leave.manager_id || null,
          manager_comments: leave.manager_comments || null
        };

        // Clean up undefined/null fields
        Object.keys(formattedLeave).forEach(key => {
          if (formattedLeave[key] === undefined) {
            formattedLeave[key] = null;
          }
        });

        return formattedLeave;
      });

      res.status(200).json({
        data: formattedLeaves,
        pagination: {
          total: totalCount.total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount.total / limit)
        }
      });

    } catch (err) {
      console.error('Error fetching all leaves:', err);
      res.status(500).json({ 
        error: 'Server error',
        details: err.message 
      });
    }
  },

  // 6. Reject leave request (manager action)
  rejectLeaveRequest: async (req, res) => {
    try {
      const { leaveId } = req.params;
      const { managerId, comments } = req.body;

      // Verify manager exists
      const [manager] = await pool.query(
        'SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL', 
        [managerId]
      );
      
      if (!manager.length) {
        return res.status(404).json({ error: 'Manager not found' });
      }

      // Get leave request
      const [leave] = await pool.query(`
        SELECT * FROM leave_records 
        WHERE id = ? AND status = 'pending'
      `, [leaveId]);

      if (!leave.length) {
        return res.status(404).json({ error: 'Leave request not found or already processed' });
      }

      // Verify manager is the reporting manager
      if (leave[0].reporting_manager_id !== managerId) {
        return res.status(403).json({ error: 'Not authorized to reject this leave' });
      }

      // Reject leave
      await pool.query(`
        UPDATE leave_records SET
          status = 'rejected',
          rejected_by = ?,
          rejected_at = ?,
          manager_comments = ?
        WHERE id = ?
      `, [
        managerId,
        new Date(),
        comments,
        leaveId
      ]);

      res.status(200).json({ 
        success: true,
        message: 'Leave rejected successfully'
      });

    } catch (err) {
      console.error('Error rejecting leave:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // 7. Get manager notifications (pending leaves)



 getManagerNotifications :async (req, res) => {
  try {
    const { managerId } = req.params;

    // 1. Fetch up to 10 latest pending leave requests for this manager
    const [pendingLeaves] = await pool.query(`
      SELECT 
        lr.id,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        lr.days,
        lr.reason,
        lr.requested_at,
        e.id AS employee_id,
        e.name AS employee_name,
        e.photo AS photo,
        e.designation,
        e.team_name,
        lr.reporting_manager_id AS manager_id
      FROM leave_records lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.reporting_manager_id = ? 
        AND lr.status = 'pending'
      ORDER BY lr.requested_at DESC
      LIMIT 10
    `, [managerId]);

    // 2. Construct full URL for employee photo
    const pendingLeavesWithFullPhoto = pendingLeaves.map(emp => ({
      ...emp,
      photo: emp.photo
        ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(emp.photo)}`
        : null
    }));

    // 3. Get total pending leave count
    const [count] = await pool.query(`
      SELECT COUNT(*) AS total 
      FROM leave_records 
      WHERE reporting_manager_id = ? AND status = 'pending'
    `, [managerId]);

    // 4. Send the response
    res.status(200).json({
      pending_leaves: pendingLeavesWithFullPhoto,
      total_pending: count[0].total
    });

  } catch (err) {
    console.error('Error fetching manager notifications:', err);
    res.status(500).json({ error: 'Server error' });
  }
},


  
};