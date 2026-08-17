// Seed script (not raw SQL) because several demo reviews need real
// embeddings from the local model to demonstrate semantic/cross-product
// similarity detection. Resets and repopulates the database so the admin
// dashboard demonstrates the fraud system immediately (spec sections 67-69).
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { embed, toVectorLiteral } = require('../services/embeddingService');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function reset(client) {
    await client.query(`
        TRUNCATE customer_risk_history, seller_risk_history, connection_signals,
                 review_signals, flagged_reviews, reviews, returns, order_items,
                 orders, products, sellers, customers, suspicious_phrases
        RESTART IDENTITY CASCADE
    `);
}

async function insertCustomer(client, { name, email, password, role = 'CUSTOMER', ageMs = 0, riskScore = 0 }) {
    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date(Date.now() - ageMs);
    const result = await client.query(
        `INSERT INTO customers (name, email, password_hash, role, created_at, risk_score)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, email, hash, role, createdAt, riskScore]
    );
    return result.rows[0];
}

async function insertSeller(client, name, ageMs = 90 * DAY) {
    const result = await client.query(
        `INSERT INTO sellers (name, created_at) VALUES ($1, $2) RETURNING *`,
        [name, new Date(Date.now() - ageMs)]
    );
    return result.rows[0];
}

async function insertProduct(client, sellerId, name, description, price) {
    const result = await client.query(
        `INSERT INTO products (seller_id, name, description, price) VALUES ($1, $2, $3, $4) RETURNING *`,
        [sellerId, name, description, price]
    );
    return result.rows[0];
}

async function insertOrder(client, customerId, status = 'DELIVERED', ageMs = 10 * DAY) {
    const result = await client.query(
        `INSERT INTO orders (customer_id, status, order_date) VALUES ($1, $2, $3) RETURNING *`,
        [customerId, status, new Date(Date.now() - ageMs)]
    );
    return result.rows[0];
}

async function insertOrderItem(client, orderId, productId, price, quantity = 1) {
    const result = await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4) RETURNING *`,
        [orderId, productId, quantity, price]
    );
    return result.rows[0];
}

async function insertReview(client, { customerId, productId, rating, text, verified, ageMs = DAY, visible = true, riskScore = 0 }) {
    const embedding = await embed(text);
    const result = await client.query(
        `INSERT INTO reviews (customer_id, product_id, rating, review_text, verified_purchase, visible, risk_score, embedding, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9) RETURNING *`,
        [customerId, productId, rating, text, verified, visible, riskScore, toVectorLiteral(embedding), new Date(Date.now() - ageMs)]
    );
    return result.rows[0];
}

async function flagReview(client, reviewId, riskScore, reason) {
    await client.query(
        `INSERT INTO flagged_reviews (review_id, risk_score, flag_reason) VALUES ($1, $2, $3)`,
        [reviewId, riskScore, reason]
    );
}

