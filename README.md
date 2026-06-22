# Product Browser — CodeVector Take-Home Task

A backend that lets someone browse ~200,000 products (newest first), filter by category, and paginate through them efficiently — even while data is being added/updated concurrently.

## What I built and why

### 1. Generating 200,000 products fast

`scripts/seed.js` generates and inserts 200,000 products in **batches of 5,000** using `insertMany()`, instead of inserting one document at a time in a loop.

Inserting one-by-one means 200,000 separate round-trips to the database — each with its own network + write overhead. That's painfully slow. Batch inserts send thousands of documents in a single round-trip, so the whole seed finishes in seconds instead of minutes.

### 2. Fast, correct pagination — the core problem

The naive way to paginate is `skip(page * limit).limit(limit)`. This has two problems at scale:

- **It gets slower the deeper you page.** `skip(10000)` forces MongoDB to walk through and discard the first 10,000 matching documents on every request, even though they're never returned. Page 1 is fast; page 500 is noticeably slower.
- **It breaks when data changes while someone is browsing.** skip/limit pagination is based on *position* in a list. If new products are inserted while someone is on page 3, every item shifts position — they can see the same product twice or miss one entirely. The task specifically calls this out.

**The fix: cursor-based pagination.** Instead of asking for "page N," the client asks for "the next 20 items after this specific point" — where that point is identified by the actual sort values (`createdAt` + `_id`), not by position.

- Sorting is `{ createdAt: -1, _id: -1 }` (newest first, `_id` as a tiebreaker).
- `_id` is needed as a tiebreaker because many products can share the same `createdAt` (the task allows shared column values) — without a unique tiebreaker, ties could cause skipped or duplicated results.
- The cursor itself is just `createdAt` + `_id` of the last item seen, base64-encoded into a single opaque token the client passes back.
- Because the cursor points to a fixed position *in the data*, not a position *in a list*, new inserts elsewhere don't shift anyone's pagination. This is what makes it correct under concurrent writes.

To know if there's a "next page" without running an expensive separate count query, I fetch `limit + 1` documents and check if the extra one exists.

### 3. Indexes

Two compound indexes back this:
- `{ createdAt: -1, _id: -1 }` — supports the default newest-first cursor pagination.
- `{ category: 1, createdAt: -1, _id: -1 }` — supports the same pagination *with* a category filter applied, so filtered queries are also indexed rather than falling back to a collection scan.

### 4. Bonus UI

A minimal HTML/JS page (`public/index.html`) to browse the data — category dropdown + "Next Page" button using the same cursor the API returns. Kept intentionally simple since the task says UI code isn't graded.

## How I used AI

I used Claude to help scaffold the boilerplate (Express setup, model definitions, route structure) and to think through the cursor-pagination approach. I directed the core design decisions myself — using `createdAt + _id` as a compound cursor instead of skip/limit, batching the seed script, and the dual-index strategy for filtered vs. unfiltered queries.

One thing I double-checked rather than trusting blindly: I verified that `_id` as a tiebreaker actually solves the duplicate/skip problem when timestamps collide, by reasoning through what happens when multiple documents share an identical `createdAt` — the sort needs a second deterministic field, or ties are unordered acrossed requests.

## What I'd improve with more time

- Add an index usage check (`explain()`) and include the output to actually prove the queries are using the index, not just assert it.
- Add basic rate limiting and input validation on the `limit` and `cursor` query params (currently capped at 100 and silently ignored if malformed, but no structured error response).
- Write a couple of integration tests for the pagination edge cases (empty result, last page, malformed cursor, ties on createdAt).
- Consider a numeric/sequence-based cursor instead of timestamp-based, to fully remove any reliance on Date precision.

## Setup

```bash
npm install
```

Create `.env` (copy from `.env.example`):
```
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
```

Seed the database:
```bash
node scripts/seed.js
```

Run the server:
```bash
node server.js
```

Visit `http://localhost:5000` for the browse UI, or hit the API directly:
```
GET /api/products?limit=20
GET /api/products?limit=20&cursor=<token>
GET /api/products?category=Electronics&limit=20
GET /api/products/categories
```

## Deployment

- **Database**: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) — free M0 cluster, no credit card required.
- **Backend**: [Render](https://render.com) — free web service tier.

Steps:
1. Push this repo to GitHub.
2. Create a free MongoDB Atlas cluster, allow access from `0.0.0.0/0`, get the connection string.
3. On Render: New → Web Service → connect repo → Build command `npm install` → Start command `node server.js`.
4. Add `MONGO_URI` as an environment variable in Render's dashboard.
5. After first deploy, run the seed script once (either locally pointing at the Atlas URI, or via a Render Shell) to populate the 200,000 products.
