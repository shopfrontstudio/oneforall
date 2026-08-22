-- Add a bounded household packing and moving request pathway. Customer
-- requests are open; provider onboarding, quoting and booking remain behind
-- their independent managed-marketplace release gates.

begin;

update public.service_categories
set sort_order = 13, updated_date = now()
where slug = 'not-sure';

insert into public.service_categories (name, slug, icon, sort_order, is_active)
values ('Packers & Movers', 'moving-packing', 'Truck', 12, true)
on conflict (slug) do update
set name = excluded.name,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_date = now();

insert into public.service_definitions (
  service_key, category_slug, name, pathway, scope_ids,
  evidence_requirements, blocked_terms, review_terms,
  manual_review_required, adults_only,
  publicly_visible, request_enabled, provider_onboarding_enabled,
  quote_enabled, booking_enabled, recurrence_enabled,
  public_release_enabled, policy_version
)
values (
  'moving-packing.household',
  'moving-packing',
  'Household packing and moving',
  'managed_quote',
  array['packing-unpacking','home-move','single-item','loading-unloading'],
  '[
    {"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},
    {"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},
    {"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},
    {"evidence_type":"vehicle_identity","subject":"provider","expiry_required":false},
    {"evidence_type":"goods_in_transit_insurance","subject":"provider","expiry_required":true},
    {"evidence_type":"inventory_and_condition_process","subject":"provider","expiry_required":false},
    {"evidence_type":"load_restraint","subject":"worker","expiry_required":false},
    {"evidence_type":"manual_handling_process","subject":"worker","expiry_required":false}
  ]'::jsonb,
  array[
    'dangerous goods','explosive','illegal goods','asbestos','contaminated material',
    'uncontained fuel','chemical container','gas cylinder','move a person',
    'transport a person','move a pet','transport an animal','disconnect electrical',
    'disconnect gas','disconnect plumbing','stolen goods'
  ],
  array[
    'stairs','no lift','no elevator','piano','safe','pool table','oversized',
    'heavy item','interstate','long distance','storage','fragile','high value',
    'appliance disconnection'
  ],
  false,
  false,
  true,
  true,
  false,
  false,
  false,
  false,
  true,
  'moving-packing-request-launch-2026-08-22'
)
on conflict (service_key) do update
set category_slug = excluded.category_slug,
    name = excluded.name,
    pathway = excluded.pathway,
    scope_ids = excluded.scope_ids,
    evidence_requirements = excluded.evidence_requirements,
    blocked_terms = excluded.blocked_terms,
    review_terms = excluded.review_terms,
    manual_review_required = excluded.manual_review_required,
    adults_only = excluded.adults_only,
    publicly_visible = excluded.publicly_visible,
    request_enabled = excluded.request_enabled,
    provider_onboarding_enabled = excluded.provider_onboarding_enabled,
    quote_enabled = excluded.quote_enabled,
    booking_enabled = excluded.booking_enabled,
    recurrence_enabled = excluded.recurrence_enabled,
    public_release_enabled = excluded.public_release_enabled,
    policy_version = excluded.policy_version,
    updated_date = now();

do $$
begin
  if not exists (
    select 1
    from public.service_definitions
    where service_key = 'moving-packing.household'
      and category_slug = 'moving-packing'
      and publicly_visible
      and request_enabled
      and public_release_enabled
      and not provider_onboarding_enabled
      and not quote_enabled
      and not booking_enabled
      and not recurrence_enabled
  ) then
    raise exception 'Packers and Movers request pathway failed closed-state validation';
  end if;
end;
$$;

commit;
