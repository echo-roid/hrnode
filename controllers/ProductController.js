const db = require('../config/db');

// Helper function for getting connection
const getConnection = async () => {
    return await db.getConnection();
};

// Helper function for releasing connection
const releaseConnection = (connection) => {
    if (connection) {
        connection.release();
    }
};

// Create new product
// Create new product
// exports.createProduct = async (req, res) => {
//     let connection;
//     try {
//         const { lead_id, product_name, category, sub_category, quantity, buy_cost, sell_cost } = req.body;

//         // Basic validation
//         if (!product_name || !category || quantity === undefined || !buy_cost || !sell_cost) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Missing required fields'
//             });
//         }

//         if (parseFloat(sell_cost) <= parseFloat(buy_cost)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Sell cost must be greater than buy cost'
//             });
//         }

//         connection = await getConnection();

//         const sql = `
//             INSERT INTO products 
//             (lead_id, product_name, category, sub_category, quantity, buy_cost, sell_cost) 
//             VALUES (?, ?, ?, ?, ?, ?, ?)
//         `;

//         const values = [
//             lead_id || null,
//             product_name,
//             category,
//             sub_category || null,
//             parseInt(quantity),
//             parseFloat(buy_cost),
//             parseFloat(sell_cost)
//         ];

//         const [result] = await connection.execute(sql, values);

//         // Get the created product
//         const [product] = await connection.execute(
//             'SELECT * FROM products WHERE id = ?',
//             [result.insertId]
//         );

//         res.status(201).json({
//             success: true,
//             message: 'Product created successfully',
//             data: product[0]
//         });

//     } catch (error) {
//         console.error('Create product error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error creating product',
//             error: error.message
//         });
//     } finally {
//         releaseConnection(connection);
//     }
// };


