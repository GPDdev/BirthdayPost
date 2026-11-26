// Set PLAYWRIGHT_MODULE for a bundled Playwright installation on a build machine.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const output=path.join(root,'build','checks');
const button=(page,name)=>page.getByRole('button',{name,exact:true}).filter({visible:true}).first();

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write'],timezoneId:'Asia/Shanghai',viewport:{width:1440,height:960}});
    const p=await ctx.newPage(), errors=[], network=[];
    p.on('pageerror',e=>errors.push(e.message));
    p.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    p.on('request',r=>{if(/^https?:/.test(r.url())) network.push(r.url());});
    const entry=pathToFileURL(path.join(root,'build/assets/post.html')).href;
    await p.goto(entry); await p.getByRole('heading',{name:'记下第一个生日'}).waitFor();
    await p.screenshot({path:path.join(output,'windows-home.png')});
    for(const width of [320,390,768,1024,1440]){
      await p.setViewportSize({width,height:900});
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Layout overflows at '+width);
    }
    await button(p,'导入聊天记录').click();
    await p.getByLabel('我在聊天中的名字',{exact:false}).fill('我的昵称');
    const date=await p.evaluate(()=>{const d=new Date();return [d.getMonth()+1,d.getDate()];});
    const chat='我的昵称：我的生日是4月5日。\n阿禾：我的生日是'+date[0]+'月'+date[1]+'日。\n阿禾：我喜欢骑行。\n阿禾：我今年想骑完环湖线。\n阿禾：秘密原文仅限电脑。\n南南：我妈生日是7月20号。';
    const chooser=p.waitForEvent('filechooser'); await button(p,'选择文件').click();
    await (await chooser).setFiles([{name:'好友.txt',mimeType:'text/plain',buffer:Buffer.from(chat)}]);
    await p.getByRole('button',{name:/阿禾.*核对/}).click();
    assert.equal(await p.locator('#p-interests').inputValue(),'骑行');
    assert.equal(await p.locator('#p-wish').inputValue(),'骑完环湖线');
    await button(p,'确认并收录').click();
    await p.getByRole('button',{name:/南南.*核对/}).click();
    assert.equal(await p.locator('#p-month').inputValue(),'');
    await button(p,'跳过这位').click();
    await button(p,'设备传输').click();
    const downloaded=p.waitForEvent('download'); await button(p,'导出生日资料包').click();
    const packfile=path.join(output,'BirthdayPost-flow.json'); await (await downloaded).saveAs(packfile);
    const data=JSON.parse(fs.readFileSync(packfile,'utf8'));
    assert.equal(data.people.length,1); assert.equal(data.people[0].name,'阿禾');
    const fields=Object.keys(data.people[0]).sort();
    assert.deepEqual(fields,['alias','birthday','id','interests','name','relation','wish'].sort());
    assert.ok(!JSON.stringify(data).includes('秘密原文'));
    await button(p,'生日总览').click(); await button(p,'写生日祝福').click();
    assert.ok((await p.locator('#greeting').inputValue()).includes('骑行'));
    const custom='阿禾，生日快乐！等你的环湖照片。';
    await p.locator('#greeting').fill(custom); await button(p,'复制祝福').click();
    assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),custom);
    await p.reload(); await button(p,'写生日祝福').click();
    assert.equal(await p.locator('#greeting').inputValue(),custom);
    await button(p,'关闭').click(); await button(p,'设备传输').click();
    const restore=p.waitForEvent('filechooser'); await button(p,'从资料包恢复到电脑').click(); await (await restore).setFiles(packfile);
    await p.getByRole('heading',{name:'导入生日资料',exact:true}).waitFor();
    assert.match(await p.locator('#modal').innerText(),/新增 0 张好友卡，更新 1 张/);
    await button(p,'确认导入').click(); await button(p,'写生日祝福').click();
    assert.equal(await p.locator('#greeting').inputValue(),custom);
    await button(p,'关闭').click(); await button(p,'好友名册').click();
    await p.getByLabel('搜索好友').fill('不存在'); assert.ok(await p.getByText('没有匹配的好友').isVisible());
    await p.getByLabel('搜索好友').fill('骑行'); await p.getByRole('button',{name:/阿禾.*今天/}).click();
    await button(p,'编辑资料').click(); await p.locator('#p-calendar').selectOption('lunar');
    assert.ok(await p.locator('#p-leap').isVisible());
    await p.keyboard.press('Escape'); assert.ok(!(await p.locator('#modal').isVisible()));
    assert.deepEqual(errors,[]); assert.deepEqual(network,[]);
    console.log('Windows file selection, review, export, clipboard, draft, restore, search and five viewport widths passed.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