async function addSignal(client, reviewId, category, type, score, details) {
    await client.query(
        `INSERT INTO review_signals (review_id, category, signal_type, score, details) VALUES ($1, $2, $3, $4, $5)`,
        [reviewId, category, type, score, details]
    );
}

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Resetting database...');
        await reset(client);

        console.log('Seeding suspicious phrases...');
        const phrases = [
            ['buy now', 8], ['free sample', 10], ['cashback', 10], ['refund offered', 12],
            ['sponsored', 8], ['limited offer', 8], ['best product ever', 6],
        ];
        for (const [phrase, weight] of phrases) {
            await client.query('INSERT INTO suspicious_phrases (phrase, weight) VALUES ($1, $2)', [phrase, weight]);
        }

        console.log('Seeding admin + customers...');
        await insertCustomer(client, { name: 'Admin User', email: 'admin@fakereview.test', password: 'admin12345', role: 'ADMIN', ageMs: 365 * DAY });

        const oldGenuine1 = await insertCustomer(client, { name: 'Priya Sharma', email: 'priya@test.com', password: 'password123', ageMs: 400 * DAY });
        const oldGenuine2 = await insertCustomer(client, { name: 'Rahul Mehta', email: 'rahul@test.com', password: 'password123', ageMs: 200 * DAY });
        const oldGenuine3 = await insertCustomer(client, { name: 'Sara Khan', email: 'sara@test.com', password: 'password123', ageMs: 250 * DAY });
        const genuineGroup = [];
        for (let i = 1; i <= 6; i++) {
            genuineGroup.push(
                await insertCustomer(client, {
                    name: `Verified Buyer ${i}`,
                    email: `buyer${i}@test.com`,
                    password: 'password123',
                    ageMs: (60 + i * 10) * DAY,
                })
            );
        }
        const newAccountCustomer = await insertCustomer(client, { name: 'Newly Joined', email: 'newjoined@test.com', password: 'password123', ageMs: 2 * HOUR });
        const bomber = await insertCustomer(client, { name: 'Angry Anna', email: 'anna@test.com', password: 'password123', ageMs: 150 * DAY });
        const returnAbuser = await insertCustomer(client, { name: 'Refund Ravi', email: 'ravi@test.com', password: 'password123', ageMs: 90 * DAY });
        const templateAttacker = await insertCustomer(client, { name: 'Template Tom', email: 'tom@test.com', password: 'password123', ageMs: 1 * HOUR });
        const botAccount = await insertCustomer(client, { name: 'Bot Account', email: 'bot@test.com', password: 'password123', ageMs: 30 * 60 * 1000 });

        console.log('Seeding sellers...');
        const goodSeller = await insertSeller(client, 'Reliable Retail Co.');
        const shadySeller = await insertSeller(client, 'QuickDeals Direct');

        console.log('Seeding products...');
        const earbuds = await insertProduct(client, goodSeller.seller_id, 'Wireless Earbuds Pro', 'Noise-cancelling wireless earbuds with 24h battery life.', 49.99);
        const phoneCase = await insertProduct(client, goodSeller.seller_id, 'Slim Phone Case', 'Shockproof slim-fit phone case.', 14.99);
        const powerBank = await insertProduct(client, shadySeller.seller_id, 'Fast-Charge Power Bank', '20000mAh power bank with fast charging.', 34.99);
        const smartWatch = await insertProduct(client, shadySeller.seller_id, 'Smart Fitness Watch', 'Tracks steps, heart rate, and sleep.', 59.99);
        const blender = await insertProduct(client, shadySeller.seller_id, 'Compact Blender', 'Personal blender for smoothies.', 24.99);

        // --- Scenario 1: genuine verified reviews (old accounts, delivered orders) ---
        console.log('Scenario 1: genuine verified reviews...');
        for (const [customer, product, rating, text] of [
            [oldGenuine1, earbuds, 5, 'Excellent sound quality and the battery really does last all day. Comfortable fit too.'],
            [oldGenuine2, phoneCase, 4, 'Good protection for the price, though the color is slightly different from the photos.'],
            [oldGenuine3, earbuds, 5, 'Very happy with these earbuds, connects quickly and the case is compact.'],
        ]) {
            const order = await insertOrder(client, customer.customer_id);
            await insertOrderItem(client, order.order_id, product.product_id, product.price);
            const review = await insertReview(client, {
                customerId: customer.customer_id, productId: product.product_id, rating, text,
                verified: true, riskScore: 0,
            });
            await addSignal(client, review.review_id, 'PURCHASE', 'VERIFIED_PURCHASE', -20, 'Delivered, non-returned order confirmed');
        }

        // --- Scenario 9 (false positive demo): genuine group with naturally similar complaint ---
        console.log('False-positive scenario: genuine similar complaints, same product...');
        const complaintVariants = [
            'Battery stopped working after two days.',
            'Battery stopped working after only two days of use.',
            'My battery died after two days, quite disappointing.',
            'After two days the battery completely stopped working.',
            'Battery lasted just two days before it stopped working entirely.',
            'Two days in and the battery already stopped working.',
        ];
        for (let i = 0; i < genuineGroup.length; i++) {
            const customer = genuineGroup[i];
            const order = await insertOrder(client, customer.customer_id, 'DELIVERED', (20 + i) * DAY);
            await insertOrderItem(client, order.order_id, powerBank.product_id, powerBank.price);
            const review = await insertReview(client, {
                customerId: customer.customer_id, productId: powerBank.product_id, rating: 2,
                text: complaintVariants[i], verified: true, ageMs: (15 + i) * DAY, riskScore: 0,
            });
            await addSignal(client, review.review_id, 'PURCHASE', 'VERIFIED_PURCHASE', -20, 'Delivered, non-returned order confirmed');
            await addSignal(client, review.review_id, 'TEXT', 'SEMANTIC_DUPLICATE', 5, 'Weak same-product similarity signal, offset by verified purchase + established account');
        }

        // --- Scenario 2: new account review ---
        console.log('Scenario 2: new account, not automatically flagged...');
        const newAcctReview = await insertReview(client, {
            customerId: newAccountCustomer.customer_id, productId: smartWatch.product_id, rating: 4,
            text: 'Works well so far, tracks my steps accurately. Will update after more use.',
            verified: false, riskScore: 15,
        });
        await addSignal(client, newAcctReview.review_id, 'ACCOUNT', 'NEW_ACCOUNT', 15, 'Account is less than 24 hours old');

        // --- Scenario 3: exact duplicate (flagged) ---
        console.log('Scenario 3: exact duplicate review, flagged...');
        const dupSource = await insertReview(client, {
            customerId: oldGenuine1.customer_id, productId: smartWatch.product_id, rating: 5,
            text: 'Amazing watch, tracks everything perfectly and battery lasts a week!',
            verified: false, ageMs: 5 * DAY,
        });
        const dupCustomer = await insertCustomer(client, { name: 'Copycat Cathy', email: 'cathy@test.com', password: 'password123', ageMs: 3 * HOUR });
        const dupReview = await insertReview(client, {
            customerId: dupCustomer.customer_id, productId: smartWatch.product_id, rating: 5,
            text: 'Amazing watch, tracks everything perfectly and battery lasts a week!',
            verified: false, visible: false, riskScore: 65,
        });
        await addSignal(client, dupReview.review_id, 'ACCOUNT', 'NEW_ACCOUNT', 15, 'Account is less than 24 hours old');
        await addSignal(client, dupReview.review_id, 'TEXT', 'EXACT_DUPLICATE', 25, 'Exact normalized duplicate of an existing review');
        await flagReview(client, dupReview.review_id, 65, 'NEW_ACCOUNT, EXACT_DUPLICATE');

        // --- Scenario 4: cross-product template attack ---
        console.log('Scenario 4: cross-product templated review attack...');
        const templateText = 'Absolutely amazing product and excellent performance, highly recommend to everyone!';
        const targets = [powerBank, smartWatch, blender];
        for (let i = 0; i < targets.length; i++) {
            const account = i === 0 ? templateAttacker : await insertCustomer(client, {
                name: `Template Bot ${i}`, email: `templatebot${i}@test.com`, password: 'password123', ageMs: (i + 1) * HOUR,
            });
            const review = await insertReview(client, {
                customerId: account.customer_id, productId: targets[i].product_id, rating: 5,
                text: templateText, verified: false, visible: i > 0 ? false : true, riskScore: i > 0 ? 70 : 40,
                ageMs: (3 - i) * 60 * 1000,
            });
            await addSignal(client, review.review_id, 'ACCOUNT', 'NEW_ACCOUNT', 15, 'Account is less than 24 hours old');
            if (i > 0) {
                await addSignal(client, review.review_id, 'TEXT', 'CROSS_PRODUCT_SEMANTIC_MATCH', 25, 'Highly similar text found on unrelated products');
                await flagReview(client, review.review_id, 70, 'NEW_ACCOUNT, CROSS_PRODUCT_SEMANTIC_MATCH');
            } else {
                await addSignal(client, review.review_id, 'TEXT', 'PROMOTIONAL_LANGUAGE', 8, 'Generic promotional phrasing');
            }
        }

        // --- Scenario 5: review then return ---
        console.log('Scenario 5: purchase -> review -> return...');
        const returnOrder = await insertOrder(client, returnAbuser.customer_id, 'DELIVERED', 20 * DAY);
        const returnItem = await insertOrderItem(client, returnOrder.order_id, blender.product_id, blender.price);
        const returnReview = await insertReview(client, {
            customerId: returnAbuser.customer_id, productId: blender.product_id, rating: 5,
            text: 'Works great for smoothies, easy to clean and powerful motor.',
            verified: true, ageMs: 15 * DAY, riskScore: 0,
        });
        await addSignal(client, returnReview.review_id, 'PURCHASE', 'VERIFIED_PURCHASE', -20, 'Delivered, non-returned order confirmed at review time');
        await client.query(
            `INSERT INTO returns (order_item_id, returned_at, reason, status) VALUES ($1, $2, $3, 'APPROVED')`,
            [returnItem.order_item_id, new Date(Date.now() - 5 * DAY), 'Motor stopped working after a week']
        );

        // --- Scenario 6: review bombing (extreme rating bias) ---
        console.log('Scenario 6: review bombing / extreme rating bias...');
        const bombProducts = [earbuds, phoneCase, powerBank, smartWatch, blender];
        for (let i = 0; i < bombProducts.length; i++) {
            const product = bombProducts[i];
            await insertReview(client, {
                customerId: bomber.customer_id, productId: product.product_id, rating: i === bombProducts.length - 1 ? 5 : 1,
                text: `Terrible experience, product ${i} broke almost immediately. Would not recommend.`,
                verified: false, ageMs: (i + 1) * DAY, riskScore: 10,
            });
        }

        // --- Scenario 7: seller attack (high fraud index) ---
        console.log('Scenario 7: seller-level fraud (many flagged reviews on shady seller)...');
        for (let i = 0; i < 5; i++) {
            const account = await insertCustomer(client, {
                name: `Fraud Ring ${i}`, email: `fraudring${i}@test.com`, password: 'password123', ageMs: (i + 1) * HOUR,
            });
            const product = [powerBank, smartWatch, blender][i % 3];
            const review = await insertReview(client, {
                customerId: account.customer_id, productId: product.product_id, rating: 5,
                text: `Best product ever, buy now while there is a limited offer, cashback included!`,
                verified: false, visible: false, riskScore: 75, ageMs: (5 - i) * 60 * 1000,
            });
            await addSignal(client, review.review_id, 'ACCOUNT', 'NEW_ACCOUNT', 15, 'Account is less than 24 hours old');
            await addSignal(client, review.review_id, 'TEXT', 'PROMOTIONAL_LANGUAGE', 10, 'Contains promotional phrase(s): best product ever, buy now, limited offer, cashback');
            await addSignal(client, review.review_id, 'SELLER', 'REVIEW_BURST', 15, 'Multiple reviews posted for this seller\'s products in a short window');
            await flagReview(client, review.review_id, 75, 'NEW_ACCOUNT, PROMOTIONAL_LANGUAGE, REVIEW_BURST');
        }

        // --- Scenario 8: bot (honeypot + connection anomalies) ---
        console.log('Scenario 8: bot submission (honeypot + suspicious connection)...');
        const botReview = await insertReview(client, {
            customerId: botAccount.customer_id, productId: earbuds.product_id, rating: 5,
            text: 'GREAT PRODUCT!!!! BUY NOW!!!! BEST DEAL EVER!!!!',
            verified: false, visible: false, riskScore: 95, ageMs: 60 * 1000,
        });
        await addSignal(client, botReview.review_id, 'ACCOUNT', 'NEW_ACCOUNT', 15, 'Account is less than 24 hours old');
        await addSignal(client, botReview.review_id, 'CONNECTION', 'HONEYPOT_TRIGGERED', 30, 'Hidden anti-bot field was submitted with a value');
        await addSignal(client, botReview.review_id, 'CONNECTION', 'PROXY', 15, 'Connection appears to route through a proxy/datacenter');
        await addSignal(client, botReview.review_id, 'TEXT', 'EXCESSIVE_CAPITALIZATION', 5, '85% of letters are uppercase');
        await addSignal(client, botReview.review_id, 'TEXT', 'EXCESSIVE_PUNCTUATION', 5, 'Repeated exclamation marks');
        await addSignal(client, botReview.review_id, 'TEXT', 'PROMOTIONAL_LANGUAGE', 8, 'Contains promotional phrase(s): buy now');
        await client.query(
            `INSERT INTO connection_signals (customer_id, review_id, ip_hash, isp, country, is_proxy, is_vpn, is_tor, risk_score, user_agent, header_anomaly_score, honeypot_triggered)
             VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, FALSE, $6, $7, $8, TRUE)`,
            [botAccount.customer_id, botReview.review_id, 'seed-mock-hash-bot', 'Cloud/Datacenter Hosting', 'US', 45, 'python-requests/2.31', 10]
        );
        await flagReview(client, botReview.review_id, 95, 'NEW_ACCOUNT, HONEYPOT_TRIGGERED, PROXY, EXCESSIVE_CAPITALIZATION, EXCESSIVE_PUNCTUATION, PROMOTIONAL_LANGUAGE');

        console.log('Recomputing customer + seller risk scores...');
        await client.query(`
            UPDATE customers c SET risk_score = LEAST(100, COALESCE((
                SELECT ROUND(AVG(r.risk_score)) FROM reviews r WHERE r.customer_id = c.customer_id
            ), 0))
        `);
        await client.query(`
            UPDATE sellers s SET risk_score = LEAST(100, COALESCE((
                SELECT ROUND(COUNT(fr.review_id)::NUMERIC / NULLIF(COUNT(r.review_id), 0) * 100)
                FROM products p LEFT JOIN reviews r ON r.product_id = p.product_id
                LEFT JOIN flagged_reviews fr ON fr.review_id = r.review_id
                WHERE p.seller_id = s.seller_id
            ), 0))
        `);

        console.log('Seed complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
