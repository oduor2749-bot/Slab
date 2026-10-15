const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static site
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount TEXT,
        sender TEXT,
        message TEXT,
        status TEXT DEFAULT 'pending',
        mpesa_transaction_id TEXT,
        phone TEXT,
        external_reference TEXT,
        raw_payload TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        secret TEXT,
        payload TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure older installs get new columns if table was created previously
    db.all("PRAGMA table_info(receipts)", (err, rows) => {
      if (err) return;
      const cols = (rows || []).map((r) => r.name);
      const toAdd = [];
      if (!cols.includes('mpesa_transaction_id')) toAdd.push("ALTER TABLE receipts ADD COLUMN mpesa_transaction_id TEXT");
      if (!cols.includes('phone')) toAdd.push("ALTER TABLE receipts ADD COLUMN phone TEXT");
      if (!cols.includes('external_reference')) toAdd.push("ALTER TABLE receipts ADD COLUMN external_reference TEXT");
      if (!cols.includes('raw_payload')) toAdd.push("ALTER TABLE receipts ADD COLUMN raw_payload TEXT");
      toAdd.forEach((q) => {
        db.run(q, () => {});
      });
    });
  });
}

function isAuthorizedAdmin(req) {
  const headerKey = req.headers['x-admin-key'] || req.query.key;
  return Boolean(process.env.ADMIN_KEY) && headerKey === process.env.ADMIN_KEY;
}

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'slab', environment: process.env.NODE_ENV || 'development', timestamp: new Date().toISOString() });
});

