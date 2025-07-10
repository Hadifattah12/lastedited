// routes/auth.js  ------------------------------------------------------------
const { pipeline } = require('stream/promises');
const path         = require('path');
const fs           = require('fs');

const auth                       = require('../middlewares/auth');
const confirmEmailUpdate         = require('../controllers/confirmEmailUpdate');
const { toggle2FA }              = require('../controllers/authController');
const { googleAuth, googleCallback } = require('../controllers/googleAuthController');
const User = require('../models/user');
const db   = require('../db/database');        // ← single DB handle here

async function routes(fastify) {
  const { signUp, login, getProfile, verify2FA } =
    require('../controllers/authController');
  const verifyEmail  = require('../controllers/verifyEmail');
  const tournament   = require('../controllers/tournamentController');

  /* ---------- Public auth ---------- */
  fastify.post('/signup',     signUp);
  fastify.post('/login',      login);
  fastify.post('/verify-2fa', verify2FA);

  /* ---------- Google OAuth ---------- */
  fastify.get('/auth/google',          googleAuth);
  fastify.get('/auth/google/callback', googleCallback);

  /* ---------- Protected profile routes ---------- */
  fastify.get('/profile',       { preHandler: auth }, getProfile);
  fastify.patch('/profile/2fa', { preHandler: auth }, toggle2FA);

  /* ---------------------------------------------------------------------- */
  /* PATCH /profile  – update profile, propagate name change to history      */
  /* ---------------------------------------------------------------------- */
  fastify.patch('/profile', { preHandler: auth }, async (req, reply) => {
    const userId       = req.user.id;
    const currentUser  = await User.findById(userId);   // original values
    const oldName      = currentUser.name;

    const parts        = req.parts();
    const fields       = {};
    let   avatarPart;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'avatar')
        avatarPart = part;
      else if (part.type === 'field')
        fields[part.fieldname] = part.value.trim();
    }

    const { name, email, password } = fields;

    /* --- basic validation --- */
    if (!name && !email && !password && !avatarPart)
      return reply.status(400).send({ error: 'Nothing to update.' });

    if ((name && !email) || (email && !name))
      return reply.status(400).send({ error: 'Name and email are both required.' });

    /* --- uniqueness checks --- */
    if (email) {
      const owner = await User.findByEmail(email);
      if (owner && owner.id !== userId)
        return reply.status(400).send({ error: 'Email already in use.' });
    }
    if (name) {
      const owner = await User.findByName(name);
      if (owner && owner.id !== userId)
        return reply.status(400).send({ error: 'Display name already taken.' });
    }

    /* --- build update payload --- */
    const updatePayload = {};
    if (name)  updatePayload.name  = name;
    if (email) updatePayload.email = email;

    if (password && password.length >= 7) {
      updatePayload.password =
        await require('bcryptjs').hash(password, require('../models/user').SALT_ROUNDS || 8);
    }

    if (avatarPart) {
      const uploadPath = path.join(__dirname, '..', 'uploads', `${userId}_${avatarPart.filename}`);
      await pipeline(avatarPart.file, fs.createWriteStream(uploadPath));
      updatePayload.avatar = `/uploads/${userId}_${avatarPart.filename}`;
    }

    /* --- e-mail change: send confirmation token, defer real change --- */
    let isChangingEmail = false;
    if (updatePayload.email) {
      const crypto  = require('crypto');
      const token   = crypto.randomBytes(32).toString('hex');
      const mailer  = require('../services/emailService');
      const getURL  = require('../utils/getNgrokUrl');

      isChangingEmail =
        currentUser.email.toLowerCase() !== updatePayload.email.toLowerCase();

      if (isChangingEmail) {
        await User.setPendingEmail(userId, updatePayload.email, token);
        const confirmUrl = `${await getURL()}/api/confirm-new-email?token=${token}`;

        await mailer.sendMail({
          to      : updatePayload.email,
          subject : 'Confirm your new email',
          html    : `<p>Please confirm by clicking <a href="${confirmUrl}">here</a>.</p>`
        });

        delete updatePayload.email;        // keep old email until confirmed
      }
    }

    /* ---------- persist users table ---------- */
    if (Object.keys(updatePayload).length) {
      const setClause = Object.keys(updatePayload).map(k => `${k} = ?`).join(', ');
      await new Promise((res, rej) =>
        db.run(
          `UPDATE users SET ${setClause} WHERE id = ?`,
          [...Object.values(updatePayload), userId],
          err => (err ? rej(err) : res())
        )
      );
    }

    /* ---------- if display-name changed, cascade into match_history ----- */
    if (updatePayload.name && oldName !== updatePayload.name) {
      const newName = updatePayload.name;
      await new Promise((resolve, reject) => {
        db.run(
          `
          UPDATE match_history
             SET player1 = CASE WHEN player1 = ? THEN ? ELSE player1 END,
                 player2 = CASE WHEN player2 = ? THEN ? ELSE player2 END,
                 winner  = CASE WHEN winner  = ? THEN ? ELSE winner  END
           WHERE player1 = ? OR player2 = ? OR winner = ?
          `,
          [
            oldName, newName,  // player1
            oldName, newName,  // player2
            oldName, newName,  // winner
            oldName, oldName, oldName
          ],
          err => (err ? reject(err) : resolve())
        );
      });
    }

    /* ---------- respond ---------- */
    const refreshed = await User.findById(userId);
    let message = 'Profile updated.';
    if (isChangingEmail) message += ' Check your new inbox to confirm the change.';
    reply.send({ message, user: refreshed });
  });

  /* ---------- logout ---------- */
  fastify.post('/logout', { preHandler: auth }, (req, reply) => {
    req.server.onlineUsers.delete(req.user.id);
    reply.send({ message: 'Logged out successfully.' });
  });

  /* ---------- misc routes ---------- */
  fastify.get('/verify-email',        verifyEmail);
  fastify.get('/confirm-new-email',   confirmEmailUpdate);

  fastify.post('/tournament/start',         tournament.startTournament);
  fastify.post('/tournament/record-winner', tournament.recordWinner);
  fastify.post('/tournament/next-round',    tournament.nextRound);
  fastify.get('/tournament/matches',        tournament.getMatches);

  fastify.get('/health', async () => ({ status: 'OK' , message: 'API is running' }));
}

module.exports = routes;
