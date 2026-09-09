const fetch = require('node-fetch');

const { BLUPAL_API_KEY, BLUPAL_BASE_URL } = process.env;

const BASE_URL = BLUPAL_BASE_URL || 'https://www.blupal.net/api';

async function createInvoice(amountRial) {
  const res = await fetch(`${BASE_URL}/v1/invoices/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': BLUPAL_API_KEY,
    },
    body: JSON.stringify({ amount: amountRial }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    throw new Error(`ساخت فاکتور بلوپال ناموفق بود: ${msg}`);
  }

  return {
    invoiceId: String(data.invoice_id),
    finalAmount: data.final_amount,
    cardNumber: data.card_number,
    paymentLink: data.payment_link,
  };
}

async function getInvoiceStatus(invoiceId) {
  const res = await fetch(`${BASE_URL}/v1/invoices/${invoiceId}`, {
    headers: { 'X-API-Key': BLUPAL_API_KEY },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    throw new Error(`استعلام فاکتور بلوپال ناموفق بود: ${msg}`);
  }

  return data;
}

module.exports = { createInvoice, getInvoiceStatus };
