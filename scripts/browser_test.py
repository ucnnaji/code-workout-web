"""Offline participant-flow smoke test using Playwright and an in-memory API.
No Supabase, OpenAI, Judge0, real participant data, or network calls are used.
"""
import copy, json, os, re, shutil, subprocess, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
fixture = json.loads(subprocess.check_output([
    'node','--input-type=module','-e',
    "import {defaultConfig,buildSnapshot,consentDocument} from './lib/study.mjs';import fs from 'node:fs';const pid='00000000-0000-4000-8000-000000000001';console.log(JSON.stringify({config:defaultConfig,built:buildSnapshot(defaultConfig,1,pid),consent:consentDocument,bank:JSON.parse(fs.readFileSync('questions.seed.json'))}));"
], cwd=ROOT, text=True))

LABELS = {'problem-solving':'Problem Solving','debugging':'Debugging','code-explanation':'Code Explanation'}

class Mock:
    def __init__(self, language='java'):
        self.language=language; self.logged=False; self.started=False; self.claim=None; self.done=set(); self.assignments={}; self.ops=[]
        self.sid=str(uuid.uuid4()); self.code='JAVA42'; self.cfg=copy.deepcopy(fixture['config']); self.definitions={s['key']:copy.deepcopy(s) for s in fixture['built']['stages']}
        self.order=list(fixture['built']['snapshot']['modalityOrder'])
        self.stages=[dict(key=s['key'],ordinal=s['ordinal'],status='pending' if s['enabled'] else 'disabled',revision=0) for s in fixture['built']['stages']]
        self.responses={}; self.selected=None; self.entry_locked=False
    def current(self):
        return next((s['key'] for s in self.stages if s['status'] in ('pending','in_progress')), 'completion')
    def modality_rows(self):
        rows=[]
        for i,m in enumerate(self.order):
            rows.append(dict(id=m,label=LABELS[m],completed=m in self.done,count=2 if i==0 else 1,locked=any(x not in self.done for x in self.order[:i])))
        return rows
    def flow(self):
        current=self.current(); completed=current=='completion'
        consent_done=next(s for s in self.stages if s['key']=='consent')['status']=='completed'
        return dict(
            session=dict(id=self.sid,participantId='00000000-0000-4000-8000-000000000001',number=1,label='Session 1',language=self.selected,status='completed' if completed else 'active',isTest=True,consentedAt='2026-01-01T00:00:00Z' if consent_done else None,entryLockedAt='2026-01-01T00:05:00Z' if self.entry_locked else None),
            currentStage=current, stages=self.stages, modalityOrder=self.order, modalities=self.modality_rows(),
            config={k:self.cfg[k] for k in ['title','contact','durationText','languages','deliveryMode','activityDesign','aiEnabled','aiModalities','feedbackTypes','executionEnabled','preventDuplicateEntries','compensation']}, contentHash='mock-hash')
    def _stage_definition(self,key):
        d=copy.deepcopy(self.definitions[key]); variants=d.pop('variants',{})
        if variants: d.update(variants.get(self.selected or self.language,{}))
        for i in d.get('items',[]): i.pop('answer',None)
        return d
    def handle(self, route):
        req=route.request; url=req.url.split('/api',1)[-1]; body=req.post_data_json if req.post_data else {}; status=200; value={}
        if url=='/public':
            value=dict(title='Test',contact=self.cfg['contact'],notice='Welcome! Click Continue to continue with the study.',consent=fixture['consent'],languages=['python','java'],liveEnrollmentOpen=True,preventDuplicateEntries=True)
        elif url=='/participants/self-enroll':
            self.logged=True; self.selected=None; self.code=body['participantId'].strip().upper(); value=dict(code=self.code,accessKey='ABCD-EFGH-JKLM-NPQR',language=None,csrf='mock')
        elif url=='/auth/login':
            self.logged=True; value=dict(code=self.code,csrf='mock',isTest=True)
        elif url=='/account':
            if not self.logged: status=401; value={'error':'Sign in'}
            else: value=dict(code=self.code,csrf='mock',isTest=True,config={'sessions':self.cfg['sessions'],'contact':self.cfg['contact']},sessions=[dict(id=self.sid,number=1,label='Session 1',status=self.flow()['session']['status'],entryLockedAt=self.flow()['session']['entryLockedAt'])] if self.started else [])
        elif url=='/sessions':
            self.started=True; value=self.flow()
        elif url==f'/sessions/{self.sid}': value=self.flow()
        elif url.endswith('/heartbeat') or url.endswith('/displayed'): value={'ok':True}
        elif '/stages/' in url:
            key=url.split('/stages/')[1].split('/')[0]; st=next(s for s in self.stages if s['key']==key)
            if url.endswith('/open'):
                st['status']='in_progress'; value=dict(stage=self._stage_definition(key),responses=self.responses.get(key,{}),revision=st['revision'])
            else:
                st['revision']+=1; self.responses[key]=body.get('responses',{}); value={'revision':st['revision'],'saved':True,'savedAt':'2026-01-01T00:00:00Z'}
                if body.get('final'):
                    st['status']='skipped' if body.get('skipped') else 'completed'
                    if key=='language': self.selected=body['responses']['language']
                    if key=='incentive':
                        self.claim=dict(id=str(uuid.uuid4()),status='contact_pending',amount=20,currency='USD',contactProvided=False)
                        next(s for s in self.stages if s['key']=='completion')['status']='completed'
                    value['state']=self.flow()
        elif url=='/modality/start':
            m=body['modalityId']; count=2 if self.order.index(m)==0 else 1
            if m not in self.assignments:
                qs=[copy.deepcopy(q) for q in fixture['bank'] if q['language']==self.selected and q['modality_id']==m][:count]
                self.assignments[m]=[dict(assignment=dict(id=str(uuid.uuid4()),modality_id=m,question_id=q['id'],question_order=i+1,question_snapshot={**q,'inputSchema':[],'bankVersion':'mock'}),submission=dict(revision=0,draft_code=q['starter_code'],draft_explanation='',draft_inputs={},final_score=None,score_details=None),operations=[],done=False) for i,q in enumerate(qs)]
            active=next((a for a in self.assignments[m] if not a['done']),None)
            if active:
                value={k:v for k,v in active.items() if k!='done'}; value['total']=count
            else:
                value=dict(review=[{'assignment':a['assignment'],'submission':a['submission']} for a in self.assignments[m]])
        elif url=='/draft':
            item=next(a for group in self.assignments.values() for a in group if a['assignment']['id']==body['assignmentId']); sub=item['submission']; sub['revision']+=1
            sub.update(draft_code=body.get('code',''),draft_explanation=body.get('explanation',''),draft_inputs=body.get('inputs',{})); value=dict(saved=True,revision=sub['revision'],savedAt='2026-01-01T00:00:00Z')
            if body.get('final'):
                item['done']=True; self.entry_locked=True; sub.update(final_code=body.get('code',''),final_explanation=body.get('explanation',''),skipped=body.get('skipped',False),final_score=100,score_details={'score':100,'summary':'Correct.','checks':[{'label':'Meets the task','passed':True}]})
        elif url=='/modality/complete':
            self.done.add(body['modalityId']); value=self.flow()
        elif url in ('/execute','/score','/feedback'):
            kind=url[1:]; self.ops.append((kind,body)); result={'feedback':'Try the next small step.'} if kind=='feedback' else {'score':100,'summary':'Correct.','checks':[{'label':'Meets the task','passed':True}]}
            if kind=='execute': result={'stdout':'11\n','stderr':'','compileOutput':'','status':'Accepted','runtimeMs':10,'score':result}
            value=dict(id=str(uuid.uuid4()),kind=kind,requestNumber=1,status='succeeded',result=result)
        elif url.endswith('/claim'): value=self.claim
        else: status=404; value={'error':'Mock endpoint missing: '+url}
        route.fulfill(status=status,content_type='application/json',body=json.dumps(value))

