require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const adminRoutes = require('./routes/admin');
const checkoutRoutes = require('./routes/checkout');
const {
  requireHtmlAuth,
  requireApiAuth,
  handleLogin,
  handleLogout,
  sendLoginPage,
} = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'sentinel-dev-secret';

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

// Public config for client-side base URL (QR codes, links) - must be before admin static
app.get('/config.js', (req, res) => {
  const domain = process.env.DOMAIN || '';
  res.type('application/javascript');
  res.send('window.SENTINEL_DOMAIN=' + JSON.stringify(domain) + ';');
});

// Auth routes
app.get('/admin/login', sendLoginPage);
app.post('/api/admin/login', handleLogin);
app.post('/api/admin/logout', handleLogout);

// Public checkout API (no auth)
app.use('/api/checkout', checkoutRoutes);

// Redirect legacy /checkout to gateway; allow /welcome and /form without trailing slash
app.get(/^\/checkout$/, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/welcome/' + q);
});
app.get(/^\/checkout\/$/, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/welcome/' + q);
});
app.get(/^\/welcome$/, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/welcome/' + (q ? '?' + q.slice(1) : ''));
});
app.get(/^\/welcome\/$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome', 'index.html'));
});
app.get(/^\/form$/, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/form/' + (q ? '?' + q.slice(1) : ''));
});
app.get(/^\/form\/$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form', 'index.html'));
});

// Protected admin UI
app.use('/admin', requireHtmlAuth, express.static(path.join(__dirname, 'public', 'admin')));

// Protected admin API
app.use('/api/admin', requireApiAuth, adminRoutes);

// Public assets (non-admin static files)
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Sentinel admin server running at http://localhost:${PORT}`);
});

