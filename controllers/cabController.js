const db = require('../config/db');

const cabController = {
  // Helper function to create passenger assignment object
  createPassengerAssignment: (passenger) => {
    return {
      id: passenger.id || Date.now().toString(),
      name: passenger.name,
      phone: passenger.phone || '',
      email: passenger.email || '',
      pickupLocation: passenger.pickupLocation || '',
      dropLocation: passenger.dropLocation || '',
      pickupTime: passenger.pickupTime || null,
      assignedAt: new Date().toISOString()
    };
  },

getAllCabs: async (req, res) => {
  try {
    const [cabs] = await db.query('SELECT * FROM cabs ORDER BY created_at DESC');
    
    // Parse assigned_passengers JSON safely
    const processedCabs = cabs.map(cab => {
      let assignedPassengers = [];
      
      try {
        if (cab.assigned_passengers) {
          // Check if it's already an array
          if (typeof cab.assigned_passengers === 'string') {
            // Try to parse JSON
            const parsed = JSON.parse(cab.assigned_passengers);
            assignedPassengers = Array.isArray(parsed) ? parsed : [];
          } else if (Array.isArray(cab.assigned_passengers)) {
            // Already an array
            assignedPassengers = cab.assigned_passengers;
          }
        }
      } catch (parseError) {
        console.warn(`Error parsing assigned_passengers for cab ${cab.id}:`, parseError);
        assignedPassengers = [];
      }
      
      return {
        ...cab,
        ac_available: Boolean(cab.ac_available),
        assigned_passengers: assignedPassengers
      };
    });
    
    res.json({
      success: true,
      count: processedCabs.length,
      data: processedCabs
    });
  } catch (error) {
    console.error('Error fetching cabs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cabs',
      error: error.message
    });
  }
},
  // Get single cab by ID
  getCabById: async (req, res) => {
    try {
      const { id } = req.params;
      const [cabs] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      
      if (cabs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      const cab = {
        ...cabs[0],
        ac_available: Boolean(cabs[0].ac_available),
        assigned_passengers: cabs[0].assigned_passengers ? JSON.parse(cabs[0].assigned_passengers) : []
      };
      
      res.json({
        success: true,
        data: cab
      });
    } catch (error) {
      console.error('Error fetching cab:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching cab',
        error: error.message
      });
    }
  },

  // Create new cab
  createCab: async (req, res) => {
    try {
      const {
        cab_number,
        cab_type,
        capacity,
        base_location,
        ac_available,
        driver_name,
        driver_phone,
        driver_license_number,
        company_name,
        notes
      } = req.body;
        console.log(!cab_number ,cab_type ,capacity,base_location ,driver_name ,driver_phone)
      // Validate required fields
      if (!cab_number || !cab_type || !capacity || !base_location || !driver_name || !driver_phone) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }
      
      const query = `
        INSERT INTO cabs (
          cab_number, cab_type, capacity, base_location, ac_available,
          driver_name, driver_phone, driver_license_number, 
          company_name, notes, assigned_passengers
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const assignedPassengers = JSON.stringify([]); // Empty array for new cab
      
      const [result] = await db.query(query, [
        cab_number,
        cab_type,
        capacity,
        base_location,
        ac_available || false,
        driver_name,
        driver_phone,
        driver_license_number || null,
        company_name || null,
        notes || null,
        assignedPassengers
      ]);
      
      const [newCab] = await db.query('SELECT * FROM cabs WHERE id = ?', [result.insertId]);
      
      res.status(201).json({
        success: true,
        message: 'Cab created successfully',
        data: {
          ...newCab[0],
          ac_available: Boolean(newCab[0].ac_available),
          assigned_passengers: []
        }
      });
    } catch (error) {
      console.error('Error creating cab:', error);
      
      // Handle duplicate cab number
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          message: 'Cab number already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error creating cab',
        error: error.message
      });
    }
  },

  // Update cab
  updateCab: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Check if cab exists
      const [existingCab] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      if (existingCab.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      // Build update query dynamically
      const fields = [];
      const values = [];
      
      Object.keys(updateData).forEach(key => {
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          fields.push(`${key} = ?`);
          
          // Handle boolean conversion for ac_available
          if (key === 'ac_available') {
            values.push(updateData[key] ? 1 : 0);
          } else {
            values.push(updateData[key]);
          }
        }
      });
      
      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }
      
      values.push(id);
      
      const query = `UPDATE cabs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      
      await db.query(query, values);
      
      // Fetch updated cab
      const [updatedCab] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Cab updated successfully',
        data: {
          ...updatedCab[0],
          ac_available: Boolean(updatedCab[0].ac_available),
          assigned_passengers: updatedCab[0].assigned_passengers ? JSON.parse(updatedCab[0].assigned_passengers) : []
        }
      });
    } catch (error) {
      console.error('Error updating cab:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating cab',
        error: error.message
      });
    }
  },

  // Delete cab
  deleteCab: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if cab exists
      const [existingCab] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      if (existingCab.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      await db.query('DELETE FROM cabs WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Cab deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting cab:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting cab',
        error: error.message
      });
    }
  },

  // Assign passenger to cab
  assignPassenger: async (req, res) => {
    try {
      const { id } = req.params;
      const passenger = req.body;
      
      if (!passenger.name) {
        return res.status(400).json({
          success: false,
          message: 'Passenger name is required'
        });
      }
      
      // Check if cab exists
      const [cabs] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      if (cabs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      const cab = cabs[0];
      const currentPassengers = cab.assigned_passengers ? JSON.parse(cab.assigned_passengers) : [];
      
      // Check if cab has capacity
      if (currentPassengers.length >= cab.capacity) {
        return res.status(400).json({
          success: false,
          message: 'Cab has reached maximum capacity'
        });
      }
      
      // Create passenger assignment
      const passengerAssignment = cabController.createPassengerAssignment(passenger);
      
      // Add to assigned passengers
      currentPassengers.push(passengerAssignment);
      
      // Update cab
      await db.query(
        'UPDATE cabs SET assigned_passengers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(currentPassengers), id]
      );
      
      // Fetch updated cab
      const [updatedCab] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Passenger assigned successfully',
        data: {
          ...updatedCab[0],
          ac_available: Boolean(updatedCab[0].ac_available),
          assigned_passengers: JSON.parse(updatedCab[0].assigned_passengers)
        }
      });
    } catch (error) {
      console.error('Error assigning passenger:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning passenger',
        error: error.message
      });
    }
  },

  // Remove passenger from cab
  removePassenger: async (req, res) => {
    try {
      const { id } = req.params;
      const { passengerId } = req.body;
      
      if (!passengerId) {
        return res.status(400).json({
          success: false,
          message: 'Passenger ID is required'
        });
      }
      
      // Check if cab exists
      const [cabs] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      if (cabs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      const cab = cabs[0];
      let currentPassengers = cab.assigned_passengers ? JSON.parse(cab.assigned_passengers) : [];
      
      // Find and remove passenger
      const initialLength = currentPassengers.length;
      currentPassengers = currentPassengers.filter(p => p.id !== passengerId);
      
      if (currentPassengers.length === initialLength) {
        return res.status(404).json({
          success: false,
          message: 'Passenger not found in this cab'
        });
      }
      
      // Update cab
      await db.query(
        'UPDATE cabs SET assigned_passengers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(currentPassengers), id]
      );
      
      res.json({
        success: true,
        message: 'Passenger removed successfully',
        data: {
          passengerId,
          remainingPassengers: currentPassengers
        }
      });
    } catch (error) {
      console.error('Error removing passenger:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing passenger',
        error: error.message
      });
    }
  },

  // Clear all passengers from cab
  clearAllPassengers: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if cab exists
      const [cabs] = await db.query('SELECT * FROM cabs WHERE id = ?', [id]);
      if (cabs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Cab not found'
        });
      }
      
      // Clear all passengers
      await db.query(
        'UPDATE cabs SET assigned_passengers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify([]), id]
      );
      
      res.json({
        success: true,
        message: 'All passengers cleared from cab'
      });
    } catch (error) {
      console.error('Error clearing passengers:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing passengers',
        error: error.message
      });
    }
  },

