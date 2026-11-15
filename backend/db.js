
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const mysql = require("mysql2/promise");

// COMPASS_TIDB_TLS_V1: Enable verified TLS only when DB_SSL=true.
// The local MySQL database works unchanged when DB_SSL is unset.
const useDatabaseTls = /^(1|true|yes)$/i.test(String(process.env.DB_SSL || ''));
const isCloudStaging = String(process.env.COMPASS_DEPLOYMENT_STAGE || '').toLowerCase() === 'staging';
const databaseHost = String(process.env.DB_HOST || '').toLowerCase();
const isLocalDatabase = /^(localhost|127\.0\.0\.1|::1)$/.test(databaseHost);
if (isCloudStaging && !isLocalDatabase && !useDatabaseTls) {
  throw new Error('Cloud staging database must use DB_SSL=true with certificate verification.');
}
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: useDatabaseTls ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
