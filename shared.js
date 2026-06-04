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

  /* ---------- session ---------- */
  function getSession(){ try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
  function setSession(user, pw){ sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, pw })); }
  function clearSession(){ sessionStorage.removeItem(SESSION_KEY); }
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
      .th-toast-wrap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:99999;align-items:center;pointer-events:none;}
      .th-toast{background:#11151b;color:#f1f4f8;border:1px solid #2a323d;border-left:3px solid #2684e6;border-radius:12px;padding:10px 14px;font:500 14px/1.3 system-ui;box-shadow:0 10px 34px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px;pointer-events:auto;max-width:90vw;}
      .th-ov{position:fixed;inset:0;background:rgba(6,9,13,.66);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;}
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
    if (!toastWrap){ toastWrap = document.createElement('div'); toastWrap.className = 'th-toast-wrap'; document.body.appendChild(toastWrap); }
    const t = document.createElement('div'); t.className = 'th-toast'; t.append(msg);
    toastWrap.appendChild(t); setTimeout(() => t.remove(), opts.ms || 3500); return t;
  }

  /* ---------- auth ---------- */
  async function callLogin(tag, pw){
    const { data, error } = await sb.rpc('login_account', { p_tag: tag, p_password: pw });
    if (error) throw error; return Array.isArray(data) ? data[0] : data;
  }
  async function callRegister(tag, name, title, color, pw){
    const { data, error } = await sb.rpc('register_account', { p_tag: tag, p_name: name, p_title: title, p_color: color, p_password: pw });
    if (error) throw error; return Array.isArray(data) ? data[0] : data;
  }

  function authModal(initial = 'login'){
    return new Promise(resolve => {
      injectCss();
      const ov = document.createElement('div'); ov.className = 'th-ov';
      ov.innerHTML = `
        <div class="th-dialog" role="dialog" aria-modal="true">
          <div class="th-tabs"><button data-t="login">Logg inn</button><button data-t="reg">Ny konto</button></div>
          <div data-pane="login">
            <div class="th-f"><label>Ansattkode (4 bokstaver)</label><input class="thi-tag" maxlength="4" autocomplete="username" placeholder="MORT" style="text-transform:uppercase"></div>
            <div class="th-f"><label>Passord</label><input class="thi-pw" type="password" autocomplete="current-password" placeholder="••••"></div>
          </div>
          <div data-pane="reg" hidden>
            <div class="th-f"><label>Fullt navn</label><input class="thr-name" placeholder="Ola Nordmann"></div>
            <div class="th-f"><label>Ansattkode (4 bokstaver)</label><input class="thr-tag" maxlength="4" placeholder="OLAN" style="text-transform:uppercase"></div>
            <div class="th-f"><label>Stillingstittel</label><select class="thr-title">${TITLES.map(t=>`<option ${t==='Butikkmedarbeider'?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="th-f"><label>Passord (min. 4 tegn)</label><input class="thr-pw" type="password" autocomplete="new-password" placeholder="••••"></div>
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
        okBtn.textContent = m === 'login' ? 'Logg inn' : 'Opprett konto';
        setTimeout(() => (m === 'login' ? q('.thi-tag') : q('.thr-name')).focus(), 20);
      };
      ov.querySelectorAll('.th-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.t));
      const close = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const submit = async () => {
        if (busy) return; busy = true; err.textContent = ''; okBtn.textContent = '…';
        try {
          let user, pw;
          if (mode === 'login'){
            const tag = q('.thi-tag').value.trim().toUpperCase(); pw = q('.thi-pw').value;
            if (tag.length !== 4 || !pw) throw new Error('Fyll inn kode og passord');
            user = await callLogin(tag, pw);
          } else {
            const tag = q('.thr-tag').value.trim().toUpperCase(); pw = q('.thr-pw').value;
            const name = q('.thr-name').value.trim(), title = q('.thr-title').value, color = '#004595';
            if (tag.length !== 4) throw new Error('Koden må være 4 bokstaver');
            if (pw.length < 4) throw new Error('Passord må ha minst 4 tegn');
            user = await callRegister(tag, name, title, color, pw);
          }
          setSession(user, pw); close(user);
        } catch (e) {
          err.textContent = (e && e.message) || 'Noe gikk galt'; okBtn.textContent = mode === 'login' ? 'Logg inn' : 'Opprett konto';
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

  /* manager+/role-gated RPC — injects the logged-in account's credentials */
  async function rpcAuth(fn, args = {}){
    let s = getSession();
    if (!s){ const u = await ensureUser(); if (!u) throw new Error('no-auth'); s = getSession(); }
    const { data, error } = await sb.rpc(fn, { p_auth_tag: s.user.tag, p_auth_pw: s.pw, ...args });
    if (error) throw error;
    return data;
  }

  return { SB_URL, SB_KEY, sb, esc, toast, TITLES,
           getUser, role, level, canManage, isDev, clearSession,
           authModal, ensureUser, rpcAuth };
})();
