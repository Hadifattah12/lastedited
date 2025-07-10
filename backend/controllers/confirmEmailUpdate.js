const User = require('../models/user');

module.exports = async function (req, reply) {
  const { token } = req.query;

  if (!token) return reply.status(400).send({ error: 'Token is required' });

  try {
    await User.confirmNewEmail(token);
    return reply.send({ message: 'Email has been successfully updated!' });
  } catch (err) {
    return reply.status(400).send({ error: err.toString() });
  }
};
