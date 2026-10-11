const express = require('express');
const router = express.Router();
const {
  createVenueSpecifications,
  getAllVenueSpecifications,
//   getVenueSpecificationById,
  deleteVenueSpecification
} = require('../controllers/venueSpecController');

// Routes
router.post('/', createVenueSpecifications);
router.get('/', getAllVenueSpecifications);
// router.get('/:id', getVenueSpecificationById);
router.delete('/:id', deleteVenueSpecification);

module.exports = router;



