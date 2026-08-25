# CGTennis OS — The Operating System for Modern Tennis Coaching

**CGTennis OS** is a comprehensive, AI-powered coaching management system designed for professional tennis coaches. It combines real-time tournament management, player retention analytics, voice-to-report capture, and intelligent coaching insights into a unified platform.

## Features

### Core Coaching Tools

- **Session Logging & Reflection** — Record coaching sessions with structured reflection prompts based on the TennisMindset™ framework
- **Coaching Programmes & Participation** — Link reusable Individual, Pair and Group Programmes to Player Register entries and session attendance
- **Session Credit** — Record make-up time owed separately from attendance, income and retention
- **Manual Income & Renewals** — Maintain coach-controlled income records, Programme-linked packages and player renewal periods without payment automation
- **Voice Capture** — Record voice notes on court and automatically transcribe them into structured coaching reports using OpenAI Whisper
- **Player Retention Analytics** — Track player enjoyment, engagement, and burnout risk with predictive alerts
- **Tournament Management** — Manage tournament events, draws, brackets, and live match scoring
- **AI Coaching Assistant** — Get personalized coaching insights powered by Claude AI, informed by proprietary frameworks

### Business Intelligence

- **Business Metrics Dashboard** — Track revenue, player count, retention rates, and pricing optimization
- **Community Knowledge Hub** — Share and discover coaching strategies with other coaches
- **Safety Checklists** — Pre-session and post-session checklists for player safety and compliance
- **Alerts & Notifications** — Real-time alerts for player milestones, tournament deadlines, and retention risks

### Proprietary Frameworks

The system is built around evidence-based coaching frameworks:

- **Playing To Excel™** (1995) — Performance foundations
- **TennisNLP™** (2011) — Language patterns and behavioural coaching
- **TennisMindset™** (2016) — Mental performance and mindset
- **Fearless Futures™ Tennis** (2018) — Player confidence and growth
- **The Concord Framework™** (2020) — Nervous system regulation and performance under pressure
- **Apex Domain Engine™** — Business growth and coaching positioning

## Technology Stack

### Backend

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Caching:** Redis (optional)
- **AI Integration:** Anthropic Claude, OpenAI Whisper
- **File Storage:** Cloudflare R2
- **Authentication:** JWT
- **WebSockets:** Real-time tournament updates

### Frontend

- **Framework:** React 19
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router v7
- **State Management:** React Hooks

## Project Structure

```
cg-tennis-os/
├── backend/
│   ├── src/
│   │   ├── config/           # Database and Redis configuration
│   │   ├── middleware/       # Authentication and authorization
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic (AI, transcription, R2)
│   │   ├── utils/            # Logger and utilities
│   │   └── server.js         # Express application entry point
│   ├── scripts/              # Database migrations
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable React components
│   │   ├── pages/            # Page components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── App.jsx           # Main application component
│   │   └── main.jsx          # React entry point
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── HOSTINGER_DEPLOYMENT.md   # Deployment guide
└── README.md                 # This file
```

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- PostgreSQL 12+
- Redis (optional, for caching)
- OpenAI API key (for voice transcription)
- Anthropic API key (for AI coaching features)
- Cloudflare R2 credentials (for file storage)

### Local Development Setup

1. **Clone the repository**

```bash
git clone <repository-url>
cd cg-tennis-os
```

