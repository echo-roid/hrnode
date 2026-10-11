const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const http = require('http');
const cron = require('node-cron');
const { processLeaveDays } = require('./controllers/leaveProcessor');
const socketService = require('./socket/socketService');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ✅ Middleware Setup
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize Socket.io
socketService.initialize(server);

// ✅ Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts, please try again later'
});

// ✅ Route Loader Utility
const loadRoute = (routePath, routeName) => {
  try {
    const fullPath = path.join(__dirname, routePath);
    console.log(`Loading ${routeName} from ${fullPath}`);
    
    const route = require(fullPath);
    if (typeof route !== 'function' && !(route instanceof express.Router)) {
      throw new Error(`Route ${routeName} did not export a valid router`);
    }
    
    console.log(`✅ Successfully loaded ${routeName}`);
    return route;
  } catch (err) {
    console.error(`❌ Failed to load ${routeName}:`, err);
    throw err;
  }
};

// ✅ Route Registration
const registerRoutes = () => {
  try {
    // Core Routes
    app.use('/api/employees', loadRoute('./routes/employeeRoutes', 'Employee Routes'));
    app.use('/api/tasks', loadRoute('./routes/taskRoutes', 'Task Routes'));
    app.use('/api/calendar', loadRoute('./routes/calendarRoutes', 'Calendar Routes'));
    app.use('/api/leads', loadRoute('./routes/leadRoutes', 'Leads Routes'));
    app.use('/api/contacts', loadRoute('./routes/contactRoutes', 'Contacts Routes'));
    app.use('/api/companies', loadRoute('./routes/companyRoutes', 'Company Routes'));
    app.use('/api/forms', loadRoute('./routes/formRoutes', 'form Routes'));
    app.use('/api/guestList', loadRoute('./routes/guestListRoute', 'GuestList Routes'));
    app.use('/api/flight-connections', loadRoute('./routes/flightConnectionsRoute', 'flightConnections Routes'));
    app.use('/api/ticket-costing', loadRoute('./routes/ticketCostingRoutes', 'ticketCosting Routes '));
    app.use('/api/pnrs', loadRoute('./routes/PnrRoutes', 'Pnr Routes'));
    // Authentication Routes  
    app.use('/api/paxlist', loadRoute('./routes/paxListRoute', 'paxList Routes'));
    app.use('/api/auth', authLimiter, loadRoute('./routes/authRoutes', 'Auth Routes'));
    
    app.use("/api/divisions", loadRoute('./routes/divisionRoutes', 'Division Routes'));
    // Attendance System Routes
    app.use('/api/attendance', apiLimiter, loadRoute('./routes/attendanceRoutes', 'Attendance Routes'));
    app.use('/api/leave', apiLimiter, loadRoute('./routes/leaveRoutes', 'Leave Routes'));
    app.use('/api/leave-settings', loadRoute('./routes/GlobalLeaveRoute', 'Leave Settings'));
    
    // Additional Features
    app.use('/api/reimbursements', loadRoute('./routes/reimbursementRoutes', 'Reimbursement Routes'));
    app.use('/api/chat', loadRoute('./routes/chatRoutes', 'Chat Routes'));
    app.use('/api/upload', loadRoute('./routes/uploadRoutes', 'Upload Routes'));
    app.use('/api/forms', loadRoute('./routes/employeeForm', 'Employee Forms'));

    app.use('/api',loadRoute('./routes/dynamicRoutes','Filed Dynomic'));
    app.use('/api/vendors', loadRoute('./routes/vendorRoutes',`vendor Routes`));
    app.use('/api/rooms',  loadRoute('./routes/roomRoutes',`room Routes`));
    app.use('/api/qc', loadRoute('./routes/qcRoutes', 'qc route'));
    app.use('/api/assing-pnr', loadRoute('./routes/AssignPnrToPaxRoute', 'AssignPnrToPax route'));
    app.use('/api/flight-status', loadRoute('./routes/flightStatusRoutes', 'flightStatus routes'));
    app.use('/api/international-hubs', loadRoute('./routes/internationalHubRoutes', 'internationalHub routes'));
    app.use("/api/flights", loadRoute('./routes/FlightAPIRoute', 'FlightAPIRoute routes'));
    app.use("/api/travel-hubs", loadRoute('./routes/travelHub', 'travelHub routes'));
    app.use("/api/hotels", loadRoute('./routes/hotelRoutes', 'hotel routes'));
    app.use("/api/cabs", loadRoute('./routes/cabRoutes', 'cab Routes '));
    app.use("/api/product", loadRoute('./routes/ProductRoute', 'Product Routes'));
    app.use("/api/Operation", loadRoute('./routes/OperationVendorsRoute', 'Operation Routes'));
    app.use("/api/Hotels", loadRoute('./routes/Pre_PostAssignRoutes', 'PrePostAssign Routes'));
    app.use('/api/venue-specifications', loadRoute('./routes/venueSpecRoutes', 'venueSpec Routes'));
    app.use('/api/hotel-specifications', loadRoute('./routes/hotelSpecRoutes', 'hotelSpec Routes'));
    app.use('/api/email', loadRoute('./routes/emailRoutes', 'email Routes'));
     app.use('/api', loadRoute('./routes/InvoiceOCRRoutes', 'InvoiceOCR Routes'));
      app.use('/api', loadRoute('./routes/PassportOCRRoute', 'PassportOC Routes'));
      // app.use('/api', loadRoute('./routes/travelGuideRoutes', 'travelGuide Routes'));
        app.use('/api', loadRoute('./routes/travelGuideMasterRoutes', 'travelGuideMaster Routes'));

  } catch (err) {
    console.error('❌ FATAL: Failed to load routes:', err);
    process.exit(1);
  }
};

// ✅ Initialize Routes
registerRoutes();

// ✅ Scheduled Jobs
const initializeScheduledJobs = () => {
  // Process leave days daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('Running daily leave attendance processor...');
    processLeaveDays().catch(err => {
      console.error('Error in leave processing job:', err);
    });
  });

  // Add other scheduled jobs here if needed
};

// ✅ Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'Connected', // You should add actual DB check
      socketIO: socketService.isInitialized() ? 'Active' : 'Inactive',
      scheduledJobs: 'Running'
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

// ✅ Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.stack);
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// ✅ Start Server
const startServer = () => {
  initializeScheduledJobs();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS enabled for origin: ${CORS_ORIGIN}`);
    console.log(`Available routes:`);
    console.log(`- Attendance: http://localhost:${PORT}/api/attendance`);
    console.log(`- Leave: http://localhost:${PORT}/api/leave`);
    console.log(`- Health: http://localhost:${PORT}/api/health`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
  });
};

startServer();

module.exports = app;