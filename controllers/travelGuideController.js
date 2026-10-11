const pool = require('../config/db');

/* =========================================================================
   SINGLE ASSIGN  —  POST /api/forms/:submissionId/assign-guide
   Body: { guideId, guideName, guidePhone, guideEmail, notes, approved }
   ========================================================================= */
exports.assignGuideToSubmission = async (req, res) => {
    const { submissionId } = req.params;
    const {
        guideId = null,
        guideName,
        guidePhone = null,
        guideEmail = null,
        notes = null,
        approved = false,
        assignedBy = 'QC User'
    } = req.body;

    try {
        if (!submissionId) {
            return res.status(400).json({ success: false, message: 'submissionId is required' });
        }
        if (!guideName && !guideId) {
            return res.status(400).json({ success: false, message: 'guideName or guideId is required' });
        }

        // Verify the submission exists
        const [rows] = await pool.query(
            'SELECT id, lead_id, form_id FROM form_submissions WHERE id = ?',
            [submissionId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: `Submission ${submissionId} not found` });
        }

        const submission = rows[0];

        // ---------- Option A: columns on form_submissions ----------
        await pool.query(
            `UPDATE form_submissions
                SET travel_guide_id = ?,
                    travel_guide_name = ?,
                    travel_guide_phone = ?,
                    travel_guide_email = ?,
                    travel_guide_notes = ?,
                    travel_guide_approved = ?,
                    travel_guide_assigned_at = NOW()
              WHERE id = ?`,
            [
                guideId,
                guideName,
                guidePhone,
                guideEmail,
                notes,
                approved ? 1 : 0,
                submissionId
            ]
        );

        // ---------- Option B: separate table (uncomment if using it) ----------
        // await pool.query(
        //     `INSERT INTO travel_guide_assignments
        //         (submission_id, lead_id, form_id, guide_id, guide_name, guide_phone,
        //          guide_email, notes, approved, assigned_by, assigned_at)
        //      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        //      ON DUPLICATE KEY UPDATE
        //         guide_id = VALUES(guide_id),
        //         guide_name = VALUES(guide_name),
        //         guide_phone = VALUES(guide_phone),
        //         guide_email = VALUES(guide_email),
        //         notes = VALUES(notes),
        //         approved = VALUES(approved),
        //         assigned_by = VALUES(assigned_by),
        //         assigned_at = NOW()`,
        //     [
        //         submissionId, submission.lead_id, submission.form_id,
        //         guideId, guideName, guidePhone, guideEmail, notes,
        //         approved ? 1 : 0, assignedBy
        //     ]
        // );

        return res.json({
            success: true,
            message: `Travel guide "${guideName}" assigned successfully`,
            data: {
                submissionId: Number(submissionId),
                leadId: submission.lead_id,
                guideId,
                guideName,
                guidePhone,
                guideEmail,
                notes,
                approved: !!approved,
                assignedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error assigning travel guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to assign travel guide',
            error: error.message
        });
    }
};

/* =========================================================================
   BULK ASSIGN  —  POST /api/forms/bulk-assign-guide
   Body: { submissionIds: [], guideId, guideName, guidePhone,
           guideEmail, notes, approved }
   ========================================================================= */
exports.bulkAssignGuide = async (req, res) => {
    const {
        submissionIds,
        guideId = null,
        guideName,
        guidePhone = null,
        guideEmail = null,
        notes = null,
        approved = false,
        assignedBy = 'QC User'
    } = req.body;

    try {
        if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
            return res.status(400).json({ success: false, message: 'submissionIds array is required' });
        }
        if (!guideName && !guideId) {
            return res.status(400).json({ success: false, message: 'guideName or guideId is required' });
        }

        // Verify which submissions exist
        const [existing] = await pool.query(
            'SELECT id, lead_id, form_id FROM form_submissions WHERE id IN (?)',
            [submissionIds]
        );

        const existingIds = existing.map(e => e.id);
        const missingIds = submissionIds.filter(id => !existingIds.includes(Number(id)));

        if (existingIds.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'None of the provided submission IDs were found'
            });
        }

        // ---------- Option A: columns on form_submissions ----------
        const [result] = await pool.query(
            `UPDATE form_submissions
                SET travel_guide_id = ?,
                    travel_guide_name = ?,
                    travel_guide_phone = ?,
                    travel_guide_email = ?,
                    travel_guide_notes = ?,
                    travel_guide_approved = ?,
                    travel_guide_assigned_at = NOW()
              WHERE id IN (?)`,
            [
                guideId,
                guideName,
                guidePhone,
                guideEmail,
                notes,
                approved ? 1 : 0,
                existingIds
            ]
        );

        // ---------- Option B: separate table (uncomment if using it) ----------
        // for (const sub of existing) {
        //     await pool.query(
        //         `INSERT INTO travel_guide_assignments
        //             (submission_id, lead_id, form_id, guide_id, guide_name, guide_phone,
        //              guide_email, notes, approved, assigned_by, assigned_at)
        //          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        //          ON DUPLICATE KEY UPDATE
        //             guide_id = VALUES(guide_id),
        //             guide_name = VALUES(guide_name),
        //             guide_phone = VALUES(guide_phone),
        //             guide_email = VALUES(guide_email),
        //             notes = VALUES(notes),
        //             approved = VALUES(approved),
        //             assigned_by = VALUES(assigned_by),
        //             assigned_at = NOW()`,
        //         [
        //             sub.id, sub.lead_id, sub.form_id,
        //             guideId, guideName, guidePhone, guideEmail, notes,
        //             approved ? 1 : 0, assignedBy
        //         ]
        //     );
        // }

        return res.json({
            success: true,
            message: `Travel guide "${guideName}" assigned to ${result.affectedRows} guest(s)`,
            data: {
                updatedCount: result.affectedRows,
                updatedIds: existingIds,
                missingIds,
                guideId,
                guideName,
                guidePhone,
                guideEmail,
                notes,
                approved: !!approved,
                assignedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error bulk assigning travel guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to bulk assign travel guide',
            error: error.message
        });
    }
};

