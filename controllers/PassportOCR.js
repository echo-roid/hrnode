// Use dynamic import for the ES module
let GoogleGenAI;

const initGoogleGenAI = async () => {
    if (!GoogleGenAI) {
        const module = await import('@google/genai');
        GoogleGenAI = module.GoogleGenAI;
    }
    return GoogleGenAI;
};

// Specific prompts for Passport and Aadhaar
const getDocumentPrompt = (rawText, docType = 'auto') => {
    let typeSpecificInstructions = '';
    let outputFields = '';

    if (docType === 'passport' || docType === 'auto') {
        typeSpecificInstructions += `
PASSPORT EXTRACTION RULES:
If this is a Passport, extract these specific fields:
- passport_number: The passport number (alphanumeric)
- surname: Last name/Family name
- given_names: First name(s)/Given name(s)
- nationality: Country of citizenship
- date_of_birth: Date of birth (format: DD/MM/YYYY)
- place_of_birth: City/Country of birth
- sex: M/F (Male/Female)
- date_of_issue: Date passport was issued
- date_of_expiry: Date passport expires
- issuing_authority: Government authority that issued the passport
- type: Passport type (P, D, etc.)
- country_code: 3-letter country code
- personal_number: Optional personal identification number
- mrz_line1: First line of Machine Readable Zone (MRZ)
- mrz_line2: Second line of Machine Readable Zone (MRZ)
- observations: Any endorsements or observations
`;
        outputFields += `
For Passport output fields include: passport_number, surname, given_names, nationality, date_of_birth, place_of_birth, sex, date_of_issue, date_of_expiry, issuing_authority, type, country_code, personal_number, mrz_line1, mrz_line2, observations.
`;
    }

    if (docType === 'aadhaar' || docType === 'auto') {
        typeSpecificInstructions += `
AADHAAR CARD EXTRACTION RULES:
If this is an Aadhaar Card, extract these specific fields:
- aadhaar_number: 12-digit Unique Identification Number (UID)
- name: Full name as printed on card
- date_of_birth: Date of birth (format: DD/MM/YYYY)
- gender: Male/Female/Transgender
- address: Complete mailing address
- pincode: 6-digit postal code
- state: State name
- district: District name
- city: City/Village/Town name
- house_number: House/building number or name
- street: Street/Road name
- landmark: Nearby landmark (if available)
- enrolment_number: Enrolment ID
- enrolment_date: Date of enrolment
- phone_number: Registered phone number (if mentioned)
- email: Registered email (if mentioned)
- qr_code_data: Data from QR code (if visible)
- photo_description: Description of photo (if mentioned)
`;
        outputFields += `
For Aadhaar output fields include: aadhaar_number, name, date_of_birth, gender, address, pincode, state, district, city, house_number, street, landmark, enrolment_number, enrolment_date, phone_number, email, qr_code_data.
`;
    }

    return `
You are a document parser specialized in Passport and Aadhaar Card extraction.

Analyze the following document text and extract ALL relevant information.

${typeSpecificInstructions}

Rules:
1. Detect document type automatically (Passport or Aadhaar Card)
2. Extract EVERY field you can find - be thorough
3. Preserve original field names from the document
4. For Passports, extract MRZ lines exactly as shown (case sensitive)
5. For Aadhaar, format the 12-digit number with spaces (XXXX XXXX XXXX)
6. Correct OCR mistakes (O vs 0, I vs 1, etc.)
7. Never guess values - if not found, use null
8. Return ONLY valid JSON
9. No markdown, no explanation
10. Format dates as DD/MM/YYYY when possible

Document text to parse:

${rawText}

${outputFields}

Output format:
{
  "document_type": "Passport or Aadhaar Card",
  "fields": {
    // All extracted fields go here
  },
  "tables": [],
  "raw_text": ""
}
`;
};

exports.scanDocument = async (req, res) => {
    try {
        const GenAI = await initGoogleGenAI();
        
        const ai = new GenAI({
            apiKey: process.env.AI_KEY,
        });

        if (!req.body.rawText) {
            return res.status(400).json({
                success: false,
                message: "Raw text of the document is required."
            });
        }

        const rawText = req.body.rawText;
        const docType = req.body.documentType || 'auto';

        const prompt = getDocumentPrompt(rawText, docType);

        const response = await ai.models.generateContent({
           model: "gemini-2.5-flash-lite",
            contents: [{ text: prompt }]
        });

        let result = response.text;

        // Clean response
        result = result
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let parsedData;
        try {
            parsedData = JSON.parse(result);
        } catch (parseError) {
            const jsonMatch = result.match(/\{[^]*\}/);
            if (jsonMatch) {
                try {
                    parsedData = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    throw new Error('Failed to parse document data');
                }
            } else {
                throw new Error('Invalid response format from AI');
            }
        }
        
        parsedData.raw_text = rawText;

        // Post-process for Passport
        const docTypeLower = (parsedData.document_type || '').toLowerCase();
        if (docTypeLower.includes('passport')) {
            if (parsedData.fields) {
                // Format passport dates
                ['date_of_birth', 'date_of_issue', 'date_of_expiry'].forEach(field => {
                    if (parsedData.fields[field]) {
                        const dateStr = String(parsedData.fields[field]).replace(/\s/g, '');
                        if (dateStr.match(/^\d{6}$/)) {
                            const day = dateStr.substring(4, 6);
                            const month = dateStr.substring(2, 4);
                            const year = dateStr.substring(0, 2);
                            const fullYear = parseInt(year) >= 50 ? '19' + year : '20' + year;
                            parsedData.fields[field] = `${day}/${month}/${fullYear}`;
                        } else if (dateStr.match(/^\d{8}$/)) {
                            const year = dateStr.substring(0, 4);
                            const month = dateStr.substring(4, 6);
                            const day = dateStr.substring(6, 8);
                            parsedData.fields[field] = `${day}/${month}/${year}`;
                        }
                    }
                });

                // Ensure MRZ lines are extracted
                if (!parsedData.fields.mrz_line1 || !parsedData.fields.mrz_line2) {
                    const mrzMatches = rawText.match(/[A-Z0-9<]{44}/g);
                    if (mrzMatches && mrzMatches.length >= 2) {
                        if (!parsedData.fields.mrz_line1) parsedData.fields.mrz_line1 = mrzMatches[0];
                        if (!parsedData.fields.mrz_line2) parsedData.fields.mrz_line2 = mrzMatches[1] || '';
                    }
                }
            }
        }

        // Post-process for Aadhaar
        if (docTypeLower.includes('aadhaar')) {
            if (parsedData.fields) {
                // Format Aadhaar number
                if (parsedData.fields.aadhaar_number) {
                    const num = String(parsedData.fields.aadhaar_number).replace(/\D/g, '');
                    if (num.length === 12) {
                        parsedData.fields.aadhaar_number = num.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
                    }
                }

                // Format Aadhaar date of birth
                if (parsedData.fields.date_of_birth) {
                    const dob = String(parsedData.fields.date_of_birth).replace(/\s/g, '');
                    if (dob.match(/^\d{8}$/)) {
                        const year = dob.substring(0, 4);
                        const month = dob.substring(4, 6);
                        const day = dob.substring(6, 8);
                        parsedData.fields.date_of_birth = `${day}/${month}/${year}`;
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: parsedData
        });

    } catch (error) {
        console.error('Error in scanDocument:', error);

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};