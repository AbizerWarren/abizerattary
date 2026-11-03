const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fieldLabels={name:'Name',dob:'Date of birth',age:'Age',nationality:'Nationality',marital:'Marital status',religion:'Religion',education:'Education',height_cm:'Height',weight_kg:'Weight',siblings:'Siblings',childrenCount:'Number of children',children:'Children’s ages',english:'English',salary:'Monthly salary',restDays:'Rest days',years:'Experience',jobs:'Employment history',care:'Care experience',careEvidence:'Care details',willingness:'Willingness',cooking:'Cooking',workLocation:'Previous work location',referenceCode:'Reference code',placeOfBirth:'Place of birth',summary:'Summary',pets:'Pets',homes:'Home experience',availableFrom:'Available from',dietaryRestrictions:'Dietary restrictions',languages:'Spoken languages'};
export function extractionStatus(c){
 const x=c.extracted;if(!x?.fields)return '';
 return `<section class="panel"><div class="section-head"><h3 style="margin:0">PDF extraction</h3><span class="pill green">${Object.keys(x.fields).length} fields populated</span></div><p class="form-note">Verify populated values against the PDF before marking the profile reviewed.</p>${x.warnings?.length?`<div class="notice">${x.warnings.map(esc).join('<br>')}</div>`:''}${x.missing?.length?`<details><summary class="small muted">${x.missing.length} fields need confirmation</summary><p class="form-note">${x.missing.map(k=>esc(fieldLabels[k]||k)).join(', ')}</p></details>`:''}</section>`;
}
export function extractionEvidence(c){
 const x=c.extracted;if(!x?.evidence)return '';
 return `<details class="field-evidence"><summary class="small">Field sources</summary>${Object.entries(x.evidence).map(([k,e])=>`<div class="detail-note"><strong>${esc(fieldLabels[k]||k)}</strong><small>${c.manualFields?.includes(k)?'Edited by staff · original extraction: ':''}${e.page?'Page '+e.page+' · ':''}${esc(e.method)}</small><p class="form-note">${esc(e.text)}</p></div>`).join('')}</details>${x.conflicts?.length?`<details class="field-evidence"><summary class="small">Conflicting extracted values (${x.conflicts.length})</summary>${x.conflicts.map(c=>`<div class="detail-note">${esc(fieldLabels[c.field]||c.field)}<p class="form-note">${esc(JSON.stringify(c.value))} / ${esc(JSON.stringify(c.alternative))} · page ${c.page}</p></div>`).join('')}</details>`:''}`;
}
export function personalFields(c,input,select){
 return `${input('Spoken languages','languagesText',c.languages?.join(', ')||'','text','placeholder="e.g. Indonesian, Malay"')}${input('Height (cm)','height_cm',c.height_cm??'','number','min="100" max="250" step="any"')}${input('Weight (kg)','weight_kg',c.weight_kg??'','number','min="0" max="300" step="any"')}${select('Marital status','marital',[['','Unknown'],'Single','Married','Divorced','Widowed','Separated','Other'],c.marital||'')}${input('Religion','religion',c.religion||'')}${input('Education','education',c.education||'')}${input('Number of siblings','siblings',c.siblings??'','number','min="0" max="30"')}${input('Number of children','childrenCount',c.childrenCount??'','number','min="0" max="30"')}${input('Children’s ages (years)','childrenAges',c.children?.join(', ')??'','text','placeholder="e.g. 3, 7, 12"')}${select('Previous work location','workLocation',[['','Unknown'],['ex-sg','Ex-SG'],['ex-non-sg','Ex-non-SG']],c.workLocation||'')}${input('Reference code','referenceCode',c.referenceCode||'')}${input('Place of birth','placeOfBirth',c.placeOfBirth||'')}${input('Dietary restrictions','dietaryRestrictions',c.dietaryRestrictions||'')}`;
}
export function employmentEditor(c,input,select){
 const jobs=c.jobs||[];
 return `<section class="panel"><div class="section-head"><h3 style="margin:0">Employment history</h3><button class="btn small" type="button" data-action="add-job">+ Add job</button></div><div id="job-editor">${jobs.map((j,i)=>jobFields(j,i,input,select)).join('')}</div><div class="form-note">Year-only dates provide approximate durations. Care duties and children’s ages must be explicitly documented.</div></section>`;
}
export function jobFields(j,i,input,select){
 return `<div class="employment-entry" data-job><div class="field-grid">${input('From (year)',`job_${i}_from`,j.from??'','number','min="1970" max="2100"')}${input('To (year)',`job_${i}_to`,j.to??'','number','min="1970" max="2100"')}${input('Country',`job_${i}_country`,j.country||'')}${input('Children’s ages in this job',`job_${i}_kidAges`,j.kid_ages?.join(', ')||'','text','placeholder="Only if stated"')}<label class="field full">Duties<textarea name="job_${i}_duties">${esc(j.duties||'')}</textarea></label>${select('Contract outcome',`job_${i}_exit`,[['unknown','Unknown'],['finished','Completed'],['early','Left early']],j.exit||'unknown')}<label class="check"><input type="checkbox" name="job_${i}_elderly" ${j.elderly?'checked':''}>Elderly care</label></div><button class="btn quiet small danger" type="button" data-action="remove-job">Remove job</button></div>`;
}
export function readJobs(form){
 return [...form.querySelectorAll('[data-job]')].map(row=>{
  const get=suffix=>row.querySelector(`[name$="_${suffix}"]`);
  const from=get('from').value,to=get('to').value;
  if(from&&to&&Number(from)>Number(to))throw new Error('Job start year cannot be after its end year.');
  const kid_ages=parseAges(get('kidAges').value);
  const country=get('country').value.trim();
  return {from:from?Number(from):null,to:to?Number(to):null,period:`${from||'?'}–${to||'?'}`,country,duties:get('duties').value.trim(),exit:get('exit').value,singapore:country.toLowerCase()==='singapore',kid_ages,child_care:kid_ages?.length>0,elderly:get('elderly').checked};
 });
}
export function parseAges(text){
 if(!text.trim())return null;
 const values=text.split(/[,;/]/).map(x=>x.trim());
 if(values.some(x=>!/^\d+(?:\.\d+)?$/.test(x)||Number(x)>100))throw new Error('Enter child ages as numbers separated by commas.');
 return values.map(Number);
}
