// routes/products.js
//
// THE CORE IDEA: CURSOR-BASED PAGINATION (not skip/limit)
// =========================================================
//
// The naive way to paginate is:
//   Product.find().sort({createdAt: -1}).skip(page * 20).limit(20)
//
// This has two big problems at 200,000 records:
//
// PROBLEM A — IT GETS SLOWER THE DEEPER YOU PAGE.
// skip(10000) means MongoDB still has to walk through and discard the first
// 10,000 matching documents EVERY time, even though it doesn't return them.
// Page 1 is fast. Page 500 is noticeably slow. This is O(n) per page.
//
// PROBLEM B — IT BREAKS WHEN DATA CHANGES WHILE YOU'RE BROWSING.
// skip/limit pagination is based on POSITION (the 41st to 60th item right
// now). If someone inserts 50 new products while you're on page 3, every
// item shifts position. You either see the same product twice (it moved
// from page 4 to page 3) or skip one entirely (it moved from page 3 to
// page 4 and you never load page 4 again the same way). The assignment
// explicitly calls this out: "they must not see the same product twice or
// miss one."
//
// THE FIX — CURSOR-BASED PAGINATION.
// Instead of asking for "page N", the client says "give me the 20 items
// that come after THIS specific item" — where "this item" is identified by
// its actual sort values (createdAt + _id), not its position in a list.
//
// Since we sort newest-first by createdAt, the cursor query becomes:
//   "find createdAt < lastSeenCreatedAt
//    OR (createdAt == lastSeenCreatedAt AND _id < lastSeenId)"
//
// Why _id as a tiebreaker? Because many products can share the exact same
// createdAt timestamp (the assignment says it's fine for products to share
// column values). Without a tiebreaker, two products with the same
// createdAt could tie and get skipped or duplicated. _id is always unique,
// so it makes the sort order — and therefore the pagination — deterministic
// no matter how many timestamps collide.
//
// This means: no matter how much data gets added/updated elsewhere, your
// cursor always points to a fixed position in time, not a position in an
// ever-shifting list. New inserts above your cursor don't affect you. This
// is exactly what makes it correct under concurrent writes.

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const { category, cursor } = req.query;

    // Base filter: category is optional
    const filter = {};
    if (category) {
      filter.category = category;
    }

    // If a cursor was provided, add the "give me items after this point"
    // condition. The cursor is a base64-encoded JSON string containing the
    // last seen createdAt + _id, so it's a single opaque token for the
    // client to pass back — they don't need to know its internal shape.
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        filter.$or = [
          { createdAt: { $lt: decoded.createdAt } },
          {
            createdAt: decoded.createdAt,
            _id: { $lt: decoded.id },
          },
        ];
      }
    }

    // Fetch one extra document beyond the limit — this is how we know
    // whether there's a next page, without running a separate count query
    // (count queries on 200,000 docs are themselves expensive).
    const products = await Product.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = products.length > limit;
    const pageItems = hasMore ? products.slice(0, limit) : products;

    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.createdAt, lastItem._id)
      : null;

    res.json({
      products: pageItems,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Returns the distinct categories, so the frontend can build a filter dropdown.
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json(categories.sort());
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

function encodeCursor(createdAt, id) {
  const payload = JSON.stringify({ createdAt: new Date(createdAt).toISOString(), id: id.toString() });
  return Buffer.from(payload).toString('base64');
}

function decodeCursor(cursor) {
  try {
    const payload = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(payload);
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    return null;
  }
}

module.exports = router;
