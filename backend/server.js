
const express = require("express");
const path = require("path");
const db = require("./db");
const appointmentRoutes = require("./appointmentRoutes");
const employeeRoutes = require("./employeeRoutes");

const {
  isValidDateFormat,
  getDayOfWeek,
  isBookingDateAvailable,
  isBookingTimeAvailable,
  isBranchBookingEnabled,
  isBookingSlotCapacityAvailable,
  normalizeTime,
  timeToMinutes
} = require("./bookingValidation");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow the server to understand JSON data.
app.use(express.json());

// Serve the existing customer UI from the same origin as the API.
// This avoids opening database APIs to arbitrary browser origins.
app.use('/employee', express.static(path.join(__dirname, '..', 'admin bank', 'admin bank', 'compass-bank-admin-updated')));
app.use('/customer', express.static(path.join(__dirname, '..', 'Compass_Bank_Frontend', 'Compass_Bank')));

// A simple endpoint to check if the backend works.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Compass Bank backend is running"
  });
});

// Check whether the backend can communicate with MySQL.
app.get("/api/db-health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      status: "ok",
      message: "Database connection is working"
    });
  } catch (error) {
    console.error(
      "Database health check failed:",
      error.code || error.message
    );

    res.status(503).json({
      status: "error",
      message: "Database connection is unavailable"
    });
  }
});

// Retrieve active banking services.
app.get("/api/services", async (req, res) => {
  try {
    const [services] = await db.query(`
      SELECT
        service_id,
        service_name,
        description,
        estimated_duration_minutes
      FROM services
      WHERE is_active = 1
      ORDER BY service_name ASC
    `);

    res.json({
      status: "ok",
      services: services
    });
  } catch (error) {
    console.error(
      "Failed to retrieve services:",
      error.code || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to retrieve banking services"
    });
  }
});

// Retrieve closure dates for the test branch.
app.get("/api/branch-closures", async (req, res) => {
  try {
    const [closures] = await db.query(`
      SELECT
        closure_date,
        reason
      FROM branch_closures
      WHERE branch_id = 1
      ORDER BY closure_date ASC
    `);

    res.json({
      status: "ok",
      closures: closures
    });
  } catch (error) {
    console.error(
      "Failed to retrieve branch closures:",
      error.code || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to retrieve branch closures"
    });
  }
});

// Retrieve weekly operating hours for the test branch.
app.get("/api/branch-operating-hours", async (req, res) => {
  try {
    const [hours] = await db.query(`
      SELECT
        day_of_week,
        opening_time,
        closing_time,
        is_open
      FROM branch_operating_hours
      WHERE branch_id = 1
      ORDER BY day_of_week ASC
    `);

    res.json({
      status: "ok",
      operating_hours: hours
    });
  } catch (error) {
    console.error(
      "Failed to retrieve branch operating hours:",
      error.code || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to retrieve branch operating hours"
    });
  }
});

// Retrieve booking settings for the test branch.
app.get("/api/branch-settings", async (req, res) => {
  try {
    const [settings] = await db.query(`
      SELECT
        branch_id,
        timezone,
        slot_duration_minutes,
        max_appointments_per_slot,
        is_booking_enabled
      FROM branch_settings
      WHERE branch_id = 1
    `);

    if (settings.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Branch settings not found"
      });
    }

    res.json({
      status: "ok",
      settings: settings[0]
    });
  } catch (error) {
    console.error(
      "Failed to retrieve branch settings:",
      error.code || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to retrieve branch settings"
    });
  }
});

