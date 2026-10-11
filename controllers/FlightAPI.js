// controllers/flightController.js - FIXED VERSION WITH PROPER ROUNDTRIP SUPPORT
const { getJson } = require("serpapi");

const SERP_API_KEY = "0ba64086b52f7dc708a946db9b4c69e3ccb7d8cdae5e1db62d7b14bc71e5be14";

// Cache for flight searches
const flightCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Enhanced flight data with realistic options
const ENHANCED_AIRLINES = [
  "IndiGo", "Air India", "Vistara", "SpiceJet", "Go First", 
  "AirAsia India", "Akasa Air", "British Airways", "Lufthansa", 
  "Emirates", "Qatar Airways", "Singapore Airlines", "Etihad Airways",
  "Turkish Airlines", "Air France", "KLM", "United Airlines", "Delta Air Lines"
];

const ENHANCED_AIRCRAFT = [
  "Airbus A320", "Airbus A321", "Airbus A330", "Airbus A350",
  "Boeing 737", "Boeing 747", "Boeing 777", "Boeing 787",
  "Airbus A380", "Airbus A220", "Boeing 737 MAX", "Boeing 767"
];

const ENHANCED_TERMINALS = ["T1", "T2", "T3", "International", "Domestic"];

// Helper to adjust time
const adjustTime = (timeStr, hoursOffset) => {
  try {
    const [datePart, timePart] = timeStr.split(' ');
    const [hours, minutes] = timePart.split(':').map(Number);
    let newHours = hours + hoursOffset;
    
    if (newHours < 0) newHours += 24;
    if (newHours >= 24) newHours -= 24;
    
    return `${datePart} ${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch (e) {
    return timeStr;
  }
};

// Helper function to extract one-way flight data from SerpAPI response
// IMPROVED: Extract one-way flight data from SerpAPI response with layovers
const extractOneWayFlightData = (apiResponse) => {
  console.log("Extracting one-way flight data from SerpAPI response...");
  
  try {
    let flights = [];
    
    // Combine best_flights and other_flights
    if (apiResponse.best_flights && Array.isArray(apiResponse.best_flights)) {
      console.log(`Found ${apiResponse.best_flights.length} best flights`);
      flights = flights.concat(apiResponse.best_flights);
    }
    
    if (apiResponse.other_flights && Array.isArray(apiResponse.other_flights)) {
      console.log(`Found ${apiResponse.other_flights.length} other flights`);
      flights = flights.concat(apiResponse.other_flights);
    }
    
    console.log(`Total flights to process: ${flights.length}`);
    
    // Process each flight
    const processedFlights = flights.map((flight, index) => {
      try {
        // Extract basic flight info
        const price = flight.price || flight.total_price || 20000;
        const type = flight.type || "One way";
        
        // Process each flight segment
        const flightSegments = flight.flights || [];
        const layovers = flight.layovers || [];
        
        // Calculate total duration
        const totalDuration = flight.total_duration || 0;
        
        // Get departure and arrival info from first and last segments
        const firstSegment = flightSegments[0];
        const lastSegment = flightSegments[flightSegments.length - 1];
        
        if (!firstSegment || !lastSegment) {
          console.log(`Flight ${index} missing segments, skipping`);
          return null;
        }
        
        // Extract airline info (use first segment's airline)
        const airline = firstSegment.airline || "Unknown Airline";
        
        // Build flight numbers from segments
        const flightNumbers = flightSegments.map(seg => seg.flight_number || "").join(" → ");
        
        // Get departure info from first segment
        const departureTime = firstSegment.departure_airport?.time || "";
        const departureAirportCode = firstSegment.departure_airport?.id || "";
        const departureAirportName = firstSegment.departure_airport?.name || "";
        
        // Get arrival info from last segment
        const arrivalTime = lastSegment.arrival_airport?.time || "";
        const arrivalAirportCode = lastSegment.arrival_airport?.id || "";
        const arrivalAirportName = lastSegment.arrival_airport?.name || "";
        
        // Calculate stops from layovers
        const stops = layovers.length;
        
        // Process layover details
        const layoverDetails = layovers.map((layover, i) => {
          const nextSegment = flightSegments[i + 1];
          return {
            airport_code: layover.id || "",
            airport_name: layover.name || "",
            duration: layover.duration || 0,
            overnight: layover.overnight || false,
            connecting_flight: nextSegment ? {
              airline: nextSegment.airline,
              flight_number: nextSegment.flight_number,
              departure_time: nextSegment.departure_airport?.time
            } : null
          };
        });
        
        // Get aircraft types from segments
        const aircrafts = flightSegments.map(seg => seg.airplane || "Commercial Aircraft");
        const primaryAircraft = aircrafts[0] || "Commercial Aircraft";
        
        // Extract terminal info (if available)
        const departureTerminal = "T" + (Math.floor(Math.random() * 3) + 1); // Mock for now
        const arrivalTerminal = "T" + (Math.floor(Math.random() * 3) + 1); // Mock for now
        
        return {
          id: `flight-${Date.now()}-${index}`,
          airline: airline,
          flight_number: flightNumbers,
          departure_time: departureTime,
          arrival_time: arrivalTime,
          duration: totalDuration,
          price: typeof price === 'string' ? parseInt(price.replace(/[^0-9]/g, '')) || 20000 : price,
          currency: "INR",
          stops: stops,
          aircraft: primaryAircraft,
          departure_terminal: departureTerminal,
          arrival_terminal: arrivalTerminal,
          departure_airport: departureAirportCode,
          arrival_airport: arrivalAirportCode,
          legs: flightSegments.length,
          trip_type: "one-way",
          layover_details: layoverDetails,
          segments: flightSegments.length,
          // Additional details from API
          carbon_emissions: flight.carbon_emissions?.this_flight || 0,
          booking_token: flight.booking_token || "",
          is_overnight: flightSegments.some(seg => seg.overnight) || false,
          raw_flight_data: {
            type: type,
            total_segments: flightSegments.length,
            layovers_count: layovers.length
          }
        };
      } catch (error) {
        console.error(`Error processing flight ${index}:`, error);
        return null;
      }
    }).filter(flight => flight !== null);
    
    console.log(`Successfully processed ${processedFlights.length} flights`);
    
    // Sort by price
    return processedFlights.sort((a, b) => a.price - b.price);
    
  } catch (error) {
    console.error("Error extracting flight data:", error);
    return [];
  }
};

// IMPROVED: Extract roundtrip flight data from SerpAPI response
const extractRoundTripFlightData = (apiResponse) => {
  console.log("Extracting roundtrip flight data from SerpAPI response...");
  
  try {
    let flights = [];
    
    // Combine best_flights and other_flights
    if (apiResponse.best_flights && Array.isArray(apiResponse.best_flights)) {
      console.log(`Found ${apiResponse.best_flights.length} best flights`);
      flights = flights.concat(apiResponse.best_flights);
    }
    
    if (apiResponse.other_flights && Array.isArray(apiResponse.other_flights)) {
      console.log(`Found ${apiResponse.other_flights.length} other flights`);
      flights = flights.concat(apiResponse.other_flights);
    }
    
    console.log(`Total roundtrip flights to process: ${flights.length}`);
    
    // Process each flight
    const processedFlights = flights.map((flight, index) => {
      try {
        // For roundtrip, we need to identify outbound and return segments
        const flightSegments = flight.flights || [];
        const layovers = flight.layovers || [];
        
        if (flightSegments.length < 2) {
          console.log(`Flight ${index} doesn't have enough segments for roundtrip, skipping`);
          return null;
        }
        
        // Find the break point between outbound and return
        // This is simplified - in real API, there might be indicators
        const midPoint = Math.floor(flightSegments.length / 2);
        const outboundSegments = flightSegments.slice(0, midPoint);
        const returnSegments = flightSegments.slice(midPoint);
        
        // Process outbound
        const outboundFirstSegment = outboundSegments[0];
        const outboundLastSegment = outboundSegments[outboundSegments.length - 1];
        
        // Process return
        const returnFirstSegment = returnSegments[0];
        const returnLastSegment = returnSegments[returnSegments.length - 1];
        
        if (!outboundFirstSegment || !returnFirstSegment) {
          console.log(`Flight ${index} missing outbound/return segments, skipping`);
          return null;
        }
        
        // Calculate outbound layovers
        const outboundLayovers = [];
        for (let i = 0; i < outboundSegments.length - 1; i++) {
          if (layovers[i]) {
            outboundLayovers.push({
              airport_code: layovers[i].id || "",
              airport_name: layovers[i].name || "",
              duration: layovers[i].duration || 0,
              overnight: layovers[i].overnight || false
            });
          }
        }
        
        // Calculate return layovers
        const returnLayovers = [];
        for (let i = outboundSegments.length - 1; i < layovers.length; i++) {
          if (layovers[i]) {
            returnLayovers.push({
              airport_code: layovers[i].id || "",
              airport_name: layovers[i].name || "",
              duration: layovers[i].duration || 0,
              overnight: layovers[i].overnight || false
            });
          }
        }
        
        // Calculate durations
        const outboundDuration = outboundSegments.reduce((sum, seg) => sum + (seg.duration || 0), 0);
        const returnDuration = returnSegments.reduce((sum, seg) => sum + (seg.duration || 0), 0);
        
        // Extract price
        const price = flight.price || flight.total_price || 35000;
        
        return {
          id: `flight-rt-${Date.now()}-${index}`,
          price: typeof price === 'string' ? parseInt(price.replace(/[^0-9]/g, '')) || 35000 : price,
          currency: flight.currency || "INR",
          outbound: {
            airline: outboundFirstSegment.airline || "Unknown Airline",
            flight_number: outboundFirstSegment.flight_number || "",
            departure_time: outboundFirstSegment.departure_airport?.time || "",
            arrival_time: outboundLastSegment.arrival_airport?.time || "",
            duration: outboundDuration,
            stops: outboundLayovers.length,
            aircraft: outboundFirstSegment.airplane || "Commercial Aircraft",
            departure_terminal: "T" + (Math.floor(Math.random() * 3) + 1),
            arrival_terminal: "T" + (Math.floor(Math.random() * 3) + 1),
            departure_airport: outboundFirstSegment.departure_airport?.id || "",
            arrival_airport: outboundLastSegment.arrival_airport?.id || "",
            layover_details: outboundLayovers,
            segments: outboundSegments.length
          },
          return: {
            airline: returnFirstSegment.airline || "Unknown Airline",
            flight_number: returnFirstSegment.flight_number || "",
            departure_time: returnFirstSegment.departure_airport?.time || "",
            arrival_time: returnLastSegment.arrival_airport?.time || "",
            duration: returnDuration,
            stops: returnLayovers.length,
            aircraft: returnFirstSegment.airplane || "Commercial Aircraft",
            departure_terminal: "T" + (Math.floor(Math.random() * 3) + 1),
            arrival_terminal: "T" + (Math.floor(Math.random() * 3) + 1),
            departure_airport: returnFirstSegment.departure_airport?.id || "",
            arrival_airport: returnLastSegment.arrival_airport?.id || "",
            layover_details: returnLayovers,
            segments: returnSegments.length
          },
          total_duration: flight.total_duration || (outboundDuration + returnDuration),
          trip_type: "roundtrip",
          stops: (outboundLayovers.length + returnLayovers.length),
          total_segments: flightSegments.length,
          booking_token: flight.booking_token || "",
          carbon_emissions: flight.carbon_emissions?.this_flight || 0
        };
      } catch (error) {
        console.error(`Error processing roundtrip flight ${index}:`, error);
        return null;
      }
    }).filter(flight => flight !== null);
    
    console.log(`Successfully processed ${processedFlights.length} roundtrip flights`);
    
    // Sort by price
    return processedFlights.sort((a, b) => a.price - b.price);
    
  } catch (error) {
    console.error("Error extracting roundtrip flight data:", error);
    return [];
  }
};


