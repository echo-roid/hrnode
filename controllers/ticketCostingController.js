// controllers/ticketCostingController.js
const db = require('../config/db'); // Adjust path as needed
// Get all ticket costing records for a lead
const getTicketCostingByLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    console.log('Received parameters:', { leadId, page, limit, offset });

    // Use strings for all parameters
    const countQuery = `SELECT COUNT(*) as total FROM ticket_costing WHERE lead_id = ?`;
    
    const dataQuery = `
      SELECT 
        tc.*,
        p.pnr_number as pnr_number,
        p.pnr_type as pnr_type,
        p.pax_count as pnr_pax_count,
        p.cost_per_pax as pnr_cost_per_pax
      FROM ticket_costing tc
      LEFT JOIN pnrs p ON tc.pnr = p.pnr_number
      WHERE tc.lead_id = ?
      ORDER BY tc.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countParams = [leadId.toString()];
    const dataParams = [
      leadId.toString(), 
      limit.toString(), 
      offset.toString()
    ];

    console.log('Executing with string parameters:', dataParams);

    const [countResult] = await db.execute(countQuery, countParams);
    const [ticketCostings] = await db.execute(dataQuery, dataParams);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: ticketCostings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages,
        hasNext,
        hasPrev
      }
    });
  } catch (error) {
    console.error('Error fetching ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket costing data',
      error: error.message
    });
  }
};
// Get single ticket costing record
const getTicketCostingById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        tc.*,
        p.pnr_number as pnr_number,
        p.pnr_type as pnr_type,
        p.pax_count as pnr_pax_count,
        p.cost_per_pax as pnr_cost_per_pax,
        p.base_fare as pnr_base_fare,
        p.tax_value as pnr_tax_value
      FROM ticket_costing tc
      LEFT JOIN pnrs p ON tc.pnr = p.pnr_number
      WHERE tc.id = ?
    `;

    const [ticketCostings] = await db.execute(query, [id]);

    if (ticketCostings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket costing record not found'
      });
    }

    res.json({
      success: true,
      data: ticketCostings[0]
    });
  } catch (error) {
    console.error('Error fetching ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket costing record',
      error: error.message
    });
  }
};

