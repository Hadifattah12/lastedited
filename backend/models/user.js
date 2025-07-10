// models/user.js
const util    = require('util');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');

const SALT_ROUNDS = 8;

/* ------------------------------------------------------------------------- */
/* Promisified helpers so we can write async/await without boilerplate       */
/* ------------------------------------------------------------------------- */
const dbGet  = util.promisify(db.get.bind(db));
const dbAll  = util.promisify(db.all.bind(db));
const dbRunP = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function cb(err) {
      if (err) return reject(err);
      resolve(this);               // so `this.lastID` is available
    }));

/* ------------------------------------------------------------------------- */
/* User model                                                                */
/* ------------------------------------------------------------------------- */
class User {
  /* ------------------------------ creation ------------------------------ */

  static async create({
  name,
  email,
  password,
  avatar            = '/uploads/default-avatar.png',
  is_verified       = 0,
  verification_token = null
}) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const sql = `
    INSERT INTO users
      (name, email, password, avatar, is_verified, verification_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const { lastID } = await dbRunP(sql, [
    name.trim(),
    email.trim(),
    hashedPassword,
    avatar,
    is_verified,
    verification_token
  ]);

  return { id: lastID, name, email, avatar, is_verified };
}


  static async createGoogleUser({ name, email, google_id, avatar }) {
    const dummyPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(dummyPassword, SALT_ROUNDS);

    const sql = `
      INSERT INTO users (name, email, password, google_id, avatar, is_verified)
      VALUES (?, ?, ?, ?, ?, 1)
    `;
    const { lastID } = await dbRunP(sql, [name, email, hashedPassword, google_id, avatar]);

    return {
      id: lastID,
      name,
      email,
      google_id,
      avatar,
      is_verified: 1,
      is2FAEnabled: 0
    };
  }

  /* ------------------------------ look-ups ------------------------------ */

  static findById(id)             { return dbGet(`SELECT * FROM users WHERE id = ?`, [id]); }
  static findByGoogleId(gId)      { return dbGet(`SELECT * FROM users WHERE google_id = ?`, [gId]); }

  // case-insensitive search helpers
  static findByEmail(email)       { return dbGet(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`, [email]); }
  static findByName(name)         { return dbGet(`SELECT * FROM users WHERE LOWER(name)  = LOWER(?)`, [name]); }

  static findByVerificationToken(tkn) {
    return dbGet(`SELECT * FROM users WHERE verification_token = ?`, [tkn]);
  }

  static async getAllUsers() {
    return dbAll(`SELECT id, name, email, created_at FROM users`);
  }

  /* ------------------------------ updates ------------------------------ */

  static verifyEmail(id) {
    return dbRunP(`UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?`, [id]);
  }

  static store2FACode(id, code, expiry) {
    return dbRunP(
      `UPDATE users SET twofa_code = ?, twofa_expiry = ? WHERE id = ?`,
      [code, expiry.toISOString(), id]
    );
  }

  static clear2FACode(id) {
    return dbRunP(`UPDATE users SET twofa_code = NULL, twofa_expiry = NULL WHERE id = ?`, [id]);
  }

  static verify2FACode(id, code) {
    return dbGet(
      `SELECT twofa_code, twofa_expiry FROM users WHERE id = ?`,
      [id]
    ).then(row => {
      if (!row || !row.twofa_code || !row.twofa_expiry) return false;
      return row.twofa_code === code && new Date() <= new Date(row.twofa_expiry);
    });
  }

  static update2FAStatus(id, status) {
    return dbRunP(`UPDATE users SET is2FAEnabled = ? WHERE id = ?`, [status, id]);
  }

  static updateGoogleId(id, googleId) {
    return dbRunP(`UPDATE users SET google_id = ? WHERE id = ?`, [googleId, id]);
  }

  /* --------------------------- email change flow --------------------------- */

  static setPendingEmail(id, newEmail, token) {
    return dbRunP(
      `UPDATE users SET pending_email = ?, email_update_token = ? WHERE id = ?`,
      [newEmail, token, id]
    );
  }

  static async confirmNewEmail(token) {
    const row = await dbGet(
      `SELECT id, pending_email FROM users WHERE email_update_token = ?`,
      [token]
    );
    if (!row) throw new Error('Invalid or expired token');

    await dbRunP(
      `UPDATE users SET email = ?, pending_email = NULL, email_update_token = NULL WHERE id = ?`,
      [row.pending_email, row.id]
    );
    return true;
  }
}

module.exports = User;
