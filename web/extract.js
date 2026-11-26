const ChatImport = (() => {
  const dayRE = /\b((?:19|20)\d\d)[年/.-](\d{1,2})[月/.-](\d{1,2})/;
  const stamp = '((?:19|20)\\d\\d[年./-]\\d{1,2}[月./-]\\d{1,2}日?(?:[T\\s,，]+\\d{1,2}:\\d{2}(?::\\d{2})?)?)';
  const dated = new RegExp('^\\[?' + stamp + '\\]?\\s*(?:-\\s*)?(.+)$');
  const named = new RegExp('^(.{1,80}?)\\s+' + stamp + '\\s*$');
  const dateOnly = new RegExp('^\\[?' + stamp + '\\]?$');
  function validDay(y, m, d) {
    if (y < 1900 || y > 2100) return null;
    const n = PostalCore.days(y,m,d), p = PostalCore.parts(n);
    return p.month === m && p.day === d ? n : null;
  }
  function getDay(value) {
    if (/^\d{10}(?:\d{3})?$/.test(String(value))) {
      const instant = new Date(Number(value) * (String(value).length === 10 ? 1000 : 1));
      return PostalCore.today(instant);
    }
    const m = String(value || '').match(dayRE);
    return m ? validDay(+m[1],+m[2],+m[3]) : null;
  }
  function parseText(text) {
    const rows = [];
    let current = null, day = null;
    const add = (name, body, date) => {
      current = { name: name.replace(/\s*[（(](?:\d{5,}|[^()\s]+@[^()\s]+)[)）]$/, '').trim(),
        senderId: (name.match(/[（(](\d{5,}|[^()\s]+@[^()\s]+)[)）]$/) || [])[1] || '', text: body, date };
      rows.push(current);
    };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || /^(?:>|\[引用\]|引用消息|以下为.*聊天记录|消息记录|消息分组|消息对象)/.test(line)) continue;
      if (dateOnly.test(line)) { day = getDay(line); current = null; continue; }
      const pre = line.match(dated), post = line.match(named);
      if (post) { day = getDay(post[2]); add(post[1], '', day); continue; }
      if (pre) {
        day = getDay(pre[1]);
        const tail = pre[2].match(/^(.{1,80}?)[：:]\s*(.*)$/);
        if (tail) add(tail[1], tail[2], day);
        else if (pre[2].trim().length <= 80) add(pre[2].trim(), '', day);
        continue;
      }
      const speaker = line.match(/^([^:：]{1,80}?)[：:]\s*(.*)$/);
      if (speaker && !/^(?:生日|爱好|昵称|时间|目标|喜欢|愿望|兴趣|https?)$/i.test(speaker[1])) {
        add(speaker[1], speaker[2], day); continue;
      }
      if (current) current.text += (current.text ? '\n' : '') + line;
    }
    return rows.filter(r => r.name && r.text);
  }
  function delimited(text, separator) {
    const table = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i+1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === separator && !quoted) { row.push(cell); cell = ''; }
      else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); table.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quoted) throw new Error('CSV 中有未闭合的引号。');
    row.push(cell.replace(/\r$/, '')); table.push(row);
    const headers = (table.shift() || []).map(h => h.trim());
    return table.map(cells => Object.fromEntries(headers.map((h,i) => [h,cells[i]])));
  }
  const field = (r, keys) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
    return '';
  };
  function structured(records, members = []) {
    if (!Array.isArray(records)) throw new Error('JSON 需要消息数组，或包含 messages 数组。');
    const names = new Map((Array.isArray(members) ? members : []).filter(Boolean)
      .map(m => [String(field(m,['platformId','id','userId'])), field(m,['groupNickname','accountName','nickname','name'])]));
    return records.filter(r => r && typeof r === 'object').map(r => {
      const sender = r.sender && typeof r.sender === 'object' ? r.sender : {};
      const id = String(field(r,['senderId','sender_id','platformMessageSenderId','from_id','StrTalkerId','发送者ID']) || field(sender,['id','platformId']));
      const name = field(r,['senderName','sender_name','from','displayName','发送人','发送者','发言人','昵称','好友','Name','name']) ||
        field(sender,['name','displayName']) || (typeof r.sender === 'string' ? r.sender : '') || names.get(id) || id;
      const content = field(r,['text','content','Content','message','内容','消息内容','StrContent']);
      const body = Array.isArray(content) ? content.map(t => typeof t === 'string' ? t : t && t.text || '').join('') : content;
      const outgoing = field(r,['isSelf','isSend','is_sender','IsSender','out','是否发送']);
      return { name: String(name).trim(), senderId: id, text: typeof body === 'string' ? body : '',
        conversation: String(field(r,['conversationId','chatId','talker'])),
        self: /^(1|true|yes|是)$/i.test(String(outgoing)),
        date: getDay(field(r,['timestamp','time','date','datetime','CreateTime','StrTime','时间','日期'])) };
    }).filter(r => r.name && r.text && !/^\s*<(?:\?xml|msg|sysmsg)/i.test(r.text));
  }
  function read(text, filename = '') {
    text = text.replace(/^\uFEFF/, '').trim();
    if (/\.json$/i.test(filename) || /^[{[]/.test(text) && !/^\[(?:19|20)\d{2}[-/.年]/.test(text) && /^[{[]\s*["{\]]/.test(text)) {
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('JSON 格式有误，请检查聊天记录文件。'); }
      if (data && data.format === PostalCore.FORMAT) throw new Error('这是生日资料包，请在「设备传输」中导入。');
      return structured(Array.isArray(data) ? data : data && (data.messages || data.records), data && data.members);
    }
    if (/\.(csv|tsv)$/i.test(filename) || /^(?:.*[,，\t])?(?:sender|发送者|发送人|时间|昵称|senderName)[,\t]/i.test(text.split('\n')[0])) {
      return structured(delimited(text, /\.tsv$/i.test(filename) || text.split('\n')[0].includes('\t') ? '\t' : ','));
    }
    return parseText(text);
  }
  function number(text) {
    if (/^\d+$/.test(text)) return +text;
    const v = { 正:1, 冬:11, 腊:12, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
    text = text.replace(/^初/, '').replace(/^廿/, '二十').replace(/^卅/, '三十');
    if (text.includes('十')) { const pair = text.split('十'); return (v[pair[0]] || 1)*10 + (v[pair[1]] || 0); }
    return v[text] || 0;
  }
  const numerals = '[\\d一二两三四五六七八九十廿卅初正冬腊]';
  const absolute = '(?:(?:公历|阳历|农历|阴历)\\s*)?(?:\\d{4}[年./-])?(?:闰)?' +
    numerals + '{1,3}\\s*(?:月|[./-])\\s*' + numerals + '{1,4}(?:日|号)?';
  const datePhrase = '(' + absolute + '|今天|明天|后天|昨天|前天)';
  const prefix = '(?:^|(?:其实|对了|谢谢[你您]?|说起来|顺便说下)[，, ]*)';
  const patterns = [
    new RegExp(prefix + '(?:我(?:自己)?的?生日|本人(?:的)?生日|生日)(?:日期)?(?:[是就在定于为：:\\s]{0,6})' + datePhrase),
    new RegExp(prefix + '(?:我(?:是|在|会在)?\\s*)?' + datePhrase + '\\s*(?:才是|就是|是|过|出生)(?:我(?:自己)?的?|本人(?:的)?)?(?:生日|生的|出生|$)'),
    new RegExp(prefix + '我(?:是|在)?\\s*' + datePhrase + '\\s*(?:出生|生的|过生日|生日)'),
    new RegExp(prefix + datePhrase + '(?:就是|是)?我(?:的)?生日')
  ];
  function extractDate(line, date) {
    if (/[?？]|是不是|好像|可能|记错|本来|原本|不是|并非|不在|假如|如果|听说|转发|据说|[“「『"»>]/.test(line)) return null;
    for (const re of patterns) {
      const m = line.match(re);
      if (!m) continue;
      const token = m[1].replace(/\s/g, '');
      if (/^[今明后昨前]天$/.test(token)) {
        if (!Number.isInteger(date) || /农历|阴历/.test(line)) return null;
        const p = PostalCore.parts(date + ({今天:0,明天:1,后天:2,昨天:-1,前天:-2})[token]);
        return { calendar:'solar', month:p.month, day:p.day, leap:false };
      }
      const t = token.replace(/^(公历|阳历|农历|阴历)/, '').replace(/^\d{4}[年./-]/, '').replace(/^闰/, '');
      const nums = t.match(/^(.+?)(?:月|[./-])(.+?)(?:日|号)?$/);
      if (!nums) continue;
      const b = { calendar: /农历|阴历|闰|正月|冬月|腊月|初[一二三四五六七八九十\d]|廿|卅/.test(line) ? 'lunar' : 'solar',
        month:number(nums[1]), day:number(nums[2]), leap:token.includes('闰') };
      if (PostalCore.validBirthday(b)) return b;
    }
    return null;
  }
  function stableId(key) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < key.length; i++) {
      a = Math.imul(a ^ key.charCodeAt(i), 16777619); b = Math.imul(b,33) ^ key.charCodeAt(i);
    }
    return 'p-' + (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
  }
  const facts = [
    ['alias', /^(?:大家(?:都)?叫我|你(?:可以)?叫我|叫我|我的昵称是)(.{1,22}?)(?:就好|就行|吧|啦)?$/],
    ['interests', /^(?:我(?:平时|最近|特别|最|很|一直|也)?(?:喜欢|爱好是|的爱好是|热爱)|(?:我的)?(?:爱好|兴趣)[是：:])(.{1,65})$/],
    ['wish', /^(?:我(?:今年|最近|以后|一直|下一步)?(?:很想|想要|想|打算|希望能|的目标是|的愿望是)|(?:我)?(?:正在|最近在|我在)准备)(.{1,90})$/],
    ['relation', /^(?:咱们|我们)(?:俩|两个)?(?:是|还是)(.{0,6}(?:同学|同事|室友|队友|邻居|校友|发小))$/]
  ];
  function candidates(rows, self = '') {
    const skip = new Set(('我,自己,本人,我方,me,myself,you,系统消息,system,' + self).toLowerCase().split(/[,，、;\n]/).map(s => s.trim()).filter(Boolean));
    const isSelf = r => r.self || skip.has(r.name.toLowerCase()) || !!r.senderId && skip.has(r.senderId.toLowerCase());
    const idOf = r => stableId((r.senderId ? 'id:' + r.senderId : 'name:' + r.name).normalize('NFC'));
    const people = new Map();
    const conversations = new Map();
    for (const row of rows) {
      const scope = (row.fileIndex || 0) + '/' + (row.conversation || '');
      if (!conversations.has(scope)) conversations.set(scope, []);
      conversations.get(scope).push(row);
      if (isSelf(row)) continue;
      const id = idOf(row);
      if (!people.has(id)) people.set(id,{ id, name:row.name.slice(0,80), choices:[], evidence:[], alias:'', relation:'', interests:'', wish:'' });
      const p = people.get(id);
      for (const line of row.text.split(/[。！？!?；;\n，,]/).map(s => s.trim()).filter(Boolean)) {
        const uncertain = /[?？]|(?:他说|她说|转发|引用|假如|如果|听说|[“「『"»>])/.test(row.text);
        const b = uncertain ? null : extractDate(line, row.date);
        let relevant = /生日|出生/.test(line);
        if (b && !p.choices.some(c => c.calendar === b.calendar && c.month === b.month && c.day === b.day && c.leap === b.leap)) p.choices.push(b);
        if (!uncertain) for (const [key, re] of facts) {
          const m = line.match(re);
          if (!m) continue;
          const value = m[1].replace(/[呀啦啊～~]+$/, '').trim();
          if (!value) continue;
          relevant = true;
          if (key === 'interests' && p[key] && !p[key].split('、').includes(value)) p[key] = (p[key] + '、' + value).slice(0,160);
          else if (!p[key]) p[key] = value;
        }
        if (relevant) {
          const evidence = (Number.isInteger(row.date) ? PostalCore.iso(row.date) + '  ' : '') + row.text.slice(0,220);
          if (!p.evidence.includes(evidence)) {
            if (p.evidence.length < 10) p.evidence.push(evidence);
            else if (b) p.evidence[9] = evidence;
          }
        }
      }
    }
    // A dated outgoing wish or a direct answer is attributable only in a two-person exchange.
    for (const chat of conversations.values()) {
      const peers = new Set(chat.filter(r=>!isSelf(r)).map(idOf));
      if (peers.size !== 1) continue;
      const p = people.get([...peers][0]);
      for (let i=0; i<chat.length; i++) {
        const r=chat[i], previous=chat[i-1];
        let b=null, evidence='';
        if (isSelf(r) && Number.isInteger(r.date) && /^(?:祝你|祝您|亲爱的[，, ]*)?生日快乐[呀哦啦啊哈!！。🎂🎉~～\s]*$/u.test(r.text.trim())) {
          const time=PostalCore.parts(r.date);
          b={calendar:'solar',month:time.month,day:time.day,leap:false};
          evidence='问候日期推测（可能提前或补祝）　'+PostalCore.iso(r.date)+'　'+r.name+'：'+r.text;
        } else if (!isSelf(r) && previous && isSelf(previous) && /你(?:的)?生日.*(?:哪天|几月|什么时候|几号)|你(?:是)?几月几[号日].*生日/.test(previous.text)) {
          const answer=r.text.trim().replace(/[。！!啦呀～~]+$/,'');
          if (new RegExp('^'+datePhrase+'$').test(answer)) {
            b=extractDate('我的生日是'+answer,r.date);
            evidence='生日问答　'+previous.name+'：'+previous.text+'　'+r.name+'：'+r.text;
          }
        }
        if (b) {
          if (!p.choices.some(c=>PostalCore.birthdayLabel(c)===PostalCore.birthdayLabel(b))) p.choices.push(b);
          if (!p.evidence.includes(evidence)) {if (p.evidence.length>=10) p.evidence.pop(); p.evidence.push(evidence.slice(0,280));}
        }
      }
    }
    return [...people.values()].sort((a,b) => Number(!a.choices.length) - Number(!b.choices.length) || a.name.localeCompare(b.name, 'zh'));
  }
  return { read, candidates, extractDate, getDay, stableId };
})();
