const nodemailer = require('nodemailer');

function trimEnv(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Normalized SMTP settings (supports common aliases and App Passwords pasted with spaces).
 */
function getSmtpConfig() {
  const host = trimEnv(process.env.SMTP_HOST);
  const port = parseInt(trimEnv(process.env.SMTP_PORT) || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user =
    trimEnv(process.env.SMTP_USER) ||
    trimEnv(process.env.GMAIL_USER) ||
    trimEnv(process.env.GOOGLE_WORKSPACE_EMAIL);
  let pass =
    trimEnv(process.env.SMTP_PASS) ||
    trimEnv(process.env.SMTP_PASSWORD) ||
    trimEnv(process.env.GMAIL_APP_PASSWORD);
  pass = pass.replace(/\s+/g, '');
  const mailFrom = trimEnv(process.env.MAIL_FROM);
  return { host, port, secure, user, pass, mailFrom };
}

/**
 * Log once at startup so misconfigured .env is obvious (no secrets printed).
 */
function logSmtpStartup() {
  const c = getSmtpConfig();
  if (!c.host) {
    console.warn(
      '[email] Receipts disabled: SMTP_HOST is empty. Add e.g. SMTP_HOST=smtp.gmail.com to .env and restart.'
    );
    return;
  }
  if (!c.user) {
    console.warn(
      '[email] Receipts disabled: SMTP_USER is empty. Set SMTP_USER to your full Google Workspace email.'
    );
    return;
  }
  if (!c.pass) {
    console.warn(
      '[email] Receipts disabled: SMTP_PASS is empty. Use a Google App Password (16 chars) in SMTP_PASS.'
    );
    return;
  }
  console.log(`[email] Receipts enabled (${c.host}:${c.port}, user: ${c.user})`);
}

function createTransporter() {
  const c = getSmtpConfig();
  if (!c.host || !c.user || !c.pass) return null;

  const port = Number.isFinite(c.port) ? c.port : 587;
  const secure = c.secure;
  const transport = {
    host: c.host,
    port,
    secure,
    auth: { user: c.user, pass: c.pass },
  };

  if (!secure && port === 587) {
    transport.requireTLS = true;
  }

  return nodemailer.createTransport(transport);
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function isTransientSendError(err) {
  var code = err && err.responseCode;
  var msg = (err && err.message) ? String(err.message) : '';
  var resp = err && err.response ? String(err.response) : '';
  if (code === 421 || code === 451) return true;
  if (/\b421\b|\b451\b/.test(msg) || /\b421\b|\b451\b/.test(resp)) return true;
  return false;
}

async function sendMailWithRetry(transporter, mailOptions, label) {
  var maxAttempts = 3;
  var delaysMs = [0, 2500, 8000];
  var lastErr;
  for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (delaysMs[attempt]) {
        console.warn('[email] ' + label + ': retry #' + attempt + ' after transient SMTP failure…');
        await sleep(delaysMs[attempt]);
      }
      await transporter.sendMail(mailOptions);
      return true;
    } catch (err) {
      lastErr = err;
      if (!isTransientSendError(err) || attempt === maxAttempts - 1) throw err;
    }
  }
  throw lastErr;
}

/**
 * Send a loan receipt email. Fail-soft: if SMTP is not configured or send fails,
 * logs the error and returns false; does not throw.
 * @param {{ staffEmail: string, staffName: string, assetId: string, assetType: string, outDate: string, dueDate: string, loanDays?: number }} opts
 * @returns {Promise<boolean>} true if sent, false if skipped or failed
 */
async function sendLoanReceipt({ staffEmail, staffName, assetId, assetType, outDate, dueDate, loanDays }) {
  const c = getSmtpConfig();
  if (!c.host || !c.user || !c.pass) {
    console.warn('[email] Skipping loan receipt: SMTP_HOST, SMTP_USER, and SMTP_PASS must all be set.');
    return false;
  }

  const transporter = createTransporter();
  if (!transporter) return false;

  const subject = `Loan Receipt – ${assetId}`;
  const body = [
    `Hi ${staffName || 'there'},`,
    '',
    `You have checked out: **${assetId}** (${assetType || 'Asset'}).`,
    loanDays ? `Loan duration requested: ${loanDays} day${loanDays === 1 ? '' : 's'}` : '',
    `Checkout date: ${outDate}`,
    `Due date: ${dueDate}`,
    '',
    'Please return this item by the due date.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await sendMailWithRetry(
      transporter,
      {
        from: c.mailFrom || `Sentinel <${c.user}>`,
        to: staffEmail,
        replyTo: c.user,
        subject,
        text: body,
      },
      'Loan receipt'
    );
    return true;
  } catch (err) {
    console.error('[email] Failed to send loan receipt:', err.message);
    if (err.response) console.error('[email] SMTP response:', String(err.response).slice(0, 800));
    return false;
  }
}

/**
 * Send a return receipt email after admin confirms physical receipt. Fail-soft: same as sendLoanReceipt.
 * @param {{ staffEmail: string, staffName: string, assetId: string, assetType: string, returnedAt?: string }} opts
 * @returns {Promise<boolean>} true if sent, false if skipped or failed
 */
async function sendReturnReceipt({ staffEmail, staffName, assetId, assetType, returnedAt }) {
  const c = getSmtpConfig();
  if (!c.host || !c.user || !c.pass) {
    console.warn('[email] Skipping return receipt: SMTP not fully configured.');
    return false;
  }

  const transporter = createTransporter();
  if (!transporter) return false;

  const subject = `Return confirmed – ${assetId}`;
  const body = [
    `Hi ${staffName || 'there'},`,
    '',
    `Your return of **${assetId}** (${assetType || 'Asset'}) has been verified.`,
    returnedAt ? `Return logged: ${returnedAt}` : '',
    '',
    'This loan is now closed. Thank you for returning the item.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await sendMailWithRetry(
      transporter,
      {
        from: c.mailFrom || `Sentinel <${c.user}>`,
        to: staffEmail,
        replyTo: c.user,
        subject,
        text: body,
      },
      'Return receipt'
    );
    return true;
  } catch (err) {
    console.error('[email] Failed to send return receipt:', err.message);
    if (err.response) console.error('[email] SMTP response:', String(err.response).slice(0, 800));
    return false;
  }
}

module.exports = { sendLoanReceipt, sendReturnReceipt, logSmtpStartup };
