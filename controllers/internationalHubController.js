const pool = require('../config/db');

// Helper function to safely parse international hub data
const parseInternationalHub = (row) => {
  let submissionIds = [];
  try {
    submissionIds = JSON.parse(row.submission_ids || '[]');
  } catch (e) {
    console.warn('Error parsing submissionIds for row', row.id, ':', e.message);
  }

  return {
    id: row.id,
    lead_id: row.lead_id, // Include lead_id in response
    form_id: row.form_id,
    hub: row.hub,
    airportCode: row.airport_code,
    intHub: row.int_hub,
    pax: row.pax,
    travelType: row.travel_type,
    address: row.address,
    distance: row.distance,
    submissionIds: submissionIds,
    isManual: row.is_manual === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Get all international hub data
const getInternationalHubData = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM international_hubs 
      ORDER BY created_at DESC
    `);
    
    const hubData = rows.map(parseInternationalHub);
    res.json({
      success: true,
      data: hubData,
      count: hubData.length
    });
  } catch (error) {
    console.error('Error fetching international hub data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching international hub data' 
    });
  }
};

// Get international hub data by form ID
const getInternationalHubByFormId = async (req, res) => {
  try {
    const formId = req.params.formId;
    
    const [rows] = await pool.query(`
      SELECT * FROM international_hubs 
      WHERE form_id = ? 
      ORDER BY created_at DESC
    `, [formId]);
    
    const hubData = rows.map(parseInternationalHub);
    res.json({
      success: true,
      data: hubData,
      count: hubData.length,
      formId: formId
    });
  } catch (error) {
    console.error('Error fetching international hub data by form ID:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching international hub data' 
    });
  }
};

// Save international hub data (create or update)
const saveInternationalHubData = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { formId, lead_id, hubData } = req.body;
     
    if (!formId || !lead_id || !Array.isArray(hubData)) {
      return res.status(400).json({
        success: false,
        message: 'Form ID, Lead ID and hub data array are required'
      });
    }

    console.log('Saving international hub data for form:', formId, 'and lead:', lead_id);
    console.log('Hub data to save:', JSON.stringify(hubData, null, 2));

    // Check if form exists and belongs to the lead
    const [formCheck] = await connection.query(
      'SELECT id FROM forms WHERE id = ? AND lead_id = ?',
      [formId, lead_id]
    );

    if (formCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found or does not belong to the specified lead'
      });
    }

    // Delete existing data for this form and lead
    await connection.query(
      'DELETE FROM international_hubs WHERE form_id = ? AND lead_id = ?',
      [formId, lead_id]
    );

    // Insert new data
    const insertPromises = hubData.map(async (item) => {
      // Safely stringify submissionIds
      let submissionIdsJson = '[]';
      try {
        submissionIdsJson = JSON.stringify(item.submissionIds || []);
      } catch (e) {
        console.warn('Error stringifying submissionIds, using empty array:', e.message);
        submissionIdsJson = '[]';
      }

      const hubRecord = {
        lead_id: lead_id,
        form_id: formId,
        hub: item.hub || '',
        airport_code: item.airportCode || '',
        int_hub: item.intHub || '',
        pax: parseInt(item.pax) || 1,
        travel_type: item.travelType || '',
        address: item.address || '',
        distance: item.distance || '',
        submission_ids: submissionIdsJson,
        is_manual: item.isManual ? 1 : 0
      };

      console.log('Inserting record:', hubRecord);

      return connection.query(
        'INSERT INTO international_hubs SET ?',
        [hubRecord]
      );
    });

    await Promise.all(insertPromises);
    await connection.commit();

    console.log('Successfully saved international hub data for lead:', lead_id);

    // NEW: Update pax_lists form_data with int_hub where airport_code matches
    await updatePaxListsWithIntHub(connection, lead_id, formId);
    
    // Fetch the saved international hub data
    const [savedRows] = await connection.query(`
      SELECT * FROM international_hubs 
      WHERE form_id = ? AND lead_id = ? 
      ORDER BY created_at DESC
    `, [formId, lead_id]);

    const savedData = savedRows.map(parseInternationalHub);

    res.json({
      success: true,
      message: 'International hub data saved successfully and pax_lists updated',
      lead_id: lead_id,
      form_id: formId,
      data: savedData,
      count: savedData.length
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error saving international hub data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while saving international hub data',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Helper function to update pax_lists with int_hub
// Helper function to update pax_lists with int_hub
// Helper function to update pax_lists with int_hub
const updatePaxListsWithIntHub = async (connection, lead_id, formId) => {
  try {
    console.log(`Updating pax_lists for lead ${lead_id} with international hub data from form ${formId}`);
    
    // Get all international hubs for this lead and form
    const [hubs] = await connection.query(`
      SELECT airport_code, int_hub 
      FROM international_hubs 
      WHERE lead_id = ? AND form_id = ?
    `, [lead_id, formId]);
    
    console.log(`Found ${hubs.length} international hubs to match`);
    
    // Create a map of airport_code to int_hub for quick lookup
    const airportToIntHubMap = {};
    hubs.forEach(hub => {
      if (hub.airport_code && hub.int_hub) {
        airportToIntHubMap[hub.airport_code] = hub.int_hub;
      }
    });
    
    console.log('Airport to int_hub map:', airportToIntHubMap);
    
    if (Object.keys(airportToIntHubMap).length === 0) {
      console.log('No airport_code to int_hub mappings found');
      return;
    }
    
    // Get all pax for this lead
    const [paxRecords] = await connection.query(`
      SELECT id, pax_code, form_data 
      FROM pax_lists 
      WHERE lead_id = ?
    `, [lead_id]);
    
    console.log(`Found ${paxRecords.length} pax records to check`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Update each pax record if airport_code matches
    for (const pax of paxRecords) {
      try {
        let formData = {};
        
        // Parse the form_data JSON
        if (pax.form_data && typeof pax.form_data === 'string') {
          formData = JSON.parse(pax.form_data);
        } else if (pax.form_data && typeof pax.form_data === 'object') {
          formData = pax.form_data;
        }
        
        // Check if int_hub already exists in form_data
        const hasExistingIntHub = (
          (formData.data && formData.data.int_hub) || 
          formData.int_hub
        );
        
        if (hasExistingIntHub) {
          skippedCount++;
          console.log(`Skipping pax ${pax.pax_code} (ID: ${pax.id}) - already has int_hub`);
          continue; // Skip this record
        }
        
        // Check for airport_code in different possible locations
        let airportCode = null;
        
        // Check in data.airport_code (nested structure)
        if (formData.data && formData.data.airport_code) {
          airportCode = formData.data.airport_code;
        }
        // Check in root level airport_code
        else if (formData.airport_code) {
          airportCode = formData.airport_code;
        }
        
        if (airportCode && airportToIntHubMap[airportCode]) {
          const intHubValue = airportToIntHubMap[airportCode];
          
          // Add int_hub to form_data
          if (formData.data) {
            formData.data.int_hub = intHubValue;
          } else {
            formData.data = { int_hub: intHubValue };
          }
          formData.int_hub = intHubValue;
          
          // Update the database
          await connection.query(
            'UPDATE pax_lists SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(formData), pax.id]
          );
          
          updatedCount++;
          console.log(`Updated pax ${pax.pax_code} (ID: ${pax.id}) with int_hub: ${intHubValue} for airport: ${airportCode}`);
        }
      } catch (parseError) {
        console.warn(`Error processing pax ${pax.id}:`, parseError.message);
        continue; // Skip this record and continue with others
      }
    }
    
    console.log(`Update summary: ${updatedCount} updated, ${skippedCount} skipped (already had int_hub)`);
    
  } catch (error) {
    console.error('Error updating pax_lists with int_hub:', error);
    throw error; // Re-throw to be caught by the main function
  }
};

// Alternative: More comprehensive function that handles different form_data structures
const updatePaxListsWithIntHubComprehensive = async (connection, lead_id, formId) => {
  try {
    console.log(`Comprehensive update of pax_lists for lead ${lead_id}`);
    
    // Get all international hubs
    const [hubs] = await connection.query(`
      SELECT airport_code, int_hub, hub, travel_type
      FROM international_hubs 
      WHERE lead_id = ? AND form_id = ?
    `, [lead_id, formId]);
    
    const airportMap = {};
    hubs.forEach(hub => {
      if (hub.airport_code) {
        airportMap[hub.airport_code] = {
          int_hub: hub.int_hub,
          hub: hub.hub,
          travel_type: hub.travel_type
        };
      }
    });
    
    // Get pax with their current form_data
    const [paxRecords] = await connection.query(`
      SELECT id, pax_code, form_data, guest_data
      FROM pax_lists 
      WHERE lead_id = ?
    `, [lead_id]);
    
    const updatePromises = paxRecords.map(async (pax) => {
      try {
        let formData = {};
        let shouldUpdate = false;
        
        // Parse form_data
        if (pax.form_data) {
          if (typeof pax.form_data === 'string') {
            formData = JSON.parse(pax.form_data);
          } else if (typeof pax.form_data === 'object') {
            formData = pax.form_data;
          }
        }
        
        // Try to find airport_code in various possible locations
        let airportCode = null;
        const possibleKeys = ['airport_code', 'airportCode', 'airport', 'departure_airport', 'arrival_airport'];
        
        // Check in data object first
        if (formData.data) {
          for (const key of possibleKeys) {
            if (formData.data[key]) {
              airportCode = formData.data[key];
              break;
            }
          }
        }
        
        // Check in root level
        if (!airportCode) {
          for (const key of possibleKeys) {
            if (formData[key]) {
              airportCode = formData[key];
              break;
            }
          }
        }
        
        // Check guest_data as fallback
        if (!airportCode && pax.guest_data) {
          let guestData = {};
          try {
            if (typeof pax.guest_data === 'string') {
              guestData = JSON.parse(pax.guest_data);
            } else if (typeof pax.guest_data === 'object') {
              guestData = pax.guest_data;
            }
            
            for (const key of possibleKeys) {
              if (guestData[key]) {
                airportCode = guestData[key];
                break;
              }
            }
          } catch (e) {
            console.warn(`Error parsing guest_data for pax ${pax.id}:`, e.message);
          }
        }
        
        // If we found an airport code and it exists in our map
        if (airportCode && airportMap[airportCode]) {
          const hubInfo = airportMap[airportCode];
          
          // Add international hub info to form_data
          if (!formData.data) {
            formData.data = {};
          }
          
          formData.data.int_hub = hubInfo.int_hub;
          formData.data.domestic_hub = hubInfo.hub;
          formData.data.travel_type = hubInfo.travel_type;
          
          // Also add to root level for backward compatibility
          formData.int_hub = hubInfo.int_hub;
          formData.domestic_hub = hubInfo.hub;
          formData.travel_type = hubInfo.travel_type;
          
          shouldUpdate = true;
        }
        
        if (shouldUpdate) {
          await connection.query(
            'UPDATE pax_lists SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(formData), pax.id]
          );
          return true;
        }
        
        return false;
      } catch (error) {
        console.warn(`Error updating pax ${pax.id}:`, error.message);
        return false;
      }
    });
    
    const results = await Promise.all(updatePromises);
    const updatedCount = results.filter(result => result === true).length;
    
    console.log(`Comprehensive update: Updated ${updatedCount} pax records with hub information`);
    
  } catch (error) {
    console.error('Error in comprehensive pax update:', error);
    throw error;
  }
};

// Helper function to parse international hub data


// Get all international hubs for a specific lead
const getInternationalHubsByLeadId = async (req, res) => {
  try {
    const { leadId } = req.params;
    
    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    // Simple query - no JOIN needed since all data is in international_hubs
    const [hubs] = await pool.query(`
      SELECT *
      FROM international_hubs
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [leadId]);

    const parsedHubs = hubs.map(parseInternationalHub);

    res.json({
      success: true,
      message: `Found ${parsedHubs.length} international hubs for lead ${leadId}`,
      lead_id: leadId,
      count: parsedHubs.length,
      data: parsedHubs
    });

  } catch (error) {
    console.error('Error fetching international hubs by lead ID:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching international hubs',
      error: error.message
    });
  }
};
// Delete international hub entry
const deleteInternationalHubEntry = async (req, res) => {
  try {
    const entryId = req.params.id;
    
    const [result] = await pool.query(
      'DELETE FROM international_hubs WHERE id = ?',
      [entryId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'International hub entry not found'
      });
    }

    res.json({
      success: true,
      message: 'International hub entry deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting international hub entry:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting international hub entry'
    });
  }
};

