
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const taskRoutes = require('./routes/taskRoutes.js');
const calendarRoutes = require('./routes/calendarRoutes.js');
const leadRoutes = require('./routes/leadRoutes.js');
const contactRoutes = require('./routes/contactRoutes.js');
const companyRoutes = require('./routes/companyRoutes.js');
const formRoutes = require('./routes/formRoutes.js');
const guestListRoutes = require('./routes/guestListRoute.js');
const flightConnectionsRoutes = require('./routes/flightConnectionsRoute.js');
const ticketCostingRoutes = require('./routes/ticketCostingRoutes.js');
const pnrRoutes = require('./routes/PnrRoutes.js');
const paxListRoutes = require('./routes/paxListRoute.js');
const authRoutes = require('./routes/authRoutes.js');
const divisionRoutes = require('./routes/divisionRoutes.js');
const attendanceRoutes = require('./routes/attendanceRoutes.js');
const leaveRoutes = require('./routes/leaveRoutes.js');
const globalLeaveRoutes = require('./routes/GlobalLeaveRoute.js');
const reimbursementRoutes = require('./routes/reimbursementRoutes.js');
const chatRoutes = require('./routes/chatRoutes.js');
const uploadRoutes = require('./routes/uploadRoutes.js');
const employeeFormRoutes = require('./routes/employeeForm.js');
const dynamicRoutes = require('./routes/dynamicRoutes.js');
const vendorRoutes = require('./routes/vendorRoutes.js');
const roomRoutes = require('./routes/roomRoutes.js');
const qcRoutes = require('./routes/qcRoutes.js');
const assignPnrRoutes = require('./routes/AssignPnrToPaxRoute.js');
const flightStatusRoutes = require('./routes/flightStatusRoutes.js');
const internationalHubRoutes = require('./routes/internationalHubRoutes.js');
const flightApiRoutes = require('./routes/FlightAPIRoute.js');
const travelHubRoutes = require('./routes/travelHub.js');
const hotelRoutes = require('./routes/hotelRoutes.js');
const cabRoutes = require('./routes/cabRoutes.js');
const productRoutes = require('./routes/ProductRoute.js');
const operationRoutes = require('./routes/OperationVendorsRoute.js');
const prePostAssignRoutes = require('./routes/Pre_PostAssignRoutes.js');
const venueSpecRoutes = require('./routes/venueSpecRoutes.js');
const hotelSpecRoutes = require('./routes/hotelSpecRoutes.js');
const emailRoutes = require('./routes/emailRoutes.js');
const invoiceOCRRoutes = require('./routes/InvoiceOCRRoutes.js');
const passportOCRRoutes = require('./routes/PassportOCRRoute.js');
const travelGuideMasterRoutes = require('./routes/travelGuideMasterRoutes.js');
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
app.use('/api/employees', employeeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/guestList', guestListRoutes);
app.use('/api/flight-connections', flightConnectionsRoutes);
app.use('/api/ticket-costing', ticketCostingRoutes);
app.use('/api/pnrs', pnrRoutes);
app.use('/api/paxlist', paxListRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/attendance', apiLimiter, attendanceRoutes);
app.use('/api/leave', apiLimiter, leaveRoutes);
app.use('/api/leave-settings', globalLeaveRoutes);
app.use('/api/reimbursements', reimbursementRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/forms', employeeFormRoutes);
app.use('/api', dynamicRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/assing-pnr', assignPnrRoutes);
app.use('/api/flight-status', flightStatusRoutes);
app.use('/api/international-hubs', internationalHubRoutes);
app.use('/api/flights', flightApiRoutes);
app.use('/api/travel-hubs', travelHubRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/cabs', cabRoutes);
app.use('/api/product', productRoutes);
app.use('/api/Operation', operationRoutes);
app.use('/api/Hotels', prePostAssignRoutes);
app.use('/api/venue-specifications', venueSpecRoutes);
app.use('/api/hotel-specifications', hotelSpecRoutes);
app.use('/api/email', emailRoutes);
app.use('/api', invoiceOCRRoutes);
app.use('/api', passportOCRRoutes);
app.use('/api', travelGuideMasterRoutes);
}

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
