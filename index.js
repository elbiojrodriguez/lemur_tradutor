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

// Rota raiz obrigatória para o Railway
app.get('/', (req, res) => {
  res.status(200).send('Servidor de transcrição e WebSocket online');
});

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
const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`✅ Servidor rodando na porta ${server.address().port}`);
});

// Configuração do WebSocket
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false // Otimização para Railway
});

wss.on('connection', (ws) => {
  console.log('✅ Novo cliente WebSocket conectado!');
  
  ws.on('message', async (audioData) => {
    try {
      // Verifica se o dado é um Buffer
      const audioBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
      
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
    } catch (err) {
      console.error('❌ Erro na transcrição:', err);
      ws.send(JSON.stringify({ 
        status: 'error',
        message: 'Falha na transcrição do áudio'
      }));
    }
  });

  ws.on('close', () => {
    console.log('⚠️ Cliente WebSocket desconectado');
  });
});

// Rota POST para compatibilidade
const upload = multer();
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio enviado' });
    }

    const audioBuffer = req.file.buffer;
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

    res.json({ 
      status: 'success',
      text: transcription 
    });
  } catch (err) {
    console.error('❌ Erro na transcrição:', err);
    res.status(500).json({ 
      status: 'error',
      error: 'Erro no processamento do áudio' 
    });
  }
});

// Tratamento de erros global
process.on('unhandledRejection', (err) => {
  console.error('❌ Erro não tratado:', err);
});
