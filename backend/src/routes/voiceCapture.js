const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const r2Service = require('../services/r2Service');
const transcriptionService = require('../services/transcriptionService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

// ─── Multer Configuration for In-Memory Upload ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format. Supported: WebM, MP3, WAV'));
    }
  },
});

// ─── POST /voice-capture/record — Upload and transcribe voice note ──────────────
router.post('/record', authenticate, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  const { session_id, player_id } = req.body;

  try {
    // Step 1: Upload audio to Cloudflare R2
    const r2Upload = await r2Service.uploadFile(
      req.file.buffer,
      `voice-${Date.now()}.${req.file.originalname.split('.').pop()}`,
      req.file.mimetype
    );

    logger.info('Voice file uploaded to R2', { userId: req.user.id, r2Key: r2Upload.key });

    // Step 2: Transcribe audio using OpenAI Whisper
    const transcription = await transcriptionService.transcribeAudio(
      req.file.buffer,
      req.file.originalname
    );

    logger.info('Voice transcribed', { userId: req.user.id, textLength: transcription.text.length });

    // Step 3: Generate AI-powered coaching report from transcription
    const aiReport = await aiService.queryAI(
      req.user.id,
      `You are a tennis coaching assistant. A coach has just recorded a voice note after a session. Analyze this transcript and generate a structured coaching report with: 1) Session Summary, 2) Key Observations, 3) Player Progress, 4) Recommended Actions. Keep it concise and actionable.\n\nTranscript:\n${transcription.text}`,
      { sessionId: session_id, playerId: player_id }
    );

    // Step 4: Save voice capture record to database
    const captureResult = await query(`
      INSERT INTO voice_captures (
        coach_id, session_id, player_id,
        audio_url, audio_key, transcript_text,
        ai_report, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `, [
      req.user.id,
      session_id || null,
      player_id || null,
      r2Upload.url,
      r2Upload.key,
      transcription.text,
      aiReport.response,
      transcription.duration || null,
    ]);

    const captureId = captureResult.rows[0].id;

    // Step 5: If session_id provided, update session with voice capture reference
    if (session_id) {
      await query(`
        UPDATE sessions
        SET reflection_voice_url = $1, reflection_text = $2
        WHERE id = $3 AND coach_id = $4
      `, [r2Upload.url, transcription.text, session_id, req.user.id]);

      logger.info('Session updated with voice capture', { sessionId: session_id, captureId });
    }

    res.status(201).json({
      captureId,
      transcript: transcription.text,
      aiReport: aiReport.response,
      audioUrl: r2Upload.url,
      message: 'Voice note captured and processed successfully',
    });
  } catch (err) {
    logger.error('Voice capture error', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: `Voice capture failed: ${err.message}` });
  }
});

// ─── GET /voice-capture/:id — Retrieve voice capture record ─────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, coach_id, session_id, player_id, audio_url, transcript_text,
             ai_report, duration_seconds, created_at
      FROM voice_captures
      WHERE id = $1 AND coach_id = $2
    `, [req.params.id, req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Voice capture not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Get voice capture error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch voice capture' });
  }
});

// ─── GET /voice-capture — List coach's voice captures ──────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { session_id, limit = 20, offset = 0 } = req.query;

  try {
    let sql = `
      SELECT id, session_id, player_id, transcript_text, ai_report,
             duration_seconds, created_at
      FROM voice_captures
      WHERE coach_id = $1
    `;
    const params = [req.user.id];
    let idx = 2;

    if (session_id) {
      sql += ` AND session_id = $${idx++}`;
      params.push(session_id);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json({ captures: result.rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    logger.error('List voice captures error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch voice captures' });
  }
});

// ─── DELETE /voice-capture/:id — Delete voice capture ────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Get the audio key before deleting
    const captureResult = await query(`
      SELECT audio_key FROM voice_captures
      WHERE id = $1 AND coach_id = $2
    `, [req.params.id, req.user.id]);

    if (!captureResult.rows.length) {
      return res.status(404).json({ error: 'Voice capture not found' });
    }

    const audioKey = captureResult.rows[0].audio_key;

    // Delete from R2
    if (audioKey) {
      await r2Service.deleteFile(audioKey).catch(e =>
        logger.warn('R2 delete failed during capture deletion', { error: e.message })
      );
    }

    // Delete from database
    await query('DELETE FROM voice_captures WHERE id = $1 AND coach_id = $2', [req.params.id, req.user.id]);

    res.json({ message: 'Voice capture deleted' });
  } catch (err) {
    logger.error('Delete voice capture error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete voice capture' });
  }
});

module.exports = router;
