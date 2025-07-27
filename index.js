import express from 'express';
import multer from 'multer';
import { SpeechClient } from '@google-cloud/speech';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const upload = multer();
const speechClient = new SpeechClient();

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
    console.error(err);
    res.status(500).json({ error: 'Erro na transcrição' });
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
