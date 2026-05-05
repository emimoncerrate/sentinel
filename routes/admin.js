const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { createLoan } = require('../services/loans');
const { sendLoanReceipt, sendReturnReceipt } = require('../lib/email');

function parseLoanDays(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;
  const n = parseInt(String(rawValue), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

router.get('/stats', (req, res, next) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS count FROM assets').get().count;
    const loaned = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE status = 'Loaned'").get().count;
    const available = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE status = 'Available'").get().count;
    const pending = db.prepare("SELECT COUNT(*) AS count FROM assets WHERE status = 'Pending'").get().count;
    const overdue = db
      .prepare(
        "SELECT COUNT(*) AS count FROM loans WHERE in_date IS NULL AND due_date < datetime('now')"
      )
      .get().count;
    res.json({ total, loaned, overdue, available, pending });
  } catch (err) {
    next(err);
  }
});

router.get('/assets', (req, res, next) => {
  try {
    const assets = db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all();
    res.json(assets);
  } catch (err) {
    next(err);
  }
});

router.post('/assets', (req, res, next) => {
  try {
    const { id, type } = req.body || {};
    const idStr = typeof id === 'string' ? id.trim() : '';
    const typeStr = typeof type === 'string' ? type.trim() : '';
    if (!idStr || !typeStr) {
      return res.status(400).json({ error: 'id and type are required and must be non-empty strings' });
    }
    const created_at = new Date().toISOString();
    db.prepare(
      'INSERT INTO assets (id, type, status, created_at) VALUES (?, ?, ?, ?)'
    ).run(idStr, typeStr, 'Available', created_at);
    const asset = { id: idStr, type: typeStr, status: 'Available', created_at };
    res.status(201).json(asset);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'An asset with this id already exists' });
    }
    next(err);
  }
});

router.get('/active-loans', (req, res, next) => {
  try {
    const loans = db
      .prepare(
        `SELECT l.id, l.asset_id, l.staff_name, l.staff_email, l.out_date, l.due_date, a.type, a.status
         FROM loans l
         JOIN assets a ON a.id = l.asset_id
         WHERE l.in_date IS NULL
         ORDER BY l.due_date ASC`
      )
      .all();
    res.json(loans);
  } catch (err) {
    next(err);
  }
});

router.get('/pending-returns', (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT a.id AS asset_id, a.type, l.id AS loan_id, l.staff_name, l.staff_email, l.returned_at
         FROM assets a
         JOIN loans l ON l.asset_id = a.id AND l.in_date IS NULL AND l.returned_at IS NOT NULL
         WHERE a.status = 'Pending'
         ORDER BY l.returned_at ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/verify-receipt', async (req, res, next) => {
  try {
    const loanId = req.body && req.body.loanId != null ? parseInt(req.body.loanId, 10) : NaN;
    if (!Number.isInteger(loanId) || loanId <= 0) {
      return res.status(400).json({ error: 'loanId is required and must be a positive integer' });
    }
    const loan = db
      .prepare(
        `SELECT l.id, l.asset_id, l.staff_name, l.staff_email, l.returned_at, a.type, a.status
         FROM loans l
         JOIN assets a ON a.id = l.asset_id
         WHERE l.id = ? AND l.in_date IS NULL`
      )
      .get(loanId);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found or already closed' });
    }
    if (loan.status !== 'Pending') {
      return res.status(400).json({ error: 'Asset is not pending verification' });
    }
    const now = new Date().toISOString();
    const updateLoan = db.prepare('UPDATE loans SET in_date = ? WHERE id = ?');
    const updateAsset = db.prepare("UPDATE assets SET status = 'Available' WHERE id = ?");
    const transaction = db.transaction(() => {
      updateLoan.run(now, loanId);
      updateAsset.run(loan.asset_id);
    });
    transaction();
    const emailSent = await sendReturnReceipt({
      staffEmail: loan.staff_email,
      staffName: loan.staff_name,
      assetId: loan.asset_id,
      assetType: loan.type,
      returnedAt: loan.returned_at,
    });
    res.json({ ok: true, emailSent });
  } catch (err) {
    next(err);
  }
});

router.post('/return', (req, res, next) => {
  try {
    const { loanIds } = req.body || {};
    if (!Array.isArray(loanIds)) {
      return res.status(400).json({ error: 'loanIds must be an array' });
    }
    const ids = loanIds.filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'loanIds must contain at least one valid positive integer' });
    }
    const now = new Date().toISOString();
    const updateLoan = db.prepare('UPDATE loans SET in_date = ? WHERE id = ? AND in_date IS NULL');
    const getAssetId = db.prepare('SELECT asset_id FROM loans WHERE id = ?');
    const updateAsset = db.prepare("UPDATE assets SET status = 'Available' WHERE id = ?");
    let updated = 0;
    const transaction = db.transaction(() => {
      for (const loanId of ids) {
        const row = getAssetId.get(loanId);
        if (!row) continue;
        const result = updateLoan.run(now, loanId);
        if (result.changes > 0) {
          updateAsset.run(row.asset_id);
          updated += 1;
        }
      }
    });
    transaction();
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});

router.post('/loans', async (req, res, next) => {
  try {
    const { asset_id, staff_name, staff_email } = req.body || {};
    const assetIdStr = typeof asset_id === 'string' ? asset_id.trim() : '';
    const staffNameStr = typeof staff_name === 'string' ? staff_name.trim() : '';
    const staffEmailStr = typeof staff_email === 'string' ? staff_email.trim() : '';
    const loanDays = parseLoanDays(req.body && req.body.loan_days);
    if (!assetIdStr) {
      return res.status(400).json({ error: 'asset_id is required' });
    }
    if (req.body && req.body.loan_days !== undefined && loanDays == null) {
      return res.status(400).json({ error: 'loan_days must be a positive integer' });
    }
    let result;
    try {
      result = createLoan({
        assetId: assetIdStr,
        staffName: staffNameStr,
        staffEmail: staffEmailStr,
        loanDays: loanDays || undefined,
      });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 409) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    let emailSent = false;
    if (staffEmailStr) {
      emailSent = await sendLoanReceipt({
        staffEmail: staffEmailStr,
        staffName: staffNameStr,
        assetId: result.asset.id,
        assetType: result.asset.type,
        outDate: result.loan.out_date,
        dueDate: result.loan.due_date,
        loanDays: loanDays || undefined,
      });
    }
    res.status(201).json({ loan: result.loan, emailSent });
  } catch (err) {
    next(err);
  }
});

router.delete('/loans/:id', (req, res, next) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(idParam, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid loan id' });
    }
    const loan = db.prepare('SELECT id, asset_id, in_date FROM loans WHERE id = ?').get(id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    if (loan.in_date !== null) {
      return res.status(400).json({ error: 'Only active loans can be deleted' });
    }
    const deleteLoan = db.prepare('DELETE FROM loans WHERE id = ? AND in_date IS NULL');
    const updateAsset = db.prepare("UPDATE assets SET status = 'Available' WHERE id = ?");
    const transaction = db.transaction(() => {
      deleteLoan.run(id);
      updateAsset.run(loan.asset_id);
    });
    transaction();
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
