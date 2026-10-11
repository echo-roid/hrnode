const db = require('../config/db');

exports.getOperationVendorsByLeadId = async (req, res) => {
    try {
        const { lead_id } = req.params;
        const { page = 1, limit = 10, search } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = 'WHERE lead_id = ?';
        const params = [lead_id];

        if (search) {
            whereClause += ` AND (vendor_name LIKE ? OR email LIKE ? OR contact_person LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        // Use template literals for LIMIT and OFFSET
        const query = `SELECT * FROM operation_vendors ${whereClause} ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;
        
        console.log('🔍 Executing query:', query);
        console.log('📊 Query parameters:', params);

        const [vendors] = await db.execute(query, params);
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM operation_vendors ${whereClause}`;
        const [countResult] = await db.execute(countQuery, params);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: vendors,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('❌ Get operation vendors error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch operation vendors',
            error: error.message
        });
    }
};

// Create new operation vendor
exports.createOperationVendor = async (req, res) => {
    try {
        const vendorData = req.body;
        console.log('📨 Creating operation vendor with data:', vendorData);

        // Validate lead_id is provided
        if (!vendorData.lead_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'lead_id is required' 
            });
        }

        // Check if email exists for this lead (optional - you can remove this if not needed)
        const [existing] = await db.execute(
            'SELECT id FROM operation_vendors WHERE email = ? AND lead_id = ?', 
            [vendorData.email, vendorData.lead_id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already exists for this lead' 
            });
        }

        // Don't include id in INSERT - let MySQL handle it
        const query = `
            INSERT INTO operation_vendors (
                vendor_name, business_name, email, phone, contact_person, website,
                relationship_country, vendor_type, rating, address_line1, address_line2,
                state, country, zip_pin, bank_account_number,
                re_enter_bank_account_number, ifsc_code, swift_code, gst_number, 
                pan_number, vendor_category, status, lead_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            vendorData.vendor_name || '',
            vendorData.business_name || '',
            vendorData.email || '',
            vendorData.phone || '',
            vendorData.contact_person || '',
            vendorData.website || '',
            vendorData.relationship_country || '',
            vendorData.vendor_type || '',
            vendorData.rating || '',
            vendorData.address_line1 || '',
            vendorData.address_line2 || '',
            vendorData.state || '',
            vendorData.country || '',
            vendorData.zip_pin || '',
            vendorData.bank_account_number || '',
            vendorData.re_enter_bank_account_number || '',
            vendorData.ifsc_code || '',
            vendorData.swift_code || '',
            vendorData.gst_number || '',
            vendorData.pan_number || '',
            vendorData.vendor_category || '',
            'Pending',
            vendorData.lead_id
        ];

        console.log('🔢 Executing query with values count:', values.length);

        const [result] = await db.execute(query, values);

        // Get the created vendor
        const [newVendor] = await db.execute(
            'SELECT * FROM operation_vendors WHERE id = ?', 
            [result.insertId]
        );

        console.log('✅ Operation vendor created successfully with ID:', result.insertId);

        res.status(201).json({
            success: true,
            message: 'Operation vendor created successfully',
            data: newVendor[0]
        });

    } catch (error) {
        console.error('❌ Create operation vendor error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create operation vendor',
            error: error.message,
            sqlMessage: error.sqlMessage
        });
    }
};

// Optional: Get single operation vendor by ID
exports.getOperationVendorById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [vendor] = await db.execute(
            'SELECT * FROM operation_vendors WHERE id = ?', 
            [id]
        );

        if (vendor.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Operation vendor not found'
            });
        }

        res.json({
            success: true,
            data: vendor[0]
        });
    } catch (error) {
        console.error('❌ Get operation vendor error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch operation vendor',
            error: error.message
        });
    }
};

// Optional: Update operation vendor
exports.updateOperationVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const vendorData = req.body;

        // Build update query dynamically
        const allowedFields = [
            'vendor_name', 'business_name', 'email', 'phone', 'contact_person', 'website',
            'relationship_country', 'vendor_type', 'rating', 'address_line1', 'address_line2',
            'state', 'country', 'zip_pin', 'bank_account_number',
            're_enter_bank_account_number', 'ifsc_code', 'swift_code', 'gst_number',
            'pan_number', 'vendor_category', 'status', 'lead_id'
        ];

        const updates = [];
        const values = [];

        allowedFields.forEach(field => {
            if (vendorData[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(vendorData[field]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(id);

        const query = `UPDATE operation_vendors SET ${updates.join(', ')} WHERE id = ?`;
        const [result] = await db.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Operation vendor not found'
            });
        }

        // Get updated vendor
        const [updatedVendor] = await db.execute(
            'SELECT * FROM operation_vendors WHERE id = ?', 
            [id]
        );

        res.json({
            success: true,
            message: 'Operation vendor updated successfully',
            data: updatedVendor[0]
        });

    } catch (error) {
        console.error('❌ Update operation vendor error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update operation vendor',
            error: error.message
        });
    }
};

// Optional: Delete operation vendor
exports.deleteOperationVendor = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.execute(
            'DELETE FROM operation_vendors WHERE id = ?', 
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Operation vendor not found'
            });
        }

        res.json({
            success: true,
            message: 'Operation vendor deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete operation vendor error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete operation vendor',
            error: error.message
        });
    }
};