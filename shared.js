/* Thansen Verktøykasse — delt konfig + hjelpere.
   Lastes ETTER supabase-js på sider som trenger backend. */
window.THelper = (function () {
  const SB_URL = 'https://tfjvgvrqngevsiuueixf.supabase.co';
  const SB_KEY = 'sb_publishable_O-gjCbc7E1pX-I0o9DawbQ_xbnV6uJY';
  const sb = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SB_URL, SB_KEY)
    : null;

  const PASS_KEY = 'thelper.pass';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- felles CSS (toast + passord-modal) ---
  function injectCss() {
    if (document.getElementById('th-shared-css')) return;
    const st = document.createElement('style');
    st.id = 'th-shared-css';
    st.textContent = `
      .th-toast-wrap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);
        display:flex;flex-direction:column;gap:8px;z-index:9999;align-items:center;pointer-events:none;}
      .th-toast{background:#11151b;color:#f1f4f8;border:1px solid #2a323d;border-radius:12px;
        padding:10px 14px;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 10px 34px rgba(0,0,0,.5);
        display:flex;align-items:center;gap:12px;pointer-events:auto;max-width:90vw;
        border-left:3px solid #2684e6;}
      .th-toast-btn{background:#2684e6;color:#fff;border:0;border-radius:8px;padding:5px 10px;
        font:600 13px system-ui;cursor:pointer;}
      .th-ov{position:fixed;inset:0;background:rgba(6,9,13,.62);backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;}
      .th-dialog{background:#161b22;border:1px solid #2a323d;border-radius:18px;padding:20px;
        width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,.55);
        border-top:3px solid #2684e6;color:#f1f4f8;font:400 15px/1.5 system-ui,sans-serif;}
      .th-dialog h3{margin:2px 0 6px;font-size:18px;}
      .th-dialog p{margin:0 0 14px;color:#97a3b2;font-size:14px;}
      .th-pass{width:100%;background:#0f1318;color:#f1f4f8;border:1px solid #2a323d;border-radius:10px;
        padding:11px 12px;font-size:16px;letter-spacing:.06em;}
      .th-pass:focus{outline:none;border-color:#2684e6;}
      .th-err{color:#ff9b9b;font-size:13px;margin-top:8px;}
      .th-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
      .th-btn{background:#2684e6;color:#fff;border:0;border-radius:10px;padding:10px 16px;
        font:600 15px system-ui;cursor:pointer;}
      .th-btn.ghost{background:transparent;border:1px solid #2a323d;color:#f1f4f8;}`;
    document.head.appendChild(st);
  }

  // --- toast ---
  let toastWrap;
  function toast(msg, opts = {}) {
    injectCss();
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'th-toast-wrap';
      document.body.appendChild(toastWrap);
    }
    const t = document.createElement('div');
    t.className = 'th-toast';
    t.append(msg);
    if (opts.action) {
      const b = document.createElement('button');
      b.className = 'th-toast-btn';
      b.textContent = opts.action;
      b.onclick = () => { try { opts.onAction && opts.onAction(); } finally { t.remove(); } };
      t.appendChild(b);
    }
    toastWrap.appendChild(t);
    setTimeout(() => t.remove(), opts.ms || 3500);
    return t;
  }

  // --- passord-styrte skrivinger (samme modell som sykkel-verktøyet) ---
  const getPass = () => sessionStorage.getItem(PASS_KEY) || '';
  const setPass = p => sessionStorage.setItem(PASS_KEY, p);
  const clearPass = () => sessionStorage.removeItem(PASS_KEY);

  async function verifyPass(p) {
    if (!sb) return false;
    try {
      const { data, error } = await sb.rpc('verify_passcode', { p_passcode: p });
      if (error) throw error;
      return !!data;
    } catch (e) { return false; }
  }

  // Maskert modal i stedet for prompt() — passord vises aldri i klartekst.
  function passcodeModal() {
    return new Promise(resolve => {
      injectCss();
      const ov = document.createElement('div');
      ov.className = 'th-ov';
      ov.innerHTML = `
        <div class="th-dialog" role="dialog" aria-modal="true">
          <h3>Lås opp redigering</h3>
          <p>Skriv inn passordet for å gjøre endringer.</p>
          <input type="password" class="th-pass" autocomplete="current-password" placeholder="Passord">
          <div class="th-err" style="display:none">Feil passord</div>
          <div class="th-row">
            <button class="th-btn ghost" data-x="cancel">Avbryt</button>
            <button class="th-btn" data-x="ok">Lås opp</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const input = ov.querySelector('.th-pass');
      const err   = ov.querySelector('.th-err');
      const okBtn = ov.querySelector('[data-x=ok]');
      let busy = false;
      const close = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const submit = async () => {
        if (busy) return;
        const v = input.value;
        if (!v) { input.focus(); return; }
        busy = true; okBtn.textContent = '…';
        const valid = await verifyPass(v);
        busy = false; okBtn.textContent = 'Lås opp';
        if (valid) { setPass(v); close(v); }
        else { err.style.display = 'block'; input.select(); input.focus(); }
      };
      okBtn.onclick = submit;
      ov.querySelector('[data-x=cancel]').onclick = () => close(null);
      ov.onclick = e => { if (e.target === ov) close(null); };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        else if (e.key === 'Enter') { e.preventDefault(); submit(); }
      };
      document.addEventListener('keydown', onKey);
      setTimeout(() => input.focus(), 30);
    });
  }

  async function ensurePass() {
    const p = getPass();
    if (p) return p;
    return await passcodeModal();   // verifiserer + lagrer ved suksess, ellers null
  }

  // Kall en passord-styrt RPC. Kaster 'no-pass' hvis brukeren avbryter.
  async function rpc(fn, args = {}) {
    const p = await ensurePass();
    if (!p) throw new Error('no-pass');
    const { data, error } = await sb.rpc(fn, { p_passcode: p, ...args });
    if (error) {
      if (/passcode|passord/i.test(error.message || '')) clearPass();  // rotert midt i økt
      throw error;
    }
    return data;
  }

  return { SB_URL, SB_KEY, sb, esc, toast, getPass, setPass, clearPass, verifyPass, ensurePass, rpc };
})();