def make_page(browser,mock,errors):
    page=browser.new_page(viewport={'width':1440,'height':900}); page.set_default_timeout(8000); page.on('pageerror',lambda e:errors.append(str(e)))
    class Req:
        def __init__(self,url,method,body): self.url='https://offline.invalid'+url; self.method=method; self.post_data=body; self.post_data_json=json.loads(body) if body else {}
    class Route:
        def __init__(self,req): self.request=req; self.result=None
        def fulfill(self,status,content_type,body): self.result={'status':status,'body':body}
    def respond(source,url,method,body):
        route=Route(Req(url,method,body)); mock.handle(route); return route.result
    page.expose_binding('mockApi',respond)
    html=(ROOT/'public/index.html').read_text(); html=re.sub(r'<script[\s\S]*?</script>','',html); html=re.sub(r'<link[^>]+>','',html)
    page.set_content(html); page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
    page.evaluate("""() => { window.fetch=async(url,o={})=>{const r=await window.mockApi(url,o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});}; const mk=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>[...m.keys()][i]||null,get length(){return m.size}}}; Object.defineProperty(window,'sessionStorage',{value:mk()});Object.defineProperty(window,'localStorage',{value:mk()});if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); }""")
    js=(ROOT/'public/autosave.mjs').read_text().replace('export class','class')+'\n'+(ROOT/'public/app.js').read_text().replace("import { SaveQueue } from './autosave.mjs';",'')
    page.evaluate('() => {'+js+'\n}')
    return page

