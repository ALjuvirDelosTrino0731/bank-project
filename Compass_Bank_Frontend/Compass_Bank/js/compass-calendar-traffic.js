/* Compass Bank calendar-integrated simulated traffic (research-only).
 * Uses real booking availability to identify selectable days. Traffic labels
 * come from the existing experimental /api/research-demo/forecast model.
 * Hour scores are smoothed frequencies from simulated training records,
 * under an expressly UNVERIFIED slot-number -> banking-hour assumption.
 */
(() => {
  'use strict';
  const calendar = document.getElementById('trafficCalendar');
  const hours = document.getElementById('bookingDayHours');
  const dateInput = document.getElementById('appointmentDate');
  if (!calendar || !hours || !dateInput) return;

  const forecastCache = new Map();
  const availabilityCache = new Map();
  let riskData = null;
  let refreshNumber = 0;

  function addLegend() {
    const panel = calendar.closest('.traffic-panel');
    if (!panel || document.getElementById('compass-traffic-legend')) return;
    const el = document.createElement('div');
    el.id = 'compass-traffic-legend';
    el.className = 'comp-traffic-legend';
    el.innerHTML = `
      <strong>Simulated traffic predictions</strong>
      <div class="comp-traffic-colors" aria-label="Predicted traffic categories">
        <span><i class="comp-dot comp-low"></i>Low</span>
        <span><i class="comp-dot comp-moderate"></i>Moderate</span>
        <span><i class="comp-dot comp-high"></i>High</span>
        <span><i class="comp-dot comp-unavailable"></i>Unavailable</span>
      </div>
      <p>Colored days indicate research estimates only. Weekend, branch-closed,
      fully booked, and outside-window dates are not selectable. Your booking
      is checked against live appointment availability.</p>`;
    panel.insertBefore(el, calendar);
  }

  async function getAvailability(date) {
    const cached = availabilityCache.get(date);
    if (cached && Date.now() - cached.at < 12000) return cached.value;
    const response = await fetch('/api/booking-availability?date=' + encodeURIComponent(date), {cache:'no-store'});
    if (!response.ok) throw new Error('Booking availability request failed');
    const data = await response.json();
    if (data.status !== 'ok' || data.date !== date || !Array.isArray(data.available_slots)) {
      throw new Error('Booking availability response is incomplete');
    }
    availabilityCache.set(date,{at:Date.now(),value:data});
    return data;
  }

  async function getForecast(date) {
    if (!forecastCache.has(date)) {
      const req = fetch('/api/research-demo/forecast?date=' + encodeURIComponent(date), {cache:'no-store'})
        .then(async response => {
          if (!response.ok) throw new Error('Forecast server error');
          const data = await response.json();
          if (data.status !== 'ok' || !['Low','Moderate','High'].includes(data.traffic_category)) {
            throw new Error('Forecast unavailable');
          }
          return data;
        })
        .catch(error => {forecastCache.delete(date); throw error;});
      forecastCache.set(date,req);
    }
    return forecastCache.get(date);
  }

  function setDateUnavailable(button, text) {
    if (!button.isConnected) return;
    button.disabled = true;
    button.classList.remove('comp-traffic-low','comp-traffic-moderate','comp-traffic-high');
    button.classList.add('unified-cal-unbookable');
    const info = button.querySelector('.unified-cal-count');
    if (info) info.textContent = text;
    button.title = 'Booking unavailable for this date';
  }

  async function decorateDate(button, currentRun) {
    const date = button.dataset.compassDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || button.classList.contains('unified-cal-unbookable')) return;
    const info = button.querySelector('.unified-cal-count');
    if (info) info.textContent = 'Checking...';
    try {
      const availability = await getAvailability(date);
      if (currentRun !== refreshNumber || !button.isConnected || button.dataset.compassDate !== date) return;
      const slots = availability.available_slots;
      if (!slots.some(slot => Number(slot.remaining_capacity) > 0)) {
        if (/booking is currently disabled/i.test(availability.message || '')) {
          // The staging database intentionally disables customer bookings.
          // Show a clearly labelled research preview, not fake open slots.
          setDateUnavailable(button, 'Staging: bookings paused');
          try {
            const forecast = await getForecast(date);
            if (currentRun !== refreshNumber || !button.isConnected ||
                button.dataset.compassDate !== date) return;
            const category = forecast.traffic_category;
            button.classList.add('comp-traffic-' + category.toLowerCase());
            if (info) info.textContent = category + ' (simulated; bookings paused)';
            button.title = 'Research-only simulated traffic; appointment bookings are disabled in staging.';
          } catch (_) {
            // Keep the truthful disabled label even when forecasting is unavailable.
          }
        } else {
          setDateUnavailable(button,
            availability.message && /clos/i.test(availability.message) ? 'Closed' : 'No open slots');
        }
        return;
      }
      const forecast = await getForecast(date);
      if (currentRun !== refreshNumber || !button.isConnected || button.dataset.compassDate !== date) return;
      const category = forecast.traffic_category;
      button.classList.add('comp-traffic-' + category.toLowerCase());
      if (info) info.textContent = category + ' traffic';
      button.setAttribute('aria-label',date + ': simulated ' + category + ' traffic; selectable appointment date');
      button.title = 'Simulated ' + category + ' traffic. Check day view for available hours.';
    } catch (error) {
      if (currentRun !== refreshNumber || !button.isConnected) return;
      if (info) info.textContent = 'Estimate unavailable';
      button.title = 'Appointment selection remains available; research prediction could not be loaded';
    }
  }

  function decorateDates() {
    addLegend();
    const run = ++refreshNumber;
    for (const button of calendar.querySelectorAll('.unified-cal-date[data-compass-date]')) {
      if (button.classList.contains('unified-cal-unbookable')) {
        button.disabled = true;
        continue;
      }
      decorateDate(button,run);
    }
  }

  function getRisk(date, slot) {
    if (!riskData || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
    const dt = new Date(date + 'T00:00:00Z');
    const month = dt.getUTCMonth() + 1;
    const weekday = dt.getUTCDay();
    const n = riskData.percentages?.[month + '-' + weekday + '-' + slot];
    return typeof n === 'number' && Number.isFinite(n) ? Math.min(100,Math.max(0,n)) : null;
  }

  function decorateHours(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    const dayButtons = Array.from(hours.querySelectorAll('.unified-cal-hour[data-compass-slot]:not(:disabled)'));
    if (!dayButtons.length) return;
    for (const button of dayButtons) {
      const slot = Number(button.dataset.compassSlot);
      const probability = getRisk(date,slot);
      if (probability === null) continue;
      let badge = button.querySelector('.comp-hour-risk');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'comp-hour-risk';
        button.appendChild(badge);
      }
      badge.textContent = 'Simulated high-traffic chance: ' + probability + '%*';
      badge.title = 'Illustrative chance within simulated training records; the slot-to-hour mapping is not verified.';
    }
    if (!hours.querySelector('#comp-hour-risk-note')) {
      const note = document.createElement('p');
      note.id = 'comp-hour-risk-note';
      note.className = 'unified-cal-help comp-hour-disclaimer';
      note.textContent = '*Research illustration only: percent estimates the chance of a count in the top third of simulated training-slot counts, assuming numbered slots correspond in order to the eight appointment hours. Original source clock times are NOT verified. This is NOT a validated probability for real bank traffic or customer waiting time.';
      hours.appendChild(note);
    }
  }

  window.addEventListener('compass:calendar-rendered',decorateDates);
  window.addEventListener('compass:hours-loaded',event=>decorateHours(event.detail?.date));
  const riskLoad = fetch('/customer/js/compass-traffic-risk.json', {cache:'no-store'})
    .then(r=>r.ok?r.json():Promise.reject(new Error('Risk data unavailable')))
    .then(data=>{riskData=data;decorateHours(dateInput.value);})
    .catch(()=>{console.warn('Simulated hourly likelihoods unavailable; appointment booking still works.');});

  addLegend();
  decorateDates();
  void riskLoad;
})();