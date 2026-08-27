const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { sendCoachReadinessTeaserEmail } = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

const quizLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessment submissions. Please try again in 15 minutes.' },
});

const DIMENSIONS = [
  'coaching_clarity',
  'player_continuity',
  'operational_control',
  'business_visibility',
  'reflective_practice',
  'future_readiness',
];

const OPPORTUNITY_PRIORITY = [
  'operational_control',
  'business_visibility',
  'player_continuity',
  'coaching_clarity',
  'reflective_practice',
  'future_readiness',
];

const DIMENSION_DETAILS = {
  coaching_clarity: {
    label: 'Coaching Clarity',
    summary: 'Your coaching instincts are strong, but the underlying plan may not be as clear as it needs to be. Getting explicit about your priorities — and checking your decisions against them — is worth ten minutes a week.',
    nextMoves: [
      'Write down the two or three priorities that should shape your coaching week.',
      'Check one decision each week against those priorities.',
      'Give players a clear picture of what they are working towards.',
    ],
  },
  player_continuity: {
    label: 'Player Continuity',
    summary: 'You are probably holding more about each player than you have anywhere to show for it. Getting that picture out of memory and into one place is the single biggest lever available to you right now.',
    nextMoves: [
      'Keep each player’s goals and current focus together in one place.',
      'Finish every session with one observation and one next step.',
      'Review the player story before the next conversation or session.',
    ],
  },
  operational_control: {
    label: 'Operational Control',
    summary: 'You are probably running a better coaching operation than it feels like from inside it. Your coaching is not the issue. Much of the friction is happening around the coaching — scheduling, information, follow-up and day-to-day coordination.',
    nextMoves: [
      'Get player information out of scattered places.',
      'Create a consistent weekly operating rhythm.',
      'Make important information visible before you need it.',
    ],
  },
  business_visibility: {
    label: 'Business Visibility',
    summary: 'You likely know your coaching is working. What is less clear is exactly where — which players, which times, which parts of the business are actually carrying it. That visibility changes decisions.',
    nextMoves: [
      'Set aside one regular moment to review capacity, workload and income.',
      'Notice which parts of the week consistently create pressure or delay.',
      'Use one simple view to compare what is planned, delivered and followed up.',
    ],
  },
  reflective_practice: {
    label: 'Reflective Practice',
    summary: 'You are doing the work, but not always capturing what it teaches you. A small, consistent habit of review turns a season of experience into something you can actually build on.',
    nextMoves: [
      'Protect ten minutes after a key session for a short review.',
      'Capture one thing that worked and one thing to revisit.',
      'Look back at your notes before planning the next block of work.',
    ],
  },
  future_readiness: {
    label: 'Future Readiness',
    summary: 'Right now, a lot depends on you being available, remembering, and personally holding things together. That is fine at today’s size. It becomes the ceiling on how far this can grow.',
    nextMoves: [
      'List the weekly jobs that currently depend on you alone.',
      'Choose one recurring process to make clearer and repeatable.',
      'Decide what information another coach would need to continue the work well.',
    ],
  },
};

const STAGE_DETAILS = {
  reactive: { label: 'The Reactive Operator', startingPoint: 'Start with Dashboard, Players and Weekly Focus.' },
  capable: { label: 'The Capable Operator', startingPoint: 'Start with Player Continuity and Session Review.' },
  structured: { label: 'The Structured Operator', startingPoint: 'Explore Business Review and Scheduling.' },
  coherent: { label: 'The Coherent Operator', startingPoint: 'Explore Academy workflows and advanced intelligence.' },
  scalable: { label: 'The Scalable Operator', startingPoint: 'Explore academy implementation, leadership workflows and wider operational systems.' },
};

