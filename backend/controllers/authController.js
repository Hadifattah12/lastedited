// Updated authController.js
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const transporter = require('../services/emailService');

const signUp = async (request, reply) => {
  try {
    const { name, email, password } = request.body;
    if (!name || !email || !password) {
      return reply.status(400).send({ error: 'All fields are required.' });
    }
    if (password.length < 7) {
      return reply.status(400).send({ error: 'Password must be at least 7 characters.' });
    }
    if (!email.includes('@')) {
      return reply.status(400).send({ error: 'Invalid email format.' });
    }
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return reply.status(400).send({ error: 'Email already registered.' });
    }
    const existingName = await User.findByName(name);
     if (existingName) {
      return reply.status(400).send({ error: 'name already registered.' });
    }
    // Generate email verification token (random 32 bytes hex string)
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      name,
      email,
      password,
      is_verified: 0,
      verification_token: emailVerificationToken,
      avatar: '/uploads/default-avatar.png'
    });

    // const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
    const getNgrokUrl = require('../utils/getNgrokUrl');
    const BASE_URL = await getNgrokUrl();
    const verificationUrl = `${BASE_URL}/api/verify-email?token=${emailVerificationToken}`;
    try {
    await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify your email',
    html: `<p>Hi ${name},</p>
           <p>Please verify your email:</p>
           <a href="${verificationUrl}">Verify Email</a>`,
    });
    } catch (emailError) {
    request.log.error('Email failed:', emailError);
    return reply.status(500).send({ error: 'Failed to send verification email. Please try again later.' });
    }

    return reply.status(201).send({
      message: 'User created successfully. Please check your email to verify your account.',
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

const login = async (request, reply) => {
  try {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required.' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return reply.status(400).send({ error: 'Invalid credentials.' });
    }

    // Check if email is verified
    if (user.is_verified === 0) {
      return reply.status(403).send({ error: 'Please verify your email before logging in.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return reply.status(400).send({ error: 'Invalid credentials.' });
    }

    // Check if 2FA is enabled
    if (user.is2FAEnabled === 1) {
      // Generate 2FA code (6 digit number)
      const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
      const twoFAExpiry = new Date(Date.now() + 10 * 60 * 1000);

      // Store 2FA code in database
      await User.store2FACode(user.id, twoFACode, twoFAExpiry);

      // Send 2FA code via email
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Your 2FA Verification Code',
          html: `<p>Hi ${user.name},</p>
                 <p>Your 2FA verification code is: <strong>${twoFACode}</strong></p>
                 <p>This code will expire in 10 minutes.</p>
                 <p>If you didn't request this, please ignore this email.</p>`,
        });
      } catch (emailError) {
        request.log.error('2FA Email failed:', emailError);
        return reply.status(500).send({ error: 'Failed to send 2FA code. Please try again later.' });
      }

      return reply.send({
        message: '2FA code sent to your email',
        user: { id: user.id, name: user.name, email: user.email,avatar: user.avatar, is2FAEnabled: true },
        requires2FA: true
      });
    }

    // No 2FA required, generate token directly
    const token = request.server.jwt.sign({ id: user.id });
    request.server.onlineUsers.add(user.id);
    return reply.send({
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email, is2FAEnabled: false,avatar: user.avatar,},
      token,
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

const verify2FA = async (request, reply) => {
  try {
    const { email, code } = request.body;

    if (!email || !code) {
      return reply.status(400).send({ error: 'Email and 2FA code are required.' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return reply.status(400).send({ error: 'User not found.' });
    }

    // Check if user has 2FA enabled
    if (user.is2FAEnabled !== 1) {
      return reply.status(400).send({ error: '2FA is not enabled for this user.' });
    }

    // Verify 2FA code
    const isValidCode = await User.verify2FACode(user.id, code);
    if (!isValidCode) {
      return reply.status(400).send({ error: 'Invalid or expired 2FA code.' });
    }

    // Clear the 2FA code after successful verification
    await User.clear2FACode(user.id);

    // Generate JWT token
    const token = request.server.jwt.sign({ id: user.id },{ expiresIn: '1h' });
    request.server.onlineUsers.add(user.id);
    return reply.send({
      message: '2FA verification successful',
      user: { id: user.id, name: user.name, email: user.email,avatar: user.avatar,is2FAEnabled: user.is2FAEnabled, },
      token,
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

const getProfile = async (request, reply) => {
  try {
    const user = await User.findById(request.user.id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({
      user: { id: user.id, name: user.name, email: user.email,avatar: user.avatar,is2FAEnabled: user.is2FAEnabled,},
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
};

const toggle2FA = async (request, reply) => {
  try {
    const userId = request.user.id;

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Flip the status (1 → 0 or 0 → 1)
    const newStatus = user.is2FAEnabled === 1 ? 0 : 1;
    await User.update2FAStatus(userId, newStatus);

    return reply.send({
      message: `2FA has been ${newStatus ? 'enabled' : 'disabled'}.`,
      is2FAEnabled: !!newStatus,
    });
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Failed to toggle 2FA.' });
  }
};


module.exports = { signUp, login, verify2FA, getProfile,toggle2FA};