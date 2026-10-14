// // cls
// const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root', // replace with your MySQL username
//   password: 'itinerary@123', // replace with your MySQL password
//   database: 'employee_db',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0  
//     // host:"auth-db672.hstgr.io",
//     // user: "u339252844_HRpanel",
//     // password: "HRpanel@123",
//     // database: "u339252844_HRpanel",
//     // port: 3306,
// });

// module.exports = pool;



const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: "mysql-98a0b01-labail787-7142.i.aivencloud.com",
  port: Number(process.env.DB_PORT || 24433),
  user: "avnadmin",
  password: "AVNS_rQZC3_tzaZ0ZVbYKRoO",
  database:"defaultdb",
  ssl: {
    ca: fs.readFileSync(
      path.join(__dirname, '..', 'ca.pem'),
      'utf8'
    ),
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
