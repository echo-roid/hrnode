
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  S3Client,
  PutObjectCommand
} = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${"39ad8f0adb576f69d3c5de646f7f2277"}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: "db4232305608047502f8a475b3de1bd6",
    secretAccessKey: "a7881c22ff7b8b0997539ff060d92b78498a0e1dbce60e717f8503ccbf6ae71a",
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
        Bucket: "marketingereignis",
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
