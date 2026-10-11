
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// Configuration
const CORS_ORIGIN =
  process.env.CORS_ORIGIN || 'http://localhost:3000';

// Middleware Setup
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts, please try again later'
});

// Route Loader Utility
const loadRoute = (routePath, routeName) => {
  try {
    const fullPath = path.join(__dirname, routePath);
    console.log(`Loading ${routeName} from ${fullPath}`);

    const route = require(fullPath);

    if (typeof route !== 'function') {
      throw new Error(
        `Route ${routeName} did not export a valid router`
      );
    }

    console.log(`Successfully loaded ${routeName}`);
    return route;
  } catch (err) {
    console.error(`Failed to load ${routeName}:`, err);
    throw err;
  }
};

// Register API Routes
const registerRoutes = () => {
  app.use('/api/employees',
    loadRoute('./routes/employeeRoutes', 'Employee Routes'));

  app.use('/api/tasks',
    loadRoute('./routes/taskRoutes', 'Task Routes'));

  app.use('/api/calendar',
    loadRoute('./routes/calendarRoutes', 'Calendar Routes'));

  app.use('/api/leads',
    loadRoute('./routes/leadRoutes', 'Leads Routes'));

  app.use('/api/contacts',
    loadRoute('./routes/contactRoutes', 'Contacts Routes'));

  app.use('/api/companies',
    loadRoute('./routes/companyRoutes', 'Company Routes'));

  app.use('/api/forms',
    loadRoute('./routes/formRoutes', 'Form Routes'));

  app.use('/api/guestList',
    loadRoute('./routes/guestListRoute', 'GuestList Routes'));

  app.use('/api/flight-connections',
    loadRoute('./routes/flightConnectionsRoute', 'Flight Connections'));

  app.use('/api/ticket-costing',
    loadRoute('./routes/ticketCostingRoutes', 'Ticket Costing'));

  app.use('/api/pnrs',
    loadRoute('./routes/PnrRoutes', 'PNR Routes'));

  app.use('/api/paxlist',
    loadRoute('./routes/paxListRoute', 'Passenger List Routes'));

  app.use('/api/auth', authLimiter,
    loadRoute('./routes/authRoutes', 'Auth Routes'));

  app.use('/api/divisions',
    loadRoute('./routes/divisionRoutes', 'Division Routes'));

  app.use('/api/attendance', apiLimiter,
    loadRoute('./routes/attendanceRoutes', 'Attendance Routes'));

  app.use('/api/leave', apiLimiter,
    loadRoute('./routes/leaveRoutes', 'Leave Routes'));

  app.use('/api/leave-settings',
    loadRoute('./routes/GlobalLeaveRoute', 'Leave Settings'));

  app.use('/api/reimbursements',
    loadRoute('./routes/reimbursementRoutes', 'Reimbursement Routes'));

  app.use('/api/chat',
    loadRoute('./routes/chatRoutes', 'Chat Routes'));

  app.use('/api/upload',
    loadRoute('./routes/uploadRoutes', 'Upload Routes'));

  app.use('/api/forms',
    loadRoute('./routes/employeeForm', 'Employee Forms'));

  app.use('/api',
    loadRoute('./routes/dynamicRoutes', 'Dynamic Routes'));

  app.use('/api/vendors',
    loadRoute('./routes/vendorRoutes', 'Vendor Routes'));

  app.use('/api/rooms',
    loadRoute('./routes/roomRoutes', 'Room Routes'));

  app.use('/api/qc',
    loadRoute('./routes/qcRoutes', 'QC Routes'));

  app.use('/api/assing-pnr',
    loadRoute('./routes/AssignPnrToPaxRoute', 'Assign PNR Routes'));

  app.use('/api/flight-status',
    loadRoute('./routes/flightStatusRoutes', 'Flight Status Routes'));

  app.use('/api/international-hubs',
    loadRoute('./routes/internationalHubRoutes', 'International Hub Routes'));

  app.use('/api/flights',
    loadRoute('./routes/FlightAPIRoute', 'Flight API Routes'));

  app.use('/api/travel-hubs',
    loadRoute('./routes/travelHub', 'Travel Hub Routes'));

  app.use('/api/hotels',
    loadRoute('./routes/hotelRoutes', 'Hotel Routes'));

  app.use('/api/cabs',
    loadRoute('./routes/cabRoutes', 'Cab Routes'));

  app.use('/api/product',
    loadRoute('./routes/ProductRoute', 'Product Routes'));

  app.use('/api/Operation',
    loadRoute('./routes/OperationVendorsRoute', 'Operation Routes'));

  app.use('/api/Hotels',
    loadRoute('./routes/Pre_PostAssignRoutes', 'Pre/Post Assign Routes'));

  app.use('/api/venue-specifications',
    loadRoute('./routes/venueSpecRoutes', 'Venue Specifications'));

  app.use('/api/hotel-specifications',
    loadRoute('./routes/hotelSpecRoutes', 'Hotel Specifications'));

  app.use('/api/email',
    loadRoute('./routes/emailRoutes', 'Email Routes'));

  app.use('/api',
    loadRoute('./routes/InvoiceOCRRoutes', 'Invoice OCR Routes'));

  app.use('/api',
    loadRoute('./routes/PassportOCRRoute', 'Passport OCR Routes'));

  // app.use('/api', loadRoute('./routes/travelGuideRoutes', 'Travel Guide'));

  app.use('/api',
    loadRoute('./routes/travelGuideMasterRoutes', 'Travel Guide Master'));
};

// Initialize routes
registerRoutes();

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'Check database connection separately',
      socketIO: 'Not initialized in this API module',
      scheduledJobs: 'Configured separately'
    },
    routes: [
      '/api/employees',
      '/api/attendance',
      '/api/leave',
      '/api/tasks',
      '/api/calendar',
      '/api/auth'
    ]
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(
    `[${new Date().toISOString()}] ERROR:`,
    err.stack || err
  );

  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack
      })
    }
  });
});

// Export Express app for Vercel and local server
module.exports = app;