def confirm(page): page.locator('#confirmDialog button[value="confirm"]').click()

def run():
    output=ROOT/'test-results'; output.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        mock=Mock('java'); errors=[]; page=make_page(browser,mock,errors)
        expect(page.locator('#consentScreen')).to_be_visible(); expect(page.locator('#participantScreen')).to_be_hidden()
        expect(page.locator('#preflightConsentCopy')).not_to_contain_text('supplied-main-consent'); expect(page.locator('#preflightConsentCopy')).to_have_class(re.compile(r'consent-scroll'))
        page.locator('#preflightAgree').check(); page.locator('#preflightSignature').fill('Synthetic Test Participant'); page.locator('#consentYes').click()
        expect(page.locator('#accessSetupScreen')).to_be_visible(); expect(page.locator('input[name="accessLanguage"]')).to_have_count(0); page.locator('#newStudyParticipantId').fill('java42'); page.locator('#generateStudyAccess').click()
        expect(page.locator('#generatedAccessKey')).to_have_text('ABCD-EFGH-JKLM-NPQR'); page.locator('#savedStudyAccess').check(); page.locator('#continueWithStudyAccess').click()
        expect(page.locator('#stageTitle')).to_have_text('Language'); expect(page.locator('[data-language="python"]')).to_be_enabled(); expect(page.locator('[data-language="java"]')).to_be_enabled(); page.locator('[data-language="java"]').click()
        expect(page.locator('#stageTitle')).to_have_text('Pre-survey'); expect(page.locator('#stageContent')).to_contain_text('Java'); expect(page.locator('#stageContent')).not_to_contain_text('Python')
        page.locator('#skipStage').click(); confirm(page)
        expect(page.locator('#stageTitle')).to_have_text('Practice environment demo'); expect(page.locator('#stageContinue')).to_have_text('Continue to practice activities'); page.locator('#stageContinue').click()
        expect(page.locator('#modalityScreen')).to_be_visible(); expect(page.locator('#progressText')).to_have_text('0 of 4 questions completed')
        total_saved=0
        for mi,m in enumerate(mock.order):
            card=page.locator('#modalityGrid button').filter(has_text=LABELS[m]); expect(card).to_be_enabled(); card.click(); count=2 if mi==0 else 1
            for _ in range(count):
                expect(page.locator('#workspaceScreen')).to_be_visible()
                if m=='code-explanation':
                    expect(page.locator('#runCode')).to_be_hidden(); expect(page.locator('#outputPanel')).to_be_hidden(); expect(page.locator('#explanationSection')).to_be_visible(); expect(page.locator('#formatCode')).to_be_hidden()
                    page.locator('#explanationInput').fill('The code produces the required result in sequence.'); page.locator('#checkExplanation').click(); expect(page.locator('#scoreValue')).to_contain_text('100')
                else:
                    expect(page.locator('#runCode')).to_be_visible(); expect(page.locator('#explanationSection')).to_be_hidden(); expect(page.locator('#formatCode')).to_be_visible()
                    page.locator('#fallbackEditor').fill('public class Main { public static void main(String[] args) { System.out.println(11); } }'); page.locator('#runCode').click(); expect(page.locator('#programOutput')).to_have_text('11\n'); expect(page.locator('#scoreValue')).to_contain_text('100')
                page.locator('#saveFinal').click(); confirm(page); total_saved+=1
            expect(page.locator('#reviewScreen')).to_be_visible(); page.locator('#completeModality').click(); confirm(page); expect(page.locator('#modalityScreen')).to_be_visible()
        assert total_saved==4
        expect(page.locator('#progressText')).to_have_text('4 of 4 questions completed'); page.locator('#codingContinue').click()
        expect(page.locator('#stageTitle')).to_have_text('Post-survey'); expect(page.locator('#stageContent')).to_contain_text('Java'); expect(page.locator('#stageContent')).not_to_contain_text('Python'); page.locator('#skipStage').click(); confirm(page)
        page.locator('[name="compensationChoice"][value="later"]').check(); page.locator('#stageContinue').click(); expect(page.locator('#completionTitle')).to_have_text('Session 1 complete')
        assert not errors, errors
        page.screenshot(path=str(output/'modified-flow-smoke.png'),full_page=True)
        browser.close()
    (output/'browser-report.json').write_text(json.dumps({'mode':'offline DOM + in-memory API','language':'java','questions':4,'passed':True,'checks':['no startup login flicker','compact consent reader','student-generated access flow','single language selection before pre-survey','Java survey wording','2/1/1 locked modality order','Run Code absent for code explanation','explanation absent for problem-solving/debugging','visible scoring','completion']},indent=2))
    print('Modified participant workflow browser smoke test: PASS')

if __name__=='__main__': run()
