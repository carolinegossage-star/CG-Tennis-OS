# CGTennis OS — Hostinger Deployment Guide

This guide provides step-by-step instructions for deploying the Tennis Coaching OS application on Hostinger.

## Prerequisites

- Hostinger account with Node.js hosting plan
- PostgreSQL database (available on Hostinger)
- Cloudflare R2 account for file storage
- OpenAI API key for voice transcription
- Anthropic API key for AI coaching features

## Step 1: Environment Setup on Hostinger

### 1.1 Create Node.js Application

1. Log in to Hostinger control panel
2. Navigate to **Hosting** → **Manage**
3. Go to **Node.js** section
4. Click **Create Node.js Application**
5. Select Node.js version **18.x** or higher
6. Set application root to `/public_html`

### 1.2 Configure Environment Variables

1. In Hostinger control panel, navigate to **Node.js** → **Environment Variables**
2. Add the following variables:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://yourdomain.com

# Database (PostgreSQL on Hostinger)
DB_HOST=your_hostinger_db_host
DB_PORT=5432
DB_NAME=tennis_coaching_os
DB_USER=your_db_user
DB_PASSWORD=your_secure_db_password
DB_SSL=true
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_long
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_chars_long
JWT_REFRESH_EXPIRES_IN=7d

# Email (Hostinger SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_email_password
EMAIL_FROM=Tennis Coaching OS <noreply@yourdomain.com>

# Anthropic AI
ANTHROPIC_API_KEY=your_anthropic_api_key

# OpenAI (for voice transcription)
OPENAI_API_KEY=your_openai_api_key

# Cloudflare R2 (file storage)
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=tennis-coaching-os

# Frontend URL (for CORS)
FRONTEND_URL=https://yourdomain.com

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

## Step 2: Database Setup

### 2.1 Create PostgreSQL Database

1. In Hostinger control panel, go to **Databases** → **MySQL/PostgreSQL**
2. Click **Create Database**
3. Set database name: `tennis_coaching_os`
4. Note the host, username, and password

### 2.2 Run Database Migrations

1. Connect to your Hostinger server via SSH
2. Navigate to the backend directory: `cd public_html/backend`
3. Run migrations in order:

```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_additions.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_tournament_engine.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_tournament_engine_enum.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_tournament_engine_bracket_slot.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_tour_intelligence.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/migrate_voice_captures.sql
```

## Step 3: Cloudflare R2 Configuration

### 3.1 Create R2 Bucket

1. Log in to Cloudflare dashboard
2. Navigate to **R2** → **Create bucket**
3. Name the bucket: `tennis-coaching-os`
4. Leave CORS settings as default

### 3.2 Generate R2 API Token

1. Go to **R2** → **Settings** → **API tokens**
2. Click **Create API token**
3. Set permissions: `Object Read & Write`
4. Copy the credentials and add to environment variables

### 3.3 Configure CORS for R2

1. In R2 bucket settings, add CORS rule:

```json
{
  "AllowedOrigins": ["https://yourdomain.com"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}
```

## Step 4: Build and Deploy

### 4.1 Install Dependencies

```bash
cd /public_html/backend
npm install

cd /public_html/frontend
npm install
```

### 4.2 Build Frontend

```bash
cd /public_html/frontend
npm run build
```

The built files will be in `/public_html/frontend/dist`.

### 4.3 Start Application

In Hostinger control panel:

1. Go to **Node.js** → **Applications**
2. Select your application
3. Click **Start Application**

The application will start on the configured PORT and serve the frontend from the `dist` directory.

## Step 5: SSL/HTTPS Configuration

1. In Hostinger control panel, go to **SSL/TLS**
2. Enable **Free SSL** (Let's Encrypt)
3. Wait for certificate to be issued (usually 5-10 minutes)
4. Update `APP_URL` environment variable to use `https://`

## Step 6: Verify Deployment

### 6.1 Check Application Status

```bash
curl https://yourdomain.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Tennis Coaching OS API",
  "version": "1.0.0",
  "timestamp": "2026-07-19T12:00:00.000Z",
  "environment": "production"
}
```

### 6.2 Test Database Connection

```bash
curl -X POST https://yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### 6.3 Test File Upload (R2)

1. Log in to the application
2. Navigate to a session
3. Use the "Capture" voice recording feature
4. Verify audio file is uploaded to R2

## Step 7: Monitoring and Maintenance

### 7.1 Monitor Logs

```bash
tail -f /public_html/logs/app.log
```

### 7.2 Database Backups

1. In Hostinger control panel, go to **Databases** → **Backups**
2. Enable automatic daily backups
3. Set retention to at least 7 days

### 7.3 SSL Certificate Renewal

Hostinger automatically renews Let's Encrypt certificates. No manual action required.

## Troubleshooting

### Issue: Database Connection Failed

**Solution:**
- Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD` in environment variables
- Ensure database exists: `psql -h $DB_HOST -U $DB_USER -l`
- Check firewall rules allow connection from Hostinger server

### Issue: R2 Upload Fails

**Solution:**
- Verify R2 credentials in environment variables
- Check R2 bucket name matches `R2_BUCKET_NAME`
- Ensure R2 endpoint URL is correct (includes account ID)

### Issue: Voice Transcription Not Working

**Solution:**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI account has available API credits
- Review logs for specific error messages

### Issue: Application Not Starting

**Solution:**
- Check Node.js version is 18.x or higher
- Verify all dependencies installed: `npm install`
- Review logs in Hostinger control panel

## Performance Optimization

### 1. Enable Compression

Already enabled in `server.js` via `compression()` middleware.

### 2. Database Connection Pooling

Configured with `DB_POOL_MIN=2` and `DB_POOL_MAX=10`. Adjust based on traffic.

### 3. Redis Caching

Optional but recommended. Enable Redis in Hostinger and set `REDIS_URL` environment variable.

### 4. CDN for Static Assets

1. Set up Cloudflare CDN for your domain
2. Cache static files (CSS, JS, images) with TTL of 1 month

## Security Checklist

- [ ] SSL/HTTPS enabled
- [ ] JWT secrets are strong (min 32 characters)
- [ ] Database credentials are strong
- [ ] R2 API token has minimal required permissions
- [ ] CORS is restricted to your domain
- [ ] Rate limiting is enabled
- [ ] Helmet security headers are enabled
- [ ] Database backups are automated
- [ ] Logs are monitored for errors

## Support

For issues specific to Hostinger:
- Contact Hostinger support: https://support.hostinger.com
- Check Hostinger documentation: https://docs.hostinger.com

For application issues:
- Review logs: `/public_html/logs/app.log`
- Check database migrations completed successfully
- Verify all environment variables are set correctly
