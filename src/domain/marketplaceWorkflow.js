export const QUOTE_OPEN_STATES = Object.freeze(['pending', 'revised']);

export function quoteDisplayStatus(quote) {
  if (!quote) return 'No quote';
  const status = String(quote.status || 'pending');
  if (status === 'superseded') return 'Revised';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (quote.response_deadline && new Date(quote.response_deadline).getTime() <= Date.now()) return 'Expired';
  return Number(quote.revision_number || 1) > 1 ? `Revision ${quote.revision_number} awaiting approval` : 'Awaiting approval';
}

export function latestCustomerQuote(quotes = []) {
  return quotes
    .filter((quote) => quote && quote.status !== 'superseded')
    .slice()
    .sort((left, right) => Number(right.revision_number || 1) - Number(left.revision_number || 1)
      || new Date(right.created_date || 0).getTime() - new Date(left.created_date || 0).getTime())[0] || null;
}

export function externalPaymentSummary(confirmations = []) {
  const roles = new Set(confirmations.filter((row) => row?.status === 'confirmed').map((row) => row.participant_role));
  if (roles.has('customer') && roles.has('provider')) return { state: 'both_confirmed', label: 'Both participants recorded payment' };
  if (roles.has('customer')) return { state: 'customer_only', label: 'Customer recorded payment' };
  if (roles.has('provider')) return { state: 'provider_only', label: 'Provider recorded payment' };
  return { state: 'unconfirmed', label: 'No payment confirmation recorded' };
}

export function recurrenceSummary(series) {
  if (!series) return 'No recurring schedule';
  if (series.state === 'active' && series.customer_confirmed_at && series.provider_confirmed_at) {
    return `${String(series.frequency || '').replace('_', ' ')} schedule confirmed`;
  }
  if (series.state === 'cancelled') return 'Recurring schedule cancelled';
  return 'Recurring schedule awaiting mutual confirmation';
}

export function canShowProviderBookingLink(link) {
  if (!link || link.status !== 'active') return false;
  if (!link.public_release_enabled || !link.quote_enabled) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return false;
  return Boolean(link.token && link.service_key && link.provider_display_name);
}

export function nextBookingState(state) {
  return ({ accepted: 'scheduled', scheduled: 'in_progress', in_progress: 'completed' })[state] || null;
}

export function workflowActionCopy(state) {
  return ({
    accepted: 'Confirm schedule',
    scheduled: 'Start job',
    in_progress: 'Mark complete',
    completed: 'Job complete',
  })[state] || 'View booking';
}
