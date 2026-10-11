const pool = require('../config/db');
const crypto = require('crypto');
// You'll need to create this

exports.createForm = async (req, res) => {
    const { lead_id, name, steps, elementStyles, rules } = req.body;
    
    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [lead_id]
        );
        
        if (!leadCheck || leadCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found' 
            });
        }

        // Start transaction
        await pool.query('START TRANSACTION');

        // Create form
        const [formResult] = await pool.query(
            'INSERT INTO forms (lead_id, name) VALUES (?, ?)',
            [lead_id, name]
        );
        
        const formId = formResult.insertId;
        const shareId = crypto.randomBytes(8).toString('hex');

        // Update form with share ID
        await pool.query(
            'UPDATE forms SET share_id = ? WHERE id = ?',
            [shareId, formId]
        );

        // Save form steps and elements
        for (const [stepIndex, step] of steps.entries()) {
            const [stepResult] = await pool.query(
                'INSERT INTO form_steps (form_id, name, sort_order) VALUES (?, ?, ?)',
                [formId, step.name, stepIndex]
            );
            const stepId = stepResult.insertId;

            for (const [elementIndex, element] of step.elements.entries()) {
                const elementStyle = elementStyles[element.id] || {};
                const elementRules = rules.filter(rule => 
                    rule.actions.some(action => action.target === element.id) ||
                    rule.conditions.some(cond => cond.field === element.id)
                );

                // FIX: Handle all element types consistently
                // Create config object by cloning element and removing id
                const { id, ...config } = element;

                await pool.query(
                    `INSERT INTO form_fields 
                    (form_id, step_id, field_id, type, config, styles, rules, sort_order) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        formId,
                        stepId,
                        element.id,       // Original element ID for reference
                        element.type,
                        JSON.stringify(config), // All element data except ID
                        JSON.stringify(elementStyle),
                        JSON.stringify(elementRules),
                        elementIndex
                    ]
                );
            }
        }

        // Commit transaction
        await pool.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Form created successfully',
            formId: formId,
            shareId: shareId,
            formUrl: `http://localhost:3000/SharedFormView/${shareId}`
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error creating form:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create form',
            error: error.message
        });
    }
};
// Get forms by lead_id
exports.getFormsByLead = async (req, res) => {
    const leadId = req.params.leadId;
    
    try {
        // Verify lead exists - MySQL uses ? instead of $1
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );
        
        if (leadCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found' 
            });
        }

        // Get forms with submission counts - use ? placeholder
        const [formsResult] = await pool.query(
            `SELECT f.id, f.name, f.share_id, f.created_at, 
                COUNT(s.id) AS submission_count
             FROM forms f
             LEFT JOIN form_submissions s ON f.id = s.form_id
             WHERE f.lead_id = ?
             GROUP BY f.id
             ORDER BY f.created_at DESC`,
            [leadId]
        );
        
        // Get field counts - use ? placeholder
        const formsWithDetails = await Promise.all(
            formsResult.map(async form => {
                const [fieldsResult] = await pool.query(
                    'SELECT COUNT(*) AS field_count FROM form_fields WHERE form_id = ?',
                    [form.id]
                );
                return {
                    ...form,
                    field_count: fieldsResult[0].field_count
                };
            })
        );
        
        res.status(200).json({
            success: true,
            forms: formsWithDetails
        });
    } catch (error) {
        console.error('Error fetching forms:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch forms',
            error: error.message  // Include error message for debugging
        });
    }
};  
// Get form by share ID

