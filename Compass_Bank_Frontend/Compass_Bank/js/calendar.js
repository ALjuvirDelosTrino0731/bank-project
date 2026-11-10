/**
 * calendar.js
 * Rolling 14-day appointment calendar with a bank traffic forecast.
 *
 * - The selectable window is always calculated from the current date
 *   (today through today + 13 days) using JavaScript's Date object.
 * - Everything outside the window (past dates and dates beyond 14 days) is disabled.
 * - The selected date is stored in the existing #appointmentDate field
 *   (value format YYYY-MM-DD), so appointment.js keeps working unchanged.
 *
 * Traffic data comes from a "forecast provider": a function that receives the
 * first and last date of the window (YYYY-MM-DD) and returns a Promise of
 *   { 'YYYY-MM-DD': { expectedVisitors: 142 }, ... }
 * An entry may also include level: 'low' | 'moderate' | 'high'; if it does not,
 * the level is derived from expectedVisitors using TRAFFIC_THRESHOLDS.
 *
 * The built-in provider generates SAMPLE data for demonstration only.
 * To connect a real prediction model later, call:
 *   CompassCalendar.setForecastProvider(async (startISO, endISO) => { ... });
 */
(function () {
  'use strict';

  /* ---------- Configuration ---------- */

  const WINDOW_DAYS = 14;

  // expectedVisitors below `moderate` = low, below `high` = moderate, otherwise high.
  const TRAFFIC_THRESHOLDS = { moderate: 120, high: 180 };

  const TRAFFIC_LEVELS = {
    low: {
      label: 'Low Traffic',
      message: 'Fewer customers are expected on this day. This is the recommended time to visit.'
    },
    moderate: {
      label: 'Moderate Traffic',
      message: 'An average number of customers are expected on this day.'
    },
    high: {
      label: 'High Traffic',
      message: 'More customers are expected on this day, and longer waiting times may occur.'
    }
  };

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- Date helpers (local time, no hardcoded dates) ---------- */

  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function fromISO(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monthIndex = d => d.getFullYear() * 12 + d.getMonth();

  /** First and last selectable dates, recalculated from today on every call. */
  function getWindow() {
    const start = startOfToday();
    return { start, end: addDays(start, WINDOW_DAYS - 1) };
  }

  function isInWindow(iso) {
    const d = fromISO(iso);
    if (!d) return false;
    const { start, end } = getWindow();
    return d >= start && d <= end;
  }

  const formatLong = d => d.toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const formatShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  /* ---------- Traffic forecast ---------- */

  function levelFromVisitors(visitors) {
    if (visitors >= TRAFFIC_THRESHOLDS.high) return 'high';
    if (visitors >= TRAFFIC_THRESHOLDS.moderate) return 'moderate';
    return 'low';
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /**
   * SAMPLE DATA ONLY. Produces stable, plausible numbers for each date
   * (busier Mondays/Fridays and around paydays) until a real model is connected.
   */
  function sampleForecastProvider(startISO, endISO) {
    const baseByWeekday = [60, 170, 120, 105, 130, 185, 140]; // Sun..Sat
    const result = {};

    for (let d = fromISO(startISO); d && toISO(d) <= endISO; d = addDays(d, 1)) {
      const iso = toISO(d);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const isPayday = d.getDate() === 15 || d.getDate() === 30 || d.getDate() === lastDay;
      const noise = (hashString(iso) % 41) - 20;
      result[iso] = { expectedVisitors: baseByWeekday[d.getDay()] + (isPayday ? 55 : 0) + noise };
    }
    return Promise.resolve(result);
  }

  /* ---------- State ---------- */

  let forecastProvider = sampleForecastProvider;
  let forecasts = {};
  let selectedISO = '';
  let viewYear = 0;
  let viewMonth = 0;
  let renderedForISO = '';
  let loadToken = 0;

  let rootEl = null;
  let inputEl = null;
  let messageEl = null;

  function getForecast(iso) {
    const entry = forecasts[iso];
    if (!entry) return null;
    const visitors = Number(entry.expectedVisitors);
    const level = TRAFFIC_LEVELS[entry.level] ? entry.level
      : (Number.isFinite(visitors) ? levelFromVisitors(visitors) : null);
    if (!level) return null;
    return { level, visitors: Number.isFinite(visitors) ? Math.round(visitors) : null };
  }

  /* ---------- Rendering ---------- */

  function clampView() {
    const { start, end } = getWindow();
    const idx = viewYear * 12 + viewMonth;
    const clamped = Math.min(Math.max(idx, monthIndex(start)), monthIndex(end));
    viewYear = Math.floor(clamped / 12);
    viewMonth = clamped % 12;
  }

  function dayAriaLabel(d, forecast) {
    let text = formatLong(d);
    if (forecast) {
      text += `. ${TRAFFIC_LEVELS[forecast.level].label}`;
      if (forecast.visitors !== null) text += `, about ${forecast.visitors} customers expected`;
    }
    return text;
  }

  function render() {
    if (!rootEl) return;
    clampView();

    const { start, end } = getWindow();
    renderedForISO = toISO(start);

    const idx = viewYear * 12 + viewMonth;
    const prevDisabled = idx <= monthIndex(start);
    const nextDisabled = idx >= monthIndex(end);
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    let html = `
      <div class="cal-header">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month" ${prevDisabled ? 'disabled' : ''}>&#8249;</button>
        <div class="cal-title" aria-live="polite">${MONTH_NAMES[viewMonth]} ${viewYear}</div>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Next month" ${nextDisabled ? 'disabled' : ''}>&#8250;</button>
      </div>
      <p class="cal-note">Appointments can be booked from ${formatShort(start)} to ${formatShort(end)} (next ${WINDOW_DAYS} days).</p>
      <div class="cal-grid" role="presentation">
        ${WEEKDAY_SHORT.map(w => `<div class="cal-weekday">${w}</div>`).join('')}
    `;

    for (let i = 0; i < firstWeekday; i++) html += '<span class="cal-empty"></span>';

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      const iso = toISO(d);
      const available = d >= start && d <= end;

      if (!available) {
        html += `<button type="button" class="cal-day" disabled aria-label="${formatLong(d)}, not available">
          <span class="cal-day-num">${day}</span></button>`;
        continue;
      }

      const forecast = getForecast(iso);
      const classes = ['cal-day'];
      if (forecast) classes.push(forecast.level);
      if (iso === selectedISO) classes.push('selected');

      html += `<button type="button" class="${classes.join(' ')}" data-date="${iso}"
        aria-label="${dayAriaLabel(d, forecast)}" aria-pressed="${iso === selectedISO}">
        <span class="cal-day-num">${day}</span>
        ${forecast ? `<span class="cal-day-meta"><i class="cal-dot"></i>${forecast.visitors !== null ? `<span>${forecast.visitors}</span>` : ''}</span>` : ''}
      </button>`;
    }

    html += '</div>';
    rootEl.innerHTML = html;
  }

  function updateMessage() {
    if (!messageEl) return;

    const d = fromISO(selectedISO);
    if (!d) {
      messageEl.className = 'traffic-message';
      messageEl.textContent = 'Select a date to see the expected bank traffic.';
      return;
    }

    const forecast = getForecast(selectedISO);
    if (!forecast) {
      messageEl.className = 'traffic-message';
      messageEl.textContent = `${formatLong(d)}: traffic forecast is not available for this date.`;
      return;
    }

    const info = TRAFFIC_LEVELS[forecast.level];
    const count = forecast.visitors !== null ? ` About ${forecast.visitors} customers expected.` : '';
    messageEl.className = `traffic-message ${forecast.level}`;
    messageEl.innerHTML = `<span class="traffic-message-date">${formatLong(d)}</span>
      <strong>${info.label}</strong> – ${info.message}${count}`;
  }

  /* ---------- Selection ---------- */

  function syncFromInput() {
    const value = inputEl ? inputEl.value : '';
    selectedISO = isInWindow(value) ? value : '';
    if (inputEl && !selectedISO) inputEl.value = '';
    const d = fromISO(selectedISO);
    if (d) { viewYear = d.getFullYear(); viewMonth = d.getMonth(); }
  }

  function selectDate(iso) {
    if (!isInWindow(iso)) return;
    selectedISO = iso;
    inputEl.value = iso;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    render();
    updateMessage();

    const btn = rootEl.querySelector(`[data-date="${iso}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  function changeMonth(delta) {
    const idx = viewYear * 12 + viewMonth + delta;
    viewYear = Math.floor(idx / 12);
    viewMonth = idx % 12;
    render();
    const nav = rootEl.querySelector(`[data-nav="${delta}"]:not(:disabled)`)
      || rootEl.querySelector('.cal-day:not(:disabled)');
    if (nav) nav.focus({ preventScroll: true });
  }

  /** Recalculates the window from today's date and reloads the forecast. */
  async function refresh() {
    const { start, end } = getWindow();
    const token = ++loadToken;

    let data = {};
    try {
      data = (await forecastProvider(toISO(start), toISO(end))) || {};
    } catch (err) {
      console.error('Traffic forecast could not be loaded:', err);
    }
    if (token !== loadToken) return; // a newer refresh superseded this one

    forecasts = data;
    syncFromInput();
    render();
    updateMessage();
  }

  /* ---------- Setup ---------- */

  function scheduleMidnightRefresh() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    setTimeout(() => { refresh(); scheduleMidnightRefresh(); }, nextMidnight - now);
  }

  function init() {
    rootEl = document.getElementById('trafficCalendar');
    inputEl = document.getElementById('appointmentDate');
    messageEl = document.getElementById('trafficMessage');
    if (!rootEl || !inputEl) return;

    rootEl.addEventListener('click', event => {
      const dayBtn = event.target.closest('[data-date]');
      if (dayBtn && !dayBtn.disabled) { selectDate(dayBtn.dataset.date); return; }

      const navBtn = event.target.closest('[data-nav]');
      if (navBtn && !navBtn.disabled) changeMonth(Number(navBtn.dataset.nav));
    });

    // Form reset (e.g. after a booking) clears the field; keep the calendar in step.
    const form = inputEl.form;
    if (form) form.addEventListener('reset', () => setTimeout(() => {
      syncFromInput(); render(); updateMessage();
    }, 0));

    // If the page stays open past midnight, move the window forward.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && toISO(startOfToday()) !== renderedForISO) refresh();
    });
    scheduleMidnightRefresh();

    const today = startOfToday();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    syncFromInput();
    render();
    updateMessage();
    refresh();
  }

  window.CompassCalendar = {
    refresh,
    getWindow,
    setForecastProvider(provider) {
      if (typeof provider === 'function') { forecastProvider = provider; refresh(); }
    },
    sampleForecastProvider
  };

  window.addEventListener('DOMContentLoaded', init);
})();