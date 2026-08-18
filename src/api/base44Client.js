// Compatibility layer: keeps the `base44`-shaped API the app was written
// against (entities.X.filter/get/create/update/delete, auth.*, integrations.*)
// but backed entirely by Supabase. Consumers import { base44 } unchanged.
import { supabase } from '@/api/supabase';
import { assignAppPath } from '@/lib/appUrl';

const TABLES = {
  Job: 'jobs',
  TradieProfile: 'tradie_profiles',
  CustomerProfile: 'customer_profiles',
  Conversation: 'conversations',
  Message: 'messages',
  Notification: 'notifications',
  Review: 'reviews',
  InterestRequest: 'interest_requests',
  Invitation: 'invitations',
  Subscription: 'subscriptions',
  Boost: 'boosts',
  ServiceCategory: 'service_categories',
};

const throwIf = (error) => {
  if (error) throw new Error(error.message);
};

// Base44 sort strings look like '-created_date' (descending) or 'field'.
const applySort = (query, sort = '-created_date') => {
  const desc = sort.startsWith('-');
  return query.order(desc ? sort.slice(1) : sort, { ascending: !desc });
};

const makeEntity = (table) => ({
  async filter(match = {}, sort, limit) {
    let query = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(match)) query = query.eq(key, value);
    query = applySort(query, sort);
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    throwIf(error);
    return data ?? [];
  },
  async list(sort, limit) {
    return this.filter({}, sort, limit);
  },
  async get(id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    throwIf(error);
    return data;
  },
  async create(payload) {
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    throwIf(error);
    return data;
  },
  async update(id, payload) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
    throwIf(error);
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    throwIf(error);
    return true;
  },
});

const entities = Object.fromEntries(
  Object.entries(TABLES).map(([name, table]) => [name, makeEntity(table)])
);

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    throwIf(error);
    if (!user) throw new Error('Not authenticated');
    const { data: appUser } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    return {
      id: user.id,
      email: user.email,
      full_name: appUser?.full_name || user.user_metadata?.full_name || user.email,
      account_type: appUser?.account_type || null,
      role: appUser?.role || 'user',
    };
  },

  async updateMe(patch) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const allowed = {};
    if ('account_type' in patch) allowed.account_type = patch.account_type;
    if ('full_name' in patch) allowed.full_name = patch.full_name;
    const { error } = await supabase
      .from('app_users')
      .upsert({ id: user.id, ...allowed })
      .select()
      .single();
    throwIf(error);
    return this.me();
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    throwIf(error);
    return data;
  },

  async register({ email, password }) {
    const { error } = await supabase.auth.signUp({ email, password });
    throwIf(error);
    return true;
  },

  // Email OTP verification. The Supabase "Confirm signup" email template must
  // include the {{ .Token }} code for this to work (see README).
  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
    throwIf(error);
    return { access_token: data.session?.access_token };
  },

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    throwIf(error);
    return true;
  },

  // supabase-js manages the session itself; kept for call-site compatibility.
  setToken() {},

  loginWithProvider(provider, returnTo) {
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnTo || window.location.origin },
    });
  },

  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    throwIf(error);
    return true;
  },

  // The recovery link signs the user in (detectSessionInUrl), so setting the
  // new password is just an update; the emailed token argument is unused.
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    throwIf(error);
    return true;
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl !== undefined) {
      assignAppPath('/login');
    }
  },

  redirectToLogin(fromUrl) {
    const returnTo = fromUrl ? `?returnTo=${encodeURIComponent(fromUrl)}` : '';
    assignAppPath(`/login${returnTo}`);
  },
};

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user?.id || 'anon'}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from('uploads').upload(path, file);
      throwIf(error);
      const { data } = supabase.storage.from('uploads').getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

export const base44 = { entities, auth, integrations };
