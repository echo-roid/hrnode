const db = require('../config/db');

const hotelController = {
// Add this method to your cab management controller
getPnrPassengerByLeadId: async (req, res) => {
    console.log("mnhjhjhjh")
    let connection;
    try {
        const { lead_id } = req.params;
        const { page = 1, limit = 10, search = '' } = req.query;
        
        console.log('Fetching PNR passengers for lead_id:', lead_id);
        console.log('Search term:', search);

        // Convert to numbers with validation
        const pageNumber = Math.max(1, parseInt(page) || 1);
        const limitNumber = Math.max(1, Math.min(parseInt(limit) || 10, 100));
        const offset = (pageNumber - 1) * limitNumber;
        
        const leadIdNum = parseInt(lead_id);
        if (isNaN(leadIdNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid lead_id parameter. Must be a number.'
            });
        }
        
        console.log('Lead ID:', leadIdNum);
        console.log('Page:', pageNumber, 'Limit:', limitNumber, 'Offset:', offset);

        connection = await db.getConnection();
        
        // Build WHERE clause and parameters
        let whereClause = 'WHERE lead_id = ?';
        const baseParams = [leadIdNum];
        
        let searchWhereClause = '';
        let searchParams = [];
        
        if (search && search.trim() !== '') {
            const searchTerm = `%${search.trim()}%`;
            searchWhereClause = ` AND (
                pnr_number LIKE ? OR
                hotel_vendor_name LIKE ? OR
                hotel_confirmation_number LIKE ? OR
                hotel_vendor_id LIKE ? OR
                transit_hotel_name LIKE ? OR
                transit_onward_cab_number LIKE ? OR
                transit_return_cab_number LIKE ? OR
                final_dest_onward_cab_number LIKE ? OR
                final_dest_return_cab_number LIKE ?
            )`;
            searchParams = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, 
                          searchTerm, searchTerm, searchTerm, searchTerm];
        }
        
        const finalWhereClause = whereClause + searchWhereClause;
        const countParams = [...baseParams, ...searchParams];
        
        console.log('Final WHERE clause:', finalWhereClause);
        console.log('Count params:', countParams);

        // Count total records
        let total = 0;
        try {
            const countQuery = `SELECT COUNT(*) as total FROM pnr_passenger ${finalWhereClause}`;
            console.log('Count query:', countQuery);
            const [countResult] = await connection.execute(countQuery, countParams);
            total = countResult[0].total;
            console.log('Total records found:', total);
        } catch (countError) {
            console.log('Count query error:', countError.message);
        }

        // Fetch data with pagination
        let rows = [];
        if (total > 0) {
            try {
                const fetchQuery = `
                    SELECT 
                        id,
                        pnr_number,
                        passengers,
                        lead_id,
                        pax_code,
                        flight_segments,
                        hotel_vendor_id,
                        hotel_vendor_name,
                        hotel_check_in,
                        hotel_check_out,
                        hotel_room_type,
                        hotel_confirmation_number,
                        hotel_amount,
                        hotel_currency,
                        hotel_status,
                        hotel_remarks,
                        hotel_assigned_at,
                        hotel_assigned_by,
                        transit_hotel_name,
                        transit_hotel_check_in,
                        transit_hotel_check_out,
                        transit_hotel_room_count,
                        transit_hotel_guest_count,
                        transit_onward_cab_number,
                        transit_return_cab_number,
                        final_dest_onward_cab_number,
                        final_dest_return_cab_number,
                        stay_type,
                        share_with_m,
                        created_at,
                        updated_at
                    FROM pnr_passenger 
                    ${finalWhereClause} 
                    ORDER BY created_at DESC 
                    LIMIT ? OFFSET ?
                `;
                
                const fetchParams = [
                    ...countParams,
                    limitNumber.toString(),
                    offset.toString()
                ];
                
                console.log('Fetch query:', fetchQuery);
                console.log('Fetch params:', fetchParams);
                
                [rows] = await connection.execute(fetchQuery, fetchParams);
                console.log('Rows fetched:', rows.length);
                
            } catch (fetchError) {
                console.log('Fetch query error:', fetchError.message);
                console.log('Fetch error details:', {
                    sqlState: fetchError.sqlState,
                    code: fetchError.code,
                    errno: fetchError.errno,
                    sqlMessage: fetchError.sqlMessage
                });
                
                // Alternative: Try without pagination first
                try {
                    console.log('Trying without pagination...');
                    const altQuery = `
                        SELECT 
                            id,
                            pnr_number,
                            passengers,
                            lead_id,
                            pax_code,
                            flight_segments,
                            hotel_vendor_id,
                            hotel_vendor_name,
                            hotel_check_in,
                            hotel_check_out,
                            hotel_room_type,
                            hotel_confirmation_number,
                            hotel_amount,
                            hotel_currency,
                            hotel_status,
                            hotel_remarks,
                            hotel_assigned_at,
                            hotel_assigned_by,
                            transit_hotel_name,
                            transit_hotel_check_in,
                            transit_hotel_check_out,
                            transit_hotel_room_count,
                            transit_hotel_guest_count,
                            transit_onward_cab_number,
                            transit_return_cab_number,
                            final_dest_onward_cab_number,
                            final_dest_return_cab_number,
                            stay_type,
                            share_with_m,
                            created_at,
                            updated_at
                        FROM pnr_passenger 
                        ${finalWhereClause} 
                        ORDER BY created_at DESC
                    `;
                    
                    console.log('Alt query:', altQuery);
                    console.log('Alt params:', countParams);
                    
                    [rows] = await connection.execute(altQuery, countParams);
                    console.log('Alt rows fetched:', rows.length);
                    
                    // Apply pagination manually
                    rows = rows.slice(offset, offset + limitNumber);
                    
                } catch (altError) {
                    console.log('Alternative query also failed:', altError.message);
                    throw new Error(`Database query failed: ${altError.message}`);
                }
            }
        }

        // Release connection back to pool
        if (connection) {
            connection.release();
        }

        // Parse JSON columns and add hotel assignment info
        const parsedRows = rows.map(row => {
            const parsedRow = { ...row };

            // Parse JSON fields
            try {
                if (parsedRow.passengers && typeof parsedRow.passengers === 'string') {
                    parsedRow.passengers = JSON.parse(parsedRow.passengers);
                }
            } catch (e) {
                console.log('Error parsing passengers:', e.message);
                parsedRow.passengers = [];
            }

            try {
                if (parsedRow.flight_segments && typeof parsedRow.flight_segments === 'string') {
                    parsedRow.flight_segments = JSON.parse(parsedRow.flight_segments);
                }
            } catch (e) {
                console.log('Error parsing flight_segments:', e.message);
                parsedRow.flight_segments = [];
            }

            try {
                if (parsedRow.pax_code && typeof parsedRow.pax_code === 'string') {
                    parsedRow.pax_code = JSON.parse(parsedRow.pax_code);
                }
            } catch (e) {
                // Keep as is if not JSON
            }

            // ===== EXTRACT STAY_TYPE AND SHARE_WITH_M FROM FLIGHT_SEGMENTS =====
            let hotelSegmentStayType = null;
            let hotelSegmentShareWithM = null;
            
            if (parsedRow.flight_segments && Array.isArray(parsedRow.flight_segments)) {
                // Find the hotel segment
                const hotelSegment = parsedRow.flight_segments.find(segment => 
                    segment.type === 'hotel'
                );
                if (hotelSegment) {
                    hotelSegmentStayType = hotelSegment.stay_type;
                    hotelSegmentShareWithM = hotelSegment.share_with_m;
                }
            }
            
            // Use PNR-level stay_type and share_with_m as fallback
            const pnrStayType = parsedRow.stay_type || hotelSegmentStayType || 'hotel';
            const pnrShareWithM = parsedRow.share_with_m || hotelSegmentShareWithM || 'same';
            // ===== END EXTRACTION =====

            // ===== UPDATE PASSENGERS WITH STAY_TYPE AND SHARE_WITH_M =====
            if (parsedRow.passengers && Array.isArray(parsedRow.passengers)) {
                parsedRow.passengers = parsedRow.passengers.map((passenger, index) => {
                    // Check if there's a hotel segment for this specific passenger
                    let passengerSegmentStayType = null;
                    let passengerSegmentShareWithM = null;
                    
                    if (parsedRow.flight_segments && Array.isArray(parsedRow.flight_segments)) {
                        const passengerHotelSegment = parsedRow.flight_segments.find(segment => 
                            segment.type === 'hotel' && 
                            segment.passenger_index === index
                        );
                        if (passengerHotelSegment) {
                            passengerSegmentStayType = passengerHotelSegment.stay_type;
                            passengerSegmentShareWithM = passengerHotelSegment.share_with_m;
                        }
                    }
                    
                    // Priority: 1. Passenger segment stay_type, 2. PNR stay_type, 3. Default 'hotel'
                    const passengerStayType = passengerSegmentStayType || 
                                             passenger.stay_type || 
                                             passenger.stayType || 
                                             pnrStayType || 
                                             'hotel';
                    
                    const passengerShareWithM = passengerSegmentShareWithM || 
                                               passenger.share_with_m || 
                                               passenger.shareWithM || 
                                               pnrShareWithM || 
                                               'same';
                    
                    return {
                        ...passenger,
                        stay_type: passengerStayType,
                        share_with_m: passengerShareWithM,
                        stayType: passengerStayType, // For frontend compatibility
                        shareWithM: passengerShareWithM // For frontend compatibility
                    };
                });
            }
            // ===== END UPDATE PASSENGERS =====

            // Calculate passenger count
            parsedRow.passenger_count = Array.isArray(parsedRow.passengers) ? parsedRow.passengers.length : 0;

            // Hotel assignment status
            parsedRow.has_hotel_assignment = !!(parsedRow.hotel_vendor_id && 
                parsedRow.hotel_vendor_id.toString().trim() !== '');
            parsedRow.hotel_assignment_status = parsedRow.hotel_status || 
                (parsedRow.has_hotel_assignment ? 'assigned' : 'not_assigned');
            
            // Transit hotel assignment status
            parsedRow.has_transit_hotel = !!(parsedRow.transit_hotel_name && 
                parsedRow.transit_hotel_name.trim() !== '');
            parsedRow.transit_hotel_assignment_status = parsedRow.has_transit_hotel ? 'assigned' : 'not_assigned';
            
            // Cab assignment status
            parsedRow.has_transit_onward_cab = !!(parsedRow.transit_onward_cab_number && 
                parsedRow.transit_onward_cab_number.trim() !== '');
            parsedRow.has_transit_return_cab = !!(parsedRow.transit_return_cab_number && 
                parsedRow.transit_return_cab_number.trim() !== '');
            parsedRow.has_final_dest_onward_cab = !!(parsedRow.final_dest_onward_cab_number && 
                parsedRow.final_dest_onward_cab_number.trim() !== '');
            parsedRow.has_final_dest_return_cab = !!(parsedRow.final_dest_return_cab_number && 
                parsedRow.final_dest_return_cab_number.trim() !== '');

            // Format dates for main hotel
            if (parsedRow.hotel_check_in) {
                try {
                    const date = new Date(parsedRow.hotel_check_in);
                    parsedRow.hotel_check_in_formatted = date.toLocaleDateString();
                    parsedRow.hotel_check_in_iso = date.toISOString().split('T')[0];
                } catch (e) {
                    parsedRow.hotel_check_in_formatted = String(parsedRow.hotel_check_in);
                    parsedRow.hotel_check_in_iso = String(parsedRow.hotel_check_in);
                }
            }
            
            if (parsedRow.hotel_check_out) {
                try {
                    const date = new Date(parsedRow.hotel_check_out);
                    parsedRow.hotel_check_out_formatted = date.toLocaleDateString();
                    parsedRow.hotel_check_out_iso = date.toISOString().split('T')[0];
                } catch (e) {
                    parsedRow.hotel_check_out_formatted = String(parsedRow.hotel_check_out);
                    parsedRow.hotel_check_out_iso = String(parsedRow.hotel_check_out);
                }
            }

            // Format dates for transit hotel
            if (parsedRow.transit_hotel_check_in) {
                try {
                    const date = new Date(parsedRow.transit_hotel_check_in);
                    parsedRow.transit_hotel_check_in_formatted = date.toLocaleDateString();
                    parsedRow.transit_hotel_check_in_iso = date.toISOString().split('T')[0];
                } catch (e) {
                    parsedRow.transit_hotel_check_in_formatted = String(parsedRow.transit_hotel_check_in);
                    parsedRow.transit_hotel_check_in_iso = String(parsedRow.transit_hotel_check_in);
                }
            }
            
            if (parsedRow.transit_hotel_check_out) {
                try {
                    const date = new Date(parsedRow.transit_hotel_check_out);
                    parsedRow.transit_hotel_check_out_formatted = date.toLocaleDateString();
                    parsedRow.transit_hotel_check_out_iso = date.toISOString().split('T')[0];
                } catch (e) {
                    parsedRow.transit_hotel_check_out_formatted = String(parsedRow.transit_hotel_check_out);
                    parsedRow.transit_hotel_check_out_iso = String(parsedRow.transit_hotel_check_out);
                }
            }

            // Calculate stay duration for main hotel
            if (parsedRow.hotel_check_in && parsedRow.hotel_check_out) {
                try {
                    const checkIn = new Date(parsedRow.hotel_check_in);
                    const checkOut = new Date(parsedRow.hotel_check_out);
                    const durationDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                    parsedRow.hotel_stay_duration = Math.max(1, durationDays);
                    parsedRow.hotel_stay_duration_display = `${parsedRow.hotel_stay_duration} day${parsedRow.hotel_stay_duration > 1 ? 's' : ''}`;
                } catch (e) {
                    parsedRow.hotel_stay_duration = 0;
                    parsedRow.hotel_stay_duration_display = 'N/A';
                }
            } else {
                parsedRow.hotel_stay_duration = 0;
                parsedRow.hotel_stay_duration_display = 'N/A';
            }

            // Calculate stay duration for transit hotel
            if (parsedRow.transit_hotel_check_in && parsedRow.transit_hotel_check_out) {
                try {
                    const checkIn = new Date(parsedRow.transit_hotel_check_in);
                    const checkOut = new Date(parsedRow.transit_hotel_check_out);
                    const durationDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
                    parsedRow.transit_hotel_stay_duration = Math.max(1, durationDays);
                    parsedRow.transit_hotel_stay_duration_display = `${parsedRow.transit_hotel_stay_duration} day${parsedRow.transit_hotel_stay_duration > 1 ? 's' : ''}`;
                } catch (e) {
                    parsedRow.transit_hotel_stay_duration = 0;
                    parsedRow.transit_hotel_stay_duration_display = 'N/A';
                }
            } else {
                parsedRow.transit_hotel_stay_duration = 0;
                parsedRow.transit_hotel_stay_duration_display = 'N/A';
            }

            // Format amount for main hotel
            if (parsedRow.hotel_amount !== null && parsedRow.hotel_amount !== undefined) {
                try {
                    const currency = parsedRow.hotel_currency || 'INR';
                    const amount = parseFloat(parsedRow.hotel_amount);
                    if (!isNaN(amount)) {
                        parsedRow.hotel_amount_formatted = `${currency} ${amount.toFixed(2)}`;
                        parsedRow.hotel_amount_numeric = amount;
                    } else {
                        parsedRow.hotel_amount_formatted = 'Invalid amount';
                        parsedRow.hotel_amount_numeric = 0;
                    }
                } catch (e) {
                    parsedRow.hotel_amount_formatted = 'Error';
                    parsedRow.hotel_amount_numeric = 0;
                }
            } else {
                parsedRow.hotel_amount_formatted = 'Not specified';
                parsedRow.hotel_amount_numeric = 0;
            }

            // Format assigned at for main hotel
            if (parsedRow.hotel_assigned_at) {
                try {
                    const date = new Date(parsedRow.hotel_assigned_at);
                    parsedRow.hotel_assigned_at_formatted = date.toLocaleString();
                    parsedRow.hotel_assigned_at_iso = date.toISOString();
                } catch (e) {
                    parsedRow.hotel_assigned_at_formatted = String(parsedRow.hotel_assigned_at);
                    parsedRow.hotel_assigned_at_iso = String(parsedRow.hotel_assigned_at);
                }
            }

            // ===== ADD STAY TYPE AND SHARE WITH M SUMMARY =====
            // PNR-level stay_type and share_with_m
            parsedRow.pnr_stay_type = pnrStayType;
            parsedRow.pnr_share_with_m = pnrShareWithM;
            
            // Per-passenger stay_type and share_with_m
            if (parsedRow.passengers && Array.isArray(parsedRow.passengers)) {
                parsedRow.passenger_stay_details = parsedRow.passengers.map((passenger, index) => ({
                    passenger_index: index,
                    passenger_name: passenger.fullName || 
                                  `${passenger.first_name || ''} ${passenger.last_name || ''}`.trim() || 
                                  `Passenger ${index + 1}`,
                    pax_code: passenger.pax_code || passenger.paxCode || null,
                    stay_type: passenger.stay_type || 'hotel',
                    share_with_m: passenger.share_with_m || 'same',
                    has_hotel_assigned: !!(passenger.hotel_vendor_id || passenger.hotel_check_in)
                }));
                
                // Count passengers by stay_type and share_with_m
                const stayTypeCounts = {};
                const shareWithMCounts = {};
                parsedRow.passengers.forEach(p => {
                    const stayType = p.stay_type || 'hotel';
                    const shareWithM = p.share_with_m || 'same';
                    stayTypeCounts[stayType] = (stayTypeCounts[stayType] || 0) + 1;
                    shareWithMCounts[shareWithM] = (shareWithMCounts[shareWithM] || 0) + 1;
                });
                parsedRow.stay_type_summary = stayTypeCounts;
                parsedRow.share_with_m_summary = shareWithMCounts;
            }
            // ===== END STAY TYPE AND SHARE WITH M SUMMARY =====

            // Add cab details
            parsedRow.transit_cab_details = {
                onward_cab_number: parsedRow.transit_onward_cab_number,
                return_cab_number: parsedRow.transit_return_cab_number,
                has_onward_cab: parsedRow.has_transit_onward_cab,
                has_return_cab: parsedRow.has_transit_return_cab
            };

            parsedRow.final_destination_cab_details = {
                onward_cab_number: parsedRow.final_dest_onward_cab_number,
                return_cab_number: parsedRow.final_dest_return_cab_number,
                has_onward_cab: parsedRow.has_final_dest_onward_cab,
                has_return_cab: parsedRow.has_final_dest_return_cab
            };

            // Add derived fields
            parsedRow.hotel_vendor_details = {
                vendor_id: parsedRow.hotel_vendor_id,
                vendor_name: parsedRow.hotel_vendor_name || 'Unknown Hotel'
            };

            parsedRow.transit_hotel_details = {
                hotel_name: parsedRow.transit_hotel_name,
                check_in: parsedRow.transit_hotel_check_in_iso,
                check_out: parsedRow.transit_hotel_check_out_iso,
                check_in_formatted: parsedRow.transit_hotel_check_in_formatted,
                check_out_formatted: parsedRow.transit_hotel_check_out_formatted,
                room_count: parsedRow.transit_hotel_room_count || 1,
                guest_count: parsedRow.transit_hotel_guest_count || 1,
                stay_duration: parsedRow.transit_hotel_stay_duration,
                stay_duration_display: parsedRow.transit_hotel_stay_duration_display,
                is_assigned: parsedRow.has_transit_hotel,
                cab_numbers: {
                    onward: parsedRow.transit_onward_cab_number,
                    return: parsedRow.transit_return_cab_number
                }
            };

            parsedRow.hotel_booking_details = {
                check_in: parsedRow.hotel_check_in_iso,
                check_out: parsedRow.hotel_check_out_iso,
                check_in_formatted: parsedRow.hotel_check_in_formatted,
                check_out_formatted: parsedRow.hotel_check_out_formatted,
                room_type: parsedRow.hotel_room_type || 'Standard',
                confirmation_number: parsedRow.hotel_confirmation_number,
                amount: parsedRow.hotel_amount_numeric,
                amount_formatted: parsedRow.hotel_amount_formatted,
                currency: parsedRow.hotel_currency || 'INR',
                status: parsedRow.hotel_status,
                remarks: parsedRow.hotel_remarks,
                stay_duration: parsedRow.hotel_stay_duration,
                stay_duration_display: parsedRow.hotel_stay_duration_display,
                assigned_at: parsedRow.hotel_assigned_at_iso,
                assigned_at_formatted: parsedRow.hotel_assigned_at_formatted,
                assigned_by: parsedRow.hotel_assigned_by
            };

            parsedRow.cab_assignment_summary = {
                transit: {
                    onward_assigned: parsedRow.has_transit_onward_cab,
                    onward_cab_number: parsedRow.transit_onward_cab_number,
                    return_assigned: parsedRow.has_transit_return_cab,
                    return_cab_number: parsedRow.transit_return_cab_number,
                    status: parsedRow.has_transit_onward_cab || parsedRow.has_transit_return_cab ? 'assigned' : 'not_assigned'
                },
                final_destination: {
                    onward_assigned: parsedRow.has_final_dest_onward_cab,
                    onward_cab_number: parsedRow.final_dest_onward_cab_number,
                    return_assigned: parsedRow.has_final_dest_return_cab,
                    return_cab_number: parsedRow.final_dest_return_cab_number,
                    status: parsedRow.has_final_dest_onward_cab || parsedRow.has_final_dest_return_cab ? 'assigned' : 'not_assigned'
                }
            };

            parsedRow.hotel_summary = parsedRow.has_hotel_assignment ? {
                hotel_name: parsedRow.hotel_vendor_name || 'Unknown Hotel',
                check_in: parsedRow.hotel_check_in_formatted,
                check_out: parsedRow.hotel_check_out_formatted,
                duration: parsedRow.hotel_stay_duration_display,
                room_type: parsedRow.hotel_room_type || 'Standard',
                status: parsedRow.hotel_status || 'assigned',
                confirmation: parsedRow.hotel_confirmation_number || 'Not provided',
                amount: parsedRow.hotel_amount_formatted,
                vendor_id: parsedRow.hotel_vendor_id,
                assigned_by: parsedRow.hotel_assigned_by || 'System',
                stay_type: pnrStayType,
                share_with_m: pnrShareWithM,
                transit_hotel: parsedRow.has_transit_hotel ? {
                    name: parsedRow.transit_hotel_name,
                    check_in: parsedRow.transit_hotel_check_in_formatted,
                    check_out: parsedRow.transit_hotel_check_out_formatted,
                    rooms: parsedRow.transit_hotel_room_count || 1,
                    guests: parsedRow.transit_hotel_guest_count || 1,
                    duration: parsedRow.transit_hotel_stay_duration_display
                } : null,
                cab_assignments: parsedRow.cab_assignment_summary
            } : {
                message: 'No hotel assignment',
                status: 'not_assigned',
                stay_type: pnrStayType,
                share_with_m: pnrShareWithM,
                transit_hotel: parsedRow.has_transit_hotel ? {
                    name: parsedRow.transit_hotel_name,
                    check_in: parsedRow.transit_hotel_check_in_formatted,
                    check_out: parsedRow.transit_hotel_check_out_formatted,
                    rooms: parsedRow.transit_hotel_room_count || 1,
                    guests: parsedRow.transit_hotel_guest_count || 1,
                    duration: parsedRow.transit_hotel_stay_duration_display
                } : null,
                cab_assignments: parsedRow.cab_assignment_summary
            };

            return parsedRow;
        });

        // Calculate statistics
        const statistics = {
            total_pnrs: total,
            pnrs_with_hotels: parsedRows.filter(row => row.has_hotel_assignment).length,
            pnrs_without_hotels: parsedRows.filter(row => !row.has_hotel_assignment).length,
            pnrs_with_transit_hotels: parsedRows.filter(row => row.has_transit_hotel).length,
            pnrs_with_transit_onward_cabs: parsedRows.filter(row => row.has_transit_onward_cab).length,
            pnrs_with_transit_return_cabs: parsedRows.filter(row => row.has_transit_return_cab).length,
            pnrs_with_final_dest_onward_cabs: parsedRows.filter(row => row.has_final_dest_onward_cab).length,
            pnrs_with_final_dest_return_cabs: parsedRows.filter(row => row.has_final_dest_return_cab).length,
            confirmed_hotels: parsedRows.filter(row => row.hotel_status === 'confirmed').length,
            checked_in_hotels: parsedRows.filter(row => row.hotel_status === 'checked_in').length,
            cancelled_hotels: parsedRows.filter(row => row.hotel_status === 'cancelled').length,
            pending_hotels: parsedRows.filter(row => row.hotel_status === 'pending').length,
            total_passengers: parsedRows.reduce((sum, row) => sum + row.passenger_count, 0),
            transit_rooms_required: parsedRows.reduce((sum, row) => sum + (row.transit_hotel_room_count || 0), 0),
            transit_guests_total: parsedRows.reduce((sum, row) => sum + (row.transit_hotel_guest_count || 0), 0),
            // ===== STAY TYPE AND SHARE WITH M STATISTICS =====
            stay_type_stats: {
                hotel: parsedRows.reduce((sum, row) => {
                    const count = row.passengers?.filter(p => (p.stay_type || 'hotel') === 'hotel').length || 0;
                    return sum + count;
                }, 0),
                lounge: parsedRows.reduce((sum, row) => {
                    const count = row.passengers?.filter(p => (p.stay_type || 'hotel') === 'lounge').length || 0;
                    return sum + count;
                }, 0)
            },
            share_with_m_stats: {
                same: parsedRows.reduce((sum, row) => {
                    const count = row.passengers?.filter(p => (p.share_with_m || 'same') === 'same').length || 0;
                    return sum + count;
                }, 0),
                family: parsedRows.reduce((sum, row) => {
                    const count = row.passengers?.filter(p => (p.share_with_m || 'same') === 'family').length || 0;
                    return sum + count;
                }, 0),
                group: parsedRows.reduce((sum, row) => {
                    const count = row.passengers?.filter(p => (p.share_with_m || 'same') === 'group').length || 0;
                    return sum + count;
                }, 0)
            }
            // ===== END STAY TYPE AND SHARE WITH M STATISTICS =====
        };

        res.json({
            success: true,
            data: parsedRows,
            statistics,
            pagination: {
                page: pageNumber,
                limit: limitNumber,
                total,
                pages: Math.ceil(total / limitNumber)
            }
        });

    } catch (error) {
        console.error('Error fetching pnr_passenger by lead ID:', error);
        
        if (connection) {
            connection.release();
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
},
getGroupedHotelAssignments: async (req, res) => {
    let connection;
    try {
        const { leadId } = req.params;
        
        // Validate lead_id
        const leadIdNum = parseInt(leadId);
        if (isNaN(leadIdNum)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid leadId parameter. Must be a number.'
            });
        }

        // Get connection from pool
        connection = await db.getConnection();
        
        // Fetch all PNRs with hotel assignments
        const query = `
            SELECT 
                id,
                pnr_number,
                passengers,
                pax_code,
                flight_segments,
                hotel_vendor_name,
                hotel_check_in,
                hotel_check_out,
                hotel_room_type,
                hotel_confirmation_number,
                hotel_status
            FROM pnr_passenger 
            WHERE lead_id = ?
            AND hotel_vendor_name IS NOT NULL
            AND hotel_vendor_name != ''
            AND hotel_check_in IS NOT NULL
        `;
        
        const [rows] = await connection.execute(query, [leadIdNum]);
        
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: [],
                statistics: {
                    total_rooms: 0,
                    total_passengers: 0,
                    occupancy_rate: '0%'
                },
                message: 'No hotel assignments found for this lead'
            });
        }
        
        // Release connection
        if (connection) connection.release();

        // Helper function to safely parse JSON
        const safeParse = (data) => {
            if (!data) return [];
            if (Array.isArray(data)) return data;
            if (typeof data === 'string') {
                try {
                    return JSON.parse(data) || [];
                } catch (e) {
                    return [];
                }
            }
            return [];
        };

        // Helper function to extract date from string or date object
        const extractDate = (dateValue) => {
            if (!dateValue) return null;
            if (typeof dateValue === 'string') {
                if (dateValue.includes('T')) {
                    return dateValue.split('T')[0];
                }
                return dateValue;
            }
            if (dateValue instanceof Date) {
                return dateValue.toISOString().split('T')[0];
            }
            return null;
        };

        // Collect all passenger assignments
        const allAssignments = [];
        
        rows.forEach((row) => {
            try {
                // Extract dates safely
                const hotelCheckIn = extractDate(row.hotel_check_in);
                const hotelCheckOut = extractDate(row.hotel_check_out);
                
                if (!hotelCheckIn) return;
                
                // Parse data
                const passengers = safeParse(row.passengers);
                const flightSegments = safeParse(row.flight_segments);
                
                // Extract arrival date
                let arrivalDate = hotelCheckIn;
                if (flightSegments.length > 0 && flightSegments[0].arrival_date) {
                    arrivalDate = extractDate(flightSegments[0].arrival_date);
                }
                
                // Process passengers
                passengers.forEach((passenger, passengerIndex) => {
                    if (!passenger || !passenger.form_data) return;
                    
                    // Extract passenger details from form_data
                    const formData = passenger.form_data;
                    
                    const assignment = {
                        passenger_id: passenger.pax_code || `PNR${row.id}_PAX${passengerIndex}`,
                        // Name details
                        first_name: formData.first_name || formData.given_name || '',
                        last_name: formData.last_name || formData.surname || '',
                        // Contact details
                        email: formData.email || formData.official_email_id || '',
                        phone: formData.phone || formData.mobile_number || '',
                        // Identification
                        nationality: formData.nationality || '',
                        passport_number: formData.passport_number || '',
                        // Family code
                        family_code: formData.fc_code || passenger.fc_code || null,
                        // Hotel details
                        hotel_name: row.hotel_vendor_name,
                        hotel_check_in: hotelCheckIn,
                        hotel_check_out: hotelCheckOut,
                        arrival_date: arrivalDate,
                        hotel_status: row.hotel_status || 'pending',
                        hotel_confirmation: row.hotel_confirmation_number,
                        // PNR info
                        pnr_number: row.pnr_number
                    };
                    
                    allAssignments.push(assignment);
                });
                
            } catch (error) {
                console.error('Error processing row:', error.message);
            }
        });

        if (allAssignments.length === 0) {
            return res.json({
                success: true,
                data: [],
                statistics: {
                    total_rooms: 0,
                    total_passengers: 0,
                    occupancy_rate: '0%'
                },
                message: 'No passenger data found'
            });
        }

        // Group by hotel + arrival date
        const groups = {};
        
        allAssignments.forEach(assignment => {
            if (!assignment.hotel_name || !assignment.arrival_date) return;
            
            const groupKey = `${assignment.hotel_name}_${assignment.arrival_date}_${assignment.hotel_check_in}`;
            
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    hotel_name: assignment.hotel_name,
                    arrival_date: assignment.arrival_date,
                    check_in: assignment.hotel_check_in,
                    check_out: assignment.hotel_check_out,
                    hotel_status: assignment.hotel_status,
                    confirmation: assignment.hotel_confirmation,
                    assignments: []
                };
            }
            
            groups[groupKey].assignments.push(assignment);
        });

        // Room allocation logic
        const result = [];
        let totalRooms = 0;
        let totalPassengers = 0;
        const roomTypeCounts = { single: 0, double: 0, triple: 0 };

        Object.values(groups).forEach((group, groupIndex) => {
            const assignments = group.assignments;
            const passengerCount = assignments.length;
            
            // Calculate rooms needed (max 3 per room)
            const roomsNeeded = Math.ceil(passengerCount / 3);
            
            // Create passenger array with full details
            const passengers = assignments.map(assign => ({
                id: assign.passenger_id,
                name: `${assign.first_name} ${assign.last_name}`.trim(),
                email: assign.email,
                phone: assign.phone,
                family_code: assign.family_code,
                nationality: assign.nationality,
                passport_number: assign.passport_number,
                pnr_number: assign.pnr_number
            }));
            
            // Sort by family code to keep families together
            passengers.sort((a, b) => {
                if (a.family_code && b.family_code) {
                    return a.family_code.localeCompare(b.family_code);
                }
                if (a.family_code) return -1;
                if (b.family_code) return 1;
                return 0;
            });
            
            // Create room assignments
            const roomAssignments = [];
            
            for (let roomIndex = 0; roomIndex < roomsNeeded; roomIndex++) {
                const startIdx = roomIndex * 3;
                const endIdx = Math.min(startIdx + 3, passengerCount);
                const roomPassengers = passengers.slice(startIdx, endIdx);
                
                if (roomPassengers.length === 0) continue;
                
                const roomId = `ROOM_${totalRooms + 1}`;
                const familyCodes = [...new Set(roomPassengers.map(p => p.family_code).filter(Boolean))];
                const isFamilyGroup = familyCodes.length === 1 && roomPassengers.length > 1;
                
                roomAssignments.push({
                    room_id: roomId,
                    room_type: getRoomType(roomPassengers.length),
                    passengers: roomPassengers.map(p => ({
                        name: p.name,
                        email: p.email,
                        phone: p.phone,
                        family_code: p.family_code,
                        nationality: p.nationality,
                        passport_number: p.passport_number,
                        pnr_number: p.pnr_number
                    })),
                    passenger_count: roomPassengers.length,
                    is_family_group: isFamilyGroup,
                    family_code: isFamilyGroup ? familyCodes[0] : 'MIXED',
                    occupancy: `${roomPassengers.length}/3`
                });
                
                // Update room type counts
                if (roomPassengers.length === 1) roomTypeCounts.single++;
                else if (roomPassengers.length === 2) roomTypeCounts.double++;
                else if (roomPassengers.length === 3) roomTypeCounts.triple++;
                
                totalRooms++;
            }
            
            // Update totals
            totalPassengers += passengerCount;
            
            // Add group to result
            result.push({
                group_id: `GROUP_${groupIndex + 1}`,
                hotel: group.hotel_name,
                arrival_date: group.arrival_date,
                check_in: group.check_in,
                check_out: group.check_out,
                status: group.hotel_status,
                confirmation: group.confirmation,
                total_passengers: passengerCount,
                total_rooms: roomAssignments.length,
                occupancy_rate: calculateOccupancyRate(passengerCount, roomAssignments.length),
                room_assignments: roomAssignments
            });
        });

        // Helper functions
        function getRoomType(passengerCount) {
            switch(passengerCount) {
                case 1: return 'Single';
                case 2: return 'Double';
                case 3: return 'Triple';
                default: return 'Standard';
            }
        }
        
        function calculateOccupancyRate(passengers, rooms) {
            if (rooms === 0) return '0%';
            const maxCapacity = rooms * 3;
            const percentage = (passengers / maxCapacity) * 100;
            return `${percentage.toFixed(1)}%`;
        }

        // Calculate statistics
        const occupancyRate = totalRooms > 0 
            ? `${((totalPassengers / (totalRooms * 3)) * 100).toFixed(1)}%` 
            : '0%';

        res.json({
            success: true,
            data: result,
            statistics: {
                total_groups: result.length,
                total_rooms: totalRooms,
                total_passengers: totalPassengers,
                occupancy_rate: occupancyRate,
                room_type_distribution: roomTypeCounts,
                efficiency_score: totalRooms > 0 
                    ? Math.round((totalPassengers / (totalRooms * 3)) * 100)
                    : 0,
                average_passengers_per_room: totalRooms > 0 
                    ? (totalPassengers / totalRooms).toFixed(2)
                    : 0
            }
        });
        
    } catch (error) {
        console.error('Error in getGroupedHotelAssignments:', error);
        if (connection) connection.release();
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error'
        });
    }
},

// Helper function to create assignment from passenger object

};

module.exports = hotelController;