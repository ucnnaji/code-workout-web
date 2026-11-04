import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {defaultConfig, buildSnapshot, assignmentCount} from '../lib/study.mjs';
import {session3QuestionPlan} from '../lib/session3-allocation.mjs';
import {isR3CodeQuestion,buildR3Harness,readR3HarnessResult,r3PrivateSpec} from '../lib/session3-r3-grader.mjs';
import {createProviders} from '../lib/providers.mjs';

const bank=JSON.parse(readFileSync(new URL('../questions.seed.json',import.meta.url)));
const allR3=bank.filter(q=>q.id.startsWith('PB3-'));
const spec = id => r3PrivateSpec(id);
const havePython=spawnSync('python',['--version'],{encoding:'utf8'}).status===0;
const haveJava=spawnSync('javac',['-version'],{encoding:'utf8'}).status===0;

function localExecute(language, source) {
    const dir=mkdtempSync(path.join(tmpdir(),'pb3-validation-'));
    try {
        if (language==='python') {
            const fn=path.join(dir,'check.py');writeFileSync(fn,source);
            const r=spawnSync('python',[fn],{encoding:'utf8',timeout:5000});
            return {status:r.status===0?'Accepted':'Runtime Error',stdout:r.stdout||'',stderr:r.stderr||''};
        }
        const fn=path.join(dir,'Main.java');writeFileSync(fn,source);
        const c=spawnSync('javac',[fn],{encoding:'utf8',timeout:20000});
        if (c.status!==0)return {status:'Compilation Error',stdout:'',stderr:c.stderr};
        const r=spawnSync('java',['-cp',dir,'Main'],{encoding:'utf8',timeout:8000});
        return {status:r.status===0?'Accepted':'Runtime Error',stdout:r.stdout||'',stderr:r.stderr||''};
    }finally{rmSync(dir,{force:true,recursive:true});}
}

test('R3 question release contains exactly 80 new active IDs, is separate from R1/R2, and stays closed',()=>{
    assert.equal(allR3.length,80);
    assert.equal(new Set(bank.map(q=>q.id)).size,bank.length);
    assert.equal(defaultConfig.sessions.find(x=>x.number===3).open,false);
    for(const lang of ['python','java']){
        const q=allR3.filter(x=>x.language===lang);
        assert.equal(q.filter(x=>x.modality_id==='problem-solving').length,20);
        assert.equal(q.filter(x=>x.modality_id==='debugging').length,10);
        assert.equal(q.filter(x=>x.modality_id==='code-explanation').length,10);
        assert.equal(new Set(q.map(x=>x.family)).size,10);
    }
    assert.equal(allR3.some(q=>Object.hasOwn(q,'reference_solution')||Object.hasOwn(q,'hidden_test_cases')),false);
    assert.ok(defaultConfig.questionIdsBySession['1'].python['problem-solving'][0].startsWith('PB-PY-'));
    assert.ok(defaultConfig.questionIdsBySession['2'].java['debugging'][0].startsWith('PB-JA-'));
});

test('100 synthetic participant seeds each receive four different family tasks in both languages',()=>{
    for(const lang of ['python','java'])for(let n=1;n<=100;n++){
        const uuid=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
        const snapshot=buildSnapshot(defaultConfig,3,uuid).snapshot;
        const seed=`test-seed-${n}`;
        const plan=session3QuestionPlan(bank,snapshot,seed,lang,[]);
        assert.deepEqual(plan,session3QuestionPlan(bank,snapshot,seed,lang,[]));
        const ids=Object.values(plan).flat();
        assert.equal(ids.length,4);
        assert.equal(new Set(ids).size,4);
        assert.equal(new Set(ids.map(id=>allR3.find(q=>q.id===id)?.family)).size,4);
        assert.equal(plan[snapshot.modalityOrder[0]].length,2);
        assert.equal(plan[snapshot.modalityOrder[1]].length,1);
        assert.equal(plan[snapshot.modalityOrder[2]].length,1);
        assert.equal(assignmentCount(snapshot,snapshot.modalityOrder[0]),2);
        const idsByModality=defaultConfig.questionIdsBySession['3'][lang];
        for (const [mod, questionIds] of Object.entries(plan))assert.ok(questionIds.every(id=>idsByModality[mod].includes(id)));
    }
});

