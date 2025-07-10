const auth = async (request, reply) => {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ error: 'Access denied. No token provided.' });
    }

    const decoded = request.server.jwt.verify(token);
    request.user = decoded;
    
    // Continue to the next handler
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid token.' });
  }
};

module.exports = auth;