
const express = require("express");
const { randomUUID } = require("crypto");
const db = require("./db");

const {
  isValidDateFormat,
  isValidTimeFormat,
  isBookingDateAvailable,
  isBookingTimeAvailable,
  isBranchBookingEnabled,
  isBookingSlotCapacityAvailable,
  getDayOfWeek
} = require("./bookingValidation");

const router = express.Router();
// COMPASS_APPOINTMENT_OWNERSHIP_V1
const appointmentOwnership = require('./appointmentOwnership');
router.use("/access", appointmentOwnership.router);

const BRANCH_ID = 1;
// COMPASS_SERVER_VALIDATION_V1
// Validate structured details encoded by the current customer form.

// This checks booking requests only: no financial transaction is executed.
function validateBankServiceDetails(service, note) {
  if (!service || typeof note !== 'string' || note.length > 500 || note.includes(' | '))
    return 'Invalid service or description';
  const requiresHolder = ![
    'Savings Account Opening',
    'Checking Account Opening',
    'Time Deposit Account Opening'
  ].includes(service);

  const holderMatch = requiresHolder
    ? note.match(/ — Holder: ([\p{L}][\p{L}\p{M} .'-]{1,99})$/u)
    : null;

  if (requiresHolder && (
    !holderMatch || holderMatch[1].trim().length < 2
  )) {
    return 'Provide a valid account holder or named party';
  }

  const baseNote = holderMatch
    ? note.slice(0, -holderMatch[0].length)
    : note;

  const requiresBillReference = [
    'Bill Payment - Cash',
    'Bill Payment - Check'
  ].includes(service);

  const billRefMatch = requiresBillReference
    ? baseNote.match(/ \u2014 Bill Ref: \.\.\.[A-Za-z0-9-]{4}$/u)
    : null;

  if (requiresBillReference && !billRefMatch) {
    return 'Provide a valid masked billing reference';
  }

  const serviceNote = billRefMatch
    ? baseNote.slice(0, -billRefMatch[0].length)
    : baseNote;

  const amountPattern = String.raw`₱([0-9]{1,9})\.([0-9]{2})`;
  const amount = serviceNote.match(new RegExp(amountPattern));
  if (service !== 'Savings Account Opening' &&
      service !== 'Checking Account Opening' &&
      service !== 'Time Deposit Account Opening') {
    if (!amount || (BigInt(amount[1]) === 0n && amount[2] === '00'))
      return 'Enter a valid amount (up to 9 digits and two decimals)';
  }
  const acc = String.raw`\(Acc: \.\.\.[0-9]{4}\)`;
  const check = String.raw`\[Check #[0-9]{4,12}\]`;
  const rules = {
    'Cash Deposit': new RegExp('^Deposit Cash: ' + amountPattern + ' ' + acc + '$','u'),
    'Cash Withdrawal': new RegExp('^Withdraw Cash: ' + amountPattern + ' ' + acc + '$','u'),
    'Check Deposit': new RegExp('^Deposit Check: ' + amountPattern + ' ' + acc + ' ' + check + '$','u'),
    'Check Withdrawal': new RegExp('^Withdraw Check: ' + amountPattern + ' ' + acc + ' ' + check + '$','u'),
    'Manager\'s Check': new RegExp("^Manager's Check: " + amountPattern + ' ' + acc + ' — Payee: (.{1,150})$','u'),
    'Bill Payment - Cash': new RegExp('^Pay Bills – Cash: ' + amountPattern + ' — (.{1,150})(?: ' + acc + ')?$','u'),
    'Bill Payment - Check': new RegExp('^Pay Bills – Check: ' + amountPattern + ' — (.{1,150}) ' + check + '$','u'),
    'Savings Account Opening': /^Account Service: Savings Account Opening$/u,
    'Checking Account Opening': /^Account Service: Checking Account Opening$/u,
    'Time Deposit Account Opening': /^Account Service: Time Deposit Account Opening$/u
  };
  const match = rules[service]?.exec(serviceNote);
  if (!match) return 'Transaction details do not match the selected service';
  if (['Manager\'s Check','Bill Payment - Cash','Bill Payment - Check'].includes(service)) {
    const name = match[3] || '';
    if (!/\p{L}/u.test(name)) return 'Payee or institution name must contain letters';
  }
  return null;
}





function getManilaDateTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}

function isFutureBooking(date, time) {
  const now = getManilaDateTime();

  return (
    date > now.date ||
    (date === now.date && time > now.time)
  );
}

function isWithinBookingWindow(date) {
  if (!isValidDateFormat(date)) return false;

  const today = getManilaDateTime().date;
  const start = Date.parse(today + "T00:00:00Z");
  const requested = Date.parse(date + "T00:00:00Z");
  const daysAhead = Math.round(
    (requested - start) / 86400000
  );

  return Number.isFinite(daysAhead) &&
    daysAhead >= 0 && daysAhead <= 13;
}

function validateRequest(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return "Invalid request body";
  }

  const {
    full_name,
    email,
    phone_number,
    appointment_date,
    appointment_time,
    service_ids,
    customer_notes
  } = body;

  if (
    typeof full_name !== "string" ||
    full_name.trim().length < 2 ||
    full_name.trim().length > 150 || !/\p{L}/u.test(full_name)
  ) {
    return "Full name must contain 2 to 150 characters";
  }

  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return "Please provide a valid email address";
  }

  if (
    phone_number !== undefined &&
    phone_number !== null &&
    (
      typeof phone_number !== "string" ||
      phone_number.length > 20
    )
  ) {
    return "Phone number must be a string of at most 20 characters";
  }

  if (!isValidDateFormat(appointment_date)) {
    return "Invalid appointment date";
  }

  if (!isValidTimeFormat(appointment_time)) {
    return "Invalid appointment time";
  }

  if (!isFutureBooking(appointment_date, appointment_time)) {
    return "Appointment must be in the future";
  }

  if (!isWithinBookingWindow(appointment_date)) {
    return "Appointments must be within the next 14 calendar days";
  }

  if (
    !Array.isArray(service_ids) ||
    service_ids.length === 0 ||
    service_ids.length > 10 ||
    !service_ids.every(
      (id) => Number.isSafeInteger(id) && id > 0
    )
  ) {
    return "Select between 1 and 10 valid banking transactions";
  }

  if (
    customer_notes !== undefined &&
    customer_notes !== null &&
    (
      typeof customer_notes !== "string" ||
      customer_notes.length > 5090
    )
  ) {
    return "Combined transaction descriptions must not exceed 5090 characters";
  }

  return null;
}

