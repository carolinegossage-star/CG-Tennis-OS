const VALID_COMPED_PLANS = new Set(['solo', 'professional']);

function getAccessContext(user) {
  const isAdmin = user?.is_admin === true;
  const isComped = !isAdmin && user?.is_comped === true;
  const compedPlan = isComped && VALID_COMPED_PLANS.has(user?.comped_plan)
    ? user.comped_plan
    : null;

  return {
    isAdmin,
    isComped,
    compedPlan,
    hasSubscriptionBypass: isAdmin || isComped,
    effectivePlan: isAdmin ? 'professional' : compedPlan || user?.subscription_plan || 'solo',
  };
}

function hasProfessionalAccess(user) {
  const access = getAccessContext(user);
  return access.isAdmin || access.effectivePlan === 'professional';
}

module.exports = { VALID_COMPED_PLANS, getAccessContext, hasProfessionalAccess };
