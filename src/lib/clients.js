const pool = require('../db/pool');

async function findClientById(clientId) {
  const result = await pool.query('SELECT * FROM clients WHERE client_id = $1', [clientId]);
  return result.rows[0] || null;
}

module.exports = { findClientById };
