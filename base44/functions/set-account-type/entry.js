import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { fail, forbidden, ok, serverError, unauthorized } from '../../shared/http.js';
import { currentUser, displayName } from '../../shared/guards.js';
import { PHASE1_SERVICES } from '../../shared/phase1-catalogue.js';
import { canSelectProviderExperience } from '../../shared/marketplace.js';

const providerOnboardingOpen = () => PHASE1_SERVICES.some((service) => service.flags.provider_onboarding_enabled === true);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { account_type } = await req.json();
    if (!['customer', 'tradie'].includes(account_type)) return fail('Choose a valid account type.');

    const onboardingOpen = providerOnboardingOpen();
    let providerProfiles = [];
    if (account_type === 'tradie' && user.account_type !== 'tradie') {
      const [profiles, approvedOfferings] = await Promise.all([
        base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id }),
        base44.asServiceRole.entities.ProviderOffering.filter({ provider_id: user.id, review_status: 'approved' }),
      ]);
      providerProfiles = profiles;
      // Closing onboarding must not strand a previously established provider who
      // temporarily used the customer experience. It blocks only a net-new one.
      if (!canSelectProviderExperience({
        currentAccountType: user.account_type,
        onboardingOpen,
        hasProfile: profiles.length > 0,
        hasApprovedOffering: approvedOfferings.length > 0,
      })) {
        return forbidden('Provider onboarding is not currently available.');
      }
    }

    const updated = user.account_type === account_type
      ? user
      : await base44.asServiceRole.entities.User.update(user.id, { account_type });
    if (account_type === 'tradie' && onboardingOpen) {
      const profiles = providerProfiles.length
        ? providerProfiles
        : await base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id });
      if (!profiles.length) {
        await base44.asServiceRole.entities.TradieProfile.create({
          user_id: user.id,
          full_name: displayName(user),
          open_to_work: false,
          service_radius_km: 20,
        });
      }
    }
    return ok({ user: updated });
  } catch (error) {
    return serverError(error);
  }
}
