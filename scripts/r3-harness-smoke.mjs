import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildR3Harness,readR3HarnessResult} from '../lib/session3-r3-grader.mjs';
let pass=0, failures=[];
const group=['PY','JA'];
for(const name of group){
  const file=JSON.parse(readFileSync(new URL(`../private/session3-r3/Session3_${name}_Instructor_Spec_R3.json`,import.meta.url))).questions;
  const language=name==='PY'?'python':'java';
  for(const q of file.filter(x=>x.modality!=='Code explanation')){
    const h=buildR3Harness(language,q,q.reference_solution);
    const dir=mkdtempSync(path.join(tmpdir(),'r3-check-'));
    try {
      let result;
      if(language==='python'){
        const main=path.join(dir,'main.py');writeFileSync(main,h.source);
        result=spawnSync('python',[main],{cwd:dir,encoding:'utf8',timeout:3000});
      }else{
        const main=path.join(dir,'Main.java');writeFileSync(main,h.source);
        const compile=spawnSync('javac',[main],{cwd:dir,encoding:'utf8',timeout:12000});
        if(compile.status!==0){failures.push({id:q.id,part:'compile',stderr:compile.stderr.slice(0,1400)});continue;}
        result=spawnSync('java',['-cp',dir,'Main'],{cwd:dir,encoding:'utf8',timeout:6000});
      }
      const scored=readR3HarnessResult({stdout:result.stdout},h);
      if(scored.passed!==h.count||!scored.complete||result.status!==0)failures.push({id:q.id,part:'run',scored,stdout:result.stdout.slice(0,1000),stderr:result.stderr.slice(0,1000)});
      else pass++;
    }finally{rmSync(dir,{recursive:true,force:true});console.log("CHECKED",q.id,"pass",pass,"fails",failures.length);}
  }
}
console.log(JSON.stringify({passedReferenceQuestions:pass,failed:failures.length,failures},null,2));
if(failures.length)process.exitCode=1;