exports.getSharedForm = async (req, res) => {
    const shareId = req.params.shareId;
    
    try {
        // Get form basic info
        const [formResult] = await pool.query(
            'SELECT * FROM forms WHERE share_id = ?',
            [shareId]
        );
        
        if (formResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Form not found' 
            });
        }
        const form = formResult[0];

        // Get lead details
        const [leadResult] = await pool.query(
            'SELECT client_name, sales_person FROM leads WHERE id = ?',
            [form.lead_id]
        );
        const lead = leadResult[0] || {};

        // Get form steps with their fields
        const [stepsResult] = await pool.query(
            `SELECT id, name, sort_order 
             FROM form_steps 
             WHERE form_id = ? 
             ORDER BY sort_order`,
            [form.id]
        );

        // Get all fields for the form
        const [fieldsResult] = await pool.query(
            `SELECT field_id, type, config, styles, step_id, sort_order, rules
             FROM form_fields 
             WHERE form_id = ? 
             ORDER BY step_id, sort_order`,
            [form.id]
        );

        // Enhanced JSON parsing with validation
        const safeJsonParse = (str, fallback = null) => {
            if (typeof str === 'object' || Array.isArray(str)) {
                return str;
            }
            
            if (!str || typeof str !== 'string' || str.trim() === '') {
                return fallback;
            }
            
            try {
                return JSON.parse(str);
            } catch (e) {
                console.warn(`JSON parse error for value: "${str}"`, e.message);
                return fallback;
            }
        };

        // Organize fields by step
        const steps = stepsResult.map(step => {
            const stepFields = fieldsResult
                .filter(field => field.step_id === step.id)
                .map(field => ({
                    id: field.field_id,
                    type: field.type,
                    config: safeJsonParse(field.config, {}),
                    styles: safeJsonParse(field.styles, {}),
                    step_id: field.step_id,
                    sort_order: field.sort_order,
                    rules: safeJsonParse(field.rules, [])
                }));

            return {
                id: step.id,
                name: step.name,
                sort_order: step.sort_order,
                elements: stepFields
            };
        });

        // Build element styles object
        const elementStyles = fieldsResult.reduce((acc, field) => {
            const styles = safeJsonParse(field.styles, {});
            if (styles && typeof styles === 'object') {
                acc[field.field_id] = styles;
            }
            return acc;
        }, {});

        // Build rules array
        const rules = fieldsResult.reduce((acc, field) => {
            const fieldRules = safeJsonParse(field.rules, []);
            if (Array.isArray(fieldRules)) {
                return [...acc, ...fieldRules];
            }
            return acc;
        }, []);

        // Updated response with lead_id
        res.status(200).json({
            success: true,
            form: {
                id: form.id,
                name: form.name,
                share_id: form.share_id,
                lead_id: form.lead_id,  // ADDED HERE
                lead: {
                    client: lead.client || '',
                    sales_person: lead.sales_person || ''
                },
                steps: steps,
                elementStyles: elementStyles,
                rules: rules
            }
        });
    } catch (error) {
        console.error('Error fetching form:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch form',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
// Submit form response
exports.submitFormResponse = async (req, res) => {
  const { shareId, lead_id, responses } = req.body;

  try {
    // 1️⃣ Fetch dynamic template for this lead_id
    const [dynamicRows] = await pool.query(
      'SELECT * FROM dynamic_values WHERE lead_id = ?',
      [lead_id]
    );

    if (dynamicRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dynamic template not found for this lead'
      });
    }

    const [formResult] = await pool.query(
      'SELECT id FROM forms WHERE share_id = ?',
      [shareId]
    );

    if (formResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    const formId = formResult[0]?.id;

    const dynamicData = JSON.parse(dynamicRows[0]?.SelectedField);
    const duplicateAllowed = dynamicRows[0]?.Duplicate; // 0 or 1

    // 2️⃣ Map responses array to object by label for easier matching
    const responseMap = {};
    responses.forEach((resp) => {
      if (resp.label) {
        responseMap[resp.label.trim()] = resp.value;
      }
    });

    console.log('Response Map:', responseMap);
    console.log('Form Fc Code:', responseMap['Fc Code']);
    console.log('Dynamic selectone keys:', dynamicData.selectone);

    // ✅ Step: Verify against SelectedVerify
    const selectedVerify = dynamicRows[0]?.SelectedVerify ? JSON.parse(dynamicRows[0]?.SelectedVerify) : null;

    if (selectedVerify && selectedVerify.keys && selectedVerify.data) {
      for (const key of selectedVerify.keys) {
        const value = responseMap[key];
        if (!selectedVerify.data[key] || !selectedVerify.data[key].includes(Number(value))) {
          return res.status(400).json({
            success: false,
            message: `${key} value ${value} is not authorized`
          });
        }
      }
    }

    // 3️⃣ Find the Fc Code from the form response
    const formFcCode = responseMap['Fc Code'];
    if (!formFcCode) {
      return res.status(400).json({
        success: false,
        message: 'Form must include Fc Code field'
      });
    }

    // 4️⃣ Loop through numberofPax groups to find matching record
    let matchFound = false;
    let updatedFieldObj = null;
    
    dynamicData.numberofPax.forEach((paxGroup) => {
      paxGroup.selectField.forEach((fieldObj) => {
        // Check if Fc Code matches
        const guestFcCode = fieldObj['Fc Code'];
        
        if (String(guestFcCode) === String(formFcCode)) {
          console.log('FOUND MATCHING FC CODE:', guestFcCode);
          console.log('Current formfill:', fieldObj.formfill || 0);
          
          matchFound = true;
          updatedFieldObj = fieldObj;
          
          // Update formfill based on duplicateAllowed setting
          if (duplicateAllowed) {
            // Increment formfill every time
            fieldObj.formfill = (fieldObj.formfill || 0) + 1;
            console.log(`Incremented formfill to: ${fieldObj.formfill} (duplicateAllowed = true)`);
          } else {
            // Only set to 1 if it's 0 or undefined
            if (!fieldObj.formfill || fieldObj.formfill === 0) {
              fieldObj.formfill = 1;
              console.log(`Set formfill to: 1 (duplicateAllowed = false)`);
            } else {
              console.log(`Formfill already set to: ${fieldObj.formfill}, not incrementing (duplicateAllowed = false)`);
            }
          }
        }
      });
    });

    if (!matchFound) {
      console.log('NO MATCHING FC CODE FOUND in guest list');
      console.log('Looking for:', formFcCode);
      
      // Debug: List all Fc Codes in dynamicData
      const allFcCodes = [];
      dynamicData.numberofPax.forEach((paxGroup) => {
        paxGroup.selectField.forEach((fieldObj) => {
          allFcCodes.push(fieldObj['Fc Code']);
        });
      });
      console.log('Available Fc Codes in guest list:', allFcCodes);
      
      return res.status(400).json({
        success: false,
        message: `No guest found with Fc Code: ${formFcCode}`,
        availableFcCodes: allFcCodes
      });
    }

    // 5️⃣ Update dynamic_values table
    await pool.query(
      'UPDATE dynamic_values SET SelectedField = ? WHERE id = ?',
      [JSON.stringify(dynamicData), dynamicRows[0].id]
    );

    // 6️⃣ ALSO UPDATE THE GUEST_LISTS TABLE
    const [guestListRows] = await pool.query(
      'SELECT * FROM guest_lists WHERE lead_id = ?',
      [lead_id]
    );

    if (guestListRows.length > 0) {
      let guestData = guestListRows[0].guest_data;
      
      // Parse if it's a string
      if (typeof guestData === 'string') {
        guestData = JSON.parse(guestData);
      }
      
      if (Array.isArray(guestData)) {
        let updatedCount = 0;
        
        const updatedGuestData = guestData.map(guest => {
          if (String(guest['Fc Code']) === String(formFcCode)) {
            updatedCount++;
            // Get the updated formfill from dynamicData
            const updatedFormfill = updatedFieldObj?.formfill || guest.formfill || 0;
            console.log(`Updating guest list: Fc Code ${formFcCode} formfill from ${guest.formfill || 0} to ${updatedFormfill}`);
            
            return {
              ...guest,
              formfill: updatedFormfill
            };
          }
          return guest;
        });
        
        if (updatedCount > 0) {
          // Update guest_lists table
          await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE lead_id = ?',
            [JSON.stringify(updatedGuestData), lead_id]
          );
          console.log(`Updated ${updatedCount} record(s) in guest_lists table`);
        } else {
          console.log('No matching record found in guest_lists table');
        }
      }
    }

    // 7️⃣ Save the form submission
    await pool.query(
      'INSERT INTO form_submissions (form_id, lead_id, data) VALUES (?, ?, ?)',
      [formId, lead_id, JSON.stringify(responses)]
    );

    res.status(201).json({
      success: true,
      message: 'Form submitted and formfill updated successfully',
      matchFound: matchFound,
      updatedFormfill: updatedFieldObj?.formfill || 0,
      duplicateAllowed: duplicateAllowed
    });
  } catch (error) {
    console.error('Error submitting form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit form',
      error: error.message
    });
  }
};
// Submit form response
// Submit form response
// exports.submitFormResponse = async (req, res) => {
//   const { shareId, lead_id, responses } = req.body;

