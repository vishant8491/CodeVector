// scripts/seed.js
//
// Generates 200,000 products and inserts them in BATCHES, not one at a time.
//
// WHY BATCHES MATTER:
// Inserting one document at a time means 200,000 separate round-trips to the
// database — each one has network + write overhead. That's painfully slow
// (can take 10+ minutes, sometimes much worse).
//
// insertMany() sends a batch of documents in ONE round-trip. We chunk into
// batches of 5,000 so we don't try to send all 200,000 in a single giant
// request (which can hit memory/payload limits). This finishes in seconds,
// not minutes.

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const TOTAL_PRODUCTS = 200000;
const BATCH_SIZE = 5000;

const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Home & Kitchen',
  'Books',
  'Sports',
  'Toys',
  'Beauty',
  'Automotive',
  'Groceries',
  'Furniture',
];

const PRODUCT_NAME_PARTS = [
  'Pro', 'Max', 'Lite', 'Plus', 'Mini', 'Ultra', 'Classic', 'Premium',
  'Essential', 'Standard', 'Deluxe', 'Compact', 'Advanced', 'Basic',
];

const PRODUCT_NOUNS = [
  'Widget', 'Gadget', 'Tool', 'Device', 'Kit', 'Set', 'Pack', 'Bundle',
  'Item', 'Accessory', 'Unit', 'Component',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProduct(index) {
  // Spread createdAt over the last 180 days so "newest first" sorting
  // and category filtering both have realistic, varied data to work with.
  const daysAgo = Math.random() * 180;
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  return {
    name: `${randomFrom(PRODUCT_NAME_PARTS)} ${randomFrom(PRODUCT_NOUNS)} ${index}`,
    category: randomFrom(CATEGORIES),
    price: Math.round((Math.random() * 9990 + 10) * 100) / 100, // 10.00 to 9999.99
    createdAt,
    updatedAt: createdAt,
  };
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const existingCount = await Product.countDocuments();
  if (existingCount > 0) {
    console.log(`Collection already has ${existingCount} products. Dropping first...`);
    await Product.deleteMany({});
  }

  console.log(`Generating and inserting ${TOTAL_PRODUCTS} products in batches of ${BATCH_SIZE}...`);

  const startTime = Date.now();
  let inserted = 0;

  for (let i = 0; i < TOTAL_PRODUCTS; i += BATCH_SIZE) {
    const batch = [];
    const batchEnd = Math.min(i + BATCH_SIZE, TOTAL_PRODUCTS);

    for (let j = i; j < batchEnd; j++) {
      batch.push(generateProduct(j));
    }

    await Product.insertMany(batch, { ordered: false });
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${TOTAL_PRODUCTS}...`);
  }

  const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone. Inserted ${inserted} products in ${seconds}s.`);

  // Mongoose creates indexes defined in the schema automatically on connect,
  // but on a large collection like this one, index builds can take a moment
  // to finish in the background. We explicitly wait for them here so the
  // seed script doesn't exit while the text index is still building —
  // search would otherwise silently fail to use the index for a bit.
  console.log('Ensuring indexes are built (this can take a moment on 200k docs)...');
  await Product.ensureIndexes();
  console.log('Indexes ready.');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
