const OpenAI = require('openai');
const logger = require('../utils/logger');

// ─── OpenAI Whisper Configuration ──────────────────────────────────────────────
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── Transcribe Audio File ────────────────────────────────────────────────────
async function transcribeAudio(audioBuffer, fileName = 'audio.webm') {
  try {
    const file = new File([audioBuffer], fileName, { type: 'audio/webm' });

    const transcript = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
      temperature: 0,
    });

    logger.info('Audio transcribed successfully', { fileName, duration: transcript.duration });

    return {
      text: transcript.text,
      duration: transcript.duration || null,
    };
  } catch (err) {
    logger.error('Transcription failed', { error: err.message, fileName });
    throw new Error(`Failed to transcribe audio: ${err.message}`);
  }
}

module.exports = {
  transcribeAudio,
};
