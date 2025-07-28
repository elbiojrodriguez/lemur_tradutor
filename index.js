import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());

// Configuração do Google Speech-to-Text
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const speechClient = new SpeechClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

// Servidor HTTP + WebSocket
const server = app.listen(process.env.PORT || 10000, () => {
  console.log(`Servidor rodando na porta ${server.address().port}`);
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('✅ Novo cliente WebSocket conectado!');
  
  ws.on('message', async (audioData) => {
    try {
      const [response] = await speechClient.recognize({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'pt-BR',
        },
        audio: {
          content: audioData.toString('base64'),
        },
      });

      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      ws.send(JSON.stringify({ text: transcription }));
    } catch (err) {
      console.error('Erro na transcrição:', err);
      ws.send(JSON.stringify({ error: 'Erro na transcrição' }));
    }
  });
});

// Rota POST original (opcional)
const upload = multer();
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const audioBytes = req.file.buffer.toString('base64');
    const [response] = await speechClient.recognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'pt-BR',
      },
      audio: {
        content: audioBytes,
      },
    });

    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    res.json({ text: transcription });
  } catch (err) {
    console.error('Erro na transcrição:', err);
    res.status(500).json({ error: 'Erro na transcrição' });
  }
});