router.post("/", async (req, res) => {
  const validationError = validateRequest(req.body);

  if (validationError) {
    return res.status(400).json({
      status: "error",
      message: validationError
    });
  }

  const {
    full_name,
    email,
    phone_number,
    appointment_date,
    appointment_time,
    service_ids,
    customer_notes
  } = req.body;

  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    // Lock the branch settings row.
    // Other requests using this same lock must wait.
    const [settingsRows] = await connection.query(`
      SELECT
        branch_id,
        slot_duration_minutes,
        max_appointments_per_slot,
        is_booking_enabled
      FROM branch_settings
      WHERE branch_id = ?
      FOR UPDATE
    `, [BRANCH_ID]);

    if (settingsRows.length === 0) {
      await connection.rollback();

      return res.status(503).json({
        status: "error",
        message: "Branch settings are unavailable"
      });
    }

    const settings = settingsRows[0];

    if (!isBranchBookingEnabled(settings)) {
      await connection.rollback();

      return res.status(409).json({
        status: "error",
        message: "Branch booking is currently disabled"
      });
    }

    const interval = settings.slot_duration_minutes;
    const maximum = settings.max_appointments_per_slot;

    if (
      !Number.isInteger(interval) ||
      interval <= 0 ||
      !Number.isInteger(maximum) ||
      maximum <= 0
    ) {
      await connection.rollback();

      return res.status(503).json({
        status: "error",
        message: "Invalid branch booking settings"
      });
    }

    // Read operating hours and branch closures.
    const [operatingHours] = await connection.query(`
      SELECT
        day_of_week,
        opening_time,
        closing_time,
        is_open
      FROM branch_operating_hours
      WHERE branch_id = ?
    `, [BRANCH_ID]);

    const [closures] = await connection.query(`
      SELECT
        DATE_FORMAT(closure_date, '%Y-%m-%d') AS closure_date
      FROM branch_closures
      WHERE branch_id = ?
    `, [BRANCH_ID]);

    if (
      !isBookingDateAvailable(
        appointment_date,
        operatingHours,
        closures
      )
    ) {
      await connection.rollback();

      return res.status(409).json({
        status: "error",
        message: "Branch is closed on the selected date"
      });
    }

    const dayOfWeek = getDayOfWeek(appointment_date);

    const schedule = operatingHours.find(
      (day) => day.day_of_week === dayOfWeek
    );

    if (
      !schedule ||
      !isBookingTimeAvailable(
        appointment_time,
        schedule.opening_time,
        schedule.closing_time,
        interval
      )
    ) {
      await connection.rollback();

      return res.status(400).json({
        status: "error",
        message: "Invalid appointment time slot"
      });
    }

    // Recheck the time after waiting for any database lock.
    if (!isFutureBooking(appointment_date, appointment_time)) {
      await connection.rollback();

      return res.status(400).json({
        status: "error",
        message: "Appointment time has already passed"
      });
    }

    // Recheck the booking window after waiting for a database lock.
    if (!isWithinBookingWindow(appointment_date)) {
      await connection.rollback();
      return res.status(400).json({
        status: "error",
        message: "Appointments must be within the next 14 calendar days"
      });
    }

    // Verify that every selected service is active.
    const uniqueServiceIds = [...new Set(service_ids)];
    const placeholders = uniqueServiceIds.map(() => "?").join(",");

    const [services] = await connection.query(
      `SELECT service_id, service_name
       FROM services
       WHERE is_active = 1
         AND service_id IN (${placeholders})`,
      uniqueServiceIds
    );

    if (services.length !== uniqueServiceIds.length) {
      await connection.rollback();

      return res.status(400).json({
        status: "error",
        message: "One or more banking services are unavailable"
      });
    }

    // Server-side checks for each booked banking service. Never trust browser limits.

    const descriptionPieces = typeof customer_notes === 'string'
      ? customer_notes.split(' | ').map(x => x.trim()) : [];
    if (descriptionPieces.length !== service_ids.length ||
        descriptionPieces.some(x => !x)) {
      await connection.rollback();
      return res.status(400).json({status:'error',message:'Provide one valid description per selected service'});
    }
    const bankServices = new Map(services.map(s => [Number(s.service_id), s.service_name]));
    for (let i = 0; i < service_ids.length; i++) {
      const problem = validateBankServiceDetails(bankServices.get(service_ids[i]), descriptionPieces[i]);
      if (problem) {
        await connection.rollback();
        return res.status(400).json({status:'error',message:`Service ${i + 1}: ${problem}`});
      }
    }


    // Count appointments in the requested slot.
    const [countRows] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE appointment_date = ?
        AND appointment_time = ?
        AND status IN ('pending', 'confirmed', 'checked_in')
    `, [appointment_date, appointment_time]);

    const existingAppointments = Number(countRows[0].total);

    if (
      !isBookingSlotCapacityAvailable(
        existingAppointments,
        maximum
      )
    ) {
      await connection.rollback();

      return res.status(409).json({
        status: "error",
        message: "The selected appointment slot is fully booked"
      });
    }

    // Client feedback: maximum 20 scheduled customers per hour.
    // Protected by the branch_settings FOR UPDATE lock above.
    const [hourlyRows] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE appointment_date = ?
        AND HOUR(appointment_time) = HOUR(CAST(? AS TIME))
        AND status IN ('pending', 'confirmed', 'checked_in')
    `, [appointment_date, appointment_time]);

    const hourlyBooked = Number(hourlyRows[0].total);

    if (!Number.isInteger(hourlyBooked) || hourlyBooked >= 20) {
      await connection.rollback();
      return res.status(409).json({
        status: "error",
        message: "This hour has reached the maximum of 20 scheduled customers"
      });
    }

    // Create the customer.
    const [customerResult] = await connection.query(`
      INSERT INTO customers
        (full_name, email, phone_number)
      VALUES (?, ?, ?)
    `, [
      full_name.trim(),
      email.trim().toLowerCase(),
      phone_number || null
    ]);

    const customerId = customerResult.insertId;

    // Generate a unique reference number.
    const referenceNumber = `CB-${randomUUID()}`;

    // Automatically confirm a valid appointment.
    const [appointmentResult] = await connection.query(`
      INSERT INTO appointments
        (
          customer_id,
          reference_number,
          appointment_date,
          appointment_time,
          status
        )
      VALUES (?, ?, ?, ?, 'confirmed')
    `, [
      customerId,
      referenceNumber,
      appointment_date,
      appointment_time
    ]);

    const appointmentId = appointmentResult.insertId;

    // Store one transaction description for each selected service.
    const submittedNotes = typeof customer_notes === "string"
      ? customer_notes.trim() : "";

    const separatedNotes = submittedNotes
      ? submittedNotes.split(" | ") : [];

    const notesPerService =
      separatedNotes.length === service_ids.length
        ? separatedNotes
        : service_ids.length === 1 ? [submittedNotes] : [];

    if (
      service_ids.length > 1 &&
      submittedNotes &&
      notesPerService.length !== service_ids.length
    ) {
      await connection.rollback();

      return res.status(400).json({
        status: "error",
        message: "Provide one transaction description for each selected banking service"
      });
    }

    for (let i = 0; i < service_ids.length; i++) {
      await connection.query(`
        INSERT INTO appointment_transactions
          (appointment_id, service_id, customer_notes)
        VALUES (?, ?, ?)
      `, [
        appointmentId,
        service_ids[i],
        notesPerService[i] || null
      ]);
    }

    // Record the initial appointment status.
    await connection.query(`
      INSERT INTO appointment_status_history
        (
          appointment_id,
          old_status,
          new_status,
          changed_by_employee_id,
          change_reason
        )
      VALUES (?, NULL, 'confirmed', NULL, ?)
    `, [
      appointmentId,
      "Appointment automatically confirmed upon successful booking"
    ]);

    // Save all changes together.
    await connection.commit();

    // Send the confirmation email only after successful database commit.
    // Test addresses must not trigger outgoing SMTP messages.
    const recipientEmail = email.trim().toLowerCase();
    const isTestRecipient = /@example\.(com|org|net)$/i.test(recipientEmail);

    if (!isTestRecipient) {
      setImmediate(() => {
        Promise.resolve()
          .then(() => require("./appointmentApprovalMail")
            .sendApprovedAppointment(referenceNumber))
          .then(result => {
            console.log("Automatic confirmation email:", result);
          })
          .catch(error => {
            console.error(
              "Automatic confirmation email error:",
              error.code || error.message
            );
          });
      });
    }

    return res.status(201).json({
      status: "ok",
      message: "Appointment automatically confirmed successfully",
      appointment: {
        appointment_id: appointmentId,
        reference_number: referenceNumber,
        appointment_date,
        appointment_time,
        status: "confirmed",
        service_ids,
        email_verification_required: false
      }
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Appointment rollback failed:",
          rollbackError.message
        );
      }
    }

    console.error(
      "Appointment creation failed:",
      error.code || error.message
    );

    return res.status(500).json({
      status: "error",
      message: "Unable to create appointment"
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});


