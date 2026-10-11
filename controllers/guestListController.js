const pool = require('../config/db');

// Upload guest list and save as one record (replace old data)
// Upload guest list with option to replace or append
// ============ HELPER FUNCTIONS ============

// Function to analyze fields and find best key fields
const analyzeFields = (records) => {
    if (!records || records.length === 0) return {};
    
    const sample = records[0];
    const fieldAnalysis = {};
    
    Object.keys(sample).forEach(field => {
        const values = records.map(r => r[field]);
        const nonEmpty = values.filter(v => v != null && v !== '');
        const uniqueValues = new Set(nonEmpty.map(v => {
            const val = v.toString().toLowerCase().trim();
            return val;
        }));
        
        fieldAnalysis[field] = {
            total: values.length,
            nonEmpty: nonEmpty.length,
            unique: uniqueValues.size,
            completeness: nonEmpty.length / Math.max(values.length, 1),
            uniqueness: uniqueValues.size / Math.max(nonEmpty.length, 1),
            isLikelyIdentifier: uniqueValues.size === records.length && nonEmpty.length === records.length,
            dataType: typeof sample[field],
            exampleValue: sample[field]
        };
    });
    
    return fieldAnalysis;
};

// Function to find the best key fields for duplicate checking
const findBestKeyFields = (fieldAnalysis, count = 3) => {
    const fields = Object.keys(fieldAnalysis);
    
    if (fields.length === 0) return [];
    
    // Score each field
    const scoredFields = fields.map(field => {
        const analysis = fieldAnalysis[field];
        let score = 0;
        
        // 1. High score for fields that are complete (no empty values)
        score += analysis.completeness * 30;
        
        // 2. High score for fields with unique values
        score += analysis.uniqueness * 40;
        
        // 3. Field name suggests it's an identifier
        const idPatterns = [
            /id$/i, /code$/i, /email$/i, /name$/i, /phone$/i, /number$/i,
            /^id/i, /^code/i, /^email/i, /^name/i, /^phone/i, /^number/i,
            /_id$/i, /_code$/i, /no[._]?/i, /num(ber)?/i, /emp/i, /fc/i
        ];
        
        const isIdLike = idPatterns.some(pattern => pattern.test(field));
        score += isIdLike ? 20 : 0;
        
        // 4. Simple data types are better (string, number)
        const simpleTypes = ['string', 'number'];
        score += simpleTypes.includes(analysis.dataType) ? 10 : 0;
        
        return { field, score, analysis };
    });
    
    // Sort by score descending and filter
    return scoredFields
        .filter(f => f.score > 30) // Minimum threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(f => f.field);
};

// Generate warning messages based on duplicate analysis
const generateWarningMessages = (duplicates, uniqueNewRecords, keyFields, action, isDuplicateFile) => {
    const warnings = [];
    const messages = [];
    
    if (isDuplicateFile) {
        warnings.push({
            type: 'duplicate_file',
            severity: 'high',
            message: 'This appears to be the same file uploaded again.',
            details: `All ${duplicates.length} records already exist in the database.`
        });
        messages.push(`⚠️ This appears to be the same file uploaded again. All ${duplicates.length} record(s) already exist in the database.`);
    } 
    else if (duplicates.length > 0) {
        const keyFieldDesc = keyFields.length > 0 
            ? `based on ${keyFields.join(', ')}` 
            : 'based on exact matching';
        
        warnings.push({
            type: 'partial_duplicates',
            severity: 'medium',
            message: 'Some records already exist in the database.',
            details: `${duplicates.length} duplicate record(s) found ${keyFieldDesc}. Only ${uniqueNewRecords.length} new record(s) will be added.`,
            duplicatesCount: duplicates.length,
            newRecordsCount: uniqueNewRecords.length
        });
        
        if (action === 'append') {
            messages.push(`⚠️ Found ${duplicates.length} duplicate record(s) ${keyFieldDesc}. Only ${uniqueNewRecords.length} new record(s) will be added.`);
        } else if (action === 'replace') {
            messages.push(`⚠️ ${duplicates.length} record(s) in the new file already exist ${keyFieldDesc}. They will be replaced.`);
        }
    }
    
    // Check for potential data quality issues
    if (keyFields.length === 0) {
        warnings.push({
            type: 'no_key_fields',
            severity: 'low',
            message: 'No strong identifier fields detected.',
            details: 'Using exact matching for duplicate detection, which may be less accurate.'
        });
        messages.push('ℹ️ No strong identifier fields detected. Using exact matching.');
    }
    
    return {
        warnings,
        combinedMessage: messages.join(' ')
    };
};

