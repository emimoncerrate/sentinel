const path = require('path');

function isLoggedIn(req) {
  return req.session && req.session.adminLoggedIn === true;
}

function requireHtmlAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  return res.redirect('/admin/login');
}

function requireApiAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || '';
}

function handleLogin(req, res) {
  const { password } = req.body || {};
  const expected = getAdminPassword();
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured' });
  }
  if (typeof password !== 'string' || password !== expected) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  req.session.adminLoggedIn = true;
  res.json({ ok: true });
}

function handleLogout(req, res) {
  if (req.session) {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  } else {
    res.json({ ok: true });
  }
}

function sendLoginPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html'));
}

module.exports = {
  requireHtmlAuth,
  requireApiAuth,
  handleLogin,
  handleLogout,
  sendLoginPage,
};

