
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

const BRANCH_ID = 1;

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
    full_name.trim().length > 150
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

  if (
    !Array.isArray(service_ids) ||
    service_ids.length === 0 ||
    service_ids.length > 10 ||
    !service_ids.every(
      (id) => Number.isSafeInteger(id) && id > 0
    )
  ) {
    return "Select between 1 and 10 valid banking services";
  }

  if (new Set(service_ids).size !== service_ids.length) {
    return "Duplicate banking services are not allowed";
  }

  if (
    customer_notes !== undefined &&
    customer_notes !== null &&
    (
      typeof customer_notes !== "string" ||
      customer_notes.length > 1000
    )
  ) {
    return "Customer notes must not exceed 1000 characters";
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

    // Verify that every selected service is active.
    const placeholders = service_ids.map(() => "?").join(",");

    const [services] = await connection.query(
      `SELECT service_id
       FROM services
       WHERE is_active = 1
         AND service_id IN (${placeholders})`,
      service_ids
    );

    if (services.length !== service_ids.length) {
      await connection.rollback();

      return res.status(400).json({
        status: "error",
        message: "One or more banking services are unavailable"
      });
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

    // Create a pending appointment.
    const [appointmentResult] = await connection.query(`
      INSERT INTO appointments
        (
          customer_id,
          reference_number,
          appointment_date,
          appointment_time,
          status
        )
      VALUES (?, ?, ?, ?, 'pending')
    `, [
      customerId,
      referenceNumber,
      appointment_date,
      appointment_time
    ]);

    const appointmentId = appointmentResult.insertId;

    // Connect all selected services to the appointment.
    for (const serviceId of service_ids) {
      await connection.query(`
        INSERT INTO appointment_transactions
          (appointment_id, service_id, customer_notes)
        VALUES (?, ?, ?)
      `, [
        appointmentId,
        serviceId,
        customer_notes || null
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
      VALUES (?, NULL, 'pending', NULL, ?)
    `, [
      appointmentId,
      "Appointment created; email verification pending"
    ]);

    // Save all changes together.
    await connection.commit();

    return res.status(201).json({
      status: "ok",
      message: "Pending appointment created successfully",
      appointment: {
        appointment_id: appointmentId,
        reference_number: referenceNumber,
        appointment_date,
        appointment_time,
        status: "pending",
        service_ids,
        email_verification_required: true
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
