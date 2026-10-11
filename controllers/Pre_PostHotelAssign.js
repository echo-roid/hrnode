// controllers/hotelAssignController.js
const pool = require('../config/db');

// Pre Hotel Assignment
exports.PreHotelAssign = async (req, res) => {
    try {
        const {
            pnr_number,
            passengers,
            lead_id,
            pax_code,
            pre_hotel_check_in,
            pre_hotel_check_out,
            pre_hotel_room_count,
            pre_hotel_room_no
        } = req.body;

        // Validate required fields
        if (!pnr_number || !pre_hotel_check_in || !pre_hotel_check_out) {
            return res.status(400).json({
                success: false,
                message: 'PNR number, pre-hotel check-in and check-out dates are required'
            });
        }

        const query = `
            INSERT INTO pnr_passenger (
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                pre_hotel_check_in,
                pre_hotel_check_out,
                pre_hotel_room_count,
                pre_hotel_room_no,
                preHotel,
                postHotel,
                hotel_assigned_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW(), NOW())
        `;

        const values = [
            pnr_number,
            passengers ? JSON.stringify(passengers) : null,
            lead_id || null,
            pax_code || null,
            pre_hotel_check_in,
            pre_hotel_check_out,
            pre_hotel_room_count || null,
            pre_hotel_room_no || null
        ];

        const [result] = await pool.execute(query, values);

        return res.status(201).json({
            success: true,
            message: 'Pre-hotel assignment created successfully',
            data: {
                id: result.insertId,
                pnr_number,
                pre_hotel_check_in,
                pre_hotel_check_out,
                pre_hotel_room_count: pre_hotel_room_count || null,
                pre_hotel_room_no: pre_hotel_room_no || null
            }
        });

    } catch (error) {
        console.error('Error in PreHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Post Hotel Assignment
exports.PostHotelAssign = async (req, res) => {
    try {
        const {
            pnr_number,
            passengers,
            lead_id,
            pax_code,
            post_hotel_check_in,
            post_hotel_check_out,
            post_hotel_room_count,
            post_hotel_room_no
        } = req.body;

        // Validate required fields
        if (!pnr_number || !post_hotel_check_in || !post_hotel_check_out) {
            return res.status(400).json({
                success: false,
                message: 'PNR number, post-hotel check-in and check-out dates are required'
            });
        }

        const query = `
            INSERT INTO pnr_passenger (
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                post_hotel_check_in,
                post_hotel_check_out,
                post_hotel_room_count,
                post_hotel_room_no,
                preHotel,
                postHotel,
                hotel_assigned_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), NOW(), NOW())
        `;

        const values = [
            pnr_number,
            passengers ? JSON.stringify(passengers) : null,
            lead_id || null,
            pax_code || null,
            post_hotel_check_in,
            post_hotel_check_out,
            post_hotel_room_count || null,
            post_hotel_room_no || null
        ];

        const [result] = await pool.execute(query, values);

        return res.status(201).json({
            success: true,
            message: 'Post-hotel assignment created successfully',
            data: {
                id: result.insertId,
                pnr_number,
                post_hotel_check_in,
                post_hotel_check_out,
                post_hotel_room_count: post_hotel_room_count || null,
                post_hotel_room_no: post_hotel_room_no || null
            }
        });

    } catch (error) {
        console.error('Error in PostHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Get Pre Hotel Assignments
exports.GetPreHotelAssignments = async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                pre_hotel_check_in,
                pre_hotel_check_out,
                pre_hotel_room_count,
                pre_hotel_room_no,
                hotel_assigned_at,
                created_at,
                updated_at
            FROM pnr_passenger 
            WHERE preHotel = 1 
            ORDER BY created_at DESC
        `;
        
        const [rows] = await pool.execute(query);
        
        // Parse JSON fields
        const assignments = rows.map(row => ({
            ...row,
            passengers: row.passengers ? JSON.parse(row.passengers) : null
        }));

        return res.status(200).json({
            success: true,
            count: assignments.length,
            data: assignments
        });

    } catch (error) {
        console.error('Error in GetPreHotelAssignments:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Get Post Hotel Assignments
exports.GetPostHotelAssignments = async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                post_hotel_check_in,
                post_hotel_check_out,
                post_hotel_room_count,
                post_hotel_room_no,
                hotel_assigned_at,
                created_at,
                updated_at
            FROM pnr_passenger 
            WHERE postHotel = 1 
            ORDER BY created_at DESC
        `;
        
        const [rows] = await pool.execute(query);
        
        // Parse JSON fields
        const assignments = rows.map(row => ({
            ...row,
            passengers: row.passengers ? JSON.parse(row.passengers) : null
        }));

        return res.status(200).json({
            success: true,
            count: assignments.length,
            data: assignments
        });

    } catch (error) {
        console.error('Error in GetPostHotelAssignments:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Get Single Pre Hotel Assignment by ID
exports.GetPreHotelAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                id,
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                pre_hotel_check_in,
                pre_hotel_check_out,
                pre_hotel_room_count,
                pre_hotel_room_no,
                hotel_assigned_at,
                created_at,
                updated_at
            FROM pnr_passenger 
            WHERE id = ? AND preHotel = 1
        `;
        
        const [rows] = await pool.execute(query, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pre-hotel assignment not found'
            });
        }

        // Parse JSON fields
        const assignment = {
            ...rows[0],
            passengers: rows[0].passengers ? JSON.parse(rows[0].passengers) : null
        };

        return res.status(200).json({
            success: true,
            data: assignment
        });

    } catch (error) {
        console.error('Error in GetPreHotelAssignmentById:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Get Single Post Hotel Assignment by ID
exports.GetPostHotelAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                id,
                pnr_number,
                passengers,
                lead_id,
                pax_code,
                post_hotel_check_in,
                post_hotel_check_out,
                post_hotel_room_count,
                post_hotel_room_no,
                hotel_assigned_at,
                created_at,
                updated_at
            FROM pnr_passenger 
            WHERE id = ? AND postHotel = 1
        `;
        
        const [rows] = await pool.execute(query, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post-hotel assignment not found'
            });
        }

        // Parse JSON fields
        const assignment = {
            ...rows[0],
            passengers: rows[0].passengers ? JSON.parse(rows[0].passengers) : null
        };

        return res.status(200).json({
            success: true,
            data: assignment
        });

    } catch (error) {
        console.error('Error in GetPostHotelAssignmentById:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Update Pre Hotel Assignment
exports.UpdatePreHotelAssign = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            pnr_number,
            passengers,
            lead_id,
            pax_code,
            pre_hotel_check_in,
            pre_hotel_check_out,
            pre_hotel_room_count,
            pre_hotel_room_no
        } = req.body;

        const query = `
            UPDATE pnr_passenger 
            SET 
                pnr_number = COALESCE(?, pnr_number),
                passengers = COALESCE(?, passengers),
                lead_id = COALESCE(?, lead_id),
                pax_code = COALESCE(?, pax_code),
                pre_hotel_check_in = COALESCE(?, pre_hotel_check_in),
                pre_hotel_check_out = COALESCE(?, pre_hotel_check_out),
                pre_hotel_room_count = COALESCE(?, pre_hotel_room_count),
                pre_hotel_room_no = COALESCE(?, pre_hotel_room_no),
                updated_at = NOW()
            WHERE id = ? AND preHotel = 1
        `;

        const values = [
            pnr_number || null,
            passengers ? JSON.stringify(passengers) : null,
            lead_id || null,
            pax_code || null,
            pre_hotel_check_in || null,
            pre_hotel_check_out || null,
            pre_hotel_room_count || null,
            pre_hotel_room_no || null,
            id
        ];

        const [result] = await pool.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pre-hotel assignment not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Pre-hotel assignment updated successfully'
        });

    } catch (error) {
        console.error('Error in UpdatePreHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Update Post Hotel Assignment
exports.UpdatePostHotelAssign = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            pnr_number,
            passengers,
            lead_id,
            pax_code,
            post_hotel_check_in,
            post_hotel_check_out,
            post_hotel_room_count,
            post_hotel_room_no
        } = req.body;

        const query = `
            UPDATE pnr_passenger 
            SET 
                pnr_number = COALESCE(?, pnr_number),
                passengers = COALESCE(?, passengers),
                lead_id = COALESCE(?, lead_id),
                pax_code = COALESCE(?, pax_code),
                post_hotel_check_in = COALESCE(?, post_hotel_check_in),
                post_hotel_check_out = COALESCE(?, post_hotel_check_out),
                post_hotel_room_count = COALESCE(?, post_hotel_room_count),
                post_hotel_room_no = COALESCE(?, post_hotel_room_no),
                updated_at = NOW()
            WHERE id = ? AND postHotel = 1
        `;

        const values = [
            pnr_number || null,
            passengers ? JSON.stringify(passengers) : null,
            lead_id || null,
            pax_code || null,
            post_hotel_check_in || null,
            post_hotel_check_out || null,
            post_hotel_room_count || null,
            post_hotel_room_no || null,
            id
        ];

        const [result] = await pool.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post-hotel assignment not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Post-hotel assignment updated successfully'
        });

    } catch (error) {
        console.error('Error in UpdatePostHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Delete Pre Hotel Assignment
exports.DeletePreHotelAssign = async (req, res) => {
    try {
        const { id } = req.params;

        const query = 'DELETE FROM pnr_passenger WHERE id = ? AND preHotel = 1';
        const [result] = await pool.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pre-hotel assignment not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Pre-hotel assignment deleted successfully'
        });

    } catch (error) {
        console.error('Error in DeletePreHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Delete Post Hotel Assignment
exports.DeletePostHotelAssign = async (req, res) => {
    try {
        const { id } = req.params;

        const query = 'DELETE FROM pnr_passenger WHERE id = ? AND postHotel = 1';
        const [result] = await pool.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post-hotel assignment not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Post-hotel assignment deleted successfully'
        });

    } catch (error) {
        console.error('Error in DeletePostHotelAssign:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};