"""Offline admin-dashboard smoke test. No external services are contacted."""
import copy, json, os, re, shutil, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'config/study.json').read_text())

def run():
    errors=[]; state={'config':copy.deepcopy(config),'revision':1}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000}); page.on('pageerror',lambda e:errors.append(str(e)))
        class Req:
            def __init__(self,url,method,body): self.url=url; self.method=method; self.post_data=body
        class Route:
            def __init__(self,req): self.request=req; self.result=None
            def fulfill(self,status,content_type,body): self.result={'status':status,'body':body}
        def mock(source,url,method,body):
            data=json.loads(body) if body else None
            if url=='/api/admin/config' and method=='GET': out={**state,'contentHash':'abc123','liveCollectionEnabled':False,'releaseBlockers':['Study release status is still draft.','Render LIVE_COLLECTION_ENABLED is not set to true.']}
            elif url=='/api/admin/config' and method=='PUT': state['config']=data['config'];state['revision']+=1;out={'config':state['config'],'revision':state['revision']}
            elif url.startswith('/api/admin/dashboard'): out={'metrics':{'participants':2,'sessions':2},'participants':[],'testPairs':[],'languageUsage':{'python':1,'java':1}}
            elif url=='/api/admin/participants' and method=='POST': out={'code':data.get('participantId') or 'CW-TEST','accessKey':'ABCD-EFGH-JKLM-NPQR','isTest':data.get('isTest',True)}
            else: return {'status':404,'body':json.dumps({'error':'mock missing '+url})}
            return {'status':200,'body':json.dumps(out)}
        page.expose_binding('mockAdminApi',mock)
        html=(ROOT/'public/admin.html').read_text();html=re.sub(r'<script[\s\S]*?</script>','',html);html=re.sub(r'<link[^>]+>','',html)
        page.set_content(html);page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
        page.evaluate("""() => {window.fetch=async(url,o={})=>{const r=await window.mockAdminApi(url,o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}})}}""")
        page.evaluate('() => {'+(ROOT/'public/admin.js').read_text()+'\n}')
        page.locator('#adminToken').fill('synthetic-admin-token');page.locator('#adminLoginForm button').click()
        expect(page.locator('#dashboard')).to_be_visible();expect(page.locator('#releaseReadiness')).to_contain_text('draft');expect(page.locator('#liveSwitchStatus')).to_contain_text('not true')
        expect(page.locator('#exportTable option[value="pre-survey"]')).to_have_count(1);expect(page.locator('#exportTable option[value="pre-post-surveys"]')).to_have_count(1)
        expect(page.locator('#newParticipantLanguage option[value="java"]')).to_have_count(1)
        expect(page.locator('#toggleDuplicateProtection')).to_have_text('Duplicate-entry protection: ON');page.locator('#toggleDuplicateProtection').click();expect(page.locator('#toggleDuplicateProtection')).to_have_text('Duplicate-entry protection: OFF')
        assert not errors,errors
        browser.close()
    print('Modified admin dashboard browser smoke test: PASS')
if __name__=='__main__':run()
