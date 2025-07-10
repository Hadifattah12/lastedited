const path = require('path');
const fs = require('fs');
const util = require('util');
const pump = util.promisify(require('stream').pipeline);
const auth = require('../middlewares/auth');

async function avatarRoutes(fastify, options) {
  // Get avatar
  fastify.get('/uploads/:filename', async (request, reply) => {
    const filename = request.params.filename;
    const filePath = path.join(__dirname, '..', 'uploads', filename);

    if (fs.existsSync(filePath)) {
      return reply.type('image/png').send(fs.createReadStream(filePath));
    } else {
      return reply.code(404).send({ error: 'Avatar not found' });
    }
  });

  // Upload avatar
  fastify.post('/upload-avatar', { preHandler: auth }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const filename = `${Date.now()}_${data.filename}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', filename);
    await pump(data.file, fs.createWriteStream(uploadPath));

    // Update user avatar path in DB
    const userId = request.user.id;
    const db = require('../db/database');
    db.run(`UPDATE users SET avatar = ? WHERE id = ?`, [`/uploads/${filename}`, userId]);

    return reply.send({ message: 'Avatar uploaded successfully', avatar: `/uploads/${filename}` });
  });
}

module.exports = avatarRoutes;
