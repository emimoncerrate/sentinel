(function () {
  var params = new URLSearchParams(window.location.search);
  var type = (params.get('type') || '').toLowerCase();
  var assetId = (params.get('id') || params.get('asset_id') || '').trim();
  var borrowKind = (params.get('borrow') || '').toLowerCase();

  var form = document.getElementById('action-form');
  var formError = document.getElementById('form-error');
  var assetIdInputWrap = document.getElementById('asset-id-input-wrap');
  var assetIdInput = document.getElementById('asset-id');
  var assetIdSelectWrap = document.getElementById('asset-id-select-wrap');
  var assetIdSelect = document.getElementById('asset-id-select');
  var assetIdLabel = document.getElementById('asset-id-label');
  var assetIdSelectLabel = document.getElementById('asset-id-select-label');
  var headerAssetId = document.getElementById('header-asset-id');
  var loanDurationWrap = document.getElementById('loan-duration-wrap');
  var loanDurationTypeInput = document.getElementById('loan-duration-type');
  var loanCustomRangeWrap = document.getElementById('loan-custom-range-wrap');
  var loanCustomStartInput = document.getElementById('loan-custom-start');
  var loanCustomEndInput = document.getElementById('loan-custom-end');
  var reserveWrap = document.getElementById('reserve-datetime-wrap');
  var reservedStartInput = document.getElementById('reserved-start');
  var submitBtn = document.getElementById('submit-btn');
  var successSection = document.getElementById('success-section');
  var successTitle = document.getElementById('success-title');
  var successMessage = document.getElementById('success-message');

  var validTypes = { checkout: true, checkin: true, reserve: true };
  var customBorrowOptions = (window.SENTINEL_BORROW_OPTIONS && typeof window.SENTINEL_BORROW_OPTIONS === 'object')
    ? window.SENTINEL_BORROW_OPTIONS
    : null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (ch) {
      if (ch === '&') return '&amp;';
      if (ch === '<') return '&lt;';
      if (ch === '>') return '&gt;';
      if (ch === '"') return '&quot;';
      return '&#39;';
    });
  }

  function renderAssetOptions(options, placeholder) {
    if (!assetIdSelect) return;
    var items = Array.isArray(options) ? options : [];
    assetIdSelect.innerHTML = '';
    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholder || 'Select an asset';
    assetIdSelect.appendChild(defaultOption);

    items.forEach(function (item) {
      var id = typeof item === 'string' ? item : (item && item.id ? String(item.id) : '');
      if (!id) return;
      var label = typeof item === 'string'
        ? id
        : (item.label || (item.type ? (id + ' · ' + item.type) : id));
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      assetIdSelect.appendChild(opt);
    });
  }

  function getProvidedOptionsForBorrowKind() {
    if (!customBorrowOptions) return null;
    var bucket = customBorrowOptions[borrowKind || 'laptop'];
    return Array.isArray(bucket) ? bucket : null;
  }

  function loadBorrowDropdownOptions() {
    var provided = getProvidedOptionsForBorrowKind();
    if (provided && provided.length) {
      renderAssetOptions(provided, borrowKind === 'other' ? 'Select a charger or accessory' : 'Select a laptop');
      return Promise.resolve();
    }

    return fetch('/api/checkout/assets?borrow=' + encodeURIComponent(borrowKind || 'laptop'))
      .then(function (res) { return res.json(); })
      .then(function (items) {
        renderAssetOptions(items, borrowKind === 'other' ? 'Select a charger or accessory' : 'Select a laptop');
      })
      .catch(function () {
        // Keep graceful fallback when API/data is unavailable.
        renderAssetOptions([], 'No assets available right now');
      });
  }

  function getEnteredAssetId() {
    if (type === 'checkout' && !assetId && assetIdSelect) {
      return (assetIdSelect.value || '').trim();
    }
    return (assetIdInput.value || '').trim();
  }

  function useAssetSelectMode() {
    if (!assetIdSelect || !assetIdSelectWrap || !assetIdInputWrap) return;
    assetIdInputWrap.classList.add('hidden');
    assetIdSelectWrap.classList.remove('hidden');
    assetIdInput.required = false;
    assetIdInput.disabled = true;
    assetIdSelect.required = true;
    assetIdSelect.disabled = false;
  }

  function useAssetInputMode() {
    if (!assetIdInput || !assetIdInputWrap) return;
    assetIdInputWrap.classList.remove('hidden');
    if (assetIdSelectWrap) assetIdSelectWrap.classList.add('hidden');
    assetIdInput.disabled = false;
    assetIdInput.required = true;
    if (assetIdSelect) {
      assetIdSelect.required = false;
      assetIdSelect.disabled = true;
    }
  }

  function showError(msg) {
    formError.textContent = msg || '';
    formError.classList.toggle('hidden', !msg);
  }

  function setMinDatetime() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var hour = String(now.getHours()).padStart(2, '0');
    var minute = String(now.getMinutes()).padStart(2, '0');
    reservedStartInput.min = year + '-' + month + '-' + day + 'T' + hour + ':' + minute;
  }

  function useReserveDatetimeMode(isReserve) {
    if (!reserveWrap || !reservedStartInput) return;
    if (isReserve) {
      reserveWrap.classList.remove('hidden');
      reservedStartInput.disabled = false;
      reservedStartInput.required = true;
      setMinDatetime();
      return;
    }
    reserveWrap.classList.add('hidden');
    reservedStartInput.required = false;
    reservedStartInput.disabled = true;
    reservedStartInput.value = '';
  }

  function toDateOnlyIso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function setMinLoanRangeDates() {
    if (!loanCustomStartInput || !loanCustomEndInput) return;
    var today = toDateOnlyIso(new Date());
    loanCustomStartInput.min = today;
    loanCustomEndInput.min = today;
  }

  function syncLoanDurationCustomUI() {
    if (!loanDurationTypeInput || !loanCustomRangeWrap || !loanCustomStartInput || !loanCustomEndInput) return;
    var isCustom = loanDurationTypeInput.value === 'custom';
    loanCustomRangeWrap.classList.toggle('hidden', !isCustom);
    loanCustomStartInput.required = isCustom;
    loanCustomEndInput.required = isCustom;
    loanCustomStartInput.disabled = !isCustom;
    loanCustomEndInput.disabled = !isCustom;
    if (!isCustom) {
      loanCustomStartInput.value = '';
      loanCustomEndInput.value = '';
      return;
    }
    setMinLoanRangeDates();
    if (loanCustomStartInput.value) {
      loanCustomEndInput.min = loanCustomStartInput.value;
    }
  }

  function useLoanDurationMode(show) {
    if (!loanDurationWrap || !loanDurationTypeInput) return;
    loanDurationWrap.classList.toggle('hidden', !show);
    loanDurationTypeInput.disabled = !show;
    if (!show) {
      if (loanCustomRangeWrap) loanCustomRangeWrap.classList.add('hidden');
      if (loanCustomStartInput && loanCustomEndInput) {
        loanCustomStartInput.required = false;
        loanCustomEndInput.required = false;
        loanCustomStartInput.disabled = true;
        loanCustomEndInput.disabled = true;
        loanCustomStartInput.value = '';
        loanCustomEndInput.value = '';
      }
      return;
    }
    syncLoanDurationCustomUI();
  }

  function getLoanDaysForSubmit() {
    if (!loanDurationTypeInput || loanDurationTypeInput.disabled) return null;
    if (loanDurationTypeInput.value === 'custom') {
      if (!loanCustomStartInput || !loanCustomEndInput) return null;
      var startRaw = (loanCustomStartInput.value || '').trim();
      var endRaw = (loanCustomEndInput.value || '').trim();
      if (!startRaw || !endRaw) return null;
      var start = new Date(startRaw + 'T00:00:00');
      var end = new Date(endRaw + 'T00:00:00');
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
      var ms = end.getTime() - start.getTime();
      return Math.floor(ms / 86400000) + 1;
    }
    var preset = parseInt(loanDurationTypeInput.value, 10);
    return Number.isInteger(preset) && preset > 0 ? preset : null;
  }

  if (!validTypes[type]) {
    showError('Invalid or missing action type.');
    if (form) form.style.display = 'none';
  } else {
    useAssetInputMode();
    useReserveDatetimeMode(false);
    useLoanDurationMode(false);

    if (assetId) {
      assetIdInput.value = assetId;
      assetIdInput.readOnly = true;
      assetIdInput.classList.add('text-gray-400', 'cursor-not-allowed');
      assetIdLabel.textContent = 'Asset ID (preselected)';
      headerAssetId.textContent = assetId;
    } else {
      assetIdInput.readOnly = false;
      assetIdInput.placeholder = borrowKind === 'other' ? 'Enter accessory ID (e.g. CHG-001)' : 'Enter Asset ID';
      assetIdLabel.textContent = 'Asset ID';
      headerAssetId.textContent = borrowKind === 'other' ? 'Enter Device/Accessory ID' : 'Enter Asset ID';
    }

    if (type === 'checkout') {
      if (!assetId && assetIdSelect) {
        useAssetSelectMode();
        if (assetIdSelectLabel) assetIdSelectLabel.textContent = borrowKind === 'other' ? 'Choose Device/Accessory' : 'Choose Laptop';
        loadBorrowDropdownOptions();
      }
      submitBtn.textContent = borrowKind === 'other' ? 'Confirm Device Loan' : 'Confirm Laptop Loan';
      useLoanDurationMode(true);
    } else if (type === 'checkin') {
      submitBtn.textContent = 'Check In';
    } else if (type === 'reserve') {
      useReserveDatetimeMode(true);
      submitBtn.textContent = 'Book reservation';
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');

    var enteredAssetId = getEnteredAssetId();
    var name = (document.getElementById('staff-name').value || '').trim();
    var email = (document.getElementById('staff-email').value || '').trim();

    if (!enteredAssetId) {
      showError(type === 'checkout' ? 'Please select an Asset ID.' : 'Please enter the Asset ID.');
      return;
    }
    if (!name) {
      showError('Please enter your full name.');
      return;
    }
    if (!email) {
      showError('Please enter your email.');
      return;
    }
    if (!email.includes('@')) {
      showError('Please enter a valid email address.');
      return;
    }
    var loanDays = null;
    if (type === 'checkout') {
      loanDays = getLoanDaysForSubmit();
      if (!loanDays) {
        showError('Please choose how many days you need the loaner.');
        return;
      }
    }

    if (type === 'reserve') {
      var reservedStart = (reservedStartInput.value || '').trim();
      if (!reservedStart) {
        showError('Please choose when you need this device.');
        return;
      }
      var chosen = new Date(reservedStart);
      if (chosen <= new Date()) {
        showError('Please choose a future date and time.');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    var body = { asset_id: enteredAssetId, staff_name: name, staff_email: email };
    var url = '/api/checkout';
    if (type === 'checkin') {
      url += '/checkin';
    } else if (type === 'reserve') {
      url += '/reserve';
      body.reserved_start = new Date(reservedStartInput.value).toISOString();
    } else if (type === 'checkout' && loanDays) {
      body.loan_days = loanDays;
    }

    fetch(url, {
      method: type === 'checkin' ? 'POST' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (res.ok) {
            form.classList.add('hidden');
            successSection.classList.remove('hidden');
            if (type === 'checkout') {
              successTitle.textContent = 'Loan confirmed for you';
              var dueStr = data.loan && data.loan.due_date
                ? new Date(data.loan.due_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                : '';
              var confirmedAssetId = data.asset ? data.asset.id : enteredAssetId;
              var confirmedName = name || 'this user';
              successMessage.textContent =
                'Confirmed: ' + confirmedAssetId + ' has been loaned to ' + confirmedName + '. ' +
                (loanDays ? ('Duration: ' + loanDays + ' day' + (loanDays === 1 ? '' : 's') + '. ') : '') +
                (dueStr ? ('Due date: ' + dueStr + '. ') : '') +
                (data.emailSent !== false ? 'A receipt has been sent to your email.' : 'Receipt could not be sent by email.');
            } else if (type === 'checkin') {
              successTitle.textContent = 'Return logged!';
              successMessage.textContent = 'Please place the device on the designated shelf for Admin verification.';
            } else if (type === 'reserve') {
              successTitle.textContent = 'Reservation confirmed';
              var startStr = data.reservation && data.reservation.reserved_start
                ? new Date(data.reservation.reserved_start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                : '';
              successMessage.textContent = 'You are booked for ' + startStr + '.';
            }
            return;
          }
          var errMsg = data.error || 'Something went wrong. Please try again.';
          if (res.status === 409) {
            errMsg = 'Device Unavailable. ' + (data.error || 'Please choose another date/time or try again later.');
          }
          showError(errMsg);
          submitBtn.disabled = false;
          if (type === 'checkout') submitBtn.textContent = borrowKind === 'other' ? 'Confirm Device Loan' : 'Confirm Laptop Loan';
          else if (type === 'checkin') submitBtn.textContent = 'Check In';
          else submitBtn.textContent = 'Book reservation';
        });
      })
      .catch(function () {
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        if (type === 'checkout') submitBtn.textContent = borrowKind === 'other' ? 'Confirm Device Loan' : 'Confirm Laptop Loan';
        else if (type === 'checkin') submitBtn.textContent = 'Check In';
        else submitBtn.textContent = 'Book reservation';
      });
  });

  if (loanDurationTypeInput) {
    loanDurationTypeInput.addEventListener('change', syncLoanDurationCustomUI);
  }
  if (loanCustomStartInput && loanCustomEndInput) {
    loanCustomStartInput.addEventListener('change', function () {
      if (loanCustomStartInput.value) {
        loanCustomEndInput.min = loanCustomStartInput.value;
        if (loanCustomEndInput.value && loanCustomEndInput.value < loanCustomStartInput.value) {
          loanCustomEndInput.value = loanCustomStartInput.value;
        }
      } else {
        setMinLoanRangeDates();
      }
    });
  }
})();
