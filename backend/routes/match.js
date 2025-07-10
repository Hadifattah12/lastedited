const db = require('../db/database');

module.exports = function (fastify, opts, done) {
  // Save a new match result
  fastify.post('/api/matches', async (req, reply) => {
    const { player1, player2, winner, score1, score2 } = req.body;

    if (!player1 || !player2 || !winner || score1 == null || score2 == null) {
      return reply.status(400).send({ error: 'Missing match data' });
    }

    const date = new Date().toISOString(); // ✅ Full timestamp

    db.run(
      `INSERT INTO match_history (player1, player2, winner, score1, score2, date) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [player1, player2, winner, score1, score2, date],
      function (err) {
        if (err) {
          console.error('Error inserting match:', err);
          return reply.status(500).send({ error: 'Failed to save match' });
        }

        // ✅ FIXED HERE
        return reply.send({ message: 'Match saved', matchId: this.lastID });
      }
    );
  });

  // Get all matches for a user
// GET all matches for a user
const db = require('../db/database');

// Helper to wrap db.all in a Promise
function getMatchesForUser(name) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM match_history 
       WHERE player1 = ? OR player2 = ?
       ORDER BY date DESC`,
      [name, name],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

// Route to get match history
fastify.get('/api/matches/:name', async (req, reply) => {
  const { name } = req.params;

  try {
    const matches = await getMatchesForUser(name);
    return reply.send(matches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    return reply.status(500).send({ error: 'Failed to fetch matches' });
  }
});

// GET match stats for a user
// Add this in your backend routes
  fastify.get('/api/stats/:name', async (req, reply) => {
    const { name } = req.params;

    try {
      db.get(
        `SELECT 
           SUM(CASE WHEN winner = ? THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN (player1 = ? OR player2 = ?) AND winner != ? THEN 1 ELSE 0 END) AS losses
         FROM match_history`,
        [name, name, name, name],
        (err, row) => {
          if (err) {
            console.error('❌ DB error:', err);
            return reply.status(500).send({ error: 'Failed to fetch stats' });
          }

          const stats = {
            wins: row?.wins || 0,
            losses: row?.losses || 0,
          };

          console.log('📊 Stats sent:', stats);
          reply.send(stats); // ✅ Only reply once
        }
      );
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      return reply.status(500).send({ error: 'Unexpected server error' });
    }
  });



  done();
};
