
const db = require("./db");

const TEST_DATE = "2026-11-18";
const TEST_TIME = "09:00:00";
const TEST_PREFIX = "CAPACITY_TEST_";

async function getAvailability() {
  const response = await fetch(
    `http://localhost:3000/api/booking-availability?date=${TEST_DATE}`
  );

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }

  return response.json();
}

async function removeTestData(connection) {
  await connection.query(
    "DELETE FROM appointments WHERE reference_number LIKE ?",
    [`${TEST_PREFIX}%`]
  );

  await connection.query(
    "DELETE FROM customers WHERE email = ?",
    ["capacity-test@invalid.example"]
  );
}

async function run() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [existingCustomers] = await connection.query(
      "SELECT customer_id FROM customers WHERE email = ?",
      ["capacity-test@invalid.example"]
    );

    if (existingCustomers.length > 0) {
      throw new Error(
        "Test customer already exists. No data was changed."
      );
    }

    const [existingAppointments] = await connection.query(
      "SELECT appointment_id FROM appointments WHERE reference_number LIKE ?",
      [`${TEST_PREFIX}%`]
    );

    if (existingAppointments.length > 0) {
      throw new Error(
        "Test appointments already exist. No data was changed."
      );
    }

    const [existingSlot] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM appointments
       WHERE appointment_date = ?
         AND appointment_time = ?
         AND status IN ('pending', 'confirmed', 'checked_in')`,
      [TEST_DATE, TEST_TIME]
    );

    if (Number(existingSlot[0].total) !== 0) {
      throw new Error(
        "The selected slot already contains active appointments. No data was changed."
      );
    }

    const [customerResult] = await connection.query(
      `INSERT INTO customers
       (full_name, email, phone_number)
       VALUES (?, ?, ?)`,
      [
        "Capacity Test Customer",
        "capacity-test@invalid.example",
        null
      ]
    );

    const customerId = customerResult.insertId;

    async function addAppointment(number, status) {
      await connection.query(
        `INSERT INTO appointments
         (
           customer_id,
           reference_number,
           appointment_date,
           appointment_time,
           status
         )
         VALUES (?, ?, ?, ?, ?)`,
        [
          customerId,
          `${TEST_PREFIX}${number}`,
          TEST_DATE,
          TEST_TIME,
          status
        ]
      );
    }

    async function check(label, expectedCapacity) {
      // Commit the current test changes so the API
      // can read them through its own database connection.
      await connection.commit();

      const data = await getAvailability();

      const slot = data.available_slots.find(
        (item) => item.time === "09:00"
      );

      const actualCapacity = slot
        ? slot.remaining_capacity
        : 0;

      const passed = actualCapacity === expectedCapacity;

      console.log(
        `${passed ? "PASS" : "FAIL"} | ${label} | Expected: ${expectedCapacity} | Actual: ${actualCapacity}`
      );

      await connection.beginTransaction();

      if (!passed) {
        throw new Error(`Capacity test failed: ${label}`);
      }
    }

    await check("Empty slot", 5);

    await addAppointment(1, "confirmed");
    await addAppointment(2, "confirmed");

    await check("Two confirmed appointments", 3);

    await addAppointment(3, "confirmed");
    await addAppointment(4, "confirmed");
    await addAppointment(5, "confirmed");

    await check("Five confirmed appointments", 0);

    await addAppointment(6, "cancelled");

    await check("Five confirmed and one cancelled", 0);

    await connection.query(
      `UPDATE appointments
       SET status = 'cancelled'
       WHERE reference_number = ?`,
      [`${TEST_PREFIX}5`]
    );

    await check("Four confirmed and two cancelled", 1);

    console.log("All capacity tests passed.");

  } finally {
    // Attempt cleanup whether the tests pass or fail.
    try {
      await connection.rollback();
      await connection.beginTransaction();
      await removeTestData(connection);
      await connection.commit();

      console.log("Temporary test records removed.");
    } catch (cleanupError) {
      console.error(
        "Cleanup failed. Check test records manually:",
        cleanupError.message
      );
      await connection.rollback();
    }

    connection.release();
    await db.end();
  }
}

run().catch((error) => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