//   try {
//     // 1️⃣ Fetch dynamic template for this lead_id
//     const [dynamicRows] = await pool.query(
//       'SELECT * FROM dynamic_values WHERE lead_id = ?',
//       [lead_id]
//     );
    
//     const [formResult] = await pool.query(
//       'SELECT id FROM forms WHERE share_id = ?',
//       [shareId]
//     );

//     const formId = formResult[0]?.id;

//     if (!formId) {
//       return res.status(404).json({
//         success: false,
//         message: 'Form not found'
//       });
//     }

//     let dynamicData = null;
//     let dynamicRow = null;
//     let duplicateAllowed = false;
//     let hasDynamicTemplate = false;

//     if (dynamicRows.length > 0) {
//       hasDynamicTemplate = true;
//       dynamicRow = dynamicRows[0];
//       dynamicData = JSON.parse(dynamicRow?.SelectedField || '{}');
//       duplicateAllowed = dynamicRow?.Duplicate === 1;
      
//       // 2️⃣ Map responses array to object by label for easier matching
//       const responseMap = {};
//       responses.forEach((resp) => {
//         if (resp.label) {
//           responseMap[resp.label.trim()] = resp.value;
//         }
//       });

//       // ✅ Step: Verify against SelectedVerify - FIXED
//       const selectedVerify = dynamicRow?.SelectedVerify ? JSON.parse(dynamicRow.SelectedVerify) : null;
      
//       if (selectedVerify && selectedVerify.keys && selectedVerify.data) {
//         for (const key of selectedVerify.keys) {
//           const cleanKey = key.trim();
//           const value = responseMap[cleanKey];
          
//           // Check if the key exists in responses
//           if (value === undefined) {
//             return res.status(400).json({
//               success: false,
//               message: `${cleanKey} is required for verification`
//             });
//           }
          
//           // Check if value is in allowed values array
//           const allowedValues = selectedVerify.data[cleanKey];
//           if (!allowedValues || !allowedValues.includes(Number(value))) {
//             return res.status(400).json({
//               success: false,
//               message: `${cleanKey} value "${value}" is not authorized. Allowed values: ${allowedValues ? allowedValues.join(', ') : 'none'}`
//             });
//           }
//         }
//       }

//       // 3️⃣ Check for existing submissions if duplicate is NOT allowed
//       if (!duplicateAllowed && dynamicData.numberofPax) {
//         // Check if this combination already exists
//         const shouldIncrement = dynamicData.numberofPax.some((paxGroup) => {
//           return paxGroup.selectField.some((fieldObj) => {
//             return dynamicData.selectone.every((key) => {
//               const cleanKey = key.trim();
              
//               // Special rule: Skip "Number OF Pax Allowed"
//               if (cleanKey.toLowerCase() === "number of pax allowed") {
//                 return true;
//               }
              
//               const respValue = responseMap[cleanKey];
//               const fieldValue = fieldObj[cleanKey];
              
//               // Skip if response is object or undefined
//               if (respValue === undefined || typeof respValue === "object") {
//                 return true;
//               }
              
//               return String(fieldValue) === String(respValue);
//             }) && fieldObj.formfill && fieldObj.formfill > 0;
//           });
//         });
        
//         if (shouldIncrement) {
//           return res.status(400).json({
//             success: false,
//             message: 'Duplicate submission not allowed for this combination'
//           });
//         }
//       }

//       // 4️⃣ Update formfill counts if dynamic data exists
//       if (dynamicData.numberofPax) {
//         let updated = false;
        
//         dynamicData.numberofPax.forEach((paxGroup) => {
//           paxGroup.selectField.forEach((fieldObj) => {
//             const isMatch = dynamicData.selectone.every((key) => {
//               const cleanKey = key.trim();
              
//               // Special rule: Skip "Number OF Pax Allowed"
//               if (cleanKey.toLowerCase() === "number of pax allowed") {
//                 return true;
//               }
              
//               const respValue = responseMap[cleanKey];
//               const fieldValue = fieldObj[cleanKey];
              
//               // Skip if response is object or undefined
//               if (respValue === undefined || typeof respValue === "object") {
//                 return true;
//               }
              
//               return String(fieldValue) === String(respValue);
//             });
            
//             if (isMatch) {
//               updated = true;
//               if (duplicateAllowed) {
//                 fieldObj.formfill = (fieldObj.formfill || 0) + 1;
//               } else {
//                 if (!fieldObj.formfill || fieldObj.formfill === 0) {
//                   fieldObj.formfill = 1;
//                 } else {
//                   // This should not happen due to earlier check, but just in case
//                   return res.status(400).json({
//                     success: false,
//                     message: 'Cannot update already filled form'
//                   });
//                 }
//               }
//             }
//           });
//         });
        
//         // Only return error if there's dynamic data but no match
//         if (!updated && dynamicData.numberofPax.length > 0) {
//           return res.status(400).json({
//             success: false,
//             message: 'No matching template found for the provided responses'
//           });
//         }

//         // 5️⃣ Update dynamic_values table
//         await pool.query(
//           'UPDATE dynamic_values SET SelectedField = ? WHERE id = ?',
//           [JSON.stringify(dynamicData), dynamicRow.id]
//         );
//       }
//     }

