// MOCK APPOINTMENTS INITIAL DATA STATE USING ACCOUNT NUMBERS
    let appointments = [
      { id: 'CP-89240', accountNumber: '1123415123', email: 'eleanor@example.com', phone: '0917 555 0192', date: '2026-11-09', time: '09:00', type: 'Deposit Cash', amount: '₱15,000.00', checkNumber: '', status: 'Approved', transactions: ['Deposit Cash: ₱15,000.00 (Acc: 1123415123)'] },
      { id: 'CP-89241', accountNumber: '9842104921', email: 'robert.chen@gmail.com', phone: '0928 444 8821', date: '2026-11-09', time: '10:00', type: 'Deposit Check', amount: '₱45,500.00', checkNumber: '9821', status: 'Pending', transactions: ['Deposit Check: ₱45,500.00 (Acc: 9842104921) [Check #9821]'] },
      { id: 'CP-89242', accountNumber: '5510293841', email: 'smartinez@yahoo.com', phone: '0905 111 3322', date: '2026-11-09', time: '10:00', type: 'Withdraw Cash', amount: '₱20,000.00', checkNumber: '', status: 'Pending', transactions: ['Withdraw Cash: ₱20,000.00 (Acc: 5510293841)'] },
      { id: 'CP-89243', accountNumber: '3349102958', email: 'dkim@techcorp.io', phone: '0918 999 2211', date: '2026-11-09', time: '11:00', type: 'Deposit Cash', amount: '₱120,000.00', checkNumber: '', status: 'Approved', transactions: ['Deposit Cash: ₱120,000.00 (Acc: 3349102958)'] },
      { id: 'CP-89244', accountNumber: '7749102934', email: 'areyes@design.ph', phone: '0917 888 7766', date: '2026-11-09', time: '13:00', type: 'Withdraw Check', amount: '₱8,500.00', checkNumber: '1102', status: 'Rejected', transactions: ['Withdraw Check: ₱8,500.00 (Acc: 7749102934) [Check #1102]'] },
      { id: 'CP-89245', accountNumber: '2294019284', email: 'gtorres@outlook.com', phone: '0920 333 4455', date: '2026-11-09', time: '14:00', type: 'Deposit Cash', amount: '₱5,000.00', checkNumber: '', status: 'Pending', transactions: ['Deposit Cash: ₱5,000.00 (Acc: 2294019284)'] },
      { id: 'CP-89246', accountNumber: '8839201948', email: 'clara.o@space.co.uk', phone: '0915 222 6677', date: '2026-11-09', time: '15:00', type: 'Deposit Check', amount: '₱32,000.00', checkNumber: '5524', status: 'Approved', transactions: ['Deposit Check: ₱32,000.00 (Acc: 8839201948) [Check #5524]'] },
      { id: 'CP-89247', accountNumber: '6610293847', email: 'mbrody@museum.org', phone: '0919 777 4411', date: '2026-11-10', time: '09:00', type: 'Withdraw Cash', amount: '₱50,000.00', checkNumber: '', status: 'Approved', transactions: ['Withdraw Cash: ₱50,000.00 (Acc: 6610293847)'] },
      { id: 'CP-89248', accountNumber: '4492019482', email: 'hannah@leaf.com', phone: '0922 888 1133', date: '2026-11-10', time: '10:00', type: 'Deposit Cash', amount: '₱12,400.00', checkNumber: '', status: 'Pending', transactions: ['Deposit Cash: ₱12,400.00 (Acc: 4492019482)'] },
      { id: 'CP-89249', accountNumber: '1102938475', email: 'vstone@cyber.net', phone: '0908 666 5544', date: '2026-11-10', time: '11:00', type: 'Withdraw Check', amount: '₱65,000.00', checkNumber: '7719', status: 'Completed', transactions: ['Withdraw Check: ₱65,000.00 (Acc: 1102938475)'] }
    ];

    let currentFilter = 'All';
    let currentActiveModalAppId = null;
    let calendarCurrentDate = new Date(2026, 10, 1); // Nov 2026
    let calendarViewMode = 'month';

    // Charts references
    let trafficChartRef = null;
    let transactionPieChartRef = null;
    let capacityBarChartRef = null;

    // Format transaction amounts as Philippine pesos.
    function formatPeso(amount) {
      const numericAmount = Number(String(amount ?? '').replace(/[^0-9.-]/g, ''));
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
    }

    // Show the check-number field only for check transactions.
    function toggleCheckNumberField() {
      const transactionType = document.getElementById('newCustType').value;
      const checkField = document.getElementById('newCheckNumberField');
      const checkInput = document.getElementById('newCustCheckNumber');
      const isCheckTransaction = transactionType.includes('Check');

      checkField.classList.toggle('hidden', !isCheckTransaction);
      checkInput.required = isCheckTransaction;

      if (!isCheckTransaction) {
        checkInput.value = '';
      }
    }

    // Initialization
    window.addEventListener('DOMContentLoaded', () => {
      startClock();
      updateStatCounters();
      renderQuickListTable();
      renderAppointmentsTable();
      renderCalendar();
      initCharts();
    });

    // Clock
    function startClock() {
      function update() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('currentClock').innerText = timeStr;
        document.getElementById('currentDate').innerText = dateStr;
      }
      update();
      setInterval(update, 1000);
    }

    // LOGIN / LOGOUT FLOW
    function togglePasswordVisibility() {
      const passInput = document.getElementById('loginPass');
      passInput.type = passInput.type === 'password' ? 'text' : 'password';
    }

    function handleLogin(e) {
      e.preventDefault();
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('dashboardView').classList.remove('hidden');
      showToast('Welcome back, Admin User!', 'success');
      // Trigger Chart resize render
      setTimeout(() => { if (trafficChartRef) trafficChartRef.resize(); }, 200);
    }

    function handleLogout() {
      document.getElementById('dashboardView').classList.add('hidden');
      document.getElementById('loginView').classList.remove('hidden');
      showToast('Logged out of Admin Portal.', 'info');
    }

    // NAVIGATION TABS
    function switchNavTab(tabId) {
      const tabs = ['dashboard', 'appointments', 'calendar', 'traffic'];
      tabs.forEach(t => {
        const sec = document.getElementById(`section-${t}`);
        const btn = document.getElementById(`nav-${t}`);
        if (t === tabId) {
          sec.classList.remove('hidden');
          btn.className = "nav-btn w-full flex items-center space-x-3 px-4 py-3 rounded-2xl font-serif font-bold text-sm transition-all duration-150 bg-brandLime text-black shadow-sm";
        } else {
          sec.classList.add('hidden');
          btn.className = "nav-btn w-full flex items-center space-x-3 px-4 py-3 rounded-2xl font-serif font-bold text-sm text-gray-600 hover:bg-gray-100 transition-all duration-150";
        }
      });
      // Close mobile sidebar if open
      document.getElementById('sidebar').classList.add('hidden');
      document.getElementById('sidebar').classList.add('lg:flex');
    }

    function toggleMobileSidebar() {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('hidden');
    }

    // UPDATE SUMMARY CARDS & COUNTERS
    function updateStatCounters() {
      const total = appointments.length;
      const pending = appointments.filter(a => a.status === 'Pending').length;
      const approved = appointments.filter(a => a.status === 'Approved').length;
      const rejected = appointments.filter(a => a.status === 'Rejected').length;
      const completed = appointments.filter(a => a.status === 'Completed').length;

      document.getElementById('statTotal').innerText = total;
      document.getElementById('statPending').innerText = pending;
      document.getElementById('statApproved').innerText = approved;
      document.getElementById('statRejected').innerText = rejected;

      document.getElementById('countAll').innerText = total;
      document.getElementById('countPending').innerText = pending;
      document.getElementById('countApproved').innerText = approved;
      document.getElementById('countRejected').innerText = rejected;
      document.getElementById('countCompleted').innerText = completed;
    }

    // RENDER QUICK DASHBOARD TABLE
    function renderQuickListTable() {
      const tbody = document.getElementById('quickListTable');
      tbody.innerHTML = '';
      
      const todayApps = appointments.slice(0, 5); // Take top 5
      todayApps.forEach(app => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/80 transition-colors";
        tr.innerHTML = `
          <td class="py-3.5 font-mono font-bold text-xs text-brandPurple">${app.id}</td>
          <td class="py-3.5">
            <p class="font-mono font-bold text-gray-900">${app.accountNumber}</p>
            <p class="text-[11px] text-gray-500">${app.phone}</p>
          </td>
          <td class="py-3.5 font-semibold text-gray-700">${app.time}</td>
          <td class="py-3.5"><span class="bg-gray-100 text-gray-800 text-xs px-2.5 py-1 rounded-full border border-gray-200">${app.type}</span></td>
          <td class="py-3.5">${getStatusBadge(app.status)}</td>
          <td class="py-3.5 font-bold text-gray-800">${formatPeso(app.amount)}</td>
          <td class="py-3.5">
            ${app.checkNumber
              ? `<span class="font-mono font-bold text-brandPurple">#${app.checkNumber}</span>`
              : `<span class="text-gray-400">N/A</span>`}
          </td>
          <td class="py-3.5 text-right space-x-1">
            <button onclick="openDetailsModal('${app.id}')" class="text-xs font-serif font-bold text-brandPurple hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors">Details</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    // RENDER MAIN APPOINTMENTS TABLE
    function setAppointmentFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.app-filter-btn').forEach(btn => {
        if (btn.innerText.startsWith(filter)) {
          btn.className = "app-filter-btn px-4 py-2 rounded-full text-xs font-serif font-bold transition-all bg-brandPurple text-white";
        } else {
          btn.className = "app-filter-btn px-4 py-2 rounded-full text-xs font-serif font-bold text-gray-600 hover:bg-gray-100 transition-all";
        }
      });
      renderAppointmentsTable();
    }

