
require('dotenv').config();

const http = require('http');
const app = require('./appos');
const pool = require('./config/db');

pool.execute('SELECT 1')
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection failed:', err));

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const cron = require('node-cron');
  const socketService = require('./socket/socketService');
  const { processLeaveDays } = require('./controllers/leaveProcessor');

  const server = http.createServer(app);

  socketService.initialize(server);

  cron.schedule('0 0 * * *', async () => {
    try {
      await processLeaveDays();
    } catch (err) {
      console.error('Leave processing failed:', err);
    }
  });

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Employees: http://localhost:${PORT}/api/employees`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