//     // Generate unique fill ID for this submission
//     const fillId = crypto.randomBytes(12).toString('hex');

//     // 6️⃣ Save the form submission with unique fill ID
//     await pool.query(
//       `INSERT INTO form_submissions 
//       (form_id, lead_id, fill_id, data) 
//       VALUES (?, ?, ?, ?)`,
//       [formId, lead_id, fillId, JSON.stringify(responses)]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Form submitted successfully',
//       fillId: fillId,
//       timestamp: new Date().toISOString(),
//       hasDynamicTemplate: hasDynamicTemplate,
//       dynamicTemplateProcessed: hasDynamicTemplate && dynamicData,
//       duplicateAllowed: duplicateAllowed
//     });
//   } catch (error) {
//     console.error('Error submitting form:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to submit form',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };


exports.deleteForm = async (req, res) => {
  const { formId } = req.params;

  try {
    if (!formId) {
      return res.status(400).json({
        success: false,
        message: "Form ID is required",
      });
    }

    // Check if form exists
    const [formCheck] = await pool.query("SELECT id FROM forms WHERE id = ?", [formId]);
    if (formCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Form not found",
      });
    }

    // Start transaction
    await pool.query("START TRANSACTION");

    // 1️⃣ Delete related fields
    await pool.query("DELETE FROM form_fields WHERE form_id = ?", [formId]);

    // 2️⃣ Delete related steps
    await pool.query("DELETE FROM form_steps WHERE form_id = ?", [formId]);

    // 3️⃣ (Optional) Delete related rules if you store them separately
    // await pool.query("DELETE FROM form_rules WHERE form_id = ?", [formId]);

    // 4️⃣ Delete the form itself
    await pool.query("DELETE FROM forms WHERE id = ?", [formId]);

    // Commit transaction
    await pool.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Form deleted successfully",
      formId,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error deleting form:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete form",
      error: error.message,
    });
  }
};




// Get form submissions
exports.getFormSubmissions = async (req, res) => {
    const formId = req.params.formId;
  
    try {
        // Step 1: Check if the form exists
        const [formCheck] = await pool.query(
            'SELECT id FROM forms WHERE id = ?',
            [formId]
        );

        if (formCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Form not found'
            });
        }

        // Step 2: Get submissions with lead details and QC information
        const [submissions] = await pool.query(
            `SELECT 
                s.id,
                s.form_id,
                s.lead_id,
                s.fill_id,
                s.data,
                s.submitted_at,
                s.qc_status as submission_qc_status,
                s.qc_notes as submission_qc_notes,
                s.qc_date,
                l.client_name,
                l.sales_person,
                l.client_coordinator,
                COALESCE(qs.reviewed_by, 'Not reviewed') as reviewed_by,
                qs.status as qc_review_status,
                qs.rejection_reasons,
                qs.created_at as qc_review_date
             FROM form_submissions s
             LEFT JOIN leads l ON s.lead_id = l.id
             LEFT JOIN qc_submissions qs ON s.id = qs.submission_id
             WHERE s.form_id = ?
             ORDER BY s.submitted_at DESC`,
            [formId]
        );

        // Step 3: Safely parse the JSON fields
        const parsedSubmissions = submissions.map(submission => {
            try {
                const parsedData = typeof submission.data === 'string'
                    ? JSON.parse(submission.data)
                    : submission.data;

                const parsedRejectionReasons = submission.rejection_reasons && typeof submission.rejection_reasons === 'string'
                    ? JSON.parse(submission.rejection_reasons)
                    : (submission.rejection_reasons || []);

                // Determine final QC status - prioritize qc_submissions status if available
                let finalQcStatus;
                let finalQcNotes = submission.submission_qc_notes || '';
                
                // Priority: qc_submissions status > form_submissions qc_status
                if (submission.qc_review_status) {
                    // Use the status from qc_submissions table
                    finalQcStatus = submission.qc_review_status;
                } else if (submission.submission_qc_status) {
                    // Fall back to form_submissions qc_status
                    finalQcStatus = submission.submission_qc_status;
                } else {
                    // Default to pending if no status exists
                    finalQcStatus = 'pending';
                }

                return {
                    ...submission,
                    data: parsedData,
                    rejection_reasons: parsedRejectionReasons,
                    qc_status: finalQcStatus,
                    qc_notes: finalQcNotes,
                    // Add these fields for frontend compatibility
                    status: finalQcStatus, // Alias for frontend
                    notes: finalQcNotes,   // Alias for frontend
                    // Keep original statuses for debugging
                    original_submission_status: submission.submission_qc_status,
                    original_qc_review_status: submission.qc_review_status
                };
            } catch (e) {
                console.error('Error parsing submission data:', e);
                return {
                    ...submission,
                    data: null,
                    rejection_reasons: [],
                    qc_status: submission.qc_review_status || submission.submission_qc_status || 'pending',
                    qc_notes: submission.submission_qc_notes || '',
                    status: submission.qc_review_status || submission.submission_qc_status || 'pending',
                    notes: submission.submission_qc_notes || '',
                    parseError: true
                };
            }
        });

        // Step 4: Calculate QC statistics
        const qcStats = {
            total: parsedSubmissions.length,
            approved: parsedSubmissions.filter(s => s.qc_status === 'approved').length,
            rejected: parsedSubmissions.filter(s => s.qc_status === 'rejected').length,
            pending: parsedSubmissions.filter(s => s.qc_status === 'pending').length,
            reviewed: parsedSubmissions.filter(s => s.reviewed_by !== 'Not reviewed').length
        };

        // Step 5: Return the submissions with QC info
        res.status(200).json({
            success: true,
            submissions: parsedSubmissions,
            qcStats: qcStats,
            message: `Found ${parsedSubmissions.length} submissions with QC status`
        });

    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch submissions',
            error: error.message
        });
    }
};




// ✅ Safe JSON parse function