getAllTransportVendorsSimple : async (req, res) => {
  try {
    const { search } = req.query;

    let query = `
      SELECT 
        id, 
        vendor_id, 
        vendor_name, 
        email, 
        phone, 
        rating, 
        address_line1,
        address_line2,
        state,
        country,
        zip_pin,
        vendor_type,
        status
      FROM vendors 
      WHERE vendor_type = ?
    `;

    const params = ["Transport"];

    if (search) {
      query += `
        AND (
          vendor_name LIKE ? 
          OR email LIKE ? 
          OR contact_person LIKE ?
        )
      `;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += " ORDER BY vendor_name ASC";

    console.log("🔍 Executing simple transport vendors query:", query);
    console.log("📊 Query parameters:", params);

    const [vendors] = await db.execute(query, params);

    console.log(`✅ Found ${vendors.length} transport vendors`);

    // Debug if empty
    if (vendors.length === 0) {
      console.log("⚠️ No transport vendors found. Checking available vendors...");
      const [allVendors] = await db.execute(
        "SELECT id, vendor_id, vendor_name, vendor_type FROM vendors ORDER BY vendor_name LIMIT 10"
      );
      console.log("📊 Available vendors:", allVendors);
    }

    res.json({
      success: true,
      data: vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error("❌ Get simple transport vendors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transport vendors",
      error: error.message,
      sqlMessage: error.sqlMessage
    });
  }
},





// assign 




// Assign cab to PNR passenger
assignCab: async (req, res) => {
  try {
    const { pnrId } = req.params;
    const { 
      cab_number, 
      assignment_type,
      passenger_details,
      transfer_details,
      cab_details
    } = req.body;
    
    // Validate required fields
    if (!cab_number || !assignment_type || !passenger_details) {
      return res.status(400).json({
        success: false,
        message: 'cab_number, assignment_type and passenger_details are required'
      });
    }
    
    // Validate passenger details
    if (!passenger_details.passenger_name || !passenger_details.passenger_id) {
      return res.status(400).json({
        success: false,
        message: 'passenger_details must include passenger_name and passenger_id'
      });
    }
    
    // Validate assignment type
    const validAssignmentTypes = [
      'transit_onward', 
      'transit_return', 
      'final_onward', 
      'final_return'
    ];
    
    if (!validAssignmentTypes.includes(assignment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment_type. Must be one of: transit_onward, transit_return, final_onward, final_return'
      });
    }
    
    // Check if PNR exists
    const [pnrCheck] = await db.query(
      'SELECT id FROM pnr_passenger WHERE id = ?',
      [pnrId]
    );
    
    if (pnrCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'PNR not found'
      });
    }
    
    // Check if cab exists
    const [cabCheck] = await db.query(
      'SELECT id, cab_number, assigned_passengers FROM cabs WHERE cab_number = ?',
      [cab_number]
    );
    
    if (cabCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cab not found'
      });
    }
    
    // Get current assigned passengers for the cab
    const cab = cabCheck[0];
    let assignedPassengers = [];
    
    try {
      if (cab.assigned_passengers) {
        // Check if it's already a string (JSON) or needs to be stringified
        if (typeof cab.assigned_passengers === 'string') {
          assignedPassengers = JSON.parse(cab.assigned_passengers);
        } else if (Array.isArray(cab.assigned_passengers)) {
          assignedPassengers = cab.assigned_passengers;
        } else if (cab.assigned_passengers && typeof cab.assigned_passengers === 'object') {
          // Handle the case where it might be [object Object]
          console.log('Found object instead of string/array, converting...');
          assignedPassengers = [cab.assigned_passengers];
        }
        
        if (!Array.isArray(assignedPassengers)) {
          assignedPassengers = [];
        }
      }
    } catch (error) {
      console.error('Error parsing assigned_passengers:', error);
      console.log('Raw assigned_passengers value:', cab.assigned_passengers);
      assignedPassengers = [];
    }
    
    // Create new passenger assignment object with complete details
    const newAssignment = {
      // Assignment info
      assignment_id: `${pnrId}-${passenger_details.passenger_id}-${assignment_type}-${Date.now()}`,
      pnr_id: pnrId,
      assignment_type: assignment_type,
      assigned_at: new Date().toISOString(),
      
      // Passenger identity
      passenger_id: passenger_details.passenger_id,
      passenger_name: passenger_details.passenger_name,
      pax_code: passenger_details.pax_code || null,
      
      // PNR and flight info
      pnr_number: passenger_details.pnr_number || null,
      flight_number: passenger_details.flight_number || null,
      transfer_type: passenger_details.transfer_type || null,
      from_airport: passenger_details.from_airport || null,
      to_airport: passenger_details.to_airport || null,
      hotel_name: passenger_details.hotel_name || null,
      
      // Timing info
      transfer_date: passenger_details.transfer_date || null,
      transfer_time: passenger_details.transfer_time || null,
      terminal: passenger_details.terminal || null,
      
      // Complete passenger data
      form_data: passenger_details.form_data || {},
      pax_status: passenger_details.pax_status || 'Pending',
      fc_code: passenger_details.fc_code || null,
      airport_code: passenger_details.airport_code || null,
      airport_name: passenger_details.airport_name || null,
      
      // Contact details
      email: passenger_details.email || '',
      phone: passenger_details.phone || '',
      alternate_phone: passenger_details.alternate_phone || '',
      official_email: passenger_details.official_email || '',
      
      // Personal details
      date_of_birth: passenger_details.date_of_birth || null,
      nationality: passenger_details.nationality || null,
      place_of_birth: passenger_details.place_of_birth || null,
      address: passenger_details.address || null,
      
      // Passport details
      passport_number: passenger_details.passport_number || null,
      passport_expiry: passenger_details.passport_expiry || null,
      
      // Meal preference
      meal_type: passenger_details.meal_type || null,
      
      // Additional metadata
      attached_pnr: passenger_details.attached_pnr || [],
      guest_data: passenger_details.guest_data || {},
      selected_fields: passenger_details.selected_fields || [],
      
      // Transfer details
      transfer_details: transfer_details || {},
      
      // Cab details at time of assignment
      cab_details: cab_details || {},
      
      // Passenger timestamps
      passenger_created_at: passenger_details.created_at || null,
      passenger_updated_at: passenger_details.updated_at || null,
      
      // Status
      status: 'active'
    };
    
    // Remove any existing assignment for this passenger and assignment type
    assignedPassengers = assignedPassengers.filter(
      p => !(p.passenger_id === passenger_details.passenger_id && 
            p.assignment_type === assignment_type)
    );
    
    // Add the new assignment
    assignedPassengers.push(newAssignment);
    
    // Update cab's assigned_passengers (remove current_status since column doesn't exist)
    const updateCabQuery = `
      UPDATE cabs 
      SET assigned_passengers = ?,
          updated_at = NOW()
      WHERE cab_number = ?
    `;
    
    await db.query(updateCabQuery, [JSON.stringify(assignedPassengers), cab_number]);
    
    // Determine which field to update in PNR based on assignment type
    let updateField;
    switch (assignment_type) {
      case 'transit_onward':
        updateField = 'transit_onward_cab_number';
        break;
      case 'transit_return':
        updateField = 'transit_return_cab_number';
        break;
      case 'final_onward':
        updateField = 'final_dest_onward_cab_number';
        break;
      case 'final_return':
        updateField = 'final_dest_return_cab_number';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid assignment_type'
        });
    }
    
    // Update the specific cab field in PNR
    const updatePnrQuery = `
      UPDATE pnr_passenger 
      SET ${updateField} = ?, 
          updated_at = NOW()
      WHERE id = ?
    `;
    
    await db.query(updatePnrQuery, [cab_number, pnrId]);
    
    // Get updated PNR data with cab info
    const [updatedPNR] = await db.query(
      `SELECT 
        p.*,
        c1.driver_name as transit_onward_driver_name,
        c1.driver_phone as transit_onward_driver_phone,
        c2.driver_name as transit_return_driver_name,
        c2.driver_phone as transit_return_driver_phone,
        c3.driver_name as final_dest_onward_driver_name,
        c3.driver_phone as final_dest_onward_driver_phone,
        c4.driver_name as final_dest_return_driver_name,
        c4.driver_phone as final_dest_return_driver_phone
      FROM pnr_passenger p
      LEFT JOIN cabs c1 ON p.transit_onward_cab_number = c1.cab_number
      LEFT JOIN cabs c2 ON p.transit_return_cab_number = c2.cab_number
      LEFT JOIN cabs c3 ON p.final_dest_onward_cab_number = c3.cab_number
      LEFT JOIN cabs c4 ON p.final_dest_return_cab_number = c4.cab_number
      WHERE p.id = ?`,
      [pnrId]
    );
    
    // Get updated cab data with assigned passengers
    const [updatedCab] = await db.query(
      'SELECT * FROM cabs WHERE cab_number = ?',
      [cab_number]
    );
    
    res.json({
      success: true,
      message: 'Cab assigned successfully',
      data: {
        pnr: updatedPNR[0],
        cab: updatedCab[0]
      }
    });
    
  } catch (error) {
    console.error('Error assigning cab:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning cab',
      error: error.message
    });
  }
},

