const express = require('express');
const router = express.Router();
const PassportOC = require('../controllers/PassportOCR');

// const router = express.Router();

// Route to scan/parse document from raw text
router.post('/scann-document', PassportOC.scanDocument);

// You can add more routes here if needed
// router.get('/documents', getDocuments);
// router.get('/document/:id', getDocumentById);


module.exports = router;