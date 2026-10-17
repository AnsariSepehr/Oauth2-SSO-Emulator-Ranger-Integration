const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function findUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findUserBySub(sub) {
  const result = await pool.query('SELECT * FROM users WHERE sub = $1', [sub]);
  return result.rows[0] || null;
}

async function verifyPassword(user, plainPassword) {
  if (!user || !user.is_active) return false;
  return bcrypt.compare(plainPassword, user.password_hash);
}

module.exports = { findUserByUsername, findUserById, findUserBySub, verifyPassword };
