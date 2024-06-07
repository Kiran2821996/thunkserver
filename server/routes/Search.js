const express = require('express');
const router = express.Router();
const Search = require('../models/Search');

router.get('/', async (req, res) => {
  const { userId, query } = req.query;

  const search = new Search({ userId, query });
  await search.save();

  // Fetch all stored queries from the database
  const allQueries = await Search.find({ userId: { $ne: userId } }, '_id userId query');

  // Extract just the query strings from the documents
  const results = allQueries.map(doc => ({
    id: doc._id,
    userId: doc.userId,
    query: doc.query
  }));

  res.send(results);
});

router.delete('/:userId/:query', async (req, res) => {
  try {
    const { userId, query } = req.params;

    // Delete data associated with the provided user ID and query
    await Search.deleteOne({ userId, query });

    // Fetch all stored queries from the database after deletion
    const allQueries = await Search.find({ userId: { $ne: userId } }, '_id userId query');

    // Extract just the query strings from the documents
    const results = allQueries.map(doc => ({
      id: doc._id,
      userId: doc.userId,
      query: doc.query
    }));

    res.status(200).json({ message: 'Data deleted successfully', results });
  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
