const db = require("../config/db");

// @desc    Get all divisions (optionally filter by parent_client_code)


exports.getDivisions = async (req, res) => {
  try {
    const { parent_client_code } = req.query;

    let sql = "SELECT * FROM divisions";
    const params = [];

    if (parent_client_code) {
      sql += " WHERE parent_client_code = ?";
      params.push(parent_client_code);
    }

    sql += " ORDER BY createdAt DESC";

    const [results] = await db.query(sql, params);

    res.json({ success: true, data: results });
  } catch (err) {
    console.error("❌ Error fetching divisions:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
};


// @desc    Add new division


exports.addDivision = async (req, res) => {


  try {
    const {
      parent_client_code,
      companyName,
      cin,
      gst,
      address,
      pin,
      state,
      contactPerson,
      contactNumber,
      email,
      subDivisionCode,
    } = req.body;

    if (!parent_client_code || !companyName || !contactPerson) {
      return res.status(400).json({
        success: false,
        message:
          "Parent Client Code, Company Name and Contact Person are required",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO divisions 
      (parent_client_code, companyName, cin, gst, address, pin, state, contactPerson, contactNumber, email, subDivisionCode) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        parent_client_code,
        companyName,
        cin || "",
        gst || "",
        address || "",
        pin || "",
        state || "",
        contactPerson,
        contactNumber || "",
        email || "",
        subDivisionCode || "",
      ]
    );

    res.status(201).json({
      success: true,
      id: result.insertId,
      parent_client_code,
      ...req.body,
    });
  } catch (err) {
    console.error("❌ Error inserting division:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
};


exports.getDivisionsByClientCode = async (req, res) => {
    console.log(567865)
  try {
    const { parent_client_code } = req.params;

    if (!parent_client_code) {
      return res
        .status(400)
        .json({ success: false, message: "Parent Client Code is required" });
    }

    const [results] = await db.query(
      "SELECT * FROM divisions WHERE parent_client_code = ? ORDER BY createdAt DESC",
      [parent_client_code]
    );

    res.json({ success: true, data: results });
  } catch (err) {
    console.error("❌ Error fetching divisions:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
};