// Create new product
exports.createProduct = async (req, res) => {
    let connection;
    try {
        const { lead_id, product_name, category, sub_category, quantity, buy_cost, sell_cost } = req.body;

        // Basic validation
        if (!product_name || !category || quantity === undefined || !buy_cost || !sell_cost) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (parseFloat(sell_cost) <= parseFloat(buy_cost)) {
            return res.status(400).json({
                success: false,
                message: 'Sell cost must be greater than buy cost'
            });
        }

        connection = await getConnection();

        const sql = `
            INSERT INTO products 
            (lead_id, product_name, category, sub_category, quantity, buy_cost, sell_cost) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            lead_id || null,
            product_name,
            category,
            sub_category || null,
            parseInt(quantity),
            parseFloat(buy_cost),
            parseFloat(sell_cost)
        ];

        const [result] = await connection.execute(sql, values);

        // Get the created product
        const [product] = await connection.execute(
            'SELECT * FROM products WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product[0]
        });

    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating product',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};


// Get all products with pagination, filtering, and sorting
exports.getAllProducts = async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        // Get query parameters
        const {
            page = 1,
            limit = 10,
            search = '',
            category = '',
            minPrice = '',
            maxPrice = '',
            minQuantity = '',
            maxQuantity = '',
            lead_id = '',
            sortBy = 'created_at',
            sortOrder = 'DESC'
        } = req.query;

        // Calculate offset for pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clause
        let whereClauses = [];
        let queryParams = [];

        // Search by product name, category, or sub_category
        if (search) {
            whereClauses.push('(product_name LIKE ? OR category LIKE ? OR sub_category LIKE ?)');
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        // Filter by category
        if (category) {
            whereClauses.push('category = ?');
            queryParams.push(category);
        }

        // Filter by lead_id
        if (lead_id) {
            whereClauses.push('lead_id = ?');
            queryParams.push(lead_id);
        }

        // Filter by price range
        if (minPrice) {
            whereClauses.push('sell_cost >= ?');
            queryParams.push(parseFloat(minPrice));
        }
        if (maxPrice) {
            whereClauses.push('sell_cost <= ?');
            queryParams.push(parseFloat(maxPrice));
        }

        // Filter by quantity range
        if (minQuantity) {
            whereClauses.push('quantity >= ?');
            queryParams.push(parseInt(minQuantity));
        }
        if (maxQuantity) {
            whereClauses.push('quantity <= ?');
            queryParams.push(parseInt(maxQuantity));
        }

        // Combine WHERE clauses
        const whereClause = whereClauses.length > 0 
            ? `WHERE ${whereClauses.join(' AND ')}`
            : '';

        // Validate sortBy to prevent SQL injection
        const allowedSortColumns = [
            'id', 'product_name', 'category', 'sub_category', 
            'quantity', 'buy_cost', 'sell_cost', 'created_at', 'updated_at'
        ];
        const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
        
        // Validate sortOrder
        const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Base query for counting total records
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM products 
            ${whereClause}
        `;

        // Main query for fetching data with sorting and pagination
        const mainQuery = `
            SELECT 
                id,
                lead_id,
                product_name,
                category,
                sub_category,
                quantity,
                buy_cost,
                sell_cost,
                images,
                created_at,
                updated_at,
                (sell_cost - buy_cost) as profit,
                ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) as profit_percentage,
                (sell_cost * quantity) as total_value
            FROM products 
            ${whereClause}
            ORDER BY ${sortColumn} ${orderDirection}
            LIMIT ? OFFSET ?
        `;

        // Add pagination parameters to query params
        const mainQueryParams = [...queryParams, parseInt(limit), offset];

        // Execute queries
        const [countResult] = await connection.execute(countQuery, queryParams);
        const [products] = await connection.execute(mainQuery, mainQueryParams);

        // Calculate pagination metadata
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / parseInt(limit));

        // Get unique categories for filters
        const [categories] = await connection.execute(
            'SELECT DISTINCT category FROM products ORDER BY category'
        );

        // Calculate summary statistics
        const [stats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_products,
                SUM(quantity) as total_quantity,
                SUM(buy_cost * quantity) as total_investment,
                SUM(sell_cost * quantity) as total_value,
                AVG(sell_cost - buy_cost) as avg_profit,
                MIN(sell_cost) as min_price,
                MAX(sell_cost) as max_price
            FROM products
            ${whereClause}
        `, queryParams);

        res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            data: {
                products,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalItems: total,
                    itemsPerPage: parseInt(limit),
                    hasNextPage: parseInt(page) < totalPages,
                    hasPreviousPage: parseInt(page) > 1
                },
                filters: {
                    categories: categories.map(c => c.category),
                    priceRange: {
                        min: stats[0].min_price || 0,
                        max: stats[0].max_price || 0
                    }
                },
                summary: {
                    totalProducts: stats[0].total_products || 0,
                    totalQuantity: stats[0].total_quantity || 0,
                    totalInvestment: parseFloat(stats[0].total_investment || 0).toFixed(2),
                    totalValue: parseFloat(stats[0].total_value || 0).toFixed(2),
                    averageProfit: parseFloat(stats[0].avg_profit || 0).toFixed(2)
                }
            }
        });

    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};

// Get product by ID
exports.getProductById = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        connection = await getConnection();

        const [product] = await connection.execute(
            `SELECT 
                id,
                lead_id,
                product_name,
                category,
                sub_category,
                quantity,
                buy_cost,
                sell_cost,
                images,
                created_at,
                updated_at,
                (sell_cost - buy_cost) as profit,
                ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) as profit_percentage,
                (sell_cost * quantity) as total_value
            FROM products WHERE id = ?`,
            [id]
        );

        if (product.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Get related products (same category)
        const [relatedProducts] = await connection.execute(
            `SELECT id, product_name, category, sell_cost, quantity 
             FROM products 
             WHERE category = ? AND id != ? 
             LIMIT 5`,
            [product[0].category, id]
        );

        res.status(200).json({
            success: true,
            message: 'Product fetched successfully',
            data: {
                ...product[0],
                relatedProducts
            }
        });

    } catch (error) {
        console.error('Get product by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching product',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};

// Get product statistics
exports.getProductStatistics = async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        // Get category-wise statistics
        const [categoryStats] = await connection.execute(`
            SELECT 
                category,
                COUNT(*) as product_count,
                SUM(quantity) as total_quantity,
                AVG(sell_cost - buy_cost) as avg_profit,
                SUM((sell_cost - buy_cost) * quantity) as total_profit
            FROM products
            GROUP BY category
            ORDER BY total_profit DESC
        `);

        // Get low stock products (quantity < 10)
        const [lowStockProducts] = await connection.execute(`
            SELECT id, product_name, quantity, sell_cost
            FROM products
            WHERE quantity < 10
            ORDER BY quantity ASC
            LIMIT 10
        `);

        // Get high profit products (profit margin > 30%)
        const [highProfitProducts] = await connection.execute(`
            SELECT id, product_name, buy_cost, sell_cost,
                   (sell_cost - buy_cost) as profit,
                   ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) as profit_percentage
            FROM products
            WHERE ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) > 30
            ORDER BY profit_percentage DESC
            LIMIT 10
        `);

        // Get monthly sales trend (last 6 months)
        const [monthlyTrend] = await connection.execute(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as product_count,
                SUM(quantity) as total_quantity,
                SUM(sell_cost * quantity) as total_value
            FROM products
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
        `);

        res.status(200).json({
            success: true,
            message: 'Product statistics fetched successfully',
            data: {
                categoryStats,
                lowStockProducts,
                highProfitProducts,
                monthlyTrend,
                summary: {
                    totalCategories: categoryStats.length,
                    lowStockCount: lowStockProducts.length,
                    highProfitCount: highProfitProducts.length
                }
            }
        });

    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};

