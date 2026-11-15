/**
 * transactions.js
 * Handles adding, removing, and displaying dynamic transaction fields.
 */

let transactionCount = 0;

/* Shared markup for one label + input row (same classes as before). */
function fieldRow(label, forId, inputHtml) {
  return `
    <div class="grid grid-cols-1 sm:grid-cols-12 items-center gap-2 sm:gap-4">
      <label for="${forId}" class="sm:col-span-5 font-serif font-bold text-base md:text-lg text-black">${label}</label>
      <div class="sm:col-span-7 ${inputHtml.includes('₱') ? 'relative' : ''}">${inputHtml}</div>
    </div>`;
}

function textInput(inputId, placeholder, required, extra) {
  return `<input type="text" id="${inputId}" ${required ? 'required' : ''} placeholder="${placeholder}" ${extra || ''}
    class="pill-input w-full bg-white text-gray-800 px-5 py-3 text-base border-none font-sans font-medium">`;
}

function accountField(id, required) {
  return fieldRow(
    required ? 'Account Number:' : 'Account Number (if applicable):',
    `accNum_${id}`,
    textInput(`accNum_${id}`, 'e.g. 123456789012', required, 'inputmode="numeric" maxlength="12" pattern="(?:[0-9]{8}|[0-9]{12})" data-digits-only title="Account number must contain 8 or 12 digits"')
  );
}

function limitTransactionAmount(input) {
  const cleaned = input.value.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  const digits = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const whole = digits.replace(/^0+(?=[0-9])/, '').slice(0, 9);
  const decimals = dot === -1
    ? ''
    : cleaned.slice(dot + 1).replace(/[.]/g, '').slice(0, 2);

  input.value = dot === -1
    ? whole
    : `${whole || '0'}.${decimals}`;
}
function amountField(id, label) {
  return fieldRow(
    label,
    `amount_${id}`,
    `<span class="absolute left-4 top-3 text-gray-500 font-bold">₱</span>
     <input type="text" id="amount_${id}" required inputmode="decimal" maxlength="12" pattern="(?:0|[1-9][0-9]{0,8})(?:[.][0-9]{1,2})?" oninput="limitTransactionAmount(this)" placeholder="0.00"
       class="pill-input w-full bg-white text-gray-800 pl-9 pr-5 py-3 text-base border-none font-sans font-medium">`
  );
}

function checkNumberField(id) {
  return fieldRow('Check Number:', `checkNum_${id}`, textInput(`checkNum_${id}`, 'e.g. 12345678', true, 'inputmode="numeric" minlength="4" maxlength="12" pattern="[0-9]{4,12}" oninput="this.value=this.value.replace(/[^0-9]/g, String()).slice(0, 12)" title="Enter 4 to 12 digits"'));
}

const MAX_BOOKING_TRANSACTIONS = 10;

function updateTransactionButton() {
  const container = document.getElementById('transactionsContainer');
  const button = document.querySelector('button[onclick="addTransactionCard()"]');

  if (!container || !button) return;

  const full = container.children.length >= MAX_BOOKING_TRANSACTIONS;

  button.disabled = full;
  button.style.opacity = full ? '0.5' : '1';
  button.style.cursor = full ? 'not-allowed' : 'pointer';
  button.title = full ? 'Maximum of 10 transactions per appointment' : '';
}
function addTransactionCard() {
  const existing = document.getElementById('transactionsContainer');
  if (existing.children.length >= MAX_BOOKING_TRANSACTIONS) return;
  transactionCount++;
  const id = transactionCount;
  const container = document.getElementById('transactionsContainer');
  const card = document.createElement('div');

  card.id = `transactionCard_${id}`;
  card.className = "bg-brandLime rounded-3xl p-6 md:p-8 card-shadow space-y-5 relative transition-all duration-300";

  const showDeleteBtn = container.children.length > 0;

  card.innerHTML = `
    ${showDeleteBtn ? `
      <button type="button" onclick="removeTransactionCard(${id})" title="Remove transaction"
        class="absolute top-4 right-4 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow transition-colors">✕</button>
    ` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-12 items-center gap-2 sm:gap-4">
      <label for="transType_${id}" class="sm:col-span-5 font-serif font-bold text-base md:text-lg text-black">Transaction type:</label>
      <div class="sm:col-span-7 relative">
        <select id="transType_${id}" required onchange="onTypeChange(${id})"
          class="pill-input w-full bg-white text-gray-900 font-serif font-bold px-5 py-3 pr-10 text-base border-none appearance-none cursor-pointer">
          <option value="" disabled selected>Select Type</option>
          <option value="Deposit Cash">Deposit Cash</option>
          <option value="Deposit Check">Deposit Check</option>
          <option value="Withdraw Cash">Withdraw Cash</option>
          <option value="Withdraw Check">Withdraw Check</option>
          <option value="Account Service">Account Service</option>
          <option value="Manager's Check">Manager's Check</option>
          <option value="Pay Bills – Cash">Pay Bills – Cash</option>
          <option value="Pay Bills – Check">Pay Bills – Check</option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-black">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
        </div>
      </div>
    </div>
    <div id="dynamicFields_${id}" class="space-y-5"></div>
  `;

  container.appendChild(card);
  updateTransactionButton();
}

