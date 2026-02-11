const nodemailer = require('nodemailer');

/**
 * Send a loan receipt email. Fail-soft: if SMTP is not configured or send fails,
 * logs the error and returns false; does not throw.
 * @param {{ staffEmail: string, staffName: string, assetId: string, assetType: string, outDate: string, dueDate: string }} opts
 * @returns {Promise<boolean>} true if sent, false if skipped or failed
 */
async function sendLoanReceipt({ staffEmail, staffName, assetId, assetType, outDate, dueDate }) {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  if (!host || !user) {
    console.warn('[email] SMTP not configured (SMTP_HOST or SMTP_USER missing); skipping send');
    return false;
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (err) {
    console.error('[email] Failed to create transporter:', err.message);
    return false;
  }

  const subject = `Loan Receipt – ${assetId}`;
  const body = [
    `Hi ${staffName || 'there'},`,
    '',
    `You have checked out: **${assetId}** (${assetType || 'Asset'}).`,
    `Checkout date: ${outDate}`,
    `Due date: ${dueDate}`,
    '',
    'Please return this item by the due date.',
  ].join('\n');

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'Sentinel <no-reply@localhost>',
      to: staffEmail,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send loan receipt:', err.message);
    return false;
  }
}

/**
 * Send a return receipt email after admin confirms physical receipt. Fail-soft: same as sendLoanReceipt.
 * @param {{ staffEmail: string, staffName: string, assetId: string, assetType: string, returnedAt?: string }} opts
 * @returns {Promise<boolean>} true if sent, false if skipped or failed
 */
async function sendReturnReceipt({ staffEmail, staffName, assetId, assetType, returnedAt }) {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  if (!host || !user) {
    console.warn('[email] SMTP not configured; skipping return receipt');
    return false;
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (err) {
    console.error('[email] Failed to create transporter:', err.message);
    return false;
  }

  const subject = `Return confirmed – ${assetId}`;
  const body = [
    `Hi ${staffName || 'there'},`,
    '',
    `Your return of **${assetId}** (${assetType || 'Asset'}) has been verified.`,
    returnedAt ? `Return logged: ${returnedAt}` : '',
    '',
    'This loan is now closed. Thank you for returning the item.',
  ].filter(Boolean).join('\n');

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'Sentinel <no-reply@localhost>',
      to: staffEmail,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send return receipt:', err.message);
    return false;
  }
}

module.exports = { sendLoanReceipt, sendReturnReceipt };
