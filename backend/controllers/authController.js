// authController.js  – cookie-based JWT implementation
const User        = require('../models/user');
const bcrypt      = require('bcryptjs');
const crypto      = require('crypto');
const transporter = require('../services/emailService');

/* ------------------------------------------------------------------ */
/*  SIGN-UP                                                           */
/* ------------------------------------------------------------------ */
const signUp = async (request, reply) => {
  try {
    const { name, email, password } = request.body;
    if (!name || !email || !password)   return reply.status(400).send({ error: 'All fields are required.' });
    if (password.length < 7)            return reply.status(400).send({ error: 'Password must be at least 7 characters.' });
    if (!email.includes('@'))           return reply.status(400).send({ error: 'Invalid email format.' });

    if (await User.findByEmail(email))  return reply.status(400).send({ error: 'Email already registered.' });
    if (await User.findByName(name))    return reply.status(400).send({ error: 'Name already registered.' });

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      name,
      email,
      password,
      is_verified: 0,
      verification_token: emailVerificationToken,
      avatar: '/uploads/default-avatar.png'
    });

    const getNgrokUrl  = require('../utils/getNgrokUrl');
    const BASE_URL     = await getNgrokUrl();
    const verificationUrl = `${BASE_URL}/api/verify-email?token=${emailVerificationToken}`;

    await transporter.sendMail({
      from   : process.env.EMAIL_USER,
      to     : email,
      subject: 'Verify your email',
      html   : `<p>Hi ${name},</p><p>Please verify your email:</p><a href="${verificationUrl}">Verify Email</a>`
    });

    return reply.status(201).send({
      message: 'User created successfully. Please check your email to verify your account.',
      user   : { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

/* ------------------------------------------------------------------ */
/*  LOGIN                                                             */
/* ------------------------------------------------------------------ */
const login = async (request, reply) => {
  try {
    const { email, password } = request.body;
    if (!email || !password) return reply.status(400).send({ error: 'Email and password are required.' });

    const user = await User.findByEmail(email);
    if (!user) return reply.status(400).send({ error: 'Invalid credentials.' });

    if (user.is_verified === 0) return reply.status(403).send({ error: 'Please verify your email before logging in.' });
    if (!(await bcrypt.compare(password, user.password))) return reply.status(400).send({ error: 'Invalid credentials.' });

    /* ------------------------ 2FA enabled -------------------------- */
    if (user.is2FAEnabled === 1) {
      const twoFACode   = Math.floor(100000 + Math.random() * 900000).toString();
      const twoFAExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await User.store2FACode(user.id, twoFACode, twoFAExpiry);

      await transporter.sendMail({
        from   : process.env.EMAIL_USER,
        to     : email,
        subject: 'Your 2FA Verification Code',
        html   : `<p>Hi ${user.name},</p><p>Your 2FA verification code is: <strong>${twoFACode}</strong></p><p>This code will expire in 10 minutes.</p>`
      });

      return reply.send({
        message    : '2FA code sent to your email',
        user       : { id: user.id, name: user.name, email: user.email, avatar: user.avatar, is2FAEnabled: true },
        requires2FA: true
      });
    }

    /* ---------------------- no 2FA → issue cookie ------------------ */
    const token = request.server.jwt.sign({ id: user.id }, { expiresIn: '15m' });
    request.server.onlineUsers.add(user.id);

    reply
      .setCookie('access_token', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure  : true,
        path    : '/',
        maxAge  : 15 * 60
      })
      .send({
        message: 'Login successful',
        user   : { id: user.id, name: user.name, email: user.email, avatar: user.avatar, is2FAEnabled: false }
      });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

/* ------------------------------------------------------------------ */
/*  VERIFY 2FA                                                        */
/* ------------------------------------------------------------------ */
const verify2FA = async (request, reply) => {
  try {
    const { email, code } = request.body;
    if (!email || !code) return reply.status(400).send({ error: 'Email and 2FA code are required.' });

    const user = await User.findByEmail(email);
    if (!user) return reply.status(400).send({ error: 'User not found.' });
    if (user.is2FAEnabled !== 1) return reply.status(400).send({ error: '2FA is not enabled for this user.' });
    if (!(await User.verify2FACode(user.id, code))) return reply.status(400).send({ error: 'Invalid or expired 2FA code.' });

    await User.clear2FACode(user.id);

    const token = request.server.jwt.sign({ id: user.id }, { expiresIn: '15m' });
    request.server.onlineUsers.add(user.id);

    reply
      .setCookie('access_token', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure  : true,
        path    : '/',
        maxAge  : 15 * 60
      })
      .send({
        message: '2FA verification successful',
        user   : { id: user.id, name: user.name, email: user.email, avatar: user.avatar, is2FAEnabled: true }
      });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

/* ------------------------------------------------------------------ */
/*  GET PROFILE                                                       */
/* ------------------------------------------------------------------ */
const getProfile = async (request, reply) => {
  try {
    const user = await User.findById(request.user.id);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return reply.send({ user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, is2FAEnabled: user.is2FAEnabled } });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

/* ------------------------------------------------------------------ */
/*  TOGGLE 2FA                                                        */
/* ------------------------------------------------------------------ */
const toggle2FA = async (request, reply) => {
  try {
    const userId = request.user.id;
    const user   = await User.findById(userId);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const newStatus = user.is2FAEnabled === 1 ? 0 : 1;
    await User.update2FAStatus(userId, newStatus);

    return reply.send({
      message      : `2FA has been ${newStatus ? 'enabled' : 'disabled'}.`,
      is2FAEnabled : !!newStatus
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Failed to toggle 2FA.' });
  }
};

module.exports = { signUp, login, verify2FA, getProfile, toggle2FA };