// Get lead forms with submissions
exports.getLeadFormsWithSubmissions = async (req, res) => {
    const leadId = req.params.leadId;

    // Validate leadId parameter
    if (!leadId || isNaN(leadId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid lead ID'
        });
    }

    try {
        // First verify the lead exists
        const [leadResult] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        // Now get forms associated with this lead
        const [formsResult] = await pool.query(
            'SELECT * FROM forms WHERE lead_id = ? ORDER BY created_at DESC',
            [leadId]
        );

        // Get form details with submissions
        const formsWithSubmissions = await Promise.all(
            formsResult.map(async form => {
                const [submissions] = await pool.query(
                    'SELECT COUNT(*) as count FROM form_submissions WHERE form_id = ?',
                    [form.id]
                );
                return {
                    ...form,
                    submission_count: parseInt(submissions[0].count)
                };
            })
        );

        res.status(200).json({
            success: true,
            forms: formsWithSubmissions
        });
    } catch (error) {
        console.error('Error fetching lead forms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch lead forms'
        });
    }
};

exports.updateForm = async (req, res) => {
  const { formId } = req.params;
  const { name, steps, elementStyles, rules } = req.body;

  try {
    // Validate input
    if (!formId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: formId or name',
      });
    }

    if (!Array.isArray(steps)) {
      return res.status(400).json({
        success: false,
        message: '"steps" must be an array.',
      });
    }

    // Check if form exists
    const [formCheck] = await pool.query('SELECT id FROM forms WHERE id = ?', [formId]);
    if (!formCheck || formCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found',
      });
    }

    // Start transaction
    await pool.query('START TRANSACTION');

    // 1. Update form name and timestamp
    await pool.query('UPDATE forms SET name = ?, updated_at = NOW() WHERE id = ?', [name, formId]);

    // 2. Delete existing steps and fields (to fully replace)
    await pool.query('DELETE FROM form_fields WHERE form_id = ?', [formId]);
    await pool.query('DELETE FROM form_steps WHERE form_id = ?', [formId]);

    // 3. Reinsert updated steps and elements
    for (const [stepIndex, step] of steps.entries()) {
      const [stepResult] = await pool.query(
        'INSERT INTO form_steps (form_id, name, sort_order) VALUES (?, ?, ?)',
        [formId, step.name, stepIndex]
      );
      const stepId = stepResult.insertId;

      // Handle elements for each step
      for (const [elementIndex, element] of step.elements.entries()) {
        const elementStyle = elementStyles[element.id] || {};
        const elementRules = rules.filter(
          (rule) =>
            rule.actions.some((action) => action.target === element.id) ||
            rule.conditions.some((cond) => cond.field === element.id)
        );

        // Separate id from config
        const { id, ...config } = element;

        await pool.query(
          `INSERT INTO form_fields 
           (form_id, step_id, field_id, type, config, styles, rules, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            formId,
            stepId,
            element.id,
            element.type,
            JSON.stringify(config),
            JSON.stringify(elementStyle),
            JSON.stringify(elementRules),
            elementIndex,
          ]
        );
      }
    }

    // Commit transaction
    await pool.query('COMMIT');

    // Fetch updated form with steps and fields
    const [updatedForm] = await pool.query('SELECT * FROM forms WHERE id = ?', [formId]);
    const [formSteps] = await pool.query(
      'SELECT * FROM form_steps WHERE form_id = ? ORDER BY sort_order',
      [formId]
    );

    const [formFields] = await pool.query(
      'SELECT * FROM form_fields WHERE form_id = ? ORDER BY sort_order',
      [formId]
    );

    // Merge steps and fields
    const stepsWithFields = formSteps.map((step) => ({
      ...step,
      elements: formFields
        .filter((f) => f.step_id === step.id)
        .map((f) => ({
          ...f,
          config: typeof f.config === 'string' ? JSON.parse(f.config) : f.config,
          styles: typeof f.styles === 'string' ? JSON.parse(f.styles) : f.styles,
          rules: typeof f.rules === 'string' ? JSON.parse(f.rules) : f.rules,
        })),
    }));

    res.status(200).json({
      success: true,
      message: 'Form updated successfully',
      form: {
        ...updatedForm[0],
        steps: stepsWithFields,
      },
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating form:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form',
      error: error.message,
    });
  }
};


exports.cloneForm = async (req, res) => {
  const { formId } = req.params;

  try {
    await pool.query("START TRANSACTION");

    // 1. Get form to clone
    const [formResult] = await pool.query("SELECT * FROM forms WHERE id = ?", [formId]);
    if (formResult.length === 0) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    const formToClone = formResult[0];
    const newShareId = crypto.randomBytes(8).toString("hex");

    // 2. Create cloned form
    const [newFormResult] = await pool.query(
      "INSERT INTO forms (lead_id, name, share_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
      [formToClone.lead_id, formToClone.name + " (Copy)", newShareId]
    );

    const newFormId = newFormResult.insertId;

    // 3. Clone steps first
    const [stepsResult] = await pool.query("SELECT * FROM form_steps WHERE form_id = ?", [formId]);
    const stepIdMap = {}; // oldStepId -> newStepId

    for (const step of stepsResult) {
      const [newStep] = await pool.query(
        "INSERT INTO form_steps (form_id, name, sort_order) VALUES (?, ?, ?)",
        [newFormId, step.name, step.sort_order]
      );
      stepIdMap[step.id] = newStep.insertId;
    }

    // 4. Clone fields with step_id remapping
    const [fieldsResult] = await pool.query("SELECT * FROM form_fields WHERE form_id = ?", [formId]);

    for (const field of fieldsResult) {
      await pool.query(
        `INSERT INTO form_fields 
         (form_id, step_id, field_id, type, config, styles, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newFormId,
          stepIdMap[field.step_id] || null, // remap to new step id
          field.field_id,
          field.type,
          typeof field.config === "string" ? field.config : JSON.stringify(field.config),
          typeof field.styles === "string" ? field.styles : JSON.stringify(field.styles),
          field.sort_order || 0,
        ]
      );
    }

    // 5. Commit transaction
    await pool.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Form cloned successfully",
      newFormId,
      shareId: newShareId,
      formUrl: `http://localhost:3000/SharedFormView/${newShareId}`,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Error cloning form:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clone form",
      error: error.message,
    });
  }
};




