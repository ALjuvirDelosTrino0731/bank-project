// Live employee appointment state loaded from MySQL
    let appointments = [];
    let employeeToken = null;
    const employeeApi = "/api/employee";

    // Non-blocking notifications. Defined globally for login, logout, and status actions.
    function showToast(message, type = 'info') {
      const previous = document.getElementById('compass-toast');
      if (previous) previous.remove();
      const toast = document.createElement('div');
      toast.id = 'compass-toast';
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      toast.textContent = String(message ?? '');
      Object.assign(toast.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        padding: '14px 20px', borderRadius: '10px',
        backgroundColor: type === 'error' ? '#b91c1c' : type === 'success' ? '#166534' : '#374151',
        color: '#fff', zIndex: '99999', fontFamily: 'Arial, sans-serif',
        boxShadow: '0 4px 14px rgba(0,0,0,.22)'
      });
      document.body.appendChild(toast);
      setTimeout(() => { if (toast.isConnected) toast.remove(); }, 3500);
    }
    function safeText(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
    async function refreshEmployeeAppointments() {
      const response = await fetch(employeeApi + "/appointments", {headers:{Authorization:"Bearer " + employeeToken}});
      if (!response.ok) throw new Error("Unable to load appointments ("+response.status+")");
      const data = await response.json();
      appointments = data.appointments.map(a => ({...a, status: ({confirmed:"Approved",pending:"Pending",cancelled:"Cancelled",checked_in:"Checked In",completed:"Completed",no_show:"No Show"})[a.status] || a.status, id:safeText(a.id),email:safeText(a.email),phone:safeText(a.phone),date:safeText(a.date),time:safeText(a.time),type:safeText(a.type),accountNumber:"Masked",amount:a.amount == null ? null : Number(a.amount),transactions:a.transactions.map(safeText)}));
      updateStatCounters();renderQuickListTable();renderAppointmentsTable();renderCalendar();renderAnalyticsCharts();
    }

    let currentFilter = 'All';
    let currentActiveModalAppId = null;
    let calendarCurrentDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let calendarViewMode = 'month';

    // Charts references
    let trafficChartRef = null;
    let forecastByDate = new Map();
    let transactionPieChartRef = null;
    let capacityBarChartRef = null;

    // Format transaction amounts as Philippine pesos.
    function localDateString(date) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
}

