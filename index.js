import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cors = require('cors');

// Configurações iniciais
dotenv.config();
const app = express();
app.use(cors());

// Health Check obrigatório para o Railway
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    services: {
      http: true,
      websocket: true,
      google_api: true
    }
  });
});

// Health Check aprimorado (coloque ANTES do app.listen)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: Date.now(),
    checks: {
      memory: process.memoryUsage().rss,
      uptime: process.uptime()
    }
  });
});

// Configuração do Google Speech
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const speechClient = new SpeechClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

// Inicialização do servidor
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP/WebSocket rodando na porta ${PORT}`);
});

// Configuração robusta do WebSocket
const wss = new WebSocketServer({
  server,
  clientTracking: true,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    threshold: 1024
  }
});

// Heartbeat para manter conexão ativa
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.ping();
    }
  });
}, 30000);

// Lógica do WebSocket
wss.on('connection', (ws) => {
  console.log('🔌 Nova conexão WebSocket estabelecida');

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
        text: transcription,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Erro na transcrição:', error);
      ws.send(JSON.stringify({
        status: 'error',
        message: 'Erro no processamento do áudio',
        details: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Conexão WebSocket encerrada');
  });
});

// Rota POST alternativa
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
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

// Prevenção de encerramento abrupto
process.on('SIGTERM', () => {
  console.log('⚠️ Recebido SIGTERM, encerrando graciosamente...');
  server.close(() => {
    console.log('🛑 Servidor encerrado');
    process.exit(0);
  });
});

// Keep-alive para o Railway
setInterval(() => {
  console.log('🫀 Heartbeat: Servidor ativo');
}, 60000);