// Main duplicate finding function
const findDuplicates = (existingArray, newArray) => {
    const duplicates = [];
    const uniqueNewRecords = [];
    
    // If no data, return empty results
    if (!existingArray || !newArray || existingArray.length === 0 || newArray.length === 0) {
        return { duplicates, uniqueNewRecords, keyFields: [] };
    }
    
    // Combine arrays for analysis
    const combined = [...existingArray, ...newArray];
    const fieldAnalysis = analyzeFields(combined);
    const keyFields = findBestKeyFields(fieldAnalysis, 3);
    
    console.log('🔍 Field analysis completed:');
    console.log('- Total fields analyzed:', Object.keys(fieldAnalysis).length);
    console.log('- Best key fields detected:', keyFields);
    
    // Log analysis for top fields
    keyFields.forEach((field, index) => {
        const analysis = fieldAnalysis[field];
        console.log(`  ${index + 1}. ${field}: completeness=${Math.round(analysis.completeness * 100)}%, uniqueness=${Math.round(analysis.uniqueness * 100)}%`);
    });
    
    if (keyFields.length === 0) {
        // Fallback: Use exact JSON matching
        console.log('⚠️ No good key fields detected, using exact matching');
        
        const existingMap = new Map();
        existingArray.forEach((record, index) => {
            const key = JSON.stringify(record);
            existingMap.set(key, index);
        });
        
        newArray.forEach(record => {
            const key = JSON.stringify(record);
            if (existingMap.has(key)) {
                duplicates.push(record);
            } else {
                uniqueNewRecords.push(record);
            }
        });
        
        return { duplicates, uniqueNewRecords, keyFields: [] };
    }
    
    // Create a map of existing records using detected key fields
    const existingMap = new Map();
    
    existingArray.forEach(record => {
        const key = keyFields.map(field => {
            const value = record[field];
            if (value == null || value === '') return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return value.toString().trim().toLowerCase();
        }).join('|');
        
        if (key && key !== '|'.repeat(keyFields.length - 1)) { // Avoid empty keys
            existingMap.set(key, record);
        }
    });
    
    console.log(`📊 Existing records indexed: ${existingMap.size} unique keys found`);
    
    // Check new records against the map
    newArray.forEach((record, index) => {
        const key = keyFields.map(field => {
            const value = record[field];
            if (value == null || value === '') return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return value.toString().trim().toLowerCase();
        }).join('|');
        
        const isDuplicate = key && existingMap.has(key);
        
        if (isDuplicate) {
            duplicates.push(record);
            if (index < 3) { // Log first few duplicates for debugging
                console.log(`  Duplicate found at index ${index}: ${key}`);
            }
        } else {
            uniqueNewRecords.push(record);
            if (key && !existingMap.has(key)) {
                existingMap.set(key, record);
            }
        }
    });
    
    console.log(`📈 Duplicate check results: ${duplicates.length} duplicates, ${uniqueNewRecords.length} unique records`);
    
    return { duplicates, uniqueNewRecords, keyFields };
};

// ============ MAIN UPLOAD FUNCTION ============