// Reference + registered contact is a temporary prototype lookup mechanism.
// Production cancellation should require verified OTP or authenticated ownership.
function validReference(value) {
  return typeof value === "string" && /^CB-[0-9a-f-]{36}$/i.test(value);
}
function validContact(value) {
  return typeof value === "string" && value.trim().length >= 3 && value.length <= 254;
}

// Customer-accessible QR is issued only after reference + registered contact match.
// This provides a fallback when SMTP delivery is not configured.
// Require verified email ownership for customer appointment management when enforced.
router.use(["/qr", "/lookup", "/cancel"], appointmentOwnership.requireVerifiedAccess);
router.post("/qr", async (req, res) => {
  const {reference_number, contact} = req.body || {};
  if (!validReference(reference_number) || !validContact(contact)) {
    return res.status(400).json({status:"error", message:"Invalid reference or contact"});
  }
  try {
    const [rows] = await db.query(`
      SELECT a.reference_number, a.status
      FROM appointments a
      JOIN customers c ON c.customer_id = a.customer_id
      WHERE a.reference_number = ?
        AND (LOWER(c.email) = ? OR c.phone_number = ?)
      LIMIT 1
    `, [reference_number, contact.trim().toLowerCase(), contact.trim()]);
    if (!rows.length) return res.status(404).json({status:"error",message:"Appointment not found"});
    if (!['confirmed','checked_in','completed'].includes(rows[0].status)) {
      return res.status(409).json({status:"error",message:"QR unavailable for this appointment status"});
    }
    const QRCode = require('qrcode');
    const image = await QRCode.toDataURL(reference_number, {
      width: 260, margin: 2, errorCorrectionLevel: 'M'
    });
    res.set('Cache-Control','no-store');
    return res.json({status:"ok",qr_data_url:image,reference_number});
  } catch(error) {
    console.error('Appointment QR:',error.code||error.message);
    return res.status(500).json({status:"error",message:"Unable to generate appointment QR"});
  }
});

