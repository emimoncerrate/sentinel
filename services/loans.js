const { db } = require('../database');

const DEFAULT_LOAN_DURATION_DAYS = 7;

/**
 * Create a loan for an asset. Validates asset exists and is Available; runs in a transaction.
 * @param {{ assetId: string, staffName: string, staffEmail: string, loanDays?: number }}
 * @returns {{ loan: object, asset: { id, type, status } }}
 * @throws {{ statusCode: number, message: string }} 404 if asset not found, 409 if not available
 */
function createLoan({ assetId, staffName, staffEmail, loanDays }) {
  const asset = db.prepare('SELECT id, type, status FROM assets WHERE id = ?').get(assetId);
  if (!asset) {
    const err = new Error('Asset not found');
    err.statusCode = 404;
    throw err;
  }
  if (asset.status !== 'Available') {
    const err = new Error('Asset is not available for checkout');
    err.statusCode = 409;
    throw err;
  }

  const out_date = new Date().toISOString();
  const days = Number.isInteger(loanDays) && loanDays > 0 ? loanDays : DEFAULT_LOAN_DURATION_DAYS;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  const due_date = dueDate.toISOString();

  const insertLoan = db.prepare(
    'INSERT INTO loans (asset_id, staff_name, staff_email, out_date, due_date, in_date) VALUES (?, ?, ?, ?, ?, NULL)'
  );
  const updateAsset = db.prepare("UPDATE assets SET status = 'Loaned' WHERE id = ?");

  const transaction = db.transaction(() => {
    insertLoan.run(assetId, staffName || null, staffEmail || null, out_date, due_date);
    updateAsset.run(assetId);
  });
  transaction();

  const newId = db.prepare('SELECT last_insert_rowid() as id').get().id;
  const loan = {
    id: newId,
    asset_id: assetId,
    staff_name: staffName || null,
    staff_email: staffEmail || null,
    out_date,
    due_date,
    in_date: null,
  };

  return {
    loan,
    asset: { id: asset.id, type: asset.type, status: 'Loaned' },
  };
}

module.exports = { createLoan, DEFAULT_LOAN_DURATION_DAYS };