const updateInternationalHubValue = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { 
      lead_id, 
      previous_int_hub, 
      updated_int_hub,
      pax_code // Optional: if provided, only update this specific passenger
    } = req.body;
    
    // Validate required parameters
    if (!lead_id || !previous_int_hub || !updated_int_hub) {
      return res.status(400).json({
        success: false,
        message: 'lead_id, previous_int_hub, and updated_int_hub are required'
      });
    }
    
    console.log('=== STARTING INT HUB UPDATE ===');
    console.log('Request parameters:', {
      lead_id,
      previous_int_hub,
      updated_int_hub,
      pax_code: pax_code || 'ALL (bulk update)'
    });
    
    // STEP 1: Get current international_hubs data
    const [allHubsDebug] = await connection.query(`
      SELECT id, int_hub, pax, airport_code, form_id, created_at 
      FROM international_hubs 
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [lead_id]);
    
    console.log('=== CURRENT INTERNATIONAL_HUBS TABLE ===');
    if (allHubsDebug.length === 0) {
      console.log('Table is EMPTY! No records found.');
    } else {
      console.table(allHubsDebug.map(h => ({
        id: h.id,
        int_hub: h.int_hub,
        pax: h.pax,
        airport_code: h.airport_code,
        form_id: h.form_id
      })));
    }
    
    // STEP 2: If pax_code is provided, validate it exists
    let specificPassenger = null;
    if (pax_code) {
      const [paxRows] = await connection.query(
        'SELECT id, pax_code, form_data FROM pax_lists WHERE lead_id = ? AND pax_code = ?',
        [lead_id, pax_code]
      );
      
      if (paxRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Passenger with pax_code "${pax_code}" not found`
        });
      }
      
      specificPassenger = paxRows[0];
      console.log(`Specific passenger found: ${pax_code} (ID: ${specificPassenger.id})`);
    }
    
    // STEP 3: Find the relevant international_hubs record
    let [existingHubRows] = await connection.query(`
      SELECT * FROM international_hubs 
      WHERE lead_id = ? 
        AND int_hub = ?
      ORDER BY created_at DESC
    `, [lead_id, previous_int_hub]);
    
    console.log(`Exact match found: ${existingHubRows.length} records with int_hub "${previous_int_hub}"`);
    
    // If no exact match, try case-insensitive
    if (existingHubRows.length === 0) {
      [existingHubRows] = await connection.query(`
        SELECT * FROM international_hubs 
        WHERE lead_id = ? 
          AND LOWER(int_hub) = LOWER(?)
        ORDER BY created_at DESC
      `, [lead_id, previous_int_hub]);
      
      console.log(`Case-insensitive match found: ${existingHubRows.length} records`);
    }
    
    // If no records found, return error
    if (existingHubRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No records found with int_hub "${previous_int_hub}"`
      });
    }
    
    // STEP 4: Process the records
    console.log('\n=== PROCESSING RECORDS ===');
    let totalPaxMoved = 0;
    const updatedRecords = [];
    
    // Helper function to safely prepare submission_ids for database
    const prepareSubmissionIds = (submissionIds) => {
      if (!submissionIds) return '[]';
      
      if (Array.isArray(submissionIds)) {
        return JSON.stringify(submissionIds);
      }
      
      if (typeof submissionIds === 'string') {
        // Check if it's already valid JSON
        try {
          JSON.parse(submissionIds);
          return submissionIds;
        } catch (e) {
          // If it's a comma-separated string like "32, 29, 26"
          const idsArray = submissionIds.split(',').map(id => id.trim()).filter(id => id !== '');
          return JSON.stringify(idsArray);
        }
      }
      
      return '[]';
    };
    
    // If specific passenger is requested, we need to handle differently
    if (pax_code && specificPassenger) {
      console.log(`Processing single passenger: ${pax_code}`);
      
      // For single passenger update, we need to check if the specific passenger
      // actually has the previous_int_hub value
      let passengerHasHub = false;
      try {
        let formData = {};
        if (specificPassenger.form_data) {
          formData = typeof specificPassenger.form_data === 'string' 
            ? JSON.parse(specificPassenger.form_data) 
            : specificPassenger.form_data;
        }
        
        // Check all possible locations for int_hub
        const locations = [
          formData.int_hub,
          formData['INT HUB'],
          formData.data?.int_hub,
          formData.data?.['INT HUB'],
          formData.data?.data?.int_hub,
          formData.data?.data?.['INT HUB']
        ].filter(val => val !== undefined && val !== null && val !== '');
        
        // Check if passenger has the previous_int_hub
        for (const location of locations) {
          if (location.toString().toLowerCase() === previous_int_hub.toLowerCase()) {
            passengerHasHub = true;
            break;
          }
        }
      } catch (error) {
        console.warn(`Error checking passenger data: ${error.message}`);
      }
      
      if (!passengerHasHub) {
        return res.status(400).json({
          success: false,
          message: `Passenger ${pax_code} does not have int_hub "${previous_int_hub}"`
        });
      }
      
      // Find the hub record (should be exactly one for this case)
      const existingHub = existingHubRows[0];
      
      if (existingHub.pax > 1) {
        // Decrement existing record and create new one
        const newPaxCount = existingHub.pax - 1;
        console.log(`Decrementing hub ID ${existingHub.id} from ${existingHub.pax} to ${newPaxCount} pax`);
        
        await connection.query(
          'UPDATE international_hubs SET pax = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPaxCount, existingHub.id]
        );
        
        // Create new record for the updated int_hub
        const newHubRecord = {
          lead_id: existingHub.lead_id,
          form_id: existingHub.form_id,
          hub: existingHub.hub || '',
          airport_code: existingHub.airport_code || '',
          int_hub: updated_int_hub,
          pax: 1,
          travel_type: existingHub.travel_type || '',
          address: existingHub.address || '',
          distance: existingHub.distance || '',
          submission_ids: prepareSubmissionIds(existingHub.submission_ids), // FIXED: Use helper function
          is_manual: 1
        };
        
        const [insertResult] = await connection.query(
          'INSERT INTO international_hubs SET ?',
          [newHubRecord]
        );
        
        console.log(`Created new hub record ID ${insertResult.insertId} for "${updated_int_hub}"`);
        
        updatedRecords.push({
          old_record_id: existingHub.id,
          new_record_id: insertResult.insertId,
          action: 'decremented_and_created',
          old_pax: existingHub.pax,
          new_pax: newPaxCount
        });
        
        totalPaxMoved = 1;
      } else if (existingHub.pax === 1) {
        // Simply update the existing record
        console.log(`Updating hub ID ${existingHub.id} from "${existingHub.int_hub}" to "${updated_int_hub}"`);
        
        await connection.query(
          'UPDATE international_hubs SET int_hub = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [updated_int_hub, existingHub.id]
        );
        
        updatedRecords.push({
          record_id: existingHub.id,
          action: 'updated',
          old_int_hub: existingHub.int_hub,
          new_int_hub: updated_int_hub
        });
        
        totalPaxMoved = 1;
      }
      
    } else {
      // BULK UPDATE: Process all records (original logic)
      for (const existingHub of existingHubRows) {
        console.log(`Record ID ${existingHub.id}: int_hub="${existingHub.int_hub}", pax=${existingHub.pax}`);
        
        if (existingHub.pax > 1) {
          const newPaxCount = existingHub.pax - 1;
          console.log(`  Will decrement to ${newPaxCount} pax`);
          
          await connection.query(
            'UPDATE international_hubs SET pax = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newPaxCount, existingHub.id]
          );
          
          const newHubRecord = {
            lead_id: existingHub.lead_id,
            form_id: existingHub.form_id,
            hub: existingHub.hub || '',
            airport_code: existingHub.airport_code || '',
            int_hub: updated_int_hub,
            pax: 1,
            travel_type: existingHub.travel_type || '',
            address: existingHub.address || '',
            distance: existingHub.distance || '',
            submission_ids: prepareSubmissionIds(existingHub.submission_ids), // FIXED: Use helper function
            is_manual: 1
          };
          
          const [insertResult] = await connection.query(
            'INSERT INTO international_hubs SET ?',
            [newHubRecord]
          );
          
          console.log(`  Created new record ID ${insertResult.insertId} with int_hub="${updated_int_hub}"`);
          
          updatedRecords.push({
            old_record_id: existingHub.id,
            new_record_id: insertResult.insertId,
            action: 'decremented_and_created',
            old_pax: existingHub.pax,
            new_pax: newPaxCount
          });
          
          totalPaxMoved += 1;
        } else if (existingHub.pax === 1) {
          console.log(`  Will update int_hub from "${existingHub.int_hub}" to "${updated_int_hub}"`);
          
          await connection.query(
            'UPDATE international_hubs SET int_hub = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [updated_int_hub, existingHub.id]
          );
          
          updatedRecords.push({
            record_id: existingHub.id,
            action: 'updated',
            old_int_hub: existingHub.int_hub,
            new_int_hub: updated_int_hub
          });
          
          totalPaxMoved += 1;
        } else {
          console.log(`  Skipping - pax count is ${existingHub.pax}`);
        }
      }
    }
    
    // STEP 5: Update passengers
    console.log('\n=== UPDATING PASSENGERS ===');
    let paxUpdatedCount = 0;
    const updateExamples = [];
    
    // Build query based on whether we're updating a specific passenger or all
    let passengerQuery = 'SELECT id, pax_code, form_data FROM pax_lists WHERE lead_id = ?';
    let queryParams = [lead_id];
    
    if (pax_code) {
      passengerQuery += ' AND pax_code = ?';
      queryParams.push(pax_code);
    }
    
    const [passengersToUpdate] = await connection.query(passengerQuery, queryParams);
    
    console.log(`Found ${passengersToUpdate.length} passenger(s) to check`);
    
    for (const pax of passengersToUpdate) {
      try {
        let formData = {};
        let shouldUpdate = false;
        
        if (pax.form_data) {
          formData = typeof pax.form_data === 'string' 
            ? JSON.parse(pax.form_data) 
            : pax.form_data;
        }
        
        // Check all possible locations for int_hub
        const locations = [
          formData.int_hub,
          formData['INT HUB'],
          formData.data?.int_hub,
          formData.data?.['INT HUB'],
          formData.data?.data?.int_hub,
          formData.data?.data?.['INT HUB']
        ].filter(val => val !== undefined && val !== null && val !== '');
        
        // Check if any location matches previous_int_hub
        for (const location of locations) {
          if (location.toString().toLowerCase() === previous_int_hub.toLowerCase()) {
            shouldUpdate = true;
            
            // Update all locations
            if (formData.int_hub === location) formData.int_hub = updated_int_hub;
            if (formData['INT HUB'] === location) formData['INT HUB'] = updated_int_hub;
            if (formData.data?.int_hub === location) formData.data.int_hub = updated_int_hub;
            if (formData.data?.['INT HUB'] === location) formData.data['INT HUB'] = updated_int_hub;
            if (formData.data?.data?.int_hub === location) formData.data.data.int_hub = updated_int_hub;
            if (formData.data?.data?.['INT HUB'] === location) formData.data.data['INT HUB'] = updated_int_hub;
            
            updateExamples.push({
              pax_code: pax.pax_code,
              from: location,
              to: updated_int_hub
            });
            
            break;
          }
        }
        
        if (shouldUpdate) {
          await connection.query(
            'UPDATE pax_lists SET form_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(formData), pax.id]
          );
          
          paxUpdatedCount++;
        }
        
      } catch (error) {
        console.warn(`Error with passenger ${pax.pax_code}:`, error.message);
      }
    }
    
    await connection.commit();
    
    // STEP 6: Verify changes
    const [finalHubs] = await connection.query(`
      SELECT * FROM international_hubs 
      WHERE lead_id = ?
      ORDER BY created_at DESC
    `, [lead_id]);
    
    console.log('\n=== FINAL VERIFICATION ===');
    console.log('International hubs after update:');
    console.table(finalHubs.map(h => ({ id: h.id, int_hub: h.int_hub, pax: h.pax })));
    
    console.log(`\nSummary:
      - Total pax moved: ${totalPaxMoved}
      - Passengers updated: ${paxUpdatedCount}
      - Update type: ${pax_code ? 'Single passenger' : 'Bulk update'}
      - Example updates:`, updateExamples);
    
    // Format response - make sure to include the parseInternationalHub function
    const parseInternationalHub = (hub) => {
      return {
        id: hub.id,
        lead_id: hub.lead_id,
        form_id: hub.form_id,
        hub: hub.hub,
        airportCode: hub.airport_code,
        intHub: hub.int_hub,
        pax: hub.pax,
        travelType: hub.travel_type,
        address: hub.address,
        distance: hub.distance,
        submissionIds: hub.submission_ids ? 
          (typeof hub.submission_ids === 'string' ? JSON.parse(hub.submission_ids) : hub.submission_ids) : [],
        isManual: hub.is_manual === 1,
        createdAt: hub.created_at,
        updatedAt: hub.updated_at
      };
    };
    
    const hubData = finalHubs.map(parseInternationalHub);
    
    res.json({
      success: true,
      message: pax_code 
        ? `Updated passenger ${pax_code} from "${previous_int_hub}" to "${updated_int_hub}"`
        : `Updated ${totalPaxMoved} pax from "${previous_int_hub}" to "${updated_int_hub}"`,
      summary: {
        lead_id: parseInt(lead_id),
        previous_int_hub,
        updated_int_hub,
        pax_code: pax_code || null,
        total_pax_moved: totalPaxMoved,
        pax_lists_updated: paxUpdatedCount,
        records_processed: existingHubRows.length,
        update_type: pax_code ? 'single_passenger' : 'bulk'
      },
      updated_records: updatedRecords,
      example_updates: updateExamples.slice(0, 5),
      international_hubs: hubData,
      verification: {
        before_count: existingHubRows.length,
        after_count: finalHubs.length,
        before_pax_total: existingHubRows.reduce((sum, h) => sum + h.pax, 0),
        after_pax_total: finalHubs.reduce((sum, h) => sum + h.pax, 0)
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('FATAL ERROR in updateInternationalHubValue:', error);
    console.error('Full error details:', {
      code: error.code,
      errno: error.errno,
      sql: error.sql,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({
      success: false,
      message: 'Server error while updating international hub',
      error: error.message,
      sqlError: process.env.NODE_ENV === 'development' ? error.sql : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getInternationalHubData,
  getInternationalHubByFormId,
  saveInternationalHubData,
  deleteInternationalHubEntry,
  getInternationalHubsByLeadId,
  updateInternationalHubValue,
};