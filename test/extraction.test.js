import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('PDF extraction: labelled forms, date boxes, employment, missing values and scanned OCR',()=>{
 const result=spawnSync(process.env.PYTHON||'python3',['scripts/test_extract.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:90000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 assert.match(result.stderr,/Ran 7 tests/);
});
