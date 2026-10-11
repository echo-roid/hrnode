const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/* =========================================================================
   LOGIN  —  POST /api/travel-guides/login
   JWT includes `id` so downstream routes know which guide it is
   ========================================================================= */
exports.loginTravelGuide = async (req, res) => {
    const { username, password } = req.body;

    console.log('\n📥 [loginTravelGuide] username:', username);

    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const [rows] = await pool.query(
            'SELECT * FROM travel_guides WHERE username = ? LIMIT 1',
            [String(username).trim().toLowerCase()]
        );

        if (rows.length === 0) {
            console.log('   ❌ No guide with username', username);
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const guide = rows[0];
        console.log('   ✅ Found guide:', guide.id, guide.name);

        if (guide.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact admin.' });
        }

        const ok = await bcrypt.compare(String(password), guide.password_hash || '');
        if (!ok) {
            console.log('   ❌ Password mismatch');
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        // 🔑 JWT MUST include `id` and `role`
        const token = jwt.sign(
            {
                id: guide.id,
                username: guide.username,
                name: guide.name,
                role: 'travel_guide'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        await pool.query(
            'UPDATE travel_guides SET last_login = NOW(), is_verified = 1 WHERE id = ?',
            [guide.id]
        );

        console.log('   ✅ Login OK. Token issued for id =', guide.id);

        return res.json({
            success: true,
            message: 'Login successful',
            token,
            guide: {
                id: guide.id,
                name: guide.name,
                username: guide.username,
                email: guide.email,
                phone: guide.phone,
                city: guide.city,
                languages: guide.languages,
                status: guide.status,
                profile_image: guide.profile_image
            }
        });
    } catch (error) {
        console.error('Error during travel guide login:', error);
        return res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
};

/* =========================================================================
   AUTH MIDDLEWARE
   ========================================================================= */
exports.verifyGuideToken = (req, res, next) => {
    console.log('\n🔐 [verifyGuideToken] HIT for', req.method, req.originalUrl);
    console.log('   Authorization header:', req.headers.authorization ? 'present' : 'MISSING');

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
        console.log('   ❌ No token → 401');
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        console.log('   ✅ Decoded payload:', JSON.stringify(payload));

        if (payload.role !== 'travel_guide') {
            console.log('   ❌ Wrong role:', payload.role);
            return res.status(403).json({ success: false, message: 'Invalid token role' });
        }

        req.guide = payload;
        console.log('   ✅ req.guide.id =', req.guide.id);
        next();
    } catch (err) {
        console.log('   ❌ JWT verify failed:', err.message);
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

/* =========================================================================
   MY PROFILE  —  GET /api/travel-guides/me
   ========================================================================= */
exports.getMyProfile = async (req, res) => {
    console.log('\n📥 [getMyProfile] guideId:', req.guide?.id);
    try {
        const [rows] = await pool.query(
            `SELECT id, name, phone, email, username, profile_image, city, languages,
                    experience_years, notes, status, last_login, created_at
               FROM travel_guides WHERE id = ?`,
            [req.guide.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Guide not found' });
        }
        return res.json({ success: true, guide: rows[0] });
    } catch (error) {
        console.error('Error fetching my profile:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
    }
};

/* =========================================================================
   MY ASSIGNED GUESTS  —  GET /api/travel-guides/me/guests
   ========================================================================= */
exports.getMyAssignedGuests = async (req, res) => {
    const guideId = req.guide?.id;

    if (guideId === undefined || guideId === null) {
        return res.status(401).json({ success: false, message: 'Unauthorized: no guide id in token' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT fs.id, fs.lead_id, fs.form_id, fs.fill_id,
                    fs.data,                                    -- ✅ passenger data (JSON)
                    fs.submitted_at,
                    fs.travel_guide_name, fs.travel_guide_phone,
                    fs.travel_guide_email, fs.travel_guide_notes,
                    fs.travel_guide_approved, fs.travel_guide_assigned_at,
                    fs.qc_status, fs.qc_notes, fs.qc_date,
                    l.client_name, l.sales_person, l.client_coordinator
               FROM form_submissions fs
               LEFT JOIN leads l ON fs.lead_id = l.id
              WHERE CAST(fs.travel_guide_id AS CHAR) = CAST(? AS CHAR)
              ORDER BY fs.travel_guide_assigned_at DESC`,
            [guideId]
        );

        // Parse JSON data column safely
        const parsed = rows.map(r => {
            let parsedData = [];
            try {
                parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || []);
            } catch (e) {
                console.error('Failed to parse data for submission', r.id, e.message);
                parsedData = [];
            }
            return {
                ...r,
                data: parsedData,
                travel_guide_approved: Number(r.travel_guide_approved) === 1
            };
        });

        const total = parsed.length;
        const approved = parsed.filter(r => r.travel_guide_approved).length;
        const pending = total - approved;
            console.log(parsed,":kkjkjk")
        return res.json({
            success: true,
            stats: { total, approved, pending },
            guests: parsed
        });
    } catch (error) {
        console.error('Error fetching my guests:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch guests', error: error.message });
    }
};
/* =========================================================================
   APPROVE GUEST  —  PATCH /api/travel-guides/me/guests/:submissionId/approve
   ========================================================================= */
exports.approveGuestAsGuide = async (req, res) => {
    const guideId = req.guide?.id;
    const { submissionId } = req.params;
    const approved = req.body.approved !== false;

    console.log('\n📥 [approveGuestAsGuide] guideId:', guideId, 'submissionId:', submissionId, 'approved:', approved);

    if (!guideId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, travel_guide_id FROM form_submissions WHERE id = ?',
            [submissionId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }
        if (String(rows[0].travel_guide_id) !== String(guideId)) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this guest' });
        }

        await pool.query(
            'UPDATE form_submissions SET travel_guide_approved = ? WHERE id = ?',
            [approved ? 1 : 0, submissionId]
        );

        return res.json({
            success: true,
            message: approved ? 'Guest approved' : 'Approval revoked'
        });
    } catch (error) {
        console.error('Error approving guest:', error);
        return res.status(500).json({ success: false, message: 'Failed to update approval', error: error.message });
    }
};

/* =========================================================================
   CHANGE OWN PASSWORD
   ========================================================================= */
exports.changeOwnPassword = async (req, res) => {
    const guideId = req.guide?.id;
    const { oldPassword, newPassword } = req.body;

    if (!guideId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!oldPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Old password and new password (>= 6 chars) are required' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM travel_guides WHERE id = ?', [guideId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Guide not found' });

        const guide = rows[0];
        const ok = await bcrypt.compare(String(oldPassword), guide.password_hash || '');
        if (!ok) return res.status(401).json({ success: false, message: 'Old password is incorrect' });

        const newHash = await bcrypt.hash(String(newPassword), 10);
        await pool.query('UPDATE travel_guides SET password_hash = ? WHERE id = ?', [newHash, guideId]);

        return res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        return res.status(500).json({ success: false, message: 'Failed to change password', error: error.message });
    }
};

/* =========================================================================
   CREATE  —  POST /api/travel-guides
   ========================================================================= */
exports.createTravelGuide = async (req, res) => {
    const {
        name, phone = null, email = null, username, password,
        city = null, languages = null, experienceYears = 0,
        notes = null, status = 'active', profileImage = null
    } = req.body;

    try {
        if (!name || !String(name).trim()) return res.status(400).json({ success: false, message: 'Guide name is required' });
        if (!username || !String(username).trim()) return res.status(400).json({ success: false, message: 'Username is required' });
        if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const [dupeUser] = await pool.query(
            'SELECT id FROM travel_guides WHERE username = ? LIMIT 1',
            [String(username).trim().toLowerCase()]
        );
        if (dupeUser.length > 0) {
            return res.status(409).json({ success: false, message: 'Username already taken' });
        }

        const languagesStr = Array.isArray(languages) ? languages.join(', ') : (languages || null);
        const passwordHash = await bcrypt.hash(String(password), 10);

        const [result] = await pool.query(
            `INSERT INTO travel_guides
                (name, phone, email, username, password_hash, city, languages,
                 experience_years, notes, status, profile_image)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name.trim(), phone, email,
                String(username).trim().toLowerCase(),
                passwordHash, city, languagesStr,
                Number(experienceYears) || 0, notes,
                status === 'inactive' ? 'inactive' : 'active',
                profileImage
            ]
        );

        const [rows] = await pool.query(
            `SELECT id, name, phone, email, username, profile_image, city, languages,
                    experience_years, notes, status, created_at, updated_at
               FROM travel_guides WHERE id = ?`,
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: 'Travel guide created successfully',
            guide: rows[0]
        });
    } catch (error) {
        console.error('Error creating travel guide:', error);
        return res.status(500).json({ success: false, message: 'Failed to create travel guide', error: error.message });
    }
};

/* =========================================================================
   LIST  —  GET /api/travel-guides
   ========================================================================= */
exports.listTravelGuides = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 100 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, Math.min(500, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let where = 'WHERE 1=1';
        const params = [];

        if (status && ['active', 'inactive'].includes(status)) {
            where += ' AND status = ?';
            params.push(status);
        }
        if (search && String(search).trim()) {
            where += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR city LIKE ? OR username LIKE ?)';
            const like = `%${search.trim()}%`;
            params.push(like, like, like, like, like);
        }

        const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM travel_guides ${where}`, params);

        const [rows] = await pool.query(
            `SELECT id, name, phone, email, username, profile_image, city, languages,
                    experience_years, notes, status, last_login, created_at, updated_at
               FROM travel_guides ${where}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        return res.json({
            success: true,
            guides: rows,
            pagination: {
                total: countRows[0].total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(countRows[0].total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error listing travel guides:', error);
        return res.status(500).json({ success: false, message: 'Failed to list travel guides', error: error.message });
    }
};

/* =========================================================================
   GET ONE  —  GET /api/travel-guides/:id
   ========================================================================= */
exports.getTravelGuideById = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT id, name, phone, email, username, profile_image, city, languages,
                    experience_years, notes, status, last_login, created_at, updated_at
               FROM travel_guides WHERE id = ?`,
            [id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: `Travel guide ${id} not found` });
        return res.json({ success: true, guide: rows[0] });
    } catch (error) {
        console.error('Error fetching travel guide:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch travel guide', error: error.message });
    }
};

/* =========================================================================
   UPDATE  —  PUT /api/travel-guides/:id
   ========================================================================= */
exports.updateTravelGuide = async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, username, password, city, languages, experienceYears, notes, status, profileImage } = req.body;

    try {
        const [existing] = await pool.query('SELECT * FROM travel_guides WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ success: false, message: `Travel guide ${id} not found` });
        const current = existing[0];

        if (username && username.trim().toLowerCase() !== current.username) {
            const [dupe] = await pool.query(
                'SELECT id FROM travel_guides WHERE username = ? AND id <> ? LIMIT 1',
                [username.trim().toLowerCase(), id]
            );
            if (dupe.length > 0) return res.status(409).json({ success: false, message: 'Username already taken' });
        }

        let passwordHash = current.password_hash;
        if (password && String(password).length >= 6) {
            passwordHash = await bcrypt.hash(String(password), 10);
        }

        const languagesStr = languages === undefined ? current.languages : (Array.isArray(languages) ? languages.join(', ') : languages);
        const imageValue = profileImage === undefined ? current.profile_image : profileImage;

        await pool.query(
            `UPDATE travel_guides
                SET name = ?, phone = ?, email = ?, username = ?, password_hash = ?,
                    city = ?, languages = ?, experience_years = ?, notes = ?, status = ?, profile_image = ?
              WHERE id = ?`,
            [
                name !== undefined ? name : current.name,
                phone !== undefined ? phone : current.phone,
                email !== undefined ? email : current.email,
                username !== undefined ? String(username).trim().toLowerCase() : current.username,
                passwordHash,
                city !== undefined ? city : current.city,
                languagesStr,
                experienceYears !== undefined ? Number(experienceYears) || 0 : current.experience_years,
                notes !== undefined ? notes : current.notes,
                status !== undefined ? status : current.status,
                imageValue, id
            ]
        );

        const [rows] = await pool.query(
            `SELECT id, name, phone, email, username, profile_image, city, languages,
                    experience_years, notes, status, last_login, created_at, updated_at
               FROM travel_guides WHERE id = ?`,
            [id]
        );

        return res.json({ success: true, message: 'Travel guide updated successfully', guide: rows[0] });
    } catch (error) {
        console.error('Error updating travel guide:', error);
        return res.status(500).json({ success: false, message: 'Failed to update travel guide', error: error.message });
    }
};

/* =========================================================================
   DELETE  —  DELETE /api/travel-guides/:id
   ========================================================================= */
exports.deleteTravelGuide = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT profile_image FROM travel_guides WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: `Travel guide ${id} not found` });

        const img = rows[0].profile_image;
        if (img) {
            const p = path.join(__dirname, '..', img.replace(/^\/+/, ''));
            if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} }
        }

        await pool.query('DELETE FROM travel_guides WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Travel guide deleted successfully' });
    } catch (error) {
        console.error('Error deleting travel guide:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete travel guide', error: error.message });
    }
};

/* =========================================================================
   STATUS  —  PATCH /api/travel-guides/:id/status
   ========================================================================= */
exports.setTravelGuideStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: "status must be 'active' or 'inactive'" });
    }
    try {
        const [result] = await pool.query('UPDATE travel_guides SET status = ? WHERE id = ?', [status, id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: `Travel guide ${id} not found` });
        return res.json({ success: true, message: `Travel guide ${status === 'active' ? 'activated' : 'deactivated'}` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
    }
};

/* =========================================================================
   ADMIN RESET PASSWORD
   ========================================================================= */
exports.adminResetPassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'newPassword must be at least 6 characters' });
    }
    try {
        const hash = await bcrypt.hash(String(newPassword), 10);
        const [result] = await pool.query('UPDATE travel_guides SET password_hash = ? WHERE id = ?', [hash, id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Guide not found' });
        return res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
    }
};

/* =========================================================================
   UPLOAD PROFILE IMAGE  —  POST /api/travel-guides/:id/image
   ========================================================================= */
exports.uploadGuideImage = async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided' });

        const [rows] = await pool.query('SELECT profile_image FROM travel_guides WHERE id = ?', [id]);
        if (rows.length === 0) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(404).json({ success: false, message: 'Travel guide not found' });
        }

        const oldImage = rows[0].profile_image;
        if (oldImage) {
            const oldPath = path.join(__dirname, '..', oldImage.replace(/^\/+/, ''));
            if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
        }

        const publicUrl = `/uploads/travel-guides/${req.file.filename}`;
        await pool.query('UPDATE travel_guides SET profile_image = ? WHERE id = ?', [publicUrl, id]);

        return res.json({
            success: true,
            message: 'Profile image uploaded successfully',
            profile_image: publicUrl
        });
    } catch (error) {
        console.error('Error uploading guide image:', error);
        if (req.file?.path && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
        return res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
    }
};

/* =========================================================================
   DELETE PROFILE IMAGE
   ========================================================================= */
exports.deleteGuideImage = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT profile_image FROM travel_guides WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Travel guide not found' });

        const currentImage = rows[0].profile_image;
        if (currentImage) {
            const oldPath = path.join(__dirname, '..', currentImage.replace(/^\/+/, ''));
            if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
        }

        await pool.query('UPDATE travel_guides SET profile_image = NULL WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Profile image removed' });
    } catch (error) {
        console.error('Error deleting guide image:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete image', error: error.message });
    }
};