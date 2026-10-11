    const pool = require('../config/db');
exports.assignPnr = async (req, res) => {
    try {
        const { leadId, passengerId } = req.params;
        const { pnr_number } = req.body;

        if (!leadId || !passengerId || !pnr_number) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID, Passenger Code, and PNR are required'
            });
        }

        // Check if passenger exists
        const [existingPax] = await pool.query(
            'SELECT id, attached_pnr FROM pax_lists WHERE lead_id = ? AND pax_code = ?',
            [leadId, passengerId]
        );

        if (existingPax.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Passenger not found'
            });
        }

        const passenger = existingPax[0];
        let updatedPnrs = [];

        // Handle different cases for attached_pnr field
        if (!passenger.attached_pnr) {
            // Case 1: Field is null or empty
            updatedPnrs = [pnr_number];
        } else {
            // Case 2: Field has data - try to parse it
            try {
                let currentPnrs;
                
                // Check if it's already an array (shouldn't happen but just in case)
                if (Array.isArray(passenger.attached_pnr)) {
                    currentPnrs = passenger.attached_pnr;
                } else if (typeof passenger.attached_pnr === 'string') {
                    // Try to parse as JSON
                    currentPnrs = JSON.parse(passenger.attached_pnr);
                    
                    // If parsing returns a string instead of array, handle it
                    if (typeof currentPnrs === 'string') {
                        // Try to parse again if it's a string containing JSON
                        try {
                            currentPnrs = JSON.parse(currentPnrs);
                        } catch (e) {
                            // If it's just a plain string, treat it as a single PNR
                            currentPnrs = [currentPnrs];
                        }
                    }
                } else {
                    // For any other type, start fresh
                    currentPnrs = [];
                }

                // Ensure we have an array
                if (!Array.isArray(currentPnrs)) {
                    console.warn('attached_pnr is not an array, converting to array:', currentPnrs);
                    currentPnrs = [currentPnrs].filter(Boolean);
                }

                // Check if PNR already exists (case insensitive)
                const pnrExists = currentPnrs.some(pnr => 
                    pnr.toString().toLowerCase() === pnr_number.toLowerCase()
                );

                if (pnrExists) {
                    return res.status(400).json({
                        success: false,
                        message: 'PNR already assigned to this passenger'
                    });
                }

                // Add new PNR and remove any duplicates
                updatedPnrs = [...new Set([...currentPnrs, pnr_number])];

            } catch (parseError) {
                console.error('Error parsing attached_pnr:', parseError);
                console.log('Raw attached_pnr value:', passenger.attached_pnr);
                
                // If parsing fails, start fresh with the new PNR
                updatedPnrs = [pnr_number];
            }
        }

        // Update passenger with new PNRs
        await pool.query(
            'UPDATE pax_lists SET attached_pnr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?',
            [JSON.stringify(updatedPnrs), passenger.id, leadId]
        );

        // Get updated passenger
        const [updatedPax] = await pool.query(
            'SELECT * FROM pax_lists WHERE id = ?',
            [passenger.id]
        );

        res.status(200).json({
            success: true,
            message: 'PNR assigned successfully',
            passenger: updatedPax[0],
            attached_pnrs: updatedPnrs
        });

    } catch (error) {
        console.error('Error assigning PNR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign PNR',
            error: error.message
        });
    }
};

    // Assign multiple PNRs to a passenger
