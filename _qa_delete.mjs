import fs from 'node:fs';
import crypto from 'node:crypto';
process.loadEnvFile('.env');
const url='https://ngwkehuewmjykiiujqic.supabase.co';
const key=process.env.SUPABASE_SECRET_KEY;
const pub=fs.readFileSync('src/environments/environment.ts','utf8').match(/sb_publishable_[\w-]+/)[0];
const statePath='_qa_delete_state.json';
let state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):[];
async function request(path,method='GET',body,token=key){
 const r=await fetch(url+path,{method,headers:{apikey:token===key?key:pub,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>null); if(!r.ok)throw Error(`${path}: ${r.status} ${data?.msg||data?.message||data?.error||''}`); return data;
}
const mode=process.argv[2];
if(mode==='create'){
 for(const name of ['A','B']){
 const email=`qa.delete.${name.toLowerCase()}.${Date.now()}@eventocultural.test`, password=crypto.randomBytes(24).toString('base64url');
 const user=await request('/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{nombre:`QA Delete ${name}`}});
 state.push({name,id:user.id,email,password});fs.writeFileSync(statePath,JSON.stringify(state));
 const session=await request('/auth/v1/token?grant_type=password','POST',{email,password},pub);
 state.at(-1).session=session;fs.writeFileSync(statePath,JSON.stringify(state));
 console.log(`Created ${name}: ${user.id}`);
 }
 fs.writeFileSync('src/assets/qa-delete-session.json',JSON.stringify(state[0].session));
}
if(mode==='check')for(const u of state){
 const r=await fetch(`${url}/auth/v1/admin/users/${u.id}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 const profiles=await request(`/rest/v1/profiles?id=eq.${u.id}&select=id`);
 console.log(`${u.name}: auth=${r.status}, profiles=${profiles.length}`);
}
if(mode==='loginB'){
 const u=state.find(u=>u.name==='B'); const d=await request('/auth/v1/token?grant_type=password','POST',{email:u.email,password:u.password},pub);console.log('B password login:',!!d.access_token);
}
if(mode==='cleanup')for(const u of state){
 const r=await fetch(`${url}/auth/v1/admin/users/${u.id}`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${key}`}});console.log(`Cleanup ${u.name}: ${r.status}`);
}
