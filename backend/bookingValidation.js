
function isValidDateFormat(date) {
  if (typeof date !== "string") {
    return false;
  }

  // Check the YYYY-MM-DD format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  // Separate the year, month, and day.
  const [year, month, day] = date.split("-").map(Number);

  // Check whether the date exists on the calendar.
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);

  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() + 1 === month &&
    calendarDate.getUTCDate() === day
  );
}


function getDayOfWeek(date) {
  if (!isValidDateFormat(date)) {
    return null;
  }

  const calendarDate = new Date(date + "T00:00:00Z");

  const javascriptDay = calendarDate.getUTCDay();

  // JavaScript uses 0 for Sunday.
  // Our database uses 7 for Sunday.
  return javascriptDay === 0 ? 7 : javascriptDay;
}


function isRegularOperatingDay(date, operatingHours) {
  const dayOfWeek = getDayOfWeek(date);

  if (dayOfWeek === null) {
    return false;
  }

  if (!Array.isArray(operatingHours)) {
    return false;
  }

  const schedule = operatingHours.find(
    (day) => day.day_of_week === dayOfWeek
  );

  if (!schedule) {
    return false;
  }

  return schedule.is_open === 1;
}


function isBranchClosedOnDate(date, closures) {
  if (!isValidDateFormat(date)) {
    return false;
  }

  if (!Array.isArray(closures)) {
    return false;
  }

  return closures.some((closure) => {
    const closureDate = closure.closure_date;

    if (typeof closureDate === "string") {
      return closureDate.slice(0, 10) === date;
    }

    if (closureDate instanceof Date) {
      return closureDate.toISOString().slice(0, 10) === date;
    }

    return false;
  });
}


function isBookingDateAvailable(date, operatingHours, closures) {
  if (!isValidDateFormat(date)) {
    return false;
  }

  if (!Array.isArray(operatingHours) || !Array.isArray(closures)) {
    return false;
  }

  if (!isRegularOperatingDay(date, operatingHours)) {
    return false;
  }

  if (isBranchClosedOnDate(date, closures)) {
    return false;
  }

  return true;
}


function isValidTimeFormat(time) {
  if (typeof time !== "string") {
    return false;
  }

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}


function timeToMinutes(time) {
  if (!isValidTimeFormat(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}


function normalizeTime(time) {
  if (typeof time !== "string") {
    return null;
  }

  if (isValidTimeFormat(time)) {
    return time;
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d:00$/.test(time)) {
    return null;
  }

  return time.slice(0, 5);
}


function isTimeWithinOperatingHours(time, openingTime, closingTime) {
  const appointmentMinutes = timeToMinutes(time);

  const openingMinutes = timeToMinutes(normalizeTime(openingTime));

  const closingMinutes = timeToMinutes(normalizeTime(closingTime));

  if (
    appointmentMinutes === null ||
    openingMinutes === null ||
    closingMinutes === null
  ) {
    return false;
  }

  if (openingMinutes >= closingMinutes) {
    return false;
  }

  return (
    appointmentMinutes >= openingMinutes &&
    appointmentMinutes < closingMinutes
  );
}


function isValidBookingSlot(time, openingTime, slotDurationMinutes) {
  const appointmentMinutes = timeToMinutes(time);

  const openingMinutes = timeToMinutes(normalizeTime(openingTime));

  if (appointmentMinutes === null || openingMinutes === null) {
    return false;
  }

  if (
    !Number.isInteger(slotDurationMinutes) ||
    slotDurationMinutes <= 0
  ) {
    return false;
  }

  if (appointmentMinutes < openingMinutes) {
    return false;
  }

  const minutesSinceOpening = appointmentMinutes - openingMinutes;

  return minutesSinceOpening % slotDurationMinutes === 0;
}


function canAppointmentFinishBeforeClosing(time, closingTime, durationMinutes) {
  const appointmentMinutes = timeToMinutes(time);

  const closingMinutes = timeToMinutes(normalizeTime(closingTime));

  if (appointmentMinutes === null || closingMinutes === null) {
    return false;
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return false;
  }

  const appointmentEnd = appointmentMinutes + durationMinutes;

  return appointmentEnd <= closingMinutes;
}


function isBookingTimeAvailable(
  time,
  openingTime,
  closingTime,
  slotDurationMinutes
) {
  if (
    !isTimeWithinOperatingHours(time, openingTime, closingTime)
  ) {
    return false;
  }

  if (
    !isValidBookingSlot(time, openingTime, slotDurationMinutes)
  ) {
    return false;
  }

  if (
    !canAppointmentFinishBeforeClosing(
      time,
      closingTime,
      slotDurationMinutes
    )
  ) {
    return false;
  }

  return true;
}


function isBranchBookingEnabled(branchSettings) {
  if (
    !branchSettings ||
    typeof branchSettings !== "object" ||
    Array.isArray(branchSettings)
  ) {
    return false;
  }

  return branchSettings.is_booking_enabled === 1;
}


function isBookingSlotCapacityAvailable(
  existingAppointments,
  maxAppointmentsPerSlot
) {
  if (
    !Number.isInteger(existingAppointments) ||
    existingAppointments < 0
  ) {
    return false;
  }

  if (
    !Number.isInteger(maxAppointmentsPerSlot) ||
    maxAppointmentsPerSlot <= 0
  ) {
    return false;
  }

  return existingAppointments < maxAppointmentsPerSlot;
}



module.exports = {
  isValidDateFormat,
  getDayOfWeek,
  isRegularOperatingDay,
  isBranchClosedOnDate,
  isBookingDateAvailable,
  isValidTimeFormat,
  timeToMinutes,
  normalizeTime,
  isTimeWithinOperatingHours,
  isValidBookingSlot,
  canAppointmentFinishBeforeClosing,
  isBookingTimeAvailable,
  isBranchBookingEnabled,
  isBookingSlotCapacityAvailable
};