exports.uploadGuestList = async (req, res) => {
    const { leadId } = req.params;
    const { guestData } = req.body;
    const { action = 'append' } = req.query;
    
    console.log('\n🚀 ======= UPLOAD GUEST LIST =======');
    console.log('Lead ID:', leadId);
    console.log('Action:', action);
    console.log('Data received:', Array.isArray(guestData) ? `${guestData.length} records` : 'Invalid format');
    
    if (!Array.isArray(guestData) || guestData.length === 0) {
        console.log('❌ Error: Invalid or empty guest data');
        return res.status(400).json({ 
            success: false, 
            message: 'No valid guest data provided.' 
        });
    }

    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            console.log('❌ Lead not found:', leadId);
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found.' 
            });
        }

        console.log('✅ Lead verified');

        let finalGuestData = guestData;
        let existingCount = 0;
        let newCount = guestData.length;
        let duplicateCount = 0;
        let isDuplicateFile = false;
        let warnings = [];
        let detectedKeyFields = [];

        if (action === 'append') {
            // Check for existing data
            const [existingGuestRows] = await pool.query(
                'SELECT guest_data FROM guest_lists WHERE lead_id = ?',
                [leadId]
            );

            if (existingGuestRows.length > 0) {
                let existingGuestData = existingGuestRows[0].guest_data;
                
                if (typeof existingGuestData === 'string') {
                    try {
                        existingGuestData = JSON.parse(existingGuestData);
                    } catch (parseError) {
                        console.log('❌ Failed to parse existing guest data:', parseError.message);
                        existingGuestData = [];
                    }
                }

                const existingArray = Array.isArray(existingGuestData) ? existingGuestData : [];
                existingCount = existingArray.length;
                
                console.log(`📊 Found ${existingCount} existing records`);
                
                // ✅ Dynamic duplicate detection
                const { duplicates, uniqueNewRecords, keyFields } = 
                    findDuplicates(existingArray, guestData);
                
                duplicateCount = duplicates.length;
                detectedKeyFields = keyFields;
                
                console.log(`📈 Duplicate analysis: ${duplicateCount} duplicates, ${uniqueNewRecords.length} unique`);
                
                // ✅ Check if ALL records are duplicates
                if (duplicateCount === guestData.length && guestData.length > 0) {
                    isDuplicateFile = true;
                    
                    finalGuestData = existingArray;
                    newCount = 0;
                    console.log('⚠️ Complete duplicate file detected');
                } else {
                    // Append only unique records
                    finalGuestData = [...existingArray, ...uniqueNewRecords];
                    newCount = uniqueNewRecords.length;
                }
                
                // Generate warnings
                const warningInfo = generateWarningMessages(
                    duplicates, 
                    uniqueNewRecords, 
                    detectedKeyFields, 
                    action, 
                    isDuplicateFile
                );
                warnings = warningInfo.warnings;
                
            } else {
                console.log('📝 No existing data, will insert new');
            }
        } else if (action === 'replace') {
            console.log('🔄 Replace mode selected');
            
            // For replace mode, we can still detect duplicates for warning
            const [existingGuestRows] = await pool.query(
                'SELECT guest_data FROM guest_lists WHERE lead_id = ?',
                [leadId]
            );
            
            if (existingGuestRows.length > 0) {
                let existingGuestData = existingGuestRows[0].guest_data;
                
                if (typeof existingGuestData === 'string') {
                    try {
                        existingGuestData = JSON.parse(existingGuestData);
                    } catch (parseError) {
                        console.log('❌ Failed to parse existing guest data:', parseError.message);
                        existingGuestData = [];
                    }
                }
                
                const existingArray = Array.isArray(existingGuestData) ? existingGuestData : [];
                
                const { duplicates, keyFields } = findDuplicates(existingArray, guestData);
                detectedKeyFields = keyFields;
                duplicateCount = duplicates.length;
                
                // Check if it's a complete duplicate file
                if (duplicates.length === existingArray.length && duplicates.length === guestData.length) {
                    isDuplicateFile = true;
                    console.log('⚠️ Complete duplicate file detected in replace mode');
                }
                
                // Generate warnings for replace mode
                const warningInfo = generateWarningMessages(
                    duplicates, 
                    guestData, // In replace mode, all new records are "unique" for display purposes
                    detectedKeyFields, 
                    action, 
                    isDuplicateFile
                );
                warnings = warningInfo.warnings;
            }
        } else {
            console.log(`⚠️ Unknown action: ${action}, defaulting to append`);
            // Default to append
        }

        console.log('💾 Saving to database...');
        console.log(`- Final data count: ${finalGuestData.length} records`);
        console.log(`- Key fields used: ${detectedKeyFields.join(', ') || 'exact matching'}`);

        // Save to database
        const [existingRows] = await pool.query(
            'SELECT id FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (existingRows.length > 0) {
            await pool.query(
                'UPDATE guest_lists SET guest_data = ? WHERE lead_id = ?',
                [JSON.stringify(finalGuestData), leadId]
            );
            console.log('✅ Updated existing guest list');
        } else {
            await pool.query(
                'INSERT INTO guest_lists (lead_id, guest_data) VALUES (?, ?)',
                [leadId, JSON.stringify(finalGuestData)]
            );
            console.log('✅ Created new guest list');
        }

        // Prepare success message based on action
        let successMessage = '';
        if (action === 'append') {
            successMessage = duplicateCount > 0 
                ? `duplicate record(s) were skipped.`
                : `Successfully added ${newCount} new records.`;
        } else if (action === 'replace') {
            successMessage = duplicateCount > 0
                ? `Successfully replaced all records. ${duplicateCount} record(s) were identical to existing data.`
                : `Successfully replaced all records with ${newCount} new records.`;
        } else {
            successMessage = `Guest list ${action}ed successfully.`;
        }

        // Prepare response with comprehensive information
        const response = {
            success: true,
            message: successMessage,
            totalGuests: finalGuestData.length,
            action: action,
            stats: {
                existing: existingCount,
                added: newCount,
                duplicates: duplicateCount,
                total: finalGuestData.length
            },
            keyFields: detectedKeyFields,
            warnings: warnings,
            hasWarnings: warnings.length > 0,
            isDuplicateFile: isDuplicateFile
        };

        // Add summary warning message for easy display
        if (warnings.length > 0) {
            const warningMessages = warnings.map(w => w.message).join(' ');
            response.warningSummary = warningMessages;
            
            if (isDuplicateFile) {
                response.requiresConfirmation = true;
                response.confirmationMessage = 'This appears to be the same file uploaded again. Do you want to proceed?';
            }
        }

        console.log('✅ Upload completed successfully');
        console.log('📊 Stats:', response.stats);
        console.log('⚠️ Warnings:', warnings.length);
        console.log('====================================\n');

        res.status(201).json(response);

    } catch (error) {
        console.error('\n❌ ERROR uploading guest list:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');
        
        // Create error response with warning
        const errorResponse = {
            success: false, 
            message: 'Failed to upload guest list.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            warnings: [{
                type: 'upload_error',
                severity: 'critical',
                message: 'Upload failed due to an error.',
                details: error.message
            }]
        };
        
        res.status(500).json(errorResponse);
    }
};

