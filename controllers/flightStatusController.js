// controllers/flightStatusController.js
const db = require('../config/db');

/* =========================================================
   CONTROLLER 1: DASHBOARD
========================================================= */
const getFlightStatusDashboard = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    // FIXED SQL: Show flights from yesterday to 2 days ahead, including multi-day flights
    const sql = `
      SELECT 
        fc.*,
        CASE 
          WHEN fc.dep_date < CURDATE() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time < CURTIME() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 'scheduled'
          ELSE 'upcoming'
        END as departure_status,
        CASE 
          WHEN fc.arv_date < CURDATE() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time < CURTIME() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 'enroute'
          ELSE 'upcoming'
        END as arrival_status,
        TIMESTAMP(CONCAT(fc.dep_date, ' ', fc.dep_time)) as departure_datetime,
        TIMESTAMP(CONCAT(fc.arv_date, ' ', fc.arv_time)) as arrival_datetime
      FROM flight_connections fc
      WHERE fc.lead_id = ?
        AND (
          -- Show flights departing in the next 2 days
          fc.dep_date BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY
          -- OR flights arriving in the next 2 days (for multi-day flights)
          OR fc.arv_date BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY
          -- OR flights that are currently in air (spanning multiple days)
          OR (fc.dep_date <= CURDATE() AND fc.arv_date >= CURDATE())
        )
      ORDER BY 
        CASE 
          -- Current day departures first
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 1
          -- Flights in air right now
          WHEN fc.dep_date <= CURDATE() AND fc.arv_date >= CURDATE() THEN 2
          -- Today's arrivals
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 3
          -- Tomorrow's flights
          WHEN fc.dep_date = CURDATE() + INTERVAL 1 DAY THEN 4
          -- Other upcoming flights
          ELSE 5
        END,
        fc.dep_date, 
        fc.dep_time
    `;

    const [flights] = await db.execute(sql, [lead_id]);

    const categorizedFlights = {
      departingToday: [],
      arrivingToday: [],
      departed: [],
      arrived: [],
      upcoming: [],
      inAir: [] // NEW: Separate category for flights in air
    };

    const today = new Date().toISOString().split('T')[0];

    flights.forEach(flight => {
      try {
        const status = getFlightStatusCode(flight);

        const flightWithStatus = {
          ...flight,
          status,
          timeStatus: getTimeStatus(flight),
          progress: calculateFlightProgress(flight),
          nextAction: getNextAction(flight, status),
          displayStatus: getDisplayStatus(status),
          formattedDates: {
            dep_date: formatDisplayDate(flight.dep_date),
            arv_date: formatDisplayDate(flight.arv_date)
          }
        };

        // FIXED: Better categorization logic
        if (status === 'in_air') {
          categorizedFlights.inAir.push(flightWithStatus);
        } else if (status === 'scheduled' && flight.dep_date === today) {
          categorizedFlights.departingToday.push(flightWithStatus);
        } else if (status === 'arrived' && flight.arv_date === today) {
          categorizedFlights.arrived.push(flightWithStatus);
        } else if (flight.arv_date === today && status !== 'arrived') {
          categorizedFlights.arrivingToday.push(flightWithStatus);
        } else if (flight.dep_date === today && status === 'departed') {
          categorizedFlights.departed.push(flightWithStatus);
        } else if (status === 'upcoming') {
          categorizedFlights.upcoming.push(flightWithStatus);
        }

      } catch (flightError) {
        console.error(`Error processing flight ${flight.id}:`, flightError.message);
        // Skip this flight but continue processing others
      }
    });

    const stats = {
      totalFlights: flights.length,
      departingToday: categorizedFlights.departingToday.length,
      arrivingToday: categorizedFlights.arrivingToday.length,
      inAir: categorizedFlights.inAir.length, // Now using the dedicated inAir category
      completed: categorizedFlights.arrived.length,
      upcoming: categorizedFlights.upcoming.length
    };

    res.json({
      success: true,
      dashboard: {
        stats,
        flights: categorizedFlights,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* =========================================================
   CONTROLLER 2: SINGLE FLIGHT DETAILS
========================================================= */
const getFlightStatus = async (req, res) => {
  try {
    const { lead_id, connection_id } = req.params;

    if (!lead_id || !connection_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and Connection ID are required'
      });
    }

    const sql = `
      SELECT 
        fc.*,
        CASE 
          WHEN fc.dep_date < CURDATE() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time < CURTIME() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 'scheduled'
          ELSE 'upcoming'
        END as departure_status,
        CASE 
          WHEN fc.arv_date < CURDATE() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time < CURTIME() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 'enroute'
          ELSE 'upcoming'
        END as arrival_status
      FROM flight_connections fc
      WHERE fc.lead_id = ? AND fc.id = ?
    `;

    const [flights] = await db.execute(sql, [lead_id, connection_id]);

    if (flights.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Flight not found'
      });
    }

    const flight = flights[0];
    const status = getFlightStatusCode(flight);

    res.json({
      success: true,
      flight: {
        ...flight,
        status,
        progress: calculateFlightProgress(flight),
        timeline: generateTimeline(flight),
        alerts: generateAlerts(flight),
        formattedDates: {
          dep_date: formatDisplayDate(flight.dep_date),
          arv_date: formatDisplayDate(flight.arv_date)
        }
      }
    });

  } catch (error) {
    console.error('Flight Status Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================================================
   CONTROLLER 3: LIVE UPDATES
========================================================= */
const getLiveFlightUpdates = async (req, res) => {
  try {
    const { lead_id } = req.params;
    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    // FIXED SQL: Include flights that are active today (departing, arriving, or in air)
    const sql = `
      SELECT 
        fc.*,
        CASE 
          WHEN fc.dep_date < CURDATE() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time < CURTIME() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 'scheduled'
          ELSE 'upcoming'
        END as departure_status,
        CASE 
          WHEN fc.arv_date < CURDATE() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time < CURTIME() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 'enroute'
          ELSE 'upcoming'
        END as arrival_status
      FROM flight_connections fc
      WHERE fc.lead_id = ?
        AND (
          -- Today's departures
          fc.dep_date = CURDATE()
          -- Today's arrivals  
          OR fc.arv_date = CURDATE()
          -- OR flights currently in air (spanning multiple days)
          OR (fc.dep_date <= CURDATE() AND fc.arv_date >= CURDATE())
        )
      ORDER BY 
        CASE 
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 1
          WHEN fc.dep_date <= CURDATE() AND fc.arv_date >= CURDATE() THEN 2
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 3
          ELSE 4
        END,
        fc.dep_time
    `;

    const [flights] = await db.execute(sql, [lead_id]);

    const liveUpdates = flights.map(flight => {
      try {
        const status = getFlightStatusCode(flight);

        return {
          ...flight,
          status,
          timeStatus: getTimeStatus(flight),
          progress: calculateFlightProgress(flight),
          message: generateStatusMessage(flight, status),
          nextAction: getNextAction(flight, status),
          isActive: ['scheduled', 'boarding', 'in_air'].includes(status),
          formattedDates: {
            dep_date: formatDisplayDate(flight.dep_date),
            arv_date: formatDisplayDate(flight.arv_date)
          }
        };
      } catch (flightError) {
        console.error(`Error processing flight ${flight.id} for live updates:`, flightError.message);
        // Return a safe default for this flight
        return {
          ...flight,
          status: 'upcoming',
          timeStatus: 'upcoming',
          progress: 0,
          message: `Flight ${flight.flight_number} status unavailable`,
          nextAction: '',
          isActive: false,
          formattedDates: {
            dep_date: formatDisplayDate(flight.dep_date),
            arv_date: formatDisplayDate(flight.arv_date)
          }
        };
      }
    });

    res.json({
      success: true,
      liveUpdates: {
        flights: liveUpdates,
        activeFlights: liveUpdates.filter(f => f.isActive).length,
        upcomingDepartures: liveUpdates.filter(f => f.status === 'scheduled').length,
        flightsInAir: liveUpdates.filter(f => f.status === 'in_air').length,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Live Update Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================================================
   CONTROLLER 4: FLIGHT DETAILS (All flights for lead_id)
========================================================= */
const getFlightDetails = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    const sql = `
      SELECT 
        fc.*,
        CASE 
          WHEN fc.dep_date < CURDATE() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time < CURTIME() THEN 'departed'
          WHEN fc.dep_date = CURDATE() AND fc.dep_time >= CURTIME() THEN 'scheduled'
          ELSE 'upcoming'
        END as departure_status,
        CASE 
          WHEN fc.arv_date < CURDATE() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time < CURTIME() THEN 'arrived'
          WHEN fc.arv_date = CURDATE() AND fc.arv_time >= CURTIME() THEN 'enroute'
          ELSE 'upcoming'
        END as arrival_status,
        TIMESTAMP(CONCAT(fc.dep_date, ' ', fc.dep_time)) as departure_datetime,
        TIMESTAMP(CONCAT(fc.arv_date, ' ', fc.arv_time)) as arrival_datetime
      FROM flight_connections fc
      WHERE fc.lead_id = ?
      ORDER BY fc.dep_date, fc.dep_time
    `;

    const [flights] = await db.execute(sql, [lead_id]);

    if (flights.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No flights found for this lead ID'
      });
    }

    // Process all flights for this lead_id
    const flightDetails = flights.map(flight => {
      try {
        const status = getFlightStatusCode(flight);
        const progress = calculateFlightProgress(flight);

        return {
          basicInfo: {
            id: flight.id,
            flightNumber: flight.flight_number,
            status: status,
            displayStatus: getDisplayStatus(status),
            progress: progress,
            legOrder: flight.leg_order,
            journeyId: flight.journey_id
          },
          departure: {
            airport: {
              code: flight.from_airport,
              terminal: flight.dep_terminal
            },
            date: flight.dep_date,
            time: flight.dep_time,
            datetime: flight.departure_datetime,
            status: flight.departure_status,
            formattedDate: formatDisplayDate(flight.dep_date)
          },
          arrival: {
            airport: {
              code: flight.to_airport,
              terminal: flight.arv_terminal
            },
            date: flight.arv_date,
            time: flight.arv_time,
            datetime: flight.arrival_datetime,
            status: flight.arrival_status,
            formattedDate: formatDisplayDate(flight.arv_date)
          },
          timing: {
            duration: calculateFlightDuration(flight),
            timeToDeparture: getTimeToDeparture(flight),
            timeToArrival: getTimeToArrival(flight)
          },
          timeline: generateDetailedTimeline(flight, status),
          alerts: generateDetailedAlerts(flight, status),
          metadata: {
            created: flight.created_at,
            updated: flight.updated_at
          }
        };
      } catch (flightError) {
        console.error(`Error processing flight ${flight.id} for details:`, flightError.message);
        // Return a safe default for this flight
        return {
          basicInfo: {
            id: flight.id,
            flightNumber: flight.flight_number,
            status: 'upcoming',
            displayStatus: 'Upcoming',
            progress: 0,
            legOrder: flight.leg_order,
            journeyId: flight.journey_id
          },
          departure: {
            airport: {
              code: flight.from_airport,
              terminal: flight.dep_terminal
            },
            date: flight.dep_date,
            time: flight.dep_time,
            datetime: null,
            status: 'upcoming',
            formattedDate: formatDisplayDate(flight.dep_date)
          },
          arrival: {
            airport: {
              code: flight.to_airport,
              terminal: flight.arv_terminal
            },
            date: flight.arv_date,
            time: flight.arv_time,
            datetime: null,
            status: 'upcoming',
            formattedDate: formatDisplayDate(flight.arv_date)
          },
          timing: {
            duration: 'Unknown',
            timeToDeparture: 'Unknown',
            timeToArrival: 'Unknown'
          },
          timeline: [],
          alerts: [],
          metadata: {
            created: flight.created_at,
            updated: flight.updated_at
          }
        };
      }
    });

    res.json({
      success: true,
      flights: flightDetails,
      totalFlights: flights.length,
      summary: {
        departingToday: flightDetails.filter(f => f.departure.status === 'scheduled').length,
        inAir: flightDetails.filter(f => f.basicInfo.status === 'in_air').length,
        arrived: flightDetails.filter(f => f.basicInfo.status === 'arrived').length,
        upcoming: flightDetails.filter(f => f.basicInfo.status === 'upcoming').length
      }
    });

  } catch (error) {
    console.error('Flight Details Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* =========================================================
   CORRECTED HELPER FUNCTIONS WITH PROPER DATE VALIDATION
========================================================= */

// Safe date parser function
// UPDATED HELPER FUNCTIONS - Replace the existing ones
/* =========================================================
   CORRECTED HELPER FUNCTIONS FOR DATE OBJECTS
========================================================= */

// Safe date parser function - HANDLES DATE OBJECTS
function parseDateSafe(dateInput, timeString = '00:00:00') {
  try {
    // If it's already a Date object, return it directly
    if (dateInput instanceof Date) {
      // If time is provided, create a new date with the time
      if (timeString && timeString !== '00:00:00') {
        const timeParts = timeString.split(':');
        const hours = parseInt(timeParts[0]) || 0;
        const minutes = parseInt(timeParts[1]) || 0;
        const seconds = parseInt(timeParts[2]) || 0;
        
        const newDate = new Date(dateInput);
        newDate.setHours(hours, minutes, seconds, 0);
        return newDate;
      }
      return dateInput;
    }

    // Handle cases where date might be null or undefined
    if (!dateInput) {
      console.warn('Empty date input provided');
      return new Date(); // Return current date as fallback
    }

    // If it's a string, try to parse it
    if (typeof dateInput === 'string') {
      let dateTimeString;
      
      if (timeString && timeString !== '00:00:00') {
        const cleanTime = timeString.split('.')[0]; // Remove milliseconds if present
        dateTimeString = `${dateInput}T${cleanTime}`;
      } else {
        dateTimeString = dateInput;
      }
      
      const date = new Date(dateTimeString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    console.warn(`Unable to parse date input:`, dateInput, timeString);
    return new Date(); // Return current date as fallback
    
  } catch (error) {
    console.error(`Error parsing date:`, dateInput, timeString, error);
    return new Date(); // Return current date as fallback
  }
}

// UPDATED getFlightStatusCode function
function getFlightStatusCode(flight) {
  const now = new Date();
  
  try {
    // Use the safe parser which handles Date objects
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    const arvDT = parseDateSafe(flight.arv_date, flight.arv_time);
    
    // Debug log to check timing
    console.log(`Flight ${flight.flight_number}:`, {
      raw_dep_date: flight.dep_date,
      raw_dep_time: flight.dep_time,
      raw_arv_date: flight.arv_date,
      raw_arv_time: flight.arv_time,
      parsed_departure: depDT.toISOString(),
      parsed_arrival: arvDT.toISOString(),
      now: now.toISOString(),
      isAfterDeparture: now >= depDT,
      isBeforeArrival: now < arvDT,
      shouldBeInAir: now >= depDT && now < arvDT
    });
    
    // Check if boarding (within 1 hour of departure)
    const boardingTime = new Date(depDT.getTime() - (60 * 60 * 1000));
    
    if (now >= boardingTime && now < depDT) {
      return 'boarding';
    }
    
    // FIXED: Properly check if flight is in air (handles multi-day flights)
    if (now >= depDT && now < arvDT) {
      return 'in_air';
    }
    
    if (now >= arvDT) return 'arrived';
    
    // Check if scheduled for today
    const today = now.toISOString().split('T')[0];
    const depDate = depDT.toISOString().split('T')[0];
    
    if (depDate === today && now < depDT) return 'scheduled';
    
    return 'upcoming';
  } catch (error) {
    console.error(`Error calculating status for flight ${flight.flight_number}:`, error);
    return 'upcoming'; // Safe fallback
  }
}

// UPDATED formatDisplayDate function
function formatDisplayDate(dateInput) {
  try {
    if (!dateInput) {
      return 'Date not available';
    }
    
    const date = parseDateSafe(dateInput);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error(`Error formatting date:`, dateInput, error);
    return 'Date error';
  }
}

// UPDATED calculateFlightDuration function
function calculateFlightDuration(flight) {
  try {
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    const arvDT = parseDateSafe(flight.arv_date, flight.arv_time);
    
    const durationMs = arvDT - depDT;
    
    // Check if duration is valid
    if (isNaN(durationMs) || durationMs < 0) {
      return 'Unknown';
    }
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  } catch (error) {
    console.error(`Error calculating duration for flight ${flight.flight_number}:`, error);
    return 'Unknown';
  }
}

// UPDATED getTimeToDeparture function
function getTimeToDeparture(flight) {
  const now = new Date();
  
  try {
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    
    if (depDT <= now) {
      const arvDT = parseDateSafe(flight.arv_date, flight.arv_time);
      if (now < arvDT) return 'In Progress';
      return 'Departed';
    }
    
    const timeDiff = depDT - now;
    
    // Check if time difference is valid
    if (isNaN(timeDiff) || timeDiff < 0) {
      return 'Unknown';
    }
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `In ${days}d ${hours % 24}h`;
    }
    if (hours > 0) return `In ${hours}h ${minutes}m`;
    return `In ${minutes}m`;
  } catch (error) {
    console.error(`Error calculating time to departure for flight ${flight.flight_number}:`, error);
    return 'Unknown';
  }
}

// UPDATED getTimeToArrival function
function getTimeToArrival(flight) {
  const now = new Date();
  
  try {
    const arvDT = parseDateSafe(flight.arv_date, flight.arv_time);
    
    if (arvDT <= now) return 'Arrived';
    
    const timeDiff = arvDT - now;
    
    // Check if time difference is valid
    if (isNaN(timeDiff) || timeDiff < 0) {
      return 'Unknown';
    }
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `In ${days}d ${hours % 24}h`;
    }
    if (hours > 0) return `In ${hours}h ${minutes}m`;
    return `In ${minutes}m`;
  } catch (error) {
    console.error(`Error calculating time to arrival for flight ${flight.flight_number}:`, error);
    return 'Unknown';
  }
}

// UPDATED getNextAction function
function getNextAction(flight, status) {
  const now = new Date();
  
  try {
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    const timeToDeparture = (depDT - now) / (1000 * 60 * 60); // hours

    const actions = {
      'boarding': 'Proceed to boarding gate',
      'scheduled': timeToDeparture <= 3 ? 'Check-in closing soon' : 'Check-in available',
      'in_air': `Est. arrival ${flight.arv_time}`,
      'arrived': 'Baggage at carousel',
      'upcoming': timeToDeparture <= 24 ? 'Check-in opens soon' : `Departs ${formatDisplayDate(flight.dep_date)}`
    };
    return actions[status] || '';
  } catch (error) {
    console.error(`Error calculating next action for flight ${flight.flight_number}:`, error);
    return ''; // Safe fallback
  }
}

// UPDATED generateDetailedTimeline function
function generateDetailedTimeline(flight, status) {
  try {
    const now = new Date();
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    const arvDT = parseDateSafe(flight.arv_date, flight.arv_time);
    
    return [
      {
        event: 'Check-in Opens',
        time: new Date(depDT.getTime() - (24 * 60 * 60 * 1000)),
        completed: now >= new Date(depDT.getTime() - (24 * 60 * 60 * 1000)),
        current: false
      },
      {
        event: 'Boarding',
        time: new Date(depDT.getTime() - (40 * 60 * 1000)),
        completed: now >= new Date(depDT.getTime() - (40 * 60 * 1000)),
        current: now >= new Date(depDT.getTime() - (40 * 60 * 1000)) && now < depDT
      },
      {
        event: 'Departure',
        time: depDT,
        completed: ['in_air', 'arrived'].includes(status),
        current: status === 'in_air'
      },
      {
        event: 'In Air',
        time: null,
        completed: false,
        current: status === 'in_air'
      },
      {
        event: 'Arrival',
        time: arvDT,
        completed: status === 'arrived',
        current: status === 'arrived'
      }
    ];
  } catch (error) {
    console.error(`Error generating timeline for flight ${flight.flight_number}:`, error);
    return [];
  }
}

// UPDATED generateDetailedAlerts function
function generateDetailedAlerts(flight, status) {
  try {
    const alerts = [];
    const now = new Date();
    const depDT = parseDateSafe(flight.dep_date, flight.dep_time);
    
    // Status-based alerts
    switch(status) {
      case 'scheduled':
        alerts.push({
          type: 'info',
          message: `Flight ${flight.flight_number} is scheduled to depart today`,
          priority: 'medium'
        });
        break;
      case 'boarding':
        alerts.push({
          type: 'warning',
          message: `Flight ${flight.flight_number} is now boarding`,
          priority: 'high'
        });
        break;
      case 'in_air':
        alerts.push({
          type: 'success',
          message: `Flight ${flight.flight_number} is currently in air`,
          priority: 'low'
        });
        break;
      case 'arrived':
        alerts.push({
          type: 'success',
          message: `Flight ${flight.flight_number} has arrived`,
          priority: 'low'
        });
        break;
    }
    
    // Time-based alerts
    const timeToDeparture = (depDT - now) / (1000 * 60); // minutes
    
    if (timeToDeparture > 0 && timeToDeparture <= 120) {
      alerts.push({
        type: 'warning',
        message: `Check-in for flight ${flight.flight_number} closing soon`,
        priority: 'medium'
      });
    }
    
    if (timeToDeparture > 0 && timeToDeparture <= 30) {
      alerts.push({
        type: 'warning',
        message: `Final call for flight ${flight.flight_number}`,
        priority: 'high'
      });
    }
    
    return alerts;
  } catch (error) {
    console.error(`Error generating alerts for flight ${flight.flight_number}:`, error);
    return [];
  }
}

// Keep other helper functions the same
function getDisplayStatus(status) {
  const statusMap = {
    'boarding': 'Boarding',
    'scheduled': 'Scheduled',
    'in_air': 'In Air',
    'arrived': 'Arrived',
    'upcoming': 'Upcoming'
  };
  return statusMap[status] || status;
}

function getTimeStatus(flight) {
  return getFlightStatusCode(flight);
}

function calculateFlightProgress(flight) {
  const status = getFlightStatusCode(flight);
  const progressMap = {
    'upcoming': 0,
    'scheduled': 25,
    'boarding': 50,
    'in_air': 75,
    'arrived': 100
  };
  return progressMap[status] || 0;
}

function generateStatusMessage(flight, status) {
  const messages = {
    'boarding': `Flight ${flight.flight_number} is now boarding`,
    'scheduled': `Flight ${flight.flight_number} is scheduled to depart today`,
    'in_air': `Flight ${flight.flight_number} is currently in air`,
    'arrived': `Flight ${flight.flight_number} has arrived at destination`,
    'upcoming': `Flight ${flight.flight_number} is scheduled for ${formatDisplayDate(flight.dep_date)}`
  };
  return messages[status] || `Flight ${flight.flight_number} status: ${status}`;
}

function generateTimeline(flight) {
  const status = getFlightStatusCode(flight);
  return [
    { event: 'Scheduled', completed: true },
    { event: 'Departed', completed: ['in_air', 'arrived'].includes(status) },
    { event: 'Arrived', completed: status === 'arrived' }
  ];
}

function generateAlerts(flight) {
  const status = getFlightStatusCode(flight);
  const alerts = [];

  if (status === 'scheduled') alerts.push({ type: 'info', message: 'Flight scheduled today' });
  if (status === 'boarding') alerts.push({ type: 'warning', message: 'Flight is boarding' });
  if (status === 'in_air') alerts.push({ type: 'success', message: 'Flight in air' });

  return alerts;
}

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  getFlightStatusDashboard,
  getFlightStatus,
  getLiveFlightUpdates,
  getFlightDetails
};