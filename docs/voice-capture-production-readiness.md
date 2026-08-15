# Voice Capture production readiness

The online Voice Capture path is already wired end to end and requires no application-code change in this repository.

The backend route is mounted at `/voice-capture`. An authenticated recording is uploaded to Cloudflare R2, transcribed, analysed through the existing AI service, stored in `voice_captures`, and linked to the session through `sessions.reflection_voice_url` and `sessions.reflection_text`.

The frontend component is rendered by `SessionReflection.jsx` with the selected `sessionId` and `playerId`. It uses `VITE_API_URL` and the existing `cgto_token` bearer-token convention. The live schema already contains `sessions.reflection_voice_url`; no ALTER TABLE is required.

## Required backend configuration

Set these variables on the VPS before enabling the online path:

```dotenv
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=tennis-coaching-os
R2_PUBLIC_URL=https://...
OPENAI_API_KEY=...
```

Do not commit secrets to the repository.

## Verification

The route verification boots the real `server.js` mount with R2, transcription, AI, and database calls stubbed. It confirms authentication, missing-file validation, upload, transcription, AI report storage, session linkage, coach scoping, deletion, and protection of all existing `trial_*` fields.

**Current result: 10/10 checks passed.**

## Offline sync scope note

The existing service-worker background-sync path remains a separate follow-up. Its endpoint, object-store name, field names, service-worker authentication approach, and IndexedDB handling do not currently match the online implementation. This documentation-only change does not alter that pre-existing PWA behaviour.

## Deployment checklist

1. Set the R2 and OpenAI variables on the VPS.
2. Confirm the frontend build uses `VITE_API_URL=https://api.cgtennisos.com`.
3. Deploy the existing frontend and backend build.
4. Record one authenticated session reflection.
5. Confirm the `voice_captures` row, session URL, and R2 object.
6. Treat offline background sync as a separate change request.

This file does not change trial state, CORS, authentication, database data, or route behaviour.

— Manus AI

## References

[1]: ../backend/src/routes/voiceCapture.js "CG Tennis OS Voice Capture route"
[2]: ../frontend/src/components/VoiceCapture.jsx "CG Tennis OS Voice Capture frontend component"
[3]: ../frontend/src/pages/SessionReflection.jsx "CG Tennis OS Session Reflection page"
[4]: ../backend/src/server.js "CG Tennis OS Express server mounts"
[5]: /home/ubuntu/upload/CURRENT_LIVE_STATE.md "Verified production live-state snapshot"
[6]: /home/ubuntu/upload/INTEGRATION_INSTRUCTIONS_FOR_MANUS.md "CG Tennis OS integration instructions"

[1] [2] [3] [4] [5] [6]

— Manus AI

**Status:** verified online Voice Capture integration; offline sync remains separate.

End of document.
