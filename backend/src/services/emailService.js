const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const from = process.env.EMAIL_FROM || 'CG Tennis OS <noreply@cgtennisos.com>';
const appUrl = process.env.APP_URL || 'https://cgtennisos.com';

async function send(to, subject, html) {
  try {
    await transporter.sendMail({ from, to, subject, html });
    logger.info('Email sent', { to, subject });
  } catch (err) {
    logger.error('Email send failed', { error: err.message, to });
    throw err;
  }
}

async function sendVerificationEmail(email, name, token) {
  const url = `${appUrl}/auth/verify-email?token=${token}`;
  await send(email, 'Verify your Tennis Coaching OS account', `
    <h2>Welcome to Tennis Coaching OS, ${name}!</h2>
    <p>Please verify your email address to get started.</p>
    <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
      Verify Email
    </a>
    <p>Or copy this link: ${url}</p>
    <p>This link expires in 24 hours.</p>
  `);
}

async function sendPasswordResetEmail(email, name, token) {
  const url = `${appUrl}/auth/reset-password?token=${token}`;
  await send(email, 'Reset your Tennis Coaching OS password', `
    <h2>Password Reset Request</h2>
    <p>Hi ${name}, you requested a password reset.</p>
    <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
      Reset Password
    </a>
    <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
  `);
}

async function sendAlertEmail(user, alert) {
  const severityColour = alert.severity === 'urgent' ? '#dc2626' : '#d97706';
  await send(user.email, `[${alert.severity.toUpperCase()}] ${alert.title}`, `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${severityColour};color:white;padding:16px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">${alert.title}</h2>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
        <p>Hi ${user.name},</p>
        <p>${alert.message}</p>
        ${alert.action_url ? `
          <a href="${appUrl}${alert.action_url}"
             style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px;">
            ${alert.action_label || 'View Details'}
          </a>
        ` : ''}
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">Tennis Coaching OS — Your coaching intelligence platform</p>
      </div>
    </div>
  `);
}

async function sendTrialNudgeEmail(email, name, missing) {
  const url = `${appUrl}/dashboard`;
  const missingList = missing.map((m) => `<li style="margin-bottom:6px;">${m.charAt(0).toUpperCase() + m.slice(1)}</li>`).join('');
  await send(email, "You're close to unlocking your free extra week", `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2>Hi ${name}, it's Coach Caroline G.</h2>
      <p>You've got a few days left on your trial, and you're close to unlocking an extra 7 days, free.</p>
      <p>Here's what's left:</p>
      <ul>${missingList}</ul>
      <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">
        Pick up where you left off
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">CG Tennis OS — Coaching Intelligence, Human Wisdom.</p>
    </div>
  `);
}

async function sendTrialDay7Email(email, name, progress = {}) {
  const url = `${appUrl}/dashboard`;
  await send(email, 'You’re halfway through your trial', `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2>Hi ${name},</h2>
      <p>You’re halfway through your trial. Here’s what you’ve already achieved.</p>
      <p>Keep turning your coaching work into a system you can build on every week.</p>
      <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">Continue building</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">CG Tennis OS — Coaching Intelligence, Human Wisdom.</p>
    </div>
  `);
}

async function sendTrialDay13Email(email, name) {
  const url = `${appUrl}/pricing`;
  await send(email, 'Your trial ends tomorrow', `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2>Hi ${name},</h2>
      <p>Your trial ends tomorrow. Here’s what you’ll lose if you don’t upgrade.</p>
      <p>Choose the plan that fits your active player caseload and keep your coaching data, reflections, and reports available.</p>
      <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">Review plans</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">CG Tennis OS — Coaching Intelligence, Human Wisdom.</p>
    </div>
  `);
}

async function sendTrialExtendedEmail(email, name) {
  const url = `${appUrl}/pricing`;
  await send(email, "Your trial has ended — here's an extra 7 days", `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2>Nice work, ${name}.</h2>
      <p>Your trial has ended — here’s an extra 7 days to finish exploring, or upgrade now.</p>
      <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">Explore plans</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">CG Tennis OS — Coaching Intelligence, Human Wisdom.</p>
    </div>
  `);
}

async function sendTrialExpiredEmail(email, name) {
  const url = `${appUrl}/pricing`;
  await send(email, 'Your CG Tennis OS trial has ended', `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2>Hi ${name},</h2>
      <p>Your trial has ended. Upgrade now to keep your data and continue using CG Tennis OS.</p>
      <a href="${url}" style="background:#1a4d2e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px;">Upgrade now</a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">CG Tennis OS — Coaching Intelligence, Human Wisdom.</p>
    </div>
  `);
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAlertEmail,
  sendTrialNudgeEmail,
  sendTrialDay7Email,
  sendTrialDay13Email,
  sendTrialExtendedEmail,
  sendTrialExpiredEmail,
};
