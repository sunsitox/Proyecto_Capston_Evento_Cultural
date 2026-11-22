// Dependencia QA aislada; no modifica package.json ni lockfile del proyecto.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2] ?? '_tmp_sql_qa/node_modules/@electric-sql/pglite/dist/index.js')).href);
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
// Migraciones originales del catálogo, con auth mínimo solo para compilar RLS.
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
const schemaPath = resolve(process.argv[3] ?? '../../tmp_migrations');
for (const file of ['20260831000100_initial_event_catalog.sql', '20260902000100_event_location_metadata.sql', '20260911000100_content_enrichment_and_organizer_controls.sql']) {
  // PGlite no empaqueta pgcrypto; gen_random_uuid() pertenece al core PostgreSQL.
  await db.exec(readFileSync(resolve(schemaPath,file),'utf8').replace('create extension if not exists pgcrypto;', ''));
}
await db.exec(readFileSync('supabase/migrations/20261121000200_update_organizer_event_atomic.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261121000300_create_organizer_event_atomic.sql','utf8'));
await db.exec(`
insert into sources(id,name) values ('00000000-0000-0000-0000-000000000004','Fuente QA');
insert into communes(id,name,region) values ('00000000-0000-0000-0000-000000000001','Ñuñoa','Metropolitana');
insert into events(id,external_key,source_id,title,start_at,end_at,status,commune_id,region,location,location_precision,location_source) values ('00000000-0000-0000-0000-000000000002','org:00000000-0000-0000-0000-000000000003:test','00000000-0000-0000-0000-000000000004','Original','2026-11-22T18:00Z','2026-11-22T21:30Z','draft','00000000-0000-0000-0000-000000000001','Metropolitana','Plaza','exact','source-data');
`);
const changes = {title:'Modificado', description:'Descripción de prueba suficientemente extensa.', start_at:'2026-11-22T18:00Z', end_at:'2026-11-22T21:30Z',location:'Plaza',location_precision:'exact',location_source:'source-data'};
const call = (cats=['Música','Teatro','Danza','Patrimonio'], commune='Nunoa', owner='00000000-0000-0000-0000-000000000003', id='00000000-0000-0000-0000-000000000002') => db.query('select update_organizer_event_atomic($1,$2,$3,$4,$5)',[id,owner,changes,commune,cats]);
const snapshot = async () => JSON.stringify((await db.query(`select row_to_json(e) event, (select jsonb_agg(c.name order by c.name) from event_categories ec join categories c on c.id=ec.category_id where ec.event_id=e.id) cats from events e`)).rows);
await call();
assert.equal((await db.query('select count(*)::int n from event_categories')).rows[0].n,4);
assert.equal((await db.query('select region,status,extract(hour from end_at)::int h from events')).rows[0].h,21);
console.log('PASS conservación 4 categorías, término y campos protegidos');
let before=await snapshot();
for (const [name,fn] of [
 ['comuna desconocida',()=>call(undefined,'Inexistente')],
 ['dueño ajeno',()=>call(undefined,undefined,'00000000-0000-0000-0000-000000000099')],
 ['evento inexistente',()=>call(undefined,undefined,undefined,'00000000-0000-0000-0000-000000000099')],
 ['categorías vacías',()=>call([])]
]) { await assert.rejects(fn); assert.equal(await snapshot(),before); console.log('PASS rechazo sin cambios: '+name); }
await db.exec(`create function qa_fail() returns trigger language plpgsql as $$ begin raise exception 'Fallo QA'; end $$;`);
for (const [table,op,cats] of [ ['communes','SELECT',undefined],['event_categories','DELETE',undefined],['categories','INSERT',['Nueva']],['event_categories','INSERT',undefined] ]) {
 if(op==='SELECT') await db.exec('alter table communes rename to communes_qa_missing');
 else await db.exec(`create trigger qa_failure before ${op} on ${table} for each row execute function qa_fail()`);
 await assert.rejects(()=>call(cats));
 if(op==='SELECT') await db.exec('alter table communes_qa_missing rename to communes');
 else await db.exec(`drop trigger qa_failure on ${table}`);
 assert.equal(await snapshot(),before);
 console.log('PASS rollback: '+table+' '+op);
}
await call(['Teatro','Teatro']);
assert.equal((await db.query('select count(*)::int n from event_categories')).rows[0].n,1);
console.log('PASS reemplazo explícito y deduplicación');
// Índice real lower(name): reutilizar, no fallar ni duplicar por mayúsculas.
await call(['teatro','TEATRO','Danza']);
assert.equal((await db.query('select count(*)::int n from event_categories')).rows[0].n,2);
console.log('PASS índice lower(name): reutilización y deduplicación case-insensitive');
const create = (cats=['Música','Teatro','Danza','Patrimonio'], commune='Nunoa') => db.query('select create_organizer_event_atomic($1,$2,$3,$4,$5) result', ['00000000-0000-0000-0000-000000000003','Organizador QA',changes,commune,cats]);
await db.exec('set role service_role');
const created = (await create()).rows[0].result;
assert.equal((await db.query('select count(*)::int n from event_categories where event_id=$1',[created.id])).rows[0].n,4);
const stored=(await db.query('select * from events where id=$1',[created.id])).rows[0];
assert.equal(stored.status,'draft'); assert.equal(stored.currency,'CLP'); assert.ok(stored.source_id); assert.ok(stored.organizer_id);
assert.equal(stored.location_precision,'exact');
console.log('PASS creación service_role: 4 categorías, FK/NOT NULL/checks/RLS/triggers originales');
await db.exec('reset role');
const allSnapshot = async () => JSON.stringify((await db.query(`select (select jsonb_agg(to_jsonb(e) order by id) from events e) events, (select jsonb_agg(to_jsonb(c) order by id) from categories c) categories, (select jsonb_agg(to_jsonb(ec) order by event_id,category_id) from event_categories ec) relations, (select jsonb_agg(to_jsonb(s) order by id) from sources s) sources, (select jsonb_agg(to_jsonb(o) order by id) from organizers o) organizers`)).rows);
for(const [table,op,cats] of [['categories','INSERT',['Nueva QA']],['event_categories','INSERT',undefined]]) {
 const original=await allSnapshot();
 await db.exec(`create trigger qa_failure before ${op} on ${table} for each row execute function qa_fail()`);
 await assert.rejects(()=>create(cats));
 await db.exec(`drop trigger qa_failure on ${table}`);
 assert.equal(await allSnapshot(),original);
 console.log('PASS rollback creación: '+table);
}
let original=await allSnapshot();
await assert.rejects(()=>create(undefined,'Desconocida'));
assert.equal(await allSnapshot(),original);
console.log('PASS creación comuna inválida: sin evento ni relaciones parciales');
await db.exec("insert into communes(id,name,region) values (gen_random_uuid(),'Ñuñoa','Otra región')");
original=await allSnapshot();
await assert.rejects(()=>create()); assert.equal(await allSnapshot(),original);
console.log('PASS comuna ambigua: rechazo sin elegir fila arbitraria');
await db.exec('set role authenticated');
await assert.rejects(()=>call());
await assert.rejects(()=>create());
console.log('PASS ambos RPC denegados a authenticated');
await db.close();
