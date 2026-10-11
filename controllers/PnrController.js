const db = require('../config/db');

const pnrController = {
  // GET /api/pnrs/lead/:leadId - Get PNRs by lead ID
createPnr: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      const {
        pnr_number, pnr_type, pax_count, assign_pax_count,
        cost_per_pax, base_fare, tax_value, sale_fare, chair_type, lead_id, 
        flight_segments, pax_code, passengers
      } = req.body;

      // Convert pax_code to JSON string if it's an array
      let paxCodeValue = null;
      let paxCodeArray = [];
      
      if (pax_code) {
        if (Array.isArray(pax_code)) {
          paxCodeValue = JSON.stringify(pax_code);
          paxCodeArray = pax_code;
        } else if (typeof pax_code === 'string') {
          try {
            const parsed = JSON.parse(pax_code);
            paxCodeValue = JSON.stringify(parsed);
            paxCodeArray = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            paxCodeValue = pax_code;
            paxCodeArray = [pax_code];
          }
        }
      }

      // Insert PNR with pax_code
      const [pnrResult] = await connection.execute(
        `INSERT INTO pnrs (
          pnr_number, pnr_type, pax_count, assign_pax_count,
          cost_per_pax, base_fare, tax_value, sale_fare, chair_type, lead_id,
          pax_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pnr_number, pnr_type, pax_count, assign_pax_count,
         cost_per_pax, base_fare, tax_value, sale_fare, chair_type, lead_id,
         paxCodeValue]
      );

      const pnrId = pnrResult.insertId;

      // Insert flight segments and collect them
      let flightSegmentsData = [];
      if (flight_segments && flight_segments.length > 0) {
        for (const seg of flight_segments) {
          const [segmentResult] = await connection.execute(
            `INSERT INTO pnr_flight_segments (
              pnr_id, flight_number, from_airport, to_airport,
              departure_date, departure_time, arrival_date, arrival_time,
              duration, dep_terminal, arv_terminal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pnrId, seg.flight_number, seg.from_airport, seg.to_airport,
             seg.departure_date, seg.departure_time, seg.arrival_date, seg.arrival_time,
             seg.duration, seg.dep_terminal, seg.arv_terminal]
          );
          flightSegmentsData.push({
            id: segmentResult.insertId,
            ...seg
          });
        }
      }

      // ========== INSERT INTO PNR_PASSENGER TABLE (ONE RECORD PER PAX_CODE) ==========
      let insertedPnrPassengerIds = [];
      
      if (pnr_number && lead_id && passengers && Array.isArray(passengers)) {
        // Process each passenger individually
        for (const passenger of passengers) {
          // Extract pax_code from passenger data
          const passengerPaxCode = passenger.pax_code || 
                                  (passenger.form_data && passenger.form_data.pax_code);
          
          // Create a JSON array with just this passenger
          const singlePassengerJson = JSON.stringify([passenger]);
          
          // Create flight segments JSON
          let flightSegmentsJson = JSON.stringify(flightSegmentsData || []);
          
          // Create pax_code array for this specific passenger
          const singlePaxCodeValue = passengerPaxCode ? JSON.stringify([passengerPaxCode]) : '[]';
          
          // Insert into pnr_passenger table - ONE RECORD PER PASSENGER
          const [pnrPassengerResult] = await connection.execute(
            `INSERT INTO pnr_passenger (
              pnr_number, passengers, lead_id, pax_code, flight_segments
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              pnr_number,
              singlePassengerJson,
              lead_id,
              singlePaxCodeValue,
              flightSegmentsJson
            ]
          );

          insertedPnrPassengerIds.push(pnrPassengerResult.insertId);
          console.log(`PNR passenger record created for pax_code ${passengerPaxCode} with ID: ${pnrPassengerResult.insertId}`);
        }
        
        console.log(`Created ${insertedPnrPassengerIds.length} individual passenger records for PNR: ${pnr_number}`);
      } else if (pnr_number && lead_id) {
        // Fallback: Insert single record if passengers array is not provided
        let flightSegmentsJson = JSON.stringify(flightSegmentsData || []);
        let passengersJson = JSON.stringify(passengers || []);
        
        const [pnrPassengerResult] = await connection.execute(
          `INSERT INTO pnr_passenger (
            pnr_number, passengers, lead_id, pax_code, flight_segments
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            pnr_number,
            passengersJson,
            lead_id,
            paxCodeValue,
            flightSegmentsJson
          ]
        );

        insertedPnrPassengerIds.push(pnrPassengerResult.insertId);
        console.log(`PNR passenger record created with ID: ${pnrPassengerResult.insertId}`);
      }

      await connection.commit();
      
      // Return the created PNR with segments and passenger info
      const [newPnr] = await db.execute('SELECT * FROM pnrs WHERE id = ?', [pnrId]);
      const [segments] = await db.execute(
        'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
        [pnrId]
      );
      
      // Fetch all pnr_passenger data for this PNR
      let pnrPassengerData = [];
      if (insertedPnrPassengerIds.length > 0) {
        const [pnrPassengerRows] = await db.execute(
          'SELECT * FROM pnr_passenger WHERE pnr_number = ? ORDER BY id ASC',
          [pnr_number]
        );
        
        for (const row of pnrPassengerRows) {
          let passengerRow = { ...row };
          
          // Parse JSON columns for response
          if (passengerRow.passengers && typeof passengerRow.passengers === 'string') {
            try {
              passengerRow.passengers = JSON.parse(passengerRow.passengers);
            } catch (e) {
              passengerRow.passengers = [];
            }
          }
          
          if (passengerRow.flight_segments && typeof passengerRow.flight_segments === 'string') {
            try {
              passengerRow.flight_segments = JSON.parse(passengerRow.flight_segments);
            } catch (e) {
              passengerRow.flight_segments = [];
            }
          }
          
          if (passengerRow.pax_code && typeof passengerRow.pax_code === 'string') {
            try {
              passengerRow.pax_code = JSON.parse(passengerRow.pax_code);
            } catch (e) {
              // Keep as string if not valid JSON
            }
          }
          
          pnrPassengerData.push(passengerRow);
        }
      }
      
      const pnrData = newPnr[0];
      pnrData.flight_segments = segments;
      
      // Add pnr_passenger data to response
      if (pnrPassengerData.length > 0) {
        pnrData.pnr_passengers = pnrPassengerData;
      }
      
      // Parse pax_code from JSON string back to array for response
      if (pnrData.pax_code && typeof pnrData.pax_code === 'string') {
        try {
          pnrData.pax_code = JSON.parse(pnrData.pax_code);
        } catch (e) {
          pnrData.pax_code = pnrData.pax_code;
        }
      }

      res.json({ 
        success: true, 
        message: 'PNR created successfully',
        data: pnrData 
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error creating PNR:', error);
      res.status(500).json({ success: false, message: error.message });
    } finally {
      connection.release();
    }
  },
  // PUT /api/pnrs/:id - Update PNR
  updatePnr: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const {
        pnr_number, pnr_type, pax_count, assign_pax_count,
        cost_per_pax, base_fare, tax_value, sale_fare, chair_type, lead_id, flight_segments
      } = req.body;

      // Update PNR
      await connection.execute(
        `UPDATE pnrs SET 
          pnr_number=?, pnr_type=?, pax_count=?, assign_pax_count=?,
          cost_per_pax=?, base_fare=?, tax_value=?, sale_fare=?, chair_type=?, lead_id=?
        WHERE id=?`,
        [pnr_number, pnr_type, pax_count, assign_pax_count,
         cost_per_pax, base_fare, tax_value, sale_fare, chair_type, lead_id, id]
      );

      // Delete old segments and insert new ones
      await connection.execute('DELETE FROM pnr_flight_segments WHERE pnr_id = ?', [id]);

      // Insert flight segments
      if (flight_segments && flight_segments.length > 0) {
        for (const seg of flight_segments) {
          await connection.execute(
            `INSERT INTO pnr_flight_segments (
              pnr_id, flight_number, from_airport, to_airport,
              departure_date, departure_time, arrival_date, arrival_time,
              duration, dep_terminal, arv_terminal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, seg.flight_number, seg.from_airport, seg.to_airport,
             seg.departure_date, seg.departure_time, seg.arrival_date, seg.arrival_time,
             seg.duration, seg.dep_terminal, seg.arv_terminal]
          );
        }
      }

      await connection.commit();
      
      // Return the updated PNR with segments
      const [updatedPnr] = await db.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      const [segments] = await db.execute(
        'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
        [id]
      );
      
      const pnrData = updatedPnr[0];
      pnrData.flight_segments = segments;

      res.json({ 
        success: true, 
        message: 'PNR updated successfully',
        data: pnrData
      });
    } catch (error) {
      await connection.rollback();
      res.status(500).json({ success: false, message: error.message });
    } finally {
      connection.release();
    }
  },
  
  getPnrsByLead: async (req, res) => {
    try {
      const { leadId } = req.params;
      
      const [pnrs] = await db.execute(
        'SELECT * FROM pnrs WHERE lead_id = ? ORDER BY created_at DESC',
        [leadId]
      );
      
      // Get flight segments for each PNR
      for (let pnr of pnrs) {
        const [segments] = await db.execute(
          'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
          [pnr.id]
        );
        pnr.flight_segments = segments;
      }

      res.json({ 
        success: true, 
        data: pnrs,
        count: pnrs.length
      });
    } catch (error) {
      console.error('Error fetching PNRs by lead:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch PNR data',
        error: error.message 
      });
    }
  },

  // GET /api/pnrs - Get all PNRs
  getAllPnrs: async (req, res) => {
    try {
      const [pnrs] = await db.execute('SELECT * FROM pnrs ORDER BY created_at DESC');
      
      // Get flight segments for each PNR
      for (let pnr of pnrs) {
        const [segments] = await db.execute(
          'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
          [pnr.id]
        );
        pnr.flight_segments = segments;
      }

      res.json({ success: true, data: pnrs });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }, 



  getStats: async (req, res) => {
    try {
      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_pnrs,
          COUNT(CASE WHEN pnr_type = 'Group' THEN 1 END) as group_pnrs,
          COUNT(CASE WHEN pnr_type = 'FIT' THEN 1 END) as fit_pnrs,
          COALESCE(SUM(pax_count), 0) as total_passengers,
          COALESCE(SUM(cost_per_pax * pax_count), 0) as total_revenue
        FROM pnrs
      `);
      
      res.json({ success: true, data: stats[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  // DELETE /api/pnrs/:id - Delete PNR
  deletePnr: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      
      // Delete flight segments first (due to foreign key constraint)
      await connection.execute('DELETE FROM pnr_flight_segments WHERE pnr_id = ?', [id]);
      // Delete PNR
      await connection.execute('DELETE FROM pnrs WHERE id = ?', [id]);
      
      await connection.commit();
      res.json({ success: true, message: 'PNR deleted successfully' });
    } catch (error) {
      await connection.rollback();
      res.status(500).json({ success: false, message: error.message });
    } finally {
      connection.release();
    }
  },

  // GET /api/pnrs/:id - Get single PNR
  getPnr: async (req, res) => {
    try {
      const { id } = req.params;
      const [pnrs] = await db.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      
      if (pnrs.length === 0) {
        return res.status(404).json({ success: false, message: 'PNR not found' });
      }

      const pnr = pnrs[0];
      const [segments] = await db.execute(
        'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
        [id]
      );
      
      pnr.flight_segments = segments;
      res.json({ success: true, data: pnr });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
   deactivatePnr: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const { deactivation_reason, deactivated_by } = req.body;

      // Check if PNR exists
      const [pnrs] = await connection.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      
      if (pnrs.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'PNR not found' 
        });
      }

      const pnr = pnrs[0];

      // Check if PNR is already deactivated
      if (pnr.status === 'Deactivated') {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'PNR is already deactivated' 
        });
      }

      // Update PNR status to Deactivated
      const [updateResult] = await connection.execute(
        `UPDATE pnrs SET 
          status = 'Deactivated',
          deactivation_reason = ?,
          deactivated_by = ?,
          deactivated_at = NOW(),
          updated_at = NOW()
        WHERE id = ?`,
        [deactivation_reason || 'Manual deactivation', deactivated_by || 'System', id]
      );

      // Create deactivation log
      await connection.execute(
        `INSERT INTO pnr_deactivation_logs (
          pnr_id, pnr_number, deactivation_reason, deactivated_by, deactivated_at
        ) VALUES (?, ?, ?, ?, NOW())`,
        [id, pnr.pnr_number, deactivation_reason || 'Manual deactivation', deactivated_by || 'System']
      );

      await connection.commit();

      // Return the updated PNR
      const [updatedPnr] = await db.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      const [segments] = await db.execute(
        'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
        [id]
      );
      
      const pnrData = updatedPnr[0];
      pnrData.flight_segments = segments;

      res.json({ 
        success: true, 
        message: 'PNR deactivated successfully',
        data: pnrData
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error deactivating PNR:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to deactivate PNR',
        error: error.message 
      });
    } finally {
      connection.release();
    }
  },

  // PATCH /api/pnrs/:id/reactivate - Reactivate PNR
  reactivatePnr: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      const { id } = req.params;
      const { reactivation_reason, reactivated_by } = req.body;

      // Check if PNR exists
      const [pnrs] = await connection.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      
      if (pnrs.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'PNR not found' 
        });
      }

      const pnr = pnrs[0];

      // Check if PNR is already active
      if (pnr.status === 'Active') {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'PNR is already active' 
        });
      }

      // Update PNR status to Active
      const [updateResult] = await connection.execute(
        `UPDATE pnrs SET 
          status = 'Active',
          reactivation_reason = ?,
          reactivated_by = ?,
          reactivated_at = NOW(),
          updated_at = NOW()
        WHERE id = ?`,
        [reactivation_reason || 'Manual reactivation', reactivated_by || 'System', id]
      );

      // Create reactivation log
      await connection.execute(
        `INSERT INTO pnr_reactivation_logs (
          pnr_id, pnr_number, reactivation_reason, reactivated_by, reactivated_at
        ) VALUES (?, ?, ?, ?, NOW())`,
        [id, pnr.pnr_number, reactivation_reason || 'Manual reactivation', reactivated_by || 'System']
      );

      await connection.commit();

      // Return the updated PNR
      const [updatedPnr] = await db.execute('SELECT * FROM pnrs WHERE id = ?', [id]);
      const [segments] = await db.execute(
        'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
        [id]
      );
      
      const pnrData = updatedPnr[0];
      pnrData.flight_segments = segments;

      res.json({ 
        success: true, 
        message: 'PNR reactivated successfully',
        data: pnrData
      });

    } catch (error) {
      await connection.rollback();
      console.error('Error reactivating PNR:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to reactivate PNR',
        error: error.message 
      });
    } finally {
      connection.release();
    }
  },

  // GET /api/pnrs/:id/deactivation-history - Get PNR deactivation history
  getDeactivationHistory: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if table exists, if not return empty array
      const [logs] = await db.execute(`
        SELECT * FROM pnr_deactivation_logs 
        WHERE pnr_id = ? 
        ORDER BY deactivated_at DESC
      `, [id]);

      res.json({ 
        success: true, 
        data: logs,
        count: logs.length
      });
    } catch (error) {
      // If table doesn't exist, return empty array
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ 
          success: true, 
          data: [],
          count: 0
        });
      }
      
      console.error('Error fetching deactivation history:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch deactivation history',
        error: error.message 
      });
    }
  },

  // GET /api/pnrs/status/:status - Get PNRs by status
  getPnrsByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const validStatuses = ['Active', 'Deactivated', 'Pending', 'Cancelled'];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid status. Valid statuses: Active, Deactivated, Pending, Cancelled' 
        });
      }

      const [pnrs] = await db.execute(
        'SELECT * FROM pnrs WHERE status = ? ORDER BY created_at DESC',
        [status]
      );
      
      // Get flight segments for each PNR
      for (let pnr of pnrs) {
        const [segments] = await db.execute(
          'SELECT * FROM pnr_flight_segments WHERE pnr_id = ? ORDER BY departure_date ASC, departure_time ASC',
          [pnr.id]
        );
        pnr.flight_segments = segments;
      }

      res.json({ 
        success: true, 
        data: pnrs,
        count: pnrs.length
      });
    } catch (error) {
      console.error('Error fetching PNRs by status:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch PNR data',
        error: error.message 
      });
    }
  }
};

module.exports = pnrController;