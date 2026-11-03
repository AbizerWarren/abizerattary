import http from 'node:http';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,statSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {seed} from './lib/seed.js';
import {rank} from './lib/matching.js';
import {validateIntake,householdSummary} from './public/intake.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR || path.join(root,'data');
mkdirSync(path.join(dir,'uploads'),{recursive:true});
const dbPath=path.join(dir,'database.json');
let db=existsSync(dbPath)?JSON.parse(readFileSync(dbPath,'utf8')):seed();
function save(){writeFileSync(dbPath+'.tmp',JSON.stringify(db,null,2));renameSync(dbPath+'.tmp',dbPath);}
save();
const sessions=new Map();
const demo=!process.env.AGENCY_PASSWORD;
const salt=randomBytes(16), passwordHash=scryptSync(process.env.AGENCY_PASSWORD||'amah-demo',salt,32);
const id=()=>randomBytes(10).toString('hex');
const log=(text)=>{db.events.unshift({text,at:new Date().toISOString()});db.events=db.events.slice(0,100);};
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
async function body(req){let data='',n=0;for await(const chunk of req){n+=chunk.length;if(n>22*1024*1024)throw Object.assign(new Error('File too large. Maximum PDF size is 15 MB.'),{status:413});data+=chunk;}try{return JSON.parse(data||'{}');}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validStatus=['Available','Unconfirmed','Reserved','Placed','Withdrawn'];
const stage=['Shortlisted','Sent to customer','Interview scheduled','Interviewed','Selected','Rejected'];
const queue=[];const workers=new Map();let active=0;
const ocrAvailable=spawnSync('tesseract',['--version'],{timeout:3000}).status===0;
const profileFields=['name','dob','nationality','age','marital','religion','education','height_cm','weight_kg','siblings','childrenCount','children','english','care','careEvidence','willingness','cooking','years','salary','restDays','pets','homes','availableFrom','supplier','summary','jobs','workLocation','referenceCode','placeOfBirth','dietaryRestrictions','languages'];
function processQueue(){
 while(active<2&&queue.length){
  const candidate=queue.shift();
  if(!db.candidates.includes(candidate))continue;
  active++;candidate.processing='processing';save();
  const child=spawn(process.env.PYTHON||'python3',[path.join(root,'scripts/extract.py'),path.join(dir,'uploads',candidate.documentId+'.pdf')]);
  workers.set(candidate.id,child);
  let out='',err='',done=false;
  const timer=setTimeout(()=>child.kill(),180000);
  child.stdout.on('data',x=>{out+=x;if(out.length>4*1024*1024)child.kill();});child.stderr.on('data',x=>{if(err.length<2000)err+=x;});
  function finish(code){
   if(done)return;done=true;clearTimeout(timer);workers.delete(candidate.id);
   if(db.candidates.includes(candidate)){
    try{
     if(code!==0)throw new Error(err.trim().split('\n').at(-1)||'Extraction failed or timed out. The original PDF is retained.');
     const result=JSON.parse(out);candidate.extracted=result;
     for(const key of profileFields)if(result.fields?.[key]!==undefined&&!(candidate.manualFields||[]).includes(key)&&!(key==='careEvidence'&&(candidate.manualFields||[]).includes('care')))candidate[key]=result.fields[key];
     candidate.initials=candidate.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
     candidate.processing='complete';delete candidate.extractionError;candidate.lastExtractionAt=new Date().toISOString();
     log('PDF extracted: '+candidate.name);
    }catch(error){candidate.processing='failed';candidate.extractionError=error.message;}
    save();
   }
   active--;processQueue();
  }
  child.on('error',()=>finish(1));child.on('close',finish);
 }
}
for(const c of db.candidates)if(['queued','processing'].includes(c.processing)){c.processing='queued';queue.push(c);}processQueue();

const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 try{
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail('Cross-origin request denied',403);
 const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('amah_session='))?.slice(13);
 const session=sessions.get(token);const authenticated=session&&session>Date.now();
 if(p.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
 if(p==='/api/session'&&req.method==='GET')return json(res,200,{authenticated:!!authenticated,demo});
 if(p==='/api/login'&&req.method==='POST'){
  const b=await body(req);const attempt=String(b.password||'');if(attempt.length>1000)fail('Invalid password',401);
  const key=req.socket.remoteAddress;server.attempts??=new Map();const prior=server.attempts.get(key);if(prior&&prior.count>=10&&Date.now()-prior.at<60000)fail('Too many attempts. Try again in a minute.',429);
  if(!timingSafeEqual(passwordHash,scryptSync(attempt,salt,32))){server.attempts.set(key,{count:prior&&Date.now()-prior.at<60000?prior.count+1:1,at:Date.now()});fail('Incorrect agency password',401);}
  server.attempts.delete(key);const t=randomBytes(32).toString('hex');sessions.set(t,Date.now()+12*3600000);res.setHeader('Set-Cookie',`amah_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return json(res,200,{ok:true});
 }
 if(p.startsWith('/api/')&&!authenticated)fail('Please sign in',401);
 if(p==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','amah_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(p==='/api/state'&&req.method==='GET')return json(res,200,{...db,demo,processingCapabilities:{ocrAvailable}});
 if(p==='/api/customers'&&req.method==='POST'){
  const b=await body(req);const intake=validateIntake(b);if(!String(b.name||'').trim())fail('Customer name is required');
  const c={id:id(),name:String(b.name).trim().slice(0,100),contact:b.contact||'',phone:b.phone||'',household:intake.householdComposition?householdSummary(intake.householdComposition):b.household||'',...intake,notes:b.notes||'',preferences:b.preferences||{},requirements:b.requirements||{},budget:b.budget||null,startDate:b.startDate||'',status:'Matching',shortlist:[],ranking:[],rankingNotes:[],createdAt:new Date().toISOString()};db.customers.unshift(c);log('Customer added: '+c.name);save();return json(res,201,c);
 }
 const customerMatch=p.match(/^\/api\/customers\/([^/]+)(?:\/(matches|shortlist|ranking|requirements))?$/);
 if(customerMatch){
  const c=db.customers.find(c=>c.id===customerMatch[1]);if(!c)fail('Customer not found',404);const action=customerMatch[2];
  if(action==='matches'&&req.method==='GET')return json(res,200,rank(db.candidates,c));
  if(action==='requirements'&&req.method==='PATCH'){
    const b=await body(req),intake=validateIntake(b);
    if(b.name!==undefined&&!String(b.name).trim())fail('Customer name is required');
    if(b.requirements!==undefined){c.requirements=b.requirements;c.budget=c.requirements.salary?.priority!=='none'?c.requirements.salary?.value??null:null;c.startDate=c.requirements.availableBy?.priority!=='none'?c.requirements.availableBy?.value||'':'';}
    for(const k of ['name','contact','phone','notes'])if(b[k]!==undefined)c[k]=String(b[k]);
    Object.assign(c,intake);
    if(intake.householdComposition)c.household=householdSummary(intake.householdComposition);
    log('Customer intake updated for '+c.name);save();return json(res,200,c);
  }
  if(action==='ranking'&&req.method==='POST'){const b=await body(req);if(!String(b.reason||'').trim())fail('A reason is required');if(!Array.isArray(b.order)||b.order.some(x=>!db.candidates.some(c=>c.id===x))||new Set(b.order).size!==b.order.length)fail('Invalid order');c.ranking=b.order;c.rankingNotes??=[];c.rankingNotes.unshift({candidateId:b.candidateId,reason:String(b.reason).slice(0,2000),at:new Date().toISOString()});save();return json(res,200,c);}
  if(action==='shortlist'&&req.method==='POST'){
   const b=await body(req),candidate=db.candidates.find(x=>x.id===b.candidateId);if(!candidate)fail('Candidate not found',404);
   let entry=c.shortlist.find(x=>x.candidateId===candidate.id);
   if(!entry){if(['Reserved','Placed','Withdrawn'].includes(candidate.availability))fail('This candidate is '+candidate.availability.toLowerCase()+' and cannot enter a new shortlist.',409);entry={candidateId:candidate.id,status:'Shortlisted',notes:[],createdAt:new Date().toISOString()};c.shortlist.push(entry);log(candidate.name+' shortlisted for '+c.name);}
   if(b.status){if(!stage.includes(b.status))fail('Invalid shortlist status');entry.status=b.status;if(b.status==='Sent to customer')entry.sentAt=new Date().toISOString();if(b.status==='Interview scheduled')c.status='Interviewing';if(b.status==='Selected'){c.status='Selected';candidate.availability='Reserved';}}
   if(b.note)entry.notes.push({text:String(b.note).slice(0,4000),at:new Date().toISOString()});
   if(b.interviewDate!==undefined)entry.interviewDate=b.interviewDate;
   if(b.verifiedEnglish&&['basic','conversational','fluent'].includes(b.verifiedEnglish))candidate.verifiedEnglish=b.verifiedEnglish;
   save();return json(res,200,c);
  }
 }
 const reextract=p.match(/^\/api\/candidates\/([^/]+)\/extract$/);
 if(reextract&&req.method==='POST'){
  const c=db.candidates.find(x=>x.id===reextract[1]);if(!c)fail('Candidate not found',404);
  if(!c.documentId)fail('No source PDF is attached to this profile');
  if(['queued','processing'].includes(c.processing))fail('Extraction is already in progress',409);
  c.processing='queued';c.reviewStatus='review';queue.push(c);save();processQueue();return json(res,202,{ok:true});
 }
 const candidateMatch=p.match(/^\/api\/candidates\/([^/]+)$/);
 if(candidateMatch&&req.method==='DELETE'){
  const c=db.candidates.find(x=>x.id===candidateMatch[1]);if(!c)fail('Candidate not found',404);
  workers.get(c.id)?.kill();
  for(let i=queue.length-1;i>=0;i--)if(queue[i].id===c.id)queue.splice(i,1);
  if(c.documentId)rmSync(path.join(dir,'uploads',c.documentId+'.pdf'),{force:true});
  db.candidates=db.candidates.filter(x=>x.id!==c.id);
  for(const customer of db.customers){
   const selected=customer.shortlist.some(s=>s.candidateId===c.id&&s.status==='Selected');
   customer.shortlist=customer.shortlist.filter(s=>s.candidateId!==c.id);
   customer.ranking=(customer.ranking||[]).filter(id=>id!==c.id);
   customer.rankingNotes=(customer.rankingNotes||[]).filter(n=>n.candidateId!==c.id);
   if(selected&&customer.status==='Selected')customer.status='Matching';
  }
  log('Profile deleted: '+c.name);save();return json(res,200,{ok:true});
 }
 if(candidateMatch&&req.method==='PATCH'){
  const c=db.candidates.find(x=>x.id===candidateMatch[1]);if(!c)fail('Candidate not found',404);const b=await body(req);
  if(b.name!==undefined&&(!String(b.name).trim()||typeof b.name!=='string'))fail('Name is required');
  for(const key of ['age','years','salary','restDays','height_cm','weight_kg','siblings','childrenCount'])if(b[key]!=null&&(!Number.isFinite(b[key])||b[key]<0))fail('Invalid '+key);
  if(b.children!==undefined&&b.children!==null&&(!Array.isArray(b.children)||b.children.some(a=>!Number.isFinite(a)||a<0||a>100)))fail('Invalid child ages');
  if(b.jobs!==undefined&&(!Array.isArray(b.jobs)||b.jobs.length>30||b.jobs.some(j=>!j||typeof j!=='object'||j.from!=null&&!Number.isFinite(j.from)||j.to!=null&&!Number.isFinite(j.to)||j.from!=null&&j.to!=null&&j.from>j.to)))fail('Invalid employment history');
  c.manualFields??=[];
  for(const key of profileFields)if(b[key]!==undefined&&JSON.stringify(c[key])!==JSON.stringify(b[key])){
   const empty=v=>v==null||v===''||Array.isArray(v)&&!v.length;
   const correction=key==='care'||!(empty(c[key])&&empty(b[key]));
   c[key]=b[key];if(correction&&!c.manualFields.includes(key))c.manualFields.push(key);
  }
  if(b.care!==undefined&&c.manualFields.includes('care'))c.careEvidence=Object.fromEntries(['Infant','Child','Elderly','Disability'].map(k=>[k,Array.isArray(c.care)&&!c.care.length?false:c.care?.includes(k)?true:null]));
  if(b.availability){if(!validStatus.includes(b.availability))fail('Invalid availability');c.availability=b.availability;}
  if(b.reviewStatus){if(!['review','verified'].includes(b.reviewStatus))fail('Invalid review status');c.reviewStatus=b.reviewStatus;}
  if(b.note){c.notes??=[];c.notes.push({text:String(b.note).slice(0,4000),at:new Date().toISOString()});}
  c.initials=c.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  save();return json(res,200,c);
 }
 if(p==='/api/upload'&&req.method==='POST'){
  const b=await body(req);if(typeof b.content!=='string'||typeof b.name!=='string')fail('PDF file required');const buffer=Buffer.from(b.content,'base64');if(buffer.length>15*1024*1024)fail('Maximum PDF size is 15 MB',413);if(!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))fail('Please upload a valid PDF');
  const documentId=id();writeFileSync(path.join(dir,'uploads',documentId+'.pdf'),buffer);
  const c={id:id(),documentId,originalName:path.basename(b.name),name:path.basename(b.name).replace(/\.pdf$/i,'').slice(0,100),initials:'PDF',color:'blue',availability:'Unconfirmed',reviewStatus:'review',processing:'queued',supplier:b.supplier||'',care:null,cooking:null,homes:null,english:null,years:null,salary:null,notes:[],jobs:[],createdAt:new Date().toISOString(),source:'Uploaded PDF'};
  db.candidates.unshift(c);save();queue.push(c);processQueue();return json(res,201,c);
 }
 const docMatch=p.match(/^\/api\/documents\/([a-f0-9]+)$/);
 if(docMatch&&req.method==='GET'){const c=db.candidates.find(c=>c.documentId===docMatch[1]);if(!c)fail('Document not found',404);const file=path.join(dir,'uploads',c.documentId+'.pdf');res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${c.documentId}.pdf"`,'Cache-Control':'private, no-store'});return res.end(readFileSync(file));}
 if(p==='/api/backup'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="amah-backup.json"');return json(res,200,db);}
 if(p.startsWith('/api/'))fail('Route not found',404);
 if(!['GET','HEAD'].includes(req.method))fail('Method not allowed',405);
 const files={'/':'index.html','/app.js':'app.js','/intake.js':'intake.js','/profile.js':'profile.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};const file=files[p];if(!file)fail('Not found',404);const mime={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',svg:'image/svg+xml'};res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]});res.end(readFileSync(path.join(root,'public',file)));
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'An unexpected error occurred'});else res.end();if(!e.status)console.error(e);}
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Amah running on port ${process.env.PORT||3000}${demo?' · demo login enabled':''}`));
