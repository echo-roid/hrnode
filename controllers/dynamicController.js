const db = require('../config/db'); // Your DB connection file

// ✅ Get all dynamic values
exports.getAllDynamicValues = async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM dynamic_values');
    // Parse JSON fields before sending
    const parsedResults = results.map(row => ({
      ...row,
      SelectedField: JSON.parse(row.SelectedField || "{}"),
      SelectedVerify: JSON.parse(row.SelectedVerify || "[]"),
      Duplicate: row.Duplicate === null ? null : Boolean(row.Duplicate),
    }));

    res.json({ status: 'success', data: parsedResults });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ✅ Get dynamic values by Lead ID
exports.getDynamicValuesByLeadId = async (req, res) => {
  const { leadId } = req.params;

  try {
    const [results] = await db.query(
      "SELECT * FROM dynamic_values WHERE lead_id = ?",
      [leadId]
    );

    if (results.length === 0) {
      return res.status(404).json({
        status: "fail",
        message: `❌ No dynamic values found for Lead ID ${leadId}`,
      });
    }

    // Parse JSON fields safely
    const parsedResults = results.map((row) => {
      let parsedSelectedField = {};
      let parsedSelectedVerify = {};

      try {
        parsedSelectedField = JSON.parse(row.SelectedField || "{}");
      } catch (e) {
        console.warn("⚠️ Failed to parse SelectedField JSON:", e.message);
      }

      try {
        parsedSelectedVerify = JSON.parse(row.SelectedVerify || "{}");
      } catch (e) {
        console.warn("⚠️ Failed to parse SelectedVerify JSON:", e.message);
      }

      return {
        ...row,
        SelectedField: parsedSelectedField,
        SelectedVerify: parsedSelectedVerify, // always an object with {keys, data}
        Duplicate:
          row.Duplicate === null ? null : Boolean(Number(row.Duplicate)),
      };
    });

    res.json({ status: "success", data: parsedResults });
  } catch (err) {
    console.error("❌ Error in getDynamicValuesByLeadId:", err);
    res.status(500).json({ status: "fail", message: err.message });
  }
};


// ✅ Add a new dynamic value
exports.createDynamicValue = async (req, res) => {
  const { leadId } = req.params;
  let payload = req.body; // could be object OR array

  console.log("Incoming Payload:", JSON.stringify(payload, null, 2));

  try {
    // ✅ Step 1: Check if lead exists
    const [leadCheck] = await db.query(
      "SELECT id FROM leads WHERE id = ?",
      [leadId]
    );

    if (leadCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: `❌ Lead ID ${leadId} not found.`,
      });
    }

    // ✅ Step 2: Normalize payload
    if (!Array.isArray(payload)) {
      payload = [payload]; // wrap single object into array
    }

    if (payload.length === 0) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid payload: expected non-empty object(s).",
      });
    }

    // ✅ Step 3: Insert into DB
    const insertPromises = payload.map((item) =>
      db.query(
        `INSERT INTO dynamic_values 
         (lead_id, SelectedField, SelectedVerify, Duplicate) 
         VALUES (?, ?, ?, ?)`,
        [
          leadId,
          JSON.stringify(item.SelectedField || {}),
          JSON.stringify(item.SelectedVerify || []),
          item.Duplicate ? 1 : 0, // store as 1/0 (boolean)
        ]
      )
    );

    await Promise.all(insertPromises);

    return res.status(200).json({
      success: true,
      message: `✅ Dynamic values inserted for Lead ID ${leadId}.`,
    });
  } catch (error) {
    console.error("❌ Error in createDynamicValue:", error);
    return res.status(500).json({
      success: false,
      message: "🚨 Server error while saving dynamic values.",
    });
  }
};
