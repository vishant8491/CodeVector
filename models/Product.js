const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

productSchema.index({ createdAt: -1, _id: -1 });

productSchema.index({ category: 1, createdAt: -1, _id: -1 });

productSchema.index({ name: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);
