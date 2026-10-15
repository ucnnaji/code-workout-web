import json,re,shutil,subprocess,os,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
qs=[q for q in json.loads((ROOT/'questions.seed.json').read_text()) if q['id'].startswith('PB-')]
schemas=json.loads((ROOT/'content/input-schemas.json').read_text())['questions']
html=re.sub(r'<script[\s\S]*?</script>','',(ROOT/'public/index.html').read_text());html=re.sub(r'<link[^>]+>','',html)
js=(ROOT/'public/autosave.mjs').read_text().replace('export class','class')+'\n'+(ROOT/'public/app.js').read_text().replace("import { SaveQueue } from './autosave.mjs';",'')+'\nwindow.__testLoad=loadAssignment;window.__testState=state;window.__codingValues=codingValues;'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox']);page=browser.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(html);page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
 page.evaluate('() => {'+js+'\n}')
 page.evaluate('''() => {window.__testState.flow={session:{id:'test'},modalityOrder:['problem-solving','debugging','code-explanation'],modalities:[{id:'problem-solving',label:'Problem Solving',count:2},{id:'debugging',label:'Debugging',count:1},{id:'code-explanation',label:'Code Explanation',count:1}],config:{executionEnabled:true,feedbackTypes:['general'],aiEnabled:false,aiModalities:[]}};}''')
 for q in qs:
  row={'id':q['id'],'status':'PASS','issues':[],'input_fields':len(schemas.get(q['id'],[]))}
  try:
   snapshot={**q,'inputSchema':schemas.get(q['id'],[])}
   data={'assignment':{'id':str(uuid.uuid4()),'modality_id':q['modality_id'],'question_order':1,'question_snapshot':snapshot},'submission':{'revision':0,'draft_code':q['starter_code'],'draft_explanation':'','draft_inputs':{}},'operations':[]}
   page.evaluate('(d)=>window.__testLoad(d)',data)
   page.wait_for_timeout(15)
   got=page.locator('#taskId').inner_text()
   if got!=q['id']:row['issues'].append('Displayed ID mismatch')
   if page.locator('#taskPrompt').inner_text().strip()=='':row['issues'].append('Prompt blank')
   if q['modality_id']=='code-explanation':
    if page.locator('#explanationSection').is_hidden() or not page.locator('#runCode').is_hidden():row['issues'].append('Explanation UI wrong')
    if page.locator('#fallbackEditor').is_editable():row['issues'].append('Explanation editor editable')
   else:
    if page.locator('#runCode').is_hidden():row['issues'].append('Run missing')
    if page.locator('[data-program-input]').count()!=len(schemas.get(q['id'],[])):row['issues'].append('Input field count mismatch')
    for f in schemas.get(q['id'],[]):
     if not f.get('when'):page.locator('[data-program-input="'+f['id']+'"]').fill('10' if 'short' in f['label'].lower() else '20')
    got_inputs=page.evaluate('()=>window.__codingValues().inputs')
    for f in schemas.get(q['id'],[]):
     if not f.get('when') and not got_inputs.get(f['id']):row['issues'].append('Input not collected '+f['id'])
    if any(f.get('when') for f in schemas.get(q['id'],[])):
     page.locator('[data-program-input="input1"]').fill('20');page.locator('[data-program-input="input2"]').fill('10')
     field=page.locator('[data-program-input="input3"]')
     if not field.is_visible():row['issues'].append('Retry not revealed')
     else:
      field.fill('30');v=page.evaluate('()=>window.__codingValues().inputs')
      if v.get('input3')!='30':row['issues'].append('Retry value lost')
     page.locator('[data-program-input="input2"]').fill('25')
     if field.is_visible():row['issues'].append('Retry not hidden')
   if row['issues']:row['status']='FAIL'
  except Exception as e:row['status']='FAIL';row['issues'].append(str(e)[:250])
  results.append(row)
 browser.close()
print('total',len(results),'pass',sum(r['status']=='PASS' for r in results),'fail',sum(r['status']=='FAIL' for r in results),'browser errors',errs[:5])
for r in results:
 print(r['id'],r['status'],r['issues'])
Path('/mnt/data/PracticeBridge_Browser_36_Questions_Report.json').write_text(json.dumps({'method':'Offline headless Chromium DOM using actual question bank and browser code; no live API, no save/run backends','total':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'page_errors':errs,'results':results},indent=2))
