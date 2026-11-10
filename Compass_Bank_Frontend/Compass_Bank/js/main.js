/**
 * main.js
 * Initializes the page and controls the main view navigation.
 */

function showPage(pageId) {
  document.getElementById('mainPage').classList.add('hidden');
  document.getElementById('appointmentFormPage').classList.add('hidden');
  document.getElementById(pageId).classList.remove('hidden');

  if (pageId === 'appointmentFormPage' && !isEditMode) {
    document.getElementById('submitBtn').innerText = 'Confirm Appointment Reservation';
  }
}

// Fields marked data-digits-only accept numbers only (typing and pasting).
document.addEventListener('input', function (event) {
  const el = event.target;
  if (el.matches && el.matches('[data-digits-only]')) {
    const digits = el.value.replace(/\D/g, '');
    if (el.value !== digits) el.value = digits;
  }
});

// Email: only the part before @ is typed; "@gmail.com" is added automatically.
function applyGmailFormat(el, event) {
  const raw = el.value;
  const local = raw.split('@')[0].replace(/[^A-Za-z0-9._%+\-]/g, '');
  const next = local ? local + '@gmail.com' : '';
  if (raw === next) return;

  const typedAt = event && event.data === '@';
  const trailingText = next && raw.startsWith(next);   // typed after the fixed "@gmail.com"
  const caret = el.selectionStart == null ? local.length : el.selectionStart;
  const pos = (typedAt || trailingText) ? next.length : Math.min(caret, local.length);

  el.value = next;
  el.setSelectionRange(pos, pos);
}

// Contact number: digits only, always starts with 09, max 11 digits.
function applyPhone09(el) {
  let digits = el.value.replace(/\D/g, '');
  if (digits && digits[0] !== '0') digits = '0' + digits;   // typing 9 becomes 09
  if (digits.length >= 2 && digits[1] !== '9') digits = '0'; // second digit must be 9
  digits = digits.slice(0, 11);
  if (el.value !== digits) el.value = digits;
}

document.addEventListener('input', function (event) {
  const el = event.target;
  if (!el.matches) return;
  if (el.matches('[data-gmail-only]')) applyGmailFormat(el, event);
  if (el.matches('[data-phone-09]')) applyPhone09(el);
});

// Show the locked "09" start when the contact number field is focused.
document.addEventListener('focusin', function (event) {
  const el = event.target;
  if (el.matches && el.matches('[data-phone-09]') && !el.value) el.value = '09';
});
document.addEventListener('focusout', function (event) {
  const el = event.target;
  if (el.matches && el.matches('[data-phone-09]') && (el.value === '09' || el.value === '0')) el.value = '';
});

window.addEventListener('DOMContentLoaded', function () {
  const today = new Date();
  const dateInput = document.getElementById('appointmentDate');
  const timeInput = document.getElementById('appointmentTime');

  if (dateInput) {
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
    dateInput.min = localToday;

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
  }

  if (timeInput) timeInput.value = '10:00 AM – 11:00 AM';

  addTransactionCard();
});