// ============ ADDITIONAL HELPER FOR FRONTEND ============

// Helper function to get data quality report
exports.getDataQualityReport = async (req, res) => {
    const { leadId } = req.params;
    
    try {
        const [guestRows] = await pool.query(
            'SELECT guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );
        
        if (guestRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No guest data found for this lead.'
            });
        }
        
        let guestData = guestRows[0].guest_data;
        if (typeof guestData === 'string') {
            guestData = JSON.parse(guestData);
        }
        
        if (!Array.isArray(guestData) || guestData.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No data available for analysis.',
                report: null
            });
        }
        
        // Analyze data quality
        const fieldAnalysis = analyzeFields(guestData);
        const keyFields = findBestKeyFields(fieldAnalysis, 5);
        
        // Generate quality warnings
        const qualityWarnings = [];
        
        Object.keys(fieldAnalysis).forEach(field => {
            const analysis = fieldAnalysis[field];
            
            if (analysis.completeness < 0.5) {
                qualityWarnings.push({
                    field: field,
                    type: 'low_completeness',
                    severity: 'medium',
                    message: `Field "${field}" has many empty values.`,
                    details: `Only ${Math.round(analysis.completeness * 100)}% of records have values for this field.`
                });
            }
            
            if (analysis.uniqueness < 0.1 && analysis.completeness > 0.8) {
                qualityWarnings.push({
                    field: field,
                    type: 'low_uniqueness',
                    severity: 'low',
                    message: `Field "${field}" has many duplicate values.`,
                    details: `Only ${Math.round(analysis.uniqueness * 100)}% of values are unique.`
                });
            }
        });
        
        const report = {
            totalRecords: guestData.length,
            totalFields: Object.keys(fieldAnalysis).length,
            suggestedKeyFields: keyFields,
            fieldAnalysis: Object.keys(fieldAnalysis).map(field => ({
                field: field,
                completeness: Math.round(fieldAnalysis[field].completeness * 100),
                uniqueness: Math.round(fieldAnalysis[field].uniqueness * 100),
                dataType: fieldAnalysis[field].dataType,
                isIdentifierCandidate: fieldAnalysis[field].isLikelyIdentifier
            })),
            qualityWarnings: qualityWarnings,
            hasQualityIssues: qualityWarnings.length > 0
        };
        
        res.status(200).json({
            success: true,
            message: 'Data quality report generated.',
            report: report
        });
        
    } catch (error) {
        console.error('Error generating quality report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate data quality report.'
        });
    }
};


exports.getGuestListByLead = async (req, res) => {
    try {
        const { leadId } = req.params;

        const [rows] = await pool.query('SELECT * FROM guest_lists WHERE lead_id = ?', [leadId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Guest list not found for this lead' });
        }

        // Parse guest_data correctly
        const guestList = rows.map(row => ({
            ...row,
            guestData: typeof row.guest_data === 'string' ? JSON.parse(row.guest_data) : row.guest_data
        }));

        res.json(guestList[0]); // Return the first (and only) guest list for this lead

    } catch (error) {
        console.error('Error fetching guest list:', error);
        res.status(500).json({ error: 'Server error' });
    }
};


// Get guest list table headers/columns from uploaded data
exports.getGuestListHeaders = async (req, res) => {
    const { leadId } = req.params;

    try {
        // Get the guest list data for this lead
        const [rows] = await pool.query('SELECT * FROM guest_lists WHERE lead_id = ?', [leadId]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No guest list found for this lead' 
            });
        }

        // Parse guest_data
        const guestData = typeof rows[0].guest_data === 'string' 
            ? JSON.parse(rows[0].guest_data) 
            : rows[0].guest_data;

        if (!Array.isArray(guestData) || guestData.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No guest data available' 
            });
        }

        // Extract headers from the first guest object
        const firstGuest = guestData[0];
        const headers = Object.keys(firstGuest).map(key => ({
            key: key,
            label: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            type: this.detectFieldType(firstGuest[key])
        }));

        res.json({
            success: true,
            headers: headers,
            sampleData: firstGuest // Optional: include sample data for reference
        });

    } catch (error) {
        console.error('Error fetching guest list headers:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch guest list headers.' });
    }
};

