import express from 'express';
import multer from 'multer';
import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const upload = multer();

// 🔐 Carrega credenciais da variável de ambiente
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const speechClient = new SpeechClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const audioBytes = req.file.buffer.toString('base64');

    const [response] = await speechClient.recognize({
      config: {
        encoding: 'WEBM_OPUS', // ajuste conforme o formato do áudio
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
