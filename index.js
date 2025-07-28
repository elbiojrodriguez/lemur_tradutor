import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cors = require('cors');

// Basic configuration
dotenv.config();
const app = express();
app.use(cors());

// Minimal health check endpoints
app.get('/', (req, res) => res.send('Server is running'));
app.get('/health', (req, res) => res.sendStatus(200));

// Google Speech configuration
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const speechClient = new SpeechClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

// Server initialization
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket setup
const wss = new WebSocketServer({ server });

// WebSocket connection maintenance
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.ping();
    }
  });
}, 30000);

// WebSocket message handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const audioBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
      const [response] = await speechClient.recognize({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'pt-BR',
        },
        audio: {
          content: audioBuffer.toString('base64'),
        },
      });

      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      ws.send(JSON.stringify({
        status: 'success',
        text: transcription
      }));
    } catch (error) {
      console.error('Transcription error:', error);
      ws.send(JSON.stringify({
        status: 'error',
        message: 'Audio processing failed'
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Audio file transcription endpoint
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received' });
    }

    const [response] = await speechClient.recognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'pt-BR',
      },
      audio: {
        content: req.file.buffer.toString('base64'),
      },
    });

    res.json({
      status: 'success',
      text: response.results.map(r => r.alternatives[0].transcript).join('\n')
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server terminated');
    process.exit(0);
  });
});

// Server keep-alive
setInterval(() => {
  console.log('Server heartbeat');
}, 60000);
