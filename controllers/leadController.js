const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ storage }).array('files');

// Helper to parse lead data
const parseLead = (row) => {
  // Handle upload_documents conversion safely
  let uploadDocuments = [];
  
  if (row.upload_documents) {
    try {
      // Try to parse as JSON
      uploadDocuments = JSON.parse(row.upload_documents);
    } catch (e) {
      // If not valid JSON, treat as string path
      uploadDocuments = [row.upload_documents];
    }
  }

  return {
    id: row.id,
    dateOfRfqReceive: row.date_of_rfq_receive ? new Date(row.date_of_rfq_receive).toISOString().split('T')[0] : '',
    clientName: row.client_name,
    clientCode: row.client_code,
    salesPerson: row.sales_person,
    clientCoordinator: row.client_coordinator,
    destination: row.destination,
    paxCount: row.pax_count,
    travelingDate: row.traveling_date,
    dayCount: row.day_count,
    nightCount: row.night_count,
    modeOfBidding: row.mode_of_bidding,
    leadType: row.lead_type,
    domesticInternational: row.domestic_international,
    rfqStatus: row.rfq_status,
    uploadDocuments: uploadDocuments,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

// Get all leads
const getLeads = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    const leads = rows.map(parseLead);
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new lead
const createLead = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(400).json({ message: 'File upload failed' });
    }

    try {
      // Extract form data
      const formData = req.body;
      
      // Get file paths
      const filePaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

      // Prepare data for database
      const leadData = {
        date_of_rfq_receive: new Date(formData.dateOfRfqReceive),
        client_name: formData.clientName,
        client_code: formData.clientCode,
        sales_person: formData.salesPerson,
        client_coordinator: formData.clientCoordinator,
        destination: formData.destination,
        pax_count: parseInt(formData.paxCount),
        traveling_date: formData.travelingDate,
        day_count: parseInt(formData.dayCount) || 0,
        night_count: parseInt(formData.nightCount) || 0,
        mode_of_bidding: formData.modeOfBidding,
        lead_type: formData.leadType,
        domestic_international: formData.domesticInternational,
        rfq_status: formData.rfqStatus,
        upload_documents: JSON.stringify(filePaths)
      };

      const [result] = await pool.query('INSERT INTO leads SET ?', [leadData]);
      
      // Fetch the new lead
      const [newLead] = await pool.query('SELECT * FROM leads WHERE id = ?', [result.insertId]);
      res.status(201).json(parseLead(newLead[0]));
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(400).json({ message: 'Error creating lead' });
    }
  });
};

// Update a lead
const updateLead = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(400).json({ message: 'File upload failed' });
    }

    try {
      const leadId = req.params.id;
      const formData = req.body;
      
      // Get existing lead data
      const [existingLead] = await pool.query('SELECT * FROM leads WHERE id = ?', [leadId]);
      
      if (existingLead.length === 0) {
        return res.status(404).json({ message: 'Lead not found' });
      }

      // Parse existing documents
      let existingDocuments = [];
      try {
        existingDocuments = JSON.parse(existingLead[0].upload_documents || '[]');
      } catch (e) {
        existingDocuments = [existingLead[0].upload_documents].filter(Boolean);
      }

      // Handle file removal
      const filesToRemove = Array.isArray(formData.filesToRemove) ? formData.filesToRemove : [formData.filesToRemove].filter(Boolean);
      const updatedDocuments = existingDocuments.filter(doc => !filesToRemove.includes(doc));

      // Add new files
      const newFilePaths = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
      const allDocuments = [...updatedDocuments, ...newFilePaths];

      // Prepare data for update
      const updateData = {
        date_of_rfq_receive: new Date(formData.dateOfRfqReceive),
        client_name: formData.clientName,
        client_code: formData.clientCode,
        sales_person: formData.salesPerson,
        client_coordinator: formData.clientCoordinator,
        destination: formData.destination,
        pax_count: parseInt(formData.paxCount),
        traveling_date: formData.travelingDate,
        day_count: parseInt(formData.dayCount) || 0,
        night_count: parseInt(formData.nightCount) || 0,
        mode_of_bidding: formData.modeOfBidding,
        lead_type: formData.leadType,
        domestic_international: formData.domesticInternational,
        rfq_status: formData.rfqStatus,
        upload_documents: JSON.stringify(allDocuments)
      };

      await pool.query('UPDATE leads SET ? WHERE id = ?', [updateData, leadId]);

      // Fetch the updated lead
      const [updatedLead] = await pool.query('SELECT * FROM leads WHERE id = ?', [leadId]);
      res.json(parseLead(updatedLead[0]));
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(400).json({ message: 'Error updating lead' });
    }
  });
};

