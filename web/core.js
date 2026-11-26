/* Shared by all four clients. All day arithmetic uses civil dates, never elapsed local hours. */
const PostalCore = (() => {
  const DAY = 86400000;
  const FORMAT = 'birthday-post.profiles';
  const days = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
  const parts = n => {
    const date = new Date(n * DAY);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  };
  const today = (now = new Date()) => days(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const pad = n => String(n).padStart(2, '0');
  const iso = n => { const p = parts(n); return p.year + '-' + pad(p.month) + '-' + pad(p.day); };
  const lsMonths = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const digits = ['','一','二','三','四','五','六','七','八','九','十'];
  const lunarDay = d => d <= 10 ? '初' + digits[d] : d < 20 ? '十' + digits[d-10] :
    d === 20 ? '二十' : d < 30 ? '廿' + digits[d-20] : '三十';
  let start = days(1901, 2, 19);
  const lunarYears = LUNAR_YEARS.map(code => {
    const leap = code & 15;
    const months = [];
    for (let i = 1; i <= (leap ? 13 : 12); i++) {
      const length = (code & (1 << (i + 3))) ? 30 : 29;
      months.push({ month: leap && i > leap ? i - 1 : i, leap: !!leap && i === leap + 1, start, length });
      start += length;
    }
    return months;
  });
  function solarOccurrence(b, year) {
    const n = days(year, b.month, b.day);
    return parts(n).month === b.month ? n : null;
  }
  function occurrence(b, year) {
    if (b.calendar === 'solar') return solarOccurrence(b, year);
    const months = lunarYears[year - 1901] || [];
    const m = months.find(m => m.month === b.month && m.leap === !!b.leap);
    return m && b.day <= m.length ? m.start + b.day - 1 : null;
  }
  function next(b, from = today()) {
    const year = parts(from).year;
    for (let y = b.calendar === 'lunar' ? Math.max(1901, year - 1) : year;
      y <= (b.calendar === 'lunar' ? 2100 : year + 8); y++) {
      const n = occurrence(b, y);
      if (n !== null && n >= from) return n;
    }
    return null;
  }
  function validBirthday(b) {
    if (!b || !['solar','lunar'].includes(b.calendar) || !Number.isInteger(b.month) ||
        !Number.isInteger(b.day) || b.month < 1 || b.month > 12 || b.day < 1 || b.day > 31 ||
        (b.leap !== undefined && typeof b.leap !== 'boolean')) return false;
    return b.calendar === 'lunar' ? b.day <= 30 : !b.leap && solarOccurrence(b, 2000) !== null;
  }
  function birthdayLabel(b) {
    if (!validBirthday(b)) return '生日待补充';
    return b.calendar === 'lunar' ? '农历' + (b.leap ? '闰' : '') + lsMonths[b.month - 1] + '月' + lunarDay(b.day)
      : b.month + '月' + b.day + '日';
  }
  const trim = (s, limit) => typeof s === 'string' ? s.trim().slice(0, limit) : '';
  function profile(raw) {
    if (!raw || typeof raw !== 'object' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id || '') ||
      typeof raw.id !== 'string' || ['__proto__','constructor','prototype'].includes(raw.id) || !trim(raw.name, 80) || !validBirthday(raw.birthday)) {
      throw new Error('有一张好友卡的姓名、编号或生日无效，请在电脑端核对后重新导出。');
    }
    const b = raw.birthday;
    return { id: raw.id, name: trim(raw.name, 80), birthday: { calendar: b.calendar, month: b.month, day: b.day, leap: !!b.leap },
      alias: trim(raw.alias, 80), relation: trim(raw.relation, 60), interests: trim(raw.interests, 160), wish: trim(raw.wish, 200) };
  }
  function makePack(people) {
    return { format: FORMAT, version: 1, people: people.map(profile) };
  }
  function readPack(text) {
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error('文件内容不是有效的 JSON。'); }
    if (!data || data.format !== FORMAT || data.version !== 1 || !Array.isArray(data.people)) {
      throw new Error('请选择从「生辰邮局」导出的生日资料包。');
    }
    if (!data.people.length || data.people.length > 10000) throw new Error('资料包须含 1 至 10000 张好友卡。');
    const people = data.people.map(profile);
    if (new Set(people.map(p => p.id)).size !== people.length) throw new Error('资料包内出现重复编号，请重新导出。');
    return people;
  }
  function merge(people, additions) {
    const byId = new Map(people.map(p => [p.id, p]));
    additions.forEach(p => byId.set(p.id, p));
    return [...byId.values()];
  }
  function sorted(people, from = today()) {
    return people.map(p => ({ person: p, date: next(p.birthday, from) }))
      .sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.person.name.localeCompare(b.person.name, 'zh'));
  }
  function greeting(p, tone = '自然', version = 0) {
    const name = p.alias || p.name;
    const formal = tone === '郑重' || (tone === '自然' && /老师|师长|长辈|导师/.test(p.relation));
    const interest = (p.interests || '').split(/[、，,；;]/).map(t => t.trim()).filter(Boolean)[0];
    const i = Math.abs(version) % 3;
    const intro = (formal ? ['祝您生日快乐！','在您的生日送上我的祝福。','祝您生辰愉快！'] :
      tone === '俏皮' ? ['生日快乐！今天的第一块蛋糕归你。','许愿时间到！生日快乐呀！','今天你可以理直气壮地点两份甜点。生日快乐！'] :
      ['生日快乐呀！','又到你的生日了，祝你生日快乐！','今天想专门和你说声生日快乐。'])[i];
    const end = (formal ? ['愿新的一岁平安顺意，常有好消息。','愿您身体康健，日日舒心。','祝您在新的一岁里，心有所盼，事有所成。'] :
      ['愿你这一岁多一些自在，多一些开怀大笑的日子。','新的一岁，愿你身边总有喜欢的人和事。','祝你接下来的日子有惊喜，也有踏实的小幸福。'])[i];
    const you = formal ? '您' : '你';
    const personal = [];
    if (interest) personal.push(['愿' + you + '总有时间享受' + interest + '的乐趣。', '希望' + interest + '在新的一岁里继续带给' + you + '快乐。', '也祝' + you + '能给' + interest + '多留一点时间。'][i]);
    if (p.wish) personal.push('也祝' + you + '提过的心愿「' + p.wish + '」早日实现。');
    return name + '，' + intro + personal.join('') + end;
  }
  function rules(people) {
    const groups = new Map();
    for (const p of people) {
      const b = p.birthday;
      const key = [b.calendar,b.month,b.day,Number(!!b.leap)].join('-');
      if (!groups.has(key)) groups.set(key, { key, birthday: b, names: [] });
      groups.get(key).names.push(p.name);
    }
    return [...groups.values()];
  }
  // Rolling schedulers group friends sharing the same civil day into one notification.
  function upcoming(groups, limit, time, now = new Date()) {
    const from = today(now) + (pad(now.getHours()) + ':' + pad(now.getMinutes()) >= time ? 1 : 0);
    const cursors = groups.map(g => ({ g, n: next(g.birthday, from) }));
    const result = [];
    while (result.length < limit) {
      let n = Infinity;
      for (const c of cursors) if (c.n !== null && c.n < n) n = c.n;
      if (!Number.isFinite(n)) break;
      const names = [];
      for (const c of cursors) if (c.n === n) {
        names.push(...c.g.names);
        c.n = next(c.g.birthday, n + 1);
      }
      result.push({ date: iso(n), names });
    }
    return result;
  }
  function androidRules(groups) {
    return groups.map(g => {
      const b = g.birthday;
      if (b.calendar === 'solar') return { md: pad(b.month) + '-' + pad(b.day), names: g.names };
      const dates = [];
      for (let y = 1901; y <= 2100; y++) { const n = occurrence(b, y); if (n !== null) dates.push(iso(n)); }
      return { dates, names: g.names };
    });
  }
  const fresh = () => ({ people: [], drafts: {}, enabled: false, time: '09:00' });
  return { FORMAT, pad, days, parts, today, iso, next, occurrence, validBirthday, birthdayLabel, profile,
    makePack, readPack, merge, sorted, greeting, rules, upcoming, androidRules, fresh };
})();
