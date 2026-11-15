
/**
 * appointment.js
 * Handles booking submission and appointment lookup/cancellation.
 * Requests are saved to MySQL through the backend.
 */

let currentLookupAction = 'edit';
let isEditMode = false;

// Live booking status updates for the customer.
let customerStatusWatch = null;
let customerStatusTimer = null;
let customerStatusBusy = false;

function showCustomerStatusNotice(title, message) {
    let notice = document.getElementById('customerStatusNotice');

    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'customerStatusNotice';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        notice.style.cssText =
            'position:fixed;top:20px;right:20px;z-index:99999;' +
            'max-width:min(390px,calc(100vw - 40px));' +
            'padding:18px;border:2px solid #b7d629;' +
            'border-radius:16px;background:white;color:black;' +
            'box-shadow:0 10px 30px #0003;' +
            'font-family:Arial,sans-serif;overflow-wrap:anywhere;';
        document.body.appendChild(notice);
    }

    notice.replaceChildren();

    const heading = document.createElement('strong');
    heading.textContent = title;
    heading.style.display = 'block';

    const details = document.createElement('p');
    details.textContent = message;

    notice.append(heading, details);
}

async function checkCustomerAppointmentStatus() {
    if (!customerStatusWatch || customerStatusBusy || document.hidden) return;

    customerStatusBusy = true;
    const watched = customerStatusWatch;

    try {
        const response = await fetch('/api/appointments/lookup', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            cache: 'no-store',
            body: JSON.stringify({
                reference_number: watched.reference,
                contact: watched.email
            })
        });

        if (!response.ok || watched !== customerStatusWatch) return;

        const data = await response.json();
        const status = data.appointment?.status;

        if (!status || status === watched.status) return;

        watched.status = status;

        const messages = {
            confirmed: [
                'Appointment Approved',
                'Your bank appointment has been approved.'
            ],
            cancelled: [
                'Appointment Cancelled',
                'Your bank appointment has been cancelled.'
            ],
            checked_in: [
                'Customer Checked In',
                'Your arrival has been recorded by the branch.'
            ],
            completed: [
                'Appointment Completed',
                'Your appointment has been marked completed.'
            ],
            no_show: [
                'Appointment Marked No-Show',
                'Your appointment has been marked as a no-show.'
            ]
        };

        const message = messages[status];

        if (message) {
            const title = document.getElementById('modalHeaderTitle');
            const subtitle = document.getElementById('modalHeaderSub');

            if (title) title.textContent = message[0];
            if (subtitle) subtitle.textContent = message[1];

            showCustomerStatusNotice(
                message[0],
                message[1] + ' Reference: ' + watched.reference
            );
        }

        if (['cancelled', 'completed', 'no_show'].includes(status)) {
            clearInterval(customerStatusTimer);
            customerStatusTimer = null;
        }

    } catch (error) {
        console.warn('Customer status check failed:', error.message);
    } finally {
        customerStatusBusy = false;
    }
}

function startCustomerAppointmentWatch(reference, email) {
    clearInterval(customerStatusTimer);

    customerStatusWatch = {
        reference: reference,
        email: email,
        status: 'pending'
    };

    document.getElementById('customerStatusNotice')?.remove();

    customerStatusTimer = setInterval(
        checkCustomerAppointmentStatus,
        3000
    );
}

