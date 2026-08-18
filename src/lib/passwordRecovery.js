export const PASSWORD_RECOVERY_MARKER = 'oneforall.password-recovery';

export function hasPasswordRecoveryIntent({ search = '', hash = '', marker = '' } = {}) {
  const query = new URLSearchParams(String(search).replace(/^\?/, ''));
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ''));
  return marker === 'active'
    || query.get('type') === 'recovery'
    || fragment.get('type') === 'recovery'
    || query.has('code');
}
