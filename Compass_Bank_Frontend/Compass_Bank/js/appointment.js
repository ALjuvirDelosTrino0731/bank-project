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

function handleFormSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const contact = document.getElementById('contactNumber').value.trim();
  const date = document.getElementById('appointmentDate').value;
  const time = document.getElementById('appointmentTime').value;

  const container = document.getElementById('transactionsContainer');
  const cardNodes = container.children;
  const transactions = [];

  if (cardNodes.length === 0) {
    alert('Please add at least one transaction.');
    return;
  }

  for (let i = 0; i < cardNodes.length; i++) {
    const cardId = cardNodes[i].id.split('_')[1];
    const description = buildTransactionDescription(cardId);
    if (description === null) return;
    transactions.push(description);
  }

  const randomRef = 'CP-' + Math.floor(10000 + Math.random() * 90000);

  document.getElementById('modalHeaderTitle').innerText = isEditMode ? 'Appointment Updated!' : 'Appointment Reserved!';
  document.getElementById('modalHeaderSub').innerText = 'Your reservation code and details are shown below.';
  document.getElementById('modalRefCode').innerText = randomRef;
  document.getElementById('modalEmail').innerText = email;
  document.getElementById('modalContact').innerText = contact;
  document.getElementById('modalDateTime').innerText = `${date} at ${time}`;

  const listContainer = document.getElementById('modalTransactionsList');
  listContainer.innerHTML = '';
  transactions.forEach(description => {
    const li = document.createElement('li');
    li.innerText = description;
    listContainer.appendChild(li);
  });

  document.getElementById('successModal').classList.remove('hidden');
  document.getElementById('successModal').classList.add('flex');
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

function handleLookupSubmit(event) {
  event.preventDefault();

  const refCode = document.getElementById('lookupRef').value.trim();
  const contact = document.getElementById('lookupContact').value.trim();

  closeLookupModal();

  if (currentLookupAction === 'edit') {
    isEditMode = true;
    document.getElementById('email').value = contact.includes('@') ? contact : '';
    document.getElementById('contactNumber').value = contact.includes('@') ? '' : contact;
    document.getElementById('submitBtn').innerText = 'Update Appointment Details';
    showPage('appointmentFormPage');
  } else {
    document.getElementById('modalHeaderTitle').innerText = 'Appointment Cancelled';
    document.getElementById('modalHeaderSub').innerText = 'Demo cancellation message. No appointment record was actually deleted.';
    document.getElementById('modalRefCode').innerText = refCode.toUpperCase();
    document.getElementById('modalEmail').innerText = contact.includes('@') ? contact : 'Not provided';
    document.getElementById('modalContact').innerText = contact.includes('@') ? 'Not provided' : contact;
    document.getElementById('modalDateTime').innerText = 'Cancelled';

    const listContainer = document.getElementById('modalTransactionsList');
    listContainer.innerHTML = '<li class="text-red-600 font-semibold">Demo only — no appointment slot was changed.</li>';

    document.getElementById('successModal').classList.remove('hidden');
    document.getElementById('successModal').classList.add('flex');
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