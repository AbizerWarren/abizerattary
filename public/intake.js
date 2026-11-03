// Shared intake schema and validation, used by the form and API.
export const numericPreferences = [
  ['age', 'Age', 'years', 100, true],
  ['weight', 'Weight', 'kg', 300, false],
  ['height', 'Height', 'cm', 250, false],
  ['childrenCount', 'Number of kids', '', 30, true],
  ['childrenAge', 'Age of kids', 'years', 100, false],
  ['siblings', 'Number of siblings', '', 30, true],
  ['experienceYears', 'Years of experience', 'years', 80, false]
];
export const educationLevels = ['No formal education', 'Primary', 'Lower secondary', 'Upper secondary / high school', 'Diploma / vocational', 'Bachelor’s degree', 'Postgraduate'];
const rankingOptions = {
  nationality: ['Indonesian', 'Myanmar', 'Indian', 'Filipino', 'Sri Lankan', 'Bangladeshi'],
  maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'],
  religion: ['Muslim', 'Christian', 'Catholic', 'Buddhist', 'Hindu', 'Sikh', 'No religion']
};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function invalid(message) { throw Object.assign(new Error(message), {status:400}); }
function rangeCheck(value, label, max, integer=false) {
  if (!value || typeof value.noPreference !== 'boolean') invalid(`${label}: select a preference or No preference.`);
  const result = {noPreference:value.noPreference, ideal:null, upper:null, lower:null};
  if (value.noPreference) return result;
  for (const key of ['ideal','upper','lower']) {
    const n = value[key];
    if (n === null || n === undefined || n === '') continue;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) invalid(`${label}: enter ${integer ? 'whole numbers' : 'numbers'} between 0 and ${max}.`);
    result[key] = n;
  }
  if (Object.values(result).slice(1).every(n=>n===null)) invalid(`${label}: enter an ideal value or a bound, or choose No preference.`);
  if (result.lower !== null && result.upper !== null && result.lower > result.upper) invalid(`${label}: lower bound cannot exceed upper bound.`);
  if (result.ideal !== null && ((result.lower !== null && result.ideal < result.lower) || (result.upper !== null && result.ideal > result.upper))) invalid(`${label}: ideal must fall within the bounds.`);
  return result;
}
export function validateIntake(body) {
  const result = {};
  if (body.householdComposition !== undefined) {
    const h = body.householdComposition;
    if (!h || !Number.isInteger(h.residentCount) || h.residentCount < 1 || h.residentCount > 30) invalid('Number of residents must be between 1 and 30.');
    if (!Array.isArray(h.residentAges) || h.residentAges.length !== h.residentCount || h.residentAges.some(a=>typeof a!=='number'||!Number.isFinite(a)||a<0||a>120)) invalid('Enter a valid age for every resident (0–120 years).');
    result.householdComposition = {residentCount:h.residentCount, residentAges:h.residentAges};
    for (const k of ['maritalStatus','residenceType','religion','nationality']) result.householdComposition[k] = String(h[k] || '').slice(0,150);
  }
  if (body.fdwPreferences !== undefined) {
    const f = body.fdwPreferences;
    if (!f || typeof f !== 'object') invalid('Invalid FDW preferences.');
    const clean = {};
    for (const [k,label,,max,integer] of numericPreferences) clean[k] = rangeCheck(f[k],label,max,integer);
    for (const k of Object.keys(rankingOptions)) {
      const item = f[k];
      if (!item || typeof item.noPreference !== 'boolean' || !Array.isArray(item.ranking)) invalid(`Invalid ${k} ranking.`);
      if (item.ranking.length>30 || item.ranking.some(x=>typeof x!=='string'||!x.trim()||x.length>100)) invalid(`Invalid ${k} options.`);
      const ranking = item.ranking.map(x=>x.trim());
      if (new Set(ranking.map(x=>x.toLowerCase())).size !== ranking.length) invalid(`${k}: each option may appear only once.`);
      if (!item.noPreference && !ranking.length) invalid(`${k}: choose at least one option, or select No preference.`);
      clean[k] = {noPreference:item.noPreference, ranking:item.noPreference ? [] : ranking};
    }
    const e=f.education;
    if (!e || typeof e.noPreference!=='boolean') invalid('Invalid education preference.');
    const edu = {noPreference:e.noPreference,ideal:null,upper:null,lower:null};
    if (!e.noPreference) {
      const positions = {};
      for(const k of ['ideal','upper','lower']) {
        const v=e[k];
        if(v==null||v==='')continue;
        if(!educationLevels.includes(v))invalid('Select a valid education level.');
        edu[k]=v;positions[k]=educationLevels.indexOf(v);
      }
      if(!Object.keys(positions).length)invalid('Education: choose a level or No preference.');
      if(positions.lower!=null&&positions.upper!=null&&positions.lower>positions.upper)invalid('Education: lower bound cannot exceed upper bound.');
      if(positions.ideal!=null&&((positions.lower!=null&&positions.ideal<positions.lower)||(positions.upper!=null&&positions.ideal>positions.upper)))invalid('Education: ideal must fall within the bounds.');
    }
    clean.education=edu;
    if(!['any','experienced','fresher'].includes(f.experienceType))invalid('Choose Experienced, Fresher or No preference.');
    if(!['any','ex-sg','ex-non-sg'].includes(f.workLocation))invalid('Choose Ex-SG, Ex-non-SG or No preference.');
    clean.experienceType=f.experienceType;clean.workLocation=f.workLocation;
    if(clean.experienceType==='fresher'&&!clean.experienceYears.noPreference&&Object.values(clean.experienceYears).slice(1).some(n=>n!==null&&n>0))invalid('A fresher cannot require prior years of experience.');
    if(clean.experienceType==='fresher'&&clean.workLocation!=='any')invalid('A fresher has no prior work location. Choose No preference for work location.');
    result.fdwPreferences=clean;
  }
  return result;
}
export function householdSummary(h) {
  return `${h.residentCount} residents · ages ${h.residentAges.join(', ')}${h.residenceType?' · '+h.residenceType:''}`;
}
function options(values,current,placeholder='Not specified') {
  return `<option value="">${placeholder}</option>`+values.map(v=>`<option ${v===current?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('');
}
export function residentAgeFields(count,ages=[]) {
  return Array.from({length:count},(_,i)=>`<label class="field">Resident ${i+1}<input type="number" name="residentAge_${i}" min="0" max="120" step="any" required value="${esc(ages[i]??'')}" aria-label="Resident ${i+1} age" placeholder="Age in years"></label>`).join('');
}
export function householdFields(h={}) {
  return `<section class="intake-section"><h3>Customer House Composition</h3>
    <div class="intake-question"><label class="field"><span>1. Number of residents</span><input name="residentCount" type="number" min="1" max="30" step="1" required value="${esc(h.residentCount??'')}" placeholder="e.g. 4"></label></div>
    <div class="intake-question"><div class="question-label">2. Age of each resident</div><div class="resident-ages" id="resident-ages">${h.residentCount?residentAgeFields(h.residentCount,h.residentAges):'<span class="form-note">Enter the number of residents first.</span>'}</div><div class="form-note">Use years. For infants, 6 months = 0.5 years.</div></div>
    <div class="intake-question"><label class="field">3. Marital status<select name="household_maritalStatus">${options(['Single','Married','Divorced','Widowed','Separated','Other'],h.maritalStatus)}</select></label></div>
    <div class="intake-question"><label class="field">4. Type of residence<select name="household_residenceType">${options(['HDB flat','Condominium','Apartment','Landed house','Other'],h.residenceType)}</select></label></div>
    <div class="intake-question"><label class="field">5. Religion<input name="household_religion" value="${esc(h.religion||'')}" placeholder="Not specified" maxlength="150"></label></div>
    <div class="intake-question"><label class="field">6. Nationality<input name="household_nationality" value="${esc(h.nationality||'')}" placeholder="Not specified" maxlength="150"></label></div>
  </section>`;
}
function rangeField(k,label,number,value={},education=false) {
  const noPreference=value.noPreference!==false;
  const config=numericPreferences.find(x=>x[0]===k);
  return `<div class="intake-question preference-block" data-preference="${k}"><div class="question-heading"><span class="question-label">${number}. ${label}${config?.[2]?' ('+config[2]+')':''}</span><label class="no-preference"><input type="checkbox" name="${k}_none" data-no-preference ${noPreference?'checked':''}>No preference</label></div>
    <fieldset class="range-inputs" ${noPreference?'disabled hidden':''}>${[['ideal','Ideal'],['upper','Upper bound'],['lower','Lower bound']].map(([key,text])=>`<label class="field">${text}${education?`<select name="${k}_${key}">${options(educationLevels,value[key],'Not set')}</select>`:`<input type="number" name="${k}_${key}" value="${esc(value[key]??'')}" min="0" max="${config[3]}" step="${config[4]?'1':'any'}" placeholder="Not set">`}</label>`).join('')}</fieldset></div>`;
}
export function rankingContents(k,ranking,available=rankingOptions[k]) {
  return `<div class="ranking-options">${available.map(v=>`<label class="check"><input type="checkbox" data-rank-option value="${esc(v)}" ${ranking.includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div><ol class="preference-ranking">${ranking.map((v,i)=>`<li><span class="rank-position">${i+1}</span><span>${esc(v)}</span><div class="rank-buttons"><button type="button" data-intake-action="rank-up" data-index="${i}" aria-label="Move ${esc(v)} up" ${i===0?'disabled':''}>↑</button><button type="button" data-intake-action="rank-down" data-index="${i}" aria-label="Move ${esc(v)} down" ${i===ranking.length-1?'disabled':''}>↓</button></div></li>`).join('')}</ol>${ranking.length?'':'<div class="form-note">Select options, then order them from most to least preferred.</div>'}<div class="custom-ranking"><input type="text" data-custom-option maxlength="100" placeholder="Add another option" aria-label="Other ${esc(k)} option"><button class="btn small" type="button" data-intake-action="rank-add">Add</button></div>`;
}
function rankedField(k,label,number,value={}) {
  const ranking=value.ranking||[],available=[...new Set([...rankingOptions[k],...ranking])];
  const none=value.noPreference!==false;
  return `<div class="intake-question preference-block" data-preference="${k}" data-ranking="${esc(JSON.stringify(ranking))}" data-options="${esc(JSON.stringify(available))}"><div class="question-heading"><span class="question-label">${number}. ${label}</span><label class="no-preference"><input type="checkbox" name="${k}_none" data-no-preference ${none?'checked':''}>No preference</label></div><fieldset class="ranked-inputs" ${none?'disabled hidden':''}>${rankingContents(k,ranking,available)}</fieldset></div>`;
}
export function preferenceFields(f={}) {
  return `<section class="intake-section"><h3>FDW Preference</h3>
    ${rangeField('age','Age',1,f.age)}
    ${rankedField('nationality','Nationality',2,f.nationality)}
    ${rankedField('maritalStatus','Marital status',3,f.maritalStatus)}
    ${rangeField('weight','Weight',4,f.weight)}
    ${rangeField('height','Height',5,f.height)}
    ${rangeField('childrenCount','Number of kids',6,f.childrenCount)}
    ${rangeField('childrenAge','Age of kids',7,f.childrenAge)}
    ${rankedField('religion','Religion',8,f.religion)}
    <div class="intake-question"><label class="field">9. Experienced or fresher<select name="experienceType">${[['any','No preference'],['experienced','Experienced'],['fresher','Fresher']].map(([v,l])=>`<option value="${v}" ${(f.experienceType||'any')===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="intake-question"><label class="field">10. Previous work location<select name="workLocation">${[['any','No preference'],['ex-sg','Ex-SG'],['ex-non-sg','Ex-non-SG']].map(([v,l])=>`<option value="${v}" ${(f.workLocation||'any')===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
    ${rangeField('education','Education',11,f.education,true)}
    ${rangeField('siblings','Number of siblings',12,f.siblings)}
    ${rangeField('experienceYears','Years of experience',13,f.experienceYears)}
  </section>`;
}
export function readIntake(form) {
  const fd=new FormData(form),count=Number(fd.get('residentCount'));
  const h={residentCount:count,residentAges:Array.from({length:count},(_,i)=>{const value=fd.get('residentAge_'+i);return value===''||value==null?null:Number(value);})};
  for(const k of ['maritalStatus','residenceType','religion','nationality'])h[k]=fd.get('household_'+k)||'';
  const f={experienceType:fd.get('experienceType'),workLocation:fd.get('workLocation')};
  for(const [k] of [...numericPreferences,['education']]) {
    f[k]={noPreference:fd.has(k+'_none')};
    for(const bound of ['ideal','upper','lower']) {
      const v=fd.get(k+'_'+bound);f[k][bound]=v==null||v===''?null:k==='education'?v:Number(v);
    }
  }
  for(const k of Object.keys(rankingOptions))f[k]={noPreference:fd.has(k+'_none'),ranking:JSON.parse(form.querySelector(`[data-preference="${k}"]`).dataset.ranking)};
  return validateIntake({householdComposition:h,fdwPreferences:f});
}
export function intakeSummary(c) {
  const h=c.householdComposition,f=c.fdwPreferences;
  if(!h&&!f)return '';
  const row=(label,value)=>`<div class="intake-summary-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  let html='';
  if(h)html+=`<section class="intake-section"><h3>Customer House Composition</h3>${row('Residents',h.residentCount)}${row('Resident ages',h.residentAges.join(', ')+' years')}${[['maritalStatus','Marital status'],['residenceType','Residence'],['religion','Religion'],['nationality','Nationality']].map(([k,l])=>row(l,h[k]||'Not specified')).join('')}</section>`;
  const range=(v,unit='')=>v.noPreference?'No preference':[['ideal','Ideal'],['upper','Upper'],['lower','Lower']].filter(([k])=>v[k]!=null).map(([k,l])=>l+': '+v[k]+(unit?' '+unit:'')).join(' · ');
  if(f)html+=`<section class="intake-section"><h3>FDW Preference</h3>${[
    ['Age',range(f.age,'years')],['Nationality',f.nationality.noPreference?'No preference':f.nationality.ranking.join(' → ')],['Marital status',f.maritalStatus.noPreference?'No preference':f.maritalStatus.ranking.join(' → ')],
    ['Weight',range(f.weight,'kg')],['Height',range(f.height,'cm')],['Number of kids',range(f.childrenCount)],['Age of kids',range(f.childrenAge,'years')],['Religion',f.religion.noPreference?'No preference':f.religion.ranking.join(' → ')],
    ['Experience type',{any:'No preference',experienced:'Experienced',fresher:'Fresher'}[f.experienceType]],['Previous work location',{any:'No preference','ex-sg':'Ex-SG','ex-non-sg':'Ex-non-SG'}[f.workLocation]],['Education',range(f.education)],['Number of siblings',range(f.siblings)],['Years of experience',range(f.experienceYears,'years')]
  ].map(([label,value])=>row(label,value)).join('')}</section>`;
  return html;
}
export function handleIntakeChange(target) {
  if(target.name==='residentCount') {
    const ages=[...target.form.querySelectorAll('[name^="residentAge_"]')].map(x=>x.value);
    const count=Number(target.value);
    target.form.querySelector('#resident-ages').innerHTML=Number.isInteger(count)&&count>=1&&count<=30?residentAgeFields(count,ages):'<span class="form-note">Enter between 1 and 30 residents.</span>';
  }
  if(target.hasAttribute('data-no-preference')) {
    const block=target.closest('.preference-block'),fieldset=block.querySelector('fieldset');
    fieldset.disabled=target.checked;fieldset.hidden=target.checked;
  }
  if(target.hasAttribute('data-rank-option')) {
    const block=target.closest('.preference-block'),list=JSON.parse(block.dataset.ranking);
    const next=target.checked?[...list,target.value]:list.filter(v=>v!==target.value);
    block.dataset.ranking=JSON.stringify(next);block.querySelector('fieldset').innerHTML=rankingContents(block.dataset.preference,next,JSON.parse(block.dataset.options));
  }
}
export function handleIntakeClick(button) {
  const block=button.closest('.preference-block'),list=JSON.parse(block.dataset.ranking),available=JSON.parse(block.dataset.options);
  if(button.dataset.intakeAction==='rank-add') {
    const input=block.querySelector('[data-custom-option]'),value=input.value.trim();
    if(!value)return;
    if(available.some(v=>v.toLowerCase()===value.toLowerCase()))invalid('That option already exists. Select it from the list.');
    available.push(value);list.push(value);
  } else {
    const i=Number(button.dataset.index),j=i+(button.dataset.intakeAction==='rank-up'?-1:1);
    if(j<0||j>=list.length)return;
    [list[i],list[j]]=[list[j],list[i]];
  }
  block.dataset.ranking=JSON.stringify(list);block.dataset.options=JSON.stringify(available);
  block.querySelector('fieldset').innerHTML=rankingContents(block.dataset.preference,list,available);
}
