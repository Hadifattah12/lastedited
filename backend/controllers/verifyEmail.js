const User = require('../models/user');

const verifyEmail = async (request, reply) => {
  try {
    const { token } = request.query;
    if (!token) {
      return reply.status(400).send({ error: 'Verification token is required.' });
    }
    let user;
    try {
      user = await User.findByVerificationToken(token);
    } catch (dbErr) {
      request.log.error('DB error in findByVerificationToken:', dbErr);
      return reply.status(500).send({ error: 'Database error during verification.' });
    }

    if (!user) {
      return reply.status(400).send({ error: 'Invalid or expired verification token.' });
    }

    if (user.is_verified === 1) {
      return reply.send({ message: 'Email already verified.' });
    }
    try {
      await User.verifyEmail(user.id);
    } catch (dbErr) {
      request.log.error('DB error in verifyEmail:', dbErr);
      return reply.status(500).send({ error: 'Failed to update verification status.' });
    }
    return reply.send({ message: 'Email successfully verified! You can now login.' });
  } catch (err) {
    request.log.error('Unexpected error in verifyEmail:', err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

module.exports = verifyEmail;
