// Isolated PostgreSQL integration tests. Never accepts a remote database URL.
// Install embedded-postgres in a temporary directory and pass its module path:
// OFA_EMBEDDED_POSTGRES_MODULE=/.../embedded-postgres/dist/index.js node scripts/test-intelligent-db.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

if (!process.env.OFA_EMBEDDED_POSTGRES_MODULE) throw new Error('An isolated embedded-postgres module path is required. No production connection is supported.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.OFA_EMBEDDED_POSTGRES_MODULE));
const dir = await mkdtemp(join(tmpdir(), 'ofa-db-test-'));
const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), port: 55439, user: 'postgres', password: randomUUID(), persistent: true, autoRehydrateSymlinks: true, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: () => {} });
let client;
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); client = pg.getPgClient(); await client.connect();
  // Minimal Supabase auth/storage infrastructure; application migrations below
  // run unmodified. This tests Postgres RLS/RPC, not GoTrue or Storage HTTP.
  await client.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort()) {
    try { await client.query(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')); }
    catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
  }
  console.log('PASS all application migrations applied to an empty PostgreSQL database'); passed++;
  const c1 = randomUUID(), c2 = randomUUID(), p1 = randomUUID();
  await client.query('insert into auth.users(id) values($1),($2),($3)', [c1,c2,p1]);
  await client.query("update app_users set account_type=case when id=$1 then 'tradie' else 'customer' end", [p1]);
  const as = async (id, fn) => {
    await client.query('begin');
    try { await client.query('set local role authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id]); const result = await fn(); await client.query('commit'); return result; }
    catch (error) { await client.query('rollback'); throw error; }
  };
  const rpc = async (name,payload) => (await client.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(payload)])).rows[0].result;
  const homeId = randomUUID(); let home;
  await check('home save and owner read', async () => { home = await as(c1, () => rpc('oneforall_save_home_profile',{id:homeId,label:'Test home',suburb:'Ballarat',property_type:'house',appliances:[{name:'Washer',details:'Synthetic'}]})); assert.equal(home.customer_id,c1); assert.equal((await as(c1,()=>client.query('select * from customer_homes'))).rowCount,1); });
  await check('home is hidden from other customer and provider', async () => { for(const id of [c2,p1]) assert.equal((await as(id,()=>client.query('select * from customer_homes'))).rowCount,0); });
  await check('direct home writes denied', () => assert.rejects(as(c1,()=>client.query("update customer_homes set label='bypass'")),/permission denied/));
  await check('foreign home update and self-approval denied', () => assert.rejects(as(c2,()=>rpc('oneforall_save_home_profile',{...home,label:'Stolen'})),/Home unavailable/));
  await check('stale home update denied', () => assert.rejects(as(c1,()=>rpc('oneforall_save_home_profile',{...home,version:0,label:'Stale'})),/changed/));
  const reminderId = randomUUID();
  await check('reminder belongs to owned home only', async () => { await as(c1,()=>rpc('oneforall_save_maintenance_reminder',{id:reminderId,home_id:homeId,title:'Check manual',due_date:'2026-12-01',enabled:true})); await assert.rejects(as(c2,()=>rpc('oneforall_save_maintenance_reminder',{home_id:homeId,title:'Wrong',due_date:'2026-12-01'})),/Home unavailable/); });
  await check('availability writes fail closed with job actions disabled',()=>assert.rejects(as(p1,()=>rpc('oneforall_save_provider_availability',{worker_id:randomUUID(),service_key:'cleaning.routine_domestic',starts_at:'2027-01-01T00:00:00Z',ends_at:'2027-01-01T01:00:00Z'})),/not enabled/));
  await check('ordinary user cannot approve price guides',()=>assert.rejects(as(c1,()=>rpc('oneforall_save_price_guide',{})),/Admin approval required/));
  const request = {idempotency_key:randomUUID(),service_key:'cleaning.routine_domestic',pathway:'scheduled_or_recurring',selected_scope_ids:['vacuum-mop-dust'],scope_description:'',suburb:'Ballarat',preferred_date:'2027-01-01',recurrence:'once',urgency:'flexible',requested_units:2,requested_value:100,safety_considerations:'none_declared'};
  const bundle = {idempotency_key:randomUUID(),items:[request]}; let result;
  await check('bundle sends one real request and safely retries',async()=>{ result=await as(c1,()=>rpc('oneforall_submit_request_bundle',bundle)); const retry=await as(c1,()=>rpc('oneforall_submit_request_bundle',bundle)); assert.equal(result.id,retry.id); assert.equal(result.requests[0].id,retry.requests[0].id); });
  await check('bundle changed retry rejected',()=>assert.rejects(as(c1,()=>rpc('oneforall_submit_request_bundle',{...bundle,items:[{...request,suburb:'Other'}]})),/different details/));
  await check('bundle invalid second item rolls back first',async()=>{ const count=(await client.query('select count(*)::int n from jobs')).rows[0].n; await assert.rejects(as(c1,()=>rpc('oneforall_submit_request_bundle',{idempotency_key:randomUUID(),items:[{...request,idempotency_key:randomUUID()},{...request,idempotency_key:randomUUID(),service_key:'invalid'}]})),/not released/); assert.equal((await client.query('select count(*)::int n from jobs')).rows[0].n,count); });
  const jobId=result.requests[0].id; const photo=`${c1}/${jobId}/${randomUUID()}.jpg`;
  await client.query('insert into storage.objects(bucket_id,name) values($1,$2)',['provider-request-media',photo]);
  await as(c1,()=>rpc('oneforall_attach_request_media',{job_id:jobId,paths:[photo],idempotency_key:randomUUID()}));
  await check('photo annotations require ownership and valid coordinates',async()=>{ await as(c1,()=>rpc('oneforall_save_photo_annotations',{job_id:jobId,photo_path:photo,annotations:[{x:0.5,y:0.6,note:'Synthetic mark'}]})); await assert.rejects(as(c2,()=>rpc('oneforall_save_photo_annotations',{job_id:jobId,photo_path:photo,annotations:[]})),/cannot be annotated/); await assert.rejects(as(c1,()=>rpc('oneforall_save_photo_annotations',{job_id:jobId,photo_path:photo,annotations:[{x:2,y:0,note:'Bad'}]})),/Check photo note/); });
  await check('photo notes and storage stay private',async()=>{ assert.equal((await as(c2,()=>client.query('select * from request_photo_annotations'))).rowCount,0); assert.equal((await as(c2,()=>client.query('select * from storage.objects'))).rowCount,0); });
  await check('all production-facing activation flags remain off',async()=>{ assert.equal((await client.query('select count(*)::int n from service_definitions where quote_enabled or booking_enabled or provider_onboarding_enabled')).rows[0].n,0); });
  // Enable only this disposable database's gates to exercise allowed writes.
  const workerId = randomUUID(), quoteId = randomUUID(), bookingId = randomUUID();
  await client.query("update provider_feature_controls set provider_job_actions_enabled=true");
  await client.query("update service_definitions set booking_enabled=true,quote_enabled=true where service_key='cleaning.routine_domestic'");
  await client.query("insert into provider_workers(id,provider_id,display_name,relationship_type,active,review_status) values($1,$2,'Synthetic worker','owner',true,'verified')", [workerId,p1]);
  await client.query("insert into provider_offerings(provider_id,service_key,active,review_status,reverification_required) values($1,'cleaning.routine_domestic',true,'approved',false)", [p1]);
  const windowPayload = {id:randomUUID(),worker_id:workerId,service_key:'cleaning.routine_domestic',starts_at:new Date(Date.now()+7*86400000).toISOString(),ends_at:new Date(Date.now()+7*86400000+3600000).toISOString()};
  await check('availability persists only for the owner and rejects overlaps', async () => {
    const saved = await as(p1,()=>rpc('oneforall_save_provider_availability',windowPayload));
    assert.equal(saved.provider_id,p1);
    await assert.rejects(as(p1,()=>rpc('oneforall_save_provider_availability',{...windowPayload,id:randomUUID()})),/overlaps/);
    assert.equal((await as(c1,()=>client.query('select * from provider_availability_windows'))).rowCount,0);
  });
  await client.query("update jobs set status='published' where id=$1",[jobId]);
  await client.query("insert into interest_requests(id,job_id,customer_id,tradie_id,status,service_key,selected_scope_ids,attending_worker_id,response_deadline) values($1,$2,$3,$4,'pending','cleaning.routine_domestic',array['vacuum-mop-dust'],$5,now()+interval '12 hours')",[quoteId,jobId,c1,p1,workerId]);
  await check('quote availability hides missing evidence and rejects other customers', async () => {
    assert.deepEqual(await as(c1,()=>rpc('oneforall_availability_for_quote',{quote_id:quoteId})),[]);
    await assert.rejects(as(c2,()=>rpc('oneforall_availability_for_quote',{quote_id:quoteId})),/Quote unavailable/);
  });
  await client.query("insert into bookings(id,job_id,quote_id,customer_id,provider_id,service_key,selected_scope_ids,attending_worker_id,attending_worker_display_name,scope_decision,hazard_screen_status,idempotency_key) values($1,$2,$3,$4,$5,'cleaning.routine_domestic',array['vacuum-mop-dust'],$6,'Synthetic worker','allowed','passed','synthetic-fixture')",[bookingId,jobId,quoteId,c1,p1,workerId]);
  const proofId = randomUUID(), proofPath = `${p1}/${bookingId}/${proofId}.jpg`;
  await check('private proof upload, attachment and retry stay participant bounded',async()=>{
    await as(p1,()=>client.query('insert into storage.objects(bucket_id,name) values($1,$2)',['booking-proof',proofPath]));
    const payload = {id:proofId,booking_id:bookingId,phase:'before',photo_path:proofPath,note:'Synthetic'};
    const saved = await as(p1,()=>rpc('oneforall_attach_job_proof',payload));
    assert.equal((await as(p1,()=>rpc('oneforall_attach_job_proof',payload))).id,saved.id);
    assert.equal((await as(c1,()=>client.query('select * from booking_proof'))).rowCount,1);
    assert.equal((await as(c2,()=>client.query('select * from booking_proof'))).rowCount,0);
    assert.equal((await as(c2,()=>client.query("select * from storage.objects where bucket_id='booking-proof'"))).rowCount,0);
    assert.equal((await as(c1,()=>client.query("select * from storage.objects where bucket_id='booking-proof'"))).rowCount,1);
    await assert.rejects(as(c1,()=>rpc('oneforall_attach_job_proof',payload)),/Booking unavailable/);
    await assert.rejects(as(p1,()=>rpc('oneforall_attach_job_proof',{...payload,note:'Changed'})),/retry conflict/);
    assert.equal((await as(p1,()=>client.query("delete from storage.objects where bucket_id='booking-proof'"))).rowCount,0);
  });
  console.log(`${passed} PostgreSQL integration checks passed. Synthetic data only; no live database contacted.`);
} finally {
  if(client) await client.end();
  await pg.stop();
  console.log(`Stopped isolated database. Disposable test files retained at ${dir}`);
}