// Remove cab assignment from PNR passenger
removeCabAssignment :async (req, res) => {
  try {
    const { pnrId } = req.params;
    const { assignment_type } = req.body;
    
    // Validate required field
    if (!assignment_type) {
      return res.status(400).json({
        success: false,
        message: 'assignment_type is required'
      });
    }
    
    // Validate assignment type
    const validAssignmentTypes = [
      'transit_onward', 
      'transit_return', 
      'final_onward', 
      'final_return'
    ];
    
    if (!validAssignmentTypes.includes(assignment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment_type. Must be one of: transit_onward, transit_return, final_onward, final_return'
      });
    }
    
    // Determine which field to clear based on assignment type
    let updateField;
    switch (assignment_type) {
      case 'transit_onward':
        updateField = 'transit_onward_cab_number';
        break;
      case 'transit_return':
        updateField = 'transit_return_cab_number';
        break;
      case 'final_onward':
        updateField = 'final_dest_onward_cab_number';
        break;
      case 'final_return':
        updateField = 'final_dest_return_cab_number';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid assignment_type'
        });
    }
    
    // Check if PNR exists
    const [pnrCheck] = await db.query(
      `SELECT id, ${updateField} FROM pnr_passenger WHERE id = ?`,
      [pnrId]
    );
    
    if (pnrCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'PNR not found'
      });
    }
    
    // Check if cab is actually assigned
    const currentCabNumber = pnrCheck[0][updateField];
    if (!currentCabNumber) {
      return res.status(400).json({
        success: false,
        message: `No cab assigned for ${assignment_type}`
      });
    }
    
    // Clear the cab assignment
    const updateQuery = `
      UPDATE pnr_passenger 
      SET ${updateField} = NULL, 
          updated_at = NOW()
      WHERE id = ?
    `;
    
    await db.query(updateQuery, [pnrId]);
    
    // Get updated PNR data
    const [updatedPNR] = await db.query(
      `SELECT 
        p.*,
        c1.driver_name as transit_onward_driver_name,
        c1.driver_phone as transit_onward_driver_phone,
        c2.driver_name as transit_return_driver_name,
        c2.driver_phone as transit_return_driver_phone,
        c3.driver_name as final_dest_onward_driver_name,
        c3.driver_phone as final_dest_onward_driver_phone,
        c4.driver_name as final_dest_return_driver_name,
        c4.driver_phone as final_dest_return_driver_phone
      FROM pnr_passenger p
      LEFT JOIN cabs c1 ON p.transit_onward_cab_number = c1.cab_number
      LEFT JOIN cabs c2 ON p.transit_return_cab_number = c2.cab_number
      LEFT JOIN cabs c3 ON p.final_dest_onward_cab_number = c3.cab_number
      LEFT JOIN cabs c4 ON p.final_dest_return_cab_number = c4.cab_number
      WHERE p.id = ?`,
      [pnrId]
    );
    
    res.json({
      success: true,
      message: 'Cab assignment removed successfully',
      data: updatedPNR[0]
    });
    
  } catch (error) {
    console.error('Error removing cab assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing cab assignment',
      error: error.message
    });
  }
},

