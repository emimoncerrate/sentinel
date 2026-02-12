const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { createLoan } = require('../services/loans');
const { sendLoanReceipt } = require('../lib/email');

// GET /api/checkout/asset?asset_id=... or ?id=... — returns { id, type, status } so client can branch (Available=checkout, Loaned=check-in, Pending/Repair=message)
router.get('/asset', (req, res, next) => {
  try {
    const raw = (req.query.asset_id || req.query.id || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'asset_id is required' });
    }
    const asset = db.prepare('SELECT id, type, status FROM assets WHERE id = ?').get(raw);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json({ id: asset.id, type: asset.type, status: asset.status });
  } catch (err) {
    next(err);
  }
});

// POST /api/checkout/checkin — staff return: set asset to Pending, loan.returned_at = now (do not set in_date)
router.post('/checkin', (req, res, next) => {
  try {
    const body = req.body || {};
    const asset_id = typeof body.asset_id === 'string' ? body.asset_id.trim() : '';
    const staff_name = typeof body.staff_name === 'string' ? body.staff_name.trim() : '';
    const staff_email = typeof body.staff_email === 'string' ? body.staff_email.trim() : '';

    if (!asset_id) {
      return res.status(400).json({ error: 'asset_id is required' });
    }
    if (!staff_name) {
      return res.status(400).json({ error: 'staff_name is required' });
    }
    if (!staff_email) {
      return res.status(400).json({ error: 'staff_email is required' });
    }
    if (!staff_email.includes('@') || !staff_email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const asset = db.prepare('SELECT id, type, status FROM assets WHERE id = ?').get(asset_id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (asset.status !== 'Loaned') {
      return res.status(409).json({ error: 'Asset is not currently on loan' });
    }

    const loan = db.prepare('SELECT id, staff_name, staff_email FROM loans WHERE asset_id = ? AND in_date IS NULL').get(asset_id);
    if (!loan) {
      return res.status(409).json({ error: 'No active loan found for this asset' });
    }

    const nameMatch = (loan.staff_name || '').trim().toLowerCase() === staff_name.toLowerCase();
    const emailMatch = (loan.staff_email || '').trim().toLowerCase() === staff_email.toLowerCase();
    if (!nameMatch || !emailMatch) {
      return res.status(400).json({ error: 'Name and email do not match the person who checked out this asset' });
    }

    const now = new Date().toISOString();
    const updateAsset = db.prepare("UPDATE assets SET status = 'Pending' WHERE id = ?");
    const updateLoan = db.prepare('UPDATE loans SET returned_at = ? WHERE id = ?');
    const transaction = db.transaction(() => {
      updateAsset.run(asset_id);
      updateLoan.run(now, loan.id);
    });
    transaction();

    res.json({ ok: true, message: 'Return logged.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/checkout — body: { asset_id, staff_name, staff_email }
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const asset_id = typeof body.asset_id === 'string' ? body.asset_id.trim() : '';
    const staff_name = typeof body.staff_name === 'string' ? body.staff_name.trim() : '';
    const staff_email = typeof body.staff_email === 'string' ? body.staff_email.trim() : '';

    if (!asset_id) {
      return res.status(400).json({ error: 'asset_id is required' });
    }
    if (!staff_name) {
      return res.status(400).json({ error: 'staff_name is required' });
    }
    if (!staff_email) {
      return res.status(400).json({ error: 'staff_email is required' });
    }
    if (!staff_email.includes('@') || !staff_email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    let result;
    try {
      result = createLoan({ assetId: asset_id, staffName: staff_name, staffEmail: staff_email });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ error: err.message });
      }
      if (err.statusCode === 409) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }

    const emailSent = await sendLoanReceipt({
      staffEmail: staff_email,
      staffName: staff_name,
      assetId: result.asset.id,
      assetType: result.asset.type,
      outDate: result.loan.out_date,
      dueDate: result.loan.due_date,
    });

    res.status(201).json({
      loan: result.loan,
      asset: result.asset,
      emailSent,
    });
  } catch (err) {
    next(err);
  }
});

const RESERVATION_DURATION_DAYS = 7;

// POST /api/checkout/reserve — book device for a future date; asset stays Available; conflict if Loaned or overlapping reservation
router.post('/reserve', (req, res, next) => {
  try {
    const body = req.body || {};
    const asset_id = typeof body.asset_id === 'string' ? body.asset_id.trim() : '';
    const staff_name = typeof body.staff_name === 'string' ? body.staff_name.trim() : '';
    const staff_email = typeof body.staff_email === 'string' ? body.staff_email.trim() : '';
    const reserved_start = typeof body.reserved_start === 'string' ? body.reserved_start.trim() : '';

    if (!asset_id) {
      return res.status(400).json({ error: 'asset_id is required' });
    }
    if (!staff_name) {
      return res.status(400).json({ error: 'staff_name is required' });
    }
    if (!staff_email) {
      return res.status(400).json({ error: 'staff_email is required' });
    }
    if (!staff_email.includes('@') || !staff_email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (!reserved_start) {
      return res.status(400).json({ error: 'reserved_start is required' });
    }
    const startDate = new Date(reserved_start);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'reserved_start must be a valid date/time' });
    }
    if (startDate <= new Date()) {
      return res.status(400).json({ error: 'Reservation must be for a future date/time' });
    }

    const asset = db.prepare('SELECT id, type, status FROM assets WHERE id = ?').get(asset_id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (asset.status === 'Loaned') {
      return res.status(409).json({ error: 'Device is currently on loan.' });
    }
    if (asset.status !== 'Available') {
      return res.status(409).json({ error: 'Device unavailable for this date/time.' });
    }

    const reservedEnd = new Date(startDate);
    reservedEnd.setDate(reservedEnd.getDate() + RESERVATION_DURATION_DAYS);
    const reserved_end = reservedEnd.toISOString();

    const overlapping = db
      .prepare(
        `SELECT 1 FROM reservations
         WHERE asset_id = ?
         AND reserved_start < ?
         AND COALESCE(reserved_end, datetime(reserved_start, '+' || ? || ' days')) > ?`
      )
      .get(asset_id, reserved_end, RESERVATION_DURATION_DAYS, reserved_start);
    if (overlapping) {
      return res.status(409).json({ error: 'Device unavailable for this date/time.' });
    }

    const created_at = new Date().toISOString();
    const insert = db.prepare(
      'INSERT INTO reservations (asset_id, staff_name, staff_email, reserved_start, reserved_end, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run(asset_id, staff_name, staff_email, reserved_start, reserved_end, created_at);
    const id = db.prepare('SELECT last_insert_rowid() as id').get().id;
    const reservation = {
      id,
      asset_id,
      staff_name,
      staff_email,
      reserved_start,
      reserved_end,
      created_at,
    };
    res.status(201).json({ ok: true, reservation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
