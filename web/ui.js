const U = (() => {
  const paths = {
    mail:'M3 6h18v13H3z M3 7l9 7 9-7',
    post:'M3 8h18v12H3z M3 9l9 6 9-6 M9 5h6 M11 2h2',
    home:'M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',
    friends:'M16 20H3v-2c0-3 3-5 6-5s7 2 7 5z M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a3 3 0 0 1 0 6 M18 14c2 1 3 2 3 5',
    import:'M12 3v12 M7 10l5 5 5-5 M4 15v5h16v-5',
    transfer:'M3 7h16 M15 3l4 4-4 4 M21 17H5 M9 13l-4 4 4 4',
    bell:'M4 17h16l-2-3v-4a6 6 0 0 0-12 0v4z M10 20c1 2 3 2 4 0',
    cake:'M3 14h18v7H3z M3 16q3 4 6 0 3 4 6 0 3 4 6 0 M7 14V9 M12 14V8 M17 14V9 M7 6v-1 M12 5V3 M17 6V5',
    calendar:'M3 6h18v15H3z M7 3v5 M17 3v5 M3 11h18 M7 15h2 M12 15h2',
    lock:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
    plus:'M12 4v16 M4 12h16', right:'M9 5l7 7-7 7',left:'M15 5l-7 7 7 7',
    search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',
    close:'M5 5l14 14 M19 5L5 19', copy:'M8 8h12v13H8z M16 8V3H3v13h5',
    edit:'M4 16l-1 5 5-1L20 8l-4-4z M13 7l4 4',
    file:'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',
    clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v6l4 2',
    refresh:'M4 9a8 8 0 0 1 13-4l3 3 M20 3v5h-5 M20 15a8 8 0 0 1-13 4l-3-3 M4 21v-5h5',
    export:'M12 15V3 M7 8l5-5 5 5 M4 15v5h16v-5',check:'M4 12l5 5L20 6',
    phone:'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M10 18h4'
  };
  const icon = k => '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="' + paths[k] + '"/></svg>';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn = (action,label,ic='',cls='secondary',value='') => '<button type="button" class="' + cls + '" data-act="' +
    action + '" data-value="' + esc(value) + '">' + (ic ? icon(ic) : '') + esc(label) + '</button>';
  const ib = (action,label,ic) => '<button type="button" class="iconbtn" aria-label="' + label + '" title="' + label +
    '" data-act="' + action + '">' + icon(ic) + '</button>';
  const phone = window.PostNative ? 'android' : window.webkit?.messageHandlers?.postal ? 'ios' : '';
  const key = 'birthday-post.db.v1';
  let lastRead = null;
  async function call(op, payload = null) {
    if (phone === 'android') {
      const reply = JSON.parse(window.PostNative.call(op, JSON.stringify(payload)));
      if (!reply.ok) throw new Error(reply.error || '系统操作失败。');
      return reply.value;
    }
    if (phone === 'ios') return window.webkit.messageHandlers.postal.postMessage({ op, payload });
    if (op === 'load') { lastRead = localStorage.getItem(key); return lastRead; }
    if (op === 'save') {
      const write = () => {
        if (lastRead !== localStorage.getItem(key)) throw new Error('另一窗口已更新资料，请重新打开当前窗口后保存。');
        const text = JSON.stringify(payload.state);
        localStorage.setItem(key,text); lastRead = text; return true;
      };
      return navigator.locks ? navigator.locks.request(key,write) : write();
    }
    return null;
  }
  function iosPlan(groups, state) {
    if (!groups.length || !state.enabled) return { annual: [], dates: [] };
    if (groups.length <= 60 && groups.every(g => g.birthday.calendar === 'solar'))
      return { annual: groups.map(g => ({month:g.birthday.month, day:g.birthday.day, names:g.names})), dates: [] };
    return { annual: [], dates: PostalCore.upcoming(groups, 60, state.time) };
  }
  function plan(state) {
    const groups = PostalCore.rules(state.people);
    return phone === 'android' ? PostalCore.androidRules(groups) : iosPlan(groups, state);
  }
  async function clipboard(value) {
    if (phone) { await call('copy',value); return; }
    try { await navigator.clipboard.writeText(value); return; } catch (_) { /* file URLs can require a selection */ }
    const text = document.createElement('textarea');
    text.value = value;
    const parent = document.querySelector('dialog[open]') || document.body;
    parent.appendChild(text);
    text.select();
    const ok = document.execCommand('copy');
    text.remove();
    if (!ok) throw new Error('系统未允许复制，请长按或选中祝福正文进行复制。');
  }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([value], { type:'application/json;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href:url, download:name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function decode(file) {
    if (file.size > 32*1024*1024) throw new Error('单个文件超过 32 MB，请按聊天或日期拆分后导入。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
    try { return new TextDecoder('utf-8',{ fatal:true }).decode(bytes); }
    catch (_) { return new TextDecoder('gb18030').decode(bytes); }
  }
  return { esc, icon, btn, ib, phone, call, plan, clipboard, decode, download };
})();
