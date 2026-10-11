const pool = require('../config/db'); // Import your existing pool
const path = require('path');
const fs = require('fs').promises;

// Create hotel specifications
// Create hotel specifications
const createHotelSpecifications = async (req, res) => {
  let connection;
  try {
    const {
      hotelTypes,
      specifications,
      pricing,
      billingFeatures
    } = req.body;

    console.log('Received hotel data:', { 
      hotelTypesCount: hotelTypes?.length, 
      specificationsKeys: Object.keys(specifications || {})
    });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const createdHotels = [];

    // Process each hotel type
    for (const hotelType of hotelTypes) {
      // Insert or get hotel type
      let hotelTypeId;
      const [existingHotelType] = await connection.query(
        'SELECT id FROM hotel_types WHERE name = ?',
        [hotelType.name]
      );

      if (existingHotelType.length > 0) {
        hotelTypeId = existingHotelType[0].id;
        await connection.query(
          'UPDATE hotel_types SET active = ? WHERE id = ?',
          [hotelType.active, hotelTypeId]
        );
      } else {
        const [result] = await connection.query(
          'INSERT INTO hotel_types (name, active) VALUES (?, ?)',
          [hotelType.name, hotelType.active]
        );
        hotelTypeId = result.insertId;
      }

      // Get specifications for this hotel with safe defaults
      const hotelSpec = {
        // Basic Information
        hotelName: specifications.hotelName?.[hotelType.name] || hotelType.name,
        hotelCode: specifications.hotelCode?.[hotelType.name] || null,
        shortDescription: specifications.shortDescription?.[hotelType.name] || null,
        longDescription: specifications.longDescription?.[hotelType.name] || null,
        starRating: specifications.starRating?.[hotelType.name] || null,
        propertyType: specifications.propertyType?.[hotelType.name] || null,
        brandName: specifications.brandName?.[hotelType.name] || null,
        yearBuilt: specifications.yearBuilt?.[hotelType.name] || null,
        yearRenovated: specifications.yearRenovated?.[hotelType.name] || null,
        
        // Location Details
        address: specifications.address?.[hotelType.name] || null,
        city: specifications.city?.[hotelType.name] || null,
        state: specifications.state?.[hotelType.name] || null,
        country: specifications.country?.[hotelType.name] || null,
        pinCode: specifications.pinCode?.[hotelType.name] || null,
        latitude: specifications.latitude?.[hotelType.name] || null,
        longitude: specifications.longitude?.[hotelType.name] || null,
        airportDistance: specifications.airportDistance?.[hotelType.name] || null,
        railwayDistance: specifications.railwayDistance?.[hotelType.name] || null,
        metroStation: specifications.metroStation?.[hotelType.name] || null,
        touristAttractions: specifications.touristAttractions?.[hotelType.name] || null,
        
        // Property Facilities
        frontDesk24x7: specifications.frontDesk24x7?.[hotelType.name] ? 1 : 0,
        elevator: specifications.elevator?.[hotelType.name] ? 1 : 0,
        luggageStorage: specifications.luggageStorage?.[hotelType.name] ? 1 : 0,
        powerBackup: specifications.powerBackup?.[hotelType.name] ? 1 : 0,
        atmCurrencyExchange: specifications.atmCurrencyExchange?.[hotelType.name] ? 1 : 0,
        swimmingPool: specifications.swimmingPool?.[hotelType.name] ? 1 : 0,
        spaWellness: specifications.spaWellness?.[hotelType.name] ? 1 : 0,
        gym: specifications.gym?.[hotelType.name] ? 1 : 0,
        gardenLawn: specifications.gardenLawn?.[hotelType.name] ? 1 : 0,
        kidsPlayArea: specifications.kidsPlayArea?.[hotelType.name] ? 1 : 0,
        
        // Room Details
        totalRooms: specifications.totalRooms?.[hotelType.name] || null,
        roomTypesDeluxe: specifications.roomTypesDeluxe?.[hotelType.name] || null,
        roomTypesStandard: specifications.roomTypesStandard?.[hotelType.name] || null,
        roomTypesSuite: specifications.roomTypesSuite?.[hotelType.name] || null,
        roomTypesFamily: specifications.roomTypesFamily?.[hotelType.name] || null,
        roomSize: specifications.roomSize?.[hotelType.name] || null,
        roomSizeUnit: specifications.roomSizeUnit?.[hotelType.name] || 'sq ft',
        bedType: specifications.bedType?.[hotelType.name] || null,
        occupancy: specifications.occupancy?.[hotelType.name] || null,
        roomAmenities: specifications.roomAmenities?.[hotelType.name] || null,
        
        // Dining & Food
        restaurantInhouse: specifications.restaurantInhouse?.[hotelType.name] ? 1 : 0,
        cuisineTypes: specifications.cuisineTypes?.[hotelType.name] || null,
        barLounge: specifications.barLounge?.[hotelType.name] ? 1 : 0,
        breakfastAvailable: specifications.breakfastAvailable?.[hotelType.name] || 'free',
        roomService: specifications.roomService?.[hotelType.name] || '24x7',
        
        // Services
        housekeeping: specifications.housekeeping?.[hotelType.name] ? 1 : 0,
        laundryService: specifications.laundryService?.[hotelType.name] ? 1 : 0,
        concierge: specifications.concierge?.[hotelType.name] ? 1 : 0,
        wakeupCall: specifications.wakeupCall?.[hotelType.name] ? 1 : 0,
        airportTransfer: specifications.airportTransfer?.[hotelType.name] || 'paid',
        carRental: specifications.carRental?.[hotelType.name] ? 1 : 0,
        
        // Business Facilities
        conferenceRooms: specifications.conferenceRooms?.[hotelType.name] ? 1 : 0,
        banquetHall: specifications.banquetHall?.[hotelType.name] ? 1 : 0,
        meetingRooms: specifications.meetingRooms?.[hotelType.name] ? 1 : 0,
        projectorAV: specifications.projectorAV?.[hotelType.name] ? 1 : 0,
        eventManagement: specifications.eventManagement?.[hotelType.name] ? 1 : 0,
        
        // Safety
        cctvSurveillance: specifications.cctvSurveillance?.[hotelType.name] ? 1 : 0,
        securityGuards: specifications.securityGuards?.[hotelType.name] ? 1 : 0,
        fireSafety: specifications.fireSafety?.[hotelType.name] ? 1 : 0,
        smokeDetectors: specifications.smokeDetectors?.[hotelType.name] ? 1 : 0,
        firstAid: specifications.firstAid?.[hotelType.name] ? 1 : 0,
        
        // Connectivity
        freeWifi: specifications.freeWifi?.[hotelType.name] ? 1 : 0,
        internetSpeed: specifications.internetSpeed?.[hotelType.name] || null,
        businessCenterInternet: specifications.businessCenterInternet?.[hotelType.name] ? 1 : 0,
        
        // Parking
        freeParking: specifications.freeParking?.[hotelType.name] ? 1 : 0,
        paidParking: specifications.paidParking?.[hotelType.name] ? 1 : 0,
        valetParking: specifications.valetParking?.[hotelType.name] ? 1 : 0,
        evCharging: specifications.evCharging?.[hotelType.name] ? 1 : 0,
        shuttleService: specifications.shuttleService?.[hotelType.name] ? 1 : 0,
        
        // Policies
        checkInTime: specifications.checkInTime?.[hotelType.name] || '14:00',
        checkOutTime: specifications.checkOutTime?.[hotelType.name] || '12:00',
        cancellationPolicy: specifications.cancellationPolicy?.[hotelType.name] || 'flexible',
        childPolicy: specifications.childPolicy?.[hotelType.name] || null,
        petPolicy: specifications.petPolicy?.[hotelType.name] || 'not allowed',
        idProofRequired: specifications.idProofRequired?.[hotelType.name] ? 1 : 0,
        
        // Payment
        cash: specifications.cash?.[hotelType.name] ? 1 : 0,
        creditCard: specifications.creditCard?.[hotelType.name] ? 1 : 0,
        upi: specifications.upi?.[hotelType.name] ? 1 : 0,
        netBanking: specifications.netBanking?.[hotelType.name] ? 1 : 0,
        wallets: specifications.wallets?.[hotelType.name] ? 1 : 0,
        
        // Reviews
        overallRating: specifications.overallRating?.[hotelType.name] || null,
        reviewCount: specifications.reviewCount?.[hotelType.name] || null,
        guestReviews: specifications.guestReviews?.[hotelType.name] || null,
        cleanlinessRating: specifications.cleanlinessRating?.[hotelType.name] || null,
        locationRating: specifications.locationRating?.[hotelType.name] || null,
        serviceRating: specifications.serviceRating?.[hotelType.name] || null,
        valueForMoneyRating: specifications.valueForMoneyRating?.[hotelType.name] || null,
        
        // Accessibility
        wheelchairAccess: specifications.wheelchairAccess?.[hotelType.name] ? 1 : 0,
        elevatorAccess: specifications.elevatorAccess?.[hotelType.name] ? 1 : 0,
        accessibleRooms: specifications.accessibleRooms?.[hotelType.name] ? 1 : 0,
        accessibleWashrooms: specifications.accessibleWashrooms?.[hotelType.name] ? 1 : 0,
        
        // Highlights
        coupleFriendly: specifications.coupleFriendly?.[hotelType.name] ? 1 : 0,
        familyFriendly: specifications.familyFriendly?.[hotelType.name] ? 1 : 0,
        businessFriendly: specifications.businessFriendly?.[hotelType.name] ? 1 : 0,
        luxuryStay: specifications.luxuryStay?.[hotelType.name] ? 1 : 0,
        budgetStay: specifications.budgetStay?.[hotelType.name] ? 1 : 0,
        
        // Additional
        features: specifications.features?.[hotelType.name] || null,
        remarks: specifications.remarks?.[hotelType.name] || null
      };

      // Build the values array carefully - count exactly 93 columns
      const insertValues = [
        hotelTypeId,                                                    // 1
        hotelSpec.hotelName,                                            // 2
        hotelSpec.hotelCode,                                            // 3
        hotelSpec.shortDescription,                                     // 4
        hotelSpec.longDescription,                                      // 5
        hotelSpec.starRating,                                           // 6
        hotelSpec.propertyType,                                         // 7
        hotelSpec.brandName,                                            // 8
        hotelSpec.yearBuilt,                                            // 9
        hotelSpec.yearRenovated,                                        // 10
        hotelSpec.address,                                              // 11
        hotelSpec.city,                                                 // 12
        hotelSpec.state,                                                // 13
        hotelSpec.country,                                              // 14
        hotelSpec.pinCode,                                              // 15
        hotelSpec.latitude,                                             // 16
        hotelSpec.longitude,                                            // 17
        hotelSpec.airportDistance,                                      // 18
        hotelSpec.railwayDistance,                                      // 19
        hotelSpec.metroStation,                                         // 20
        hotelSpec.touristAttractions,                                   // 21
        hotelSpec.frontDesk24x7,                                        // 22
        hotelSpec.elevator,                                             // 23
        hotelSpec.luggageStorage,                                       // 24
        hotelSpec.powerBackup,                                          // 25
        hotelSpec.atmCurrencyExchange,                                  // 26
        hotelSpec.swimmingPool,                                         // 27
        hotelSpec.spaWellness,                                          // 28
        hotelSpec.gym,                                                  // 29
        hotelSpec.gardenLawn,                                           // 30
        hotelSpec.kidsPlayArea,                                         // 31
        hotelSpec.totalRooms,                                           // 32
        hotelSpec.roomTypesDeluxe,                                      // 33
        hotelSpec.roomTypesStandard,                                    // 34
        hotelSpec.roomTypesSuite,                                       // 35
        hotelSpec.roomTypesFamily,                                      // 36
        hotelSpec.roomSize,                                             // 37
        hotelSpec.roomSizeUnit,                                         // 38
        hotelSpec.bedType,                                              // 39
        hotelSpec.occupancy,                                            // 40
        hotelSpec.roomAmenities,                                        // 41
        hotelSpec.restaurantInhouse,                                    // 42
        hotelSpec.cuisineTypes,                                         // 43
        hotelSpec.barLounge,                                            // 44
        hotelSpec.breakfastAvailable,                                   // 45
        hotelSpec.roomService,                                          // 46
        hotelSpec.housekeeping,                                         // 47
        hotelSpec.laundryService,                                       // 48
        hotelSpec.concierge,                                            // 49
        hotelSpec.wakeupCall,                                           // 50
        hotelSpec.airportTransfer,                                      // 51
        hotelSpec.carRental,                                            // 52
        hotelSpec.conferenceRooms,                                      // 53
        hotelSpec.banquetHall,                                          // 54
        hotelSpec.meetingRooms,                                         // 55
        hotelSpec.projectorAV,                                          // 56
        hotelSpec.eventManagement,                                      // 57
        hotelSpec.cctvSurveillance,                                     // 58
        hotelSpec.securityGuards,                                       // 59
        hotelSpec.fireSafety,                                           // 60
        hotelSpec.smokeDetectors,                                       // 61
        hotelSpec.firstAid,                                             // 62
        hotelSpec.freeWifi,                                             // 63
        hotelSpec.internetSpeed,                                        // 64
        hotelSpec.businessCenterInternet,                               // 65
        hotelSpec.freeParking,                                          // 66
        hotelSpec.paidParking,                                          // 67
        hotelSpec.valetParking,                                         // 68
        hotelSpec.evCharging,                                           // 69
        hotelSpec.shuttleService,                                       // 70
        hotelSpec.checkInTime,                                          // 71
        hotelSpec.checkOutTime,                                         // 72
        hotelSpec.cancellationPolicy,                                   // 73
        hotelSpec.childPolicy,                                          // 74
        hotelSpec.petPolicy,                                            // 75
        hotelSpec.idProofRequired,                                      // 76
        hotelSpec.cash,                                                 // 77
        hotelSpec.creditCard,                                           // 78
        hotelSpec.upi,                                                  // 79
        hotelSpec.netBanking,                                           // 80
        hotelSpec.wallets,                                              // 81
        hotelSpec.overallRating,                                        // 82
        hotelSpec.reviewCount,                                          // 83
        hotelSpec.guestReviews,                                         // 84
        hotelSpec.cleanlinessRating,                                    // 85
        hotelSpec.locationRating,                                       // 86
        hotelSpec.serviceRating,                                        // 87
        hotelSpec.valueForMoneyRating,                                  // 88
        hotelSpec.wheelchairAccess,                                     // 89
        hotelSpec.elevatorAccess,                                       // 90
        hotelSpec.accessibleRooms,                                      // 91
        hotelSpec.accessibleWashrooms,                                  // 92
        hotelSpec.coupleFriendly,                                       // 93
        hotelSpec.familyFriendly,                                       // 94
        hotelSpec.businessFriendly,                                     // 95
        hotelSpec.luxuryStay,                                           // 96
        hotelSpec.budgetStay,                                           // 97
        hotelSpec.features,                                             // 98
        hotelSpec.remarks                                               // 99
      ];

      console.log(`Inserting hotel with ${insertValues.length} values`);

      // Insert hotel specifications using the values array
      const [specResult] = await connection.query(`
        INSERT INTO hotel_specifications (
          hotel_type_id, hotel_name, hotel_code, short_description, long_description,
          star_rating, property_type, brand_name, year_built, year_renovated,
          address, city, state, country, pin_code, latitude, longitude,
          airport_distance, railway_distance, metro_station, tourist_attractions,
          front_desk_24x7, elevator, luggage_storage, power_backup, atm_currency_exchange,
          swimming_pool, spa_wellness, gym, garden_lawn, kids_play_area,
          total_rooms, room_types_deluxe, room_types_standard, room_types_suite, room_types_family,
          room_size, room_size_unit, bed_type, occupancy, room_amenities,
          restaurant_inhouse, cuisine_types, bar_lounge, breakfast_available, room_service,
          housekeeping, laundry_service, concierge, wakeup_call, airport_transfer, car_rental,
          conference_rooms, banquet_hall, meeting_rooms, projector_av, event_management,
          cctv_surveillance, security_guards, fire_safety, smoke_detectors, first_aid,
          free_wifi, internet_speed, business_center_internet,
          free_parking, paid_parking, valet_parking, ev_charging, shuttle_service,
          check_in_time, check_out_time, cancellation_policy, child_policy, pet_policy, id_proof_required,
          cash, credit_card, upi, net_banking, wallets,
          overall_rating, review_count, guest_reviews, cleanliness_rating, location_rating, service_rating, value_for_money_rating,
          wheelchair_access, elevator_access, accessible_rooms, accessible_washrooms,
          couple_friendly, family_friendly, business_friendly, luxury_stay, budget_stay,
          features, remarks
        ) VALUES (${insertValues.map(() => '?').join(', ')})
      `, insertValues);

      const hotelSpecId = specResult.insertId;

      // Get pricing for this hotel
      const hotelPricing = pricing?.[hotelType.name] || {
        basePrice: specifications.basePrice?.[hotelType.name] || 0,
        currency: specifications.currency?.[hotelType.name] || 'USD',
        priceUnit: specifications.priceUnit?.[hotelType.name] || 'per night',
        taxRate: specifications.taxRate?.[hotelType.name] || null,
        taxType: specifications.taxType?.[hotelType.name] || null,
        discountPercent: specifications.discountPercent?.[hotelType.name] || null,
        weekendRate: specifications.weekendRate?.[hotelType.name] || null,
        peakSeasonRate: specifications.peakSeasonRate?.[hotelType.name] || null,
        securityDeposit: specifications.securityDeposit?.[hotelType.name] || null,
        cleaningFee: specifications.cleaningFee?.[hotelType.name] || null,
        extraPersonCharge: specifications.extraPersonCharge?.[hotelType.name] || null,
        breakfastPrice: specifications.breakfastPrice?.[hotelType.name] || null,
        refundable: specifications.refundable?.[hotelType.name] !== undefined ? (specifications.refundable[hotelType.name] ? 1 : 0) : 1,
        minStay: specifications.minStay?.[hotelType.name] || 1,
        maxStay: specifications.maxStay?.[hotelType.name] || null
      };

      // Insert pricing
      await connection.query(`
        INSERT INTO hotel_pricing (
          hotel_spec_id, billing_enabled, tax_enabled, discount_enabled,
          weekend_rate_enabled, peak_season_rate_enabled, security_deposit_enabled,
          cleaning_fee_enabled, extra_person_charge_enabled, breakfast_included_enabled,
          cancellation_policy_enabled, min_max_stay_enabled,
          currency, price_unit, base_price, tax_rate, tax_type,
          discount_percent, weekend_rate, peak_season_rate, security_deposit,
          cleaning_fee, extra_person_charge, breakfast_price, refundable,
          min_stay, max_stay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        hotelSpecId,
        pricing?.billingEnabled !== undefined ? (pricing.billingEnabled ? 1 : 0) : 1,
        billingFeatures?.taxEnabled !== undefined ? (billingFeatures.taxEnabled ? 1 : 0) : 1,
        billingFeatures?.discountEnabled ? 1 : 0,
        billingFeatures?.weekendRateEnabled ? 1 : 0,
        billingFeatures?.peakSeasonRateEnabled ? 1 : 0,
        billingFeatures?.securityDepositEnabled ? 1 : 0,
        billingFeatures?.cleaningFeeEnabled ? 1 : 0,
        billingFeatures?.extraPersonChargeEnabled ? 1 : 0,
        billingFeatures?.breakfastIncludedEnabled ? 1 : 0,
        billingFeatures?.cancellationPolicyEnabled ? 1 : 0,
        billingFeatures?.minMaxStayEnabled ? 1 : 0,
        hotelPricing.currency,
        hotelPricing.priceUnit,
        hotelPricing.basePrice,
        hotelPricing.taxRate,
        hotelPricing.taxType,
        hotelPricing.discountPercent,
        hotelPricing.weekendRate,
        hotelPricing.peakSeasonRate,
        hotelPricing.securityDeposit,
        hotelPricing.cleaningFee,
        hotelPricing.extraPersonCharge,
        hotelPricing.breakfastPrice,
        hotelPricing.refundable,
        hotelPricing.minStay,
        hotelPricing.maxStay
      ]);

      createdHotels.push({
        hotelTypeId,
        hotelSpecId,
        name: hotelType.name
      });
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Hotel specifications saved successfully',
      data: createdHotels
    });
  } catch (error) {
    console.error('Error creating hotel specifications:', error);
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to save hotel specifications',
      details: error.message
    });
  } finally {
    if (connection) connection.release();
  }
};
// Get all hotel specifications
const getAllHotelSpecifications = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [hotelTypes] = await connection.query(`
      SELECT ht.*, hs.id as spec_id
      FROM hotel_types ht
      LEFT JOIN hotel_specifications hs ON ht.id = hs.hotel_type_id
      WHERE ht.active = true
      ORDER BY ht.id
    `);

    const hotels = [];

    for (const hotelType of hotelTypes) {
      const hotelData = {
        id: hotelType.id,
        name: hotelType.name,
        active: hotelType.active === 1,
        specifications: {},
        pricing: {},
        billingFeatures: {}
      };

      if (hotelType.spec_id) {
        // Get specifications
        const [specs] = await connection.query(
          'SELECT * FROM hotel_specifications WHERE id = ?',
          [hotelType.spec_id]
        );

        if (specs.length > 0) {
          const spec = specs[0];
          hotelData.specifications = {
            hotelName: spec.hotel_name,
            hotelCode: spec.hotel_code,
            shortDescription: spec.short_description,
            longDescription: spec.long_description,
            starRating: spec.star_rating,
            propertyType: spec.property_type,
            brandName: spec.brand_name,
            yearBuilt: spec.year_built,
            yearRenovated: spec.year_renovated,
            address: spec.address,
            city: spec.city,
            state: spec.state,
            country: spec.country,
            pinCode: spec.pin_code,
            latitude: spec.latitude,
            longitude: spec.longitude,
            airportDistance: spec.airport_distance,
            railwayDistance: spec.railway_distance,
            metroStation: spec.metro_station,
            touristAttractions: spec.tourist_attractions,
            frontDesk24x7: spec.front_desk_24x7 === 1,
            elevator: spec.elevator === 1,
            luggageStorage: spec.luggage_storage === 1,
            powerBackup: spec.power_backup === 1,
            atmCurrencyExchange: spec.atm_currency_exchange === 1,
            swimmingPool: spec.swimming_pool === 1,
            spaWellness: spec.spa_wellness === 1,
            gym: spec.gym === 1,
            gardenLawn: spec.garden_lawn === 1,
            kidsPlayArea: spec.kids_play_area === 1,
            totalRooms: spec.total_rooms,
            roomTypesDeluxe: spec.room_types_deluxe,
            roomTypesStandard: spec.room_types_standard,
            roomTypesSuite: spec.room_types_suite,
            roomTypesFamily: spec.room_types_family,
            roomSize: spec.room_size,
            roomSizeUnit: spec.room_size_unit,
            bedType: spec.bed_type,
            occupancy: spec.occupancy,
            roomAmenities: spec.room_amenities,
            restaurantInhouse: spec.restaurant_inhouse === 1,
            cuisineTypes: spec.cuisine_types,
            barLounge: spec.bar_lounge === 1,
            breakfastAvailable: spec.breakfast_available,
            roomService: spec.room_service,
            housekeeping: spec.housekeeping === 1,
            laundryService: spec.laundry_service === 1,
            concierge: spec.concierge === 1,
            wakeupCall: spec.wakeup_call === 1,
            airportTransfer: spec.airport_transfer,
            carRental: spec.car_rental === 1,
            conferenceRooms: spec.conference_rooms === 1,
            banquetHall: spec.banquet_hall === 1,
            meetingRooms: spec.meeting_rooms === 1,
            projectorAV: spec.projector_av === 1,
            eventManagement: spec.event_management === 1,
            cctvSurveillance: spec.cctv_surveillance === 1,
            securityGuards: spec.security_guards === 1,
            fireSafety: spec.fire_safety === 1,
            smokeDetectors: spec.smoke_detectors === 1,
            firstAid: spec.first_aid === 1,
            freeWifi: spec.free_wifi === 1,
            internetSpeed: spec.internet_speed,
            businessCenterInternet: spec.business_center_internet === 1,
            freeParking: spec.free_parking === 1,
            paidParking: spec.paid_parking === 1,
            valetParking: spec.valet_parking === 1,
            evCharging: spec.ev_charging === 1,
            shuttleService: spec.shuttle_service === 1,
            checkInTime: spec.check_in_time,
            checkOutTime: spec.check_out_time,
            cancellationPolicy: spec.cancellation_policy,
            childPolicy: spec.child_policy,
            petPolicy: spec.pet_policy,
            idProofRequired: spec.id_proof_required === 1,
            cash: spec.cash === 1,
            creditCard: spec.credit_card === 1,
            upi: spec.upi === 1,
            netBanking: spec.net_banking === 1,
            wallets: spec.wallets === 1,
            overallRating: spec.overall_rating,
            reviewCount: spec.review_count,
            guestReviews: spec.guest_reviews,
            cleanlinessRating: spec.cleanliness_rating,
            locationRating: spec.location_rating,
            serviceRating: spec.service_rating,
            valueForMoneyRating: spec.value_for_money_rating,
            wheelchairAccess: spec.wheelchair_access === 1,
            elevatorAccess: spec.elevator_access === 1,
            accessibleRooms: spec.accessible_rooms === 1,
            accessibleWashrooms: spec.accessible_washrooms === 1,
            coupleFriendly: spec.couple_friendly === 1,
            familyFriendly: spec.family_friendly === 1,
            businessFriendly: spec.business_friendly === 1,
            luxuryStay: spec.luxury_stay === 1,
            budgetStay: spec.budget_stay === 1,
            features: spec.features,
            remarks: spec.remarks
          };
        }

        // Get Pricing
        const [pricing] = await connection.query(
          'SELECT * FROM hotel_pricing WHERE hotel_spec_id = ?',
          [hotelType.spec_id]
        );
        if (pricing.length > 0) {
          const p = pricing[0];
          hotelData.pricing = {
            basePrice: p.base_price,
            currency: p.currency,
            priceUnit: p.price_unit,
            taxRate: p.tax_rate,
            taxType: p.tax_type,
            discountPercent: p.discount_percent,
            weekendRate: p.weekend_rate,
            peakSeasonRate: p.peak_season_rate,
            securityDeposit: p.security_deposit,
            cleaningFee: p.cleaning_fee,
            extraPersonCharge: p.extra_person_charge,
            breakfastPrice: p.breakfast_price,
            refundable: p.refundable === 1,
            minStay: p.min_stay,
            maxStay: p.max_stay
          };
          hotelData.billingFeatures = {
            billingEnabled: p.billing_enabled === 1,
            taxEnabled: p.tax_enabled === 1,
            discountEnabled: p.discount_enabled === 1,
            weekendRateEnabled: p.weekend_rate_enabled === 1,
            peakSeasonRateEnabled: p.peak_season_rate_enabled === 1,
            securityDepositEnabled: p.security_deposit_enabled === 1,
            cleaningFeeEnabled: p.cleaning_fee_enabled === 1,
            extraPersonChargeEnabled: p.extra_person_charge_enabled === 1,
            breakfastIncludedEnabled: p.breakfast_included_enabled === 1,
            cancellationPolicyEnabled: p.cancellation_policy_enabled === 1,
            minMaxStayEnabled: p.min_max_stay_enabled === 1
          };
        }
      }

      hotels.push(hotelData);
    }

    res.json({
      success: true,
      data: hotels
    });
  } catch (error) {
    console.error('Error fetching hotel specifications:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch hotel specifications'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get single hotel specification by ID
const getHotelSpecificationById = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [hotelTypes] = await connection.query(
      'SELECT * FROM hotel_types WHERE id = ?',
      [id]
    );

    if (hotelTypes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Hotel not found',
        message: 'Hotel type not found'
      });
    }

    const hotelType = hotelTypes[0];
    const hotelData = {
      id: hotelType.id,
      name: hotelType.name,
      active: hotelType.active === 1,
      specifications: {},
      pricing: {},
      billingFeatures: {}
    };

    const [specs] = await connection.query(
      'SELECT * FROM hotel_specifications WHERE hotel_type_id = ?',
      [id]
    );

    if (specs.length > 0) {
      const spec = specs[0];
      hotelData.specifications = {
        // Include all fields similar to getAllHotelSpecifications
        hotelName: spec.hotel_name,
        hotelCode: spec.hotel_code,
        // ... (include all other fields)
        features: spec.features,
        remarks: spec.remarks
      };

      // Get Pricing
      const [pricing] = await connection.query(
        'SELECT * FROM hotel_pricing WHERE hotel_spec_id = ?',
        [spec.id]
      );
      if (pricing.length > 0) {
        const p = pricing[0];
        hotelData.pricing = {
          basePrice: p.base_price,
          currency: p.currency,
          priceUnit: p.price_unit,
          // ... (include all pricing fields)
        };
        hotelData.billingFeatures = {
          billingEnabled: p.billing_enabled === 1,
          // ... (include all billing features)
        };
      }
    }

    res.json({
      success: true,
      data: hotelData
    });
  } catch (error) {
    console.error('Error fetching hotel specification:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch hotel specification'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Delete hotel specification
const deleteHotelSpecification = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      'DELETE FROM hotel_types WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Hotel not found',
        message: 'Hotel type not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Hotel specification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting hotel specification:', error);
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to delete hotel specification'
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  createHotelSpecifications,
  getAllHotelSpecifications,
  getHotelSpecificationById,
  deleteHotelSpecification
};