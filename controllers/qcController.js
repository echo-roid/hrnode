const pool = require('../config/db');

// Approve submission by leadId
exports.approveSubmission = async (req, res) => {
    const { leadId } = req.params;
    const { notes, reviewedBy = 'QC User', fillId, formData } = req.body; // Added formData parameter

    try {
        // Log the formData parameter
        console.log('Received formData:', formData);
        console.log('Type of formData:', typeof formData);
        
        // If you want to see the full structure in detail
        if (formData) {
            console.log('formData structure:', JSON.stringify(formData, null, 2));
        }

        // Find form submission by lead_id and optionally fill_id
        let query = 'SELECT * FROM form_submissions WHERE lead_id = ?';
        const params = [leadId];

        if (fillId) {
            query += ' AND fill_id = ?';
            params.push(fillId);
        }

        query += ' ORDER BY submitted_at DESC LIMIT 1';

        const [submission] = await pool.query(query, params);

        if (submission.length === 0) {
            return res.status(404).json({
                success: false,
                message: fillId 
                    ? `Submission not found for lead ID ${leadId} and fill ID ${fillId}`
                    : `Submission not found for lead ID ${leadId}`
            });
        }

        const formSubmission = submission[0];

        // Check if QC submission already exists for this submission
        const [existingQC] = await pool.query(
            'SELECT id FROM qc_submissions WHERE submission_id = ?',
            [formSubmission.id]
        );

        // Update form_submissions table with QC status
        await pool.query(
            'UPDATE form_submissions SET qc_status = ?, qc_notes = ?, qc_date = NOW() WHERE id = ?',
            ['approved', notes, formSubmission.id]
        );

        if (existingQC.length > 0) {
            // Update existing QC submission
            await pool.query(
                `UPDATE qc_submissions 
                 SET status = ?, 
                     notes = ?, 
                     rejection_reasons = NULL, 
                     reviewed_by = ?, 
                     qc_date = NOW()
                 WHERE submission_id = ?`,
                [
                    'approved',
                    notes,
                    reviewedBy,
                    formSubmission.id
                ]
            );
        } else {
            // Insert new QC submission
            await pool.query(
                `INSERT INTO qc_submissions 
                (submission_id, form_id, lead_id, status, notes, reviewed_by, qc_date) 
                VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                    formSubmission.id,
                    formSubmission.form_id,
                    formSubmission.lead_id,
                    'approved',
                    notes,
                    reviewedBy
                ]
            );
        }

        res.json({
            success: true,
            message: 'Submission approved successfully',
            data: {
                submissionId: formSubmission.id,
                leadId: formSubmission.lead_id,
                fillId: formSubmission.fill_id,
                status: 'approved'
            }
        });

    } catch (error) {
        console.error('Error approving submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve submission',
            error: error.message
        });
    }
};

// Reject submission by leadId
exports.rejectSubmission = async (req, res) => {
    const { leadId } = req.params;
    const { notes, reviewedBy = 'QC User', rejectionReasons = [], fillId } = req.body;

    try {
        // Find form submission by lead_id and optionally fill_id
        let query = 'SELECT * FROM form_submissions WHERE lead_id = ?';
        const params = [leadId];

        if (fillId) {
            query += ' AND fill_id = ?';
            params.push(fillId);
        }

        query += ' ORDER BY submitted_at DESC LIMIT 1';

        const [submission] = await pool.query(query, params);

        if (submission.length === 0) {
            return res.status(404).json({
                success: false,
                message: fillId 
                    ? `Submission not found for lead ID ${leadId} and fill ID ${fillId}`
                    : `Submission not found for lead ID ${leadId}`
            });
        }

        const formSubmission = submission[0];

        // Check if QC submission already exists for this submission
        const [existingQC] = await pool.query(
            'SELECT id FROM qc_submissions WHERE submission_id = ?',
            [formSubmission.id]
        );

        // Update form_submissions table with QC status
        await pool.query(
            'UPDATE form_submissions SET qc_status = ?, qc_notes = ?, qc_date = NOW() WHERE id = ?',
            ['rejected', notes, formSubmission.id]
        );

        if (existingQC.length > 0) {
            // Update existing QC submission
            await pool.query(
                `UPDATE qc_submissions 
                 SET status = ?, 
                     notes = ?, 
                     rejection_reasons = ?, 
                     reviewed_by = ?, 
                     qc_date = NOW()
                 WHERE submission_id = ?`,
                [
                    'rejected',
                    notes,
                    JSON.stringify(rejectionReasons),
                    reviewedBy,
                    formSubmission.id
                ]
            );
        } else {
            // Insert new QC submission
            await pool.query(
                `INSERT INTO qc_submissions 
                (submission_id, form_id, lead_id, status, notes, rejection_reasons, reviewed_by, qc_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    formSubmission.id,
                    formSubmission.form_id,
                    formSubmission.lead_id,
                    'rejected',
                    notes,
                    JSON.stringify(rejectionReasons),
                    reviewedBy
                ]
            );
        }

        res.json({
            success: true,
            message: 'Submission rejected successfully',
            data: {
                submissionId: formSubmission.id,
                leadId: formSubmission.lead_id,
                fillId: formSubmission.fill_id,
                status: 'rejected'
            }
        });

    } catch (error) {
        console.error('Error rejecting submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject submission',
            error: error.message
        });
    }
};
// Bulk update multiple submissions
exports.bulkUpdateSubmissions = async (req, res) => {
    const { submissions, reviewedBy = 'QC User' } = req.body;

    try {
        if (!Array.isArray(submissions) || submissions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Submissions array is required'
            });
        }

        const results = {
            successful: [],
            failed: []
        };

        for (const sub of submissions) {
            try {
                const { leadId, fillId, status, notes, rejectionReasons = [] } = sub;

                // Find form submission by lead_id and optionally fill_id
                let query = 'SELECT * FROM form_submissions WHERE lead_id = ?';
                const params = [leadId];

                if (fillId) {
                    query += ' AND fill_id = ?';
                    params.push(fillId);
                }

                query += ' ORDER BY submitted_at DESC LIMIT 1';

                const [submission] = await pool.query(query, params);

                if (submission.length === 0) {
                    results.failed.push({
                        leadId,
                        fillId,
                        error: fillId 
                            ? `Submission not found for lead ID ${leadId} and fill ID ${fillId}`
                            : `Submission not found for lead ID ${leadId}`
                    });
                    continue;
                }

                const formSubmission = submission[0];

                // Update form_submissions
                await pool.query(
                    'UPDATE form_submissions SET qc_status = ?, qc_notes = ?, qc_date = NOW() WHERE id = ?',
                    [status, notes, formSubmission.id]
                );

                // Insert into qc_submissions without fill_id
                await pool.query(
                    `INSERT INTO qc_submissions 
                    (submission_id, form_id, lead_id, status, notes, rejection_reasons, reviewed_by, qc_date) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        formSubmission.id,
                        formSubmission.form_id,
                        formSubmission.lead_id,
                        status,
                        notes,
                        status === 'rejected' ? JSON.stringify(rejectionReasons) : null,
                        reviewedBy
                    ]
                );

                results.successful.push({
                    leadId,
                    fillId: formSubmission.fill_id,
                    status,
                    submissionId: formSubmission.id
                });

            } catch (error) {
                results.failed.push({
                    leadId: sub.leadId,
                    fillId: sub.fillId,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Bulk update completed. Successful: ${results.successful.length}, Failed: ${results.failed.length}`,
            data: results
        });

    } catch (error) {
        console.error('Error in bulk update:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process bulk update',
            error: error.message
        });
    }
};