// Create new ticket costing record
const createTicketCosting = async (req, res) => {
  try {
    const {
      pax_code,
      passenger_name,
      status,
      flight_details,
      ticket_number,
      vendor,
      pnr,
      booking_date,
      base_fare,
      taxes,
      total_cost,
      selling_price,
      payment_status,
      notes
    } = req.body;

    const { leadId } = req.params;

    // Validate required fields
    if (!pax_code || !leadId) {
      return res.status(400).json({
        success: false,
        message: 'Pax code and lead ID are required'
      });
    }

    // Check if ticket number already exists
    if (ticket_number) {
      const [existingTickets] = await db.execute(
        'SELECT id FROM ticket_costing WHERE ticket_number = ?',
        [ticket_number]
      );

      if (existingTickets.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ticket number already exists'
        });
      }
    }

    // Calculate total cost if not provided
    const calculatedTotalCost = total_cost || (parseFloat(base_fare) || 0) + (parseFloat(taxes) || 0);

    const query = `
      INSERT INTO ticket_costing (
        lead_id, pax_code, passenger_name, status, flight_details, 
        ticket_number, vendor, pnr, booking_date, base_fare, taxes, 
        total_cost, selling_price, payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      parseInt(leadId),
      pax_code,
      passenger_name || 'N/A',
      status || 'Pending',
      flight_details || '',
      ticket_number || null,
      vendor || '',
      pnr || '',
      booking_date || null,
      parseFloat(base_fare) || 0,
      parseFloat(taxes) || 0,
      calculatedTotalCost,
      parseFloat(selling_price) || 0,
      payment_status || 'pending',
      notes || ''
    ];

    const [result] = await db.execute(query, values);

    // Fetch the created record
    const [newTicket] = await db.execute(
      'SELECT * FROM ticket_costing WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Ticket costing record created successfully',
      data: newTicket[0]
    });
  } catch (error) {
    console.error('Error creating ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket costing record',
      error: error.message
    });
  }
};

// Create multiple ticket costing records
const createMultipleTicketCosting = async (req, res) => {
  try {
    const { tickets } = req.body;
    const { leadId } = req.params;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tickets array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const ticketData of tickets) {
      try {
        const {
          pax_code,
          passenger_name,
          status,
          flight_details,
          ticket_number,
          vendor,
          pnr,
          booking_date,
          base_fare,
          taxes,
          total_cost,
          selling_price,
          payment_status,
          notes
        } = ticketData;

        // Validate required fields
        if (!pax_code) {
          errors.push(`Pax code is required for ticket ${tickets.indexOf(ticketData) + 1}`);
          continue;
        }

        // Check for duplicate ticket number
        if (ticket_number) {
          const [existingTickets] = await db.execute(
            'SELECT id FROM ticket_costing WHERE ticket_number = ?',
            [ticket_number]
          );

          if (existingTickets.length > 0) {
            errors.push(`Ticket number ${ticket_number} already exists`);
            continue;
          }
        }

        const calculatedTotalCost = total_cost || (parseFloat(base_fare) || 0) + (parseFloat(taxes) || 0);

        const query = `
          INSERT INTO ticket_costing (
            lead_id, pax_code, passenger_name, status, flight_details, 
            ticket_number, vendor, pnr, booking_date, base_fare, taxes, 
            total_cost, selling_price, payment_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          parseInt(leadId),
          pax_code,
          passenger_name || 'N/A',
          status || 'Pending',
          flight_details || '',
          ticket_number || null,
          vendor || '',
          pnr || '',
          booking_date || null,
          parseFloat(base_fare) || 0,
          parseFloat(taxes) || 0,
          calculatedTotalCost,
          parseFloat(selling_price) || 0,
          payment_status || 'pending',
          notes || ''
        ];

        const [result] = await db.execute(query, values);

        // Fetch the created record
        const [newTicket] = await db.execute(
          'SELECT * FROM ticket_costing WHERE id = ?',
          [result.insertId]
        );

        results.push(newTicket[0]);
      } catch (error) {
        errors.push(`Error creating ticket for ${ticketData.pax_code}: ${error.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${results.length} ticket costing records`,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        successful: results.length,
        failed: errors.length,
        total: tickets.length
      }
    });
  } catch (error) {
    console.error('Error creating multiple ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket costing records',
      error: error.message
    });
  }
};

// Update ticket costing record
const updateTicketCosting = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pax_code,
      passenger_name,
      status,
      flight_details,
      ticket_number,
      vendor,
      pnr,
      booking_date,
      base_fare,
      taxes,
      total_cost,
      selling_price,
      payment_status,
      notes
    } = req.body;

    // Check if record exists
    const [existingRecords] = await db.execute(
      'SELECT * FROM ticket_costing WHERE id = ?',
      [id]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket costing record not found'
      });
    }

    const existingRecord = existingRecords[0];

    // Check if ticket number already exists (excluding current record)
    if (ticket_number && ticket_number !== existingRecord.ticket_number) {
      const [existingTickets] = await db.execute(
        'SELECT id FROM ticket_costing WHERE ticket_number = ? AND id != ?',
        [ticket_number, id]
      );

      if (existingTickets.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ticket number already exists'
        });
      }
    }

    // Calculate total cost
    const calculatedTotalCost = total_cost || (parseFloat(base_fare) || existingRecord.base_fare) + (parseFloat(taxes) || existingRecord.taxes);

    const query = `
      UPDATE ticket_costing 
      SET 
        pax_code = ?,
        passenger_name = ?,
        status = ?,
        flight_details = ?,
        ticket_number = ?,
        vendor = ?,
        pnr = ?,
        booking_date = ?,
        base_fare = ?,
        taxes = ?,
        total_cost = ?,
        selling_price = ?,
        payment_status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const values = [
      pax_code || existingRecord.pax_code,
      passenger_name || existingRecord.passenger_name,
      status || existingRecord.status,
      flight_details || existingRecord.flight_details,
      ticket_number || existingRecord.ticket_number,
      vendor || existingRecord.vendor,
      pnr || existingRecord.pnr,
      booking_date || existingRecord.booking_date,
      parseFloat(base_fare) || existingRecord.base_fare,
      parseFloat(taxes) || existingRecord.taxes,
      calculatedTotalCost,
      parseFloat(selling_price) || existingRecord.selling_price,
      payment_status || existingRecord.payment_status,
      notes || existingRecord.notes,
      id
    ];

    await db.execute(query, values);

    // Fetch updated record
    const [updatedRecord] = await db.execute(
      `SELECT 
        tc.*,
        p.pnr_number as pnr_number,
        p.pnr_type as pnr_type,
        p.pax_count as pnr_pax_count,
        p.cost_per_pax as pnr_cost_per_pax
      FROM ticket_costing tc
      LEFT JOIN pnrs p ON tc.pnr = p.pnr_number
      WHERE tc.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Ticket costing record updated successfully',
      data: updatedRecord[0]
    });
  } catch (error) {
    console.error('Error updating ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket costing record',
      error: error.message
    });
  }
};

