const express = require('express');
const router = express.Router();
const standbyService = require('../services/standbyService');

// POST /standby/:id/claim — token claim is atomic inside a transaction.
router.post('/:id/claim', async (req, res) => {
  try {
    const claimed = await standbyService.claim(req.params.id);
    if (!claimed) return res.status(409).json({ error: 'This standby place is no longer available' });
    res.json(claimed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim standby place' });
  }
});

module.exports = router;
