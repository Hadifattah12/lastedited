const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DBSOURCE = path.join(__dirname, 'db.sqlite');

const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    console.error('❌ Could not connect to database:', err);
  } else {
    console.log('✅ Connected to SQLite database');

    // Friends table
    db.run(`
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        UNIQUE(user_id, friend_id)
      )
    `, (err) => {
      if (err) console.error('❌ Error creating friends table:', err);
      else console.log('✅ Friends table ready');
    });

    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        google_id TEXT UNIQUE,
        avatar TEXT DEFAULT '/uploads/default-avatar.png',
        is_verified BOOLEAN DEFAULT 0,
        is2FAEnabled BOOLEAN DEFAULT 0,
        verification_token TEXT,
        twofa_code TEXT,
        twofa_expiry DATETIME,
        pending_email TEXT,
        email_update_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating users table:', err);
      else console.log('✅ Users table ready');
    });

    // Match history table
    db.run(`
      CREATE TABLE IF NOT EXISTS match_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player1 TEXT NOT NULL,
        player2 TEXT NOT NULL,
        winner TEXT NOT NULL,
        score1 INTEGER NOT NULL,
        score2 INTEGER NOT NULL,
        date TEXT NOT NULL
      )
    `, (err) => {
      if (err) console.error('❌ Error creating match_history table:', err);
      else console.log('✅ Match history table ready');
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
    } else {
      console.log('✅ Database connection closed.');
    }
    process.exit(0);
  });
});

module.exports = db;
