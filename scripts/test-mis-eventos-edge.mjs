// Prueba local del handler real, sin red ni secretos.
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
let handler;
let rpcResult = { error: null };
let calls = [];
const admin = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner', user_metadata: { rol: 'organizador' } } } }) },
  from: (table) => {
    assert.equal(table, 'events');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'event', external_key: 'org:owner:test' }, error: null }) }) }) };
  },
  rpc: async (name, args) => { calls.push({ name, args }); return rpcResult; }
};
const source = readFileSync('supabase/functions/publicar-evento/index.ts','utf8')
  .replace(/^import .*createClient.*;$/m, '');
vm.runInNewContext(ts.transpileModule(source,{ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, {
  Deno: { env: { get: () => 'local-test' }, serve: fn => { handler=fn; } },
  createClient: () => admin, Response, Request, console, crypto
});
const body = { accion:'actualizar', evento_id:'event', titulo:'Título modificado', descripcion:'Descripción suficientemente larga del evento.', venue:'Plaza', address:'Plaza', start_at:'2026-11-22T18:00:00Z', end_at:'2026-11-22T21:30:00Z', comuna:'Santiago', categories:['Música','Teatro','Danza','Patrimonio'] };
const request = data => handler(new Request('http://localhost', { method:'POST',headers:{Authorization:'Bearer local-test','Content-Type':'application/json'},body:JSON.stringify(data) }));
let res=await request(body);
assert.equal(res.status,200);
assert.equal(calls.length,1);
assert.equal(calls[0].name,'update_organizer_event_atomic');
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_categories)),body.categories);
assert.equal(calls[0].args.p_changes.end_at,body.end_at);
assert.equal(calls[0].args.p_owner_id,'owner');
assert.equal('status' in calls[0].args.p_changes,false);
console.log('PASS handler: único RPC, 4 categorías, término, dueño JWT y lista blanca');
for(const [code,status] of [['XX000',500],['22023',400],['42501',403],['P0002',404],['PGRST202',500]]) {
  rpcResult={error:{code,message:'Fallo controlado'}};
  res=await request(body);
  assert.equal(res.status,status);
  assert.equal('mensaje' in await res.json(),false);
  console.log('PASS handler: error '+code+' → '+status+' sin éxito/fallback');
}
calls=[];
for(const categories of [[],null,[''],[42]]) {
  res=await request({...body,categories});
  assert.equal(res.status,400);
}
assert.equal(calls.length,0);
console.log('PASS handler: categorías inválidas abortan antes de escribir');
// Creación: mismo formulario múltiple, todas las categorías y ningún INSERT
// separado accesible desde el handler.
const crear = { ...body, accion: undefined, evento_id: undefined };
rpcResult = { data: { id: 'created', external_key: 'org:owner:created' }, error: null };
res = await request(crear);
assert.equal(res.status, 201);
assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'create_organizer_event_atomic');
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_categories)), body.categories);
assert.equal(calls[0].args.p_changes.end_at, body.end_at);
assert.equal(calls[0].args.p_owner_id, 'owner');
console.log('PASS creación: 4 categorías íntegras, hora final y único RPC');
for (const [code, status] of [['XX000',500], ['22023',400], ['PGRST202',500]]) {
  rpcResult = { error: { code, message: 'Fallo controlado' } };
  res = await request(crear);
  assert.equal(res.status, status);
  assert.equal('mensaje' in await res.json(), false);
  console.log('PASS creación: fallo '+code+' sin éxito parcial');
}
calls = [];
for (const categories of [[], null, [''], [42], ['x'.repeat(81)]]) {
  res = await request({ ...crear, categories });
  assert.equal(res.status, 400);
}
assert.equal(calls.length, 0);
console.log('PASS creación: categorías inválidas rechazadas antes del RPC');
