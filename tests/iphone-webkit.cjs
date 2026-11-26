// Run the shipped interface in WebKit with an iPhone viewport and a test double for WKScriptMessageHandler.
const {webkit,devices}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
async function main(){
  const browser=await webkit.launch({headless:true});
  try {
    const ctx=await browser.newContext({...devices['iPhone 13'],locale:'zh-CN',timezoneId:'Asia/Shanghai'});
    const html=fs.readFileSync(path.join(root,'ios/BirthdayPost/post.html'),'utf8');
    const pack=path.join(root,'build/checks/BirthdayPost-flow.json');
    await ctx.route('http://postal.test/**',route=>route.fulfill({body:html,contentType:'text/html; charset=utf-8'}));
    await ctx.addInitScript(()=>{
      const native={permission:'prompt',copied:'',plan:null};
      window.harness=native;
      const postMessage=async({op,payload})=>{
        switch(op){
          case 'load': return localStorage.getItem('test-ios-book');
          case 'save': localStorage.setItem('test-ios-book',JSON.stringify(payload.state));
            if(payload.plan) native.plan=payload.plan; return '';
          case 'status': return native.permission;
          case 'request': native.permission='granted'; return native.permission;
          case 'copy': native.copied=payload; return true;
          case 'sync': native.plan=payload.plan; return '';
        }
      };
      Object.defineProperty(window,'webkit',{configurable:true,value:{messageHandlers:{postal:{postMessage}}}});
    });
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const click=name=>page.getByRole('button',{name,exact:true}).filter({visible:true}).first().click();
    await page.goto('http://postal.test/');
    await click('导入生日资料');
    const file=page.waitForEvent('filechooser'); await click('选择生日资料包'); await (await file).setFiles(pack);
    await click('确认导入'); await click('写生日祝福');
    await page.locator('#greeting').fill('阿禾，愿你一路顺风！'); await click('复制祝福');
    assert.equal(await page.evaluate(()=>window.harness.copied),'阿禾，愿你一路顺风！');
    await click('提醒'); await page.locator('#reminder-time').fill('08:30'); await click('开启生日提醒');
    await page.getByRole('heading',{name:'生日提醒已开启'}).waitFor();
    assert.equal(await page.evaluate(()=>window.harness.plan.annual[0].names[0]),'阿禾');
    const json=JSON.parse(fs.readFileSync(pack));
    json.people[0]={...json.people[0],id:'p-lunar',name:'阿岚',birthday:{calendar:'lunar',month:8,day:15,leap:false}};
    await click('传输'); const f=page.waitForEvent('filechooser'); await click('选择生日资料包');
    await (await f).setFiles({name:'lunar.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
    await click('确认导入'); await page.getByRole('heading',{name:'生日总览'}).waitFor();
    assert.equal(await page.evaluate(()=>window.harness.plan.dates.length),60);
    await page.reload(); await click('写生日祝福');
    assert.equal(await page.locator('#greeting').inputValue(),'阿禾，愿你一路顺风！');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log('WebKit iPhone viewport and native bridge contract passed import, clipboard, persistent drafts, annual and rolling reminders.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
