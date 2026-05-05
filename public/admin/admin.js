(function () {
  var currentAssets = [];
  var assetFilters = { type: '', status: '', q: '' };

  function toDateOnlyIso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function setManualLoanDateRangeMins(startInput, endInput) {
    if (!startInput || !endInput) return;
    var today = toDateOnlyIso(new Date());
    startInput.min = today;
    endInput.min = startInput.value || today;
  }

  function formatDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isOverdue(dueDateIso) {
    if (!dueDateIso) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var due = new Date(dueDateIso);
    due.setHours(0, 0, 0, 0);
    return due < today;
  }

  function renderStats(stats) {
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-out').textContent = stats.loaned;
    document.getElementById('stat-overdue').textContent = stats.overdue;
    document.getElementById('stat-available').textContent = stats.available;
    var pendingEl = document.getElementById('stat-pending');
    if (pendingEl) pendingEl.textContent = stats.pending != null ? stats.pending : '–';
  }

  function fetchStats() {
    return fetch('/api/admin/stats').then(handleJsonOrAuthRedirect.bind(null, 'Failed to load stats'));
  }

  function fetchActiveLoans() {
    return fetch('/api/admin/active-loans').then(handleJsonOrAuthRedirect.bind(null, 'Failed to load active loans'));
  }

  function fetchPendingReturns() {
    return fetch('/api/admin/pending-returns').then(handleJsonOrAuthRedirect.bind(null, 'Failed to load pending returns'));
  }

  function formatDateTime(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderPendingReturns(pendingList) {
    var listEl = document.getElementById('pending-returns-list');
    var emptyEl = document.getElementById('pending-returns-empty');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!pendingList || !pendingList.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    pendingList.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 flex flex-wrap items-center gap-3';
      card.innerHTML =
        '<div class="flex-1 min-w-0">' +
        '<p class="font-medium text-white">' + escapeHtml(item.asset_id) + ' · ' + escapeHtml(item.type) + '</p>' +
        '<p class="text-sm text-gray-400">' + escapeHtml(item.staff_name || '–') + '</p>' +
        '<p class="text-xs text-gray-500">Drop-off: ' + formatDateTime(item.returned_at) + '</p>' +
        '</div>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flex-shrink-0 py-2.5 px-4 bg-amber-500/90 hover:bg-amber-500 text-gray-900 font-medium rounded-xl min-h-[44px] transition-colors duration-150';
      btn.textContent = 'Confirm Physical Receipt';
      btn.setAttribute('aria-label', 'Confirm physical receipt for ' + item.asset_id);
      btn.dataset.loanId = String(item.loan_id);
      btn.addEventListener('click', function () {
        var loanId = parseInt(btn.dataset.loanId, 10);
        btn.disabled = true;
        btn.textContent = 'Confirming…';
        fetch('/api/admin/verify-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanId: loanId })
        })
          .then(function (res) {
            return res.json().then(function (body) {
              if (!res.ok) throw new Error(body.error || 'Verify failed');
              return body;
            });
          })
          .then(function () {
            loadDashboard();
          })
          .catch(function (err) {
            alert(err.message || 'Failed to confirm receipt');
            btn.disabled = false;
            btn.textContent = 'Confirm Physical Receipt';
          });
      });
      card.appendChild(btn);
      listEl.appendChild(card);
    });
  }

  function renderActiveLoans(loans) {
    var listEl = document.getElementById('active-loans-list');
    var emptyEl = document.getElementById('active-loans-empty');
    listEl.innerHTML = '';
    var loanedOnly = (loans || []).filter(function (l) { return l.status === 'Loaned'; });
    if (!loanedOnly.length) {
      emptyEl.classList.remove('hidden');
      updateProcessReturnsButton();
      return;
    }
    emptyEl.classList.add('hidden');
    loanedOnly.forEach(function (loan) {
      var wrapper = document.createElement('div');
      wrapper.className = 'flex items-start gap-3 p-4 border-b border-gray-800 last:border-b-0 min-h-[44px] transition-colors duration-150';
      if (isOverdue(loan.due_date)) wrapper.classList.add('bg-red-900/20');
      var row = document.createElement('label');
      row.className = 'flex items-start gap-3 flex-1 min-w-0 cursor-pointer hover:bg-gray-800 -m-4 p-4 rounded-lg transition-colors duration-150';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'loan-return';
      cb.value = loan.id;
      cb.className = 'w-5 h-5 rounded border-gray-600 bg-gray-800 text-violet-500 focus:ring-violet-500';
      cb.setAttribute('aria-label', 'Select loan ' + loan.asset_id + ' for return');
      var cbWrap = document.createElement('div');
      cbWrap.className = 'flex items-center justify-center min-w-[44px] min-h-[44px] flex-shrink-0';
      cbWrap.appendChild(cb);
      var content = document.createElement('div');
      content.className = 'flex-1 min-w-0 py-1';
      content.innerHTML =
        '<p class="font-medium text-white">' + escapeHtml(loan.asset_id) + ' · ' + escapeHtml(loan.type) + '</p>' +
        '<p class="text-sm text-gray-400">' + escapeHtml(loan.staff_name || '–') + ' · ' + escapeHtml(loan.staff_email || '–') + '</p>' +
        '<p class="text-xs text-gray-500">Out: ' + formatDate(loan.out_date) + ' · Due: ' + formatDate(loan.due_date) + (isOverdue(loan.due_date) ? ' <span class="text-red-400 font-medium">Overdue</span>' : '') + '</p>';
      row.appendChild(cbWrap);
      row.appendChild(content);
      wrapper.appendChild(row);
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'flex flex-shrink-0 items-center justify-center py-2 px-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-xl min-h-[44px] transition-colors duration-150';
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('aria-label', 'Delete loan ' + loan.asset_id);
      deleteBtn.dataset.loanId = String(loan.id);
      deleteBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm('Delete this loan? The asset will be marked Available.')) return;
        var loanId = parseInt(deleteBtn.dataset.loanId, 10);
        deleteBtn.disabled = true;
        fetch('/api/admin/loans/' + loanId, { method: 'DELETE' })
          .then(function (res) {
            return res.json().then(function (body) {
              if (!res.ok) throw new Error(body.error || 'Delete failed');
              return body;
            });
          })
          .then(function () {
            loadDashboard();
          })
          .catch(function (err) {
            alert(err.message || 'Failed to delete loan');
            deleteBtn.disabled = false;
          });
      });
      wrapper.appendChild(deleteBtn);
      listEl.appendChild(wrapper);
    });
    listEl.querySelectorAll('input[name="loan-return"]').forEach(function (input) {
      input.addEventListener('change', updateProcessReturnsButton);
    });
    updateProcessReturnsButton();
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getCheckedLoanIds() {
    var ids = [];
    document.querySelectorAll('input[name="loan-return"]:checked').forEach(function (cb) {
      ids.push(parseInt(cb.value, 10));
    });
    return ids;
  }

  function updateProcessReturnsButton() {
    var btn = document.getElementById('process-returns-btn');
    btn.disabled = getCheckedLoanIds().length === 0;
  }

  function processReturns() {
    var loanIds = getCheckedLoanIds();
    if (!loanIds.length) return;
    var btn = document.getElementById('process-returns-btn');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    fetch('/api/admin/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loanIds: loanIds })
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (body) { throw new Error(body.error || 'Return failed'); });
        return res.json();
      })
      .then(function () {
        window.loadDashboard();
        btn.textContent = 'Process Returns';
      })
      .catch(function (err) {
        console.error(err);
        alert(err.message || 'Failed to process returns');
        btn.disabled = false;
        btn.textContent = 'Process Returns';
      });
  }

  function fetchAssets() {
    return fetch('/api/admin/assets').then(handleJsonOrAuthRedirect.bind(null, 'Failed to load assets'));
  }

  function handleJsonOrAuthRedirect(defaultMessage, res) {
    if (res.status === 401) {
      window.location.href = '/admin/login';
      return Promise.reject(new Error('Unauthorized'));
    }
    if (!res.ok) throw new Error(defaultMessage);
    return res.json();
  }

  function applyAssetFilters(assets, filters) {
    var list = assets || [];
    if (filters.type) {
      list = list.filter(function (a) { return a.type === filters.type; });
    }
    if (filters.status) {
      list = list.filter(function (a) { return a.status === filters.status; });
    }
    var q = (filters.q || '').trim();
    if (q) {
      var qLower = q.toLowerCase();
      list = list.filter(function (a) {
        return (a.id || '').toLowerCase().indexOf(qLower) !== -1;
      });
    }
    return list;
  }

  function populateManualLoanAssetDropdown(assets) {
    var selectEl = document.getElementById('manual-loan-asset');
    if (!selectEl) return;
    var available = (assets || []).filter(function (a) { return a.status === 'Available'; });
    selectEl.innerHTML = '<option value="">Select an asset</option>';
    available.forEach(function (asset) {
      var opt = document.createElement('option');
      opt.value = asset.id;
      opt.textContent = asset.id + ' · ' + asset.type;
      selectEl.appendChild(opt);
    });
  }

  function renderAssets(assets) {
    var listEl = document.getElementById('assets-qr-list');
    if (!listEl) return;
    var baseUrl = (typeof window.SENTINEL_DOMAIN === 'string' && window.SENTINEL_DOMAIN) || document.documentElement.getAttribute('data-domain') || window.location.origin;
    listEl.innerHTML = '';
    if (!assets.length) {
      var empty = document.createElement('p');
      empty.className = 'p-4 text-gray-400 text-center';
      empty.textContent = 'No assets match your filters.';
      listEl.appendChild(empty);
      return;
    }
    assets.forEach(function (asset) {
      var url = baseUrl + '/welcome?asset_id=' + encodeURIComponent(asset.id);
      var card = document.createElement('div');
      card.className = 'bg-gray-800/50 border border-gray-700 rounded-2xl p-4 flex flex-wrap items-start gap-4 transition-colors duration-150';
      var info = document.createElement('div');
      info.className = 'flex-1 min-w-0';
      info.innerHTML =
        '<p class="font-medium text-white">' + escapeHtml(asset.id) + '</p>' +
        '<p class="text-sm text-gray-400">' + escapeHtml(asset.type) + ' · ' + escapeHtml(asset.status) + '</p>';
      var qrWrap = document.createElement('div');
      qrWrap.className = 'flex-shrink-0';
      qrWrap.setAttribute('aria-hidden', 'true');
      var printLink = document.createElement('a');
      printLink.href = '/admin/label.html?asset_id=' + encodeURIComponent(asset.id);
      printLink.target = '_blank';
      printLink.rel = 'noopener';
      printLink.className = 'inline-flex items-center justify-center mt-2 py-2 px-3 text-sm border border-gray-600 rounded-xl text-gray-300 hover:bg-gray-700 min-h-[44px] transition-colors duration-150';
      printLink.textContent = 'Print label';
      printLink.setAttribute('aria-label', 'Print label for asset ' + asset.id);
      card.appendChild(info);
      card.appendChild(qrWrap);
      card.appendChild(printLink);
      listEl.appendChild(card);
      if (typeof QRCode !== 'undefined') {
        try {
          new QRCode(qrWrap, { text: url, width: 128, height: 128 });
        } catch (err) {
          qrWrap.innerHTML = '<a href="' + escapeHtml(url) + '" class="text-sm text-violet-400 break-all">' + escapeHtml(url) + '</a>';
        }
      } else {
        qrWrap.innerHTML = '<a href="' + escapeHtml(url) + '" class="text-sm text-violet-400 break-all">' + escapeHtml(url) + '</a>';
      }
    });
  }

  function loadDashboard() {
    fetchStats().then(renderStats).catch(function (err) {
      console.error(err);
      renderStats({ total: 0, loaned: 0, overdue: 0, available: 0, pending: 0 });
    });
    fetchActiveLoans().then(renderActiveLoans).catch(function (err) {
      console.error(err);
      renderActiveLoans([]);
    });
    fetchPendingReturns().then(renderPendingReturns).catch(function (err) {
      console.error(err);
      renderPendingReturns([]);
    });
    fetchAssets().then(function (assets) {
      currentAssets = assets || [];
      populateManualLoanAssetDropdown(currentAssets);
      renderAssets(applyAssetFilters(currentAssets, assetFilters));
    }).catch(function (err) {
      console.error(err);
      currentAssets = [];
      renderAssets([]);
      populateManualLoanAssetDropdown([]);
    });
  }

  function submitManualLoan(e) {
    e.preventDefault();
    var form = document.getElementById('manual-loan-form');
    var assetSelect = document.getElementById('manual-loan-asset');
    var staffNameInput = document.getElementById('manual-loan-staff-name');
    var staffEmailInput = document.getElementById('manual-loan-staff-email');
    var durationTypeInput = document.getElementById('manual-loan-duration-type');
    var customStartInput = document.getElementById('manual-loan-custom-start');
    var customEndInput = document.getElementById('manual-loan-custom-end');
    var errorEl = document.getElementById('manual-loan-error');
    var submitBtn = document.getElementById('manual-loan-submit');
    var asset_id = (assetSelect && assetSelect.value) ? assetSelect.value.trim() : '';
    var staff_name = (staffNameInput && staffNameInput.value) ? staffNameInput.value.trim() : '';
    var staff_email = (staffEmailInput && staffEmailInput.value) ? staffEmailInput.value.trim() : '';
    var durationType = (durationTypeInput && durationTypeInput.value) ? durationTypeInput.value : '1';
    var loanDays = parseInt(durationType, 10);
    if (durationType === 'custom') {
      var startRaw = (customStartInput && customStartInput.value) ? customStartInput.value.trim() : '';
      var endRaw = (customEndInput && customEndInput.value) ? customEndInput.value.trim() : '';
      if (startRaw && endRaw) {
        var start = new Date(startRaw + 'T00:00:00');
        var end = new Date(endRaw + 'T00:00:00');
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
          loanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
        } else {
          loanDays = NaN;
        }
      } else {
        loanDays = NaN;
      }
    }
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    if (!asset_id) {
      errorEl.textContent = 'Please select an asset.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (!Number.isInteger(loanDays) || loanDays <= 0) {
      errorEl.textContent = 'Please choose a valid loan duration.';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    fetch('/api/admin/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: asset_id,
        staff_name: staff_name || undefined,
        staff_email: staff_email || undefined,
        loan_days: loanDays
      })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'Failed to create loan');
          return body;
        });
      })
      .then(function () {
        form.reset();
        syncManualLoanDurationUI();
        loadDashboard();
      })
      .catch(function (err) {
        errorEl.textContent = err.message || 'Failed to create loan';
        errorEl.classList.remove('hidden');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  }

  function submitAddAsset(e) {
    e.preventDefault();
    var form = document.getElementById('add-asset-form');
    var idInput = document.getElementById('asset-id');
    var typeInput = document.getElementById('asset-type');
    var errorEl = document.getElementById('add-asset-error');
    var submitBtn = document.getElementById('add-asset-submit');
    var id = (idInput && idInput.value) ? idInput.value.trim() : '';
    var type = (typeInput && typeInput.value) ? typeInput.value.trim() : '';
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    if (!id || !type) {
      errorEl.textContent = 'Asset ID and Type are required.';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    fetch('/api/admin/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, type: type })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'Failed to add asset');
          return body;
        });
      })
      .then(function () {
        form.reset();
        loadDashboard();
      })
      .catch(function (err) {
        errorEl.textContent = err.message || 'Failed to add asset';
        errorEl.classList.remove('hidden');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  }

  function syncFiltersFromControlsAndRender() {
    var searchEl = document.getElementById('assets-search');
    var typeEl = document.getElementById('assets-filter-type');
    var statusEl = document.getElementById('assets-filter-status');
    assetFilters.q = (searchEl && searchEl.value) ? searchEl.value.trim() : '';
    assetFilters.type = (typeEl && typeEl.value) ? typeEl.value : '';
    assetFilters.status = (statusEl && statusEl.value) ? statusEl.value : '';
    renderAssets(applyAssetFilters(currentAssets, assetFilters));
  }

  window.loadDashboard = loadDashboard;

  function syncManualLoanDurationUI() {
    var durationTypeInput = document.getElementById('manual-loan-duration-type');
    var customWrap = document.getElementById('manual-loan-custom-range-wrap');
    var customStartInput = document.getElementById('manual-loan-custom-start');
    var customEndInput = document.getElementById('manual-loan-custom-end');
    if (!durationTypeInput || !customWrap || !customStartInput || !customEndInput) return;
    var isCustom = durationTypeInput.value === 'custom';
    customWrap.classList.toggle('hidden', !isCustom);
    customStartInput.required = isCustom;
    customEndInput.required = isCustom;
    customStartInput.disabled = !isCustom;
    customEndInput.disabled = !isCustom;
    if (!isCustom) {
      customStartInput.value = '';
      customEndInput.value = '';
      return;
    }
    setManualLoanDateRangeMins(customStartInput, customEndInput);
    if (customStartInput.value) {
      customEndInput.min = customStartInput.value;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadDashboard();
    document.getElementById('process-returns-btn').addEventListener('click', processReturns);
    document.getElementById('manual-loan-form').addEventListener('submit', submitManualLoan);
    var manualLoanDurationType = document.getElementById('manual-loan-duration-type');
    if (manualLoanDurationType) {
      manualLoanDurationType.addEventListener('change', syncManualLoanDurationUI);
      syncManualLoanDurationUI();
    }
    var manualLoanCustomStart = document.getElementById('manual-loan-custom-start');
    var manualLoanCustomEnd = document.getElementById('manual-loan-custom-end');
    if (manualLoanCustomStart && manualLoanCustomEnd) {
      manualLoanCustomStart.addEventListener('change', function () {
        setManualLoanDateRangeMins(manualLoanCustomStart, manualLoanCustomEnd);
        if (manualLoanCustomEnd.value && manualLoanCustomEnd.value < manualLoanCustomStart.value) {
          manualLoanCustomEnd.value = manualLoanCustomStart.value;
        }
      });
    }
    document.getElementById('add-asset-form').addEventListener('submit', submitAddAsset);
    var searchEl = document.getElementById('assets-search');
    var typeEl = document.getElementById('assets-filter-type');
    var statusEl = document.getElementById('assets-filter-status');
    if (searchEl) {
      var searchDebounce;
      searchEl.addEventListener('input', function () {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(syncFiltersFromControlsAndRender, 200);
      });
    }
    if (typeEl) typeEl.addEventListener('change', syncFiltersFromControlsAndRender);
    if (statusEl) statusEl.addEventListener('change', syncFiltersFromControlsAndRender);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
})();
