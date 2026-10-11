// controllers/flightConnectionController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Create a new journey with multiple connections
// Create a new journey with multiple connections
const createJourney = async (req, res) => {
  try {
    const { lead_id, connections, journey_type } = req.body;

    console.log('=== CREATE JOURNEY REQUEST ===');
    console.log('Lead ID:', lead_id);
    console.log('Journey Type:', journey_type);
    console.log('Connections received:', JSON.stringify(connections, null, 2));
    console.log('==============================');

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    // Process connections based on structure
    let processedConnections = [];

    if (connections && Array.isArray(connections)) {
      // Handle nested structure (like roundtrip with outbound/return)
      if (connections.length > 0 && (connections[0].outbound || connections[0].return)) {
        console.log('Detected nested connection structure');
        
        connections.forEach((leg, legIndex) => {
          // Process outbound flight if exists
          if (leg.outbound) {
            processedConnections.push({
              ...leg.outbound,
              leg_order: (legIndex * 2) + 1,
              trip_leg_index: legIndex,
              trip_type: leg.trip_type || 'roundtrip',
              flight_direction: leg.outbound.flight_direction || 'onward'  // ← ADD THIS
            });
          }
          
          // Process return flight if exists
          if (leg.return) {
            processedConnections.push({
              ...leg.return,
              leg_order: (legIndex * 2) + 2,
              trip_leg_index: legIndex,
              trip_type: leg.trip_type || 'roundtrip',
              flight_direction: leg.return.flight_direction || 'return'  // ← ADD THIS
            });
          }
        });
      } else {
        // Handle flat connections array (existing format)
        console.log('Detected flat connection structure');
        processedConnections = connections.map((conn, index) => ({
          ...conn,
          leg_order: index + 1,
          flight_direction: conn.flight_direction || 'onward'  // ← ADD THIS
        }));
      }
    }

    console.log('Processed connections:', JSON.stringify(processedConnections, null, 2));

    if (processedConnections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid connections found in request'
      });
    }

    // Validate each connection
    for (const [index, connection] of processedConnections.entries()) {
      console.log(`\n=== Validating Connection ${index + 1} ===`);
      console.log(`Flight Direction: ${connection.flight_direction}`);  // ← LOG THIS
      
      if (!connection.flight_number || !connection.from_airport || !connection.to_airport) {
        console.error(`Connection ${index + 1} missing required fields`);
        return res.status(400).json({
          success: false,
          message: `Connection ${index + 1} must have flight_number, from_airport, and to_airport`
        });
      }

      // Debug flight number in detail
      const originalFlightNumber = connection.flight_number;
      console.log('Flight Number Analysis:');
      console.log('  Original value:', `"${originalFlightNumber}"`);
      console.log('  Type:', typeof originalFlightNumber);
      console.log('  Length:', originalFlightNumber.length);
      
      // Check for invisible characters
      const invisibleChars = [];
      Array.from(originalFlightNumber).forEach((char, i) => {
        const code = char.charCodeAt(0);
        if (code < 32 || code === 127) {
          invisibleChars.push({ position: i, char: char, code: code });
        }
      });
      
      if (invisibleChars.length > 0) {
        console.log('  Invisible characters found:', invisibleChars);
      }

      // Clean the flight number
      let cleanedFlightNumber = originalFlightNumber.toString();
      
      // Remove control characters (0-31, 127)
      cleanedFlightNumber = cleanedFlightNumber.replace(/[\x00-\x1F\x7F]/g, '');
      
      // Remove any leading/trailing whitespace
      cleanedFlightNumber = cleanedFlightNumber.trim();
      
      // Remove spaces within flight number (common in format like "LX 155" -> "LX155")
      cleanedFlightNumber = cleanedFlightNumber.replace(/\s+/g, '');
      
      // Truncate to 20 characters if still too long
      if (cleanedFlightNumber.length > 20) {
        console.log(`  Warning: Flight number length ${cleanedFlightNumber.length} > 20, truncating`);
        cleanedFlightNumber = cleanedFlightNumber.substring(0, 20);
      }
      
      console.log('  Cleaned value:', `"${cleanedFlightNumber}"`);
      console.log('  Cleaned length:', cleanedFlightNumber.length);
      
      // Update the connection with cleaned data
      connection.flight_number = cleanedFlightNumber;
      
      // Clean other string fields
      if (connection.from_airport) {
        connection.from_airport = connection.from_airport.toString().replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 4);
        console.log(`  From Airport: "${connection.from_airport}" (length: ${connection.from_airport.length})`);
      }
      
      if (connection.to_airport) {
        connection.to_airport = connection.to_airport.toString().replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 4);
        console.log(`  To Airport: "${connection.to_airport}" (length: ${connection.to_airport.length})`);
      }
      
      if (connection.dep_terminal) {
        connection.dep_terminal = connection.dep_terminal.toString().replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 10);
      }
      
      if (connection.arv_terminal) {
        connection.arv_terminal = connection.arv_terminal.toString().replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 10);
      }

      // Validate flight_direction
      if (!connection.flight_direction || !['onward', 'return'].includes(connection.flight_direction)) {
        console.log(`  Setting default flight_direction: onward`);
        connection.flight_direction = 'onward';
      }

      // Final validation after cleaning
      if (!connection.flight_number || connection.flight_number.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Flight number for connection ${index + 1} is invalid after cleaning`
        });
      }

      if (connection.flight_number.length > 20) {
        console.error(`Flight number still too long after cleaning: ${connection.flight_number.length} chars`);
        return res.status(400).json({
          success: false,
          message: `Flight number '${connection.flight_number}' exceeds maximum length of 20 characters`
        });
      }
    }

    const journeyId = uuidv4();
    console.log(`\n=== Creating Journey ${journeyId} ===`);
    
    const connectionPromises = processedConnections.map(async (connection, index) => {
      const {
        flight_number,
        from_airport,
        to_airport,
        dep_time,
        dep_date,
        arv_time,
        arv_date,
        dep_terminal,
        arv_terminal,
        leg_order = index + 1, // Use provided leg_order or default to index+1
        flight_direction  // ← ADD THIS
      } = connection;

      console.log(`\nInserting connection ${index + 1}:`);
      console.log(`  Flight: ${flight_number}`);
      console.log(`  Route: ${from_airport} → ${to_airport}`);
      console.log(`  Leg Order: ${leg_order}`);
      console.log(`  Flight Direction: ${flight_direction}`);  // ← LOG THIS

      // ← UPDATED SQL to include flight_direction column
      const sql = `
        INSERT INTO flight_connections 
        (lead_id, journey_id, flight_number, from_airport, to_airport, dep_time, dep_date, arv_time, arv_date, dep_terminal, arv_terminal, leg_order, flight_direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      try {
        const [result] = await db.execute(sql, [
          lead_id,
          journeyId,
          flight_number,
          from_airport,
          to_airport,
          dep_time,
          dep_date,
          arv_time,
          arv_date,
          dep_terminal || null,
          arv_terminal || null,
          leg_order,
          flight_direction  // ← ADD THIS
        ]);

        console.log(`  Success! Inserted with ID: ${result.insertId}`);
        return { 
          id: result.insertId, 
          journey_id: journeyId,
          leg_order,
          flight_direction,  // ← ADD THIS
          ...connection 
        };
      } catch (dbError) {
        console.error(`  Database error for connection ${index + 1}:`, dbError.message);
        console.error(`  SQL:`, sql);
        console.error(`  Params:`, [
          lead_id,
          journeyId,
          flight_number,
          from_airport,
          to_airport,
          dep_time,
          dep_date,
          arv_time,
          arv_date,
          dep_terminal,
          arv_terminal,
          leg_order,
          flight_direction  // ← ADD THIS
        ]);
        throw dbError;
      }
    });

    const createdConnections = await Promise.all(connectionPromises);

    res.status(201).json({
      success: true,
      message: 'Journey created successfully',
      journey_id: journeyId,
      journey_type: req.body.journey_type,
      total_price: req.body.total_price,
      connections: createdConnections
    });

  } catch (error) {
    console.error('\n=== ERROR CREATING JOURNEY ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      console.error('SQL that caused error:', error.sql);
      console.error('SQL Message:', error.sqlMessage);
      
      // Extract which column is causing the issue
      const columnMatch = error.sqlMessage.match(/column '([^']+)'/);
      const columnName = columnMatch ? columnMatch[1] : 'unknown';
      
      return res.status(400).json({
        success: false,
        message: `Data too long for database column '${columnName}'. Please check your input data.`,
        detail: `Database error: ${error.sqlMessage}`,
        suggestion: 'Ensure flight numbers are under 20 characters and airport codes are under 4 characters.'
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
      return res.status(400).json({
        success: false,
        message: 'Invalid lead_id. The specified lead does not exist.'
      });
    }
    
    if (error.code === 'ER_BAD_FIELD_ERROR' && error.sqlMessage.includes('flight_direction')) {
      // Handle case where column doesn't exist yet
      console.error('flight_direction column may not exist in database');
      return res.status(500).json({
        success: false,
        message: 'Database schema update required: flight_direction column missing',
        suggestion: 'Please run ALTER TABLE flight_connections ADD COLUMN flight_direction VARCHAR(10) DEFAULT "onward"'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all journeys for a lead
const getJourneys = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    console.log(`Fetching journeys for lead ID: ${lead_id}`);

    const sql = `
      SELECT * FROM flight_connections 
      WHERE lead_id = ? 
      ORDER BY journey_id, leg_order
    `;

    const [rows] = await db.execute(sql, [lead_id]);
    
    console.log(`Found ${rows.length} flight connections`);
    
    // Group by journey_id
    const journeys = {};
    rows.forEach(row => {
      if (!journeys[row.journey_id]) {
        journeys[row.journey_id] = [];
      }
      journeys[row.journey_id].push(row);
    });

    // Convert to array
    const journeysArray = Object.values(journeys);

    // Log flight direction stats for debugging
    journeysArray.forEach((journey, index) => {
      const onwardCount = journey.filter(f => f.flight_direction === 'onward').length;
      const returnCount = journey.filter(f => f.flight_direction === 'return').length;
      console.log(`Journey ${index + 1} (${journey[0].journey_id}): ${onwardCount} onward, ${returnCount} return flights`);
    });

    res.json({
      success: true,
      journeys: journeysArray,
      meta: {
        total_journeys: journeysArray.length,
        total_flights: rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching journeys:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get specific journey
const getJourney = async (req, res) => {
  try {
    const { lead_id, journey_id } = req.params;

    if (!lead_id || !journey_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and Journey ID are required'
      });
    }

    const sql = `
      SELECT * FROM flight_connections 
      WHERE lead_id = ? AND journey_id = ? 
      ORDER BY leg_order
    `;

    const [connections] = await db.execute(sql, [lead_id, journey_id]);

    if (connections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Journey not found'
      });
    }

    res.json({
      success: true,
      journey: {
        journey_id: journey_id,
        lead_id: lead_id,
        connections: connections
      }
    });

  } catch (error) {
    console.error('Error fetching journey:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update a journey
const updateJourney = async (req, res) => {
  try {
    const { lead_id, journey_id } = req.params;
    const { connections } = req.body;

    if (!connections || !Array.isArray(connections) || connections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Connections array is required'
      });
    }

    // Validate each connection
    for (const connection of connections) {
      if (!connection.flight_number || !connection.from_airport || !connection.to_airport) {
        return res.status(400).json({
          success: false,
          message: 'Each connection must have flight_number, from_airport, and to_airport'
        });
      }
    }

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Delete existing connections for this journey
      const deleteSql = 'DELETE FROM flight_connections WHERE lead_id = ? AND journey_id = ?';
      await connection.execute(deleteSql, [lead_id, journey_id]);

      // Create new connections
      const connectionPromises = connections.map(async (conn, index) => {
        const insertSql = `
          INSERT INTO flight_connections 
          (lead_id, journey_id, flight_number, from_airport, to_airport, dep_time, dep_date, arv_time, arv_date, dep_terminal, arv_terminal, leg_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.execute(insertSql, [
          lead_id,
          journey_id,
          conn.flight_number,
          conn.from_airport,
          conn.to_airport,
          conn.dep_time,
          conn.dep_date,
          conn.arv_time,
          conn.arv_date,
          conn.dep_terminal,
          conn.arv_terminal,
          index + 1
        ]);

        return { id: result.insertId, ...conn };
      });

      const updatedConnections = await Promise.all(connectionPromises);
      await connection.commit();

      res.json({
        success: true,
        message: 'Journey updated successfully',
        connections: updatedConnections
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error updating journey:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete a journey
const deleteJourney = async (req, res) => {
  try {
    const { lead_id, journey_id } = req.params;

    if (!lead_id || !journey_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and Journey ID are required'
      });
    }

    const sql = 'DELETE FROM flight_connections WHERE lead_id = ? AND journey_id = ?';
    const [result] = await db.execute(sql, [lead_id, journey_id]);

    res.json({
      success: true,
      message: 'Journey deleted successfully',
      deleted_connections: result.affectedRows
    });

  } catch (error) {
    console.error('Error deleting journey:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get airport information
const getAirportInfo = async (req, res) => {
  try {
    const { airport_code } = req.params;

    if (!airport_code) {
      return res.status(400).json({
        success: false,
        message: 'Airport code is required'
      });
    }

    // Hardcoded airport data
    const airportData = {
      'DEL': { name: 'Indira Gandhi International Airport', coordinates: [77.1025, 28.5562] },
      'BOM': { name: 'Chhatrapati Shivaji Maharaj International Airport', coordinates: [72.8656, 19.0896] },
      'MAA': { name: 'Chennai International Airport', coordinates: [80.1699, 12.9941] },
      'BLR': { name: 'Kempegowda International Airport', coordinates: [77.7064, 12.9494] },
      'HYD': { name: 'Rajiv Gandhi International Airport', coordinates: [78.4294, 17.2403] },
      'CCU': { name: 'Netaji Subhash Chandra Bose International Airport', coordinates: [88.4467, 22.6547] },
      'DXB': { name: 'Dubai International Airport', coordinates: [55.3657, 25.2532] },
      'LHR': { name: 'Heathrow Airport', coordinates: [-0.4543, 51.4700] },
      'JFK': { name: 'John F. Kennedy International Airport', coordinates: [-73.7781, 40.6413] },
      'SIN': { name: 'Singapore Changi Airport', coordinates: [103.9915, 1.3644] }
    };

    const airportInfo = airportData[airport_code.toUpperCase()];
    
    if (!airportInfo) {
      return res.status(404).json({
        success: false,
        message: 'Airport not found'
      });
    }

    res.json({
      success: true,
      airport: {
        code: airport_code.toUpperCase(),
        ...airportInfo
      }
    });

  } catch (error) {
    console.error('Error fetching airport info:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get journey statistics
const getJourneyStats = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    const statsSql = `
      SELECT 
        COUNT(DISTINCT journey_id) as total_journeys,
        COUNT(*) as total_connections,
        AVG(leg_count) as avg_legs_per_journey
      FROM (
        SELECT journey_id, COUNT(*) as leg_count
        FROM flight_connections 
        WHERE lead_id = ?
        GROUP BY journey_id
      ) as journey_legs
    `;

    const [stats] = await db.execute(statsSql, [lead_id]);
    
    // Get most frequent routes
    const routesSql = `
      SELECT from_airport, to_airport, COUNT(*) as frequency
      FROM flight_connections 
      WHERE lead_id = ?
      GROUP BY from_airport, to_airport
      ORDER BY frequency DESC
      LIMIT 5
    `;

    const [routes] = await db.execute(routesSql, [lead_id]);

    res.json({
      success: true,
      stats: {
        ...stats[0],
        popular_routes: routes
      }
    });

  } catch (error) {
    console.error('Error fetching journey stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all airports used by a lead
const getLeadAirports = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    const sql = `
      SELECT DISTINCT from_airport as airport_code 
      FROM flight_connections WHERE lead_id = ?
      UNION 
      SELECT DISTINCT to_airport as airport_code 
      FROM flight_connections WHERE lead_id = ?
    `;

    const [rows] = await db.execute(sql, [lead_id, lead_id]);
    
    // Hardcoded airport data
    const airportData = {
      'DEL': { name: 'Indira Gandhi International Airport', coordinates: [77.1025, 28.5562] },
      'BOM': { name: 'Chhatrapati Shivaji Maharaj International Airport', coordinates: [72.8656, 19.0896] },
      'MAA': { name: 'Chennai International Airport', coordinates: [80.1699, 12.9941] },
      'BLR': { name: 'Kempegowda International Airport', coordinates: [77.7064, 12.9494] },
      'HYD': { name: 'Rajiv Gandhi International Airport', coordinates: [78.4294, 17.2403] },
      'CCU': { name: 'Netaji Subhash Chandra Bose International Airport', coordinates: [88.4467, 22.6547] },
      'DXB': { name: 'Dubai International Airport', coordinates: [55.3657, 25.2532] },
      'LHR': { name: 'Heathrow Airport', coordinates: [-0.4543, 51.4700] },
      'JFK': { name: 'John F. Kennedy International Airport', coordinates: [-73.7781, 40.6413] },
      'SIN': { name: 'Singapore Changi Airport', coordinates: [103.9915, 1.3644] }
    };

    const airports = rows.map(row => {
      const airportInfo = airportData[row.airport_code] || { 
        name: `${row.airport_code} Airport`, 
        coordinates: [78.0, 22.0] 
      };
      
      return {
        code: row.airport_code,
        ...airportInfo
      };
    });

    res.json({
      success: true,
      airports: airports
    });

  } catch (error) {
    console.error('Error fetching lead airports:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createJourney,
  getJourneys,
  getJourney,
  updateJourney,
  deleteJourney,
  getAirportInfo,
  getJourneyStats,
  getLeadAirports
};