function renderAppointmentsTable() {
  const tbody = document.getElementById('fullAppointmentsTable');
  const searchQuery = document.getElementById('appointmentSearchInput').value.toLowerCase().trim();
  tbody.innerHTML = '';

  const filtered = appointments.filter(app => {
    const matchesStatus = currentFilter === 'All' || app.status === currentFilter;
    const matchesSearch = app.id.toLowerCase().includes(searchQuery) ||
                          app.accountNumber.toLowerCase().includes(searchQuery) ||
                          app.email.toLowerCase().includes(searchQuery) ||
                          String(app.checkNumber || '').toLowerCase().includes(searchQuery);

    return matchesStatus && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-8 text-center text-gray-400 text-sm font-medium">
          No matching appointments found.
        </td>
      </tr>`;
    return;
  }

  filtered.forEach(app => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition-colors";

    tr.innerHTML = `
      <td class="px-6 py-4 font-mono font-bold text-xs text-brandPurple">${app.id}</td>

      <td class="px-6 py-4">
        <p class="font-mono font-bold text-gray-900">${app.accountNumber}</p>
        <p class="text-xs text-gray-500">${app.email}</p>
      </td>

      <td class="px-6 py-4 text-xs font-medium text-gray-800">
        <div>${app.date}</div>
        <div class="font-bold text-gray-600">${app.time}</div>
      </td>

      <td class="px-6 py-4">
        <span class="bg-gray-100 text-gray-800 text-xs px-2.5 py-1 rounded-full border border-gray-200">
          ${app.type}
        </span>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
        <span class="font-bold text-emerald-700">${formatPeso(app.amount)}</span>
      </td>

      <td class="px-6 py-4 whitespace-nowrap">
        ${app.checkNumber
          ? `<span class="font-mono font-bold text-brandPurple">#${app.checkNumber}</span>`
          : `<span class="text-gray-400">N/A</span>`}
      </td>

      <td class="px-6 py-4">
        ${getStatusBadge(app.status)}
      </td>

      <!-- VIEW BUTTON ONLY -->
      <td class="px-6 py-4 text-right">
        <button
          onclick="openDetailsModal('${app.id}')"
          class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-1.5 rounded-lg transition-colors">
          View
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

    function getStatusBadge(status) {
      if (status === 'Approved') {
        return `<span class="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span><span>Approved</span></span>`;
      } else if (status === 'Pending') {
        return `<span class="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span><span>Pending</span></span>`;
      } else if (status === 'Rejected') {
        return `<span class="inline-flex items-center space-x-1 bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-red-600"></span><span>Rejected</span></span>`;
      } else {
        return `<span class="inline-flex items-center space-x-1 bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span><span>Completed</span></span>`;
      }
    }

    // CONFLICT PREVENTION GUARDRAIL FOR APPROVALS
    function attemptApprove(appId) {
      const target = appointments.find(a => a.id === appId);
      if (!target) return;

      // Check if another APPROVED appointment exists at exact same date & time slot
      const conflict = appointments.find(a => 
        a.id !== appId && 
        a.date === target.date && 
        a.time === target.time && 
        a.status === 'Approved'
      );

      if (conflict) {
        document.getElementById('conflictMessageText').innerText = 
          `Conflict Detected! Account #${conflict.accountNumber} (${conflict.id}) is already APPROVED for ${target.date} at ${target.time}. Multiple approvals for this single counter slot are blocked.`;
        document.getElementById('conflictModal').classList.remove('hidden');
        document.getElementById('conflictModal').classList.add('flex');
        return;
      }

      changeStatus(appId, 'Approved');
    }

    function changeStatus(appId, newStatus) {
      const target = appointments.find(a => a.id === appId);
      if (target) {
        target.status = newStatus;
        updateStatCounters();
        renderQuickListTable();
        renderAppointmentsTable();
        renderCalendar();
        showToast(`Appointment ${appId} marked as ${newStatus}.`, 'success');
      }
    }

    // MODAL HANDLERS
    function openDetailsModal(appId) {
      currentActiveModalAppId = appId;
      const app = appointments.find(a => a.id === appId);
      if (!app) return;

      document.getElementById('detailRefCode').innerText = app.id;
      document.getElementById('detailAccountNumber').innerText = app.accountNumber;
      document.getElementById('detailEmail').innerText = app.email;
      document.getElementById('detailContact').innerText = app.phone;
      document.getElementById('detailDateTime').innerText = `${app.date} at ${app.time}`;
      document.getElementById('detailAmount').innerText = formatPeso(app.amount);

      const checkNumberRow = document.getElementById('detailCheckNumberRow');
      checkNumberRow.classList.toggle('hidden', !app.checkNumber);
      document.getElementById('detailCheckNumber').innerText =
        app.checkNumber ? `#${app.checkNumber}` : '';

      document.getElementById('detailStatusBadge').outerHTML = `<span id="detailStatusBadge">${getStatusBadge(app.status)}</span>`;

      const transContainer = document.getElementById('detailTransactionsList');
      transContainer.innerHTML = '';
      app.transactions.forEach(t => {
        const div = document.createElement('div');
        div.className = "text-gray-900 font-bold";
        div.innerText = `• ${t}`;
        transContainer.appendChild(div);
      });

      // Show actions according to the appointment's current status.
      const actionContainer = document.getElementById('detailActionButtons');
      actionContainer.innerHTML = '';

      const buttonBase = 'w-40 max-w-full flex items-center justify-center text-center px-4 py-2.5 rounded-xl text-xs font-serif font-bold text-white transition-colors shadow-sm';

      if (app.status === 'Pending') {
        actionContainer.innerHTML = `
          <button onclick="updateAppointmentStatusFromModal('Approved')" class="${buttonBase} bg-emerald-600 hover:bg-emerald-700">Approve</button>
          <button onclick="updateAppointmentStatusFromModal('Rejected')" class="${buttonBase} bg-red-600 hover:bg-red-700">Reject</button>
        `;
      } else if (app.status === 'Approved') {
        actionContainer.innerHTML = `
          <button onclick="updateAppointmentStatusFromModal('Pending')" class="${buttonBase} bg-amber-500 hover:bg-amber-600">↩ Undo</button>
          <button onclick="updateAppointmentStatusFromModal('Completed')" class="${buttonBase} bg-slate-700 hover:bg-slate-800">Complete</button>
        `;
      } else if (app.status === 'Rejected') {
        actionContainer.innerHTML = `
          <button onclick="updateAppointmentStatusFromModal('Pending')" class="${buttonBase} bg-amber-500 hover:bg-amber-600">↩ Undo</button>
        `;
      } else if (app.status === 'Completed') {
        actionContainer.innerHTML = `
          <button onclick="updateAppointmentStatusFromModal('Approved')" class="${buttonBase} bg-amber-500 hover:bg-amber-600">↩ Undo (Revert to Approved)</button>
        `;
      }

      document.getElementById('detailsModal').classList.remove('hidden');
      document.getElementById('detailsModal').classList.add('flex');
    }

    function updateAppointmentStatusFromModal(newStatus) {
      if (!currentActiveModalAppId) return;
      if (newStatus === 'Approved') {
        attemptApprove(currentActiveModalAppId);
      } else {
        changeStatus(currentActiveModalAppId, newStatus);
      }
      closeModal('detailsModal');
    }

    function openNewAppointmentModal() {
      const dateInput = document.getElementById('newCustDate');
      dateInput.value = '2026-11-09';
      toggleCheckNumberField();
      document.getElementById('newAppointmentModal').classList.remove('hidden');
      document.getElementById('newAppointmentModal').classList.add('flex');
    }

    function handleCreateManualAppointment(e) {
      e.preventDefault();
      const accNum = document.getElementById('newCustAccNum').value.trim();
      const transactionType = document.getElementById('newCustType').value;
      const amountValue = Number(document.getElementById('newCustAmount').value);
      const checkNumber = transactionType.includes('Check')
        ? document.getElementById('newCustCheckNumber').value.trim()
        : '';

      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        showToast('Please enter a valid transaction amount.', 'error');
        return;
      }

      if (transactionType.includes('Check') && !checkNumber) {
        showToast('Please enter the check number.', 'error');
        return;
      }

      const transactionDescription =
        `${transactionType}: ${formatPeso(amountValue)} (Acc: ${accNum})` +
        (checkNumber ? ` [Check #${checkNumber}]` : '');

      const newApp = {
        id: 'CP-' + Math.floor(10000 + Math.random() * 90000),
        accountNumber: accNum,
        email: document.getElementById('newCustEmail').value.trim(),
        phone: document.getElementById('newCustPhone').value.trim(),
        date: document.getElementById('newCustDate').value,
        time: document.getElementById('newCustTime').value,
        type: transactionType,
        amount: amountValue,
        checkNumber: checkNumber,
        status: 'Pending',
        transactions: [transactionDescription]
      };

      appointments.unshift(newApp);
      updateStatCounters();
      renderQuickListTable();
      renderAppointmentsTable();
      renderCalendar();
      closeModal('newAppointmentModal');
      document.querySelector('#newAppointmentModal form').reset();
      toggleCheckNumberField();
      showToast(`Appointment ${newApp.id} created successfully!`, 'success');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.add('hidden');
      document.getElementById(modalId).classList.remove('flex');
    }

    // CALENDAR GENERATION LOGIC
    function setCalendarView(mode) {
      calendarViewMode = mode;
      ['Month', 'Week', 'Day'].forEach(m => {
        const btn = document.getElementById(`calView${m}`);
        if (m.toLowerCase() === mode) {
          btn.className = "px-4 py-1.5 rounded-full text-xs font-serif font-bold bg-brandPurple text-white transition-all";
        } else {
          btn.className = "px-4 py-1.5 rounded-full text-xs font-serif font-bold text-gray-600 hover:bg-gray-100 transition-all";
        }
      });
      renderCalendar();
    }

    function changeCalendarMonth(delta) {
      calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
      renderCalendar();
    }

    function renderCalendar() {
      const grid = document.getElementById('calendarGrid');
      grid.innerHTML = '';

      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      document.getElementById('calendarMonthLabel').innerText = `${monthNames[calendarCurrentDate.getMonth()]} ${calendarCurrentDate.getFullYear()}`;

      // Render Day headers
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      days.forEach(d => {
        const header = document.createElement('div');
        header.className = "text-center font-serif font-bold text-xs text-gray-500 py-2 border-b border-gray-100";
        header.innerText = d;
        grid.appendChild(header);
      });

      const year = calendarCurrentDate.getFullYear();
      const month = calendarCurrentDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Empty padding cells
      for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "calendar-cell bg-gray-50/50 rounded-2xl border border-gray-100 p-2 opacity-50";
        grid.appendChild(emptyCell);
      }

      // Day cells
      for (let day = 1; day <= daysInMonth; day++) {
        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayApps = appointments.filter(a => a.date === cellDateStr);

        const cell = document.createElement('div');
        cell.className = "calendar-cell bg-white rounded-2xl border border-gray-200 p-2 flex flex-col justify-between hover:shadow-md transition-shadow";

        let appsHtml = '';
        dayApps.forEach(a => {
          let badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
          if (a.status === 'Approved') badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
          if (a.status === 'Rejected') badgeColor = 'bg-red-100 text-red-800 border-red-300';

          appsHtml += `
            <div onclick="openDetailsModal('${a.id}')" class="cursor-pointer text-[10px] p-1 mb-1 rounded-lg border ${badgeColor} truncate font-bold hover:scale-98 transition-transform font-mono">
              ${a.time} - Acc#${a.accountNumber.slice(-4)}
            </div>
          `;
        });

        cell.innerHTML = `
          <div class="flex justify-between items-center mb-1">
            <span class="font-serif font-bold text-xs text-gray-700">${day}</span>
            ${dayApps.length > 0 ? `<span class="text-[9px] font-bold bg-brandPurple text-white px-1.5 py-0.5 rounded-full">${dayApps.length}</span>` : ''}
          </div>
          <div class="overflow-y-auto max-h-16 space-y-1 scrollbar-none">
            ${appsHtml}
          </div>
        `;
        grid.appendChild(cell);
      }
    }