// Helper function to detect field type based on value
exports.detectFieldType = (value) => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'string') {
        if (value.match(/^\d{4}-\d{2}-\d{2}$/)) return 'date';
        if (value.includes('@')) return 'email';
        if (value.match(/^\d{10,}$/)) return 'tel';
    }
    return 'text';
};

// Add this function to remove a specific row/record from the guest list
exports.removeGuestRow = async (req, res) => {
    const { leadId } = req.params;
    const { rowIndex, rowId, identifier } = req.body;
    
    console.log('\n🗑️ ======= REMOVE GUEST ROW =======');
    console.log('Lead ID:', leadId);
    console.log('Remove request:', { rowIndex, rowId, identifier });
    
    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            console.log('❌ Lead not found:', leadId);
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found.' 
            });
        }

        console.log('✅ Lead verified');

        // Get existing guest data
        const [guestRows] = await pool.query(
            'SELECT id, guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (guestRows.length === 0) {
            console.log('❌ No guest list found for this lead');
            return res.status(404).json({ 
                success: false, 
                message: 'No guest list found for this lead.' 
            });
        }

        let guestData = guestRows[0].guest_data;
        const guestListId = guestRows[0].id;
        
        if (typeof guestData === 'string') {
            try {
                guestData = JSON.parse(guestData);
            } catch (parseError) {
                console.log('❌ Failed to parse guest data:', parseError.message);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Invalid guest data format.' 
                });
            }
        }

        if (!Array.isArray(guestData) || guestData.length === 0) {
            console.log('❌ Guest data is empty');
            return res.status(404).json({ 
                success: false, 
                message: 'Guest list is empty.' 
            });
        }

        const originalLength = guestData.length;
        let removedRecord = null;
        let newData = [];

        // Method 1: Remove by row index (0-based)
        if (rowIndex !== undefined && rowIndex !== null) {
            const index = parseInt(rowIndex);
            
            if (isNaN(index) || index < 0 || index >= guestData.length) {
                console.log('❌ Invalid row index:', index);
                return res.status(400).json({ 
                    success: false, 
                    message: `Invalid row index. Must be between 0 and ${guestData.length - 1}.` 
                });
            }
            
            console.log(`📊 Removing row at index ${index}`);
            removedRecord = guestData[index];
            newData = guestData.filter((_, i) => i !== index);
        }
        // Method 2: Remove by identifier (e.g., ID field)
        else if (identifier) {
            const { field, value } = identifier;
            
            if (!field || value === undefined || value === null) {
                console.log('❌ Invalid identifier:', identifier);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Identifier must include field and value.' 
                });
            }
            
            console.log(`🔍 Searching for record where ${field} = ${value}`);
            
            const index = guestData.findIndex(record => {
                const recordValue = record[field];
                if (recordValue === undefined) return false;
                
                // String comparison (case-insensitive for strings)
                if (typeof recordValue === 'string' && typeof value === 'string') {
                    return recordValue.toLowerCase() === value.toLowerCase();
                }
                // Direct comparison for other types
                return recordValue == value;
            });
            
            if (index === -1) {
                console.log('❌ Record not found with given identifier');
                return res.status(404).json({ 
                    success: false, 
                    message: `No record found with ${field} = ${value}.` 
                });
            }
            
            removedRecord = guestData[index];
            newData = guestData.filter((_, i) => i !== index);
        }
        // Method 3: Remove by row ID (if you have an ID field in the data)
        else if (rowId !== undefined && rowId !== null) {
            console.log(`🔍 Searching for record with ID: ${rowId}`);
            
            // Try common ID field names
            const idFields = ['id', 'ID', 'Id', 'guest_id', 'guestId', 'employee_id', 'employeeId'];
            let foundIndex = -1;
            
            for (const field of idFields) {
                foundIndex = guestData.findIndex(record => record[field] == rowId);
                if (foundIndex !== -1) break;
            }
            
            if (foundIndex === -1) {
                console.log('❌ Record not found with given ID');
                return res.status(404).json({ 
                    success: false, 
                    message: `No record found with ID: ${rowId}.` 
                });
            }
            
            removedRecord = guestData[foundIndex];
            newData = guestData.filter((_, i) => i !== foundIndex);
        }
        else {
            console.log('❌ No valid removal method specified');
            return res.status(400).json({ 
                success: false, 
                message: 'Please specify either rowIndex, rowId, or identifier to remove a row.' 
            });
        }

        // Check if we actually removed something
        if (newData.length === originalLength) {
            console.log('❌ No record was removed');
            return res.status(400).json({ 
                success: false, 
                message: 'No record was removed. Please check your parameters.' 
            });
        }

        console.log(`✅ Removed 1 record. New total: ${newData.length} records`);

        // Save updated data to database
        await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE id = ?',
            [JSON.stringify(newData), guestListId]
        );

        // Prepare response
        const response = {
            success: true,
            message: 'Record removed successfully.',
            removedRecord: removedRecord,
            stats: {
                originalCount: originalLength,
                newCount: newData.length,
                removedCount: originalLength - newData.length
            },
            newDataLength: newData.length,
            timestamp: new Date().toISOString()
        };

        console.log('✅ Removal completed successfully');
        console.log('📊 Stats:', response.stats);
        console.log('====================================\n');

        res.status(200).json(response);

    } catch (error) {
        console.error('\n❌ ERROR removing guest row:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');
        
        res.status(500).json({
            success: false, 
            message: 'Failed to remove record from guest list.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Optional: Bulk remove multiple rows
exports.bulkRemoveGuestRows = async (req, res) => {
    const { leadId } = req.params;
    const { rowIndices, identifiers } = req.body;
    
    console.log('\n🗑️ ======= BULK REMOVE GUEST ROWS =======');
    console.log('Lead ID:', leadId);
    
    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            console.log('❌ Lead not found:', leadId);
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found.' 
            });
        }

        // Get existing guest data
        const [guestRows] = await pool.query(
            'SELECT id, guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (guestRows.length === 0) {
            console.log('❌ No guest list found for this lead');
            return res.status(404).json({ 
                success: false, 
                message: 'No guest list found for this lead.' 
            });
        }

        let guestData = guestRows[0].guest_data;
        const guestListId = guestRows[0].id;
        
        if (typeof guestData === 'string') {
            guestData = JSON.parse(guestData);
        }

        if (!Array.isArray(guestData) || guestData.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Guest list is empty.' 
            });
        }

        const originalLength = guestData.length;
        let removedRecords = [];
        let newData = [...guestData];

        // Remove by indices
        if (Array.isArray(rowIndices) && rowIndices.length > 0) {
            // Sort indices in descending order to avoid index shifting issues
            const sortedIndices = [...rowIndices]
                .map(i => parseInt(i))
                .filter(i => !isNaN(i) && i >= 0 && i < originalLength)
                .sort((a, b) => b - a);
            
            console.log(`📊 Removing ${sortedIndices.length} rows by indices`);
            
            sortedIndices.forEach(index => {
                removedRecords.push(guestData[index]);
                newData.splice(index, 1);
            });
        }

        // Remove by identifiers
        if (Array.isArray(identifiers) && identifiers.length > 0) {
            identifiers.forEach(({ field, value }) => {
                if (!field || value === undefined) return;
                
                const index = newData.findIndex(record => {
                    const recordValue = record[field];
                    if (recordValue === undefined) return false;
                    
                    if (typeof recordValue === 'string' && typeof value === 'string') {
                        return recordValue.toLowerCase() === value.toLowerCase();
                    }
                    return recordValue == value;
                });
                
                if (index !== -1) {
                    removedRecords.push(newData[index]);
                    newData.splice(index, 1);
                }
            });
        }

        // Check if any records were removed
        if (newData.length === originalLength) {
            console.log('❌ No records were removed');
            return res.status(400).json({ 
                success: false, 
                message: 'No records were removed. Please check your parameters.' 
            });
        }

        console.log(`✅ Removed ${removedRecords.length} records. New total: ${newData.length} records`);

        // Save updated data
        await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE id = ?',
            [JSON.stringify(newData), guestListId]
        );

        const response = {
            success: true,
            message: `${removedRecords.length} record(s) removed successfully.`,
            removedCount: removedRecords.length,
            stats: {
                originalCount: originalLength,
                newCount: newData.length,
                removedCount: originalLength - newData.length
            },
            newDataLength: newData.length,
            timestamp: new Date().toISOString()
        };

        console.log('✅ Bulk removal completed successfully');
        console.log('📊 Stats:', response.stats);
        console.log('====================================\n');

        res.status(200).json(response);

    } catch (error) {
        console.error('\n❌ ERROR in bulk remove:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({
            success: false, 
            message: 'Failed to remove records.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Optional: Clear entire guest list
exports.clearGuestList = async (req, res) => {
    const { leadId } = req.params;
    const { confirm } = req.body;
    
    console.log('\n🧹 ======= CLEAR GUEST LIST =======');
    console.log('Lead ID:', leadId);
    
    if (!confirm) {
        return res.status(400).json({
            success: false,
            message: 'Confirmation required. Set confirm: true in request body.'
        });
    }
    
    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Lead not found.' 
            });
        }

        // Get guest list to know how many records we're clearing
        const [guestRows] = await pool.query(
            'SELECT id, guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (guestRows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No guest list found for this lead.' 
            });
        }

        let recordCount = 0;
        const guestData = guestRows[0].guest_data;
        
        if (typeof guestData === 'string') {
            try {
                const parsed = JSON.parse(guestData);
                recordCount = Array.isArray(parsed) ? parsed.length : 0;
            } catch (e) {
                recordCount = 0;
            }
        } else if (Array.isArray(guestData)) {
            recordCount = guestData.length;
        }

        // Clear the guest list (set to empty array)
        await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE lead_id = ?',
            [JSON.stringify([]), leadId]
        );

        console.log(`✅ Cleared ${recordCount} records from guest list`);
        
        res.status(200).json({
            success: true,
            message: `Guest list cleared successfully. ${recordCount} record(s) removed.`,
            clearedCount: recordCount,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('\n❌ ERROR clearing guest list:');
        console.error('Message:', error.message);
        
        res.status(500).json({
            success: false, 
            message: 'Failed to clear guest list.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// Update a specific row/record in the guest list
exports.updateGuestRow = async (req, res) => {
    const { leadId } = req.params;
    const { rowIndex, identifier, updatedData } = req.body;

    console.log('\n✏️ ======= UPDATE GUEST ROW =======');
    console.log('Lead ID:', leadId);
    console.log('Update request:', { rowIndex, identifier });

    // Validate input
    if (!updatedData || typeof updatedData !== 'object' || Array.isArray(updatedData)) {
        console.log('❌ Invalid updatedData');
        return res.status(400).json({
            success: false,
            message: 'Invalid updatedData. Provide an object with the new row data.'
        });
    }

    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            console.log('❌ Lead not found:', leadId);
            return res.status(404).json({
                success: false,
                message: 'Lead not found.'
            });
        }

        // Get existing guest data
        const [guestRows] = await pool.query(
            'SELECT id, guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (guestRows.length === 0) {
            console.log('❌ No guest list found for this lead');
            return res.status(404).json({
                success: false,
                message: 'No guest list found for this lead.'
            });
        }

        let guestData = guestRows[0].guest_data;
        const guestListId = guestRows[0].id;

        // Parse guest data
        if (typeof guestData === 'string') {
            try {
                guestData = JSON.parse(guestData);
            } catch (parseError) {
                console.log('❌ Failed to parse guest data:', parseError.message);
                return res.status(500).json({
                    success: false,
                    message: 'Invalid guest data format.'
                });
            }
        }

        if (!Array.isArray(guestData) || guestData.length === 0) {
            console.log('❌ Guest data is empty');
            return res.status(404).json({
                success: false,
                message: 'Guest list is empty. Cannot update.'
            });
        }

        let targetIndex = -1;
        let oldRecord = null;

        // Determine which record to update
        if (rowIndex !== undefined && rowIndex !== null) {
            // Update by index
            const index = parseInt(rowIndex);
            if (isNaN(index) || index < 0 || index >= guestData.length) {
                console.log('❌ Invalid row index:', index);
                return res.status(400).json({
                    success: false,
                    message: `Invalid row index. Must be between 0 and ${guestData.length - 1}.`
                });
            }
            targetIndex = index;
            oldRecord = guestData[index];
            console.log(`📊 Updating row at index ${targetIndex}`);
        } else if (identifier) {
            // Update by identifier (field + value)
            const { field, value } = identifier;
            if (!field || value === undefined || value === null) {
                console.log('❌ Invalid identifier:', identifier);
                return res.status(400).json({
                    success: false,
                    message: 'Identifier must include field and value.'
                });
            }

            console.log(`🔍 Searching for record where ${field} = ${value}`);

            targetIndex = guestData.findIndex(record => {
                const recordValue = record[field];
                if (recordValue === undefined) return false;

                if (typeof recordValue === 'string' && typeof value === 'string') {
                    return recordValue.toLowerCase() === value.toLowerCase();
                }
                return recordValue == value;
            });

            if (targetIndex === -1) {
                console.log('❌ Record not found with given identifier');
                return res.status(404).json({
                    success: false,
                    message: `No record found with ${field} = ${value}.`
                });
            }
            oldRecord = guestData[targetIndex];
            console.log(`📊 Updating record with ${field} = ${value} at index ${targetIndex}`);
        } else {
            console.log('❌ No valid update method specified');
            return res.status(400).json({
                success: false,
                message: 'Please provide either rowIndex or identifier to update a row.'
            });
        }

        // Preserve fields that should not be overwritten (like system fields)
        // For example, if the data has an internal ID, we might want to keep it.
        // Here we simply merge but allow updating any field.
        // Optionally, you can merge with oldRecord to keep some fields.
        const updatedRow = { ...updatedData };

        // If there is a field that serves as a primary key, you might not want to change it.
        // But since we don't know which one, we let the client decide.
        // You can add protection for certain fields if needed.

        // Replace the record
        guestData[targetIndex] = updatedRow;

        console.log(`✅ Updated record at index ${targetIndex}`);
        console.log('Old record:', JSON.stringify(oldRecord));
        console.log('New record:', JSON.stringify(updatedRow));

        // Save updated data to database
        await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE id = ?',
            [JSON.stringify(guestData), guestListId]
        );

        const response = {
            success: true,
            message: 'Record updated successfully.',
            updatedIndex: targetIndex,
            oldRecord: oldRecord,
            newRecord: updatedRow,
            stats: {
                totalRecords: guestData.length,
                updatedAt: new Date().toISOString()
            }
        };

        console.log('✅ Update completed successfully');
        console.log('====================================\n');

        res.status(200).json(response);

    } catch (error) {
        console.error('\n❌ ERROR updating guest row:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');

        res.status(500).json({
            success: false,
            message: 'Failed to update record.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// Rename a column header in the guest list
exports.renameGuestListHeader = async (req, res) => {
    const { leadId } = req.params;
    const { oldColumnName, newColumnName } = req.body;

    console.log('\n📝 ======= RENAME GUEST LIST HEADER =======');
    console.log('Lead ID:', leadId);
    console.log('Old column name:', oldColumnName);
    console.log('New column name:', newColumnName);

    // Validate input
    if (!oldColumnName || !newColumnName) {
        console.log('❌ Missing column names');
        return res.status(400).json({
            success: false,
            message: 'Both oldColumnName and newColumnName are required.'
        });
    }

    if (oldColumnName === newColumnName) {
        console.log('⚠️ Old and new names are the same, no change needed.');
        return res.status(200).json({
            success: true,
            message: 'No change needed, names are identical.'
        });
    }

    try {
        // Verify lead exists
        const [leadCheck] = await pool.query(
            'SELECT id FROM leads WHERE id = ?',
            [leadId]
        );

        if (leadCheck.length === 0) {
            console.log('❌ Lead not found:', leadId);
            return res.status(404).json({
                success: false,
                message: 'Lead not found.'
            });
        }

        // Get existing guest data
        const [guestRows] = await pool.query(
            'SELECT id, guest_data FROM guest_lists WHERE lead_id = ?',
            [leadId]
        );

        if (guestRows.length === 0) {
            console.log('❌ No guest list found for this lead');
            return res.status(404).json({
                success: false,
                message: 'No guest list found for this lead.'
            });
        }

        let guestData = guestRows[0].guest_data;
        const guestListId = guestRows[0].id;

        // Parse guest data
        if (typeof guestData === 'string') {
            try {
                guestData = JSON.parse(guestData);
            } catch (parseError) {
                console.log('❌ Failed to parse guest data:', parseError.message);
                return res.status(500).json({
                    success: false,
                    message: 'Invalid guest data format.'
                });
            }
        }

        if (!Array.isArray(guestData) || guestData.length === 0) {
            console.log('❌ Guest data is empty');
            return res.status(404).json({
                success: false,
                message: 'Guest list is empty. Cannot rename header.'
            });
        }

        // Check if oldColumnName exists in the first record (or any record)
        const firstRecord = guestData[0];
        if (!firstRecord.hasOwnProperty(oldColumnName)) {
            console.log(`❌ Column "${oldColumnName}" not found in guest data`);
            return res.status(404).json({
                success: false,
                message: `Column "${oldColumnName}" not found in guest data.`
            });
        }

        // Check if newColumnName already exists (to avoid overwriting)
        if (firstRecord.hasOwnProperty(newColumnName) && oldColumnName !== newColumnName) {
            console.log(`⚠️ Column "${newColumnName}" already exists, cannot rename.`);
            return res.status(400).json({
                success: false,
                message: `Column "${newColumnName}" already exists. Cannot rename to an existing column name.`
            });
        }

        // Rename the column in all records
        const updatedGuestData = guestData.map(record => {
            // Create a new object without the old key, add the new key with the old value
            const { [oldColumnName]: value, ...rest } = record;
            return { ...rest, [newColumnName]: value };
        });

        // Save updated data to database
        await pool.query(
            'UPDATE guest_lists SET guest_data = ? WHERE id = ?',
            [JSON.stringify(updatedGuestData), guestListId]
        );

        console.log(`✅ Header renamed from "${oldColumnName}" to "${newColumnName}"`);
        console.log(`📊 Affected ${updatedGuestData.length} records`);

        res.status(200).json({
            success: true,
            message: `Header renamed from "${oldColumnName}" to "${newColumnName}" successfully.`,
            oldColumnName: oldColumnName,
            newColumnName: newColumnName,
            totalRecords: updatedGuestData.length
        });

    } catch (error) {
        console.error('\n❌ ERROR renaming header:');
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');

        res.status(500).json({
            success: false,
            message: 'Failed to rename header.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};