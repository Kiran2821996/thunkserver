const mongoose = require('mongoose');

const searchSchema = new mongoose.Schema({
  userId: String,
  query: String
});

module.exports = mongoose.model('Search', searchSchema);