2. **Backend Setup**

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run migrate  # Run database migrations
npm run dev      # Start development server
```

3. **Frontend Setup**

```bash
cd frontend
npm install
npm run dev      # Start development server on http://localhost:5173
```

4. **Access the Application**

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

### Environment Variables

See `.env.example` in the backend directory for all required environment variables:

- **Database:** PostgreSQL connection details
- **Redis:** Optional caching layer
- **JWT:** Authentication secrets
- **Email:** SMTP configuration for notifications
- **Anthropic:** AI coaching features
- **OpenAI:** Voice transcription
- **Cloudflare R2:** File storage
- **Rate Limiting:** API rate limit configuration

## API Documentation

### Authentication

All API endpoints (except `/auth/login` and `/auth/register`) require a Bearer token:

```bash
Authorization: Bearer <jwt_token>
```

### Key Endpoints

#### Sessions

- `POST /sessions` — Create a new coaching session
- `GET /sessions` — List coach's sessions
- `GET /sessions/:id` — Get session details
- `POST /sessions/:id/reflection` — Save session reflection
- `POST /sessions/:id/debrief` — Save session debrief

#### Voice Capture

- `POST /voice-capture/record` — Upload and transcribe voice note
- `GET /voice-capture` — List voice captures
- `GET /voice-capture/:id` — Get voice capture details
- `DELETE /voice-capture/:id` — Delete voice capture

#### AI Assistant

- `POST /ai-assist/query` — Query AI coaching assistant
- `GET /ai-assist/history/:user_id` — Get AI interaction history
- `POST /ai-assist/session-plan` — Generate AI session plan

#### Players

- `GET /players` — List coach's players
- `POST /players` — Create new player
- `PUT /players/:id` — Update player profile

#### Programmes, Session Credit, Income and Renewals

- `GET` / `POST /programmes` — Manage coach-owned structured Coaching Programmes
- `GET` / `POST /session-credits` — View and record separate time-credit entries
- `GET` / `POST /income-records` — View and record manual income already received
- `GET /renewals`, `POST /renewals/packages`, `POST /renewals/enrolments` — Manage packages and player coaching periods

#### Tournaments

- `GET /tournaments` — List tournaments
- `GET /tournament-events/:eventId/live` — Live tournament dashboard
- `POST /tournament-matches/:matchId/score` — Update match score

## Voice Capture Feature

The "Capture" feature allows coaches to record voice notes on court, which are automatically transcribed and converted into structured coaching reports.

### How It Works

1. **Record** — Coach presses the "Capture" button and records a voice note
2. **Transcribe** — Audio is uploaded to Cloudflare R2 and transcribed using OpenAI Whisper
3. **Analyze** — Transcription is sent to Claude AI to generate a structured coaching report
4. **Save** — Report is saved to the session and available for review

### Usage

1. Navigate to a session's reflection view
2. Click the "🎙️ Capture" button
3. Speak your coaching observations
4. Click "⏹️ Stop" when finished
5. The system will process the audio and display the transcribed report

## Coach and Operations Documentation

- [Coach Guide: Packages, Renewals and Financial Tracking](./docs/coach-package-renewals-and-financial-tracking.md)
- [End-to-End Coaching Workflow Validation](./docs/e2e-coaching-workflow-validation.md)
- [CGTennisOS.Info Publication Guide](./docs/cgtennisos-info-publication-guide.md)

## Deployment

For detailed deployment instructions, see [HOSTINGER_DEPLOYMENT.md](./HOSTINGER_DEPLOYMENT.md).

### Quick Deploy to Hostinger

```bash
# 1. Build frontend
cd frontend && npm run build && cd ..

# 2. Install backend dependencies
cd backend && npm install && cd ..

# 3. Push to Hostinger via Git or SFTP
# 4. Set environment variables in Hostinger control panel
# 5. Run database migrations
# 6. Start Node.js application in Hostinger control panel
```

## Database Schema

Key tables:

- `users` — Coach and admin accounts
- `players` — Player profiles and metrics
- `sessions` — Coaching sessions with reflections
- `voice_captures` — Voice notes, transcriptions, and AI reports
- `tournaments` — Tournament events and management
- `tournament_matches` — Match scores and results
- `ai_assist_logs` — AI interaction history
- `business_metrics` — Revenue and retention tracking
- `alerts` — Notifications and alerts

## Security

- **SSL/TLS** — All connections encrypted
- **JWT Authentication** — Secure token-based auth
- **Rate Limiting** — Protect against abuse
- **Helmet** — Security headers enabled
- **CORS** — Restricted to authorized domains
- **Password Hashing** — bcryptjs for secure storage
- **SQL Injection Protection** — Parameterized queries

## Performance

- **Database Connection Pooling** — Efficient connection management
- **Redis Caching** — Optional caching layer for frequently accessed data
- **Compression** — gzip compression for API responses
- **Cloudflare R2** — Scalable file storage with CDN
- **Slow Query Detection** — Logs queries taking >1 second

## Monitoring

- **Winston Logger** — Structured logging to file and console
- **Audit Logs** — Track all user actions
- **Error Handling** — Comprehensive error logging
- **Health Check** — `/health` endpoint for monitoring

## Contributing

This is a production application. For modifications:

1. Create a feature branch
2. Make changes with comprehensive testing
3. Ensure all environment variables are documented
4. Update this README if adding new features
5. Test thoroughly before merging to main

## Support

For issues or questions:

1. Check the [HOSTINGER_DEPLOYMENT.md](./HOSTINGER_DEPLOYMENT.md) troubleshooting section
2. Review application logs: `./logs/app.log`
3. Verify all environment variables are set correctly
4. Check database migrations completed successfully

## License

Proprietary — All rights reserved

## Version

**1.0.0** — July 2026

---

**Built for professional tennis coaches who demand precision, intelligence, and simplicity.**
