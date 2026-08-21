// Supabase compatibility facade. The legacy export name is retained so auth
// screens and existing read call-sites do not need a risky all-at-once rewrite.
// Marketplace tables are read-only here; every authoritative mutation must use
// one of the allow-listed, server-authoritative RPC operations below.
import { supabase } from '@/api/supabase';
import { absoluteAppUrl, assignAppPath } from '@/lib/appUrl';

const TABLES = Object.freeze({
  Job: 'jobs',
  Booking: 'bookings',
  RecurringSeries: 'recurring_series',
  TradieProfile: 'tradie_profiles',
  CustomerProfile: 'customer_profiles',
  Conversation: 'conversations',
  Message: 'messages',
  Notification: 'notifications',
  Review: 'reviews',
  InterestRequest: 'interest_requests',
  ServiceCategory: 'service_categories',
  ServiceDefinition: 'service_definitions',
  ProviderOffering: 'provider_offerings',
  ProviderWorker: 'provider_workers',
  ProviderEvidence: 'provider_evidence',
  ProviderPublicAssertion: 'provider_public_assertions',
});

const RPC_ACTIONS = Object.freeze({
  'set-account-type': 'oneforall_set_account_type',
  'ensure-customer-profile': 'oneforall_ensure_customer_profile',
  'submit-request': 'oneforall_submit_request',
  'transition-request': 'oneforall_transition_request',
  'send-message': 'oneforall_send_message',
});

const throwIf = (error) => { if (error) throw new Error(error.message); };
const blockedMutation = () => { throw new Error('Direct client mutation is disabled. Use an approved OneForAll operation.'); };

const makeReadEntity = (table) => ({
  async filter(match = {}, sort = '-created_date', limit) {
    let query = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(match)) query = query.eq(key, value);
    const descending = sort.startsWith('-');
    query = query.order(descending ? sort.slice(1) : sort, { ascending: !descending });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    throwIf(error);
    return data ?? [];
  },
  async list(sort, limit) { return this.filter({}, sort, limit); },
  async get(id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    throwIf(error);
    return data;
  },
  create: blockedMutation,
  update: blockedMutation,
  delete: blockedMutation,
});

const entities = Object.fromEntries(Object.entries(TABLES).map(([name, table]) => [name, makeReadEntity(table)]));

// Providers never select the raw invitations table. This RPC returns only the
// bounded, participant-scoped snapshot defined by the security migration.
entities.Invitation = {
  async list(sort = '-created_date', limit) {
    const { data, error } = await supabase.rpc('oneforall_provider_invitation_snapshots', { p_payload: {} });
    throwIf(error);
    const rows = Array.isArray(data) ? data : [];
    const descending = sort.startsWith('-');
    const field = descending ? sort.slice(1) : sort;
    rows.sort((left, right) => String(left?.[field] ?? '').localeCompare(String(right?.[field] ?? '')) * (descending ? -1 : 1));
    return limit ? rows.slice(0, limit) : rows;
  },
  async filter(match = {}, sort = '-created_date', limit) {
    if (Object.keys(match).some((key) => !['tradie_id'].includes(key))) {
      throw new Error('Unsupported provider invitation filter.');
    }
    return this.list(sort, limit);
  },
  async get(id) {
    const { data, error } = await supabase.rpc('oneforall_provider_invitation_snapshots', { p_payload: { invitation_id: id } });
    throwIf(error);
    return Array.isArray(data) ? data[0] ?? null : null;
  },
  create: blockedMutation,
  update: blockedMutation,
  delete: blockedMutation,
};

const functions = {
  async invoke(name, payload = {}) {
    const rpc = RPC_ACTIONS[name];
    if (!rpc) throw new Error('This OneForAll operation is not available from the client.');
    const { data, error } = await supabase.rpc(rpc, { p_payload: payload });
    throwIf(error);
    return { data };
  },
};

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    throwIf(error);
    if (!user) throw new Error('Not authenticated');
    const { data: appUser, error: profileError } = await supabase.from('app_users').select('*').eq('id', user.id).maybeSingle();
    throwIf(profileError);
    return { id: user.id, email: user.email, full_name: appUser?.full_name || user.user_metadata?.full_name || user.email, account_type: appUser?.account_type || null, role: appUser?.role || 'user' };
  },
  async updateMe(patch) {
    if ('account_type' in patch) await functions.invoke('set-account-type', { account_type: patch.account_type });
    return this.me();
  },
  async loginViaEmailPassword(email, password) { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); throwIf(error); return data; },
  async register({ email, password }) { const { error } = await supabase.auth.signUp({ email, password }); throwIf(error); return true; },
  async verifyOtp({ email, otpCode }) { const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' }); throwIf(error); return { access_token: data.session?.access_token }; },
  async resendOtp(email) { const { error } = await supabase.auth.resend({ type: 'signup', email }); throwIf(error); return true; },
  setToken() {},
  async loginWithProvider(provider, returnTo) {
    if (!['google', 'apple'].includes(provider)) throw new Error('Unsupported sign-in provider.');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: absoluteAppUrl(returnTo || '/') } });
    throwIf(error);
    return data;
  },
  async resetPasswordRequest(email) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: absoluteAppUrl('/reset-password') }); throwIf(error); return true; },
  async resetPassword({ newPassword }) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    throwIf(sessionError);
    if (!session) throw new Error('This password recovery session is no longer valid.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    throwIf(error);
    return true;
  },
  async logout(redirectUrl) { await supabase.auth.signOut(); if (redirectUrl !== undefined) assignAppPath('/login'); },
  redirectToLogin(fromUrl) { assignAppPath(`/login${fromUrl ? `?returnTo=${encodeURIComponent(fromUrl)}` : ''}`); },
};

const integrations = { Core: { UploadFile: blockedMutation } };
export const base44 = { entities, auth, functions, integrations };
