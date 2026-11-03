import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIntake, householdSummary, numericPreferences} from '../public/intake.js';
export function intakeFixture(){
 const f={experienceType:'experienced',workLocation:'ex-sg'};
 for(const [key] of [...numericPreferences,['education']])f[key]={noPreference:true,ideal:null,upper:null,lower:null};
 for(const key of ['nationality','maritalStatus','religion'])f[key]={noPreference:true,ranking:[]};
 f.age={noPreference:false,ideal:30,upper:40,lower:25};
 f.nationality={noPreference:false,ranking:['Myanmar','Indonesian']};
 return {householdComposition:{residentCount:3,residentAges:[35,32,0.75],maritalStatus:'Married',residenceType:'Condominium',religion:'Hindu',nationality:'Singaporean'},fdwPreferences:f};
}
test('intake keeps resident ages including infants, ranked options and explicit no-preference',()=>{
 const input=intakeFixture(),out=validateIntake(input);assert.deepEqual(out.householdComposition.residentAges,[35,32,0.75]);assert.deepEqual(out.fdwPreferences.nationality.ranking,['Myanmar','Indonesian']);assert.equal(out.fdwPreferences.height.noPreference,true);assert.equal(householdSummary(out.householdComposition),'3 residents · ages 35, 32, 0.75 · Condominium');
});
test('each resident must have an age',()=>{const b=intakeFixture();b.householdComposition.residentCount=4;assert.throws(()=>validateIntake(b),/every resident/);});
test('ranges reject inverted bounds and ideals outside bounds',()=>{const b=intakeFixture();b.fdwPreferences.age.lower=45;assert.throws(()=>validateIntake(b),/lower bound/);b.fdwPreferences.age.lower=35;assert.throws(()=>validateIntake(b),/ideal must/);});
test('zero is a valid ideal for number of children',()=>{const b=intakeFixture();b.fdwPreferences.childrenCount={noPreference:false,ideal:0,upper:2,lower:0};assert.equal(validateIntake(b).fdwPreferences.childrenCount.ideal,0);});
test('ranked questions reject empty choices and duplicate options',()=>{const b=intakeFixture();b.fdwPreferences.nationality.ranking=[];assert.throws(()=>validateIntake(b),/at least one/);b.fdwPreferences.nationality.ranking=['Myanmar','myanmar'];assert.throws(()=>validateIntake(b),/only once/);});
test('education validates levels in educational order',()=>{const b=intakeFixture();b.fdwPreferences.education={noPreference:false,ideal:'Upper secondary / high school',upper:'Bachelor’s degree',lower:'Primary'};assert.equal(validateIntake(b).fdwPreferences.education.lower,'Primary');b.fdwPreferences.education.lower='Postgraduate';assert.throws(()=>validateIntake(b),/lower bound/);});
test('no preference clears inactive bounds and ranking values',()=>{const b=intakeFixture();b.fdwPreferences.age.noPreference=true;b.fdwPreferences.nationality.noPreference=true;const f=validateIntake(b).fdwPreferences;assert.equal(f.age.ideal,null);assert.deepEqual(f.nationality.ranking,[]);});
test('contradictory fresher experience choices require correction',()=>{const b=intakeFixture();b.fdwPreferences.experienceType='fresher';assert.throws(()=>validateIntake(b),/prior work location/);b.fdwPreferences.workLocation='any';b.fdwPreferences.experienceYears={noPreference:false,ideal:2,upper:null,lower:1};assert.throws(()=>validateIntake(b),/prior years/);});
test('legacy customer submissions remain supported without structured intake',()=>assert.deepEqual(validateIntake({name:'Legacy'}),{}));
