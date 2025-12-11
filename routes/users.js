const express = require('express');
const router = express.Router();
const storage = require('../lib/storage');

// Register or update a user: { clientId, username }
router.post('/register', async (req, res) => {
  try {
    const { clientId, username } = req.body || {};
    if (!clientId || !username) return res.status(400).json({ error: 'clientId and username required' });
    await storage.saveUser(clientId, username);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Error in /api/users/register', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const u = await storage.getUser(id);
    if (!u) return res.status(404).json({ error: 'not found' });
    return res.json(u);
  } catch (e) {
    console.error('Error in /api/users/:id', e);
    return res.status(500).json({ error: 'internal' });
  }
});

module.exports = router;