// Admin API for the UI
app.get('/api/admin', (req, res) => {
  if (!isAuthorizedAdmin(req)) return res.status(401).json({ error: 'Unauthorized: provide the admin key via X-Admin-Key header or ?key=' });

  db.get('SELECT COUNT(*) AS total FROM receipts', (err, row) => {
    if (err) return res.status(500).json({ error: 'Database query failed', details: err.message });

    db.get('SELECT COUNT(*) AS total FROM inbox_messages', (inboxErr, inboxRow) => {
      if (inboxErr) return res.status(500).json({ error: 'Inbox query failed', details: inboxErr.message });

      db.all('SELECT * FROM receipts ORDER BY created_at DESC LIMIT 20', (receiptsErr, receipts) => {
        if (receiptsErr) return res.status(500).json({ error: 'Receipt query failed', details: receiptsErr.message });

        res.json({ ok: true, receiptsCount: Number(row.total || 0), inboxCount: Number(inboxRow.total || 0), publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`, receipts: receipts || [] });
      });
    });
  });
});

// Inbox endpoints (for SMS-forward style payloads)
app.get('/api/inbox/:secret', (req, res) => {
  const { secret } = req.params;
  if (secret !== process.env.INBOX_SECRET) return res.status(401).json({ error: 'Invalid inbox secret' });

  db.all('SELECT id, payload, created_at FROM inbox_messages ORDER BY created_at DESC LIMIT 20', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch inbox messages', details: err.message });
    res.json({ ok: true, messages: rows || [] });
  });
});

app.post('/api/inbox/:secret', (req, res) => {
  const { secret } = req.params;
  if (secret !== process.env.INBOX_SECRET) return res.status(401).json({ error: 'Invalid inbox secret' });

  const payload = JSON.stringify(req.body || {});
  db.run('INSERT INTO inbox_messages (secret, payload) VALUES (?, ?)', [secret, payload], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to store inbox payload', details: err.message });
    res.status(202).json({ ok: true, id: this.lastID, accepted: true });
  });
});

// Receipts API
app.post('/api/receipt', (req, res) => {
  const { amount, sender, message, status = 'pending' } = req.body || {};
  db.run('INSERT INTO receipts (amount, sender, message, status) VALUES (?, ?, ?, ?)', [String(amount || ''), String(sender || ''), String(message || ''), String(status)], function (err) {
    if (err) return res.status(500).json({ error: 'Could not create receipt', details: err.message });
    res.status(201).json({ ok: true, id: this.lastID, amount, sender, status });
  });
});

app.get('/api/receipts', (req, res) => {
  db.all('SELECT * FROM receipts ORDER BY created_at DESC LIMIT 20', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load receipts', details: err.message });
    res.json({ ok: true, receipts: rows || [] });
  });
});

// --- M-Pesa (Daraja) STK Push Integration ---
const MPESA = {
  consumerKey: process.env.MPESA_CONSUMER_KEY || '',
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
  shortcode: process.env.MPESA_SHORTCODE || '',
  passkey: process.env.MPESA_PASSKEY || '',
  env: process.env.MPESA_ENV || 'sandbox',
  callbackBase: process.env.MPESA_CALLBACK_BASE || process.env.PUBLIC_URL || '',
};

const mpesaBase = MPESA.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
let tokenCache = { token: null, expiresAt: 0 };

async function getMpesaToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - 5000 > now) return tokenCache.token;

  const creds = Buffer.from(`${MPESA.consumerKey}:${MPESA.consumerSecret}`).toString('base64');
  const res = await fetch(`${mpesaBase}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${creds}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Failed to fetch token: ${res.status} ${txt}`);
  }
  const data = await res.json();
  const ttl = Number(data.expires_in || 3600) * 1000;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttl };
  return tokenCache.token;
}

function mpesaTimestamp() {
  const d = new Date();
  const YYYY = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { amount, phone, accountReference = 'SLAB', transactionDesc = 'Payment' } = req.body || {};
    if (!amount || !phone) return res.status(400).json({ error: 'Missing amount or phone' });
    if (!MPESA.consumerKey || !MPESA.consumerSecret || !MPESA.shortcode || !MPESA.passkey || !MPESA.callbackBase) {
      return res.status(500).json({ error: 'MPESA configuration not set on server' });
    }

    const token = await getMpesaToken();
    const timestamp = mpesaTimestamp();
    const password = Buffer.from(`${MPESA.shortcode}${MPESA.passkey}${timestamp}`).toString('base64');

    const body = {
      BusinessShortCode: MPESA.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: String(amount),
      PartyA: String(phone).replace(/^\+/, ''),
      PartyB: MPESA.shortcode,
      PhoneNumber: String(phone).replace(/^\+/, ''),
      CallBackURL: `${MPESA.callbackBase.replace(/\/$/, '')}/api/mpesa/stkpush/callback`,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    };

    const resp = await fetch(`${mpesaBase}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(502).json({ error: 'Daraja error', details: data });

    // Save a pending receipt row tied to the CheckoutRequestID for tracing
    const checkoutId = data.CheckoutRequestID || null;
    db.run('INSERT INTO receipts (amount, sender, message, status, raw_payload) VALUES (?, ?, ?, ?, ?)', [String(amount || ''), String(phone || ''), String(accountReference || ''), 'stk_pending', JSON.stringify({ request: body, response: data })], function (err) {
      if (err) {
        // non-fatal for the STK response; return success to client with details
        return res.status(200).json({ ok: true, daraja: data, note: 'STK initiated but DB insert failed', checkoutId });
      }
      res.status(200).json({ ok: true, daraja: data, checkoutId, receiptId: this.lastID });
    });
  } catch (err) {
    res.status(500).json({ error: 'STK push failed', details: err.message });
  }
});

// Callback endpoint Daraja will POST to when STK completes
app.post('/api/mpesa/stkpush/callback', (req, res) => {
  // Daraja expects a quick 200 response. We'll parse and process asynchronously-ish.
  const payload = req.body || {};

  // Best-effort acknowledgement immediately
  res.status(200).json({ Received: true });

  try {
    // Daraja wraps result in Body.stkCallback or similar depending on configuration
    const result = payload.Body || payload;
    const callback = result.stkCallback || result;

    // Typical fields: CheckoutRequestID, MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata
    const checkoutId = callback.CheckoutRequestID || callback.CheckoutRequestID;
    const resultCode = Number(callback.ResultCode ?? (callback.Result?.ResultCode || 0));
    const resultDesc = callback.ResultDesc || callback.Result?.ResultDesc || callback.ResultDescription || '';

    // Extract MpesaReceiptNumber & Amount & Phone from CallbackMetadata if present
    let mpesaReceipt = null;
    let amount = null;
    let msisdn = null;
    let accountRef = null;

    const meta = callback.CallbackMetadata || (callback.Result && callback.Result.CallbackMetadata) || null;
    if (meta && Array.isArray(meta.Item)) {
      meta.Item.forEach((it) => {
        const name = it.Name || it.name;
        if (/MpesaReceiptNumber/i.test(name)) mpesaReceipt = it.Value;
        if (/Amount/i.test(name)) amount = it.Value;
        if (/PhoneNumber|MSISDN/i.test(name)) msisdn = it.Value;
        if (/AccountReference/i.test(name)) accountRef = it.Value;
      });
    }

    // If ResultCode === 0, treat as successful
    const status = resultCode === 0 ? 'verified' : 'failed';

    if (!mpesaReceipt && checkoutId && status === 'verified') {
      // Sometimes the receipt is nested elsewhere; attempt to find it
      mpesaReceipt = callback.MpesaReceiptNumber || (callback.Result && callback.Result.MpesaReceiptNumber) || null;
    }

    const raw = JSON.stringify(payload);

    if (mpesaReceipt) {
      // Idempotent: if we already have this mpesa_transaction_id, update status and return
      db.get('SELECT id FROM receipts WHERE mpesa_transaction_id = ?', [mpesaReceipt], (err, row) => {
        if (err) return;
        if (row) {
          db.run('UPDATE receipts SET status = ?, raw_payload = COALESCE(raw_payload, ?) WHERE id = ?', [status, raw, row.id]);
        } else {
          // Try updating by checkout id if we stored it earlier (we stored it in raw_payload on insert)
          db.get("SELECT id, raw_payload FROM receipts WHERE raw_payload LIKE '%' || ? || '%' LIMIT 1", [checkoutId || ''], (e2, r2) => {
            if (r2 && r2.id) {
              db.run('UPDATE receipts SET status = ?, mpesa_transaction_id = ?, phone = ?, external_reference = ?, raw_payload = ? WHERE id = ?', [status, mpesaReceipt, String(msisdn || ''), String(accountRef || ''), raw, r2.id]);
            } else {
              // Fallback: insert a new verified receipt
              db.run('INSERT INTO receipts (amount, sender, message, status, mpesa_transaction_id, phone, external_reference, raw_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [String(amount || ''), String(msisdn || ''), String(accountRef || ''), status, mpesaReceipt, String(msisdn || ''), String(accountRef || ''), raw], () => {});
            }
          });
        }
      });
    } else {
      // No mpesa receipt — store the callback for manual inspection
      db.run('INSERT INTO receipts (amount, sender, message, status, raw_payload) VALUES (?, ?, ?, ?, ?)', [String(amount || ''), String(msisdn || ''), String(accountRef || ''), status, raw], () => {});
    }
  } catch (err) {
    // swallow errors — we've already replied 200 to Daraja
    console.error('Error processing mpesa callback:', err);
  }
});

initializeDatabase();

app.listen(port, () => {
  console.log(`SLAB running on http://localhost:${port}`);
});
