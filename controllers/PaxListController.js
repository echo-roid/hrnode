  const pool = require('../config/db');

exports.getPaxByLead = async (req, res) => {
    try {
      const { leadId } = req.params;
      const { 
        page = 1, 
        limit = 10, 
        status, 
        search,
        group_n, // Add group_n filter
        sortBy = 'pax_code',
        sortOrder = 'ASC'
      } = req.query;

      if (!leadId) {
        return res.status(400).json({
          success: false,
          message: 'Lead ID is required'
        });
      }

      let query = `
        SELECT 
          id,
          lead_id,
          group_n,  -- Add group_n to SELECT
          pax_code,
          pax_status,
          guest_data,
          form_data,
          journey_id,
          attached_pnr,
          created_at,
          updated_at
        FROM pax_lists 
        WHERE lead_id = ?
      `;
      let queryParams = [leadId];

      // Apply status filter
      if (status) {
        query += ` AND pax_status = ?`;
        queryParams.push(status);
      }

      // Apply group_n filter
      if (group_n !== undefined && group_n !== '') {
        query += ` AND group_n = ?`;
        queryParams.push(parseInt(group_n));
      }

      // Apply search filter - Enhanced to search in attached_pnr as well
      if (search) {
        query += ` AND (
          pax_code LIKE ? OR
          journey_id LIKE ? OR
          guest_data LIKE ? OR
          form_data LIKE ? OR
          attached_pnr LIKE ?
        )`;
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      // Add sorting - Add group_n to valid sort columns
      const validSortColumns = ['pax_code', 'pax_status', 'journey_id', 'group_n', 'created_at', 'updated_at'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'pax_code';
      const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      
      query += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;

      // Add pagination
      const offset = (page - 1) * limit;
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(parseInt(limit), offset);

      // Execute query
      const [passengers] = await pool.query(query, queryParams);

      // Process attached_pnr field to ensure it's always a valid array
      const processedPassengers = passengers.map(passenger => {
        let attachedPnrs = [];
        
        try {
          if (passenger.attached_pnr) {
            if (typeof passenger.attached_pnr === 'string') {
              const parsed = JSON.parse(passenger.attached_pnr);
              attachedPnrs = Array.isArray(parsed) ? parsed : [parsed];
            } else if (Array.isArray(passenger.attached_pnr)) {
              attachedPnrs = passenger.attached_pnr;
            } else {
              attachedPnrs = [passenger.attached_pnr];
            }
          }
        } catch (error) {
          console.warn(`Error parsing attached_pnr for passenger ${passenger.id}:`, error);
          // If parsing fails, try to extract PNRs from the string
          if (typeof passenger.attached_pnr === 'string') {
            attachedPnrs = [passenger.attached_pnr];
          }
        }

        // Remove any empty or null values and ensure all are strings
        attachedPnrs = attachedPnrs
          .map(pnr => pnr ? pnr.toString().trim() : null)
          .filter(Boolean);

        return {
          ...passenger,
          attached_pnr: attachedPnrs
        };
      });

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM pax_lists WHERE lead_id = ?`;
      let countParams = [leadId];

      if (status) {
        countQuery += ` AND pax_status = ?`;
        countParams.push(status);
      }

      if (group_n !== undefined && group_n !== '') {
        countQuery += ` AND group_n = ?`;
        countParams.push(parseInt(group_n));
      }

      if (search) {
        countQuery += ` AND (
          pax_code LIKE ? OR
          journey_id LIKE ? OR
          guest_data LIKE ? OR
          form_data LIKE ? OR
          attached_pnr LIKE ?
        )`;
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0].total;

      // Get group statistics for this lead
      const [groupStats] = await pool.query(
        `SELECT 
          group_n,
          COUNT(*) as passenger_count,
          SUM(CASE WHEN pax_status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed_count,
          SUM(CASE WHEN pax_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN pax_status = 'Boarded' THEN 1 ELSE 0 END) as boarded_count,
          SUM(CASE WHEN pax_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count,
          SUM(CASE WHEN journey_id IS NOT NULL THEN 1 ELSE 0 END) as with_journey,
          SUM(CASE WHEN attached_pnr IS NOT NULL AND JSON_LENGTH(attached_pnr) > 0 THEN 1 ELSE 0 END) as with_pnr,
          MIN(created_at) as first_created,
          MAX(updated_at) as last_updated
         FROM pax_lists 
         WHERE lead_id = ?
         GROUP BY group_n
         ORDER BY group_n`,
        [leadId]
      );

      // Format group stats
      const formattedGroupStats = groupStats.map(stat => ({
        group_n: stat.group_n,
        name: `Group ${stat.group_n}`,
        passenger_count: stat.passenger_count,
        confirmed: stat.confirmed_count,
        pending: stat.pending_count,
        boarded: stat.boarded_count,
        cancelled: stat.cancelled_count,
        with_journey: stat.with_journey,
        with_pnr: stat.with_pnr,
        first_created: stat.first_created,
        last_updated: stat.last_updated
      }));

      res.status(200).json({
        success: true,
        passengers: processedPassengers,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
        filters: {
          status: status || 'all',
          search: search || '',
          group_n: group_n || 'all',
          sortBy: safeSortBy,
          sortOrder: safeSortOrder
        },
        group_statistics: formattedGroupStats
      });

    } catch (error) {
      console.error('Error fetching passengers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch passengers',
        error: error.message
      });
    }
  };
  // Create a new passenger
// Create a new passenger
exports.createPax = async (req, res) => {
  try {
    const { 
      lead_id, 
      pax_code, 
      guest_data = {}, 
      form_data = {}, 
      pax_status = 'Pending', 
      journey_id = null, 
      attached_pnr = null 
    } = req.body;

    if (!lead_id || !pax_code) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and Pax Code are required'
      });
    }

    // Check if pax code already exists for this lead
    const [existingPax] = await pool.query(
      'SELECT id FROM pax_lists WHERE lead_id = ? AND pax_code = ?',
      [lead_id, pax_code]
    );

    if (existingPax.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Passenger with this code already exists for this lead'
      });
    }

    // Validate attached_pnr format
    let validatedPnrs = null;
    if (attached_pnr) {
      if (Array.isArray(attached_pnr)) {
        // Remove duplicates and validate each PNR is a string
        validatedPnrs = [...new Set(attached_pnr.filter(pnr => typeof pnr === 'string' && pnr.trim() !== ''))];
      } else if (typeof attached_pnr === 'string') {
        validatedPnrs = [attached_pnr];
      } else {
        return res.status(400).json({
          success: false,
          message: 'attached_pnr must be a string or array of strings'
        });
      }
    }

    const query = `
      INSERT INTO pax_lists (lead_id, pax_code, guest_data, form_data, pax_status, journey_id, attached_pnr)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await pool.query(query, [
      lead_id,
      pax_code,
      JSON.stringify(guest_data),
      JSON.stringify(form_data),
      pax_status,
      journey_id,
      validatedPnrs ? JSON.stringify(validatedPnrs) : null
    ]);

    // Get the created passenger
    const [newPax] = await pool.query('SELECT * FROM pax_lists WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Passenger created successfully',
      passenger: newPax[0]
    });

  } catch (error) {
    console.error('Error creating passenger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create passenger',
      error: error.message
    });
  }
};

  // Create multiple passengers at once
// Create multiple passengers at once
exports.createMultiplePax = async (req, res) => {
  try {
    const { lead_id, passengers } = req.body;
    console.log('Received passengers data:', passengers);

    if (!lead_id || !passengers || !Array.isArray(passengers)) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and passengers array are required'
      });
    }

    // Validate each passenger
    for (let passenger of passengers) {
      if (!passenger.pax_code) {
        return res.status(400).json({
          success: false,
          message: 'Each passenger must have a pax_code'
        });
      }
    }

    // Check for duplicate pax codes in the request
    const paxCodes = passengers.map(p => p.pax_code);
    const uniquePaxCodes = [...new Set(paxCodes)];
    if (paxCodes.length !== uniquePaxCodes.length) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate passenger codes found in request'
      });
    }

    // Check for existing pax codes in database
    const placeholders = paxCodes.map(() => '?').join(',');
    const [existingPax] = await pool.query(
      `SELECT pax_code FROM pax_lists WHERE lead_id = ? AND pax_code IN (${placeholders})`,
      [lead_id, ...paxCodes]
    );

    if (existingPax.length > 0) {
      const existingCodes = existingPax.map(p => p.pax_code);
      return res.status(400).json({
        success: false,
        message: `Passenger codes already exist: ${existingCodes.join(', ')}`
      });
    }

    // Create all passengers with proper journey_id and attached_pnr handling
    const values = passengers.map(passenger => {
      console.log('Processing passenger:', passenger.pax_code, 'with journey_id:', passenger.journey_id, 'attached_pnr:', passenger.attached_pnr);
      
      // Validate and format attached_pnr
      let validatedPnrs = null;
      if (passenger.attached_pnr) {
        if (Array.isArray(passenger.attached_pnr)) {
          // Remove duplicates and validate each PNR is a string
          validatedPnrs = [...new Set(passenger.attached_pnr.filter(pnr => typeof pnr === 'string' && pnr.trim() !== ''))];
        } else if (typeof passenger.attached_pnr === 'string') {
          validatedPnrs = [passenger.attached_pnr];
        }
        // If invalid format, validatedPnrs remains null
      }
      
      return [
        lead_id,
        passenger.pax_code,
        JSON.stringify(passenger.guest_data || {}),
        JSON.stringify(passenger.form_data || {}),
        passenger.pax_status || 'Pending',
        passenger.journey_id || null,
        validatedPnrs ? JSON.stringify(validatedPnrs) : null
      ];
    });

    console.log('Final values for database insertion:', values);

    const query = `
      INSERT INTO pax_lists (lead_id, pax_code, guest_data, form_data, pax_status, journey_id, attached_pnr)
      VALUES ?
    `;
    
    const [result] = await pool.query(query, [values]);

    // Get the created passengers
    const [createdPassengers] = await pool.query(
      'SELECT * FROM pax_lists WHERE lead_id = ? ORDER BY id DESC LIMIT ?',
      [lead_id, passengers.length]
    );

    console.log('Created passengers with journey_ids and PNRs:', createdPassengers.map(p => ({
      pax_code: p.pax_code,
      journey_id: p.journey_id,
      attached_pnr: p.attached_pnr
    })));

    res.status(201).json({
      success: true,
      message: `${result.affectedRows} passengers created successfully`,
      passengers: createdPassengers
    });

  } catch (error) {
    console.error('Error creating multiple passengers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create passengers',
      error: error.message
    });
  }
};
  // Update a passenger
  exports.updatePax = async (req, res) => {
    try {
      const { paxId, leadId } = req.params;
      const { guest_data, form_data, pax_status, pax_code, journey_id } = req.body;
      
      if (!paxId || !leadId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID and Lead ID are required'
        });
      }

      // Check if passenger exists
      const [existingPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      if (existingPax.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found'
        });
      }

      const passenger = existingPax[0];

      // Check if new pax_code already exists (if being updated)
      if (pax_code && pax_code !== passenger.pax_code) {
        const [duplicatePax] = await pool.query(
          'SELECT id FROM pax_lists WHERE lead_id = ? AND pax_code = ? AND id != ?',
          [leadId, pax_code, paxId]
        );

        if (duplicatePax.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Passenger with this code already exists'
          });
        }
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];

      if (guest_data !== undefined) {
        updateFields.push('guest_data = ?');
        updateValues.push(JSON.stringify(guest_data));
      }

      if (form_data !== undefined) {
        updateFields.push('form_data = ?');
        updateValues.push(JSON.stringify(form_data));
      }

      if (pax_status !== undefined) {
        updateFields.push('pax_status = ?');
        updateValues.push(pax_status);
      }

      if (pax_code !== undefined) {
        updateFields.push('pax_code = ?');
        updateValues.push(pax_code);
      }

      if (journey_id !== undefined) {
        updateFields.push('journey_id = ?');
        updateValues.push(journey_id);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(paxId, leadId);

      const query = `
        UPDATE pax_lists 
        SET ${updateFields.join(', ')} 
        WHERE id = ? AND lead_id = ?
      `;

      await pool.query(query, updateValues);

      // Get updated passenger
      const [updatedPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      res.status(200).json({
        success: true,
        message: 'Passenger updated successfully',
        passenger: updatedPax[0]
      });

    } catch (error) {
      console.error('Error updating passenger:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update passenger',
        error: error.message
      });
    }
  };

  // Update guest data for a passenger
  exports.updateGuestData = async (req, res) => {
    try {
      const { paxId, leadId } = req.params;
      const { guest_data } = req.body;

      if (!paxId || !leadId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID and Lead ID are required'
        });
      }

      if (!guest_data || typeof guest_data !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Guest data object is required'
        });
      }

      // Check if passenger exists and get current guest data
      const [existingPax] = await pool.query(
        'SELECT guest_data FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      if (existingPax.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found'
        });
      }

      // Merge existing guest data with new data
      const currentGuestData = JSON.parse(existingPax[0].guest_data || '{}');
      const updatedGuestData = { ...currentGuestData, ...guest_data };

      // Update in database
      await pool.query(
        'UPDATE pax_lists SET guest_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?',
        [JSON.stringify(updatedGuestData), paxId, leadId]
      );

      // Get updated passenger
      const [updatedPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      res.status(200).json({
        success: true,
        message: 'Guest data updated successfully',
        passenger: updatedPax[0]
      });

    } catch (error) {
      console.error('Error updating guest data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update guest data',
        error: error.message
      });
    }
  };

  // Update form data for a passenger
  exports.updateFormData = async (req, res) => {
    try {
      const { paxId, leadId } = req.params;
      const { form_data } = req.body;

      if (!paxId || !leadId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID and Lead ID are required'
        });
      }

      if (!form_data || typeof form_data !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Form data object is required'
        });
      }

      // Check if passenger exists and get current form data
      const [existingPax] = await pool.query(
        'SELECT form_data FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      if (existingPax.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found'
        });
      }

      // Merge existing form data with new data
      const currentFormData = JSON.parse(existingPax[0].form_data || '{}');
      const updatedFormData = { ...currentFormData, ...form_data };

      // Update in database
      await pool.query(
        'UPDATE pax_lists SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?',
        [JSON.stringify(updatedFormData), paxId, leadId]
      );

      // Get updated passenger
      const [updatedPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      res.status(200).json({
        success: true,
        message: 'Form data updated successfully',
        passenger: updatedPax[0]
      });

    } catch (error) {
      console.error('Error updating form data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update form data',
        error: error.message
      });
    }
  };

  // Update journey ID for a passenger
  exports.updateJourneyId = async (req, res) => {
    try {
      const { paxId, leadId } = req.params;
      const { journey_id } = req.body;

      if (!paxId || !leadId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID and Lead ID are required'
        });
      }

      if (!journey_id) {
        return res.status(400).json({
          success: false,
          message: 'Journey ID is required'
        });
      }

      // Check if passenger exists
      const [existingPax] = await pool.query(
        'SELECT id FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      if (existingPax.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found'
        });
      }

      // Update journey ID
      await pool.query(
        'UPDATE pax_lists SET journey_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?',
        [journey_id, paxId, leadId]
      );

      // Get updated passenger
      const [updatedPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      res.status(200).json({
        success: true,
        message: 'Journey ID updated successfully',
        passenger: updatedPax[0]
      });

    } catch (error) {
      console.error('Error updating journey ID:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update journey ID',
        error: error.message
      });
    }
  };

  // Delete a passenger
  exports.deletePax = async (req, res) => {
    try {
      const { paxId, leadId } = req.params;

      if (!paxId || !leadId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID and Lead ID are required'
        });
      }

      const [result] = await pool.query(
        'DELETE FROM pax_lists WHERE id = ? AND lead_id = ?',
        [paxId, leadId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Passenger deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting passenger:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete passenger',
        error: error.message
      });
    }
  };

  // Get passenger statistics for a lead
  exports.getPaxStatistics = async (req, res) => {
    try {
      const { leadId } = req.params;

      if (!leadId) {
        return res.status(400).json({
          success: false,
          message: 'Lead ID is required'
        });
      }

      const [totalResult] = await pool.query(
        'SELECT COUNT(*) as total FROM pax_lists WHERE lead_id = ?',
        [leadId]
      );

      const [statusResult] = await pool.query(
        'SELECT pax_status, COUNT(*) as count FROM pax_lists WHERE lead_id = ? GROUP BY pax_status',
        [leadId]
      );

      const [journeyStats] = await pool.query(
        'SELECT journey_id, COUNT(*) as count FROM pax_lists WHERE lead_id = ? AND journey_id IS NOT NULL GROUP BY journey_id',
        [leadId]
      );

      const stats = {
        total: totalResult[0].total,
        byStatus: {
          Pending: 0,
          Boarded: 0,
          Cancelled: 0,
          'Checked-In': 0
        },
        byJourney: {}
      };

      statusResult.forEach(row => {
        if (stats.byStatus[row.pax_status] !== undefined) {
          stats.byStatus[row.pax_status] = row.count;
        }
      });

      journeyStats.forEach(row => {
        stats.byJourney[row.journey_id] = row.count;
      });

      res.status(200).json({
        success: true,
        statistics: stats
      });

    } catch (error) {
      console.error('Error fetching passenger statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch passenger statistics',
        error: error.message
      });
    }
  };

  // Bulk update passenger status
  exports.bulkUpdateStatus = async (req, res) => {
    try {
      const { leadId } = req.params;
      const { pax_codes, pax_status } = req.body;

      if (!leadId || !pax_codes || !Array.isArray(pax_codes) || !pax_status) {
        return res.status(400).json({
          success: false,
          message: 'Lead ID, passenger codes array, and status are required'
        });
      }

      const validStatuses = ['Pending', 'Boarded', 'Cancelled', 'Checked-In'];
      if (!validStatuses.includes(pax_status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be one of: Pending, Boarded, Cancelled, Checked-In'
        });
      }

      const placeholders = pax_codes.map(() => '?').join(',');
      const [result] = await pool.query(
        `UPDATE pax_lists SET pax_status = ?, updated_at = CURRENT_TIMESTAMP WHERE lead_id = ? AND pax_code IN (${placeholders})`,
        [pax_status, leadId, ...pax_codes]
      );

      res.status(200).json({
        success: true,
        message: `${result.affectedRows} passengers updated successfully`,
        updatedCount: result.affectedRows
      });

    } catch (error) {
      console.error('Error bulk updating passenger status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update passenger status',
        error: error.message
      });
    }
  };

  // Search passengers across all leads (admin function)
  exports.searchPax = async (req, res) => {
    try {
      const { search, page = 1, limit = 10 } = req.query;

      if (!search) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const offset = (page - 1) * limit;
      const searchTerm = `%${search}%`;

      const query = `
        SELECT * FROM pax_lists 
        WHERE 
          pax_code LIKE ? OR
          journey_id LIKE ? OR
          guest_data LIKE ? OR
          form_data LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const [passengers] = await pool.query(query, [
        searchTerm, searchTerm, searchTerm, searchTerm,
        parseInt(limit), offset
      ]);

      const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM pax_lists 
        WHERE pax_code LIKE ? OR journey_id LIKE ? OR guest_data LIKE ? OR form_data LIKE ?`,
        [searchTerm, searchTerm, searchTerm, searchTerm]
      );

      const total = countResult[0].total;

      res.status(200).json({
        success: true,
        passengers: passengers,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      });

    } catch (error) {
      console.error('Error searching passengers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search passengers',
        error: error.message
      });
    }
  };

  // Get passengers by journey ID
  exports.getPaxByJourney = async (req, res) => {
    try {
      const { journeyId } = req.params;
      const { 
        page = 1, 
        limit = 10,
        status,
        sortBy = 'pax_code',
        sortOrder = 'ASC'
      } = req.query;

      if (!journeyId) {
        return res.status(400).json({
          success: false,
          message: 'Journey ID is required'
        });
      }

      let query = `
        SELECT 
          id,
          lead_id,
          pax_code,
          pax_status,
          guest_data,
          form_data,
          journey_id,
          created_at,
          updated_at
        FROM pax_lists 
        WHERE journey_id = ?
      `;
      let queryParams = [journeyId];

      // Apply status filter
      if (status) {
        query += ` AND pax_status = ?`;
        queryParams.push(status);
      }

      // Add sorting
      const validSortColumns = ['pax_code', 'pax_status', 'created_at', 'updated_at'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'pax_code';
      const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      
      query += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;

      // Add pagination
      const offset = (page - 1) * limit;
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(parseInt(limit), offset);

      // Execute query
      const [passengers] = await pool.query(query, queryParams);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM pax_lists WHERE journey_id = ?`;
      let countParams = [journeyId];

      if (status) {
        countQuery += ` AND pax_status = ?`;
        countParams.push(status);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0].total;

      res.status(200).json({
        success: true,
        passengers: passengers,
        total: total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      });

    } catch (error) {
      console.error('Error fetching passengers by journey:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch passengers by journey',
        error: error.message
      });
    }
  };

  // Clear all passengers (for testing/reset)
  exports.clearAllPax = async (req, res) => {
    try {
      const [result] = await pool.query('DELETE FROM pax_lists');
      
      res.status(200).json({
        success: true,
        message: `All ${result.affectedRows} passengers cleared successfully`
      });

    } catch (error) {
      console.error('Error clearing passengers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear passengers',
        error: error.message
      });
    }
  };

exports.createMultiplePaxByLeadId = async (req, res) => {
    console.log("createMultiplePaxByLeadId function called");
    
    try {
        const lead_id = req.params.leadId;
        const { passengers } = req.body;
        
        console.log('Received request for lead_id:', lead_id);
        console.log('Received passengers count:', passengers.length);

        if (!lead_id || !passengers || !Array.isArray(passengers)) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID (in URL) and passengers array (in body) are required'
            });
        }

        // Validate each passenger
        for (let passenger of passengers) {
            if (!passenger.pax_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Each passenger must have a pax_code'
                });
            }
        }

        // Check for duplicate pax codes in the request
        const paxCodes = passengers.map(p => p.pax_code);
        const uniquePaxCodes = [...new Set(paxCodes)];
        if (paxCodes.length !== uniquePaxCodes.length) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate passenger codes found in request'
            });
        }

        // Get existing pax data from database
        const placeholders = paxCodes.map(() => '?').join(',');
        const [existingPax] = await pool.query(
            `SELECT * FROM pax_lists WHERE lead_id = ? AND pax_code IN (${placeholders})`,
            [lead_id, ...paxCodes]
        );

        const existingPassengersMap = {};
        existingPax.forEach(p => {
            // Safely parse guest_data and form_data
            let existing_guest_data = {};
            let existing_form_data = {};
            let existing_attached_pnr = [];
            
            try {
                existing_guest_data = p.guest_data 
                    ? (typeof p.guest_data === 'string' ? JSON.parse(p.guest_data) : p.guest_data)
                    : {};
            } catch (e) {
                console.error(`Error parsing guest_data for ${p.pax_code}:`, e.message);
                existing_guest_data = {};
            }
            
            try {
                existing_form_data = p.form_data 
                    ? (typeof p.form_data === 'string' ? JSON.parse(p.form_data) : p.form_data)
                    : {};
            } catch (e) {
                console.error(`Error parsing form_data for ${p.pax_code}:`, e.message);
                existing_form_data = {};
            }
            
            try {
                existing_attached_pnr = p.attached_pnr 
                    ? (typeof p.attached_pnr === 'string' ? JSON.parse(p.attached_pnr) : p.attached_pnr)
                    : [];
            } catch (e) {
                console.error(`Error parsing attached_pnr for ${p.pax_code}:`, e.message);
                existing_attached_pnr = [];
            }
            
            existingPassengersMap[p.pax_code] = {
                id: p.id,
                group_n: p.group_n, // Keep existing group_n if it exists
                existing_guest_data: existing_guest_data,
                existing_form_data: existing_form_data,
                existing_pax_status: p.pax_status,
                existing_journey_id: p.journey_id,
                existing_attached_pnr: existing_attached_pnr
            };
        });

        const existingCodes = Object.keys(existingPassengersMap);
        const newCodes = paxCodes.filter(code => !existingCodes.includes(code));
        
        // Function to safely get data value
        const getSafeDataValue = (data) => {
            if (!data) return {};
            if (typeof data === 'string') {
                try {
                    return JSON.parse(data);
                } catch (e) {
                    console.error('Error parsing data string:', e.message);
                    return {};
                }
            }
            return data;
        };

        // Function to merge objects intelligently
        const mergeObjects = (existingObj, newObj) => {
            const result = { ...existingObj };
            
            // Only update fields that have actual data in newObj
            for (const key in newObj) {
                const newValue = newObj[key];
                
                // Only update if the new value is not null, undefined, empty string, or 'N/A'
                if (newValue !== null && 
                    newValue !== undefined && 
                    newValue !== '' && 
                    newValue !== 'N/A' &&
                    newValue !== 'null' &&
                    !(Array.isArray(newValue) && newValue.length === 0) &&
                    !(typeof newValue === 'object' && newValue !== null && Object.keys(newValue).length === 0)) {
                    
                    // If the field already exists and is not empty, check if we should update
                    if (existingObj.hasOwnProperty(key)) {
                        const existingValue = existingObj[key];
                        
                        // Only update if existing value is empty/invalid or new value is different
                        if (existingValue === null || 
                            existingValue === undefined || 
                            existingValue === '' || 
                            existingValue === 'N/A' ||
                            existingValue === 'null' ||
                            JSON.stringify(newValue) !== JSON.stringify(existingValue)) {
                            
                            result[key] = newValue;
                        }
                    } else {
                        // Field doesn't exist in existing data, add it
                        result[key] = newValue;
                    }
                }
            }
            
            return result;
        };

        // ============ CORRECTED GROUP_N AUTO-ASSIGNMENT ============
        // ALWAYS CREATE NEW GROUP FOR EACH BULK IMPORT
        // 1. Get the maximum group_n (convert to number)
        // 2. If NULL, start with 1
        // 3. If has value, add 1 (numeric addition)
        
        const [maxGroupResult] = await pool.query(
            'SELECT MAX(CAST(group_n AS UNSIGNED)) as max_group FROM pax_lists WHERE lead_id = ?',
            [lead_id]
        );
        
        let group_n_for_new_passengers;
        const maxGroup = maxGroupResult[0].max_group;
        
        if (maxGroup === null) {
            // No groups exist yet, start with group 1
            group_n_for_new_passengers = 1;
            console.log(`No existing groups. Starting with NEW group 1`);
        } else {
            // Convert maxGroup to number and add 1
            group_n_for_new_passengers = Number(maxGroup) + 1;
            console.log(`Creating NEW group ${group_n_for_new_passengers} (previous max was ${maxGroup})`);
        }
        
        const is_new_group = true; // Always true for new submissions
        // ============ END NEW CODE ============

        let upsertedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let mergedDataLog = [];
        
        // Process passengers - update existing, insert new
        for (const passenger of passengers) {
            const { pax_code } = passenger;
            
            // Safely get guest_data and form_data from request
            const newGuestData = getSafeDataValue(passenger.guest_data);
            const newFormData = getSafeDataValue(passenger.form_data);
            
            // Validate and format attached_pnr
            let validatedPnrs = [];
            if (passenger.attached_pnr) {
                if (Array.isArray(passenger.attached_pnr)) {
                    validatedPnrs = [...new Set(passenger.attached_pnr.filter(pnr => 
                        typeof pnr === 'string' && pnr.trim() !== ''
                    ))];
                } else if (typeof passenger.attached_pnr === 'string') {
                    try {
                        const parsed = JSON.parse(passenger.attached_pnr);
                        if (Array.isArray(parsed)) {
                            validatedPnrs = [...new Set(parsed.filter(pnr => 
                                typeof pnr === 'string' && pnr.trim() !== ''
                            ))];
                        } else {
                            validatedPnrs = [passenger.attached_pnr.trim()];
                        }
                    } catch (e) {
                        validatedPnrs = [passenger.attached_pnr.trim()];
                    }
                }
            }
            
            if (existingCodes.includes(pax_code)) {
                // Update existing passenger with merged data (KEEP ORIGINAL GROUP)
                const existingData = existingPassengersMap[pax_code];
                
                // Merge guest_data
                const mergedGuestData = mergeObjects(existingData.existing_guest_data, newGuestData);
                
                // Merge form_data
                const mergedFormData = mergeObjects(existingData.existing_form_data, newFormData);
                
                // Merge PNRs (append new ones, don't replace)
                let mergedPnrs = [...existingData.existing_attached_pnr];
                if (validatedPnrs.length > 0) {
                    validatedPnrs.forEach(pnr => {
                        if (!mergedPnrs.includes(pnr)) {
                            mergedPnrs.push(pnr);
                        }
                    });
                }
                
                // Determine pax_status (use new if provided, otherwise keep existing)
                const newPaxStatus = passenger.pax_status || existingData.existing_pax_status || 'Pending';
                
                // Determine journey_id (use new if provided, otherwise keep existing)
                const newJourneyId = passenger.journey_id !== undefined ? passenger.journey_id : existingData.existing_journey_id;
                
                const updateQuery = `
                    UPDATE pax_lists 
                    SET 
                        guest_data = ?,
                        form_data = ?,
                        pax_status = ?,
                        journey_id = ?,
                        attached_pnr = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE lead_id = ? AND pax_code = ?
                `;
                
                await pool.query(updateQuery, [
                    JSON.stringify(mergedGuestData),
                    JSON.stringify(mergedFormData),
                    newPaxStatus,
                    newJourneyId,
                    mergedPnrs.length > 0 ? JSON.stringify(mergedPnrs) : null,
                    lead_id,
                    pax_code
                ]);
                updatedCount++;
                upsertedCount++;
                
                // Log what was merged
                const guestDataChanges = Object.keys(newGuestData).filter(key => 
                    newGuestData[key] && 
                    (!existingData.existing_guest_data[key] || 
                     JSON.stringify(existingData.existing_guest_data[key]) !== JSON.stringify(newGuestData[key]))
                );
                
                const formDataChanges = Object.keys(newFormData).filter(key => 
                    newFormData[key] && 
                    (!existingData.existing_form_data[key] || 
                     JSON.stringify(existingData.existing_form_data[key]) !== JSON.stringify(newFormData[key]))
                );
                
                const pnrChanges = validatedPnrs.filter(pnr => 
                    !existingData.existing_attached_pnr.includes(pnr)
                );
                
                mergedDataLog.push({
                    pax_code: pax_code,
                    action: 'updated',
                    group_n: existingData.group_n, // Keep original group
                    merged_fields: {
                        guest_data_added: guestDataChanges,
                        form_data_added: formDataChanges,
                        pnrs_added: pnrChanges,
                        status_updated: passenger.pax_status ? true : false,
                        journey_id_updated: passenger.journey_id !== undefined ? true : false
                    }
                });
                
                console.log(`Updated passenger ${pax_code} (kept in group ${existingData.group_n}) with merged data for lead ${lead_id}`);
            } else {
                // Insert new passenger with NEW group_n
                const insertQuery = `
                    INSERT INTO pax_lists (lead_id, group_n, pax_code, guest_data, form_data, pax_status, journey_id, attached_pnr)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                await pool.query(insertQuery, [
                    lead_id,
                    group_n_for_new_passengers, // ALWAYS use new group for new passengers
                    pax_code,
                    JSON.stringify(newGuestData),
                    JSON.stringify(newFormData),
                    passenger.pax_status || 'Pending',
                    passenger.journey_id || null,
                    validatedPnrs.length > 0 ? JSON.stringify(validatedPnrs) : null
                ]);
                createdCount++;
                upsertedCount++;
                
                mergedDataLog.push({
                    pax_code: pax_code,
                    action: 'created',
                    group_n: group_n_for_new_passengers,
                    new_fields: {
                        guest_data: Object.keys(newGuestData),
                        form_data: Object.keys(newFormData),
                        pnrs: validatedPnrs
                    }
                });
                
                console.log(`Created new passenger ${pax_code} for lead ${lead_id} in NEW group ${group_n_for_new_passengers}`);
            }
        }

        // Get all processed passengers (both updated and newly created)
        const [processedPassengers] = await pool.query(
            'SELECT * FROM pax_lists WHERE lead_id = ? AND pax_code IN (?) ORDER BY FIELD(pax_code, ?)',
            [lead_id, paxCodes, paxCodes]
        );

        console.log('Processed passengers summary:', {
            totalRequested: passengers.length,
            created: createdCount,
            updated: updatedCount,
            totalProcessed: upsertedCount,
            new_group_created: group_n_for_new_passengers,
            existing_passengers_kept_original_groups: updatedCount
        });

        res.status(200).json({
            success: true,
            message: `${upsertedCount} passengers processed successfully for lead ${lead_id}`,
            summary: {
                total_requested: passengers.length,
                created: createdCount,
                updated: updatedCount,
                total_processed: upsertedCount,
                new_group_created: group_n_for_new_passengers,
                is_new_group: is_new_group,
                merging_details: mergedDataLog.slice(0, 10) // Only show first 10 for readability
            },
            data_handling_info: {
                merging_strategy: "Smart merge - only updates fields with new valid data, preserves existing data for empty/null fields",
                guest_data_merge: "Adds new fields, updates only if existing field is empty or new value is different",
                form_data_merge: "Adds new fields, updates only if existing field is empty or new value is different",
                pnr_merge: "Appends new PNRs, doesn't remove existing ones",
                status_update: "Updates only if new status provided, otherwise keeps existing",
                journey_id_update: "Updates only if new journey_id provided, otherwise keeps existing",
                group_assignment: `NEW passengers assigned to NEW group ${group_n_for_new_passengers}. Existing passengers kept in their original groups.`
            },
            passengers: processedPassengers.map(p => ({
                id: p.id,
                pax_code: p.pax_code,
                group_n: p.group_n, // Include group_n in response
                pax_status: p.pax_status,
                journey_id: p.journey_id,
                attached_pnr: p.attached_pnr,
                created_at: p.created_at,
                updated_at: p.updated_at
            }))
        });

    } catch (error) {
        console.error('Error creating/updating multiple passengers for lead:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create/update passengers',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Add this function after your existing exports and before the closing bracket

// Process selected passengers (bulk create/update)
exports.processSelectedPassengers = async (req, res) => {
  try {
    const { leadId } = req.params;
    const {
      passengers,
      action_type = 'bulk_upsert',
      source = 'passenger_tab_selection',
      selected_fields = []
    } = req.body;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    if (!Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No passengers data provided'
      });
    }

    /* -----------------------------------
       STEP 1: STORE SELECTED PASSENGERS
    ------------------------------------ */

    const storageResults = {
      stored_count: 0,
      skipped_count: 0,
      errors: []
    };

    for (const passengerData of passengers) {
      try {
        const {
          pax_code,
          guest_data = {},
          form_data = {},
          ...otherFields
        } = passengerData;

        if (!pax_code) {
          storageResults.skipped_count++;
          continue;
        }

        // 🔒 Check if already exists in selected_passengers
        const [existingSelected] = await pool.query(
          `SELECT id FROM selected_passengers WHERE lead_id = ? AND pax_code = ?`,
          [leadId, pax_code]
        );

        if (existingSelected.length > 0) {
          storageResults.skipped_count++;
          continue; // 🚫 DO NOT UPDATE
        }

        // Check if exists in pax_lists
        const [existingPax] = await pool.query(
          `SELECT id FROM pax_lists WHERE lead_id = ? AND pax_code = ?`,
          [leadId, pax_code]
        );

        // Validate attached_pnr
        let validatedPnrs = null;
        if (otherFields.attached_pnr) {
          const pnrs = Array.isArray(otherFields.attached_pnr)
            ? otherFields.attached_pnr
            : [otherFields.attached_pnr];

          validatedPnrs = [...new Set(
            pnrs.filter(p => typeof p === 'string' && p.trim() !== '')
          )];
        }

        const metadata = {
          source,
          action_type,
          received_at: new Date().toISOString()
        };

        await pool.query(
          `
          INSERT INTO selected_passengers
          (
            lead_id,
            pax_code,
            original_passenger_id,
            guest_data,
            form_data,
            pax_status,
            journey_id,
            pnr_number,
            attached_pnr,
            selected_fields,
            processing_metadata
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            leadId,
            pax_code,
            existingPax.length ? existingPax[0].id : null,
            JSON.stringify(guest_data),
            JSON.stringify(form_data),
            otherFields.pax_status || 'Pending',
            otherFields.journey_id || null,
            otherFields.pnr_number || null,
            validatedPnrs ? JSON.stringify(validatedPnrs) : null,
            JSON.stringify(selected_fields),
            JSON.stringify(metadata)
          ]
        );

        storageResults.stored_count++;

      } catch (err) {
        storageResults.errors.push({
          pax_code: passengerData.pax_code,
          error: err.message
        });
        storageResults.skipped_count++;
      }
    }

    /* -----------------------------------
       STEP 2: PROCESS UNPROCESSED RECORDS
    ------------------------------------ */

    const processingResults = {
      processed_count: 0,
      created_count: 0,
      updated_count: 0,
      failed_count: 0,
      failed_passengers: []
    };

    const [pendingPassengers] = await pool.query(
      `
      SELECT *
      FROM selected_passengers
      WHERE lead_id = ? AND processed_at IS NULL
      ORDER BY created_at ASC
      `,
      [leadId]
    );

    for (const selected of pendingPassengers) {
      try {
        const {
          pax_code,
          original_passenger_id,
          guest_data,
          form_data,
          pax_status,
          journey_id,
          pnr_number,
          attached_pnr
        } = selected;

        const guestData = typeof guest_data === 'string' ? JSON.parse(guest_data) : guest_data;
        const formData = typeof form_data === 'string' ? JSON.parse(form_data) : form_data;
        const attachedPnrs = attached_pnr
          ? (Array.isArray(attached_pnr) ? attached_pnr : JSON.parse(attached_pnr))
          : null;

        if (original_passenger_id) {
          await pool.query(
            `
            UPDATE pax_lists
            SET
              guest_data = ?,
              form_data = ?,
              pax_status = ?,
              journey_id = ?,
              pnr_number = ?,
              attached_pnr = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND lead_id = ?
            `,
            [
              JSON.stringify(guestData),
              JSON.stringify(formData),
              pax_status,
              journey_id,
              pnr_number,
              attachedPnrs ? JSON.stringify(attachedPnrs) : null,
              original_passenger_id,
              leadId
            ]
          );
          processingResults.updated_count++;
        } else {
          await pool.query(
            `
            INSERT INTO pax_lists
            (lead_id, pax_code, guest_data, form_data, pax_status, journey_id, pnr_number, attached_pnr)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              leadId,
              pax_code,
              JSON.stringify(guestData),
              JSON.stringify(formData),
              pax_status,
              journey_id,
              pnr_number,
              attachedPnrs ? JSON.stringify(attachedPnrs) : null
            ]
          );
          processingResults.created_count++;
        }

        await pool.query(
          `UPDATE selected_passengers SET processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [selected.id]
        );

        processingResults.processed_count++;

      } catch (err) {
        processingResults.failed_count++;
        processingResults.failed_passengers.push({
          pax_code: selected.pax_code,
          error: err.message
        });
      }
    }

    /* -----------------------------------
       FINAL RESPONSE
    ------------------------------------ */

    return res.status(200).json({
      success: true,
      storage: storageResults,
      processing: processingResults,
      summary: {
        total_received: passengers.length,
        processed: processingResults.processed_count,
        skipped: storageResults.skipped_count
      }
    });

  } catch (error) {
    console.error('processSelectedPassengers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};




// Simple listing function - just get all data from selected_passengers table
exports.listSelectedPassengers = async (req, res) => {
  try {
    const leadId = Number(req.params.leadId);

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Valid lead_id is required',
      });
    }

    const [passengers] = await pool.query(
      `
      SELECT
        id,
        lead_id,
        pax_code,
        original_passenger_id,
        guest_data,
        form_data,
        pax_status,
        journey_id,
        pnr_number,
        attached_pnr,
        selected_fields,
        processing_metadata,
        processed_at,
        created_at
      FROM selected_passengers
      WHERE lead_id = ?
      ORDER BY created_at DESC
      `,
      [leadId]
    );

    return res.status(200).json({
      success: true,
      count: passengers.length,
      passengers,
    });

  } catch (error) {
    console.error('Error listing selected passengers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list selected passengers',
      error: error.message,
    });
  }
};