// These score keys are intentionally kept server-side so the stored report
// cannot be altered by a browser-submitted score.
const QUESTION_SCORES = {
  coaching_compass: { dimension: 'coaching_clarity', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  weekly_priorities: { dimension: 'coaching_clarity', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  last_session: { dimension: 'player_continuity', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  player_story: { dimension: 'player_continuity', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  rain_cancellation: { dimension: 'operational_control', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  message_traffic: { dimension: 'operational_control', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  business_picture: { dimension: 'business_visibility', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  time_leaks: { dimension: 'business_visibility', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  session_reflection: { dimension: 'reflective_practice', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
  growth_test: { dimension: 'future_readiness', options: { a: 100, b: 80, c: 60, d: 40, e: 20 } },
};

function getOperatingStage(overallScore) {
  if (overallScore <= 39) return 'reactive';
  if (overallScore <= 54) return 'capable';
  if (overallScore <= 69) return 'structured';
  if (overallScore <= 84) return 'coherent';
  return 'scalable';
}

function calculateReport(answers) {
  const scoresByDimension = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, []]));

  for (const [questionId, question] of Object.entries(QUESTION_SCORES)) {
    const answer = answers[questionId];
    if (typeof answer !== 'string' || question.options[answer] === undefined) {
      const error = new Error('Please answer every assessment question before continuing.');
      error.status = 400;
      throw error;
    }
    scoresByDimension[question.dimension].push(question.options[answer]);
  }

  const dimensionScores = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const values = scoresByDimension[dimension];
      return [dimension, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)];
    })
  );

  const overallScore = Math.round(
    DIMENSIONS.reduce((sum, dimension) => sum + dimensionScores[dimension], 0) / DIMENSIONS.length
  );

  const biggestOpportunity = [...DIMENSIONS].sort((left, right) => {
    const scoreDifference = dimensionScores[left] - dimensionScores[right];
    if (scoreDifference !== 0) return scoreDifference;
    return OPPORTUNITY_PRIORITY.indexOf(left) - OPPORTUNITY_PRIORITY.indexOf(right);
  })[0];

  const operatingStage = getOperatingStage(overallScore);
  const opportunity = DIMENSION_DETAILS[biggestOpportunity];

  return {
    dimensionScores,
    overallScore,
    operatingStage,
    operatingStageLabel: STAGE_DETAILS[operatingStage].label,
    biggestOpportunity,
    biggestOpportunityLabel: opportunity.label,
    opportunitySummary: opportunity.summary,
    nextMoves: opportunity.nextMoves,
    systemStartingPoint: STAGE_DETAILS[operatingStage].startingPoint,
  };
}

function normaliseInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const coachingRole = typeof body.coaching_role === 'string' ? body.coaching_role : '';
  const marketingConsent = body.marketing_consent === true;

  if (!name || name.length > 255) {
    const error = new Error('Please enter your name.');
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    const error = new Error('Please enter a valid email address.');
    error.status = 400;
    throw error;
  }
  if (!['independent', 'academy', 'other'].includes(coachingRole)) {
    const error = new Error('Please choose your coaching role.');
    error.status = 400;
    throw error;
  }
  if (!body.answers || Array.isArray(body.answers) || typeof body.answers !== 'object') {
    const error = new Error('Your assessment answers could not be read. Please try again.');
    error.status = 400;
    throw error;
  }

  return { name, email, coachingRole, marketingConsent, answers: body.answers };
}

router.post('/', quizLeadLimiter, async (req, res, next) => {
  try {
    const { name, email, coachingRole, marketingConsent, answers } = normaliseInput(req.body || {});
    const report = calculateReport(answers);

    const existingUser = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    const matchedUserId = existingUser.rows[0]?.id || null;

    const insertedLead = await query(
      `INSERT INTO quiz_leads (
        name, email, coaching_role, answers, dimension_scores, overall_score,
        operating_stage, biggest_opportunity, marketing_consent, matched_user_id, matched_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        name,
        email,
        coachingRole,
        JSON.stringify(answers),
        JSON.stringify(report.dimensionScores),
        report.overallScore,
        report.operatingStage,
        report.biggestOpportunity,
        marketingConsent,
        matchedUserId,
        matchedUserId ? new Date() : null,
      ]
    );

    let teaserEmailSent = false;
    try {
      await sendCoachReadinessTeaserEmail(email, name, report);
      await query(
        'UPDATE quiz_leads SET teaser_email_sent_at = NOW() WHERE id = $1',
        [insertedLead.rows[0].id]
      );
      teaserEmailSent = true;
    } catch (emailError) {
      logger.error('Coach readiness confirmation email failed', {
        error: emailError.message,
        quizLeadId: insertedLead.rows[0].id,
      });
    }

    res.status(201).json({
      id: insertedLead.rows[0].id,
      report,
      teaserEmailSent,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.calculateReport = calculateReport;
