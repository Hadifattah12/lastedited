const db = require('../db/database');
const auth = require('../middlewares/auth');

async function friendRoutes(fastify, options) {
  fastify.addHook('onRequest', auth);

  // Send a friend request
  fastify.post('/friends/:friendId', async (req, reply) => {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);

    if (userId === friendId) {
      return reply.status(400).send({ error: "You can't add yourself." });
    }

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')`,
        [userId, friendId],
        function (err) {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Error sending request.' });
            reject(err);
          } else {
            reply.send({ message: 'Friend request sent.' });
            resolve();
          }
        }
      );
    });
  });

  // Accept a friend request
  fastify.patch('/friends/approve/:friendId', async (req, reply) => {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`,
        [friendId, userId],
        function (err) {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Error approving request.' });
            reject(err);
          } else {
            // Create reciprocal entry
            db.run(
              `INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')`,
              [userId, friendId],
              function (err2) {
                if (err2) {
                  req.log.error(err2);
                  reply.status(500).send({ error: 'Error creating reciprocal friendship.' });
                  reject(err2);
                } else {
                  reply.send({ message: 'Friend request accepted.' });
                  resolve();
                }
              }
            );
          }
        }
      );
    });
  });

  // Reject a friend request
  fastify.patch('/friends/reject/:friendId', async (req, reply) => {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);

    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
        [friendId, userId],
        function (err) {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Error rejecting request.' });
            reject(err);
          } else {
            reply.send({ message: 'Friend request rejected.' });
            resolve();
          }
        }
      );
    });
  });

  // Remove a friend - NEW ENDPOINT
  fastify.delete('/friends/:friendId', async (req, reply) => {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId, 10);

    return new Promise((resolve, reject) => {
      // Remove both directions of the friendship
      db.run(
        `DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
        [userId, friendId, friendId, userId],
        function (err) {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Error removing friend.' });
            reject(err);
          } else {
            reply.send({ message: 'Friend removed successfully.' });
            resolve();
          }
        }
      );
    });
  });

  // Get confirmed friends
  fastify.get('/friends', async (req, reply) => {
    const userId = req.user.id;
    const onlineUsers = req.server.onlineUsers;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT u.id, u.name, u.avatar FROM users u
         JOIN friends f ON u.id = f.friend_id
         WHERE f.user_id = ? AND f.status = 'accepted'`,
        [userId],
        (err, rows) => {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Failed to fetch friends.' });
            reject(err);
          } else {
            const result = rows.map(friend => ({
              ...friend,
              online: onlineUsers.has(friend.id),
            }));
            reply.send(result);
            resolve();
          }
        }
      );
    });
  });

  // Get pending requests received by user
  fastify.get('/friends/requests', async (req, reply) => {
    const userId = req.user.id;
    
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT u.id, u.name, u.avatar FROM users u
         JOIN friends f ON u.id = f.user_id
         WHERE f.friend_id = ? AND f.status = 'pending'`,
        [userId],
        (err, rows) => {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Failed to fetch pending requests.' });
            reject(err);
          } else {
            reply.send(rows);
            resolve();
          }
        }
      );
    });
  });

  // GET /friends/requests/sent  – outgoing requests you created
fastify.get('/friends/requests/sent', async (req, reply) => {
  const userId = req.user.id;
  db.all(
    `SELECT u.id, u.name, u.avatar
       FROM users u
       JOIN friends f ON u.id = f.friend_id
      WHERE f.user_id = ? AND f.status = 'pending'`,
    [userId],
    (err, rows) => {
      if (err) return reply.status(500).send({ error: 'Failed to fetch sent requests.' });
      reply.send(rows);
    }
  );
});


  // Search users with friendship status - UPDATED TO PREVENT DUPLICATES
  fastify.get('/friends/search', async (req, reply) => {
    const search = `%${req.query.name || ''}%`;
    const userId = req.user.id;
    
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          u.id, 
          u.name, 
          u.avatar,
          CASE 
            WHEN f1.status = 'accepted' THEN 'friends'
            WHEN f1.status = 'pending' THEN 'pending_sent'
            WHEN f2.status = 'pending' THEN 'pending_received'
            ELSE 'none'
          END as friendship_status
         FROM users u
         LEFT JOIN friends f1 ON u.id = f1.friend_id AND f1.user_id = ?
         LEFT JOIN friends f2 ON u.id = f2.user_id AND f2.friend_id = ?
         WHERE u.name LIKE ? AND u.id != ? 
         LIMIT 10`,
        [userId, userId, search, userId],
        (err, rows) => {
          if (err) {
            req.log.error(err);
            reply.status(500).send({ error: 'Search failed.' });
            reject(err);
          } else {
            reply.send(rows);
            resolve();
          }
        }
      );
    });
  });
}

module.exports = friendRoutes;