// Delete ticket costing record
const deleteTicketCosting = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if record exists
    const [existingRecords] = await db.execute(
      'SELECT id FROM ticket_costing WHERE id = ?',
      [id]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket costing record not found'
      });
    }

    await db.execute('DELETE FROM ticket_costing WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Ticket costing record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket costing record',
      error: error.message
    });
  }
};

// Get ticket costing statistics for a lead
const getTicketCostingStats = async (req, res) => {
  try {
    const { leadId } = req.params;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_tickets,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(base_fare), 0) as total_base_fare,
        COALESCE(SUM(taxes), 0) as total_taxes,
        COALESCE(SUM(selling_price), 0) as total_selling_price,
        COALESCE(AVG(total_cost), 0) as avg_ticket_cost
      FROM ticket_costing 
      WHERE lead_id = ?
    `;

    const statusQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM ticket_costing 
      WHERE lead_id = ?
      GROUP BY status
    `;

    const paymentStatusQuery = `
      SELECT 
        payment_status,
        COUNT(*) as count
      FROM ticket_costing 
      WHERE lead_id = ?
      GROUP BY payment_status
    `;

    const [[statsResult]] = await db.execute(statsQuery, [leadId]);
    const [statusResults] = await db.execute(statusQuery, [leadId]);
    const [paymentStatusResults] = await db.execute(paymentStatusQuery, [leadId]);

    res.json({
      success: true,
      data: {
        overview: statsResult,
        status_breakdown: statusResults,
        payment_breakdown: paymentStatusResults
      }
    });
  } catch (error) {
    console.error('Error fetching ticket costing stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket costing statistics',
      error: error.message
    });
  }
};

// Search ticket costing records
const searchTicketCosting = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchQuery = `
      SELECT 
        tc.*,
        p.pnr_number as pnr_number,
        p.pnr_type as pnr_type,
        p.pax_count as pnr_pax_count
      FROM ticket_costing tc
      LEFT JOIN pnrs p ON tc.pnr = p.pnr_number
      WHERE tc.lead_id = ? AND (
        tc.pax_code LIKE ? OR 
        tc.passenger_name LIKE ? OR 
        tc.ticket_number LIKE ? OR 
        tc.pnr LIKE ? OR 
        tc.vendor LIKE ? OR 
        tc.flight_details LIKE ?
      )
      ORDER BY tc.created_at DESC
      LIMIT 50
    `;

    const searchParam = `%${query}%`;
    const [results] = await db.execute(searchQuery, [
      leadId, 
      searchParam, searchParam, searchParam, 
      searchParam, searchParam, searchParam
    ]);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    console.error('Error searching ticket costing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search ticket costing records',
      error: error.message
    });
  }
};

module.exports = {
  getTicketCostingByLead,
  getTicketCostingById,
  createTicketCosting,
  createMultipleTicketCosting,
  updateTicketCosting,
  deleteTicketCosting,
  getTicketCostingStats,
  searchTicketCosting
};