test('All executable R3 questions have test cases, and rubric items remain server-only',()=>{
    for(const q of allR3){
        const s=spec(q.id);
        assert.equal(s.id,q.id);
        assert.equal(s.student_code,q.starter_code);
        if(isR3CodeQuestion(q)){
            assert.ok(s.hidden_test_cases.length>=2,q.id);
            const h=buildR3Harness(q.language,q,s.reference_solution,'hidden');
            assert.equal(h.count,s.hidden_test_cases.length-1);
        }else{
            assert.equal(s.rubric.length,4);
        }
    }
});

test('R3 Python reference solution passes and starter fails deterministic grading', {skip: !havePython},async()=>{
    const q=allR3.find(x=>x.id==='PB3-PY-05-WA-R3');
    const providers=createProviders({});
    providers.execute=async(lang,source)=>localExecute(lang,source);
    const ref=await providers.grade({language:'python',modality:'problem-solving',question:q,code:spec(q.id).reference_solution});
    assert.equal(ref.score,100);
    const bad=await providers.grade({language:'python',modality:'problem-solving',question:q,code:q.starter_code});
    assert.ok(bad.score<100);
    assert.equal(bad.method,'deterministic-r3-sandbox-hidden-tests');
});

test('R3 Java reference solution passes in the same sandbox harness and starter fails', {skip:!haveJava},async()=>{
    const q=allR3.find(x=>x.id==='PB3-JA-09-WA-R3');
    const providers=createProviders({});
    providers.execute=async(lang,source)=>localExecute(lang,source);
    const ref=await providers.grade({language:'java',modality:'problem-solving',question:q,code:spec(q.id).reference_solution});
    assert.equal(ref.score,100);
    const bad=await providers.grade({language:'java',modality:'problem-solving',question:q,code:q.starter_code});
    assert.ok(bad.score<100);
});

test('R3 technical sandbox timeout is not mistaken for a score of zero',async()=>{
    const q=allR3.find(x=>x.id==='PB3-PY-05-WA-R3');
    const providers=createProviders({});
    providers.execute=async()=>({status:'Time Limit Exceeded',stdout:'',stderr:''});
    await assert.rejects(()=>providers.grade({language:'python',modality:'problem-solving',question:q,code:q.starter_code}),/No grade was assigned/);
});

test('R3 explanation scores each of four rubric criteria separately', async()=>{
    const q=allR3.find(x=>x.id==='PB3-PY-05-EXP-R3');
    const providers=createProviders({OPENAI_MODEL:'test-model',OPENAI_API_KEY:'fake-test-token'});
    const original=globalThis.fetch;
    globalThis.fetch=async(_url, options)=>{
        const input=JSON.parse(options.body);
        assert.match(input.instructions,/four independent criteria/);
        const task=JSON.parse(input.input);
        assert.equal(task.criteria.length,4);
        return {ok:true,json:async()=>({model:'test-model',output:[{content:[{type:'output_text',text:JSON.stringify({criterion1:25,criterion2:18,criterion3:10,criterion4:0,summary:'One correct part, two partially correct, one incorrect.'})}]}]})};
    };
    try {
        const out=await providers.grade({language:'python',modality:'code-explanation',question:q,code:q.starter_code,explanation:'Part 1 ...'});
        assert.equal(out.score,53);
        assert.deepEqual(out.criterionScores.map(x=>x.points),[25,18,10,0]);
        assert.equal(out.method,'ai-r3-four-part-rubric');
    }finally{globalThis.fetch=original;}
});
