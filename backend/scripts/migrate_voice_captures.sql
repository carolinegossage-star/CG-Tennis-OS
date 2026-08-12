-- ─── Voice Captures Table ─────────────────────────────────────────────────────
-- Stores voice recordings, transcriptions, and AI-generated reports from coaching sessions

CREATE TABLE IF NOT EXISTS voice_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  
  -- Audio file storage
  audio_url TEXT NOT NULL,
  audio_key TEXT NOT NULL,
  duration_seconds INTEGER,
  
  -- Transcription and AI analysis
  transcript_text TEXT,
  ai_report TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexing for performance
  INDEX idx_voice_captures_coach_id (coach_id),
  INDEX idx_voice_captures_session_id (session_id),
  INDEX idx_voice_captures_created_at (created_at DESC)
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_voice_captures_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_captures_timestamp_trigger
BEFORE UPDATE ON voice_captures
FOR EACH ROW
EXECUTE FUNCTION update_voice_captures_timestamp();
