const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const { category, cursor, search } = req.query;

    // Base filter: category is optional
    const filter = {};
    if (category) {
      filter.category = category;
    }

    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

  
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cursorCondition = {
          $or: [
            { createdAt: { $lt: decoded.createdAt } },
            {
              createdAt: decoded.createdAt,
              _id: { $lt: decoded.id },
            },
          ],
        };

        if (filter.$text) {
          filter.$and = [{ $text: filter.$text }, cursorCondition];
          delete filter.$text;
        } else {
          Object.assign(filter, cursorCondition);
        }
      }
    }

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