// Delete a lead
const deleteLead = async (req, res) => {
  const leadId = req.params.id;
  const connection = await pool.getConnection(); // for transaction

  try {
    // Start transaction
    await connection.beginTransaction();

    // 1. Fetch lead for file cleanup
    const [leadRows] = await connection.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leadRows[0];

    // 2. Parse upload_documents and delete files
    let documents = [];

    if (lead.upload_documents) {
      try {
        const parsed = JSON.parse(lead.upload_documents);
        documents = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        documents = [lead.upload_documents];
      }

      // Flatten in case of nested arrays (e.g., [[file]])
      documents = documents.flat().filter(doc => typeof doc === 'string');

      documents.forEach(filePath => {
        const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        const fullPath = path.join(__dirname, '..', relativePath);

        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted file: ${fullPath}`);
          }
        } catch (fileError) {
          console.error(`Error deleting file ${fullPath}:`, fileError);
        }
      });
    }

    // 3. Delete related form_fields (child of form_steps)
    await connection.query(
      `DELETE FROM form_fields 
       WHERE step_id IN (
         SELECT id FROM form_steps 
         WHERE form_id IN (
           SELECT id FROM forms WHERE lead_id = ?
         )
       )`,
      [leadId]
    );

    // 4. Delete form_steps (child of forms)
    await connection.query(
      'DELETE FROM form_steps WHERE form_id IN (SELECT id FROM forms WHERE lead_id = ?)',
      [leadId]
    );

    // 5. Delete forms (child of leads)
    await connection.query(
      'DELETE FROM forms WHERE lead_id = ?',
      [leadId]
    );

    // 6. Delete the lead
    const [deleteResult] = await connection.query(
      'DELETE FROM leads WHERE id = ?',
      [leadId]
    );

    if (deleteResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Commit transaction
    await connection.commit();
    res.json({ message: 'Lead deleted successfully' });

  } catch (error) {
    console.error('Error deleting lead:', error);
    await connection.rollback();
    res.status(500).json({ message: 'Server error', error });
  } finally {
    connection.release();
  }
};

// Update RFQ status only
const updateRfqStatus = async (req, res) => {
  const leadId = req.params.id;
  const { rfqStatus } = req.body;

  if (!rfqStatus) {
    return res.status(400).json({ message: 'RFQ status is required' });
  }

  try {
    // Update only the rfq_status field
    const [result] = await pool.query(
      'UPDATE leads SET rfq_status = ? WHERE id = ?',
      [rfqStatus, leadId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Fetch the updated lead
    const [updatedLead] = await pool.query(
      'SELECT * FROM leads WHERE id = ?', 
      [leadId]
    );
    
    res.json(parseLead(updatedLead[0]));
  } catch (error) {
    console.error('Error updating RFQ status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get won leads
const getWonLeads = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM leads WHERE rfq_status = ? ORDER BY created_at DESC',
      ['Won']
    );
    
    const wonLeads = rows.map(parseLead);
    res.json(wonLeads);
  } catch (error) {
    console.error('Error fetching won leads:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get won lead by ID
const getWonLeadsId = async (req, res) => {
  try {
    const leadId = req.params.id;
    
    const [rows] = await pool.query(
      'SELECT * FROM leads WHERE id = ? AND rfq_status = ?',
      [leadId, 'Won']
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Won lead not found or lead is not in Won status' 
      });
    }
    
    const wonLead = parseLead(rows[0]);
    res.json(wonLead);
  } catch (error) {
    console.error('Error fetching won lead by ID:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getLeads,
  createLead,
  updateLead,
  deleteLead,
  updateRfqStatus,
  getWonLeads,
  getWonLeadsId
};