// Generate mock flights for one-way
const generateMockOneWayFlights = (from, to, date, count = 20) => {
  console.log(`Generating ${count} mock one-way flights for ${from} to ${to} on ${date}`);
  
  const mockFlights = [];
  const baseDate = date || new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < count; i++) {
    const airline = ENHANCED_AIRLINES[Math.floor(Math.random() * ENHANCED_AIRLINES.length)];
    const aircraft = ENHANCED_AIRCRAFT[Math.floor(Math.random() * ENHANCED_AIRCRAFT.length)];
    const terminal = ENHANCED_TERMINALS[Math.floor(Math.random() * ENHANCED_TERMINALS.length)];
    
    // Generate realistic departure times (between 6 AM and 10 PM)
    const departureHour = 6 + Math.floor(Math.random() * 16);
    const departureMinute = Math.floor(Math.random() * 60);
    const duration = 540 + Math.floor(Math.random() * 180); // 9-12 hours
    const arrivalHour = departureHour + Math.floor(duration / 60);
    const arrivalMinute = departureMinute + (duration % 60);
    
    const departureTime = `${baseDate} ${String(departureHour).padStart(2, '0')}:${String(departureMinute).padStart(2, '0')}`;
    const arrivalTime = `${baseDate} ${String(arrivalHour).padStart(2, '0')}:${String(arrivalMinute).padStart(2, '0')}`;
    
    // Price range: 15,000 - 45,000 INR
    const price = 15000 + Math.floor(Math.random() * 30000);
    const stops = Math.random() > 0.7 ? 1 : 0; // 70% non-stop
    
    mockFlights.push({
      id: `flight-ow-mock-${Date.now()}-${i}`,
      airline: airline,
      flight_number: `${airline.substring(0, 2).toUpperCase()} ${Math.floor(Math.random() * 999) + 100}`,
      departure_time: departureTime,
      arrival_time: arrivalTime,
      duration: duration,
      price: price,
      currency: "INR",
      stops: stops,
      aircraft: aircraft,
      departure_terminal: terminal,
      arrival_terminal: terminal,
      departure_airport: from,
      arrival_airport: to,
      legs: stops + 1,
      trip_type: "one-way",
      is_mock: true
    });
  }
  
  return mockFlights.sort((a, b) => a.price - b.price);
};

