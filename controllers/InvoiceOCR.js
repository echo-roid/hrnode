// Use dynamic import for the ES module
let GoogleGenAI;

const initGoogleGenAI = async () => {
    if (!GoogleGenAI) {
        const module = await import('@google/genai');
        GoogleGenAI = module.GoogleGenAI;
    }
    return GoogleGenAI;
};

exports.scanDocument = async (req, res) => {
    try {
        // Initialize the GoogleGenAI class
        const GenAI = await initGoogleGenAI();
        
        const ai = new GenAI({
            apiKey: process.env.AI_KEY,
        });

        // Check if raw text is provided in the request body
        if (!req.body.rawText) {
            return res.status(400).json({
                success: false,
                message: "Raw text of the document is required."
            });
        }

        const rawText = req.body.rawText;

        const prompt = `
You are an intelligent document parser.

Parse and extract ONLY the following specific fields from the document text:

1. vendor name
2. invoice number
3. date of invoice
4. gst number
5. base amount
6. cgst
7. sgst
8. igst
9. total amount

Rules:
1. Extract ONLY these 9 specific fields.
2. If a field is not found, use null.
3. Correct obvious OCR mistakes.
4. Never guess values.
5. Return ONLY valid JSON.
6. No markdown.
7. No explanation.

Here is the document text to parse:

${rawText}

Output format (return ONLY these fields):
{
  "vendor_name": null,
  "invoice_number": null,
  "date_of_invoice": null,
  "gst_number": null,
  "base_amount": null,
  "cgst": null,
  "sgst": null,
  "igst": null,
  "total_amount": null
}
`;

        // Use a valid Gemini model
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
                {
                    text: prompt
                }
            ]
        });

        let result = response.text;

        // Clean the response
        result = result
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const parsedData = JSON.parse(result);

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


