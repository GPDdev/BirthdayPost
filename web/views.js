const Views = (() => {
  const { esc,icon,btn,ib,phone } = U;
  const C = PostalCore;
  const weekdays = '日一二三四五六';
  const names = { home:'生日总览', friends:'好友名册', import:'聊天记录', transfer:'设备传输', reminders:'提醒设置' };
  const tabs = phone ? ['home','friends','transfer','reminders'] : ['home','friends','import','transfer'];
  const fmt = n => { const p = C.parts(n); return p.month + '月' + p.day + '日'; };
  const distance = n => n === null ? '未找到下次日期' : n === C.today() ? '今天' : n === C.today()+1 ? '明天' : '还有 ' + (n-C.today()) + ' 天';
  const head = (title,desc,action='') => '<div class="pagehead"><div><h1>' + title + '</h1>' +
    (desc ? '<p>' + desc + '</p>' : '') + '</div>' + action + '</div>';
  const empty = (ic,title,detail,action='') => '<div class="empty"><span class="icplate">' + icon(ic) +
    '</span><strong>' + title + '</strong><p>' + detail + '</p>' + action + '</div>';
  function shell(tab) {
    function nav(label,k) { return '<button type="button" class="navbtn" data-act="nav" data-value="' + k + '"' +
      (k === tab ? ' aria-current="page"' : '') + '>' + icon(k === 'reminders' ? 'bell' : k) + '<span>' + label + '</span></button>'; }
    document.querySelector('#side').innerHTML = '<div class="brand"><span class="brand-mark">' + icon('post') +
      '</span><div><strong>生辰邮局</strong><small>Birthday Post</small></div></div><nav class="navlist" aria-label="主导航">' +
      tabs.map(k => nav(names[k],k)).join('') + '</nav><div class="sidefooter">' + icon('lock') + '资料保存在本机</div>';
    document.querySelector('#top').innerHTML = '<div class="crumb">' + icon('post') + '生辰邮局<span aria-hidden="true">/</span>' + names[tab] +
      '</div><div class="mobile-brand">' + icon('post') + '生辰邮局</div><div class="device"><i></i>' +
      (phone === 'android' ? '安卓端' : phone === 'ios' ? 'iPhone 端' : '电脑端') + '</div>';
    const short = {home:'今日',friends:'好友',import:'导入',transfer:'传输',reminders:'提醒'};
    document.querySelector('#bottom').innerHTML = tabs.map(k => nav(short[k],k)).join('');
  }
  function row(entry, action='compose') {
    const p = entry.person;
    const details = [C.birthdayLabel(p.birthday),p.relation || p.alias].filter(Boolean).join(' / ');
    return '<button class="person-row" type="button" data-act="' + action + '" data-value="' + esc(p.id) + '">' +
      '<span class="avatar color' + (p.id.charCodeAt(p.id.length-1) % 4) + '">' + esc([...p.name][0]) +
      '</span><span class="rowbody"><strong>' + esc(p.name) + '</strong><small>' + esc(details) + '</small></span><span class="when">' +
      distance(entry.date) + '</span>' + icon('right') + '</button>';
  }
  function calendar(s, db) {
    const p = C.parts(s.month), first = C.days(p.year,p.month,1);
    const count = C.days(p.year,p.month+1,1) - first, offset = ((first+3)%7+7)%7;
    const grouped = new Map();
    for (const f of db.people) {
      const n = C.next(f.birthday, first);
      if (n !== null && n < first + count) { if (!grouped.has(n)) grouped.set(n, []); grouped.get(n).push(f); }
    }
    let cells = [...'一二三四五六日'].map(w => '<span class="dow">' + w + '</span>').join('') + '<span></span>'.repeat(offset);
    for (let d=1; d<=count;d++) {
      const n = first+d-1;
      cells += '<button type="button" data-act="cal-day" data-value="' + n + '" aria-label="' + fmt(n) +
        (grouped.has(n) ? '，' + grouped.get(n).length + ' 人生日' : '') + '" aria-pressed="' + (s.selected === n) +
        '" class="' + (n === C.today() ? 'today ' : '') + (grouped.has(n) ? 'has ' : '') +
        (s.selected === n ? 'selected' : '') + '">' + d + '</button>';
    }
    const list = grouped.get(s.selected) || [];
    return '<section class="panel"><div class="cal-top"><h2>' + p.year + ' 年 ' + p.month + ' 月</h2><div>' +
      ib('cal-prev','上个月','left') + ib('cal-next','下个月','right') + '</div></div><div class="cal">' + cells +
      '</div><div class="cal-detail">' + fmt(s.selected) + '　' + (list.length ? list.map(f => btn('compose',f.name,'','linkbtn',f.id)).join('') : '没有好友过生日') + '</div></section>';
  }
  function home(db,s) {
    const now = C.today(), day = C.parts(now), sorted = C.sorted(db.people,now);
    const due = sorted.filter(e => e.date === now), future = C.sorted(db.people,now+1).filter(e => e.date !== null).slice(0,5);
    const start = phone ? 'transfer' : 'import', startLabel = phone ? '导入生日资料' : '导入聊天记录';
    const title = due.length ? '今天有 ' + due.length + ' 位好友过生日' : db.people.length ? '今天没有好友过生日' : '记下第一个生日';
    const sub = due.length ? due.slice(0,3).map(e => esc(e.person.name)).join('、') + (due.length > 3 ? ' 等好友' : '') :
      future.length ? '下一位是' + esc(future[0].person.name) + '，' + fmt(future[0].date) + '过生日。' :
      phone ? '从电脑导入好友的生日和祝福素材。' : '从聊天记录中找回好友提过的重要日子。';
    const heroAction = due.length ? btn('compose','写生日祝福','edit','primary',due[0].person.id) :
      db.people.length ? btn('nav','查看好友名册','friends','primary','friends') : btn('nav',startLabel,'import','primary',start);
    return head('生日总览','',btn('manual','添加好友','plus')) + '<div class="postcard"><div class="herocopy"><div class="hero-date">' +
      icon('calendar') + day.year + ' 年 ' + day.month + ' 月 ' + day.day + ' 日　星期' + weekdays[new Date(now*86400000).getUTCDay()] +
      '</div><h2>' + title + '</h2><p>' + sub + '</p>' + heroAction + '</div><div class="heroart" aria-hidden="true"></div></div>' +
      (due.length ? '<section class="panel spaced"><div class="panelhead"><h2 class="section-title">' + icon('cake') + '今日生日</h2></div>' + due.map(e=>row(e)).join('') + '</section>' : '') +
      '<div class="homegrid"><section class="panel"><div class="panelhead"><h2 class="section-title">' + icon('clock') + '接下来的生日</h2>' +
      btn('nav','全部好友','right','linkbtn','friends') + '</div>' + (future.length ? future.map(e => row(e)).join('') :
        empty('mail','还没有待寄的祝福',db.people.length ? '下一次生日会在这里出现。' : '添加好友后，这里会按生日先后排列。',btn('manual','手动记一个生日','plus','linkbtn'))) +
      '</section>' + calendar(s,db) + '</div>';
  }
  function friends(db, query) {
    const rows = C.sorted(db.people).filter(e => [e.person.name,e.person.alias,e.person.relation,e.person.interests].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
    return '<div class="rows">' + (rows.length ? rows.map(e => row(e,'person')).join('') :
      empty('friends',query ? '没有匹配的好友' : '名册还是空的',query ? '试试姓名、称呼或兴趣。' : '可以手动添加，也可以先导入资料。')) + '</div>';
  }
  function friendsPage(db,s) {
    return head('好友名册','已收录 ' + db.people.length + ' 位好友',btn('manual','添加好友','plus')) +
      '<section class="panel"><div class="toolbar"><label class="search">' + icon('search') + '<input id="search" aria-label="搜索好友" type="search" placeholder="搜索姓名、称呼或兴趣" value="' + esc(s.query) +
      '"></label></div><div id="friendrows">' + friends(db,s.query) + '</div></section>';
  }
  function imports(s) {
    const pending = s.pending.map(p => '<button type="button" class="reviewrow" data-act="review" data-value="' + esc(p.id) +
      '"><span class="avatar">' + esc([...p.name][0]) + '</span><span class="rowbody"><strong>' + esc(p.name) +
      '</strong><small>' + (p.choices.length > 1 ? '发现多个日期，请选择' : p.choices.length ? C.birthdayLabel(p.choices[0]) : '没有明确生日，可手动补充') +
      '</small></span><span class="when">核对</span>' + icon('right') + '</button>').join('');
    return head('导入聊天记录','在本机提取生日、称呼、兴趣和心愿。') +
      '<div class="split"><div class="stack"><section class="panel"><h2>选择聊天记录</h2><div id="drop" class="drop">' + icon('file') +
      '<strong>将聊天文件拖到这里</strong><span class="hint">TXT、CSV、TSV 或 JSON，每个文件最多 32 MB</span>' +
      btn('pick-chats','选择文件','import','primary') + '</div><label class="field">我在聊天中的名字（选填）<input id="self" value="' + esc(s.self) +
      '" placeholder="小周、我的 QQ 昵称"></label><p class="hint">填写后会跳过自己的发言，可用逗号分隔多个名字。</p><details class="examples"><summary>查看支持的记录格式</summary>' +
      '<pre>小禾：我的生日是5月18日。<br>小禾：我喜欢骑行。<br><br>CSV 示例<br>时间,发送者,内容<br>2026-01-02,小禾,我今年想骑完环湖线。</pre><p>也可读取带日期的 QQ 文本记录，以及含 sender、text、time 的消息数组。微信或 QQ 的加密备份需先导出成上述格式。</p></details>' +
      '<div class="actions spaced">' + btn('paste-chat','粘贴聊天文本','edit','linkbtn') + '</div></section>' +
      (s.pending.length || s.importInfo ? '<section class="panel" id="review-list"><h2>待核对好友</h2><p class="hint">' + esc(s.importInfo) +
        '　待核对 ' + s.pending.length + ' 位</p>' + pending + '</section>' : '') + '</div><section class="panel"><h2>核对后再收录</h2><ol class="steps"><li>选取带发言人姓名的聊天记录。</li><li>对照原句确认生日，补充或修改好友资料。</li><li>在「设备传输」导出给手机。</li></ol><hr class="divider"><p class="hint">原句仅在本次核对时显示，关闭窗口后清除。</p></section></div>';
  }
  function transfer(db) {
    return head('设备传输','用一份生日资料包，在电脑和手机间携带好友资料。') + '<div class="split"><section class="panel"><h2>' +
      (phone ? '导入电脑上的资料' : '导出到手机') + '</h2><div class="drop">' + icon(phone ? 'phone' : 'mail') +
      (phone ? '<strong>选择电脑导出的 JSON 资料包</strong>' : '<strong><span class="filecount">' + db.people.length + '</span> 张已确认的好友卡</strong>') +
      '<span class="hint">包括生日、称呼、关系、兴趣和心愿</span>' + (phone ? btn('pick-pack','选择生日资料包','import','primary') :
        db.people.length ? btn('export','导出生日资料包','export','primary') : btn('nav','先导入聊天记录','import','primary','import')) +
      '</div><p class="hint">同一张好友卡再次导入时会更新资料，手机上保存的祝福草稿会保留。</p></section><section class="panel"><h2>' +
      (phone ? '提醒与祝福' : '在手机上打开') + '</h2><ol class="steps">' +
      (phone ? '<li>导入已确认的好友卡。</li><li>在提醒设置选择时间并开启通知。</li><li>生日当天打开好友卡，编辑后复制祝福。</li>' :
        '<li>把 JSON 文件传到手机，并保存到文件管理器。</li><li>在手机端选择「设备传输」，导入这个文件。</li><li>开启生日提醒，在通知中查看当天的好友。</li>') +
      '</ol>' + (phone ? btn('nav','提醒设置','bell','linkbtn','reminders') : btn('pick-pack','从资料包恢复到电脑','import','linkbtn')) + '</section></div>';
  }
  function reminders(db,s) {
    const active = db.enabled && s.permission === 'granted';
    return head('提醒设置','生日当天按手机的本地时间提醒。') + '<section class="panel single"><div class="panelhead"><h2>' +
      (active ? '生日提醒已开启' : '生日提醒尚未开启') + '</h2>' + icon('bell') + '</div><div class="formgrid">' +
      '<label class="field">每天的提醒时间<input type="time" id="reminder-time" value="' + esc(db.time) + '"></label><p class="hint">' +
      (phone === 'android' ? '仅在有好友过生日的日子通知。系统省电设置可能使提醒稍晚送达。' : '同一天的生日合并提醒。') + '</p>' +
      (s.coverage ? '<p class="note">' + esc(s.coverage) + '</p>' : '') +
      (s.permission === 'denied' ? '<p class="note">请在系统设置中允许生辰邮局发送通知。</p>' : '') +
      '<div class="actions">' + btn('enable',active ? '保存提醒时间' : '开启生日提醒','bell','primary') +
      (db.enabled ? btn('disable','关闭提醒') : '') + (s.permission === 'denied' ? btn('settings','系统设置') : '') +
      '</div></div></section>';
  }
  return { names, shell, home, friends, friendsPage, imports, transfer, reminders, fmt };
})();
