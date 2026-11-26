const Postal = (() => {
  const C = PostalCore, { esc,icon,btn,ib } = U;
  const get = id => document.getElementById(id);
  let db = C.fresh(), loaded = false, busy = false, dialogState = null, toastTimer;
  const s = { tab:'home', query:'', selected:C.today(), month:C.today(), pending:[], self:'', importInfo:'', permission:'', coverage:'' };
  let fileMode = '', lastDay = C.today();
  function render(focus = false) {
    Views.shell(s.tab);
    const screens = { home:Views.home, friends:Views.friendsPage, import:(_,v)=>Views.imports(v), transfer:Views.transfer, reminders:Views.reminders };
    get('main').innerHTML = screens[s.tab](db,s);
    if (focus) { get('main').focus({preventScroll:true}); window.scrollTo(0,0); }
  }
  function toast(message) {
    const el = get('toast');
    clearTimeout(toastTimer); el.textContent = message; el.className = 'show';
    toastTimer = setTimeout(() => { el.className = ''; }, 4200);
  }
  function error(message) {
    const el = get('modal').open && get('dialog-error');
    if (el) el.textContent = message; else toast(message);
  }
  function modal(title,body,context) {
    const el = get('modal');
    dialogState = context;
    el.innerHTML = '<div class="dhead"><h2 id="dialog-title">' + esc(title) + '</h2>' + ib('close','关闭','close') +
      '</div><div class="dcontent">' + body + '<p class="err" id="dialog-error" role="alert"></p></div>';
    if (!el.open) el.showModal();
  }
  function close() { get('modal').close(); dialogState = null; }
  function field(title,id,value,limit,placeholder='') {
    return '<label class="field">' + title + '<input id="' + id + '" maxlength="' + limit + '" value="' +
      esc(value) + '" placeholder="' + esc(placeholder) + '"></label>';
  }
  const options = (count,value,suffix) => '<option value="">请选择</option>' + Array.from({ length:count }, (_,i) =>
    '<option value="' + (i+1) + '"' + (i+1 === value ? ' selected' : '') + '>' + (i+1) + suffix + '</option>').join('');
  function editor(raw, candidate = null) {
    const old = db.people.find(p => p.id === raw.id);
    const p = Object.assign({}, raw);
    if (candidate && old) {
      for (const k of ['alias','relation','interests','wish']) p[k] = raw[k] || old[k];
    }
    const choices = candidate ? candidate.choices : [];
    if (candidate && old && !choices.some(b => C.birthdayLabel(b) === C.birthdayLabel(old.birthday))) {
      if (choices.length) choices.push(old.birthday);
    }
    const b = candidate ? (choices.length === 1 ? choices[0] : choices.length ? {} : old?.birthday || {}) : (p.birthday || {});
    const evidence = candidate ? '<div class="note">' + (choices.length > 1 ? '日期有冲突，请对照原句选择或填写。' :
      choices.length ? '请对照原句核对日期和提取的资料。' : '没有识别到明确的生日，请补充日期，或跳过这位好友。') + '</div>' +
      (candidate.evidence.length ? '<details class="examples" open><summary>查看原句</summary><div class="evidence">' +
        candidate.evidence.map(t => '<p>' + esc(t) + '</p>').join('') + '</div></details>' : '') +
      (choices.length > 1 ? '<div class="actions spaced">' + choices.map((v,i)=>btn('choose-date',C.birthdayLabel(v),'','chip',i)).join('') + '</div>' : '') : '';
    modal(candidate ? '核对好友资料' : old ? '编辑好友' : '添加好友',evidence + '<div class="formgrid spaced">' +
      '<div class="pair">' + field('好友姓名','p-name',p.name,80) + field('祝福里的称呼','p-alias',p.alias,80,'阿禾') +
      '</div><div class="datefields"><label class="field">历法<select id="p-calendar"><option value="solar">公历</option><option value="lunar"' +
      (b.calendar === 'lunar' ? ' selected' : '') + '>农历</option></select></label><label class="field">月份<select id="p-month">' + options(12,b.month,'月') +
      '</select></label><label class="field">日期<select id="p-day">' + options(31,b.day,'日') + '</select></label></div>' +
      '<label class="check" id="leap-label"' + (b.calendar === 'lunar' ? '' : ' hidden') + '><input id="p-leap" type="checkbox"' +
      (b.leap ? ' checked' : '') + '>闰月生日（仅在对应闰月提醒）</label>' +
      field('你们的关系','p-relation',p.relation,60,'大学同学') + field('兴趣爱好','p-interests',p.interests,160,'骑行、手冲咖啡') +
      field('最近的心愿或目标','p-wish',p.wish,200,'骑完环湖线') + '</div><div class="actions">' +
      btn('save-person',candidate ? '确认并收录' : '保存好友','check','primary') + (candidate ? btn('skip','跳过这位') : '') +
      (old && !candidate ? btn('delete-ask','移除好友','','linkbtn') : '') + '</div>',{ kind:'editor',id:p.id,candidate });
  }
  function compose(p,tone,version,text) {
    const old = db.drafts[p.id];
    tone = tone || old?.tone || '自然';
    version = version ?? old?.version ?? 0;
    const value = text ?? old?.text ?? C.greeting(p,tone,version);
    const hints = [p.relation,p.interests,p.wish].filter(Boolean).join(' / ');
    modal('写给' + (p.alias || p.name) + '的祝福','<p class="sub">' + esc(C.birthdayLabel(p.birthday)) +
      (hints ? '　' + esc(hints) : '') + '</p><div class="tonebar">' +
      ['自然','俏皮','郑重'].map(t=>btn('tone',t,'','chip' + (tone === t ? ' active' : ''),t)).join('') +
      btn('variant','换一版','refresh','linkbtn') + '</div><label class="field">祝福正文<textarea id="greeting" rows="6" maxlength="4000">' +
      esc(value) + '</textarea></label><div class="actions">' + btn('copy','复制祝福','copy','primary') + btn('save-draft','保存草稿','edit') +
      '</div>',{ kind:'compose',id:p.id,tone,version,initial:value });
  }
  function person(p) {
    const arr = [['称呼',p.alias],['关系',p.relation],['兴趣',p.interests],['心愿',p.wish]].filter(a=>a[1]);
    modal(p.name,'<p>' + esc(C.birthdayLabel(p.birthday)) + '</p>' + arr.map(a=>'<p class="sub spaced">' + a[0] + '　' + esc(a[1]) + '</p>').join('') +
      '<div class="actions">' + btn('compose','写生日祝福','edit','primary',p.id) + btn('edit','编辑资料','friends','secondary',p.id) + '</div>',{kind:'person'});
  }
  async function commit(next, schedule = false) {
    if (!loaded) throw new Error('当前资料未成功读取，无法保存。请重新打开应用。');
    const payload = { state:next };
    if (schedule && U.phone) payload.plan = U.plan(next);
    const result = await U.call('save',payload);
    db = next;
    if (typeof result === 'string') s.coverage = result;
  }
  function chooseFiles(mode) {
    fileMode = mode;
    const f = get('files');
    f.multiple = mode === 'chat';
    f.accept = U.phone ? '' : mode === 'chat' ? '.txt,.csv,.tsv,.json' : '.json,application/json';
    f.value=''; f.click();
  }
  function addCandidates(rows) {
    if (!rows.length) throw new Error('没有读到发言人和消息内容，请查看支持的记录格式。');
    const added = ChatImport.candidates(rows,s.self);
    if (!added.length) throw new Error('没有找到好友发言，请检查自己的昵称和记录格式。');
    const byId = new Map(s.pending.map(p=>[p.id,p]));
    for (const p of added) {
      const old = byId.get(p.id);
      if (old) {
        for (const b of p.choices) if (!old.choices.some(d => C.birthdayLabel(b) === C.birthdayLabel(d))) old.choices.push(b);
        old.evidence = [...new Set([...old.evidence,...p.evidence])].slice(-10);
        for (const k of ['alias','relation','interests','wish']) if (!old[k]) old[k]=p[k];
      } else byId.set(p.id,p);
    }
    s.pending = [...byId.values()]; s.importInfo = '本次读取 ' + rows.length + ' 条发言，识别到 ' + added.length + ' 位好友。';
    render(); get('review-list')?.scrollIntoView({block:'start'});
  }
  async function files(list,mode) {
    if (!list.length) return;
    if (mode === 'chat') {
      const rows = [];
      for (const [fileIndex,file] of list.entries()) {
        try { for (const row of ChatImport.read(await U.decode(file),file.name)) rows.push({...row,fileIndex}); }
        catch (e) { throw new Error(file.name + '：' + e.message); }
      }
      addCandidates(rows); return;
    }
    const incoming = C.readPack(await U.decode(list[0]));
    const ids = new Set(db.people.map(p=>p.id)), updates = incoming.filter(p=>ids.has(p.id)).length;
    modal('导入生日资料','<p>将新增 ' + (incoming.length-updates) + ' 张好友卡，更新 ' + updates + ' 张已有好友卡。</p>' +
      '<div class="evidence">' + incoming.slice(0,8).map(p=>'<p>' + esc(p.name) + '　' + esc(C.birthdayLabel(p.birthday)) + '</p>').join('') +
      (incoming.length > 8 ? '<p>另有 ' + (incoming.length-8) + ' 位好友</p>' : '') + '</div><div class="actions">' +
      btn('confirm-pack','确认导入','check','primary') + btn('close','取消') + '</div>', {kind:'pack',incoming});
  }
  async function savePerson() {
    const v = id => get(id).value.trim(), d = dialogState;
    const lunar = v('p-calendar') === 'lunar';
    const b = {calendar:lunar ? 'lunar' : 'solar', month:+v('p-month'),day:+v('p-day'),leap:lunar && get('p-leap').checked};
    if (!v('p-name')) throw new Error('请填写好友姓名。');
    if (!C.validBirthday(b)) throw new Error('请选择一个有效的生日月份和日期。');
    const id = d.id || 'm-' + Array.from(crypto.getRandomValues(new Uint32Array(3)), n=>n.toString(36)).join('-');
    const p = C.profile({id,name:v('p-name'),birthday:b,alias:v('p-alias'),relation:v('p-relation'),interests:v('p-interests'),wish:v('p-wish')});
    await commit({...db, people:C.merge(db.people,[p])},true);
    if (d.candidate) s.pending = s.pending.filter(item=>item.id !== d.id);
    close(); render(); toast('已保存' + p.name + '的生日资料');
  }
  async function saveDraft(copy) {
    const d = dialogState, text = get('greeting').value.trim();
    if (!text) throw new Error('请先写下生日祝福。');
    if (copy) await U.clipboard(text);
    await commit({...db,drafts:{...db.drafts,[d.id]:{text,tone:d.tone,version:d.version}}});
    d.initial = text; close(); toast(copy ? '祝福已复制，可以去聊天中粘贴发送' : '祝福草稿已保存');
  }
  function monthBy(delta) {
    const p = C.parts(s.month);
    s.month = C.days(p.year,p.month+delta,1); s.selected = s.month; render();
  }
  const lookup = id => db.people.find(p => p.id === id);
  async function action(k,v) {
    switch (k) {
      case 'nav': s.tab=v; render(true); break;
      case 'close': close(); break;
      case 'manual': editor({}); break;
      case 'edit': editor(lookup(v)); break;
      case 'person': person(lookup(v)); break;
      case 'review': {const p=s.pending.find(p=>p.id===v); editor(p,p); break;}
      case 'save-person': await savePerson(); break;
      case 'skip': s.pending=s.pending.filter(p=>p.id!==dialogState.id); close(); render(); break;
      case 'choose-date': {const b=dialogState.candidate.choices[+v];
        get('p-calendar').value=b.calendar; get('p-month').value=b.month; get('p-day').value=b.day;
        get('p-leap').checked=!!b.leap; get('leap-label').hidden=b.calendar!=='lunar'; break;}
      case 'delete-ask': {const id=dialogState.id; modal('移除好友','<p>从本机移除' + esc(lookup(id).name) +
        '的生日、祝福草稿和提醒？</p><div class="actions">' + btn('delete','移除好友','','primary',id) + btn('close','取消') + '</div>',{kind:'delete'}); break;}
      case 'delete': {const drafts={...db.drafts}; delete drafts[v];
        await commit({...db,people:db.people.filter(p=>p.id!==v),drafts},true); close(); render(); toast('好友已移除'); break;}
      case 'compose': compose(lookup(v)); break;
      case 'tone': case 'variant': {const d=dialogState,p=lookup(d.id);
        const tone=k==='tone'?v:d.tone, version=k==='tone'?0:d.version+1;
        const regenerate=()=>compose(p,tone,version,C.greeting(p,tone,version));
        if(get('greeting').value!==d.initial) {
          const prior=get('greeting').value;
          modal('替换当前正文？','<p>刚才编辑的内容尚未保存。</p><div class="actions">'+btn('regenerate','使用新版本','','primary')+btn('keep-text','继续编辑')+'</div>',{regenerate,restore:()=>compose(p,d.tone,d.version,prior)});
        } else regenerate(); break;}
      case 'regenerate': dialogState.regenerate(); break;
      case 'keep-text': dialogState.restore(); break;
      case 'save-draft': await saveDraft(false); break;
      case 'copy': await saveDraft(true); break;
      case 'cal-prev': monthBy(-1); break;
      case 'cal-next': monthBy(1); break;
      case 'cal-day': s.selected=+v; render(); break;
      case 'pick-chats': chooseFiles('chat'); break;
      case 'pick-pack': chooseFiles('pack'); break;
      case 'paste-chat': modal('粘贴聊天文本','<label class="field">聊天记录<textarea id="paste" rows="8" placeholder="小禾：我生日是5月18日。"></textarea></label><div class="actions">'+btn('parse-paste','提取好友资料','import','primary')+'</div>',{kind:'paste'}); break;
      case 'parse-paste': {const rows=ChatImport.read(get('paste').value); addCandidates(rows); close(); break;}
      case 'confirm-pack': await commit({...db,people:C.merge(db.people,dialogState.incoming)},true); close(); s.tab='home'; render(true); toast('生日资料已导入'); break;
      case 'export': U.download('生辰邮局-'+C.iso(C.today())+'.json',JSON.stringify(C.makePack(db.people),null,2)); toast('已生成生日资料包'); break;
      case 'enable': {const time=get('reminder-time').value;
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('请选择提醒时间。');
        if (s.permission!=='granted') s.permission=await U.call('request');
        if (s.permission==='pending') { toast('请在系统弹窗中选择通知权限，再保存提醒'); break; }
        if (s.permission!=='granted') {render(); toast('请允许系统通知后再开启提醒'); break;}
        await commit({...db,enabled:true,time},true); render(); toast('生日提醒已保存'); break;}
      case 'disable': await commit({...db,enabled:false},true); render(); toast('生日提醒已关闭'); break;
      case 'settings': await U.call('settings'); break;
    }
  }
  async function run(fn) {
    if (busy) return;
    busy=true;
    try { await fn(); } catch(e) {error(e.message || String(e));} finally {busy=false;}
  }
  document.addEventListener('click',e=>{ const b=e.target.closest('[data-act]'); if(b) run(()=>action(b.dataset.act,b.dataset.value)); });
  document.addEventListener('input',e=>{
    if(e.target.id==='search') {s.query=e.target.value; get('friendrows').innerHTML=Views.friends(db,s.query);}
    if(e.target.id==='self') s.self=e.target.value;
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='files') {const list=[...e.target.files]; run(()=>files(list,fileMode));}
    if(e.target.id==='p-calendar') get('leap-label').hidden=e.target.value!=='lunar';
  });
  for(const type of ['dragover','dragleave','drop']) document.addEventListener(type,e=>{
    const target=e.target.closest('#drop');
    if (!target) return;
    e.preventDefault(); target.classList.toggle('active',type==='dragover');
    if(type==='drop') run(()=>files([...e.dataTransfer.files],'chat'));
  });
  function back() {
    if(get('modal').open) {close(); return true;}
    if(s.tab!=='home') {s.tab='home'; render(true); return true;}
    return false;
  }
  async function resume() {
    if (!loaded) return;
    const n=C.today(), changed=n!==lastDay;
    if(changed) {lastDay=n; s.selected=n; s.month=n;}
    if(U.phone) {
      s.permission=await U.call('status');
      if(U.phone==='ios' && db.enabled && !busy) s.coverage=await U.call('sync',{state:db,plan:U.plan(db)}) || '';
    }
    if ((changed && s.tab==='home') || (s.tab==='reminders' && !get('modal').open)) render();
  }
  async function init() {
    try {
      const saved=await U.call('load');
      if(saved) {
        const obj=JSON.parse(saved);
        if(!obj || !Array.isArray(obj.people)) throw new Error('本机资料格式有误。');
        db={...C.fresh(),...obj,people:obj.people.map(C.profile)};
      }
      loaded=true; if(U.phone) s.permission=await U.call('status');
      if(U.phone==='ios' && db.enabled) s.coverage=await U.call('sync',{state:db,plan:U.plan(db)}) || '';
    } catch(e) {error(e.message);}
    render();
  }
  async function permissionChanged(result) {
    s.permission=result;
    if (result==='granted' && s.tab==='reminders') {
      const time=get('reminder-time')?.value || db.time;
      await run(async()=>{await commit({...db,enabled:true,time},true); render(); toast('生日提醒已开启');});
    } else if(s.tab==='reminders') render();
  }
  function openToday() {if(get('modal').open) close(); s.tab='home'; render(true);}
  setInterval(()=>{if(C.today()!==lastDay) resume().catch(e=>error(e.message));},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) resume().catch(e=>error(e.message));});
  init();
  return {back,resume,permissionChanged,openToday};
})();
