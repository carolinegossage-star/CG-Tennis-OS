# CGTennis OS — Production Deployment Checklist

Use this checklist to verify the application is ready for production deployment on Hostinger.

## Pre-Deployment

### Code Quality

- [ ] All console.log statements removed (use logger instead)
- [ ] No hardcoded credentials or secrets in code
- [ ] Error handling implemented for all async operations
- [ ] Input validation on all API endpoints
- [ ] SQL injection protection verified (parameterized queries)
- [ ] XSS protection enabled (Helmet CSP)
- [ ] CORS properly configured for production domain

### Frontend

- [ ] Build succeeds without warnings: `npm run build`
- [ ] No console errors in production build
- [ ] Environment variables configured for production
- [ ] API base URL points to production backend
- [ ] All routes tested and working
- [ ] Mobile responsiveness verified
- [ ] Accessibility (a11y) checks passed
- [ ] Performance optimizations applied (lazy loading, code splitting)

### Backend

- [ ] All dependencies up to date: `npm outdated`
- [ ] No security vulnerabilities: `npm audit`
- [ ] Database migrations tested locally
- [ ] Environment variables documented in .env.example
- [ ] Rate limiting configured appropriately
- [ ] Logging configured for production (file-based)
- [ ] Error handling returns appropriate HTTP status codes
- [ ] WebSocket connections tested for tournament features

### Database

- [ ] PostgreSQL version compatible (12+)
- [ ] All migration scripts tested
- [ ] Database indexes created for performance
- [ ] Connection pooling configured (min=2, max=10)
- [ ] SSL enabled for database connections
- [ ] Backup strategy defined
- [ ] Database user has minimal required permissions

### External Services

- [ ] Anthropic API key obtained and tested
- [ ] OpenAI API key obtained and tested
- [ ] Cloudflare R2 bucket created and configured
- [ ] R2 CORS settings configured
- [ ] R2 API token permissions verified
- [ ] SMTP credentials for email notifications
- [ ] All API keys stored in environment variables (not in code)

## Hostinger Configuration

### Hosting Setup

- [ ] Node.js application created in Hostinger
- [ ] Node.js version set to 18.x or higher
- [ ] Application root set to `/public_html`
- [ ] All environment variables added to Hostinger control panel
- [ ] SSL certificate issued and enabled
- [ ] Domain points to Hostinger nameservers

### Database Setup

- [ ] PostgreSQL database created
- [ ] Database user created with appropriate permissions
- [ ] Database host, port, credentials noted
- [ ] All migration scripts executed successfully
- [ ] Database connection from Hostinger server verified
- [ ] Automatic backups enabled (daily)

### File Storage

- [ ] Cloudflare R2 bucket created
- [ ] R2 API credentials added to environment variables
- [ ] R2 endpoint URL verified (includes account ID)
- [ ] CORS rules configured for production domain
- [ ] Public read access enabled for uploaded files

## Security Verification

### Authentication & Authorization

- [ ] JWT secret is strong (min 32 characters, random)
- [ ] JWT refresh secret is different from main secret
- [ ] Token expiration times set appropriately (15m access, 7d refresh)
- [ ] Password hashing uses bcryptjs (not plain text)
- [ ] Role-based access control (RBAC) working correctly
- [ ] Admin endpoints require super_admin role
- [ ] User data isolation verified (coaches can only see their own data)

### API Security

- [ ] Rate limiting enabled (100 requests per 15 minutes)
- [ ] Auth endpoints have stricter rate limiting (10 attempts per 15 minutes)
- [ ] Helmet security headers enabled
- [ ] CORS restricted to production domain only
- [ ] Content Security Policy (CSP) configured
- [ ] X-Frame-Options set to DENY
- [ ] X-Content-Type-Options set to nosniff

### Data Protection

- [ ] Database connections use SSL/TLS
- [ ] Sensitive data (passwords, tokens) never logged
- [ ] Audit logs enabled for all sensitive operations
- [ ] File uploads validated (type, size)
- [ ] Uploaded files stored in R2 (not in application directory)
- [ ] Sensitive files not accessible via HTTP

## Deployment Steps

### Pre-Deployment

- [ ] Create backup of current production (if upgrading)
- [ ] Test all features in staging environment
- [ ] Database migrations tested on staging database
- [ ] Rollback plan documented

### Deployment

- [ ] Frontend built: `npm run build`
- [ ] Backend dependencies installed: `npm install`
- [ ] Environment variables verified in Hostinger
- [ ] Database migrations executed
- [ ] Application started in Hostinger control panel
- [ ] Health check endpoint responds: `curl https://yourdomain.com/health`

### Post-Deployment

- [ ] Application logs checked for errors
- [ ] All API endpoints tested
- [ ] Voice capture feature tested end-to-end
- [ ] File uploads to R2 verified
- [ ] AI features (Claude, Whisper) tested
- [ ] Email notifications tested
- [ ] Database backups verified
- [ ] SSL certificate verified (https working)
- [ ] Performance acceptable (response times <500ms)

## Monitoring Setup

### Logging

- [ ] Application logs accessible: `/public_html/logs/app.log`
- [ ] Log rotation configured (prevent disk full)
- [ ] Error logs monitored for issues
- [ ] Slow query logs reviewed

### Alerting

- [ ] Uptime monitoring configured (e.g., Uptimerobot)
- [ ] Error rate monitoring in place
- [ ] Database connection pool monitoring
- [ ] R2 storage quota monitoring

### Backups

- [ ] Database backups automated (daily)
- [ ] Backup retention set to 7+ days
- [ ] Backup restoration tested
- [ ] Application code version controlled (Git)

## Performance Optimization

- [ ] Database indexes created for frequently queried columns
- [ ] Redis caching enabled (if available)
- [ ] Frontend assets minified and gzipped
- [ ] Lazy loading implemented for images
- [ ] API response times <500ms for 95th percentile
- [ ] Database query times <100ms for 95th percentile
- [ ] No N+1 query problems

## Maintenance Plan

### Regular Tasks

- [ ] Weekly: Review error logs
- [ ] Weekly: Check database backup status
- [ ] Monthly: Review performance metrics
- [ ] Monthly: Update dependencies (security patches)
- [ ] Quarterly: Full security audit
- [ ] Quarterly: Database optimization (VACUUM, ANALYZE)

### Incident Response

- [ ] Runbook created for common issues
- [ ] Emergency contact information documented
- [ ] Rollback procedure tested
- [ ] Communication plan for outages

## Documentation

- [ ] README.md complete and up to date
- [ ] HOSTINGER_DEPLOYMENT.md complete
- [ ] API documentation available
- [ ] Environment variables documented
- [ ] Database schema documented
- [ ] Troubleshooting guide created

## Sign-Off

- [ ] Project Manager: _________________ Date: _______
- [ ] DevOps/Hosting: _________________ Date: _______
- [ ] Security Review: _________________ Date: _______
- [ ] QA Testing: _________________ Date: _______

---

**Deployment Date:** _____________

**Deployed By:** _____________

**Notes:** 

_____________________________________________________________________________

_____________________________________________________________________________