window.addEventListener('focus', checkCustomerAppointmentStatus);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkCustomerAppointmentStatus();
});


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

  const incomplete = () => {
    alert('Please complete all transaction details.');
    return null;
  };

  if (type === 'Account Service') {
    const service = get('serviceType');
    if (!service) return incomplete();
    return `${type}: ${service}`;
  }

  const holder = get('accountHolder');

  if (
    holder.length < 2 ||
    holder.length > 100 ||
    !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(holder)
  ) {
    alert('Enter a valid account holder or named party name.');
    return null;
  }

  const holderSuffix = ` — Holder: ${holder}`;

  let billRefSuffix = '';

  if (
    type === 'Pay Bills – Cash' ||
    type === 'Pay Bills – Check'
  ) {
    const billRef = get('billRef');

    if (!/^(?=.*[A-Za-z0-9])[A-Za-z0-9-]{4,30}$/.test(billRef)) {
      alert('Enter a valid billing reference (4 to 30 characters).');
      return null;
    }

    billRefSuffix = ` \u2014 Bill Ref: ...${billRef.slice(-4)}`;
  }

  const amtRaw = get('amount');
  if (!amtRaw) return incomplete();

  const amount = Number(amtRaw);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99 || !/^\d+(?:\.\d{1,2})?$/.test(amtRaw)) {
    alert('Please enter a valid transaction amount.');
    return null;
  }

  const acc = get('accNum');
  const accRequired = [
    'Deposit Cash',
    'Deposit Check',
    'Withdraw Cash',
    'Withdraw Check',
    "Manager's Check"
  ].includes(type);

  if (accRequired && !acc) return incomplete();

  if (acc && !/^(?:[0-9]{8}|[0-9]{12})$/.test(acc)) {
    alert('Please enter a valid account number (8 or 12 digits).');
    return null;
  }

  const accText = acc ? ` (Acc: ...${acc.slice(-4)})` : '';

  switch (type) {
    case 'Deposit Cash':
    case 'Withdraw Cash':
      return `${type}: ₱${amount.toFixed(2)}${accText}${holderSuffix}`;

    case 'Deposit Check':
    case 'Withdraw Check': {
      const check = get('checkNum');
      if (!check) return incomplete();
      if (!/^[0-9]{4,12}$/.test(check)) { alert('Check number must contain 4 to 12 digits.'); return null; }
      return `${type}: ₱${amount.toFixed(2)}${accText} [Check #${check}]${holderSuffix}`;
    }

    case "Manager's Check": {
      const payee = get('payee');
      if (!payee) return incomplete();
      return `${type}: ₱${amount.toFixed(2)}${accText} — Payee: ${payee}${holderSuffix}`;
    }

    case 'Pay Bills – Cash': {
      const company = get('company');
      if (!company) return incomplete();
      return `${type}: ₱${amount.toFixed(2)} — ${company}${accText}${billRefSuffix}${holderSuffix}`;
    }

    case 'Pay Bills – Check': {
      const company = get('company');
      const check = get('checkNum');
      if (!company || !check) return incomplete();
      if (!/^[0-9]{4,12}$/.test(check)) { alert('Check number must contain 4 to 12 digits.'); return null; }
      return `${type}: ₱${amount.toFixed(2)} — ${company} [Check #${check}]${billRefSuffix}${holderSuffix}`;
    }
  }

  return incomplete();
}

// Names must exactly match active services in MySQL.
// These represent visit requests, not executed bank transactions.
const BANK_SERVICE_NAMES = Object.freeze({
  'Deposit Cash': 'Cash Deposit',
  'Deposit Check': 'Check Deposit',
  'Withdraw Cash': 'Cash Withdrawal',
  'Withdraw Check': 'Check Withdrawal',
  'Account Service: Savings Account Opening': 'Savings Account Opening',
  'Account Service: Checking Account Opening': 'Checking Account Opening',
  'Account Service: Time Deposit Account Opening': 'Time Deposit Account Opening',
  "Manager's Check": "Manager's Check",
  'Pay Bills – Cash': 'Bill Payment - Cash',
  'Pay Bills – Check': 'Bill Payment - Check'
});

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
  if (
    event.key === 'Escape' &&
    !document.getElementById('bookingWarningModal')?.classList.contains('hidden')
  ) {
    closeBookingWarning();
  }
});

