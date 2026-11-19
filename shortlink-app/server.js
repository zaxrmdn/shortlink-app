const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
// Password sederhana untuk mengakses dashboard (ubah lewat env di docker-compose)
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database SQLite
const dbPath = path.resolve(__dirname, 'data', 'shortlinks.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Gagal terhubung ke database:', err.message);
  else console.log('Terhubung ke database SQLite Shortlink.');
});

// Buat Tabel Links
db.run(`CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Middleware autentikasi sederhana untuk API admin
const checkAuth = (req, res, next) => {
  const authHeader = req.headers['x-admin-password'];
  if (authHeader !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Password admin salah!' });
  }
  next();
};

// API: Ambil semua daftar shortlink
app.get('/api/links', checkAuth, (req, res) => {
  db.all(`SELECT * FROM links ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ links: rows });
  });
});

// API: Buat shortlink baru
app.post('/api/links', checkAuth, (req, res) => {
  let { url, customSlug } = req.body;
  if (!url) return res.status(400).json({ error: 'URL tujuan wajib diisi!' });

  // Pastikan URL memiliki protokol http/https
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Generate slug acak 5 karakter jika customSlug kosong
  const slug = customSlug
    ? customSlug.trim().replace(/[^a-zA-Z0-9-_]/g, '')
    : crypto.randomBytes(3).toString('hex');

  if (!slug) return res.status(400).json({ error: 'Slug tidak valid!' });

  const query = `INSERT INTO links (slug, original_url) VALUES (?, ?)`;
  db.run(query, [slug, url], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Slug sudah digunakan, pilih nama lain!' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, slug, original_url: url });
  });
});

// API: Hapus shortlink
app.delete('/api/links/:id', checkAuth, (req, res) => {
  db.run(`DELETE FROM links WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Shortlink berhasil dihapus!' });
  });
});

// Rute Redirect Utama (/:slug)
app.get('/:slug', (req, res) => {
  const { slug } = req.params;
  db.get(`SELECT * FROM links WHERE slug = ?`, [slug], (err, row) => {
    if (err) return res.status(500).send('Terjadi kesalahan server.');
    if (!row) {
      return res.status(404).send(`
        <div style="font-family:sans-serif;text-align:center;margin-top:100px;">
          <h1>404 - Tautan Tidak Ditemukan</h1>
          <p>Shortlink <b>/${slug}</b> tidak terdaftar atau sudah dihapus.</p>
        </div>
      `);
    }

    // Tambah jumlah klik dan redirect
    db.run(`UPDATE links SET clicks = clicks + 1 WHERE id = ?`, [row.id]);
    res.redirect(302, row.original_url);
  });
});

app.listen(PORT, () => {
  console.log(`Server Shortlink berjalan di port ${PORT}`);
});