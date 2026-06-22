const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

// ---------------------------------------------------------------------------
// WHY THESE INDEXES MATTER (important to explain in the interview):
//
// We sort "newest first" by createdAt, and paginate using createdAt + _id
// as a cursor (see routes/products.js for why _id is needed as a tiebreaker).
//
// Without an index, MongoDB has to scan and sort ALL 200,000 documents on
// every single request just to figure out what the "next 20" are. That's
// what makes naive pagination slow at scale.
//
// This compound index lets MongoDB jump straight to the right position in
// already-sorted order, instead of scanning the whole collection.
// ---------------------------------------------------------------------------
productSchema.index({ createdAt: -1, _id: -1 });

// Separate index to make the category filter fast too.
// Combined with createdAt so filtered+sorted queries also use an index.
productSchema.index({ category: 1, createdAt: -1, _id: -1 });

// ---------------------------------------------------------------------------
// SEARCH INDEX
//
// We need to search across `name` and `category`. A regex search like
// { name: /iphone/i } with no index forces MongoDB to scan every one of the
// 200,000 documents on every request — slow at this scale.
//
// A text index lets MongoDB use an inverted index (similar to how a search
// engine works) instead of scanning every document. It tokenizes the text
// fields into words, so it matches whole words/prefixes fast.
//
// Trade-off worth knowing for the interview: a text index does whole-word
// matching, not arbitrary substring matching. Searching "phone" will match
// "Phone Case" but won't match a partial fragment like "hon" the way a SQL
// LIKE '%hon%' would. For this assignment's scale and use case (browsing
// product names), that's the right trade-off — substring search on 200k
// docs without a specialized index (or a search engine like Atlas Search)
// would be slow regardless of approach.
productSchema.index({ name: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);
