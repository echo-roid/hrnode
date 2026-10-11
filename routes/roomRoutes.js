const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  createRoomSpecifications,
  getAllRoomSpecifications,
  // getRoomSpecificationById,
  // updateRoomSpecification,
  // deleteRoomSpecification
} = require('../controllers/roomController');

const upload = multer();

router.post('/room-specifications', upload.array('images', 20), createRoomSpecifications);
router.get('/room-specifications', getAllRoomSpecifications);
// router.get('/:id', getRoomSpecificationById);
// router.put('/:id', upload.array('images', 20), updateRoomSpecification);
// router.delete('/:id', deleteRoomSpecification);

module.exports = router;