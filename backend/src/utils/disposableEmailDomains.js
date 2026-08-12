/**
 * Basic trial-abuse filtering: blocks the most common disposable/throwaway
 * email providers at registration, so one person can't loop free trials by
 * generating fresh addresses. This is a lightweight first line of defence,
 * not a complete anti-fraud system.
 */

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'maildrop.cc', 'dispostable.com',
  'fakeinbox.com', 'sharklasers.com', 'mailnesia.com', 'mintemail.com',
  'moakt.com', 'emailondeck.com', 'burnermail.io', 'mytemp.email',
]);

function isDisposableEmail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase().trim();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

module.exports = { isDisposableEmail };
