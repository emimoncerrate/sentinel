(function () {
  const params = new URLSearchParams(window.location.search);
  const assetId = (params.get('asset_id') || params.get('id') || '').trim();

  const assetCard = document.getElementById('asset-card');
  const assetLoading = document.getElementById('asset-loading');
  const assetLoaded = document.getElementById('asset-loaded');
  const assetIdEl = document.getElementById('asset-id');
  const assetTypeEl = document.getElementById('asset-type');
  const assetError = document.getElementById('asset-error');
  const form = document.getElementById('checkout-form');
  const checkinForm = document.getElementById('checkin-form');
  const formError = document.getElementById('form-error');
  const checkinFormError = document.getElementById('checkin-form-error');
  const submitBtn = document.getElementById('submit-btn');
  const checkinSubmitBtn = document.getElementById('checkin-submit-btn');
  const successSection = document.getElementById('success-section');
  const checkinSuccessSection = document.getElementById('checkin-success-section');
  const successAssetId = document.getElementById('success-asset-id');
  const successAssetType = document.getElementById('success-asset-type');
  const successDueDate = document.getElementById('success-due-date');
  const successReceiptNote = document.getElementById('success-receipt-note');

  function showFormError(msg) {
    formError.textContent = msg || '';
    formError.classList.toggle('hidden', !msg);
  }

  function showCheckinFormError(msg) {
    checkinFormError.textContent = msg || '';
    checkinFormError.classList.toggle('hidden', !msg);
  }

  function setFormEnabled(formEl, enabled) {
    if (!formEl) return;
    formEl.querySelectorAll('input, button').forEach(function (el) {
      el.disabled = !enabled;
    });
  }

  function showAssetLoading() {
    assetLoading.classList.remove('hidden');
    assetLoaded.classList.add('hidden');
    assetError.classList.add('hidden');
    assetError.textContent = '';
  }

  function showAssetData(id, type) {
    assetLoading.classList.add('hidden');
    assetLoaded.classList.remove('hidden');
    assetError.classList.add('hidden');
    assetError.textContent = '';
    assetIdEl.textContent = id;
    assetTypeEl.textContent = type || 'Asset';
  }

  function showAssetError(msg) {
    assetLoading.classList.add('hidden');
    assetLoaded.classList.add('hidden');
    assetError.classList.remove('hidden');
    assetError.textContent = msg;
  }

  function showMode(mode) {
    // mode: 'checkout' | 'checkin' | 'message_only' | 'none'
    form.classList.toggle('hidden', mode !== 'checkout');
    checkinForm.classList.toggle('hidden', mode !== 'checkin');
    successSection.classList.add('hidden');
    checkinSuccessSection.classList.add('hidden');
    if (mode === 'checkout') {
      setFormEnabled(form, true);
      setFormEnabled(checkinForm, false);
      document.getElementById('staff-name').focus();
    } else if (mode === 'checkin') {
      setFormEnabled(form, false);
      setFormEnabled(checkinForm, true);
      document.getElementById('checkin-name').focus();
    } else {
      setFormEnabled(form, false);
      setFormEnabled(checkinForm, false);
    }
  }

  function loadAsset() {
    if (!assetId) {
      showAssetError('This link is missing an asset ID.');
      showMode('none');
      return;
    }

    showAssetLoading();
    showMode('none');

    fetch('/api/checkout/asset?asset_id=' + encodeURIComponent(assetId))
      .then(function (res) {
        if (res.ok) {
          return res.json();
        }
        if (res.status === 404 || res.status === 409) {
          return res.json().then(function (body) {
            throw new Error(body.error || 'This asset is not available for checkout.');
          });
        }
        throw new Error('Could not load asset. Please try again.');
      })
      .then(function (data) {
        showAssetData(data.id, data.type);
        if (data.status === 'Available') {
          showMode('checkout');
        } else if (data.status === 'Loaned') {
          showMode('checkin');
        } else if (data.status === 'Pending') {
          assetLoading.classList.add('hidden');
          assetLoaded.classList.add('hidden');
          assetError.classList.remove('hidden');
          assetError.textContent = 'This asset is already returned and awaiting verification.';
          showMode('none');
        } else {
          showAssetError('This asset is not available for checkout.');
          showMode('none');
        }
      })
      .catch(function (err) {
        showAssetError(err.message || 'Could not load asset. Please try again.');
        showMode('none');
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showFormError('');

    var name = (document.getElementById('staff-name').value || '').trim();
    var email = (document.getElementById('staff-email').value || '').trim();

    if (!name) {
      showFormError('Please enter your full name.');
      return;
    }
    if (!email) {
      showFormError('Please enter your email.');
      return;
    }
    if (!email.includes('@')) {
      showFormError('Please enter a valid email address.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: assetId,
        staff_name: name,
        staff_email: email,
      }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (res.ok) {
            assetCard.classList.add('hidden');
            form.classList.add('hidden');
            successAssetId.textContent = body.asset ? body.asset.id : assetId;
            successAssetType.textContent = body.asset ? body.asset.type : '';
            successDueDate.textContent = body.loan && body.loan.due_date
              ? new Date(body.loan.due_date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : '';
            if (body.emailSent === false) {
              successReceiptNote.textContent = 'Receipt could not be sent by email.';
            } else {
              successReceiptNote.textContent = 'A receipt has been sent to ' + email + '.';
            }
            successSection.classList.remove('hidden');
            return;
          }
          showFormError(body.error || 'Something went wrong. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Loan';
        });
      })
      .catch(function () {
        showFormError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Loan';
      });
  });

  checkinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    showCheckinFormError('');

    var name = (document.getElementById('checkin-name').value || '').trim();
    var email = (document.getElementById('checkin-email').value || '').trim();

    if (!name) {
      showCheckinFormError('Please enter your full name.');
      return;
    }
    if (!email) {
      showCheckinFormError('Please enter your email.');
      return;
    }
    if (!email.includes('@')) {
      showCheckinFormError('Please enter a valid email address.');
      return;
    }

    checkinSubmitBtn.disabled = true;
    checkinSubmitBtn.textContent = 'Submitting…';

    fetch('/api/checkout/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: assetId,
        staff_name: name,
        staff_email: email,
      }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (res.ok) {
            assetCard.classList.add('hidden');
            checkinForm.classList.add('hidden');
            checkinSuccessSection.classList.remove('hidden');
            return;
          }
          showCheckinFormError(body.error || 'Something went wrong. Please try again.');
          checkinSubmitBtn.disabled = false;
          checkinSubmitBtn.textContent = 'Check In';
        });
      })
      .catch(function () {
        showCheckinFormError('Network error. Please try again.');
        checkinSubmitBtn.disabled = false;
        checkinSubmitBtn.textContent = 'Check In';
      });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAsset);
  } else {
    loadAsset();
  }
})();
