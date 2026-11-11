/**
 * appointment.js
 * Handles appointment form submission and the lookup flow for edit/cancel.
 * This is currently a frontend demonstration; it does not save records to a server.
 */

let currentLookupAction = 'edit';
let isEditMode = false;

/**
 * Validates one transaction card and returns its summary text.
 * Returns null (after showing an alert) if anything is missing or invalid.
 */
function buildTransactionDescription(cardId) {
  const typeSelect = document.getElementById(`transType_${cardId}`);
  if (!typeSelect || !typeSelect.value) {
    alert('Please complete all transaction details.');
    return null;
  }

  const type = typeSelect.value;
  const get = name => {
    const el = document.getElementById(`${name}_${cardId}`);
    return el ? el.value.trim() : '';
  };
  const incomplete = () => { alert('Please complete all transaction details.'); return null; };

  // Account Service has no amount or account number
  if (type === 'Account Service') {
    const service = get('serviceType');
    if (!service) return incomplete();
    return `${type}: ${service}`;
  }

  const amtRaw = get('amount');
  if (!amtRaw) return incomplete();
  const amount = Number(amtRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert('Please enter a valid transaction amount.');
    return null;
  }

  const acc = get('accNum');
  const accRequired = ['Deposit Cash', 'Deposit Check', 'Withdraw Cash', 'Withdraw Check', "Manager's Check"].includes(type);
  if (accRequired && !acc) return incomplete();
  if (acc && !/^[0-9]{12}$/.test(acc)) {
    alert('Please enter a valid account number (exactly 12 digits).');
    return null;
  }
  const accText = acc ? ` (Acc: ...${acc.slice(-4)})` : '';

  switch (type) {
    case 'Deposit Cash':
    case 'Withdraw Cash':
      return `${type}: ₱${amount.toFixed(2)}${accText}`;

    case 'Deposit Check':
    case 'Withdraw Check': {
      const check = get('checkNum');
      if (!check) return incomplete();
      return `${type}: ₱${amount.toFixed(2)}${accText} [Check #${check}]`;
    }

    case "Manager's Check": {
      const payee = get('payee');
      if (!payee) return incomplete();
      return `${type}: ₱${amount.toFixed(2)}${accText} — Payee: ${payee}`;
    }

    case 'Pay Bills – Cash': {
      const company = get('company');
      if (!company) return incomplete();
      return `${type}: ₱${amount.toFixed(2)} — ${company}${accText}`;
    }

    case 'Pay Bills – Check': {
      const company = get('company');
      const check = get('checkNum');
      if (!company || !check) return incomplete();
      return `${type}: ₱${amount.toFixed(2)} — ${company} [Check #${check}]`;
    }
  }

  return incomplete();
}

// These are the only service names currently represented by backend service records.
// Other UI transaction types are intentionally blocked until matching services exist.
const BANK_SERVICE_NAMES = {
  'Deposit Cash': 'Cash Deposit',
  'Withdraw Cash': 'Cash Withdrawal',
  'Account Service: Account Inquiry': 'Account Inquiry'
};

// Show a friendly, accessible booking warning instead of a browser alert.
function showBookingWarning(title, message) {
  const modal = document.getElementById('bookingWarningModal');
  const heading = document.getElementById('bookingWarningTitle');
  const detail = document.getElementById('bookingWarningMessage');
  if (!modal || !heading || !detail) {
    alert(`${title}\n\n${message}`);
    return;
  }
  heading.textContent = title;
  detail.textContent = message;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('bookingWarningClose').focus();
}

function closeBookingWarning() {
  const modal = document.getElementById('bookingWarningModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('bookingWarningModal')?.classList.contains('hidden')) {
    closeBookingWarning();
  }
});

function bookingErrorMessage(raw) {
  const message = String(raw || 'Please try again.');
  if (/appointment must be in the future/i.test(message)) {
    return ['Please choose a future appointment time', 'The selected date or time has already passed. Choose another available date or a later time slot to continue.'];
  }
  if (/unable to load available banking services/i.test(message)) {
    return ['Banking services are temporarily unavailable', 'We could not retrieve the available services. Please try again shortly. If this continues, contact the branch.'];
  }
  if (/unavailable|fully booked|capacity/i.test(message)) {
    return ['Selected slot is unavailable', 'Please choose another available appointment date or time and try again.'];
  }
  return ['We could not save your appointment', message];
}

