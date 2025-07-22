const axios = require('axios');

let cachedUrl = null;

const getNgrokUrl = async () => {
  if (cachedUrl) return cachedUrl;

  try {
    const response = await axios.get('http://c1r4s7.42beirut.com:4040/api/tunnels');
    const httpsTunnel = response.data.tunnels.find(t => t.proto === 'https');
    if (!httpsTunnel) throw new Error('No HTTPS ngrok tunnel found.');
    cachedUrl = httpsTunnel.public_url;
    return cachedUrl;
  } catch (err) {
    console.error('❌ Failed to get ngrok URL:', err.message);
    return 'http://c1r4s7.42beirut.com:3000'; // fallback
  }
};

module.exports = getNgrokUrl;
