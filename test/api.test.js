import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'amah-test-'));
const port=33000+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
let server,cookie;
async function launch(){server=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:String(port),HOST:'127.0.0.1',AGENCY_PASSWORD:'test-only-password'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),6000);server.stdout.on('data',()=>{clearTimeout(timer);resolve();});server.once('error',reject);server.once('exit',code=>{if(code){clearTimeout(timer);reject(new Error('Server failed: '+code));}});});}
async function stop(){if(!server)return;const p=server;await new Promise(resolve=>{p.once('exit',resolve);p.kill();});server=null;}
async function request(route,method='GET',body,auth=true){return fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});}
before(async()=>{await launch();const res=await request('/login','POST',{password:'test-only-password'},false);assert.equal(res.status,200);cookie=res.headers.get('set-cookie').split(';')[0];});
after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
test('records and originals require authentication',async()=>{assert.equal((await request('/state','GET',null,false)).status,401);assert.equal((await request('/documents/abc','GET',null,false)).status,401);});
test('reserved candidates cannot enter a new shortlist',async()=>{const res=await request('/customers/u1/shortlist','POST',{candidateId:'c7'});assert.equal(res.status,409);});
test('manual rankings require reasons',async()=>{assert.equal((await request('/customers/u1/ranking','POST',{order:['c1']})).status,400);});
test('requirement changes preserve existing shortlist and feedback',async()=>{await request('/customers/u1/shortlist','POST',{candidateId:'c1',note:'Interview notes retained'});await request('/customers/u1/requirements','PATCH',{requirements:{english:{priority:'required',value:'fluent'}}});const state=await(await request('/state')).json();const c=state.customers.find(c=>c.id==='u1');assert.equal(c.shortlist[0].notes[0].text,'Interview notes retained');const matches=await(await request('/customers/u1/matches')).json();assert.ok(matches.find(c=>c.id==='c1').match.issues.some(x=>x.key==='english'));});
test('selection reserves a candidate and blocks new offers',async()=>{await request('/customers/u1/shortlist','POST',{candidateId:'c1',status:'Selected'});assert.equal((await request('/customers/u3/shortlist','POST',{candidateId:'c1'})).status,409);});
test('invalid uploads are rejected without creating profiles',async()=>{assert.equal((await request('/upload','POST',{name:'fake.pdf',content:Buffer.from('not pdf').toString('base64')})).status,400);});
test('customer data survives server restart',async()=>{const res=await request('/customers','POST',{name:'Persistence test',household:'2 adults',requirements:{}});assert.equal(res.status,201);const c=await res.json();await stop();await launch();const login=await request('/login','POST',{password:'test-only-password'},false);cookie=login.headers.get('set-cookie').split(';')[0];const state=await(await request('/state')).json();assert.ok(state.customers.some(x=>x.id===c.id));});