async function handleFormSubmit(event) {
  event.preventDefault();
  if (isEditMode) {
    alert('Editing an existing booking is not yet supported. No changes were saved.');
    return;
  }
  const button = document.getElementById('submitBtn');
  if (button.disabled) return;
  const email = document.getElementById('email').value.trim();
  const contact = document.getElementById('contactNumber').value.trim();
  const fullName = document.getElementById('customerFullName').value.trim();
  const date = document.getElementById('appointmentDate').value;
  const timeLabel = document.getElementById('appointmentTime').value;
  const match = timeLabel.match(/^(\d{1,2}):(\d{2}) (AM|PM)/);
  if (!match) { alert('Please select a valid appointment time.'); return; }
  let hour = Number(match[1]) % 12;
  if (match[3] === 'PM') hour += 12;
  const time = `${String(hour).padStart(2, '0')}:${match[2]}`;

  // Client-side convenience check; the backend remains the final authority.
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (dateParts) {
    const selected = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1,
      Number(dateParts[3]), hour, Number(match[2]));
    if (selected.getFullYear() === Number(dateParts[1]) &&
        selected.getMonth() === Number(dateParts[2]) - 1 &&
        selected.getDate() === Number(dateParts[3]) &&
        selected.getTime() <= Date.now()) {
      showBookingWarning('Please choose a future appointment time',
        'The selected date or time has already passed. Choose another available date or a later time slot to continue.');
      return;
    }
  }


  const cards = [...document.getElementById('transactionsContainer').children];
  if (!cards.length) { alert('Please add at least one transaction.'); return; }
  const transactions = [];
  const selectedNames = [];
  for (const card of cards) {
    const cardId = card.id.split('_')[1];
    const description = buildTransactionDescription(cardId);
    if (description === null) return;
    const type = document.getElementById(`transType_${cardId}`).value;
    const key = type === 'Account Service' ? `Account Service: ${document.getElementById(`serviceType_${cardId}`).value}` : type;
    const serviceName = BANK_SERVICE_NAMES[key];
    if (!serviceName) {
      alert(`The selected service (${type}) is not yet supported by the live booking system. Please choose Cash Deposit or Cash Withdrawal.`);
      return;
    }
    transactions.push(description);
    selectedNames.push(serviceName);
  }
  if (new Set(selectedNames).size !== selectedNames.length) {
    alert('Please select each banking service only once.'); return;
  }

  button.disabled = true;
  const originalLabel = button.innerText;
  button.innerText = 'Submitting booking...';
  try {
    const servicesResponse = await fetch('/api/services');
    if (!servicesResponse.ok) throw new Error('Unable to load available banking services.');
    const serviceData = await servicesResponse.json();
    const ids = selectedNames.map(name => serviceData.services.find(service => service.service_name === name)?.service_id);
    if (ids.some(id => !id)) throw new Error('One of the selected banking services is unavailable.');
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email, phone_number: contact,
        appointment_date: date, appointment_time: time, service_ids: ids,
        customer_notes: transactions.join(' | ').slice(0, 1000) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Booking failed.');
    const appointment = result.appointment;
    document.getElementById('modalHeaderTitle').innerText = 'Appointment Pending Verification';
    document.getElementById('modalHeaderSub').innerText = 'Your booking was saved, but email verification is not yet available. Your appointment is not confirmed.';
    document.getElementById('modalRefCode').innerText = appointment.reference_number;
    document.getElementById('modalEmail').innerText = email;
    document.getElementById('modalContact').innerText = contact;
    document.getElementById('modalDateTime').innerText = `${date} at ${time}`;
    const list = document.getElementById('modalTransactionsList');
    list.replaceChildren();
    transactions.forEach(description => {
      const li = document.createElement('li'); li.innerText = description; list.appendChild(li);
    });
    document.getElementById('successModal').classList.remove('hidden');
    document.getElementById('successModal').classList.add('flex');
  } catch (error) {
    const [title, message] = bookingErrorMessage(error.message);
    showBookingWarning(title, message);
  } finally {
    button.disabled = false;
    button.innerText = originalLabel;
  }
}

function openLookupModal(action) {
  currentLookupAction = action;
  const title = document.getElementById('lookupModalTitle');
  const submitBtn = document.getElementById('lookupSubmitBtn');

  if (action === 'edit') {
    title.innerText = 'Edit an Appointment';
    submitBtn.innerText = 'Retrieve & Edit';
    submitBtn.className = 'w-1/2 bg-brandPurple hover:bg-brandPurpleHover text-white font-serif font-bold py-3 rounded-full transition-colors text-sm shadow-md';
  } else {
    title.innerText = 'Cancel an Appointment';
    submitBtn.innerText = 'Confirm Cancel';
    submitBtn.className = 'w-1/2 bg-red-600 hover:bg-red-700 text-white font-serif font-bold py-3 rounded-full transition-colors text-sm shadow-md';
  }

  document.getElementById('lookupModal').classList.remove('hidden');
  document.getElementById('lookupModal').classList.add('flex');
}

function closeLookupModal() {
  document.getElementById('lookupModal').classList.add('hidden');
  document.getElementById('lookupModal').classList.remove('flex');
}

async function handleLookupSubmit(event) {
  event.preventDefault();
  if (currentLookupAction === 'edit') {
    alert('Appointment editing is not yet supported. No booking was changed.');
    return;
  }
  const reference_number = document.getElementById('lookupRef').value.trim();
  const contact = document.getElementById('lookupContact').value.trim();
  if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return;
  const button = document.getElementById('lookupSubmitBtn');
  button.disabled = true;
  try {
    const response = await fetch('/api/appointments/cancel', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reference_number, contact})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Cancellation failed');
    alert('Appointment cancelled successfully. Reference: ' + reference_number);
    closeLookupModal();
  } catch (error) {
    alert(error.message || 'Unable to cancel appointment');
  } finally { button.disabled = false; }
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.add('hidden');
  document.getElementById('successModal').classList.remove('flex');
  isEditMode = false;
  document.getElementById('appointmentForm').reset();
  document.getElementById('transactionsContainer').innerHTML = '';
  transactionCount = 0;
  addTransactionCard();
  showPage('mainPage');
}