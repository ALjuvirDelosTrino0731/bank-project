-- Phase 4Q-A: run once against your existing Compass Bank database.
-- Safe to rerun. No existing appointments are modified.
-- Timestamps and dates recorded by the server use Asia/Manila civil time.
CREATE TABLE IF NOT EXISTS verified_visit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('appointment_checkin','walk_in') NOT NULL,
  appointment_reference VARCHAR(128) NULL,
  visit_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  visit_date DATE NOT NULL,
  visit_hour TINYINT UNSIGNED NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_checked_in_appointment (appointment_reference),
  INDEX idx_visit_date_hour (visit_date,visit_hour),
  CONSTRAINT ck_verified_visit_count CHECK (visit_count BETWEEN 1 AND 50),
  CONSTRAINT ck_verified_visit_hour CHECK (visit_hour BETWEEN 0 AND 23)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- This table intentionally contains no customer name, email, phone, or account number.
-- The appointment reference is stored only to prevent a duplicate check-in.
