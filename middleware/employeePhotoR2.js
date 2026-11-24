
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  S3Client,
  PutObjectCommand
} = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

// Local disk ki jagah memory storage
const uploadEmployeePhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG and WEBP allowed'));
    }

    cb(null, true);
  }
});

// Employee Photo → Cloudflare R2
const saveEmployeePhotoToR2 = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    const ext = path.extname(req.file.originalname);

    const fileName =
      `${Date.now()}-${crypto.randomUUID()}${ext}`;

    const key = `employees/${fileName}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );

    req.file.filename = fileName;
    req.file.path = key;
    req.file.r2Key = key;

    delete req.file.buffer;

    console.log('Employee photo uploaded to R2:', key);

    next();

  } catch (error) {
    console.error('Employee R2 Upload Error:', error);
    next(error);
  }
};

module.exports = {
  uploadEmployeePhoto,
  saveEmployeePhotoToR2
};
