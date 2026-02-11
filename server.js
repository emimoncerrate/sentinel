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

// Auth routes
app.get('/admin/login', sendLoginPage);
app.post('/api/admin/login', handleLogin);
app.post('/api/admin/logout', handleLogout);

// Public checkout API (no auth)
app.use('/api/checkout', checkoutRoutes);

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