function removeTransactionCard(id) {
  const card = document.getElementById(`transactionCard_${id}`);
  if (card) card.remove();
  updateTransactionButton();
}

function onTypeChange(id) {
  const select = document.getElementById(`transType_${id}`);
  const type = select.value;
  const fieldsContainer = document.getElementById(`dynamicFields_${id}`);

  if (!type) {
    fieldsContainer.innerHTML = '';
    return;
  }

  let html = '';

  switch (type) {
    case 'Deposit Cash':
    case 'Withdraw Cash':
      html = accountField(id, true) + amountField(id, 'Enter Amount:');
      break;

    case 'Deposit Check':
    case 'Withdraw Check':
      html = accountField(id, true) + amountField(id, 'Enter Amount:') + checkNumberField(id);
      break;

    case 'Account Service':
      html = fieldRow('Account Service Type:', `serviceType_${id}`, `
        <div class="relative">
          <select id="serviceType_${id}" required
            class="pill-input w-full bg-white text-gray-900 font-serif font-bold px-5 py-3 pr-10 text-base border-none appearance-none cursor-pointer">
            <option value="" disabled selected>Select Service</option>
            <option value="Savings Account Opening">Savings Account Opening</option>
            <option value="Checking Account Opening">Checking Account Opening</option>
            <option value="Time Deposit Account Opening">Time Deposit Account Opening</option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-black">
            <svg class="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
          </div>
        </div>`);
      break;

    case "Manager's Check":
      html = accountField(id, true)
           + fieldRow('Payee/Recipient Name:', `payee_${id}`, textInput(`payee_${id}`, 'e.g. Juan Dela Cruz', true))
           + amountField(id, 'Enter Amount:');
      break;

    case 'Pay Bills – Cash':
      html = fieldRow('Company/Institution Name:', `company_${id}`, textInput(`company_${id}`, 'e.g. Meralco', true))
           + amountField(id, 'Amount to Pay:')
           + accountField(id, false);
      break;

    case 'Pay Bills – Check':
      html = fieldRow('Company/Institution Name:', `company_${id}`, textInput(`company_${id}`, 'e.g. Meralco', true))
           + amountField(id, 'Amount to Pay:')
           + checkNumberField(id);
      break;
  }

  if (
    type === 'Pay Bills – Cash' ||
    type === 'Pay Bills – Check'
  ) {
    html += fieldRow(
      'Billing Account / Reference Number:',
      `billRef_${id}`,
      textInput(
        `billRef_${id}`,
        'Enter billing reference',
        true,
        'maxlength="30" autocomplete="off" pattern="[A-Za-z0-9-]{4,30}" title="4 to 30 letters, numbers, or hyphens"'
      )
    );
  }

  if (type !== 'Account Service') {
    html += fieldRow(
      'Account Holder / Named Party:',
      `accountHolder_${id}`,
      textInput(
        `accountHolder_${id}`,
        'Full name of the account holder or named party',
        true,
        'maxlength="100" autocomplete="off"'
      )
    );
  }

  fieldsContainer.innerHTML = html;
}