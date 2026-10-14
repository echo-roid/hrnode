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
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 24433),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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
