const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  S3Client,
  PutObjectCommand
} = require('@aws-sdk/client-s3');

const attendanceController = require('../controllers/attendanceController');


// ======================================================
// Cloudflare R2 Client
// ======================================================

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${"39ad8f0adb576f69d3c5de646f7f2277"}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: "db4232305608047502f8a475b3de1bd6",
    secretAccessKey: "a7881c22ff7b8b0997539ff060d92b78498a0e1dbce60e717f8503ccbf6ae71a",
  }
});


// ======================================================
// Multer Memory Storage
// File local uploads/ folder me save nahi hogi
// ======================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});


// ======================================================
// Upload attendance photo to Cloudflare R2
// ======================================================

const uploadAttendancePhotoToR2 = async (req, res, next) => {
  try {

    // Agar photo nahi aayi to controller continue kare
    if (!req.file) {
      return next();
    }


    const extension = path.extname(req.file.originalname);


    const fileName =
      `${Date.now()}-${crypto.randomUUID()}${extension}`;


    // R2 folder
    const key =
      `attendance/${fileName}`;


    await r2.send(
      new PutObjectCommand({
        Bucket: "marketingereignis",
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );


    // Controller compatibility
    req.file.filename = fileName;

    req.file.path = key;

    req.file.r2Key = key;

    req.file.r2Bucket =
      "marketingereignis";


    // Buffer upload ho chuka hai
    delete req.file.buffer;


    next();

  } catch (error) {

    console.error(
      'Attendance photo R2 upload error:',
      error
    );

    next(error);
  }
};


// ======================================================
// Routes
// ======================================================


// CHECK-IN
router.post(
  '/check-in',

  upload.single('photo'),

  uploadAttendancePhotoToR2,

  attendanceController.checkIn
);


// CHECK-OUT
router.post(
  '/check-out',

  upload.single('photo'),

  uploadAttendancePhotoToR2,

  attendanceController.checkOut
);


// Get attendance records
router.get(
  '/',
  attendanceController.getAttendanceRecords
);


// Get employee attendance
router.get(
  '/employee/:employeeId',
  attendanceController.getEmployeeAttendance
);


router.get(
  '/all',
  attendanceController.getAllEmployeesAttendance
);


// Get team attendance
router.get(
  '/team/:teamName',
  attendanceController.getTeamAttendance
);


router.get(
  '/today-present-by-team',
  attendanceController.getTodayPresentEmployeesByTeam
);


router.get(
  '/summary',
  attendanceController.getAttendanceSummary
);


router.get(
  '/summary_all',
  attendanceController.getAttendanceSummaryAll
);


module.exports = router;