exports.getSubmissionById = async (req, res) => {
    const submissionId = req.params.id; // Get submission ID from URL params

    try {
        // 1. Fetch the specific submission by ID
        const [submission] = await pool.query(
            `SELECT 
                id,
                form_id,
                lead_id,
                data,
                submitted_at
             FROM form_submissions 
             WHERE id = ?`,
            [submissionId]
        );

        // 2. If no submission found
        if (submission.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // 3. Parse and format the response (single object, not array)
        const parsedData = typeof submission[0].data === 'string' 
            ? JSON.parse(submission[0].data) 
            : submission[0].data;

        const response = {
            id: submission[0].id,
            form_id: submission[0].form_id,
            lead_id: submission[0].lead_id,
            data: Array.isArray(parsedData) ? parsedData : [parsedData],
            submitted_at: submission[0].submitted_at
        };

        // 4. Return the single submission
        res.status(200).json({
            success: true,
            submission: response // Singular "submission" (not plural)
        });

    } catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch submission'
        });
    }
};


// Delete submission by ID
exports.deleteSubmissionById = async (req, res) => {
  const { submissionId } = req.params;
    console.log(submissionId)
  if (!submissionId) {
    return res.status(400).json({
      success: false,
      message: "Missing required parameter: submissionId",
    });
  }

  try {
    // Check if submission exists
    const [submission] = await pool.query(
      "SELECT id FROM form_submissions WHERE id = ?",
      [submissionId]
    );

    if (submission.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    // Delete the row
    await pool.query("DELETE FROM form_submissions WHERE id = ?", [submissionId]);

    res.status(200).json({
      success: true,
      message: `Submission ${submissionId} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting submission:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete submission",
      error: error.message,
    });
  }
};


exports.editSubmissionValueById = async (req, res) => {
    const { submissionId } = req.params;
    const { fieldId, newValue } = req.body;

    // Input validation
    if (!submissionId || !fieldId || newValue === undefined) {
        return res.status(400).json({
            success: false,
            message: 'Missing required parameters (submissionId, fieldId, or newValue)'
        });
    }

    try {
        console.log(`Attempting to edit submission ${submissionId}, field ${fieldId}`);

        // 1. Get the existing submission with more fields for debugging
        const [submissions] = await pool.query(
            'SELECT id, form_id, lead_id, data FROM form_submissions WHERE id = ?',
            [submissionId]
        );

        console.log(`Found ${submissions.length} submissions matching ID ${submissionId}`);

        if (submissions.length === 0) {
            console.error(`No submission found with ID: ${submissionId}`);
            return res.status(404).json({
                success: false,
                message: 'Submission not found',
                details: `No submission with ID ${submissionId} exists`
            });
        }

        const submission = submissions[0];
        console.log(`Found submission:`, submission);

        // 2. Parse the submission data with better error handling
        let submissionData;
        try {
            submissionData = typeof submission.data === 'string' 
                ? JSON.parse(submission.data) 
                : submission.data;
            
            // Ensure submissionData is an array (handle both array and object cases)
            if (!Array.isArray(submissionData)) {
                submissionData = [submissionData];
            }
        } catch (parseError) {
            console.error('Error parsing submission data:', parseError);
            return res.status(400).json({
                success: false,
                message: 'Invalid submission data format',
                error: parseError.message
            });
        }

        console.log('Parsed submission data:', submissionData);

        // 3. Find and update the specific field value
        let fieldFound = false;
        const updatedData = submissionData.map(item => {
            if (item.field_id === fieldId) {
                fieldFound = true;
                console.log(`Updating field ${fieldId} from '${item.value}' to '${newValue}'`);
                return { ...item, value: newValue };
            }
            return item;
        });

        if (!fieldFound) {
            console.error(`Field ${fieldId} not found in submission ${submissionId}`);
            return res.status(404).json({
                success: false,
                message: 'Field not found in submission',
                details: `Field ID ${fieldId} does not exist in submission ${submissionId}`,
                availableFields: submissionData.map(item => item.field_id)
            });
        }

        // 4. Update the submission in database
        const updateResult = await pool.query(
            'UPDATE form_submissions SET data = ? WHERE id = ?',
            [JSON.stringify(updatedData), submissionId]
        );

        console.log('Update result:', updateResult);

        // 5. Return the updated submission
        const [updatedSubmission] = await pool.query(
            'SELECT id, form_id, lead_id, data, submitted_at FROM form_submissions WHERE id = ?',
            [submissionId]
        );

        console.log('Updated submission:', updatedSubmission[0]);

        res.status(200).json({
            success: true,
            message: 'Submission updated successfully',
            submission: {
                ...updatedSubmission[0],
                data: updatedData
            }
        });

    } catch (error) {
        console.error('Error updating submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update submission',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


exports.deleteLeadFormWithSubmissions = async (req, res) => {
    const { leadId, formId } = req.params;

    if (!leadId || isNaN(leadId) || !formId || isNaN(formId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid leadId or formId"
        });
    }

    try {
        // Delete submissions first
        await pool.query(
            "DELETE FROM form_submissions WHERE form_id = ?",
            [formId]
        );

        // Delete fields next
        await pool.query(
            "DELETE FROM form_fields WHERE form_id = ?",
            [formId]
        );

        // Delete steps next
        await pool.query(
            "DELETE FROM form_steps WHERE form_id = ?",
            [formId]
        );

        // Finally delete the form
        const [result] = await pool.query(
            "DELETE FROM forms WHERE id = ? AND lead_id = ?",
            [formId, leadId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Form not found for this lead"
            });
        }

        res.status(200).json({
            success: true,
            message: "Form and all related data deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting lead form:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete form"
        });
    }
};





const parseOcrText = (text, type, side = 'front') => {
    const result = {};
    
    if (type === 'ocr-passport' || type === 'ocr-password') {
        const cleanText = text.toUpperCase().replace(/\s+/g, ' ').trim();
        console.log('Processing passport', side.toUpperCase(), 'image text:', cleanText);
        
        if (side === 'front') {
            // 1. Passport Number from MRZ line
            const passportRegex = /([A-Z][0-9]{6,})<[0-9]/;
            const passportMatch = cleanText.match(passportRegex);
            if (passportMatch && passportMatch[1]) {
                result.passportNumber = passportMatch[1];
            }

            // 2. Name from MRZ: P<INDSURNAME<<GIVENNAME<<<<
            const mrzNameRegex = /P<[A极Z]+([A-Z]+)<<([A-Z]+)<+/i;
            const mrzNameMatch = cleanText.match(mrzNameRegex);
            if (mrzNameMatch && mrzNameMatch[1] && mrzNameMatch[2]) {
                result.surname = mrzNameMatch[1].replace(/^[A-Z]{3}/, '');
                result.givenName = mrzNameMatch[2];
                result.fullName = `${result.surname} ${result.givenName}`;
            }

            // 3. Nationality and Country
            const nationalityRegex = /REPUBLIC\s+OF\s+([A-Z]+)/i;
            const nationalityMatch = cleanText.match(nationalityRegex);
            if (nationalityMatch && nationalityMatch[1]) {
                result.nationality = nationalityMatch[1];
                result.country = nationalityMatch[1];
            }

            // 4. Date of Birth
            const dobRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/;
            const dobMatch = cleanText.match(dobRegex);
            if (dobMatch && dobMatch[1]) {
                const [day, month, year] = dobMatch[1].split(/[\/\-]/);
                result.dob = `${year}-${month}-${day}`;
            }

            // 5. Gender
            const genderRegex = /\b([MF])\b/;
            const genderMatch = cleanText.match(genderRegex);
            if (genderMatch && genderMatch[1]) {
                result.gender = genderMatch[1] === 'M' ? 'Male' : 'Female';
            }

            // 6. Place of Birth
            const pobRegex = /PLACE\s+OF\s+BIRTH[:\s]*([A-Z][A-Z\s,]+)/i;
            const pobMatch = cleanText.match(pobRegex);
            if (pobMatch && pobMatch[1]) {
                result.placeOfBirth = pobMatch[1].trim();
            }

            // 7. Place of Issue
            const poiRegex = /PLACE\s+OF\s+ISSUE[:\s]*([A-Z][A-Z\s]+)/i;
            const poiMatch = cleanText.match(poiRegex);
            if (poiMatch && poiMatch[1]) {
                result.placeOfIssue = poiMatch[1].trim();
            }

            // 8. Dates of Issue and Expiry
            const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/g;
            const dateMatches = cleanText.match(dateRegex);
            if (dateMatches) {
                if (dateMatches[0]) {
                    const [day, month, year] = dateMatches[0].split(/[\/\-]/);
                    result.issueDate = `${year}-${month}-${day}`;
                }
                if (dateMatches[1]) {
                    const [day, month, year] = dateMatches[1].split(/[\/\-]/);
                    result.expiryDate = `${year}-${month}-${day}`;
                }
            }

        } else {
            // BACK SIDE PARSING - Dynamic family details
            
            // 1. Father's Name
            const fatherRegex = /NAME\s+OF\s+FATHER[^A-Z]*([A-Z][A-Z\s]+)/i;
            const fatherMatch = cleanText.match(fatherRegex);
            if (fatherMatch && fatherMatch[1]) {
                result.fatherName = fatherMatch[1].trim();
            }

            // 2. Mother's Name
            const motherRegex = /NAME\s+OF\s+MOTHER[^A-Z]*([A-Z][A-Z\s]+)/i;
            const motherMatch = cleanText.match(motherRegex);
            if (motherMatch && motherMatch[1]) {
                result.motherName = motherMatch[1].trim();
            }

            // 3. Spouse Name
            const spouseRegex = /NAME\s+OF\s+SPOUSE[^A-Z]*([A-Z][A-Z\s]+)/i;
            const spouseMatch = cleanText.match(spouseRegex);
            if (spouseMatch && spouseMatch[1]) {
                result.spouseName = spouseMatch[1].trim();
            }

            // 4. Address components
            const addressComponents = [];
            
            // House Number
            const houseRegex = /H\s+NO[^A-Z0-9]*([A-Z0-9\s]+)/i;
            const houseMatch = cleanText.match(houseRegex);
            if (houseMatch && houseMatch[1]) {
                addressComponents.push(`H NO ${houseMatch[1].trim()}`);
            }

            // Area
            const areaRegex = /[^A-Z]([A-Z][A-Z\s]+)(?=,)/;
            const areaMatch = cleanText.match(areaRegex);
            if (areaMatch && areaMatch[1]) {
                addressComponents.push(areaMatch[1].trim());
            }

            // City
            const cityRegex = /([A-Z][A-Z\s]+)(极?=,)/g;
            const cityMatches = cleanText.match(cityRegex);
            if (cityMatches && cityMatches[1]) {
                addressComponents.push(cityMatches[1].trim());
            }

            // District
            const districtRegex = /([A-Z][A-Z\s]+)(?=\.)/;
            const districtMatch = cleanText.match(districtRegex);
            if (districtMatch && districtMatch[1]) {
                addressComponents.push(districtMatch[1].trim());
            }

            // PIN Code
            const pinRegex = /PIN[^0-9]*(\d{6})/i;
            const pinMatch = cleanText.match(pinRegex);
            if (pinMatch && pinMatch[1]) {
                result.pinCode = pinMatch[1];
                addressComponents.push(`PIN: ${pinMatch[1]}`);
            }

            // State
            const stateRegex = /,([A-Z][A-Z\s]+),INDIA/i;
            const stateMatch = cleanText.match(stateRegex);
            if (stateMatch && stateMatch[1]) {
                addressComponents.push(stateMatch[1].trim());
            }

            // Country
            addressComponents.push('INDIA');

            if (addressComponents.length > 0) {
                result.address = addressComponents.join(', ');
            }

            // 5. Old Passport Number
            const oldPassportRegex = /OLD\s+PASSPORT[^A-Z0-9]*([A-Z0-9]+)/i;
            const oldPassportMatch = cleanText.match(oldPassportRegex);
            if (oldPassportMatch && oldPassportMatch[1]) {
                result.oldPassportNumber = oldPassportMatch[1];
            }
        }
        
    } else if (type === 'ocr-aadhar') {
        // AADHAR PROCESSING
        const cleanText = text.toUpperCase().replace(/\s+/g, ' ').trim();
        console.log('Processing aadhar', side.toUpperCase(), 'image text:', cleanText);
        
        if (side === 'front') {
            // 1. Aadhar Number
            const aadharPatterns = [
                /(\d{4}\s?\d{4}\s?\d{4})/,
                /(\d{12})/,
                /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/
            ];
            
            for (const pattern of aadharPatterns) {
                const match = cleanText.match(pattern);
                if (match) {
                    const aadharNo = match[1] || match[0];
                    result.aadharNumber = aadharNo.replace(/\s/g, '');
                    if (result.aadharNumber.length === 12) break;
                }
            }

            // 2. Name
            const namePatterns = [
                /([A-Z][A-Z\s]{3,}?)(?=\s*(?:DOB|DATE|MALE|FEMALE|\d{2}[\/\-]\d{2}[\/\-]\d{4}|$))/i,
                /(?:NAME|नाम)[\s:]*([A-Z][A-Z\s]+)/i
            ];
            
            for (const pattern of namePatterns) {
                const match = cleanText.match(pattern);
                if (match && match[1]) {
                    result.name = match[1].trim();
                    break;
                }
            }

            // 3. Date of Birth
            const dobPatterns = [
                /DOB[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /DATE\s+OF\s+BIRTH[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
                /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/
            ];
            
            for (const pattern of dobPatterns) {
                const match = cleanText.match(pattern);
                if (match && match[1]) {
                    const [day, month, year] = match[1].split(/[\/\-]/);
                    result.dob = `${year}-${month}-${day}`;
                    break;
                }
            }

            // 4. Gender
            const genderPatterns = [
                /(?:GENDER|SEX|लिंग)[\s:]*([MF])/i,
                /\b(MALE|FEMALE)\b/i,
                /\b([MF])\b/
            ];
            
            for (const pattern of genderPatterns) {
                const match = cleanText.match(pattern);
                if (match) {
                    const genderText = match[1] || match[0];
                    result.gender = genderText.includes('M') || genderText.includes('MALE') ? 'Male' : 'Female';
                    break;
                }
            }

            // 5. Address
            const addressPatterns = [
                /(?:ADDRESS|पता)[\s:]*([A-Z0-9][A-Z0-9\s,]+)/i,
                /([A-Z][A-Z\s,]{10,}?)(?=\s*(?:PIN|INDIA|$))/i
            ];
            
            for (const pattern of addressPatterns) {
                const match = cleanText.match(pattern);
                if (match && match[1]) {
                    result.address = match[1].trim();
                    break;
                }
            }

        } else {
            // AADHAR BACK SIDE
            // Clean up OCR artifacts
            const cleanedText = cleanText.replace(/[^A-Z0-9\s,:\.\/\-]/g, ' ').replace(/\s+/g, ' ').trim();
            
            // 1. Address
            const addressPatterns = [
                /(?:ADDRESS|पता)[\s:]*([A-Z0-9][A-Z0-9\s,\.\/\-]+?)(?=\s*(?:PIN|POSTAL|$))/i,
                /([A-Z0-9][A-Z0-9\s,\.\/\-]{15,}?)(?=\s*(?:PIN|POSTAL|$))/i
            ];
            
            for (const pattern of addressPatterns) {
                const match = cleanedText.match(pattern);
                if (match && match[1]) {
                    result.address = match[1].trim();
                    break;
                }
            }

            // 2. Father's/Husband's Name
            const relativePatterns = [
                /S\/O[:\s]*([A-Z][A-Z\s]+)/i,
                /H\/O[:\s]*([A-Z][A-Z\s]+)/i,
                /W\/O[:\s]*([A-Z][A-Z\s]+)/i
            ];
            
            for (const pattern of relativePatterns) {
                const match = cleanedText.match(pattern);
                if (match && match[1]) {
                    result.relativeName = match[1].trim();
                    break;
                }
            }

            // 3. PIN Code
            const pinPatterns = [
                /PIN[:\s]*(\d{6})/i,
                /POSTAL[:\s]*(\d{6})/i,
                /(\d{6})(?=\s*(?:INDIA|$))/i
            ];
            
            for (const pattern of pinPatterns) {
                const match = cleanedText.match(pattern);
                if (match && match[1]) {
                    result.pinCode = match[1];
                    break;
                }
            }

            // 4. Extract address components if full address not found
            if (!result.address) {
                const addressComponents = [];
                
                // House number
                const housePattern = /[A-Z]*\d+[A-Z]*\/?[A-Z\d]*/;
                const houseMatch = cleanedText.match(housePattern);
                if (houseMatch) {
                    addressComponents.push(houseMatch[0]);
                }
                
                // Area/Locality
                const areaPattern = /[A-Z]{3,}\s+[A-Z]{3,}/;
                const areaMatch = cleanedText.match(areaPattern);
                if (areaMatch) {
                    addressComponents.push(areaMatch[0]);
                }
                
                // City/District
                const cityPattern = /(?:DELHI|MUMBAI|KOLKATA|CHENNAI|BANGALORE|HYDERABAD|PUNE|AHMEDABAD)/i;
                const cityMatch = cleanedText.match(cityPattern);
                if (cityMatch) {
                    addressComponents.push(cityMatch[0]);
                }
                
                if (addressComponents.length > 0) {
                    result.address = addressComponents.join(', ');
                }
            }
        }
    }
    
    console.log('Final parsed result:', result);
    return result;
};






