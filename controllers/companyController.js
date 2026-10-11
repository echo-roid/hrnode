const db = require('../config/db');



// Generate a client code (8-character alphanumeric)
const generateClientCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

exports.getAllCompanies = async (req, res) => {
  try {
    const [companies] = await db.query(`
      SELECT * FROM companies
      ORDER BY created_at DESC
    `);
    
    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
    
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch companies'
    });
  }
};

exports.getCompany = async (req, res) => {
  try {
    const [company] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    if (company.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    res.status(200).json({
      status: 'success',
      data: { company: company[0] }
    });
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch company'
    });
  }
};

exports.createCompany = async (req, res) => {
  // Basic validation
  if (!req.body.clientName || !req.body.email) {
    return res.status(400).json({
      status: 'fail',
      message: 'Missing required fields (clientName, email)'
    });
  }

  // Additional validation based on client type
  if (req.body.clientType === 'Individual') {
    if (!req.body.contactPerson || !req.body.contactNumber) {
      return res.status(400).json({
        status: 'fail',
        message: 'For Individual clients, contactPerson and contactNumber are required'
      });
    }
  }

  const {
    clientName,
    email,
    address,
    contactPerson,
    contactNumber,
    cinNumber,
    panNumber,
    website,
    state,
    pinCode,
    relationManager,
    clientType,
    contracts,
    industryType,
    businessType,
    client_code,
    status = 'Active'
  } = req.body;

  try {
    // Generate client code if not provided
    let finalClientCode = client_code;
    if (!finalClientCode) {
      finalClientCode = generateClientCode();
    }

    const [result] = await db.query(`
      INSERT INTO companies (
        name, email, address, contact_person, contact_number, 
        cin_number, pan_number, website, state, pin_code, 
        relation_manager, client_type, contracts, 
        industry_type, business_type, client_code, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clientName, email, address || '', contactPerson || '', contactNumber || '',
      cinNumber || '', panNumber || '', website || '', state || '', pinCode || '',
      relationManager || '', clientType, contracts || '',
      industryType || '', businessType || '', finalClientCode, status
    ]);

    const [newCompany] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [result.insertId]);

    res.status(201).json({
      status: 'success',
      data: { company: newCompany[0] }
    });
  } catch (err) {
    console.error('Error creating company:', err);
    
    // Handle duplicate client code error
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        status: 'fail',
        message: 'Client code already exists. Please use a different code.'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to create company'
    });
  }
};

exports.updateCompany = async (req, res) => {
  // Basic validation
  if (!req.body.clientName || !req.body.email) {
    return res.status(400).json({
      status: 'fail',
      message: 'Missing required fields (clientName, email)'
    });
  }

  // Additional validation based on client type
  if (req.body.clientType === 'Individual') {
    if (!req.body.contactPerson || !req.body.contactNumber) {
      return res.status(400).json({
        status: 'fail',
        message: 'For Individual clients, contactPerson and contactNumber are required'
      });
    }
  }

  const {
    clientName,
    email,
    address,
    contactPerson,
    contactNumber,
    cinNumber,
    panNumber,
    website,
    state,
    pinCode,
    relationManager,
    clientType,
    contracts,
    industryType,
    businessType,
    client_code,
    status
  } = req.body;

  try {
    // For update, use the provided client code or keep existing one
    let finalClientCode = client_code;
    if (!finalClientCode) {
      // Get existing client code
      const [existingCompany] = await db.query(`
        SELECT client_code FROM companies WHERE id = ?
      `, [req.params.id]);
      
      finalClientCode = existingCompany[0]?.client_code || generateClientCode();
    }

    const [result] = await db.query(`
      UPDATE companies SET
        name = ?, email = ?, address = ?, contact_person = ?, contact_number = ?,
        cin_number = ?, pan_number = ?, website = ?, state = ?, pin_code = ?,
        relation_manager = ?, client_type = ?, contracts = ?,
        industry_type = ?, business_type = ?, client_code = ?, status = ?
      WHERE id = ?
    `, [
      clientName, email, address || '', contactPerson || '', contactNumber || '',
      cinNumber || '', panNumber || '', website || '', state || '', pinCode || '',
      relationManager || '', clientType, contracts || '',
      industryType || '', businessType || '', finalClientCode, status, req.params.id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    const [updatedCompany] = await db.query(`
      SELECT * FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    res.status(200).json({
      status: 'success',
      data: { company: updatedCompany[0] }
    });
  } catch (err) {
    console.error('Error updating company:', err);
    
    // Handle duplicate client code error
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        status: 'fail',
        message: 'Client code already exists. Please use a different code.'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to update company'
    });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const [result] = await db.query(`
      DELETE FROM companies 
      WHERE id = ?
    `, [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No company found with that ID'
      });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    console.error('Error deleting company:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete company'
    });
  }
};

// Search companies by name, email, or client code
exports.searchCompanies = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        status: 'fail',
        message: 'Search query is required'
      });
    }

    const searchPattern = `%${query}%`;
    const [companies] = await db.query(`
      SELECT * FROM companies 
      WHERE name LIKE ? OR email LIKE ? OR client_code LIKE ?
      ORDER BY created_at DESC
    `, [searchPattern, searchPattern, searchPattern]);

    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
  } catch (err) {
    console.error('Error searching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search companies'
    });
  }
};

// Search companies by name, email, or client code
exports.searchCompanies = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        status: 'fail',
        message: 'Search query is required'
      });
    }

    const searchPattern = `%${query}%`;
    const [companies] = await db.query(`
      SELECT * FROM companies 
      WHERE name LIKE ? OR email LIKE ? OR client_code LIKE ?
      ORDER BY created_at DESC
    `, [searchPattern, searchPattern, searchPattern]);

    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
  } catch (err) {
    console.error('Error searching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search companies'
    });
  }
};

exports.searchCompanies = async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({
      status: 'fail',
      message: 'Search query is required'
    });
  }

  try {
    const [companies] = await db.query(`
      SELECT * FROM companies
      WHERE name LIKE ? OR email LIKE ? OR contact_person LIKE ? 
      OR contact_number LIKE ? OR cin_number LIKE ? OR gst_number LIKE ?
      ORDER BY created_at DESC
    `, [
      `%${query}%`, `%${query}%`, `%${query}%`, 
      `%${query}%`, `%${query}%`, `%${query}%`
    ]);

    res.status(200).json({
      status: 'success',
      results: companies.length,
      data: { companies }
    });
  } catch (err) {
    console.error('Error searching companies:', err);
    res.status(500).json({
      status: 'error',
      message: 'Search failed'
    });
  }
};