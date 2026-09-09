const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createInvoice, getInvoiceStatus } = require('../payment/gateway');

const router = express.Router();

// قیمت اشتراک در .env به ریال است (بلوپال ریال می‌خواهد، نه تومان).
const PRICE_RIAL = Number(process.env.SUBSCRIPTION_PRICE_RIAL || 5000000); // پیش‌فرض: ۵۰۰ هزار تومان
const DURATION_DAYS = Number(process.env.SUBSCRIPTION_DAYS || 30);

router.post('/request', requireAuth, async (req, res) => {
  try {
    const invoice = await createInvoice(PRICE_RIAL);

    db.prepare(
      `INSERT INTO payments (user_id, amount, final_amount, invoice_id, card_number, payment_link, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`
    ).run(req.userId, PRICE_RIAL, invoice.finalAmount, invoice.invoiceId, invoice.cardNumber, invoice.paymentLink);

    res.json({
      invoiceId: invoice.invoiceId,
      cardNumber: invoice.cardNumber,
      finalAmount: invoice.finalAmount,
      paymentLink: invoice.paymentLink,
    });
  } catch (err) {
    console.error('payment/request error:', err);
    res.status(500).json({ error: 'خطا در ساخت فاکتور پرداخت. لطفاً دوباره تلاش کنید.' });
  }
});

router.post('/webhook', async (req, res) => {
  const payload = req.body || {};

  if (!payload.event || payload.event !== 'payment.completed') {
    return res.status(400).json({ error: 'invalid payload' });
  }

  const invoiceId = String(payload.invoice_id);
  const payment = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').get(invoiceId);

  if (!payment) {
    return res.status(404).json({ error: 'invoice not found' });
  }

  if (payment.status === 'PAID') {
    return res.status(200).json({ received: true });
  }

  db.prepare(
    `UPDATE payments
     SET status = 'PAID', verified_at = CURRENT_TIMESTAMP,
         payer_name = ?, payer_card = ?, payer_bank_name = ?
     WHERE invoice_id = ?`
  ).run(payload.payer_name || null, payload.payer_card || null, payload.payer_bank_name || null, invoiceId);

  activateSubscription(payment.user_id);

  res.status(200).json({ received: true });
});

router.get('/status/:invoiceId', requireAuth, async (req, res) => {
  const payment = db
    .prepare('SELECT * FROM payments WHERE invoice_id = ? AND user_id = ?')
    .get(req.params.invoiceId, req.userId);

  if (!payment) {
    return res.status(404).json({ error: 'فاکتور یافت نشد.' });
  }

  if (payment.status === 'PAID') {
    return res.json({ status: 'PAID' });
  }

  try {
    const remote = await getInvoiceStatus(req.params.invoiceId);

    if (remote.status === 'PAID' && payment.status !== 'PAID') {
      db.prepare(
        `UPDATE payments
         SET status = 'PAID', verified_at = CURRENT_TIMESTAMP,
             payer_name = ?, payer_card = ?, payer_bank_name = ?
         WHERE invoice_id = ?`
      ).run(remote.payer_name || null, remote.payer_card || null, remote.payer_bank_name || null, req.params.invoiceId);
      activateSubscription(payment.user_id);
    } else if (remote.status !== payment.status) {
      db.prepare('UPDATE payments SET status = ? WHERE invoice_id = ?').run(remote.status, req.params.invoiceId);
    }

    res.json({ status: remote.status });
  } catch (err) {
    console.error('payment/status error:', err);
    res.status(500).json({ error: 'خطا در استعلام وضعیت فاکتور.' });
  }
});

function activateSubscription(userId) {
  const now = new Date();
  const expires = new Date(now.getTime() + DURATION_DAYS * 24 * 60 * 60 * 1000);

  const existingSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);

  if (existingSub) {
    db.prepare('UPDATE subscriptions SET status = ?, started_at = ?, expires_at = ? WHERE user_id = ?').run(
      'active',
      now.toISOString(),
      expires.toISOString(),
      userId
    );
  } else {
    db.prepare('INSERT INTO subscriptions (user_id, status, started_at, expires_at) VALUES (?, ?, ?, ?)').run(
      userId,
      'active',
      now.toISOString(),
      expires.toISOString()
    );
  }
}

module.exports = router;