// Get PNR with cab assignments
getPNRWithCabAssignments:async (req, res) => {
    console.log("jhsjhs")
  try {
    const { pnrId } = req.params;
    
    const [pnrData] = await db.query(
      `SELECT 
        p.*,
        c1.driver_name as transit_onward_driver_name,
        c1.driver_phone as transit_onward_driver_phone,
        c1.cab_type as transit_onward_cab_type,
        c1.capacity as transit_onward_capacity,
        c2.driver_name as transit_return_driver_name,
        c2.driver_phone as transit_return_driver_phone,
        c2.cab_type as transit_return_cab_type,
        c2.capacity as transit_return_capacity,
        c3.driver_name as final_dest_onward_driver_name,
        c3.driver_phone as final_dest_onward_driver_phone,
        c3.cab_type as final_dest_onward_cab_type,
        c3.capacity as final_dest_onward_capacity,
        c4.driver_name as final_dest_return_driver_name,
        c4.driver_phone as final_dest_return_driver_phone,
        c4.cab_type as final_dest_return_cab_type,
        c4.capacity as final_dest_return_capacity
      FROM pnr_passenger p
      LEFT JOIN cabs c1 ON p.transit_onward_cab_number = c1.cab_number
      LEFT JOIN cabs c2 ON p.transit_return_cab_number = c2.cab_number
      LEFT JOIN cabs c3 ON p.final_dest_onward_cab_number = c3.cab_number
      LEFT JOIN cabs c4 ON p.final_dest_return_cab_number = c4.cab_number
      WHERE p.id = ?`,
      [pnrId]
    );
    
    if (pnrData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'PNR not found'
      });
    }
    
    res.json({
      success: true,
      data: pnrData[0]
    });
    
  } catch (error) {
    console.error('Error fetching PNR with cab assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching PNR data',
      error: error.message
    });
  }
},

