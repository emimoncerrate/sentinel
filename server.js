const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { logSmtpStartup } = require('./lib/email');
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
const isProduction = process.env.NODE_ENV === 'production';

// Render and other hosts terminate TLS upstream — trust X-Forwarded-* for HTTPS detection / cookies
if (process.env.TRUST_PROXY === '1' || isProduction) {
  app.set('trust proxy', 1);
}

if (isProduction && SESSION_SECRET === 'sentinel-dev-secret') {
  console.warn('[warn] SESSION_SECRET is still the dev default; set SESSION_SECRET in production.');
}

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
  })
);

// Health check for Render / load balancers (no auth)
app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

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
  console.log(`Sentinel listening on port ${PORT}${isProduction ? ' (production)' : ''}`);
  logSmtpStartup();
});

