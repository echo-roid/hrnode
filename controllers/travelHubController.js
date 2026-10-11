const pool = require('../config/db');

// Helper function to safely parse travel hub data
const parseTravelHub = (row) => {
  let submissionIds = [];
  
  // Handle submission_ids - could be JSON array or comma-separated string
  if (row.submission_ids) {
    try {
      if (typeof row.submission_ids === 'string') {
        // Try to parse as JSON first
        if (row.submission_ids.startsWith('[')) {
          const parsed = JSON.parse(row.submission_ids);
          submissionIds = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
        } else {
          // If not JSON, treat as comma-separated string
          submissionIds = row.submission_ids.split(',').filter(id => id.trim() !== '');
        }
      } else if (Array.isArray(row.submission_ids)) {
        submissionIds = row.submission_ids;
      }
    } catch (e) {
      console.warn('Failed to parse submission_ids, using empty array:', e.message);
      submissionIds = [];
    }
  }

  return {
    id: row.id,
    formId: row.form_id,
    hub: row.hub || '',
    airportCode: row.airport_code || '',
    pax: row.pax || 1,
    travelType: row.travel_type || '',
    address: row.address || '',
    distance: row.distance || '',
    submissionIds: submissionIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Get travel hub data by form ID
const getTravelHubByFormId = async (req, res) => {
  try {
    const formId = req.params.formId;
    
    const [rows] = await pool.query(`
      SELECT * FROM travel_hubs 
      WHERE form_id = ? 
      ORDER BY created_at DESC
    `, [formId]);
    
    const hubData = rows.map(parseTravelHub);
    res.json({
      success: true,
      data: hubData,
      count: hubData.length,
      formId: formId
    });
  } catch (error) {
    console.error('Error fetching travel hub data by form ID:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching travel hub data' 
    });
  }
};

// Save travel hub data
const saveTravelHubData = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { formId, hubData } = req.body;
    
    if (!formId || !Array.isArray(hubData)) {
      return res.status(400).json({
        success: false,
        message: 'Form ID and hub data array are required'
      });
    }

    console.log('Saving travel hub data for form:', formId);
    console.log('Hub data to save:', hubData);

    // Delete existing data for this form
    await connection.query(
      'DELETE FROM travel_hubs WHERE form_id = ?',
      [formId]
    );

    // Insert new data
    for (const item of hubData) {
      // Convert submissionIds array to comma-separated string
      const submissionIdsString = Array.isArray(item.submissionIds) 
        ? item.submissionIds.join(',') 
        : (item.submissionIds || '');

      const hubRecord = {
        form_id: formId,
        hub: item.hub || '',
        airport_code: item.airportCode || '',
        pax: parseInt(item.pax) || 1,
        travel_type: item.travelType || '',
        address: item.address || '',
        distance: item.distance || '',
        submission_ids: submissionIdsString
      };

      await connection.query(
        'INSERT INTO travel_hubs SET ?',
        [hubRecord]
      );
    }

    await connection.commit();

    // Fetch the saved data
    const [savedRows] = await connection.query(`
      SELECT * FROM travel_hubs 
      WHERE form_id = ? 
      ORDER BY created_at DESC
    `, [formId]);

    const savedData = savedRows.map(parseTravelHub);

    res.json({
      success: true,
      message: 'Travel hub data saved successfully',
      data: savedData,
      count: savedData.length
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error saving travel hub data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while saving travel hub data',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Delete travel hub entry
const deleteTravelHubEntry = async (req, res) => {
  try {
    const entryId = req.params.id;
    
    const [result] = await pool.query(
      'DELETE FROM travel_hubs WHERE id = ?',
      [entryId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Travel hub entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Travel hub entry deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting travel hub entry:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting travel hub entry'
    });
  }
};

module.exports = {
  getTravelHubByFormId,
  saveTravelHubData,
  deleteTravelHubEntry
};