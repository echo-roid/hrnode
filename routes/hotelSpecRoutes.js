const express = require('express');
const router = express.Router();
const {
  createHotelSpecifications,
  getAllHotelSpecifications,
  getHotelSpecificationById,
  deleteHotelSpecification
} = require('../controllers/hotelSpecController');

// Routes
router.post('/', createHotelSpecifications);
router.get('/', getAllHotelSpecifications);
router.get('/:id', getHotelSpecificationById);
router.delete('/:id', deleteHotelSpecification);

module.exports = router;