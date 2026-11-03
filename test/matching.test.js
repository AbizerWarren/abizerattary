import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,rank} from '../lib/matching.js';
import {seed} from '../lib/seed.js';
test('a high score cannot hide failure of a required criterion',()=>{
 const {candidates,customers}=seed();const p={...candidates[0],english:'basic'};
 const result=analyze(p,customers[0]);assert.ok(result.score>70);assert.equal(result.eligibility,'Requirement mismatch');assert.ok(result.issues.some(x=>x.key==='english'&&x.required));
});
test('missing required data is verification-needed, not an invented match',()=>{
 const {candidates,customers}=seed();const result=analyze({...candidates[0],salary:null},customers[0]);
 assert.equal(result.eligibility,'Needs verification');assert.ok(result.unknown.some(x=>x.key==='salary'));assert.equal(result.issues.length,0);
});
test('verified language overrides the agency declaration',()=>{
 const {candidates,customers}=seed();assert.equal(analyze({...candidates[0],english:'basic',verifiedEnglish:'fluent'},customers[0]).eligibility,'Meets requirements');
});
test('a fresher has known zero experience; no history does not establish infant care',()=>{
 const {candidates,customers}=seed();const result=analyze(candidates.find(c=>c.years===0),customers[0]);assert.ok(result.issues.some(x=>x.key==='experience'));assert.ok(result.issues.some(x=>x.key==='care'));
});
test('placed and withdrawn candidates are excluded; eligibility precedes score',()=>{
 const {candidates,customers}=seed();const list=rank([...candidates,{...candidates[0],id:'placed',availability:'Placed'},{...candidates[0],id:'withdrawn',availability:'Withdrawn'}],customers[0]);
 assert.ok(!list.some(c=>['placed','withdrawn'].includes(c.id)));assert.equal(list[0].match.eligibility,'Meets requirements');
});
test('no customer requirements does not produce a perfect score',()=>{const {candidates}=seed();assert.equal(analyze(candidates[0],{}).score,null);assert.equal(analyze(candidates[0],{}).eligibility,'Requirements needed');});
test('personal background does not alter the fit score',()=>{const {candidates,customers}=seed();assert.equal(analyze(candidates[0],customers[0]).score,analyze({...candidates[0],nationality:'Other',age:50,religion:'Other',marital:'divorced'},customers[0]).score);});
test('generic child-care declaration does not establish infant experience',()=>{const {candidates,customers}=seed();const result=analyze({...candidates[0],care:['Child'],careEvidence:{Child:true,Infant:null}},customers[0]);assert.equal(result.eligibility,'Needs verification');assert.ok(result.unknown.some(x=>x.key==='care'));});
