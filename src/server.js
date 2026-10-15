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

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount TEXT,
        sender TEXT,
        message TEXT,
        status TEXT DEFAULT 'pending',
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
  });
}

function isAuthorizedAdmin(req) {
  const headerKey = req.headers['x-admin-key'] || req.query.key;
  return Boolean(process.env.ADMIN_KEY) && headerKey === process.env.ADMIN_KEY;
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'slab',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'SLAB',
    status: 'running',
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
    admin: '/admin',
    inbox: '/api/inbox/:secret',
  });
});

app.get('/admin', (req, res) => {
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized: provide the admin key via X-Admin-Key header or ?key=' });
  }

  db.get('SELECT COUNT(*) AS total FROM receipts', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database query failed', details: err.message });
    }

    db.get('SELECT COUNT(*) AS total FROM inbox_messages', (inboxErr, inboxRow) => {
      if (inboxErr) {
        return res.status(500).json({ error: 'Inbox query failed', details: inboxErr.message });
      }

      res.json({
        ok: true,
        receipts: Number(row.total || 0),
        inboxMessages: Number(inboxRow.total || 0),
        publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
      });
    });
  });
});

app.get('/api/inbox/:secret', (req, res) => {
  const { secret } = req.params;
  if (secret !== process.env.INBOX_SECRET) {
    return res.status(401).json({ error: 'Invalid inbox secret' });
  }

  db.all('SELECT id, payload, created_at FROM inbox_messages ORDER BY created_at DESC LIMIT 20', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch inbox messages', details: err.message });
    }

    res.json({ ok: true, messages: rows || [] });
  });
});

app.post('/api/inbox/:secret', (req, res) => {
  const { secret } = req.params;

  if (secret !== process.env.INBOX_SECRET) {
    return res.status(401).json({ error: 'Invalid inbox secret' });
  }

  const payload = JSON.stringify(req.body || {});

  db.run('INSERT INTO inbox_messages (secret, payload) VALUES (?, ?)', [secret, payload], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to store inbox payload', details: err.message });
    }

    res.status(202).json({ ok: true, id: this.lastID, accepted: true });
  });
});

app.post('/api/receipt', (req, res) => {
  const { amount, sender, message, status = 'pending' } = req.body || {};

  db.run(
    'INSERT INTO receipts (amount, sender, message, status) VALUES (?, ?, ?, ?)',
    [String(amount || ''), String(sender || ''), String(message || ''), String(status)],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Could not create receipt', details: err.message });
      }

      res.status(201).json({ ok: true, id: this.lastID, amount, sender, status });
    }
  );
});

app.get('/api/receipts', (req, res) => {
  db.all('SELECT * FROM receipts ORDER BY created_at DESC LIMIT 50', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to load receipts', details: err.message });
    }

    res.json({ ok: true, receipts: rows || [] });
  });
});

initializeDatabase();

app.listen(port, () => {
  console.log(`SLAB running on http://localhost:${port}`);
});
