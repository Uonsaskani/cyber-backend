const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.userId);

  if (!sub) {
    return res.json({ active: false, expiresAt: null });
  }

  const now = new Date();
  const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
  const isActive = sub.status === 'active' && expiresAt && expiresAt > now;

  if (sub.status === 'active' && expiresAt && expiresAt <= now) {
    db.prepare('UPDATE subscriptions SET status = ? WHERE user_id = ?').run('expired', req.userId);
  }

  res.json({
    active: Boolean(isActive),
    expiresAt: sub.expires_at,
  });
});

module.exports = router;
