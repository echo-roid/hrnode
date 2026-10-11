const express = require("express");
const router = express.Router();
const divisionController = require("../controllers/divisionController");

router.get("/", divisionController.getDivisions);
router.post("/", divisionController.addDivision);
router.get("/:parent_client_code", divisionController.getDivisionsByClientCode);

module.exports = router;
