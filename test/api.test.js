import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {numericPreferences} from '../public/intake.js';
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
test('structured intake persists and editing it preserves shortlist notes',async()=>{
 const f={experienceType:'experienced',workLocation:'ex-sg'};
 for(const [key] of [...numericPreferences,['education']])f[key]={noPreference:true,ideal:null,upper:null,lower:null};
 for(const key of ['nationality','maritalStatus','religion'])f[key]={noPreference:true,ranking:[]};
 f.nationality={noPreference:false,ranking:['Myanmar','Indonesian']};
 const h={residentCount:3,residentAges:[35,32,0.5],maritalStatus:'Married',residenceType:'HDB flat',religion:'Hindu',nationality:'Singaporean'};
 const res=await request('/customers','POST',{name:'Structured family',householdComposition:h,fdwPreferences:f,requirements:{}});assert.equal(res.status,201);const created=await res.json();assert.deepEqual(created.householdComposition.residentAges,h.residentAges);assert.deepEqual(created.fdwPreferences.nationality.ranking,['Myanmar','Indonesian']);
 await request('/customers/'+created.id+'/shortlist','POST',{candidateId:'c2',note:'Keep this interview feedback'});
 h.residentCount=4;h.residentAges.push(65);
 const updated=await request('/customers/'+created.id+'/requirements','PATCH',{householdComposition:h,fdwPreferences:f});assert.equal(updated.status,200);const c=await updated.json();assert.equal(c.householdComposition.residentCount,4);assert.equal(c.shortlist[0].notes[0].text,'Keep this interview feedback');
});
test('invalid intake is rejected without overwriting existing customer data',async()=>{
 const res=await request('/customers/u1/requirements','PATCH',{householdComposition:{residentCount:2,residentAges:[35]},notes:'Should never be saved'});assert.equal(res.status,400);
 const state=await(await request('/state')).json();assert.notEqual(state.customers.find(c=>c.id==='u1').notes,'Should never be saved');
});
test('uploaded PDF populates fields; re-extraction preserves staff corrections; deletion removes the original',async()=>{
 const content=execFileSync(process.env.PYTHON||'python3',['-c',"import fitz,base64; d=fitz.open(); p=d.new_page(); p.insert_text((50,50),'Name: Upload Test\\nNationality: Indonesian\\nHeight: 155 cm\\nWeight: 52 kg\\nEnglish: conversational\\nSalary: S$650'); print(base64.b64encode(d.tobytes()).decode())"],{encoding:'utf8'}).trim();
 const response=await request('/upload','POST',{name:'realistic-biodata.pdf',content});assert.equal(response.status,201);const c=await response.json();
 async function finished(){for(let i=0;i<100;i++){const s=await(await request('/state')).json(),p=s.candidates.find(p=>p.id===c.id);if(p?.processing==='failed')assert.fail(p.extractionError);if(p?.processing==='complete')return p;await new Promise(r=>setTimeout(r,100));}assert.fail('Extraction timeout');}
 const parsed=await finished();assert.equal(parsed.name,'Upload Test');assert.equal(parsed.height_cm,155);assert.equal(parsed.salary,650);assert.equal(parsed.english,'conversational');assert.equal(parsed.extracted.evidence.height_cm.page,1);
 await request('/candidates/'+c.id,'PATCH',{name:'Corrected name',height_cm:157});assert.equal((await request('/candidates/'+c.id+'/extract','POST',{})).status,202);const corrected=await finished();assert.equal(corrected.name,'Corrected name');assert.equal(corrected.height_cm,157);
 assert.ok(existsSync(path.join(dir,'uploads',c.documentId+'.pdf')));assert.equal((await request('/candidates/'+c.id,'DELETE')).status,200);assert.ok(!existsSync(path.join(dir,'uploads',c.documentId+'.pdf')));assert.equal((await request('/documents/'+c.documentId)).status,404);
});
test('deleting a shortlisted candidate removes shortlist and ranking references',async()=>{
 await request('/customers/u3/shortlist','POST',{candidateId:'c2'});await request('/customers/u3/ranking','POST',{candidateId:'c2',order:['c2','c3'],reason:'Test move'});
 assert.equal((await request('/candidates/c2','DELETE')).status,200);const state=await(await request('/state')).json();assert.ok(!state.candidates.some(c=>c.id==='c2'));
 for(const customer of state.customers){assert.ok(!customer.shortlist.some(s=>s.candidateId==='c2'));assert.ok(!customer.ranking?.includes('c2'));assert.ok(!customer.rankingNotes?.some(n=>n.candidateId==='c2'));}
 assert.equal((await request('/candidates/c2','DELETE')).status,404);
});
test('deleting a queued or processing upload cannot resurrect its record',async()=>{
 const content=execFileSync(process.env.PYTHON||'python3',['-c',"import fitz,base64; d=fitz.open(); p=d.new_page(); p.insert_text((50,50),'Name: Pending Test'); print(base64.b64encode(d.tobytes()).decode())"],{encoding:'utf8'}).trim();
 const c=await(await request('/upload','POST',{name:'pending.pdf',content})).json();assert.equal((await request('/candidates/'+c.id,'DELETE')).status,200);await new Promise(r=>setTimeout(r,500));const state=await(await request('/state')).json();assert.ok(!state.candidates.some(x=>x.id===c.id));assert.ok(!existsSync(path.join(dir,'uploads',c.documentId+'.pdf')));
});
test('customer data survives server restart',async()=>{const res=await request('/customers','POST',{name:'Persistence test',household:'2 adults',requirements:{}});assert.equal(res.status,201);const c=await res.json();await stop();await launch();const login=await request('/login','POST',{password:'test-only-password'},false);cookie=login.headers.get('set-cookie').split(';')[0];const state=await(await request('/state')).json();assert.ok(state.customers.some(x=>x.id===c.id));});