exports.assignMultiplePnrs = async (req, res) => {
    try {
        const { leadId, paxCode } = req.params;
        const { pnr_number, journey_id } = req.body; // ✅ Added journey_id
   
        if (!leadId || !paxCode || !pnr_number || !Array.isArray(pnr_number)) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID, Passenger Code, and PNRs array are required'
            });
        }

        // Check if passenger exists
        const [existingPax] = await pool.query(
            'SELECT id, attached_pnr, journey_id FROM pax_lists WHERE lead_id = ? AND pax_code = ?', // ✅ Added journey_id to SELECT
            [leadId, paxCode]
        );

        if (existingPax.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Passenger not found'
            });
        }

        const passenger = existingPax[0];
        let updatedPnrs = [];

        // If attached_pnr is null or empty, use new PNRs
        if (!passenger.attached_pnr) {
            updatedPnrs = pnr_number;
        } else {
            // Parse existing PNRs and merge with new ones
            const currentPnrs = JSON.parse(passenger.attached_pnr);
            // Remove duplicates
            const allPnrs = [...new Set([...currentPnrs, ...pnr_number])];
            updatedPnrs = allPnrs;
        }

        // ✅ Prepare update fields
        const updateFields = ['attached_pnr = ?'];
        const updateValues = [JSON.stringify(updatedPnrs)];

        // ✅ Add journey_id to update if provided
        if (journey_id) {
            updateFields.push('journey_id = ?');
            updateValues.push(journey_id);
            console.log(`Updating passenger with journey_id: ${journey_id}`);
        }

        // Add updated_at
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        
        // Add passenger id and lead_id to values array for WHERE clause
        updateValues.push(passenger.id, leadId);

        // Update passenger with new PNRs and journey_id
        await pool.query(
            `UPDATE pax_lists SET ${updateFields.join(', ')} WHERE id = ? AND lead_id = ?`,
            updateValues
        );

        // Get updated passenger
        const [updatedPax] = await pool.query(
            'SELECT * FROM pax_lists WHERE id = ?',
            [passenger.id]
        );

        console.log(`✅ Successfully updated passenger ${paxCode}:`, {
            pnrs: updatedPnrs,
            journey_id: journey_id || passenger.journey_id
        });

        res.status(200).json({
            success: true,
            message: journey_id 
                ? 'Multiple PNRs and journey_id assigned successfully'
                : 'Multiple PNRs assigned successfully',
            passenger: updatedPax[0],
            attached_pnrs: updatedPnrs,
            journey_id: journey_id || passenger.journey_id // ✅ Return journey_id in response
        });

    } catch (error) {
        console.error('Error assigning multiple PNRs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign PNRs',
            error: error.message
        });
    }
};

    // Remove PNR from a passenger
