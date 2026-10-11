// routes/ticketCostingRoutes.js
const express = require('express');
const router = express.Router();
const {
  getTicketCostingByLead,
  getTicketCostingById,
  createTicketCosting,
  createMultipleTicketCosting,
  updateTicketCosting,
  deleteTicketCosting,
  getTicketCostingStats,
  searchTicketCosting
} = require('../controllers/ticketCostingController');

// Get all ticket costing records for a lead with pagination
router.get('/lead/:leadId', getTicketCostingByLead);

// Get ticket costing statistics for a lead
router.get('/lead/:leadId/stats', getTicketCostingStats);

// Search ticket costing records
router.get('/lead/:leadId/search', searchTicketCosting);

// Get single ticket costing record
router.get('/:id', getTicketCostingById);

// Create new ticket costing record
router.post('/lead/:leadId', createTicketCosting);

// Create multiple ticket costing records
router.post('/lead/:leadId/bulk', createMultipleTicketCosting);

// Update ticket costing record
router.put('/:id', updateTicketCosting);

// Delete ticket costing record
router.delete('/:id', deleteTicketCosting);

module.exports = router;