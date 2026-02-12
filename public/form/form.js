(function () {
  var params = new URLSearchParams(window.location.search);
  var type = (params.get('type') || '').toLowerCase();
  var assetId = (params.get('id') || params.get('asset_id') || '').trim();

  var form = document.getElementById('action-form');
  var formError = document.getElementById('form-error');
  var assetIdInput = document.getElementById('asset-id');
  var headerAssetId = document.getElementById('header-asset-id');
  var reserveWrap = document.getElementById('reserve-datetime-wrap');
  var reservedStartInput = document.getElementById('reserved-start');
  var submitBtn = document.getElementById('submit-btn');
  var successSection = document.getElementById('success-section');
  var successTitle = document.getElementById('success-title');
  var successMessage = document.getElementById('success-message');

  var validTypes = { checkout: true, checkin: true, reserve: true };

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

  if (!validTypes[type] || !assetId) {
    showError(type ? 'Missing device ID in URL.' : 'Invalid or missing action type.');
    if (form) form.style.display = 'none';
  } else {
    assetIdInput.value = assetId;
    headerAssetId.textContent = assetId;

    if (type === 'checkout') {
      submitBtn.textContent = 'Confirm Loan';
    } else if (type === 'checkin') {
      submitBtn.textContent = 'Check In';
    } else if (type === 'reserve') {
      reserveWrap.classList.remove('hidden');
      setMinDatetime();
      submitBtn.textContent = 'Book reservation';
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');

    var name = (document.getElementById('staff-name').value || '').trim();
    var email = (document.getElementById('staff-email').value || '').trim();

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

    var body = { asset_id: assetId, staff_name: name, staff_email: email };
    var url = '/api/checkout';
    if (type === 'checkin') {
      url += '/checkin';
    } else if (type === 'reserve') {
      url += '/reserve';
      body.reserved_start = new Date(reservedStartInput.value).toISOString();
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
              successTitle.textContent = 'Loan confirmed!';
              var dueStr = data.loan && data.loan.due_date
                ? new Date(data.loan.due_date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                : '';
              successMessage.textContent = 'Asset: ' + (data.asset ? data.asset.id : assetId) + '. Due date: ' + dueStr + '. ' + (data.emailSent !== false ? 'A receipt has been sent to your email.' : 'Receipt could not be sent by email.');
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
          if (type === 'checkout') submitBtn.textContent = 'Confirm Loan';
          else if (type === 'checkin') submitBtn.textContent = 'Check In';
          else submitBtn.textContent = 'Book reservation';
        });
      })
      .catch(function () {
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        if (type === 'checkout') submitBtn.textContent = 'Confirm Loan';
        else if (type === 'checkin') submitBtn.textContent = 'Check In';
        else submitBtn.textContent = 'Book reservation';
      });
  });
})();