// Retrieve available booking slots for a selected date.
app.get("/api/booking-availability", async (req, res) => {
  const date = req.query.date;

  // Validate the requested date.
  if (!isValidDateFormat(date)) {
    return res.status(400).json({
      status: "error",
      message: "Please provide a valid date in YYYY-MM-DD format"
    });
  }

  try {
    // Retrieve the test branch's booking settings.
    const [settingsRows] = await db.query(`
      SELECT
        branch_id,
        slot_duration_minutes,
        max_appointments_per_slot,
        is_booking_enabled
      FROM branch_settings
      WHERE branch_id = 1
    `);

    if (settingsRows.length === 0) {
      return res.status(503).json({
        status: "error",
        message: "Branch booking settings are unavailable"
      });
    }

    const settings = settingsRows[0];

    // Stop if the branch has disabled new bookings.
    if (!isBranchBookingEnabled(settings)) {
      return res.json({
        status: "ok",
        date: date,
        available_slots: [],
        message: "Booking is currently disabled"
      });
    }

    const interval = settings.slot_duration_minutes;
    const maximum = settings.max_appointments_per_slot;

    // Validate the branch's booking configuration.
    if (
      !Number.isInteger(interval) ||
      interval <= 0 ||
      !Number.isInteger(maximum) ||
      maximum <= 0
    ) {
      return res.status(503).json({
        status: "error",
        message: "Branch booking configuration is invalid"
      });
    }

    // Retrieve weekly operating hours.
    const [operatingHours] = await db.query(`
      SELECT
        day_of_week,
        opening_time,
        closing_time,
        is_open
      FROM branch_operating_hours
      WHERE branch_id = 1
    `);

    // Retrieve special branch closure dates.
    const [closures] = await db.query(`
      SELECT
        DATE_FORMAT(closure_date, '%Y-%m-%d') AS closure_date
      FROM branch_closures
      WHERE branch_id = 1
    `);

    // Check whether the branch accepts visits on this date.
    if (!isBookingDateAvailable(date, operatingHours, closures)) {
      return res.json({
        status: "ok",
        date: date,
        available_slots: [],
        message: "The branch is closed on the selected date"
      });
    }

    // Find operating hours for the selected weekday.
    const dayOfWeek = getDayOfWeek(date);

    const schedule = operatingHours.find(
      (day) => day.day_of_week === dayOfWeek
    );

    if (!schedule) {
      return res.status(503).json({
        status: "error",
        message: "Operating hours are unavailable"
      });
    }

    const opening = normalizeTime(schedule.opening_time);
    const closing = normalizeTime(schedule.closing_time);

    const openingMinutes = timeToMinutes(opening);
    const closingMinutes = timeToMinutes(closing);

    // Validate the branch's opening and closing times.
    if (
      openingMinutes === null ||
      closingMinutes === null ||
      openingMinutes >= closingMinutes
    ) {
      return res.status(503).json({
        status: "error",
        message: "Branch operating hours are invalid"
      });
    }

    // Count appointments already occupying each time slot.
    const [appointments] = await db.query(`
      SELECT
        TIME_FORMAT(appointment_time, '%H:%i') AS slot_time,
        COUNT(*) AS appointment_count
      FROM appointments
      WHERE appointment_date = ?
        AND status IN ('pending', 'confirmed', 'checked_in')
      GROUP BY appointment_time
    `, [date]);

    const appointmentCounts = new Map();

    for (const appointment of appointments) {
      appointmentCounts.set(
        appointment.slot_time,
        Number(appointment.appointment_count)
      );
    }

    // Generate the available appointment slots.
    const availableSlots = [];

    for (
      let minutes = openingMinutes;
      minutes + interval <= closingMinutes;
      minutes += interval
    ) {
      const hours = String(
        Math.floor(minutes / 60)
      ).padStart(2, "0");

      const mins = String(
        minutes % 60
      ).padStart(2, "0");

      const time = `${hours}:${mins}`;

      // Check operating hours, slot interval and duration.
      if (
        !isBookingTimeAvailable(
          time,
          schedule.opening_time,
          schedule.closing_time,
          interval
        )
      ) {
        continue;
      }

      const existingAppointments =
        appointmentCounts.get(time) || 0;

      // Exclude fully booked time slots.
      if (
        !isBookingSlotCapacityAvailable(
          existingAppointments,
          maximum
        )
      ) {
        continue;
      }

      availableSlots.push({
        time: time,
        remaining_capacity: maximum - existingAppointments
      });
    }

    // Return available appointment slots.
    res.json({
      status: "ok",
      date: date,
      slot_duration_minutes: interval,
      max_appointments_per_slot: maximum,
      available_slots: availableSlots
    });

  } catch (error) {
    console.error(
      "Failed to retrieve booking availability:",
      error.code || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to retrieve booking availability"
    });
  }
});


// Forecast safety: unsupported predictions are not served to customers.
// The existing forecast.json is synthetic and is not approved for live use.
app.get('/api/traffic-forecast', (req, res) => {
  const start = String(req.query.start || '');
  const end = String(req.query.end || '');

  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  };

  if (!validDate(start) || !validDate(end) || start > end ||
      (Date.parse(end) - Date.parse(start)) / 86400000 > 62) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid start/end dates (maximum 63 days) required'
    });
  }

  return res.json({
    status: 'ok',
    source: 'No approved live traffic model',
    model_note: 'Historical real-data evaluation is available in the employee dashboard. No validated forecasts are available for this Philippine branch.',
    forecasts: []
  });
});

// Experimental, externally sourced real-data scenarios. Separate from live forecast API.
app.get('/api/research-traffic-scenarios', (req, res) => {
  try {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ml', 'real_scenarios.json'), 'utf8'));
    res.set('Cache-Control', 'no-store');
    return res.json(data);
  } catch (err) {
    console.error('Research scenario read failed:', err.code || err.message);
    return res.status(503).json({status:'error',message:'Experimental scenarios unavailable'});
  }
});

// Appointment creation API.
app.use("/api/appointments", appointmentRoutes);
app.use("/api/employee", employeeRoutes);

// Start the backend server after registering all routes.
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
