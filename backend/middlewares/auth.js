// middleware/auth.js  – updated for cookie-based JWT
const auth = async (request, reply) => {
  try {
    /* fastify-jwt will now look for the token in the access_token cookie */
    await request.jwtVerify();       // throws if missing/invalid
    // request.user is now populated (e.g., { id: 3, iat: …, exp: … })
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid or missing token.' });
  }
};

module.exports = auth;
