/* Thansen Verktøykasse — delt konfig + konto-innlogging (roller: dev > manager > coworker). */
window.THelper = (function () {
  const SB_URL = 'https://tfjvgvrqngevsiuueixf.supabase.co';
  const SB_KEY = 'sb_publishable_O-gjCbc7E1pX-I0o9DawbQ_xbnV6uJY';
  const sb = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  const SESSION_KEY = 'thelper.session';
  const TITLES = ['Deltid', 'Butikkmedarbeider', 'BCT', 'Butikksjef'];
  const LEVEL = { dev: 3, manager: 2, coworker: 1 };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- delt SVG-ikonbibliotek (erstatter emoji-ikoner i UI-et) ----------
     Strek-ikoner i Lucide/Feather-stil, 24x24, arver currentColor og skaleres med
     font-size via .th-ic. Dekorativt: aria-hidden — knapper trenger egen aria-label. */
  const ICONS = {
    lock:    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock:  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    bike:    '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    board:   '<path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/>',
    book:    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    external:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    link:    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    wrench:  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    gear:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    disc:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    weight:  '<circle cx="12" cy="5" r="3"/><path d="M6.5 8a2 2 0 0 0-1.9 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.93-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z"/>',
    bolt:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    battery: '<rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/>',
    star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    pencil:  '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    x:       '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    copy:    '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    terminal:'<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    sync:    '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  };
  function icon(name, cls = ''){
    return `<svg class="th-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }

  /* ---------- session (lagrer KUN sesjonstoken, aldri passord) ----------
     localStorage så innloggingen overlever fane-/nettleserlukking (tokenet
     utløper server-side etter 30 dager, og kan trekkes tilbake med logg ut). */
  function getSession(){
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY));
      if (s && !s.token && s.pw) s.token = s.pw;   // eldre sesjoner (pre-token) — passordet godtas fortsatt av serveren
      return s;
    } catch { return null; }
  }
  function setSession(user, token){
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user, token }));
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }
  function clearSession(){
    const s = getSession();
    if (s && s.token && sb) sb.rpc('logout_account', { p_tag: s.user.tag, p_token: s.token }).then(()=>{}, ()=>{});
    localStorage.removeItem(SESSION_KEY);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }
  const getUser = () => { const s = getSession(); return s ? s.user : null; };
  const role    = () => { const u = getUser(); return u ? u.role : null; };
  const level   = () => LEVEL[role()] || 0;
  const canManage = () => level() >= 2;
  const isDev   = () => role() === 'dev';

  /* ---------- shared CSS ---------- */
  function injectCss(){
    if (document.getElementById('th-shared-css')) return;
    const st = document.createElement('style'); st.id = 'th-shared-css';
    st.textContent = `
      /* Felles designtokens for hele suiten — nye sider/komponenter bør bruke disse
         i stedet for å hardkode farger (kanonisk kilde for merkevarefargene). */
      :root{ --th-brand:#004595; --th-brand-2:#2684e6; --th-yellow:#ffd400; --th-red:#e30613;
             --th-bg:#0f1318; --th-panel:#161b22; --th-line:#2a323d; --th-text:#f1f4f8; --th-muted:#97a3b2; }
      .th-ic{width:1em;height:1em;vertical-align:-0.125em;display:inline-block;flex:none;}
      .th-toast-wrap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:99999;align-items:center;pointer-events:none;}
      .th-toast{background:#11151b;color:#f1f4f8;border:1px solid #2a323d;border-left:3px solid #2684e6;border-radius:12px;padding:10px 14px;font:500 14px/1.3 system-ui;box-shadow:0 10px 34px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px;pointer-events:auto;max-width:90vw;}
      .th-ov{position:fixed;inset:0;background:rgba(6,9,13,.72);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;}
      .th-dialog{background:#161b22;border:1px solid #2a323d;border-top:3px solid #2684e6;border-radius:18px;padding:20px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.55);color:#f1f4f8;font:400 15px/1.5 system-ui;}
      .th-tabs{display:flex;gap:6px;margin-bottom:14px;background:#0f1318;border:1px solid #2a323d;border-radius:10px;padding:3px;}
      .th-tabs button{flex:1;background:transparent;color:#97a3b2;border:0;border-radius:8px;padding:8px;font:600 13px system-ui;cursor:pointer;}
      .th-tabs button.on{background:#2684e6;color:#fff;}
      .th-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
      .th-f label{color:#97a3b2;font-size:12px;}
      .th-f input,.th-f select{background:#0f1318;color:#f1f4f8;border:1px solid #2a323d;border-radius:10px;padding:10px 12px;font-size:15px;}
      .th-f input:focus,.th-f select:focus{outline:none;border-color:#2684e6;}
      .th-err{color:#ff9b9b;font-size:13px;min-height:16px;margin:2px 0 8px;}
      .th-row{display:flex;gap:10px;justify-content:flex-end;}
      .th-btn{background:#2684e6;color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 15px system-ui;cursor:pointer;}
      .th-btn.ghost{background:transparent;border:1px solid #2a323d;color:#f1f4f8;}`;
    document.head.appendChild(st);
  }

  /* ---------- toast ---------- */
  let toastWrap;
  function toast(msg, opts = {}){
    injectCss();
    if (!toastWrap){ toastWrap = document.createElement('div'); toastWrap.className = 'th-toast-wrap'; toastWrap.setAttribute('aria-live','polite'); document.body.appendChild(toastWrap); }
    const t = document.createElement('div'); t.className = 'th-toast'; t.setAttribute('role','status'); t.append(msg);
    toastWrap.appendChild(t); setTimeout(() => t.remove(), opts.ms || 3500); return t;
  }

  /* ---------- auth (login/register returnerer {user, token}) ---------- */
  async function callLogin(tag, pw){
    const { data, error } = await sb.rpc('login_account', { p_tag: tag, p_password: pw });
    if (error) throw error; return Array.isArray(data) ? data[0] : data;
  }
  async function callRegister(tag, name, title, color, pw, invite){
    const { data, error } = await sb.rpc('register_account', { p_tag: tag, p_name: name, p_title: title, p_color: color, p_password: pw, p_invite: invite });
    if (error) throw error; return Array.isArray(data) ? data[0] : data;
  }

  function authModal(initial = 'login'){
    return new Promise(resolve => {
      injectCss();
      const ov = document.createElement('div'); ov.className = 'th-ov';
      ov.innerHTML = `
        <div class="th-dialog" role="dialog" aria-modal="true" aria-label="Innlogging">
          <div class="th-tabs"><button data-t="login">Logg inn</button><button data-t="reg">Ny konto</button><button data-t="pw">Bytt passord</button></div>
          <div data-pane="login">
            <div class="th-f"><label for="thi-tag">Ansattkode (4 bokstaver)</label><input id="thi-tag" class="thi-tag" maxlength="4" autocomplete="username" placeholder="MORT" style="text-transform:uppercase"></div>
            <div class="th-f"><label for="thi-pw">Passord</label><input id="thi-pw" class="thi-pw" type="password" autocomplete="current-password" placeholder="••••"></div>
          </div>
          <div data-pane="reg" hidden>
            <div class="th-f"><label for="thr-name">Fullt navn</label><input id="thr-name" class="thr-name" placeholder="Ola Nordmann"></div>
            <div class="th-f"><label for="thr-tag">Ansattkode (4 bokstaver)</label><input id="thr-tag" class="thr-tag" maxlength="4" placeholder="OLAN" style="text-transform:uppercase"></div>
            <div class="th-f"><label for="thr-title">Stillingstittel</label><select id="thr-title" class="thr-title">${TITLES.map(t=>`<option ${t==='Butikkmedarbeider'?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="th-f"><label for="thr-pw">Passord (min. 4 tegn)</label><input id="thr-pw" class="thr-pw" type="password" autocomplete="new-password" placeholder="••••"></div>
            <div class="th-f"><label for="thr-inv">Invitasjonskode (spør butikksjefen)</label><input id="thr-inv" class="thr-inv" autocomplete="off" placeholder="····"></div>
          </div>
          <div data-pane="pw" hidden>
            <div class="th-f"><label for="thp-tag">Ansattkode (4 bokstaver)</label><input id="thp-tag" class="thp-tag" maxlength="4" autocomplete="username" placeholder="MORT" style="text-transform:uppercase"></div>
            <div class="th-f"><label for="thp-old">Nåværende passord</label><input id="thp-old" class="thp-old" type="password" autocomplete="current-password" placeholder="••••"></div>
            <div class="th-f"><label for="thp-new">Nytt passord (min. 4 tegn)</label><input id="thp-new" class="thp-new" type="password" autocomplete="new-password" placeholder="••••"></div>
          </div>
          <div class="th-err"></div>
          <div class="th-row"><button class="th-btn ghost" data-x="cancel">Avbryt</button><button class="th-btn" data-x="ok">Logg inn</button></div>
        </div>`;
      document.body.appendChild(ov);
      const q = s => ov.querySelector(s);
      const err = q('.th-err'), okBtn = q('[data-x=ok]');
      let mode = initial, busy = false;
      const setMode = m => {
        mode = m; err.textContent = '';
        ov.querySelectorAll('.th-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === m));
        q('[data-pane="login"]').hidden = m !== 'login';
        q('[data-pane="reg"]').hidden = m !== 'reg';
        q('[data-pane="pw"]').hidden = m !== 'pw';
        okBtn.textContent = m === 'login' ? 'Logg inn' : m === 'reg' ? 'Opprett konto' : 'Bytt passord';
        setTimeout(() => (m === 'login' ? q('.thi-tag') : m === 'reg' ? q('.thr-name') : q('.thp-tag')).focus(), 20);
      };
      ov.querySelectorAll('.th-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.t));
      const close = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const submit = async () => {
        if (busy) return; busy = true; err.textContent = ''; okBtn.textContent = '…';
        try {
          let res;
          if (mode === 'pw'){
            const tag = q('.thp-tag').value.trim().toUpperCase(), oldPw = q('.thp-old').value, newPw = q('.thp-new').value;
            if (tag.length !== 4 || !oldPw) throw new Error('Fyll inn kode og nåværende passord');
            if (newPw.length < 4) throw new Error('Nytt passord må ha minst 4 tegn');
            const { error } = await sb.rpc('change_password', { p_tag: tag, p_old: oldPw, p_new: newPw });
            if (error) throw error;
            res = await callLogin(tag, newPw);   // passordbyttet drepte alle sesjoner — logg inn på nytt
            toast('Passord byttet ✓');
          } else if (mode === 'login'){
            const tag = q('.thi-tag').value.trim().toUpperCase(), pw = q('.thi-pw').value;
            if (tag.length !== 4 || !pw) throw new Error('Fyll inn kode og passord');
            res = await callLogin(tag, pw);
          } else {
            const tag = q('.thr-tag').value.trim().toUpperCase(), pw = q('.thr-pw').value;
            const name = q('.thr-name').value.trim(), title = q('.thr-title').value, color = '#004595';
            const invite = q('.thr-inv').value.trim();
            if (tag.length !== 4) throw new Error('Koden må være 4 bokstaver');
            if (pw.length < 4) throw new Error('Passord må ha minst 4 tegn');
            if (!invite) throw new Error('Fyll inn invitasjonskoden (spør butikksjefen)');
            res = await callRegister(tag, name, title, color, pw, invite);
          }
          setSession(res.user, res.token); close(res.user);
        } catch (e) {
          err.textContent = (e && e.message) || 'Noe gikk galt';
          okBtn.textContent = mode === 'login' ? 'Logg inn' : mode === 'reg' ? 'Opprett konto' : 'Bytt passord';
        } finally { busy = false; }
      };
      okBtn.onclick = submit;
      q('[data-x=cancel]').onclick = () => close(null);
      ov.onclick = e => { if (e.target === ov) close(null); };
      const onKey = e => { if (e.key === 'Escape'){ e.stopPropagation(); close(null); } else if (e.key === 'Enter'){ e.preventDefault(); submit(); } };
      document.addEventListener('keydown', onKey);
      setMode(initial);
    });
  }

  async function ensureUser(){ return getUser() || await authModal('login'); }

  /* manager+/role-gated RPC — injects the logged-in account's session token */
  async function rpcAuth(fn, args = {}){
    let s = getSession();
    if (!s){ const u = await ensureUser(); if (!u) throw new Error('no-auth'); s = getSession(); }
    const { data, error } = await sb.rpc(fn, { p_auth_tag: s.user.tag, p_auth_pw: s.token, ...args });
    if (error) throw error;
    return data;
  }

  injectCss();   // tokens + .th-ic må finnes før sidene rendrer ikoner (før første toast/modal)

  return { SB_URL, SB_KEY, sb, esc, toast, TITLES, icon,
           getUser, role, level, canManage, isDev, clearSession,
           authModal, ensureUser, rpcAuth };
})();
