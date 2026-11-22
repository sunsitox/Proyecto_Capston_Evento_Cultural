// CP-DB-001 / CP-DB-002: aplica las 6 migraciones sobre un PostgreSQL vacío
// (PGlite embebido) y las reaplica para comprobar idempotencia.
// Dependencia QA aislada; no modifica package.json ni lockfile. Para repetir:
//   npm install --prefix _tmp_sql_qa --no-package-lock --no-audit --no-fund @electric-sql/pglite
//   node scripts/test-migraciones-fase3.mjs
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const { PGlite } = await import(
  pathToFileURL(resolve(process.argv[2] ?? '_tmp_sql_qa/node_modules/@electric-sql/pglite/dist/index.js')).href
);
const migrationsDir = resolve(process.argv[3] ?? '../../_BASURA_2026-11-22/tmp_scraper_repo/supabase/migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
assert.equal(files.length, 6, `Se esperaban 6 migraciones y hay ${files.length}`);

const db = new PGlite();
// Sustrato mínimo de Supabase: roles, auth.users y auth.uid() para compilar RLS.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
`);

async function aplicar() {
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8').replace(
      'create extension if not exists pgcrypto;',
      ''
    );
    await db.exec(sql);
  }
}

async function inventario() {
  const uno = async (sql) => (await db.query(sql)).rows[0].n;
  return {
    tablas: await uno(
      "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
    ),
    indices: await uno("select count(*)::int n from pg_indexes where schemaname='public'"),
    triggers: await uno(`select count(*)::int n from pg_trigger t
      join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='public' and not t.tgisinternal`),
    politicas: await uno("select count(*)::int n from pg_policies where schemaname='public'"),
    funciones: await uno(`select count(*)::int n from pg_proc p
      join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`),
    enums: await uno(`select count(*)::int n from pg_type t
      join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' and t.typtype='e'`),
    rls: await uno(`select count(*)::int n from pg_class c
      join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relrowsecurity`)
  };
}

await aplicar();
const primera = await inventario();
assert.ok(primera.tablas >= 10, `Tablas insuficientes: ${primera.tablas}`);
assert.ok(primera.politicas > 0, 'No se crearon políticas RLS');
assert.ok(primera.indices > 0, 'No se crearon índices');
assert.ok(primera.triggers > 0, 'No se crearon triggers');
console.log(`PASS DB-001 esquema vacío: ${files.length} migraciones en orden (${files[0]} → ${files[5]})`);
console.log(
  `PASS DB-001 objetos: tablas=${primera.tablas} indices=${primera.indices} triggers=${primera.triggers} ` +
  `politicas=${primera.politicas} funciones=${primera.funciones} enums=${primera.enums} tablas_con_rls=${primera.rls}`
);

// Reaplicación completa: no debe fallar ni duplicar objetos.
await aplicar();
const segunda = await inventario();
assert.deepEqual(segunda, primera, 'La reaplicación duplicó o perdió objetos');
console.log('PASS DB-002 reaplicación: mismas 6 migraciones sin error');
console.log(`PASS DB-002 sin duplicados: ${JSON.stringify(segunda)}`);

// Consulta funcional básica sobre el esquema creado.
const { rows } = await db.query(
  "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='events'"
);
assert.ok(rows[0].n > 20, `events tiene ${rows[0].n} columnas`);
console.log(`PASS DB-001 tabla events operativa: ${rows[0].n} columnas`);

await db.close();