function formatPeso(amount) {
  if (amount === null || amount === undefined || amount === "") return "Not provided";
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

    // Model forecasts are demonstrations based on synthetic historical visits.
    async function loadEmployeeForecast() {
      const now = new Date();
      const start = [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
      const until = new Date(now.getFullYear(),now.getMonth(),now.getDate()+30);
      const end = [until.getFullYear(),String(until.getMonth()+1).padStart(2,'0'),String(until.getDate()).padStart(2,'0')].join('-');
      const response = await fetch(`/api/traffic-forecast?start=${start}&end=${end}`);
      if (!response.ok) throw new Error('Forecast service unavailable');
      const data = await response.json();
      forecastByDate = new Map((data.forecasts || []).map(f => [f.date,f]));
      const chosen = forecastByDate.get(start) || (data.forecasts || []).find(f => f.level !== 'closed');
      renderEmployeeForecast(chosen);
      renderAnalyticsCharts();
    }
    function renderEmployeeForecast(f) {
      const banner = document.querySelector('#section-dashboard .bg-brandLime.rounded-3xl');
      if (banner) {
        const tags = banner.querySelectorAll('span');
        const levelTag = [...tags].find(el => el.textContent.includes('FORECAST NOT LOADED') || el.textContent.includes('TRAFFIC EXPECTED') || el.textContent.includes('TRAFFIC') && el.classList.contains('bg-amber-500'));
        if (levelTag) levelTag.textContent = f ? (f.level === 'closed' ? 'BRANCH CLOSED' : f.level.toUpperCase() + ' TRAFFIC') : 'NO FORECAST AVAILABLE';
        const headline = banner.querySelector('h3');
        if (headline) headline.textContent = f ? `${f.date}: ${f.level === 'closed' ? 'Branch closed' : f.expectedVisitors + ' expected visitors'}` : 'No model forecast for selected date';
        const explanation = banner.querySelector('p.text-xs');
        if (explanation) explanation.textContent = 'Synthetic-data Random Forest prediction; not measured branch traffic.';
      }
      const chartEl = document.getElementById('trafficPredictionChart');
      if (!chartEl || typeof Chart === 'undefined') return;
      if (trafficChartRef) trafficChartRef.destroy();
      const hours = f?.hours || [];
      trafficChartRef = new Chart(chartEl, {type:'bar',data:{labels:hours.map(h=>`${h.hour}:00`),datasets:[{label:'Predicted visits (synthetic model)',data:hours.map(h=>h.predicted_visits),backgroundColor:'#8050b0'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});
    }

    // Live analytics: service mix from MySQL appointments; hourly demand from the
    // synthetic-data model. Neither chart represents measured branch arrivals.
    function renderAnalyticsCharts() {
      if (typeof Chart === 'undefined') {
        console.warn('Chart.js unavailable: check internet/CDN access.');
        return;
      }
      const pieEl = document.getElementById('transactionPieChart');
      if (pieEl) {
        if (transactionPieChartRef) transactionPieChartRef.destroy();
        const counts = new Map();
        appointments.filter(a => !['Cancelled','No Show'].includes(a.status)).forEach(a => {
          const items = Array.isArray(a.transactions) && a.transactions.length ? a.transactions : [a.type];
          items.forEach(t => {
            const label = String(t).split(':')[0].trim() || 'Unspecified';
            counts.set(label, (counts.get(label) || 0) + 1);
          });
        });
        const labels = [...counts.keys()];
        transactionPieChartRef = new Chart(pieEl, {
          type:'doughnut',
          data:{labels:labels.length ? labels : ['No upcoming appointments'],
            datasets:[{data:labels.length ? [...counts.values()] : [1],
              backgroundColor:labels.length ? ['#8050b0','#b9cf21','#f59e0b','#10b981','#64748b'] : ['#e5e7eb']}]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},
            tooltip:{enabled:labels.length>0}}}
        });
      }
      const barEl = document.getElementById('capacityBarChart');
      if (barEl) {
        if (capacityBarChartRef) capacityBarChartRef.destroy();
        const today = localDateString(new Date());
        const f = forecastByDate.get(today);
        const hours = f?.hours || [];
        capacityBarChartRef = new Chart(barEl, {
          type:'bar',
          data:{labels:hours.length ? hours.map(h => `${h.hour}:00`) : ['No forecast'],
            datasets:[{label:'Predicted visitors/hour (synthetic model)',
              data:hours.length ? hours.map(h => h.predicted_visits) : [0],backgroundColor:'#8050b0'}]},
          options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}},
            plugins:{legend:{display:true}}}
        });
      }
      renderStaffingGuidance();
    }
    function renderStaffingGuidance() {
      const box = document.getElementById('staffingGuidance');
      if (!box) return;
      const f = forecastByDate.get(localDateString(new Date()));
      const hours = f?.hours || [];
      if (!hours.length) {
        box.textContent = 'No operating-hour forecast for today. No staffing estimate is available.';
        return;
      }
      const peak = [...hours].sort((a,b) => b.predicted_visits-a.predicted_visits)[0];
      box.textContent = `Illustrative planning guidance only: model peak is ${peak.hour}:00–${peak.hour+1}:00 ` +
        `(${peak.predicted_visits} predicted visits). A manager should review staffing; ` +
        `the model does not know actual teller availability or service times.`;
    }
    function initCharts() { renderAnalyticsCharts(); }


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

    async function handleLogin(e) {
      e.preventDefault();
      const passwordInput = document.getElementById('loginPass');
      try {
        const response = await fetch(employeeApi + '/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            username: document.getElementById('loginUser').value.trim(),
            password: passwordInput.value
          })
        });
        const result = await response.json();
        if (!response.ok || !result.token) throw new Error(result.message || 'Login failed');
        employeeToken = result.token;
        passwordInput.value = '';
        await refreshEmployeeAppointments();
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('dashboardView').classList.remove('hidden');
        showToast('Employee appointments loaded from MySQL', 'success');
        // Forecast failure must not log out an otherwise authenticated employee.
        try {
          await loadEmployeeForecast();
          setTimeout(() => { if (trafficChartRef) trafficChartRef.resize(); }, 200);
        } catch (forecastError) {
          console.error('Forecast loading failed:', forecastError);
          showToast('Logged in, but traffic forecast could not be loaded.', 'error');
        }
      } catch (error) {
        employeeToken = null;
        showToast(error.message || 'Unable to log in', 'error');
        console.error('Employee login failed:', error);
      }
    }

    async function handleLogout() {
      if (employeeToken) {try {await fetch(employeeApi+'/logout',{method:'POST',headers:{Authorization:'Bearer '+employeeToken}});}catch(_) {}}
      employeeToken = null;appointments = [];forecastByDate.clear();
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
      if (tabId === 'traffic') setTimeout(renderAnalyticsCharts, 0);
      if (tabId === 'dashboard' && trafficChartRef) setTimeout(() => trafficChartRef.resize(), 0);
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
      const today = localDateString(new Date());
      const total = appointments.filter(a => a.date === today).length;
      const pending = appointments.filter(a => a.status === 'Pending').length;
      const approved = appointments.filter(a => a.status === 'Approved').length;
      const rejected = appointments.filter(a => a.status === 'Cancelled').length;
      const completed = appointments.filter(a => a.status === 'Completed').length;

      document.getElementById('statTotal').innerText = total;
      document.getElementById('statPending').innerText = pending;
      document.getElementById('statApproved').innerText = approved;
      document.getElementById('statRejected').innerText = rejected;

      document.getElementById('countAll').innerText = appointments.length;
      document.getElementById('countPending').innerText = pending;
      document.getElementById('countApproved').innerText = approved;
      document.getElementById('countRejected').innerText = rejected;
      document.getElementById('countCompleted').innerText = completed;
    }

    // RENDER QUICK DASHBOARD TABLE
    function renderQuickListTable() {
      const tbody = document.getElementById('quickListTable');
      tbody.innerHTML = '';
      
      const todayApps = appointments.filter(a => a.date === localDateString(new Date())).slice(0, 5);
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
      } else if (status === 'Cancelled') {
        return `<span class="inline-flex items-center space-x-1 bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-red-600"></span><span>Cancelled</span></span>`;
      } else {
        return `<span class="inline-flex items-center space-x-1 bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-slate-600"></span><span>Completed</span></span>`;
      }
    }

    // CONFLICT PREVENTION GUARDRAIL FOR APPROVALS
    function attemptApprove(appId) { changeStatus(appId, 'Approved'); }
    async function changeStatus(appId, newStatus) {
      const map = {Approved:'confirmed',Cancelled:'cancelled',Completed:'completed','Checked In':'checked_in','No Show':'no_show'};
      if (!map[newStatus]) {showToast('Unsupported status','error');return;}
      try {
        const response = await fetch(employeeApi+'/appointments/'+encodeURIComponent(appId)+'/status',{method:'PATCH',headers:{Authorization:'Bearer '+employeeToken,'Content-Type':'application/json'},body:JSON.stringify({status:map[newStatus]})});
        const data = await response.json();
        if(!response.ok) throw new Error(data.message||'Update failed');
        await refreshEmployeeAppointments();
        await loadEmployeeForecast();
        showToast('Appointment status saved to MySQL','success');
      }catch(e){showToast(e.message,'error');}
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
          <button onclick="updateAppointmentStatusFromModal('Cancelled')" class="${buttonBase} bg-red-600 hover:bg-red-700">Cancel</button>
        `;
      } else if (app.status === 'Approved') {
        actionContainer.innerHTML = `
          <button onclick="updateAppointmentStatusFromModal('Pending')" class="${buttonBase} bg-amber-500 hover:bg-amber-600">↩ Undo</button>
          <button onclick="updateAppointmentStatusFromModal('Completed')" class="${buttonBase} bg-slate-700 hover:bg-slate-800">Complete</button>
        `;
      } else if (app.status === 'Cancelled') {
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
      showToast('Manual appointment creation is disabled until backend validation is connected. Use the customer booking page.','error');
      return;
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

    // Phase 4P: original employee calendar now displays appointments and external experimental traffic together.
    let researchScenarioData = null;
    let researchScenarioAttempted = false;
    let researchScenarioPending = false;
    function loadCalendarResearchScenarios() {
      if (researchScenarioAttempted || researchScenarioPending) return;
      researchScenarioPending = true;
      fetch('/api/research-traffic-scenarios')
        .then(response => { if (!response.ok) throw Error('Research scenarios unavailable'); return response.json(); })
        .then(data => { if (!Array.isArray(data.scenarios)) throw Error('Invalid scenarios'); researchScenarioData=data; })
        .catch(() => { researchScenarioData=null; })
        .finally(() => { researchScenarioPending=false; researchScenarioAttempted=true; renderCalendar(); });
    }
    function setCalendarView(mode) {
      if (!['month','week','day'].includes(mode)) return;
      calendarViewMode=mode;
      ['Month','Week','Day'].forEach(name=>{
        const b=document.getElementById('calView'+name);
        if (!b) return;
        b.className='px-4 py-1.5 rounded-full text-xs font-serif font-bold transition-all '+
          (name.toLowerCase()===mode?'bg-brandPurple text-white':'text-gray-600 hover:bg-gray-100');
      });
      renderCalendar();
    }
    function changeCalendarMonth(delta) {
      if(calendarViewMode==='month') calendarCurrentDate=new Date(calendarCurrentDate.getFullYear(),calendarCurrentDate.getMonth()+delta,1);
      else calendarCurrentDate=new Date(calendarCurrentDate.getFullYear(),calendarCurrentDate.getMonth(),calendarCurrentDate.getDate()+delta*(calendarViewMode==='week'?7:1));
      renderCalendar();
    }
    function renderCalendar() {
      const grid=document.getElementById('calendarGrid'),label=document.getElementById('calendarMonthLabel');
      if (!grid || !label) return;
      loadCalendarResearchScenarios();
      grid.replaceChildren();
      const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const pad=n=>String(n).padStart(2,'0');
      const dateKey=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
      const dateAdd=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
      const toWeekStart=d=>dateAdd(d,-(d.getDay()+6)%7);
      const bank=document.getElementById('adminScenarioBank')?.value || 'first';
      const scenario=d=>researchScenarioData?.scenarios?.find(x=>x.bank===bank&&x.weekday===days[d.getDay()]) || null;
      const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
      const active=a=>a.status!=='Cancelled'&&a.status!=='No Show';
      const y=calendarCurrentDate.getFullYear(),m=calendarCurrentDate.getMonth();
      let dates=[];
      if(calendarViewMode==='month') dates=Array.from({length:new Date(y,m+1,0).getDate()},(_,i)=>new Date(y,m,i+1));
      else if(calendarViewMode==='week'){const start=toWeekStart(calendarCurrentDate);dates=Array.from({length:7},(_,i)=>dateAdd(start,i));}
      else dates=[new Date(y,m,calendarCurrentDate.getDate())];
      label.textContent=calendarViewMode==='month'?calendarCurrentDate.toLocaleDateString('en-US',{month:'long',year:'numeric'}):calendarViewMode==='week'?dates[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+dates[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):dates[0].toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
      const keys=new Set(dates.map(dateKey)),periodApps=appointments.filter(a=>keys.has(a.date)&&active(a)),models=dates.map(scenario).filter(Boolean);
      const modeledTotal=models.reduce((sum,x)=>sum+Number(x.estimated_observed_hours_total||0),0);
      const summary=document.getElementById('adminCalendarSummary');
      if(summary)summary.textContent='Scheduled customers: '+periodApps.length+' (non-cancelled appointments) · Experimental modeled visits: '+
        (models.length?Math.round(modeledTotal).toLocaleString():'Unavailable')+' · '+calendarViewMode+' view. These totals are not combined.';
      if(calendarViewMode==='month'){
        grid.className='grid grid-cols-7 gap-2';
        ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(t=>grid.append(node('div','text-center font-serif font-bold text-xs text-gray-500 py-2',t)));
        for(let i=0;i<dates[0].getDay();i++)grid.append(node('span','admin-cal-empty'));
      }else grid.className='admin-unified-days';
      dates.forEach(d=>{
        const key=dateKey(d),bookings=appointments.filter(a=>a.date===key),count=bookings.filter(active).length,r=scenario(d);
        const cell=node('div','admin-unified-cell');
        const head=node('button','admin-unified-date',calendarViewMode==='month'?String(d.getDate()):d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
        head.type='button';head.title='Show '+d.toDateString()+' appointment hours';
        head.onclick=()=>{calendarCurrentDate=new Date(d);setCalendarView('day');};
        cell.append(head,node('div','admin-unified-booked',count+' scheduled'));
        cell.append(node('small','admin-unified-est',r?Math.round(Number(r.estimated_observed_hours_total)).toLocaleString()+' experimental visits · '+String(r.traffic_level).toUpperCase():'Traffic not modeled'));
        if(calendarViewMode==='day'){
          const hours=node('div','admin-unified-hours');
          for(let h=9;h<17;h++){
            const slotStart=pad(h)+':00',next=pad(h+1)+':00';
            const slotApps=bookings.filter(a=>String(a.time).slice(0,2)===pad(h));
            const forecast=r?.observed_hours?.find(item=>item.hour_start===slotStart);
            const row=node('div','admin-unified-hour');
            row.append(node('strong','',slotStart+'–'+next));
            row.append(node('span','',slotApps.filter(active).length+' scheduled'));
            row.append(node('small','',forecast?Math.round(Number(forecast.estimated_customers))+' experimental visits':'Not modeled'));
            slotApps.forEach(a=>{const b=node('button','admin-unified-app',a.time+' · '+a.status+' · '+a.type);b.type='button';b.onclick=()=>openDetailsModal(a.id);row.append(b);});
            hours.append(row);
          }
          cell.append(hours);
        } else if(calendarViewMode==='week') {
          bookings.slice(0,8).forEach(a=>{const b=node('button','admin-unified-app',a.time+' · '+a.status);b.type='button';b.onclick=()=>openDetailsModal(a.id);cell.append(b)});
          if(bookings.length>8)cell.append(node('small','','+'+(bookings.length-8)+' more appointments'));
        } else if(bookings.length) {
          const b=node('button','admin-unified-app','View '+bookings.length+' appointment'+(bookings.length===1?'':'s'));
          b.type='button';b.onclick=()=>{calendarCurrentDate=new Date(d);setCalendarView('day');};cell.append(b);
        }
        grid.append(cell);
      });
    }
