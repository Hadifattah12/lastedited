// controllers/googleAuthController.js – now issues JWT via HttpOnly cookie
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');
const User   = require('../models/user');

/* ─────────────────────────────── OAuth client ────────────────────────────── */
const oauth2Client = new OAuth2Client({
  clientId    : process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri : process.env.GOOGLE_REDIRECT_URI,
  timeout     : 12_000
});

/* ─────────────────────────────── 1) /auth/google ─────────────────────────── */
const googleAuth = async (req, reply) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type : 'offline',
      prompt      : 'consent',
      scope       : scopes,
      state       : require('crypto').randomBytes(16).toString('hex'),
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });

    return reply.redirect(authUrl);
  } catch (err) {
    console.error('❌ Error generating Google auth URL:', err);
    reply.status(500).send({ error: 'Failed to initiate Google OAuth' });
  }
};

/* ─────────────────────────────── 2) callback ─────────────────────────────── */
const googleCallback = async (req, reply) => {
  try {
    const { code, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'https://localhost:5173';

    if (error || !code) {
      return reply.redirect(
        `${frontendUrl}/#/login?error=${encodeURIComponent(error || 'no_code')}`
      );
    }

    /* ---- exchange code → tokens ---- */
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI
    });
    if (!tokens.id_token) throw new Error('No ID token received from Google');

    /* ---- verify ID-token ---- */
    const ticket  = await oauth2Client.verifyIdToken({
      idToken : tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    /* ---- find or create user ---- */
    let user = await User.findByGoogleId(payload.sub);
    if (!user) {
      const existing = await User.findByEmail(payload.email);
      if (existing) {
        await User.updateGoogleId(existing.id, payload.sub);
        user = { ...existing, google_id: payload.sub };
      } else {
        // unique username
        let username = payload.name.toLowerCase().replace(/\s+/g, '');
        const base   = username;
        let i = 1;
        while (await User.findByName(username)) username = `${base}${i++}`;

        user = await User.createGoogleUser({
          name      : username,
          email     : payload.email,
          google_id : payload.sub,
          avatar    : payload.picture || '/uploads/default_avatar.png'
        });
      }
    }

    /* ---- issue JWT cookie (15-min access token) ---- */
    const token = req.server.jwt.sign({ id: user.id }, { expiresIn: '15m' });

    reply.setCookie('access_token', token, {
      httpOnly : true,
      sameSite : 'strict',
      secure   : true,
      path     : '/',
      maxAge   : 15 * 60
    });

    /* mark user online */
    req.server.onlineUsers.add(user.id);

    /* ---- hand non-sensitive user data to frontend (optional) ---- */
    const userB64 = Buffer.from(JSON.stringify({
      id   : user.id,
      name : user.name,
      email: user.email,
      avatar: user.avatar,
      is2FAEnabled: user.is2FAEnabled || false
    })).toString('base64');

    const redirectUrl = `${frontendUrl}/#/oauth-callback?user=${encodeURIComponent(userB64)}`;
    return reply.code(302).redirect(redirectUrl);
  } catch (err) {
    console.error('❌ Google OAuth callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'https://localhost:5173';
    reply.redirect(
      `${frontendUrl}/#/login?error=oauth_failed&message=${encodeURIComponent(err.message)}`
    );
  }
};

module.exports = { googleAuth, googleCallback };