// Update submission status
exports.updateSubmissionStatus = async (req, res) => {


    const { leadId } = req.params;
    const { status, notes, reviewedBy = 'QC User', rejectionReasons = [], fillId } = req.body;
  
    try {
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be: approved, rejected, or pending'
            });
        }

        // Find form submission by lead_id and optionally fill_id
        let query = 'SELECT * FROM form_submissions WHERE lead_id = ?';
        const params = [leadId];

        if (fillId) {
            query += ' AND fill_id = ?';
            params.push(fillId);
        }

        query += ' ORDER BY submitted_at DESC LIMIT 1';

        const [submission] = await pool.query(query, params);

        if (submission.length === 0) {
            return res.status(404).json({
                success: false,
                message: fillId 
                    ? `Submission not found for lead ID ${leadId} and fill ID ${fillId}`
                    : `Submission not found for lead ID ${leadId}`
            });
        }

        const formSubmission = submission[0];

        // Update form_submissions
        await pool.query(
            'UPDATE form_submissions SET qc_status = ?, qc_notes = ?, qc_date = NOW() WHERE id = ?',
            [status, notes, formSubmission.id]
        );

        // Insert into qc_submissions without fill_id
        await pool.query(
            `INSERT INTO qc_submissions 
            (submission_id, form_id, lead_id, status, notes, rejection_reasons, reviewed_by, qc_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                formSubmission.id,
                formSubmission.form_id,
                formSubmission.lead_id,
                status,
                notes,
                status === 'rejected' ? JSON.stringify(rejectionReasons) : null,
                reviewedBy
            ]
        );

        res.json({
            success: true,
            message: `Submission ${status} successfully`,
            data: {
                submissionId: formSubmission.id,
                leadId: formSubmission.lead_id,
                fillId: formSubmission.fill_id,
                status: status
            }
        });

    } catch (error) {
        console.error('Error updating submission status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update submission status',
            error: error.message
        });
    }
};

// Get submission details by leadId with fill_id support
exports.getSubmissionDetails = async (req, res) => {
    const { leadId } = req.params;
    const { fillId } = req.query; // Optional fillId parameter

    try {
        let query = `
            SELECT 
                fs.*,
                l.client_name,
                l.sales_person,
                l.client_coordinator,
                f.name as form_name
            FROM form_submissions fs
            LEFT JOIN leads l ON fs.lead_id = l.id
            LEFT JOIN forms f ON fs.form_id = f.id
            WHERE fs.lead_id = ?
        `;
        const params = [leadId];

        if (fillId) {
            query += ' AND fs.fill_id = ?';
            params.push(fillId);
        }

        query += ' ORDER BY fs.submitted_at DESC LIMIT 1';

        const [submission] = await pool.query(query, params);

        if (submission.length === 0) {
            return res.status(404).json({
                success: false,
                message: fillId 
                    ? `Submission not found for lead ID ${leadId} and fill ID ${fillId}`
                    : `Submission not found for lead ID ${leadId}`
            });
        }

        const formSubmission = submission[0];

        // Get QC history for this lead_id
        const [qcHistory] = await pool.query(
            'SELECT * FROM qc_submissions WHERE lead_id = ? ORDER BY qc_date DESC',
            [leadId]
        );

        // Parse submission data
        let parsedData = [];
        try {
            parsedData = typeof formSubmission.data === 'string' 
                ? JSON.parse(formSubmission.data) 
                : formSubmission.data;
        } catch (e) {
            console.error('Error parsing submission data:', e);
        }

        res.json({
            success: true,
            data: {
                submission: {
                    ...formSubmission,
                    data: parsedData
                },
                qcHistory
            }
        });

    } catch (error) {
        console.error('Error fetching submission details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch submission details',
            error: error.message
        });
    }
};

// Other functions remain the same...
// Get pending submissions for QC
exports.getPendingSubmissions = async (req, res) => {
    try {
        const { page = 1, limit = 50, formId, salesPerson } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                fs.*,
                l.client_name,
                l.sales_person,
                l.client_coordinator,
                f.name as form_name
            FROM form_submissions fs
            LEFT JOIN leads l ON fs.lead_id = l.id
            LEFT JOIN forms f ON fs.form_id = f.id
            WHERE fs.qc_status IS NULL OR fs.qc_status = 'pending'
        `;
        const params = [];

        if (formId) {
            query += ' AND fs.form_id = ?';
            params.push(formId);
        }

        if (salesPerson) {
            query += ' AND l.sales_person LIKE ?';
            params.push(`%${salesPerson}%`);
        }

        query += ' ORDER BY fs.submitted_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [submissions] = await pool.query(query, params);

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total 
             FROM form_submissions fs 
             LEFT JOIN leads l ON fs.lead_id = l.id 
             WHERE fs.qc_status IS NULL OR fs.qc_status = 'pending'`
        );

        res.json({
            success: true,
            data: {
                submissions,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(countResult[0].total / limit),
                    total: countResult[0].total
                }
            }
        });

    } catch (error) {
        console.error('Error fetching pending submissions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending submissions',
            error: error.message
        });
    }
};

// Get QC status for multiple leads
exports.getQCStatusForLeads = async (req, res) => {
    const { leadIds } = req.body;

    try {
        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'leadIds array is required'
            });
        }

        const [qcRecords] = await pool.query(
            `SELECT qs.*, fs.qc_status, fs.qc_notes, fs.qc_date, fs.fill_id
             FROM qc_submissions qs
             LEFT JOIN form_submissions fs ON qs.submission_id = fs.id
             WHERE qs.lead_id IN (?) 
             ORDER BY qs.qc_date DESC`,
            [leadIds]
        );

        // Create status map using lead_id as key (since we don't have fill_id in qc_submissions)
        const statusMap = {};
        qcRecords.forEach(record => {
            if (!statusMap[record.lead_id]) {
                statusMap[record.lead_id] = {
                    status: record.status || record.qc_status,
                    notes: record.notes || record.qc_notes,
                    qcDate: record.qc_date,
                    reviewedBy: record.reviewed_by,
                    fillId: record.fill_id // This comes from form_submissions join
                };
            }
        });

        res.json({
            success: true,
            data: {
                statusMap
            }
        });

    } catch (error) {
        console.error('Error fetching QC status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch QC status',
            error: error.message
        });
    }
};