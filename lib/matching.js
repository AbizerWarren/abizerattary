export const criteria = {
  care: 'Care experience', english: 'English', cooking: 'Cooking', experience: 'Employment experience',
  salary: 'Monthly salary', availableBy: 'Start date', restDays: 'Rest days', pets: 'Pets', home: 'Home experience'
};
const language = { basic: 1, conversational: 2, fluent: 3 };
export function analyze(candidate, customer) {
  const issues = [], matched = [], unknown = [], checks = [];
  const r = customer.requirements || {};
  function add(key, known, pass, explanation) {
    if (!r[key] || r[key].priority === 'none') return;
    const weight = r[key].priority === 'required' ? 3 : 1;
    checks.push({key, known, pass, weight});
    const entry = {key, label: criteria[key], text: explanation, required: weight === 3};
    if (!known) unknown.push(entry); else if (pass) matched.push(entry); else issues.push(entry);
  }
  const care = r.care?.value;
  add('care', candidate.care != null, candidate.care?.includes(care), `${care || 'Care'} experience ${candidate.care?.includes(care) ? 'documented' : 'not documented'}`);
  const english = candidate.verifiedEnglish || candidate.english;
  add('english', !!language[english], language[english] >= language[r.english?.value], `${english || 'Unverified'} English${candidate.verifiedEnglish ? ' · interview verified' : ''}`);
  add('cooking', candidate.cooking != null, candidate.cooking?.includes(r.cooking?.value), `${r.cooking?.value || 'Requested'} cooking ${candidate.cooking?.includes(r.cooking?.value) ? 'documented' : 'not documented'}`);
  add('experience', candidate.years != null, candidate.years >= Number(r.experience?.value), `${candidate.years ?? 'Unknown'} years of employment experience`);
  add('salary', candidate.salary != null, candidate.salary <= Number(r.salary?.value), candidate.salary == null ? 'Salary needs confirmation' : `S$${candidate.salary}/month · budget S$${r.salary?.value}`);
  add('availableBy', !!candidate.availableFrom, candidate.availableFrom <= r.availableBy?.value, candidate.availableFrom ? `Available ${candidate.availableFrom}` : 'Start date needs confirmation');
  add('restDays', candidate.restDays != null, candidate.restDays <= Number(r.restDays?.value), candidate.restDays == null ? 'Rest-day arrangement needs confirmation' : `${candidate.restDays} rest days/month requested`);
  add('pets', candidate.pets != null, candidate.pets === true, candidate.pets == null ? 'Pet comfort needs confirmation' : candidate.pets ? 'Comfortable with pets' : 'Not comfortable with pets');
  add('home', candidate.homes != null, candidate.homes?.includes(r.home?.value), `${r.home?.value || 'Requested'} home experience ${candidate.homes?.includes(r.home?.value) ? 'documented' : 'not documented'}`);
  const totalWeight = checks.reduce((a,c) => a+c.weight, 0);
  const score = totalWeight ? Math.round(checks.reduce((a,c) => a+(c.known && c.pass ? c.weight : 0),0)/totalWeight*100) : null;
  const failed = issues.some(x=>x.required), pending = unknown.some(x=>x.required);
  let eligibility = failed ? 'Requirement mismatch' : pending ? 'Needs verification' : checks.length ? 'Meets requirements' : 'Requirements needed';
  const warnings = [];
  if(candidate.reviewStatus !== 'verified') warnings.push('Profile needs staff review');
  if(candidate.availability === 'Unconfirmed') warnings.push('Availability unconfirmed');
  if(candidate.availability === 'Reserved') warnings.push('Reserved · cannot shortlist');
  if(candidate.reviewStatus !== 'verified' && eligibility === 'Meets requirements') eligibility = 'Needs verification';
  return {score, eligibility, matched, issues, unknown, warnings, checks};
}
export function rank(candidates, customer) {
  const order = {'Meets requirements':0,'Needs verification':1,'Requirement mismatch':2,'Requirements needed':3};
  return candidates.filter(c=>!['Placed','Withdrawn'].includes(c.availability)).map(c=>({...c, match:analyze(c,customer)})).sort((a,b)=>order[a.match.eligibility]-order[b.match.eligibility] || (b.match.score ?? -1)-(a.match.score ?? -1));
}
