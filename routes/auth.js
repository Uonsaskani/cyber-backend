const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  const { fullName, phone, password } = req.body || {};

  if (!phone || !password || password.length < 6) {
    return res.status(400).json({ error: 'شماره موبایل و رمز عبور (حداقل ۶ کاراکتر) الزامی است.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(409).json({ error: 'این شماره موبایل قبلاً ثبت‌نام کرده است.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (full_name, phone, password_hash) VALUES (?, ?, ?)')
    .run(fullName || null, phone, passwordHash);

  db.prepare('INSERT INTO subscriptions (user_id, status) VALUES (?, ?)').run(info.lastInsertRowid, 'inactive');

  const token = signToken(info.lastInsertRowid);
  res.status(201).json({ token, user: { id: info.lastInsertRowid, fullName, phone } });
});

router.post('/login', async (req, res) => {
  const { phone, password } = req.body || {};

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    return res.status(401).json({ error: 'شماره موبایل یا رمز عبور اشتباه است.' });
  }

  const match = await bcrypt.compare(password || '', user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'شماره موبایل یا رمز عبور اشتباه است.' });
  }

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, fullName: user.full_name, phone: user.phone } });
});

module.exports = router;