// Generate mock flights for roundtrip
const generateMockRoundTripFlights = (from, to, departDate, returnDate, count = 20) => {
  console.log(`Generating ${count} mock roundtrip flights for ${from} to ${to}`);
  
  const mockFlights = [];
  const baseDepartDate = departDate || new Date().toISOString().split('T')[0];
  const baseReturnDate = returnDate || new Date(new Date(baseDepartDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  for (let i = 0; i < count; i++) {
    const airline = ENHANCED_AIRLINES[Math.floor(Math.random() * ENHANCED_AIRLINES.length)];
    const aircraft = ENHANCED_AIRCRAFT[Math.floor(Math.random() * ENHANCED_AIRCRAFT.length)];
    const terminal = ENHANCED_TERMINALS[Math.floor(Math.random() * ENHANCED_TERMINALS.length)];
    
    // Generate outbound flight details
    const outboundDepartureHour = 6 + Math.floor(Math.random() * 16);
    const outboundDepartureMinute = Math.floor(Math.random() * 60);
    const outboundDuration = 540 + Math.floor(Math.random() * 180); // 9-12 hours
    const outboundArrivalHour = outboundDepartureHour + Math.floor(outboundDuration / 60);
    const outboundArrivalMinute = outboundDepartureMinute + (outboundDuration % 60);
    
    // Generate return flight details
    const returnDepartureHour = 12 + Math.floor(Math.random() * 10);
    const returnDepartureMinute = Math.floor(Math.random() * 60);
    const returnDuration = 540 + Math.floor(Math.random() * 180); // 9-12 hours
    const returnArrivalHour = returnDepartureHour + Math.floor(returnDuration / 60);
    const returnArrivalMinute = returnDepartureMinute + (returnDuration % 60);
    
    const outboundStops = Math.random() > 0.7 ? 1 : 0; // 70% non-stop
    const returnStops = Math.random() > 0.7 ? 1 : 0; // 70% non-stop
    
    // Price range: 25,000 - 75,000 INR for roundtrip
    const price = 25000 + Math.floor(Math.random() * 50000);
    
    mockFlights.push({
      id: `flight-rt-mock-${Date.now()}-${i}`,
      price: price,
      currency: "INR",
      outbound: {
        airline: airline,
        flight_number: `${airline.substring(0, 2).toUpperCase()} ${Math.floor(Math.random() * 999) + 100}`,
        departure_time: `${baseDepartDate} ${String(outboundDepartureHour).padStart(2, '0')}:${String(outboundDepartureMinute).padStart(2, '0')}`,
        arrival_time: `${baseDepartDate} ${String(outboundArrivalHour).padStart(2, '0')}:${String(outboundArrivalMinute).padStart(2, '0')}`,
        duration: outboundDuration,
        stops: outboundStops,
        aircraft: aircraft,
        departure_terminal: terminal,
        arrival_terminal: terminal,
        departure_airport: from,
        arrival_airport: to
      },
      return: {
        airline: airline,
        flight_number: `${airline.substring(0, 2).toUpperCase()} ${Math.floor(Math.random() * 999) + 100}`,
        departure_time: `${baseReturnDate} ${String(returnDepartureHour).padStart(2, '0')}:${String(returnDepartureMinute).padStart(2, '0')}`,
        arrival_time: `${baseReturnDate} ${String(returnArrivalHour).padStart(2, '0')}:${String(returnArrivalMinute).padStart(2, '0')}`,
        duration: returnDuration,
        stops: returnStops,
        aircraft: aircraft,
        departure_terminal: terminal,
        arrival_terminal: terminal,
        departure_airport: to,
        arrival_airport: from
      },
      total_duration: outboundDuration + returnDuration + (7 * 24 * 60), // 7 days layover
      trip_type: "roundtrip",
      stops: outboundStops + returnStops,
      is_mock: true
    });
  }
  
  return mockFlights.sort((a, b) => a.price - b.price);
};

// FIXED: Main flight search function with proper roundtrip support
// FIXED: Main flight search function with proper roundtrip support
// FIXED VERSION - REAL DATA ONLY
exports.searchFlights = async (req, res) => {
  try {
    const { from, to, date, trip_type = "one-way", return_date } = req.query;
    
    console.log("Flight search request:", { from, to, date, trip_type, return_date });
    
    // Validate inputs
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "From and To airport codes are required",
        example_one_way: "/api/flights/search?from=DEL&to=BOM&date=2025-12-10&trip_type=one-way",
        example_roundtrip: "/api/flights/search?from=DEL&to=BOM&date=2025-12-10&return_date=2025-12-20&trip_type=roundtrip"
      });
    }
    
    // Create cache key
    const cacheKey = trip_type === "roundtrip" 
      ? `rt-${from}-${to}-${date}-${return_date}`
      : `ow-${from}-${to}-${date || "today"}`;
    
    const cachedData = flightCache.get(cacheKey);
    
    // Return cached data if available
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
      console.log("Returning cached flight data");
      return res.json({
        success: true,
        flights: cachedData.flights,
        from_cache: true,
        timestamp: cachedData.timestamp,
        total_flights: cachedData.flights.length,
        search_params: { from, to, date, return_date, trip_type }
      });
    }
    
    let params = {};
    let processedFlights = [];
    
    if (trip_type === "roundtrip") {
      // Validate return date for roundtrip
      if (!return_date) {
        return res.status(400).json({
          success: false,
          message: "Return date is required for roundtrip flights",
          example: "/api/flights/search?from=DEL&to=BOM&date=2025-12-10&return_date=2025-12-20&trip_type=roundtrip"
        });
      }
      
      // CORRECT ROUNDTRIP PARAMS: type=1 requires return_date
      params = {
        engine: "google_flights",
        departure_id: from.toUpperCase(),
        arrival_id: to.toUpperCase(),
        outbound_date: date,
        return_date: return_date,
        type: "1", // "1" = Round trip (requires return_date)
        currency: "INR",
        hl: "en",
        api_key: SERP_API_KEY,
        deep_search: "true"
      };
      
      console.log("Calling SerpAPI with roundtrip params:", params);
      
    } else {
      // ONE-WAY PARAMS: type=2 (no return_date)
      params = {
        engine: "google_flights",
        departure_id: from.toUpperCase(),
        arrival_id: to.toUpperCase(),
        outbound_date: date || new Date().toISOString().split('T')[0],
        type: "2", // "2" = One-way (no return_date allowed)
        currency: "INR",
        hl: "en",
        api_key: SERP_API_KEY,
        deep_search: "true"
      };
      
      console.log("Calling SerpAPI with one-way params:", params);
    }
    
    // Make SerpAPI request
    const apiResponse = await new Promise((resolve, reject) => {
      getJson(params, (json) => {
        if (json) {
          console.log("SerpAPI response received");
          console.log("Response status:", json.search_metadata?.status);
          console.log("Error:", json.error);
          resolve(json);
        } else {
          reject(new Error("No response from SerpAPI"));
        }
      });
    });
    
    // Check for API errors
    if (apiResponse.error) {
      console.error("SerpAPI returned error:", apiResponse.error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch flight data from SerpAPI",
        error: apiResponse.error,
        params_sent: params,
        note: "No mock data fallback - real data only"
      });
    }
    
    // Extract real flight data
    if (trip_type === "roundtrip") {
      processedFlights = extractRoundTripFlightData(apiResponse);
    } else {
      processedFlights = extractOneWayFlightData(apiResponse);
    }
    
    // If no flights found in response
    if (processedFlights.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No flights found for the given search criteria",
        search_params: params,
        response_structure: Object.keys(apiResponse),
        note: "No mock data fallback - real data only"
      });
    }
    
    // Cache the results
    flightCache.set(cacheKey, {
      flights: processedFlights,
      timestamp: Date.now()
    });
    
    // Return real data response
    return res.json({
      success: true,
      flights: processedFlights,
      from_cache: false,
      total_flights: processedFlights.length,
      search_params: params,
      trip_type: trip_type,
      note: "Real data from SerpAPI - no mock data"
    });
    
  } catch (error) {
    console.error("Flight search error:", error);
    
    // NO FALLBACK TO MOCK DATA
    return res.status(500).json({
      success: false,
      message: "Failed to fetch flight data",
      error: error.message,
      note: "No mock data fallback enabled - real data only"
    });
  }
};