// Bulk update cab assignments
bulkUpdateCabAssignments:async (req, res) => {
    console.log("123456789")
  try {
    const { assignments } = req.body;
    
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Assignments array is required'
      });
    }
    
    const results = [];
    
    for (const assignment of assignments) {
      const { pnr_id, cab_number, assignment_type } = assignment;
      
      try {
        // Validate assignment type
        const validAssignmentTypes = [
          'transit_onward', 
          'transit_return', 
          'final_onward', 
          'final_return'
        ];
        
        if (!validAssignmentTypes.includes(assignment_type)) {
          results.push({
            pnr_id,
            success: false,
            message: `Invalid assignment_type: ${assignment_type}`
          });
          continue;
        }
        
        // Determine field to update
        let updateField;
        switch (assignment_type) {
          case 'transit_onward':
            updateField = 'transit_onward_cab_number';
            break;
          case 'transit_return':
            updateField = 'transit_return_cab_number';
            break;
          case 'final_onward':
            updateField = 'final_dest_onward_cab_number';
            break;
          case 'final_return':
            updateField = 'final_dest_return_cab_number';
            break;
        }
        
        // Update the assignment
        const updateQuery = `
          UPDATE pnr_passenger 
          SET ${updateField} = ?, 
              updated_at = NOW()
          WHERE id = ?
        `;
        
        await db.query(updateQuery, [cab_number, pnr_id]);
        
        results.push({
          pnr_id,
          success: true,
          message: `Cab ${cab_number} assigned for ${assignment_type}`
        });
        
      } catch (error) {
        results.push({
          pnr_id,
          success: false,
          message: error.message
        });
      }
    }
    
    res.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk update',
      error: error.message
    });
  }
},

};

module.exports = cabController;