// Update product
exports.updateProduct = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { 
            product_name, 
            category, 
            sub_category, 
            quantity, 
            buy_cost, 
            sell_cost, 
            lead_id 
        } = req.body;

        connection = await getConnection();

        // Check if product exists
        const [existingProduct] = await connection.execute(
            'SELECT * FROM products WHERE id = ?',
            [id]
        );

        if (existingProduct.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Validate sell cost > buy cost
        if (sell_cost && buy_cost && parseFloat(sell_cost) <= parseFloat(buy_cost)) {
            return res.status(400).json({
                success: false,
                message: 'Sell cost must be greater than buy cost'
            });
        }

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];

        if (product_name) {
            updateFields.push('product_name = ?');
            updateValues.push(product_name);
        }
        if (category) {
            updateFields.push('category = ?');
            updateValues.push(category);
        }
        if (sub_category !== undefined) {
            updateFields.push('sub_category = ?');
            updateValues.push(sub_category);
        }
        if (quantity !== undefined) {
            updateFields.push('quantity = ?');
            updateValues.push(parseInt(quantity));
        }
        if (buy_cost !== undefined) {
            updateFields.push('buy_cost = ?');
            updateValues.push(parseFloat(buy_cost));
        }
        if (sell_cost !== undefined) {
            updateFields.push('sell_cost = ?');
            updateValues.push(parseFloat(sell_cost));
        }
        if (lead_id !== undefined) {
            updateFields.push('lead_id = ?');
            updateValues.push(lead_id);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        // Add updated_at timestamp
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        
        // Add id to values array
        updateValues.push(id);

        const updateQuery = `
            UPDATE products 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;

        await connection.execute(updateQuery, updateValues);

        // Get updated product
        const [updatedProduct] = await connection.execute(
            `SELECT 
                id,
                lead_id,
                product_name,
                category,
                sub_category,
                quantity,
                buy_cost,
                sell_cost,
                images,
                created_at,
                updated_at,
                (sell_cost - buy_cost) as profit,
                ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) as profit_percentage
            FROM products WHERE id = ?`,
            [id]
        );

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct[0]
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating product',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        connection = await getConnection();

        // Check if product exists
        const [product] = await connection.execute(
            'SELECT * FROM products WHERE id = ?',
            [id]
        );

        if (product.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Delete product
        await connection.execute(
            'DELETE FROM products WHERE id = ?',
            [id]
        );

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully',
            data: {
                deletedId: id,
                productName: product[0].product_name
            }
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting product',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};

// Export products to CSV
exports.exportProducts = async (req, res) => {
    let connection;
    try {
        connection = await getConnection();

        const [products] = await connection.execute(`
            SELECT 
                id,
                lead_id,
                product_name,
                category,
                sub_category,
                quantity,
                buy_cost,
                sell_cost,
                (sell_cost - buy_cost) as profit,
                ROUND(((sell_cost - buy_cost) / buy_cost * 100), 2) as profit_percentage,
                (sell_cost * quantity) as total_value,
                DATE(created_at) as created_date
            FROM products
            ORDER BY created_at DESC
        `);

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No products to export'
            });
        }

        // Create CSV content
        const headers = [
            'ID', 'Lead ID', 'Product Name', 'Category', 'Sub Category',
            'Quantity', 'Buy Cost', 'Sell Cost', 'Profit', 'Profit %',
            'Total Value', 'Created Date'
        ];

        const csvRows = products.map(product => [
            product.id,
            product.lead_id || '',
            `"${product.product_name.replace(/"/g, '""')}"`,
            product.category,
            product.sub_category || '',
            product.quantity,
            product.buy_cost,
            product.sell_cost,
            product.profit,
            product.profit_percentage,
            product.total_value,
            product.created_date
        ].join(','));

        const csvContent = [
            headers.join(','),
            ...csvRows
        ].join('\n');

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=products_export.csv');
        
        res.status(200).send(csvContent);

    } catch (error) {
        console.error('Export products error:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting products',
            error: error.message
        });
    } finally {
        releaseConnection(connection);
    }
};