function bookingErrorMessage(raw) {
  const message = String(raw || 'Please try again.');

  if (/appointment must be in the future/i.test(message)) {
    return [
      'Please choose a future appointment time',
      'The selected date or time has already passed. Choose another available date or a later time slot to continue.'
    ];
  }

  if (/unable to load available banking services/i.test(message)) {
    return [
      'Banking services are temporarily unavailable',
      'We could not retrieve the available services. Please try again shortly.'
    ];
  }

  if (/unavailable|fully booked|capacity/i.test(message)) {
    return [
      'Selected slot is unavailable',
      'Please choose another available appointment date or time and try again.'
    ];
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

  if (!match) {
    alert('Please select a valid appointment time.');
    return;
  }

  let hour = Number(match[1]) % 12;
  if (match[3] === 'PM') hour += 12;

  const time = `${String(hour).padStart(2, '0')}:${match[2]}`;

  // Convenience check; backend is still the final authority.
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (dateParts) {
    const selected = new Date(
      Number(dateParts[1]),
      Number(dateParts[2]) - 1,
      Number(dateParts[3]),
      hour,
      Number(match[2])
    );

    if (
      selected.getFullYear() === Number(dateParts[1]) &&
      selected.getMonth() === Number(dateParts[2]) - 1 &&
      selected.getDate() === Number(dateParts[3]) &&
      selected.getTime() <= Date.now()
    ) {
      showBookingWarning(
        'Please choose a future appointment time',
        'The selected date or time has already passed. Choose another available date or a later time slot.'
      );
      return;
    }
  }

  const cards = [...document.getElementById('transactionsContainer').children];

  if (!cards.length) {
    alert('Please add at least one transaction.');
    return;
  }

  const transactions = [];
  const selectedNames = [];

  for (const card of cards) {
    const cardId = card.id.split('_')[1];
    const description = buildTransactionDescription(cardId);

    if (description === null) return;

    const type = document.getElementById(`transType_${cardId}`).value;

    const key = type === 'Account Service'
      ? `Account Service: ${document.getElementById(`serviceType_${cardId}`).value}`
      : type;

    const serviceName = BANK_SERVICE_NAMES[key];

    if (!serviceName) {
      showBookingWarning(
        'Service unavailable',
        `The selected service (${type}) is not configured for booking.`
      );
      return;
    }

    transactions.push(description);
    selectedNames.push(serviceName);
  }

  if (
    selectedNames.length > 10 ||
    transactions.join(' | ').length > 5090
  ) {
    showBookingWarning(
      'Too many transaction details',
      'Please select up to 10 transactions and shorten the transaction details.'
    );
    return;
  }

  button.disabled = true;
  const originalLabel = button.innerText;
  button.innerText = 'Submitting booking...';

  try {
    const servicesResponse = await fetch('/api/services');

    if (!servicesResponse.ok) {
      throw new Error('Unable to load available banking services.');
    }

    const serviceData = await servicesResponse.json();

    const ids = selectedNames.map(name =>
      serviceData.services.find(
        service => service.service_name === name
      )?.service_id
    );

    if (ids.some(id => !id)) {
      throw new Error(
        'One of the selected banking services is unavailable.'
      );
    }

    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone_number: contact,
        appointment_date: date,
        appointment_time: time,
        service_ids: ids,
        customer_notes: transactions.join(' | ')
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Booking failed.');
    }

    const appointment = result.appointment;

    document.getElementById('modalHeaderTitle').innerText =
      'Appointment Confirmed';

    document.getElementById('modalHeaderSub').innerText =
      'Your visit is confirmed. Save your QR code and reference for check-in. If your confirmation email is missing from Inbox, please check Spam/Junk. Email delivery cannot be guaranteed.';

    document.getElementById('modalRefCode').innerText =
      appointment.reference_number;

    document.getElementById('modalEmail').innerText = email;
    document.getElementById('modalContact').innerText = contact;
    document.getElementById('modalDateTime').innerText = `${date} at ${time}`;

    const list = document.getElementById('modalTransactionsList');
    list.replaceChildren();

    transactions.forEach(description => {
      const li = document.createElement('li');
      li.innerText = description;
      list.appendChild(li);
    });

    document.getElementById('successModal').classList.remove('hidden');
    document.getElementById('successModal').classList.add('flex');
    // Show arrival QR immediately; email is an additional delivery channel.
    let qrArea = document.getElementById('compassCustomerArrivalQr');
    if (!qrArea) {
      qrArea = document.createElement('div');
      qrArea.id = 'compassCustomerArrivalQr';
      qrArea.className = 'text-center my-3';
      const modalButton = document.querySelector('#successModal button[onclick="closeSuccessModal()"]');
      if (modalButton) modalButton.before(qrArea);
    }
    qrArea.replaceChildren();
    const qrState = document.createElement('p');
    qrState.textContent = 'Generating your appointment arrival QR…';
    qrArea.appendChild(qrState);
    try {
      const qrResponse = await fetch('/api/appointments/qr', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        cache: 'no-store',
        body: JSON.stringify({
          reference_number: appointment.reference_number,
          contact: email
        })
      });
      const qrData = await qrResponse.json();
      if (!qrResponse.ok || !/^data:image\/png;base64,/.test(qrData.qr_data_url || '')) {
        throw new Error(qrData.message || 'QR unavailable');
      }
      qrArea.replaceChildren();
      const qrImage = document.createElement('img');
      qrImage.src = qrData.qr_data_url;
      qrImage.alt = 'Appointment arrival QR code';
      qrImage.width = 220;
      qrImage.height = 220;
      qrImage.className = 'mx-auto';
      qrArea.appendChild(qrImage);
      const download = document.createElement('a');
      download.href = qrData.qr_data_url;
      download.download = 'compass-appointment-qr.png';
      download.textContent = 'Save QR code';
      download.className = 'inline-block mt-2 font-bold underline text-purple-800';
      qrArea.appendChild(download);
    } catch (qrError) {
      qrState.textContent = 'QR temporarily unavailable. Keep your booking reference and ask branch staff for help.';
    }
    startCustomerAppointmentWatch(appointment.reference_number, email);

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
  document.getElementById('lookupStatusResult')?.remove();

  const title = document.getElementById('lookupModalTitle');
  const submitBtn = document.getElementById('lookupSubmitBtn');

  if (action === 'edit') {
    title.innerText = 'View Appointment Status';
    submitBtn.innerText = 'View Status';
    submitBtn.className =
      'w-1/2 bg-brandPurple hover:bg-brandPurpleHover text-white font-serif font-bold py-3 rounded-full transition-colors text-sm shadow-md';
  } else {
    title.innerText = 'Cancel an Appointment';
    submitBtn.innerText = 'Confirm Cancel';
    submitBtn.className =
      'w-1/2 bg-red-600 hover:bg-red-700 text-white font-serif font-bold py-3 rounded-full transition-colors text-sm shadow-md';
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

  // COMPASS_CUSTOMER_STATUS_LOOKUP_V1
  if (currentLookupAction === 'edit') {
    const reference_number =
      document.getElementById('lookupRef').value.trim();
    const contact =
      document.getElementById('lookupContact').value.trim();
    const button = document.getElementById('lookupSubmitBtn');
    const form = button.closest('form');

    let resultBox = document.getElementById('lookupStatusResult');

    if (!resultBox) {
      resultBox = document.createElement('div');
      resultBox.id = 'lookupStatusResult';
      resultBox.setAttribute('role', 'status');
      resultBox.setAttribute('aria-live', 'polite');
      resultBox.className =
        'mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 space-y-2';
      form.insertAdjacentElement('afterend', resultBox);
    }

    resultBox.replaceChildren();
    resultBox.textContent = 'Retrieving appointment status...';
    button.disabled = true;

    try {
      const response = await fetch('/api/appointments/lookup', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        cache: 'no-store',
        body: JSON.stringify({reference_number, contact})
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'Appointment not found. Check your reference and registered contact.'
            : data.message || 'Unable to retrieve appointment'
        );
      }

      const a = data.appointment;

      if (data.status !== 'ok' ||
          !a ||
          a.reference_number !== reference_number ||
          typeof a.appointment_date !== 'string' ||
          typeof a.appointment_time !== 'string' ||
          typeof a.status !== 'string') {
        throw new Error('Unexpected appointment lookup response');
      }

      const names = {
        pending: 'Pending',
        confirmed: 'Approved',
        checked_in: 'Checked In',
        completed: 'Completed',
        cancelled: 'Cancelled',
        no_show: 'No Show'
      };

      const status = names[a.status];

      if (!status) {
        throw new Error('Unknown appointment status');
      }

      resultBox.replaceChildren();

      function addField(label, value) {
        const row = document.createElement('p');
        const heading = document.createElement('strong');
        heading.textContent = label + ': ';
        row.append(heading, document.createTextNode(value));
        resultBox.appendChild(row);
      }

      addField('Reference', a.reference_number);
      addField('Date', a.appointment_date);
      addField('Time', a.appointment_time);
      addField('Status', status);

      const note = document.createElement('p');
      note.className = 'text-xs text-gray-600 mt-2';
      note.textContent =
        'Read-only appointment details. Editing and rescheduling ' +
        'are not supported. No booking was changed.';
      resultBox.appendChild(note);

    } catch (error) {
      resultBox.replaceChildren();
      resultBox.textContent =
        error.message || 'Unable to retrieve appointment status';
    } finally {
      button.disabled = false;
    }

    return;
  }

  const reference_number =
    document.getElementById('lookupRef').value.trim();

  const contact =
    document.getElementById('lookupContact').value.trim();

  if (!window.confirm('Cancel this appointment? This action cannot be undone.')) {
    return;
  }

  const button = document.getElementById('lookupSubmitBtn');
  button.disabled = true;

  try {
    const response = await fetch('/api/appointments/cancel', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reference_number, contact})
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Cancellation failed');
    }

    alert('Appointment cancelled successfully. Reference: ' + reference_number);
    closeLookupModal();

  } catch (error) {
    alert(error.message || 'Unable to cancel appointment');
  } finally {
    button.disabled = false;
  }
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