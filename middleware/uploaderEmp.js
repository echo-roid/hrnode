const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  S3Client,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');


// ==========================================
// Cloudflare R2 Configuration
// ==========================================

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${"39ad8f0adb576f69d3c5de646f7f2277"}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: "db4232305608047502f8a475b3de1bd6",
    secretAccessKey: "a7881c22ff7b8b0997539ff060d92b78498a0e1dbce60e717f8503ccbf6ae71a",
  }
});



// ==========================================
// Multer
// Local disk ki jagah memory use hogi
// ==========================================

const storage = multer.memoryStorage();

const multerUpload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per file
  },
}).fields([
  { name: 'photo', maxCount: 1 },

  { name: 'Aadhar', maxCount: 1 },
  { name: 'AadharBack', maxCount: 1 },

  { name: 'passportFront', maxCount: 1 },
  { name: 'passportBack', maxCount: 1 },

  { name: 'edu10th', maxCount: 1 },
  { name: 'edu12th', maxCount: 1 },

  { name: 'graduation', maxCount: 1 },
  { name: 'diploma', maxCount: 1 },

  { name: 'panDocument', maxCount: 1 },
  { name: 'cancelCheque', maxCount: 1 },

  { name: 'uanDocument', maxCount: 1 },
]);


// ==========================================
// Upload one file to R2
// ==========================================

const uploadFileToR2 = async (file) => {

  const ext = path.extname(file.originalname);

  const uniqueName =
    `${Date.now()}-${crypto.randomUUID()}${ext}`;


  // R2 folder structure:
  // uploads/photo/xxxxx.jpg
  // uploads/Aadhar/xxxxx.pdf
  // uploads/passportFront/xxxxx.jpg

  const key =
    `uploads/${file.fieldname}/${uniqueName}`;


  const command = new PutObjectCommand({

    Bucket: "marketingereignis",

    Key: key,

    Body: file.buffer,

    ContentType: file.mimetype,

  });


  await r2.send(command);


  // Ye properties controller me use hongi

  file.r2Key = key;

  file.r2Bucket = "marketingereignis";

  // Old req.files structure maintain karne ke liye
  file.filename = uniqueName;

  // Local path ki jagah R2 object key
  file.path = key;


  // Buffer ko upload ke baad memory se reference hata do
  delete file.buffer;


  return file;
};


// ==========================================
// Main Upload Middleware
// ==========================================

const upload = (req, res, next) => {

  multerUpload(req, res, async (err) => {

    if (err) {
      return next(err);
    }


    try {

      if (!req.files) {
        return next();
      }


      // req.files ko flatten karenge
      const allFiles =
        Object.values(req.files).flat();


      // Sab files R2 par upload
      await Promise.all(
        allFiles.map((file) =>
          uploadFileToR2(file)
        )
      );


      next();

    } catch (error) {

      console.error(
        'Cloudflare R2 upload error:',
        error
      );

      next(error);

    }

  });

};


module.exports = upload;