/* =========================================================================
   REMOVE ASSIGNMENT  —  DELETE /api/forms/:submissionId/assign-guide
   ========================================================================= */
exports.removeGuideFromSubmission = async (req, res) => {
    const { submissionId } = req.params;

    try {
        const [rows] = await pool.query(
            'SELECT id FROM form_submissions WHERE id = ?',
            [submissionId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }

        // Option A
        await pool.query(
            `UPDATE form_submissions
                SET travel_guide_id = NULL,
                    travel_guide_name = NULL,
                    travel_guide_phone = NULL,
                    travel_guide_email = NULL,
                    travel_guide_notes = NULL,
                    travel_guide_approved = 0,
                    travel_guide_assigned_at = NULL
              WHERE id = ?`,
            [submissionId]
        );

        // Option B
        // await pool.query('DELETE FROM travel_guide_assignments WHERE submission_id = ?', [submissionId]);

        return res.json({
            success: true,
            message: 'Travel guide assignment removed'
        });
    } catch (error) {
        console.error('Error removing travel guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to remove travel guide',
            error: error.message
        });
    }
};

/* =========================================================================
   GET ASSIGNMENTS FOR A FORM  —  GET /api/forms/:formId/travel-guides
   Returns: { [submissionId]: { guideName, approved, ... } }
   ========================================================================= */
exports.getGuideAssignmentsForForm = async (req, res) => {
    const { formId } = req.params;

    try {
        // Option A
        const [rows] = await pool.query(
            `SELECT id, lead_id, travel_guide_id, travel_guide_name,
                    travel_guide_phone, travel_guide_email, travel_guide_notes,
                    travel_guide_approved, travel_guide_assigned_at
               FROM form_submissions
              WHERE form_id = ?
                AND travel_guide_name IS NOT NULL`,
            [formId]
        );

        // Option B
        // const [rows] = await pool.query(
        //     `SELECT tga.submission_id AS id, tga.lead_id, tga.guide_id AS travel_guide_id,
        //             tga.guide_name AS travel_guide_name, tga.guide_phone AS travel_guide_phone,
        //             tga.guide_email AS travel_guide_email, tga.notes AS travel_guide_notes,
        //             tga.approved AS travel_guide_approved, tga.assigned_at AS travel_guide_assigned_at
        //        FROM travel_guide_assignments tga
        //        JOIN form_submissions fs ON fs.id = tga.submission_id
        //       WHERE fs.form_id = ?`,
        //     [formId]
        // );

        const assignments = {};
        rows.forEach(r => {
            assignments[r.id] = {
                submissionId: r.id,
                guideId: r.travel_guide_id,
                guideName: r.travel_guide_name,
                guidePhone: r.travel_guide_phone,
                guideEmail: r.travel_guide_email,
                notes: r.travel_guide_notes,
                approved: !!r.travel_guide_approved,
                assignedAt: r.travel_guide_assigned_at
            };
        });

        return res.json({ success: true, data: assignments });
    } catch (error) {
        console.error('Error fetching guide assignments:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch guide assignments',
            error: error.message
        });
    }
};

/* =========================================================================
   GET ALL ASSIGNMENTS BY GUIDE  —  GET /api/travel-guides/:guideId/guests
   Useful for "guide's guest list" view
   ========================================================================= */
exports.getGuestsByGuide = async (req, res) => {
    const { guideId } = req.params;

    try {
        const [rows] = await pool.query(
            `SELECT fs.id, fs.lead_id, fs.form_id, fs.fill_id,
                    fs.travel_guide_name, fs.travel_guide_approved,
                    fs.travel_guide_assigned_at,
                    l.client_name, l.sales_person, l.client_coordinator
               FROM form_submissions fs
               LEFT JOIN leads l ON fs.lead_id = l.id
              WHERE fs.travel_guide_id = ?
              ORDER BY fs.travel_guide_assigned_at DESC`,
            [guideId]
        );

        return res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching guests by guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch guests',
            error: error.message
        });
    }
};

/* =========================================================================
   OPTIONAL: STATS — total approved / pending per guide
   GET /api/travel-guides/stats
   ========================================================================= */
exports.getGuideStats = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT travel_guide_id,
                    travel_guide_name,
                    COUNT(*) AS total_assigned,
                    SUM(travel_guide_approved = 1) AS total_approved,
                    SUM(travel_guide_approved = 0) AS total_pending
               FROM form_submissions
              WHERE travel_guide_name IS NOT NULL
              GROUP BY travel_guide_id, travel_guide_name`
        );
        return res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching guide stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch guide stats',
            error: error.message
        });
    }
};