const pool = require('../config/db'); // Import your existing pool
const path = require('path');
const fs = require('fs').promises;
// const pool = require('../config/database');

// Create room specifications
const createRoomSpecifications = async (req, res) => {
  let connection;
  
  // Helper function to clean boolean values
  const cleanBoolean = (value, defaultValue = false) => {
    if (value === '' || value === null || value === undefined) {
      return defaultValue ? 1 : 0;
    }
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return 1;
      if (value.toLowerCase() === 'false') return 0;
    }
    return value ? 1 : 0;
  };

  // Helper function to clean integer values
  const cleanInteger = (value, defaultValue = null) => {
    if (value === '' || value === null || value === undefined) {
      return defaultValue;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Helper function to clean decimal values
  const cleanDecimal = (value, defaultValue = null) => {
    if (value === '' || value === null || value === undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Helper function to process images
  const processImages = (images, roomSpecId) => {
    if (!images || !Array.isArray(images) || images.length === 0) {
      return [];
    }
    
    return images.map((img, idx) => [
      roomSpecId,
      img.url || null,
      img.data ? Buffer.from(img.data, 'base64') : null,
      img.name || `image_${idx}`,
      idx === 0 ? 1 : 0 // first image is primary
    ]);
  };

  try {
    const {
      roomTypes,
      specifications,
      billingEnabled,
      billingFeatures
    } = req.body;

    // Validate required data
    if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'roomTypes must be a non-empty array'
      });
    }

    // Validate each room type has a name
    const invalidRoomTypes = roomTypes.filter(rt => !rt.name || rt.name.trim() === '');
    if (invalidRoomTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Each room type must have a valid name'
      });
    }

    console.log('Received data:', { 
      roomTypesCount: roomTypes?.length,
      roomTypes: roomTypes.map(rt => ({ name: rt.name, active: rt.active })),
      specificationsKeys: Object.keys(specifications || {}),
      billingEnabled,
      billingFeatures
    });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const createdRooms = [];

    // Process each room type
    for (let index = 0; index < roomTypes.length; index++) {
      const roomType = roomTypes[index];
      
      console.log(`Processing room type ${index + 1}/${roomTypes.length}: ${roomType.name}`);
      
      // Insert or get room type
      let roomTypeId;
      const [existingRoomType] = await connection.query(
        'SELECT id FROM room_types WHERE name = ?',
        [roomType.name.trim()]
      );

      if (existingRoomType.length > 0) {
        roomTypeId = existingRoomType[0].id;
        console.log(`Found existing room type: ${roomType.name} with ID: ${roomTypeId}`);
        
        if (roomType.active !== undefined) {
          await connection.query(
            'UPDATE room_types SET active = ? WHERE id = ?',
            [roomType.active ? 1 : 0, roomTypeId]
          );
        }
      } else {
        console.log(`Creating new room type: ${roomType.name}`);
        const [result] = await connection.query(
          'INSERT INTO room_types (name, active) VALUES (?, ?)',
          [roomType.name.trim(), roomType.active !== undefined ? (roomType.active ? 1 : 0) : 1]
        );
        roomTypeId = result.insertId;
        console.log(`Created new room type with ID: ${roomTypeId}`);
      }

      // Get specifications for this room
      const roomSpec = {
        roomSize: specifications?.roomSize?.[roomType.name] || null,
        roomSizeUnit: specifications?.roomSizeUnit?.[roomType.name] || 'sq ft',
        bedType: specifications?.bedType?.[roomType.name] || null,
        bedArrangement: specifications?.bedArrangement?.[roomType.name] || 'single',
        numberOfBeds: cleanInteger(specifications?.numberOfBeds?.[roomType.name], null),
        maximumOccupancy: cleanInteger(specifications?.maximumOccupancy?.[roomType.name], null),
        smokingPolicy: specifications?.smokingPolicy?.[roomType.name] || 'non-smoking',
        floorLevel: specifications?.floorLevel?.[roomType.name] || null,
        airConditioning: specifications?.airConditioning?.[roomType.name] || 'none',
        heatingSystem: cleanBoolean(specifications?.heatingSystem?.[roomType.name], false),
        ceilingFan: cleanBoolean(specifications?.ceilingFan?.[roomType.name], false),
        humidityControl: cleanBoolean(specifications?.humidityControl?.[roomType.name], false),
        blackoutCurtains: cleanBoolean(specifications?.blackoutCurtains?.[roomType.name], false),
        soundInsulation: cleanBoolean(specifications?.soundInsulation?.[roomType.name], false),
        bedsideTables: specifications?.bedsideTables?.[roomType.name] || null,
        sofaCouch: specifications?.sofaCouch?.[roomType.name] || null,
        workDesk: specifications?.workDesk?.[roomType.name] || null,
        coffeeTable: specifications?.coffeeTable?.[roomType.name] || null,
        wardrobe: specifications?.wardrobe?.[roomType.name] || null,
        luggageRack: specifications?.luggageRack?.[roomType.name] || null,
        fullLengthMirror: specifications?.fullLengthMirror?.[roomType.name] || null,
        readingLamps: specifications?.readingLamps?.[roomType.name] || null,
        smartTV: cleanBoolean(specifications?.smartTV?.[roomType.name], false),
        tvChannels: cleanBoolean(specifications?.tvChannels?.[roomType.name], false),
        inRoomTablet: cleanBoolean(specifications?.inRoomTablet?.[roomType.name], false),
        bluetoothSpeaker: cleanBoolean(specifications?.bluetoothSpeaker?.[roomType.name], false),
        gamingConsole: cleanBoolean(specifications?.gamingConsole?.[roomType.name], false),
        payPerViewMovies: cleanBoolean(specifications?.payPerViewMovies?.[roomType.name], false),
        highSpeedWifi: specifications?.highSpeedWifi?.[roomType.name] || null,
        lanPort: cleanBoolean(specifications?.lanPort?.[roomType.name], false),
        usbChargingPorts: cleanBoolean(specifications?.usbChargingPorts?.[roomType.name], false),
        universalPowerSockets: cleanBoolean(specifications?.universalPowerSockets?.[roomType.name], false),
        smartRoomAutomation: cleanBoolean(specifications?.smartRoomAutomation?.[roomType.name], false),
        mobileKeyAccess: cleanBoolean(specifications?.mobileKeyAccess?.[roomType.name], false),
        soundproofRooms: cleanBoolean(specifications?.soundproofRooms?.[roomType.name], false),
        connectingRooms: cleanBoolean(specifications?.connectingRooms?.[roomType.name], false),
        features: specifications?.features?.[roomType.name] || null,
        remarks: specifications?.remarks?.[roomType.name] || null
      };

      // Insert room specifications
      const [specResult] = await connection.query(`
        INSERT INTO room_specifications (
          room_type_id, room_size, room_size_unit, bed_type, bed_arrangement,
          number_of_beds, maximum_occupancy, smoking_policy, floor_level,
          air_conditioning, heating_system, ceiling_fan, humidity_control,
          blackout_curtains, sound_insulation, bedside_tables, sofa_couch,
          work_desk, coffee_table, wardrobe, luggage_rack, full_length_mirror,
          reading_lamps, smart_tv, tv_channels, in_room_tablet, bluetooth_speaker,
          gaming_console, pay_per_view_movies, high_speed_wifi, lan_port,
          usb_charging_ports, universal_power_sockets, smart_room_automation,
          mobile_key_access, soundproof_rooms, connecting_rooms, features, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        roomTypeId,
        roomSpec.roomSize,
        roomSpec.roomSizeUnit,
        roomSpec.bedType,
        roomSpec.bedArrangement,
        roomSpec.numberOfBeds,
        roomSpec.maximumOccupancy,
        roomSpec.smokingPolicy,
        roomSpec.floorLevel,
        roomSpec.airConditioning,
        roomSpec.heatingSystem,
        roomSpec.ceilingFan,
        roomSpec.humidityControl,
        roomSpec.blackoutCurtains,
        roomSpec.soundInsulation,
        roomSpec.bedsideTables,
        roomSpec.sofaCouch,
        roomSpec.workDesk,
        roomSpec.coffeeTable,
        roomSpec.wardrobe,
        roomSpec.luggageRack,
        roomSpec.fullLengthMirror,
        roomSpec.readingLamps,
        roomSpec.smartTV,
        roomSpec.tvChannels,
        roomSpec.inRoomTablet,
        roomSpec.bluetoothSpeaker,
        roomSpec.gamingConsole,
        roomSpec.payPerViewMovies,
        roomSpec.highSpeedWifi,
        roomSpec.lanPort,
        roomSpec.usbChargingPorts,
        roomSpec.universalPowerSockets,
        roomSpec.smartRoomAutomation,
        roomSpec.mobileKeyAccess,
        roomSpec.soundproofRooms,
        roomSpec.connectingRooms,
        roomSpec.features,
        roomSpec.remarks
      ]);

      const roomSpecId = specResult.insertId;
      console.log(`Created room specification with ID: ${roomSpecId} for room type: ${roomType.name}`);

      // Insert OTT Apps if provided
      if (specifications?.ottApps?.[roomType.name] && Array.isArray(specifications.ottApps[roomType.name]) && specifications.ottApps[roomType.name].length > 0) {
        const ottValues = specifications.ottApps[roomType.name].map(app => [roomSpecId, app]);
        await connection.query(
          'INSERT INTO room_ott_apps (room_spec_id, app_name) VALUES ?',
          [ottValues]
        );
        console.log(`Inserted ${ottValues.length} OTT apps for room type: ${roomType.name}`);
      }

      // Insert Room Images
      if (specifications?.roomImages?.[roomType.name] && Array.isArray(specifications.roomImages[roomType.name]) && specifications.roomImages[roomType.name].length > 0) {
        const imageValues = processImages(specifications.roomImages[roomType.name], roomSpecId);
        if (imageValues.length > 0) {
          await connection.query(
            'INSERT INTO room_images (room_spec_id, image_url, image_data, image_name, is_primary) VALUES ?',
            [imageValues]
          );
          console.log(`Inserted ${imageValues.length} images for room type: ${roomType.name}`);
        }
      }

      // Insert Pricing
      const pricingData = {
        basePrice: cleanDecimal(specifications?.basePrice?.[roomType.name], 0),
        currency: specifications?.currency?.[roomType.name] || 'USD',
        priceUnit: specifications?.priceUnit?.[roomType.name] || 'per night',
        taxRate: cleanDecimal(specifications?.taxRate?.[roomType.name], null),
        taxType: specifications?.taxType?.[roomType.name] || null,
        discountPercent: cleanDecimal(specifications?.discountPercent?.[roomType.name], null),
        weekendRate: cleanDecimal(specifications?.weekendRate?.[roomType.name], null),
        peakSeasonRate: cleanDecimal(specifications?.peakSeasonRate?.[roomType.name], null),
        extraPersonCharge: cleanDecimal(specifications?.extraPersonCharge?.[roomType.name], null),
        extraBedCharge: cleanDecimal(specifications?.extraBedCharge?.[roomType.name], null),
        breakfastIncluded: cleanBoolean(specifications?.breakfastIncluded?.[roomType.name], false),
        breakfastPrice: cleanDecimal(specifications?.breakfastPrice?.[roomType.name], null),
        refundable: cleanBoolean(specifications?.refundable?.[roomType.name], true),
        cancellationPolicy: specifications?.cancellationPolicy?.[roomType.name] || null,
        minStay: cleanInteger(specifications?.minStay?.[roomType.name], 1),
        maxStay: cleanInteger(specifications?.maxStay?.[roomType.name], null)
      };

      await connection.query(`
        INSERT INTO room_pricing (
          room_spec_id, currency, price_unit, base_price, tax_rate, tax_type,
          discount_percent, weekend_rate, peak_season_rate, extra_person_charge,
          extra_bed_charge, breakfast_included, breakfast_price, refundable,
          cancellation_policy, min_stay, max_stay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        roomSpecId,
        pricingData.currency,
        pricingData.priceUnit,
        pricingData.basePrice,
        pricingData.taxRate,
        pricingData.taxType,
        pricingData.discountPercent,
        pricingData.weekendRate,
        pricingData.peakSeasonRate,
        pricingData.extraPersonCharge,
        pricingData.extraBedCharge,
        pricingData.breakfastIncluded,
        pricingData.breakfastPrice,
        pricingData.refundable,
        pricingData.cancellationPolicy,
        pricingData.minStay,
        pricingData.maxStay
      ]);
      
      console.log(`Inserted pricing for room type: ${roomType.name}`);

      // Insert Billing Features
      if (billingEnabled !== undefined || billingFeatures) {
        await connection.query(`
          INSERT INTO billing_features (
            room_spec_id, billing_enabled, tax_enabled, discount_enabled,
            weekend_rate_enabled, peak_season_rate_enabled, extra_person_charge_enabled,
            extra_bed_charge_enabled, breakfast_enabled, cancellation_policy_enabled,
            min_max_stay_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          roomSpecId,
          cleanBoolean(billingEnabled, true),
          cleanBoolean(billingFeatures?.taxEnabled, false),
          cleanBoolean(billingFeatures?.discountEnabled, false),
          cleanBoolean(billingFeatures?.weekendRateEnabled, false),
          cleanBoolean(billingFeatures?.peakSeasonRateEnabled, false),
          cleanBoolean(billingFeatures?.extraPersonChargeEnabled, false),
          cleanBoolean(billingFeatures?.extraBedChargeEnabled, false),
          cleanBoolean(billingFeatures?.breakfastEnabled, false),
          cleanBoolean(billingFeatures?.cancellationPolicyEnabled, true),
          cleanBoolean(billingFeatures?.minMaxStayEnabled, false)
        ]);
        
        console.log(`Inserted billing features for room type: ${roomType.name}`);
      }

      createdRooms.push({
        roomTypeId,
        roomSpecId,
        name: roomType.name,
        index: index
      });
    }

    await connection.commit();
    console.log(`Transaction committed successfully. Created ${createdRooms.length} room specifications`);

    res.status(201).json({
      success: true,
      message: 'Room specifications saved successfully',
      data: createdRooms,
      count: createdRooms.length
    });
  } catch (error) {
    console.error('Error creating room specifications:', error);
    if (connection) {
      await connection.rollback();
      console.log('Transaction rolled back due to error');
    }
    
    const statusCode = error.message.includes('Validation error') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.code || 'Database error',
      message: error.message || 'Failed to save room specifications',
      ...(process.env.NODE_ENV === 'development' && { details: error.stack })
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get all room specifications
const getAllRoomSpecifications = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [roomTypes] = await connection.query(`
      SELECT rt.*, rs.id as spec_id
      FROM room_types rt
      LEFT JOIN room_specifications rs ON rt.id = rs.room_type_id
      WHERE rt.active = true
      ORDER BY rt.id
    `);

    const rooms = [];

    for (const roomType of roomTypes) {
      const roomData = {
        id: roomType.id,
        name: roomType.name,
        active: roomType.active === 1,
        specifications: {},
        billingEnabled: true,
        billingFeatures: {}
      };

      if (roomType.spec_id) {
        // Get specifications
        const [specs] = await connection.query(
          'SELECT * FROM room_specifications WHERE id = ?',
          [roomType.spec_id]
        );

        if (specs.length > 0) {
          const spec = specs[0];
          roomData.specifications = {
            roomSize: spec.room_size,
            roomSizeUnit: spec.room_size_unit,
            bedType: spec.bed_type,
            bedArrangement: spec.bed_arrangement,
            numberOfBeds: spec.number_of_beds,
            maximumOccupancy: spec.maximum_occupancy,
            smokingPolicy: spec.smoking_policy,
            floorLevel: spec.floor_level,
            airConditioning: spec.air_conditioning,
            heatingSystem: spec.heating_system === 1,
            ceilingFan: spec.ceiling_fan === 1,
            humidityControl: spec.humidity_control === 1,
            blackoutCurtains: spec.blackout_curtains === 1,
            soundInsulation: spec.sound_insulation === 1,
            bedsideTables: spec.bedside_tables,
            sofaCouch: spec.sofa_couch,
            workDesk: spec.work_desk,
            coffeeTable: spec.coffee_table,
            wardrobe: spec.wardrobe,
            luggageRack: spec.luggage_rack,
            fullLengthMirror: spec.full_length_mirror,
            readingLamps: spec.reading_lamps,
            smartTV: spec.smart_tv === 1,
            tvChannels: spec.tv_channels === 1,
            inRoomTablet: spec.in_room_tablet === 1,
            bluetoothSpeaker: spec.bluetooth_speaker === 1,
            gamingConsole: spec.gaming_console === 1,
            payPerViewMovies: spec.pay_per_view_movies === 1,
            highSpeedWifi: spec.high_speed_wifi,
            lanPort: spec.lan_port === 1,
            usbChargingPorts: spec.usb_charging_ports === 1,
            universalPowerSockets: spec.universal_power_sockets === 1,
            smartRoomAutomation: spec.smart_room_automation === 1,
            mobileKeyAccess: spec.mobile_key_access === 1,
            soundproofRooms: spec.soundproof_rooms === 1,
            connectingRooms: spec.connecting_rooms === 1,
            features: spec.features,
            remarks: spec.remarks
          };

          // Get OTT Apps
          const [ottApps] = await connection.query(
            'SELECT app_name FROM room_ott_apps WHERE room_spec_id = ?',
            [roomType.spec_id]
          );
          roomData.specifications.ottApps = ottApps.map(app => app.app_name);

          // Get Room Images
          const [images] = await connection.query(
            'SELECT id, image_url, image_name, is_primary FROM room_images WHERE room_spec_id = ? ORDER BY is_primary DESC, created_at ASC',
            [roomType.spec_id]
          );
          roomData.specifications.roomImages = images.map(img => ({
            id: img.id,
            url: img.image_url,
            name: img.image_name,
            isPrimary: img.is_primary === 1
          }));

          // Get Pricing
          const [pricing] = await connection.query(
            'SELECT * FROM room_pricing WHERE room_spec_id = ?',
            [roomType.spec_id]
          );
          if (pricing.length > 0) {
            const p = pricing[0];
            roomData.specifications.pricing = {
              basePrice: p.base_price,
              currency: p.currency,
              priceUnit: p.price_unit,
              taxRate: p.tax_rate,
              taxType: p.tax_type,
              discountPercent: p.discount_percent,
              weekendRate: p.weekend_rate,
              peakSeasonRate: p.peak_season_rate,
              extraPersonCharge: p.extra_person_charge,
              extraBedCharge: p.extra_bed_charge,
              breakfastIncluded: p.breakfast_included === 1,
              breakfastPrice: p.breakfast_price,
              refundable: p.refundable === 1,
              cancellationPolicy: p.cancellation_policy,
              minStay: p.min_stay,
              maxStay: p.max_stay
            };
          }

          // Get Billing Features
          const [billingFeat] = await connection.query(
            'SELECT * FROM billing_features WHERE room_spec_id = ?',
            [roomType.spec_id]
          );
          if (billingFeat.length > 0) {
            const bf = billingFeat[0];
            roomData.billingEnabled = bf.billing_enabled === 1;
            roomData.billingFeatures = {
              taxEnabled: bf.tax_enabled === 1,
              discountEnabled: bf.discount_enabled === 1,
              weekendRateEnabled: bf.weekend_rate_enabled === 1,
              peakSeasonRateEnabled: bf.peak_season_rate_enabled === 1,
              extraPersonChargeEnabled: bf.extra_person_charge_enabled === 1,
              extraBedChargeEnabled: bf.extra_bed_charge_enabled === 1,
              breakfastEnabled: bf.breakfast_enabled === 1,
              cancellationPolicyEnabled: bf.cancellation_policy_enabled === 1,
              minMaxStayEnabled: bf.min_max_stay_enabled === 1
            };
          }
        }
      }

      rooms.push(roomData);
    }

    res.json({
      success: true,
      data: rooms
    });
  } catch (error) {
    console.error('Error fetching room specifications:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch room specifications'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get room images by room ID
const getRoomImages = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [images] = await connection.query(
      'SELECT id, image_url, image_name, is_primary, created_at FROM room_images WHERE room_spec_id = ? ORDER BY is_primary DESC, created_at ASC',
      [id]
    );

    res.json({
      success: true,
      data: images
    });
  } catch (error) {
    console.error('Error fetching room images:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to fetch room images'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Delete room image
const deleteRoomImage = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();

    const [result] = await connection.query(
      'DELETE FROM room_images WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Image not found',
        message: 'Room image not found'
      });
    }

    res.json({
      success: true,
      message: 'Room image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room image:', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to delete room image'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Delete room specification
const deleteRoomSpecification = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      'DELETE FROM room_types WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
        message: 'Room type not found'
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'Room specification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room specification:', error);
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: 'Failed to delete room specification'
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  createRoomSpecifications,
  getAllRoomSpecifications,
  getRoomImages,
  deleteRoomImage,
  deleteRoomSpecification
};