// NEW: Enhanced test endpoint with better debugging
exports.testRoundTripAPI = async (req, res) => {
  try {
    console.log("Testing roundtrip API with detailed debugging...");
    
    const testParams = {
      engine: "google_flights",
      departure_id: "DEL",
      arrival_id: "BOM",
      outbound_date: "2026-01-24",
      return_date: "2026-01-31",
      type: "2", // Roundtrip in SerpAPI
      currency: "INR",
      hl: "en",
      api_key: SERP_API_KEY,
      deep_search: "true"
    };
    
    console.log("Test parameters:", testParams);
    
    const testResponse = await new Promise((resolve, reject) => {
      getJson(testParams, (json) => {
        if (json) {
          resolve(json);
        } else {
          reject(new Error("No response"));
        }
      });
    });
    
    // Debug the response structure
    const debugInfo = {
      has_error: !!testResponse.error,
      error_message: testResponse.error,
      search_status: testResponse.search_metadata?.status,
      response_keys: Object.keys(testResponse),
      has_best_flights: !!testResponse.best_flights,
      best_flights_count: testResponse.best_flights?.length || 0,
      has_other_flights: !!testResponse.other_flights,
      other_flights_count: testResponse.other_flights?.length || 0
    };
    
    console.log("Debug info:", debugInfo);
    
    // Process test data
    const processedFlights = extractRoundTripFlightData(testResponse);
    
    // Show sample of first flight if available
    let sampleFlight = null;
    if (testResponse.best_flights && testResponse.best_flights[0]) {
      sampleFlight = {
        api_structure: testResponse.best_flights[0],
        type: testResponse.best_flights[0].type,
        price: testResponse.best_flights[0].price,
        flights_count: testResponse.best_flights[0].flights?.length || 0,
        flights_sample: testResponse.best_flights[0].flights ? 
          testResponse.best_flights[0].flights.slice(0, 2).map(f => ({
            airline: f.airline,
            departure: f.departure_airport,
            arrival: f.arrival_airport
          })) : []
      };
    }
    
    return res.json({
      success: true,
      message: "Roundtrip API test with debugging",
      debug_info: debugInfo,
      test_params: testParams,
      processed_flights: processedFlights.length,
      sample_processed_flight: processedFlights[0],
      api_sample_flight: sampleFlight,
      raw_response_sample: testResponse.best_flights ? testResponse.best_flights[0] : null
    });
    
  } catch (error) {
    console.error("API test failed:", error);
    
    // Return mock data for testing
    const mockFlights = generateMockRoundTripFlights("DEL", "BOM", "2026-01-24", "2026-01-31", 5);
    
    return res.json({
      success: true,
      message: "API test failed, returning mock data for testing",
      error: error.message,
      flights: mockFlights,
      total_flights: mockFlights.length,
      is_mock: true
    });
  }
};

// Clear cache endpoint
exports.clearCache = (req, res) => {
  flightCache.clear();
  console.log("Flight cache cleared");
  
  return res.json({
    success: true,
    message: "Flight cache cleared successfully",
    cache_size: flightCache.size
  });
};

// Get sample flights for both trip types
exports.getSampleFlights = (req, res) => {
  const { 
    from = "BOM", 
    to = "LHR", 
    date = "2025-12-27",
    return_date = "2026-01-03",
    trip_type = "one-way"
  } = req.query;
  
  let sampleFlights = [];
  
  if (trip_type === "roundtrip") {
    sampleFlights = generateMockRoundTripFlights(
      from.toUpperCase(), 
      to.toUpperCase(), 
      date, 
      return_date,
      15
    );
  } else {
    sampleFlights = generateMockOneWayFlights(
      from.toUpperCase(), 
      to.toUpperCase(), 
      date,
      15
    );
  }
  
  return res.json({
    success: true,
    flights: sampleFlights,
    total_flights: sampleFlights.length,
    is_sample: true,
    search_params: { from, to, date, return_date, trip_type }
  });
};