router.post("/lookup", async (req, res) => {
  const { reference_number, contact } = req.body || {};
  if (!validReference(reference_number) || !validContact(contact)) {
    return res.status(400).json({ status: "error", message: "Invalid reference or contact" });
  }
  try {
    const [rows] = await db.query(`
      SELECT a.reference_number, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             TIME_FORMAT(a.appointment_time, '%H:%i') AS appointment_time, a.status
      FROM appointments a JOIN customers c ON c.customer_id = a.customer_id
      WHERE a.reference_number = ? AND (LOWER(c.email) = ? OR c.phone_number = ?)
      LIMIT 1
    `, [reference_number, contact.trim().toLowerCase(), contact.trim()]);
    if (!rows.length) return res.status(404).json({status:"error",message:"Appointment not found"});
    return res.json({status:"ok", appointment:rows[0]});
  } catch (error) {
    console.error("Appointment lookup failed:", error.code || error.message);
    return res.status(500).json({status:"error",message:"Unable to look up appointment"});
  }
});

router.post("/cancel", async (req, res) => {
  const { reference_number, contact } = req.body || {};
  if (!validReference(reference_number) || !validContact(contact)) {
    return res.status(400).json({status:"error",message:"Invalid reference or contact"});
  }
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(`
      SELECT a.appointment_id, a.status,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             TIME_FORMAT(a.appointment_time, '%H:%i') AS appointment_time
      FROM appointments a JOIN customers c ON c.customer_id = a.customer_id
      WHERE a.reference_number = ? AND (LOWER(c.email) = ? OR c.phone_number = ?)
      FOR UPDATE
    `, [reference_number, contact.trim().toLowerCase(), contact.trim()]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({status:"error",message:"Appointment not found"});
    }
    const appointment = rows[0];
    if (!["pending", "confirmed"].includes(appointment.status)) {
      await connection.rollback();
      return res.status(409).json({status:"error",message:"Appointment cannot be cancelled in its current status"});
    }
    if (!isFutureBooking(appointment.appointment_date, appointment.appointment_time)) {
      await connection.rollback();
      return res.status(409).json({status:"error",message:"Past appointments cannot be cancelled"});
    }
    await connection.query("UPDATE appointments SET status = 'cancelled' WHERE appointment_id = ?", [appointment.appointment_id]);
    await connection.query(`
      INSERT INTO appointment_status_history
        (appointment_id, old_status, new_status, changed_by_employee_id, change_reason)
      VALUES (?, ?, 'cancelled', NULL, 'Cancelled using reference and registered contact')
    `, [appointment.appointment_id, appointment.status]);
    await connection.commit();
    return res.json({status:"ok",message:"Appointment cancelled",reference_number});
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error("Appointment cancellation failed:", error.code || error.message);
    return res.status(500).json({status:"error",message:"Unable to cancel appointment"});
  } finally { if (connection) connection.release(); }
});

module.exports = router;