exports.removePnr = async (req, res) => {
    let connection;

  
    try {   
        const { leadId, paxCode } = req.params;
        const { pnr_number, removal_reason, extra_price } = req.body;

          console.log("jkjkjhjkkjkj123",pnr_number,"jhjhjhjh")

        if (!leadId || !paxCode || !pnr_number) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID, Passenger Code, and PNR are required'
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Get passenger details using pax_code
        const [passenger] = await connection.execute(
            'SELECT * FROM pax_lists WHERE lead_id = ? AND pax_code = ?',
            [leadId, paxCode]
        );

        if (passenger.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Passenger not found'
            });
        }

        const passengerData = passenger[0];

        // Check if passenger has any PNRs
        if (!passengerData.attached_pnr) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'No PNRs assigned to this passenger'
            });
        }

        // Parse existing PNRs
        let currentPnrs = [];
        try {
            currentPnrs = Array.isArray(passengerData.attached_pnr) 
                ? passengerData.attached_pnr 
                : JSON.parse(passengerData.attached_pnr || '[]');
        } catch (error) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invalid PNR data format'
            });
        }

        // Check if PNR exists for this passenger
        if (!currentPnrs.includes(pnr_number)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'PNR not found for this passenger'
            });
        }

        // Get PNR details
        const [pnr] = await connection.execute(
            'SELECT * FROM pnrs WHERE pnr_number = ? AND lead_id = ?',
            [pnr_number, leadId]
        );

        if (pnr.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'PNR not found in system'
            });
        }

        const pnrData = pnr[0];

        // Remove PNR from passenger
        const updatedPnrs = currentPnrs.filter(p => p !== pnr_number);
        
        await connection.execute(
            'UPDATE pax_lists SET attached_pnr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [updatedPnrs.length > 0 ? JSON.stringify(updatedPnrs) : null, passengerData.id]
        );

        // Decrement PNR assigned count
        await connection.execute(
            'UPDATE pnrs SET assign_pax_count = GREATEST(0, assign_pax_count - 1) WHERE pnr_number = ?',
            [pnr_number]
        );

        // Save to removal history - using pax_code match
        await connection.execute(
            `INSERT INTO pnr_removal_history (
                lead_id, pax_id, pax_code, pnr_number, 
                removal_reason, extra_price, removed_at,
                passenger_details, pnr_details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                leadId,
                passengerData.id,
                paxCode, // Using the pax_code from params
                pnr_number,
                removal_reason || 'No reason provided',
                extra_price || 0,
                new Date(),
                JSON.stringify(passengerData), // All passenger data
                JSON.stringify(pnrData)        // All PNR data
            ]
        );

        // Get updated data
        const [updatedPassenger] = await connection.execute(
            'SELECT * FROM pax_lists WHERE id = ?',
            [passengerData.id]
        );

        const [updatedPnr] = await connection.execute(
            'SELECT * FROM pnrs WHERE pnr_number = ?',
            [pnr_number]
        );

        await connection.commit();

        res.status(200).json({
            success: true,
            message: 'PNR removed successfully',
            passenger: updatedPassenger[0],
            pnr: updatedPnr[0]
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error removing PNR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove PNR',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};


exports.getPnrRemovalHistory = async (req, res) => {
    try {
        const { leadId, pnr_number, pax_code, page = 1, limit = 10 } = req.query;
        
        console.log('Received parameters:', { leadId, pnr_number, pax_code, page, limit });
        
        // Convert to numbers
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];

        if (leadId) {
            whereConditions.push('prh.lead_id = ?');
            queryParams.push(leadId);
        }

        if (pnr_number) {
            whereConditions.push('prh.pnr_number = ?');
            queryParams.push(pnr_number);
        }

        if (pax_code) {
            whereConditions.push('prh.pax_code = ?');
            queryParams.push(pax_code);
        }

        // Build the main query - use template literals for LIMIT/OFFSET
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        const query = `
            SELECT 
                prh.*
            FROM pnr_removal_history prh
            ${whereClause}
            ORDER BY prh.removed_at DESC 
            LIMIT ${limitNum} OFFSET ${offset}
        `;

        console.log('Final Query:', query);
        console.log('Final Parameters:', queryParams);

        // Execute main query
        const [removals] = await pool.execute(query, queryParams);

        // Build count query
        let countQuery = `SELECT COUNT(*) as total FROM pnr_removal_history prh ${whereClause}`;
        
        console.log('Count Query:', countQuery);
        console.log('Count Parameters:', queryParams);

        const [countResult] = await pool.execute(countQuery, queryParams);
        const total = countResult[0].total;

        // Parse JSON fields and extract required data
        const parsedRemovals = removals.map(removal => {
            const parsedRecord = { ...removal };
            
            try {
                if (removal.passenger_details && typeof removal.passenger_details === 'string') {
                    const passengerData = JSON.parse(removal.passenger_details);
                    parsedRecord.passenger_details = passengerData;
                    
                    // Extract fields from form_data for easy access
                    if (passengerData.form_data) {
                        parsedRecord.passenger_name = passengerData.form_data.full_name || 'N/A';
                        parsedRecord.passenger_email = passengerData.form_data.email || 'N/A';
                        parsedRecord.passenger_phone = passengerData.form_data.phone || 'N/A';
                    } else {
                        parsedRecord.passenger_name = 'N/A';
                        parsedRecord.passenger_email = 'N/A';
                        parsedRecord.passenger_phone = 'N/A';
                    }
                } else {
                    parsedRecord.passenger_name = 'N/A';
                    parsedRecord.passenger_email = 'N/A';
                    parsedRecord.passenger_phone = 'N/A';
                }
            } catch (error) {
                console.warn('Failed to parse passenger_details for record:', removal.id);
                parsedRecord.passenger_details = null;
                parsedRecord.passenger_name = 'N/A';
                parsedRecord.passenger_email = 'N/A';
                parsedRecord.passenger_phone = 'N/A';
            }
            
            try {
                if (removal.pnr_details && typeof removal.pnr_details === 'string') {
                    const pnrData = JSON.parse(removal.pnr_details);
                    parsedRecord.pnr_details = pnrData;
                    
                    // Extract PNR fields for easy access
                    parsedRecord.pnr_type = pnrData.pnr_type || 'N/A';
                    parsedRecord.chair_type = pnrData.chair_type || 'N/A';
                    parsedRecord.pnr_status = pnrData.status || 'N/A';
                } else {
                    parsedRecord.pnr_type = 'N/A';
                    parsedRecord.chair_type = 'N/A';
                    parsedRecord.pnr_status = 'N/A';
                }
            } catch (error) {
                console.warn('Failed to parse pnr_details for record:', removal.id);
                parsedRecord.pnr_details = null;
                parsedRecord.pnr_type = 'N/A';
                parsedRecord.chair_type = 'N/A';
                parsedRecord.pnr_status = 'N/A';
            }
            
            return parsedRecord;
        });

        res.status(200).json({
            success: true,
            data: parsedRemovals,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });

    } catch (error) {
        console.error('Error fetching PNR removal history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch PNR removal history',
            error: error.message
        });
    }
};

    // Clear all PNRs from a passenger
    exports.clearAllPnrs = async (req, res) => {
    try {
        const { leadId, paxCode } = req.params;

        if (!leadId || !paxCode) {
        return res.status(400).json({
            success: false,
            message: 'Lead ID and Passenger Code are required'
        });
        }

        // Check if passenger exists
        const [existingPax] = await pool.query(
        'SELECT id FROM pax_lists WHERE lead_id = ? AND pax_code = ?',
        [leadId, paxCode]
        );

        if (existingPax.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Passenger not found'
        });
        }

        const passenger = existingPax[0];

        // Clear all PNRs
        await pool.query(
        'UPDATE pax_lists SET attached_pnr = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lead_id = ?',
        [passenger.id, leadId]
        );

        // Get updated passenger
        const [updatedPax] = await pool.query(
        'SELECT * FROM pax_lists WHERE id = ?',
        [passenger.id]
        );

        res.status(200).json({
        success: true,
        message: 'All PNRs cleared successfully',
        passenger: updatedPax[0]
        });

    } catch (error) {
        console.error('Error clearing PNRs:', error);
        res.status(500).json({
        success: false,
        message: 'Failed to clear PNRs',
        error: error.message
        });
    }
    };

    // Get passengers by PNR
    exports.getPaxByPnr = async (req, res) => {
    try {
        const { pnr } = req.params;
        const { 
        page = 1, 
        limit = 10,
        leadId
        } = req.query;

        if (!pnr) {
        return res.status(400).json({
            success: false,
            message: 'PNR is required'
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
            attached_pnr,
            created_at,
            updated_at
        FROM pax_lists 
        WHERE JSON_CONTAINS(attached_pnr, ?)
        `;
        let queryParams = [JSON.stringify(pnr)];

        // Filter by lead ID if provided
        if (leadId) {
        query += ` AND lead_id = ?`;
        queryParams.push(leadId);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), offset);

        // Execute query
        const [passengers] = await pool.query(query, queryParams);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as total FROM pax_lists WHERE JSON_CONTAINS(attached_pnr, ?)`;
        let countParams = [JSON.stringify(pnr)];

        if (leadId) {
        countQuery += ` AND lead_id = ?`;
        countParams.push(leadId);
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
        console.error('Error fetching passengers by PNR:', error);
        res.status(500).json({
        success: false,
        message: 'Failed to fetch passengers by PNR',
        error: error.message
        });
    }
    };

    // Bulk assign PNR to multiple passengers
    exports.bulkAssignPnr = async (req, res) => {
    try {
        const { leadId } = req.params;
        const { pax_codes, pnr } = req.body;

        if (!leadId || !pax_codes || !Array.isArray(pax_codes) || !pnr) {
        return res.status(400).json({
            success: false,
            message: 'Lead ID, passenger codes array, and PNR are required'
        });
        }

        // Get all passengers for this lead with the specified codes
        const placeholders = pax_codes.map(() => '?').join(',');
        const [passengers] = await pool.query(
        `SELECT id, attached_pnr FROM pax_lists WHERE lead_id = ? AND pax_code IN (${placeholders})`,
        [leadId, ...pax_codes]
        );

        if (passengers.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'No passengers found with the specified codes'
        });
        }

        let updatedCount = 0;

        // Update each passenger
        for (const passenger of passengers) {
        let updatedPnrs = [];

        if (!passenger.attached_pnr) {
            updatedPnrs = [pnr];
        } else {
            const currentPnrs = JSON.parse(passenger.attached_pnr);
            if (!currentPnrs.includes(pnr)) {
            updatedPnrs = [...currentPnrs, pnr];
            } else {
            continue; // Skip if PNR already exists
            }
        }

        await pool.query(
            'UPDATE pax_lists SET attached_pnr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(updatedPnrs), passenger.id]
        );
        updatedCount++;
        }

        res.status(200).json({
        success: true,
        message: `PNR assigned to ${updatedCount} passengers successfully`,
        updatedCount: updatedCount
        });

    } catch (error) {
        console.error('Error bulk assigning PNR:', error);
        res.status(500).json({
        success: false,
        message: 'Failed to assign PNR to passengers',
        error: error.message
        });
    }
    };


    