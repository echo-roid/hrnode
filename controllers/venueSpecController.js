const createVenueSpecifications = async (req, res) => {
  let connection;
  
  // Helper function to process images
  const processImages = (images, venueSpecId) => {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return [];
    }
    
    return images.map((img, idx) => [
      venueSpecId,
      img.url || null,
      img.data ? Buffer.from(img.data, 'base64') : null,
      img.name || `image_${idx}`,
      idx === 0 ? 1 : 0 // first image is primary
    ]);
  };

  try {
    const {
      venueTypes,
      specifications,
      pricing
    } = req.body;

    // Validate required data
    if (!venueTypes || !Array.isArray(venueTypes) || venueTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'venueTypes must be a non-empty array'
      });
    }

    // Validate each venue type has a name
    const invalidVenueTypes = venueTypes.filter(vt => !vt.name || vt.name.trim() === '');
    if (invalidVenueTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Each venue type must have a valid name'
      });
    }

    console.log('Received venue data:', { 
      venueTypesCount: venueTypes?.length, 
      venueTypes: venueTypes.map(vt => ({ name: vt.name, active: vt.active })),
      specificationsKeys: Object.keys(specifications || {}),
      pricingKeys: Object.keys(pricing || {})
    });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const createdVenues = [];

    // Process each venue type with index
    for (let index = 0; index < venueTypes.length; index++) {
      const venueType = venueTypes[index];
      
      // Insert or get venue type
      let venueTypeId;
      const [existingVenueType] = await connection.query(
        'SELECT id FROM venue_types WHERE name = ?',
        [venueType.name.trim()]
      );

      if (existingVenueType.length > 0) {
        venueTypeId = existingVenueType[0].id;
        console.log(`Found existing venue type: ${venueType.name} with ID: ${venueTypeId}`);
        
        // Only update active status if provided
        if (venueType.active !== undefined) {
          await connection.query(
            'UPDATE venue_types SET active = ? WHERE id = ?',
            [venueType.active, venueTypeId]
          );
        }
      } else {
        console.log(`Creating new venue type: ${venueType.name}`);
        const [result] = await connection.query(
          'INSERT INTO venue_types (name, active) VALUES (?, ?)',
          [venueType.name.trim(), venueType.active !== undefined ? venueType.active : true]
        );
        venueTypeId = result.insertId;
        console.log(`Created new venue type with ID: ${venueTypeId}`);
      }

      // Get specifications for this venue - handle missing data gracefully
      const venueSpec = {
        // Venue Overview
        venueName: specifications?.venueName?.[venueType.name] || venueType.name,
        venueType: specifications?.venueType?.[venueType.name] || null,
        totalArea: specifications?.totalArea?.[venueType.name] || null,
        areaUnit: specifications?.areaUnit?.[venueType.name] || 'sq ft',
        seatingCapacityTheatre: specifications?.seatingCapacityTheatre?.[venueType.name] || null,
        seatingCapacityClassroom: specifications?.seatingCapacityClassroom?.[venueType.name] || null,
        seatingCapacityUShape: specifications?.seatingCapacityUShape?.[venueType.name] || null,
        floatingCapacity: specifications?.floatingCapacity?.[venueType.name] || null,
        numberOfVenues: specifications?.numberOfVenues?.[venueType.name] || null,
        
        // Seating & Layout Options
        theatreStyle: specifications?.theatreStyle?.[venueType.name] ? 1 : 0,
        roundTableSeating: specifications?.roundTableSeating?.[venueType.name] ? 1 : 0,
        classroomSetup: specifications?.classroomSetup?.[venueType.name] ? 1 : 0,
        boardroomSetup: specifications?.boardroomSetup?.[venueType.name] ? 1 : 0,
        uShapeSetup: specifications?.uShapeSetup?.[venueType.name] ? 1 : 0,
        clusterSetup: specifications?.clusterSetup?.[venueType.name] ? 1 : 0,
        customLayout: specifications?.customLayout?.[venueType.name] ? 1 : 0,
        
        // Climate & Comfort
        centralAC: specifications?.centralAC?.[venueType.name] ? 1 : 0,
        outdoorCooling: specifications?.outdoorCooling?.[venueType.name] ? 1 : 0,
        ventilationSystem: specifications?.ventilationSystem?.[venueType.name] ? 1 : 0,
        airPurifiers: specifications?.airPurifiers?.[venueType.name] ? 1 : 0,
        backupPower: specifications?.backupPower?.[venueType.name] ? 1 : 0,
        
        // Audio-Visual & Equipment
        microphones: specifications?.microphones?.[venueType.name] ? 1 : 0,
        microphoneType: specifications?.microphoneType?.[venueType.name] || null,
        soundSystem: specifications?.soundSystem?.[venueType.name] ? 1 : 0,
        projectorScreen: specifications?.projectorScreen?.[venueType.name] ? 1 : 0,
        ledWall: specifications?.ledWall?.[venueType.name] ? 1 : 0,
        stageLighting: specifications?.stageLighting?.[venueType.name] || null,
        djSetup: specifications?.djSetup?.[venueType.name] ? 1 : 0,
        videoConferencing: specifications?.videoConferencing?.[venueType.name] ? 1 : 0,
        liveStreaming: specifications?.liveStreaming?.[venueType.name] ? 1 : 0,
        
        // Stage & Decoration
        builtInStage: specifications?.builtInStage?.[venueType.name] ? 1 : 0,
        customStage: specifications?.customStage?.[venueType.name] ? 1 : 0,
        eventDecoration: specifications?.eventDecoration?.[venueType.name] ? 1 : 0,
        floralDecoration: specifications?.floralDecoration?.[venueType.name] ? 1 : 0,
        themeDecoration: specifications?.themeDecoration?.[venueType.name] ? 1 : 0,
        ledLighting: specifications?.ledLighting?.[venueType.name] ? 1 : 0,
        entryGateDecoration: specifications?.entryGateDecoration?.[venueType.name] ? 1 : 0,
        
        // Food & Catering
        inHouseCatering: specifications?.inHouseCatering?.[venueType.name] ? 1 : 0,
        multiCuisineMenu: specifications?.multiCuisineMenu?.[venueType.name] ? 1 : 0,
        buffetSetup: specifications?.buffetSetup?.[venueType.name] ? 1 : 0,
        liveCounters: specifications?.liveCounters?.[venueType.name] ? 1 : 0,
        barService: specifications?.barService?.[venueType.name] ? 1 : 0,
        outsideCatering: specifications?.outsideCatering?.[venueType.name] || 'no',
        kitchenFacility: specifications?.kitchenFacility?.[venueType.name] ? 1 : 0,
        
        // Washrooms & Hygiene
        separateWashrooms: specifications?.separateWashrooms?.[venueType.name] ? 1 : 0,
        accessibleWashrooms: specifications?.accessibleWashrooms?.[venueType.name] ? 1 : 0,
        babyChangingStation: specifications?.babyChangingStation?.[venueType.name] ? 1 : 0,
        sanitizationFacilities: specifications?.sanitizationFacilities?.[venueType.name] ? 1 : 0,
        housekeepingStaff: specifications?.housekeepingStaff?.[venueType.name] ? 1 : 0,
        
        // Parking & Transport
        parkingCapacityCars: specifications?.parkingCapacityCars?.[venueType.name] || null,
        parkingCapacityBuses: specifications?.parkingCapacityBuses?.[venueType.name] || null,
        valetParking: specifications?.valetParking?.[venueType.name] ? 1 : 0,
        evCharging: specifications?.evCharging?.[venueType.name] ? 1 : 0,
        shuttleService: specifications?.shuttleService?.[venueType.name] ? 1 : 0,
        nearbyTransport: specifications?.nearbyTransport?.[venueType.name] ? 1 : 0,
        
        // Safety & Security
        cctvSurveillance: specifications?.cctvSurveillance?.[venueType.name] ? 1 : 0,
        securityGuards: specifications?.securityGuards?.[venueType.name] ? 1 : 0,
        fireSafety: specifications?.fireSafety?.[venueType.name] ? 1 : 0,
        emergencyExits: specifications?.emergencyExits?.[venueType.name] ? 1 : 0,
        metalDetectors: specifications?.metalDetectors?.[venueType.name] ? 1 : 0,
        
        // Connectivity & Technology
        highSpeedWifi: specifications?.highSpeedWifi?.[venueType.name] ? 1 : 0,
        lanConnectivity: specifications?.lanConnectivity?.[venueType.name] ? 1 : 0,
        chargingPoints: specifications?.chargingPoints?.[venueType.name] ? 1 : 0,
        eventManagementSoftware: specifications?.eventManagementSoftware?.[venueType.name] ? 1 : 0,
        digitalSignage: specifications?.digitalSignage?.[venueType.name] ? 1 : 0,
        
        // Event Support Services
        eventManager: specifications?.eventManager?.[venueType.name] ? 1 : 0,
        weddingPlanner: specifications?.weddingPlanner?.[venueType.name] ? 1 : 0,
        technicalSupport: specifications?.technicalSupport?.[venueType.name] ? 1 : 0,
        registrationDesk: specifications?.registrationDesk?.[venueType.name] ? 1 : 0,
        guestAssistance: specifications?.guestAssistance?.[venueType.name] ? 1 : 0,
        
        // Accommodation Support
        guestRoomsAvailable: specifications?.guestRoomsAvailable?.[venueType.name] || null,
        bridalRoom: specifications?.bridalRoom?.[venueType.name] ? 1 : 0,
        vipSuites: specifications?.vipSuites?.[venueType.name] ? 1 : 0,
        changingRooms: specifications?.changingRooms?.[venueType.name] ? 1 : 0,
        
        // Outdoor & Special Features
        gardenArea: specifications?.gardenArea?.[venueType.name] ? 1 : 0,
        poolsideVenue: specifications?.poolsideVenue?.[venueType.name] ? 1 : 0,
        rooftopVenue: specifications?.rooftopVenue?.[venueType.name] ? 1 : 0,
        scenicViews: specifications?.scenicViews?.[venueType.name] ? 1 : 0,
        fireworksAllowed: specifications?.fireworksAllowed?.[venueType.name] ? 1 : 0,
        
        // Accessibility Features
        wheelchairAccess: specifications?.wheelchairAccess?.[venueType.name] ? 1 : 0,
        elevators: specifications?.elevators?.[venueType.name] ? 1 : 0,
        rampAccess: specifications?.rampAccess?.[venueType.name] ? 1 : 0,
        accessibleWashroomsVenue: specifications?.accessibleWashroomsVenue?.[venueType.name] ? 1 : 0,
        
        // Premium / Luxury Amenities
        luxuryLounge: specifications?.luxuryLounge?.[venueType.name] ? 1 : 0,
        vipEntry: specifications?.vipEntry?.[venueType.name] ? 1 : 0,
        privateButler: specifications?.privateButler?.[venueType.name] ? 1 : 0,
        helicopterLanding: specifications?.helicopterLanding?.[venueType.name] ? 1 : 0,
        premiumDecor: specifications?.premiumDecor?.[venueType.name] ? 1 : 0,
        celebrityPerformance: specifications?.celebrityPerformance?.[venueType.name] ? 1 : 0,
        
        // Additional
        features: specifications?.features?.[venueType.name] || null,
        remarks: specifications?.remarks?.[venueType.name] || null
      };

      // Build column list
      const columns = [
        'venue_type_id', 'venue_name', 'venue_type', 'total_area', 'area_unit',
        'seating_capacity_theatre', 'seating_capacity_classroom', 'seating_capacity_u_shape',
        'floating_capacity', 'number_of_venues', 'theatre_style', 'round_table_seating',
        'classroom_setup', 'boardroom_setup', 'u_shape_setup', 'cluster_setup', 'custom_layout',
        'central_ac', 'outdoor_cooling', 'ventilation_system', 'air_purifiers', 'backup_power',
        'microphones', 'microphone_type', 'sound_system', 'projector_screen', 'led_wall',
        'stage_lighting', 'dj_setup', 'video_conferencing', 'live_streaming',
        'built_in_stage', 'custom_stage', 'event_decoration', 'floral_decoration',
        'theme_decoration', 'led_lighting', 'entry_gate_decoration',
        'in_house_catering', 'multi_cuisine_menu', 'buffet_setup', 'live_counters',
        'bar_service', 'outside_catering', 'kitchen_facility',
        'separate_washrooms', 'accessible_washrooms', 'baby_changing_station',
        'sanitization_facilities', 'housekeeping_staff',
        'parking_capacity_cars', 'parking_capacity_buses', 'valet_parking',
        'ev_charging', 'shuttle_service', 'nearby_transport',
        'cctv_surveillance', 'security_guards', 'fire_safety', 'emergency_exits', 'metal_detectors',
        'high_speed_wifi', 'lan_connectivity', 'charging_points', 'event_management_software', 'digital_signage',
        'event_manager', 'wedding_planner', 'technical_support', 'registration_desk', 'guest_assistance',
        'guest_rooms_available', 'bridal_room', 'vip_suites', 'changing_rooms',
        'garden_area', 'poolside_venue', 'rooftop_venue', 'scenic_views', 'fireworks_allowed',
        'wheelchair_access', 'elevators', 'ramp_access', 'accessible_washrooms_venue',
        'luxury_lounge', 'vip_entry', 'private_butler', 'helicopter_landing', 'premium_decor', 'celebrity_performance',
        'features', 'remarks'
      ];

      // Build values array
      const values = [
        venueTypeId,
        venueSpec.venueName,
        venueSpec.venueType,
        venueSpec.totalArea,
        venueSpec.areaUnit,
        venueSpec.seatingCapacityTheatre,
        venueSpec.seatingCapacityClassroom,
        venueSpec.seatingCapacityUShape,
        venueSpec.floatingCapacity,
        venueSpec.numberOfVenues,
        venueSpec.theatreStyle,
        venueSpec.roundTableSeating,
        venueSpec.classroomSetup,
        venueSpec.boardroomSetup,
        venueSpec.uShapeSetup,
        venueSpec.clusterSetup,
        venueSpec.customLayout,
        venueSpec.centralAC,
        venueSpec.outdoorCooling,
        venueSpec.ventilationSystem,
        venueSpec.airPurifiers,
        venueSpec.backupPower,
        venueSpec.microphones,
        venueSpec.microphoneType,
        venueSpec.soundSystem,
        venueSpec.projectorScreen,
        venueSpec.ledWall,
        venueSpec.stageLighting,
        venueSpec.djSetup,
        venueSpec.videoConferencing,
        venueSpec.liveStreaming,
        venueSpec.builtInStage,
        venueSpec.customStage,
        venueSpec.eventDecoration,
        venueSpec.floralDecoration,
        venueSpec.themeDecoration,
        venueSpec.ledLighting,
        venueSpec.entryGateDecoration,
        venueSpec.inHouseCatering,
        venueSpec.multiCuisineMenu,
        venueSpec.buffetSetup,
        venueSpec.liveCounters,
        venueSpec.barService,
        venueSpec.outsideCatering,
        venueSpec.kitchenFacility,
        venueSpec.separateWashrooms,
        venueSpec.accessibleWashrooms,
        venueSpec.babyChangingStation,
        venueSpec.sanitizationFacilities,
        venueSpec.housekeepingStaff,
        venueSpec.parkingCapacityCars,
        venueSpec.parkingCapacityBuses,
        venueSpec.valetParking,
        venueSpec.evCharging,
        venueSpec.shuttleService,
        venueSpec.nearbyTransport,
        venueSpec.cctvSurveillance,
        venueSpec.securityGuards,
        venueSpec.fireSafety,
        venueSpec.emergencyExits,
        venueSpec.metalDetectors,
        venueSpec.highSpeedWifi,
        venueSpec.lanConnectivity,
        venueSpec.chargingPoints,
        venueSpec.eventManagementSoftware,
        venueSpec.digitalSignage,
        venueSpec.eventManager,
        venueSpec.weddingPlanner,
        venueSpec.technicalSupport,
        venueSpec.registrationDesk,
        venueSpec.guestAssistance,
        venueSpec.guestRoomsAvailable,
        venueSpec.bridalRoom,
        venueSpec.vipSuites,
        venueSpec.changingRooms,
        venueSpec.gardenArea,
        venueSpec.poolsideVenue,
        venueSpec.rooftopVenue,
        venueSpec.scenicViews,
        venueSpec.fireworksAllowed,
        venueSpec.wheelchairAccess,
        venueSpec.elevators,
        venueSpec.rampAccess,
        venueSpec.accessibleWashroomsVenue,
        venueSpec.luxuryLounge,
        venueSpec.vipEntry,
        venueSpec.privateButler,
        venueSpec.helicopterLanding,
        venueSpec.premiumDecor,
        venueSpec.celebrityPerformance,
        venueSpec.features,
        venueSpec.remarks
      ];

      // Verify column count matches values count
      if (columns.length !== values.length) {
        throw new Error(`Column count mismatch: ${columns.length} columns vs ${values.length} values for venue type ${venueType.name}`);
      }
      
      // Check for null values in required fields
      const requiredFields = ['venue_type_id', 'venue_name'];
      const nullRequired = requiredFields.filter((field) => {
        const valueIndex = columns.indexOf(field);
        return valueIndex !== -1 && values[valueIndex] === null;
      });
      
      if (nullRequired.length > 0) {
        throw new Error(`Required fields cannot be null: ${nullRequired.join(', ')} for venue type ${venueType.name}`);
      }
      
      // Create the query with placeholders
      const placeholders = columns.map(() => '?').join(', ');
      const query = `INSERT INTO venue_specifications (${columns.join(', ')}) VALUES (${placeholders})`;

      console.log(`Inserting venue specification for ${venueType.name} (venue_type_id: ${venueTypeId}) with ${values.length} values`);

      const [specResult] = await connection.query(query, values);
      const venueSpecId = specResult.insertId;

      // Insert Venue Images
      if (specifications?.venueImages?.[venueType.name] && Array.isArray(specifications.venueImages[venueType.name]) && specifications.venueImages[venueType.name].length > 0) {
        const imageValues = processImages(specifications.venueImages[venueType.name], venueSpecId);
        if (imageValues.length > 0) {
          await connection.query(
            'INSERT INTO venue_images (venue_spec_id, image_url, image_data, image_name, is_primary) VALUES ?',
            [imageValues]
          );
          console.log(`Inserted ${imageValues.length} images for venue type: ${venueType.name}`);
        }
      }

      // Get pricing for this venue
      const venuePricing = {
        basePrice: pricing?.[venueType.name]?.basePrice || specifications?.basePrice?.[venueType.name] || 0,
        currency: pricing?.[venueType.name]?.currency || specifications?.currency?.[venueType.name] || 'USD',
        priceUnit: pricing?.[venueType.name]?.priceUnit || specifications?.priceUnit?.[venueType.name] || 'per event',
        taxRate: pricing?.[venueType.name]?.taxRate || specifications?.taxRate?.[venueType.name] || null,
        taxType: pricing?.[venueType.name]?.taxType || specifications?.taxType?.[venueType.name] || null,
        discountPercent: pricing?.[venueType.name]?.discountPercent || specifications?.discountPercent?.[venueType.name] || null,
        weekendRate: pricing?.[venueType.name]?.weekendRate || specifications?.weekendRate?.[venueType.name] || null,
        peakSeasonRate: pricing?.[venueType.name]?.peakSeasonRate || specifications?.peakSeasonRate?.[venueType.name] || null,
        extraHourCharge: pricing?.[venueType.name]?.extraHourCharge || specifications?.extraHourCharge?.[venueType.name] || null,
        depositRequired: (pricing?.[venueType.name]?.depositRequired || specifications?.depositRequired?.[venueType.name]) ? 1 : 0,
        depositAmount: pricing?.[venueType.name]?.depositAmount || specifications?.depositAmount?.[venueType.name] || null,
        refundable: (pricing?.[venueType.name]?.refundable !== undefined ? pricing?.[venueType.name]?.refundable : (specifications?.refundable?.[venueType.name] !== undefined ? specifications.refundable[venueType.name] : true)) ? 1 : 0,
        cancellationPolicy: pricing?.[venueType.name]?.cancellationPolicy || specifications?.cancellationPolicy?.[venueType.name] || null,
        minHours: pricing?.[venueType.name]?.minHours || specifications?.minHours?.[venueType.name] || 4,
        maxHours: pricing?.[venueType.name]?.maxHours || specifications?.maxHours?.[venueType.name] || null
      };

      // Insert pricing separately
      await connection.query(`
        INSERT INTO venue_pricing (
          venue_spec_id, currency, price_unit, base_price, tax_rate, tax_type,
          discount_percent, weekend_rate, peak_season_rate, extra_hour_charge,
          deposit_required, deposit_amount, refundable, cancellation_policy,
          min_hours, max_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        venueSpecId,
        venuePricing.currency,
        venuePricing.priceUnit,
        venuePricing.basePrice,
        venuePricing.taxRate,
        venuePricing.taxType,
        venuePricing.discountPercent,
        venuePricing.weekendRate,
        venuePricing.peakSeasonRate,
        venuePricing.extraHourCharge,
        venuePricing.depositRequired,
        venuePricing.depositAmount,
        venuePricing.refundable,
        venuePricing.cancellationPolicy,
        venuePricing.minHours,
        venuePricing.maxHours
      ]);

      createdVenues.push({
        venueTypeId,
        venueSpecId,
        name: venueType.name,
        index: index
      });
      
      console.log(`Successfully processed venue type ${venueType.name} (Index: ${index}) with venue_type_id: ${venueTypeId}`);
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Venue specifications saved successfully',
      data: createdVenues
    });
  } catch (error) {
    console.error('Error creating venue specifications:', error);
    if (connection) await connection.rollback();
    
    // Send appropriate error response
    const statusCode = error.message.includes('Required fields') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.code || 'Database error',
      message: error.message || 'Failed to save venue specifications',
      ...(process.env.NODE_ENV === 'development' && { details: error.stack })
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get all venue specifications
const getAllVenueSpecifications = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [venueTypes] = await connection.query(`
      SELECT vt.*, vs.id as spec_id
      FROM venue_types vt
      LEFT JOIN venue_specifications vs ON vt.id = vs.venue_type_id
      WHERE vt.active = true
      ORDER BY vt.id
    `);

    const venues = [];

    for (const venueType of venueTypes) {
      const venueData = {
        id: venueType.id,
        name: venueType.name,
        active: venueType.active === 1,
        specifications: {},
        pricing: {}
      };

      if (venueType.spec_id) {
        // Get specifications
        const [specs] = await connection.query(
          'SELECT * FROM venue_specifications WHERE id = ?',
          [venueType.spec_id]
        );

        if (specs.length > 0) {
          const spec = specs[0];
          venueData.specifications = {
            venueName: spec.venue_name,
            venueType: spec.venue_type,
            totalArea: spec.total_area,
            areaUnit: spec.area_unit,
            seatingCapacityTheatre: spec.seating_capacity_theatre,
            seatingCapacityClassroom: spec.seating_capacity_classroom,
            seatingCapacityUShape: spec.seating_capacity_u_shape,
            floatingCapacity: spec.floating_capacity,
            numberOfVenues: spec.number_of_venues,
            theatreStyle: spec.theatre_style === 1,
            roundTableSeating: spec.round_table_seating === 1,
            classroomSetup: spec.classroom_setup === 1,
            boardroomSetup: spec.boardroom_setup === 1,
            uShapeSetup: spec.u_shape_setup === 1,
            clusterSetup: spec.cluster_setup === 1,
            customLayout: spec.custom_layout === 1,
            centralAC: spec.central_ac === 1,
            outdoorCooling: spec.outdoor_cooling === 1,
            ventilationSystem: spec.ventilation_system === 1,
            airPurifiers: spec.air_purifiers === 1,
            backupPower: spec.backup_power === 1,
            microphones: spec.microphones === 1,
            microphoneType: spec.microphone_type,
            soundSystem: spec.sound_system === 1,
            projectorScreen: spec.projector_screen === 1,
            ledWall: spec.led_wall === 1,
            stageLighting: spec.stage_lighting,
            djSetup: spec.dj_setup === 1,
            videoConferencing: spec.video_conferencing === 1,
            liveStreaming: spec.live_streaming === 1,
            builtInStage: spec.built_in_stage === 1,
            customStage: spec.custom_stage === 1,
            eventDecoration: spec.event_decoration === 1,
            floralDecoration: spec.floral_decoration === 1,
            themeDecoration: spec.theme_decoration === 1,
            ledLighting: spec.led_lighting === 1,
            entryGateDecoration: spec.entry_gate_decoration === 1,
            inHouseCatering: spec.in_house_catering === 1,
            multiCuisineMenu: spec.multi_cuisine_menu === 1,
            buffetSetup: spec.buffet_setup === 1,
            liveCounters: spec.live_counters === 1,
            barService: spec.bar_service === 1,
            outsideCatering: spec.outside_catering,
            kitchenFacility: spec.kitchen_facility === 1,
            separateWashrooms: spec.separate_washrooms === 1,
            accessibleWashrooms: spec.accessible_washrooms === 1,
            babyChangingStation: spec.baby_changing_station === 1,
            sanitizationFacilities: spec.sanitization_facilities === 1,
            housekeepingStaff: spec.housekeeping_staff === 1,
            parkingCapacityCars: spec.parking_capacity_cars,
            parkingCapacityBuses: spec.parking_capacity_buses,
            valetParking: spec.valet_parking === 1,
            evCharging: spec.ev_charging === 1,
            shuttleService: spec.shuttle_service === 1,
            nearbyTransport: spec.nearby_transport === 1,
            cctvSurveillance: spec.cctv_surveillance === 1,
            securityGuards: spec.security_guards === 1,
            fireSafety: spec.fire_safety === 1,
            emergencyExits: spec.emergency_exits === 1,
            metalDetectors: spec.metal_detectors === 1,
            highSpeedWifi: spec.high_speed_wifi === 1,
            lanConnectivity: spec.lan_connectivity === 1,
            chargingPoints: spec.charging_points === 1,
            eventManagementSoftware: spec.event_management_software === 1,
            digitalSignage: spec.digital_signage === 1,
            eventManager: spec.event_manager === 1,
            weddingPlanner: spec.wedding_planner === 1,
            technicalSupport: spec.technical_support === 1,
            registrationDesk: spec.registration_desk === 1,
            guestAssistance: spec.guest_assistance === 1,
            guestRoomsAvailable: spec.guest_rooms_available,
            bridalRoom: spec.bridal_room === 1,
            vipSuites: spec.vip_suites === 1,
            changingRooms: spec.changing_rooms === 1,
            gardenArea: spec.garden_area === 1,
            poolsideVenue: spec.poolside_venue === 1,
            rooftopVenue: spec.rooftop_venue === 1,
            scenicViews: spec.scenic_views === 1,
            fireworksAllowed: spec.fireworks_allowed === 1,
            wheelchairAccess: spec.wheelchair_access === 1,
            elevators: spec.elevators === 1,
            rampAccess: spec.ramp_access === 1,
            accessibleWashroomsVenue: spec.accessible_washrooms_venue === 1,
            luxuryLounge: spec.luxury_lounge === 1,
            vipEntry: spec.vip_entry === 1,
            privateButler: spec.private_butler === 1,
            helicopterLanding: spec.helicopter_landing === 1,
            premiumDecor: spec.premium_decor === 1,
            celebrityPerformance: spec.celebrity_performance === 1,
            features: spec.features,
            remarks: spec.remarks
          };
        }

        // Get Venue Images
        const [images] = await connection.query(
          'SELECT id, image_url, image_name, is_primary FROM venue_images WHERE venue_spec_id = ? ORDER BY is_primary DESC, created_at ASC',
          [venueType.spec_id]
        );
        venueData.specifications.venueImages = images.map(img => ({
          id: img.id,
          url: img.image_url,
          name: img.image_name,
          isPrimary: img.is_primary === 1
        }));

        // Get Pricing
        const [pricing] = await connection.query(
          'SELECT * FROM venue_pricing WHERE venue_spec_id = ?',
          [venueType.spec_id]
        );
        if (pricing.length > 0) {
          const p = pricing[0];
          venueData.pricing = {
            basePrice: p.base_price,
            currency: p.currency,
            priceUnit: p.price_unit,
            taxRate: p.tax_rate,
            taxType: p.tax_type,
            discountPercent: p.discount_percent,
            weekendRate: p.weekend_rate,
            peakSeasonRate: p.peak_season_rate,
            extraHourCharge: p.extra_hour_charge,
            depositRequired: p.deposit_required === 1,
            depositAmount: p.deposit_amount,
            refundable: p.refundable === 1,
            cancellationPolicy: p.cancellation_policy,
            minHours: p.min_hours,
            maxHours: p.max_hours
          };
        }
      }

      venues.push(venueData);
    }

    res.json({
      success: true,
      data: venues
    });
  } catch (error) {
    console.error('Error fetching venue specifications:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch venue specifications'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get venue images by venue ID
const getVenueImages = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [images] = await connection.query(
      'SELECT id, image_url, image_name, is_primary, created_at FROM venue_images WHERE venue_spec_id = ? ORDER BY is_primary DESC, created_at ASC',
      [id]
    );

    res.json({
      success: true,
      data: images
    });
  } catch (error) {
    console.error('Error fetching venue images:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch venue images'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Delete venue image
const deleteVenueImage = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [result] = await connection.query(
      'DELETE FROM venue_images WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Image not found',
        message: 'Venue image not found'
      });
    }

    res.json({
      success: true,
      message: 'Venue image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting venue image:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to delete venue image'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Delete venue specification
const deleteVenueSpecification = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      'DELETE FROM venue_types WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Venue not found',
        message: 'Venue type not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Venue specification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting venue specification:', error);
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to delete venue specification'
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  createVenueSpecifications,
  getAllVenueSpecifications,
  getVenueImages,
  deleteVenueImage,
  deleteVenueSpecification
};