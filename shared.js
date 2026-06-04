/* Thansen Helper — shared config + helpers.
   Load AFTER the supabase-js CDN script on pages that need the backend. */
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

  // --- toast ---
  let toastWrap;
  function injectToastCss() {
    if (document.getElementById('th-toast-css')) return;
    const st = document.createElement('style');
    st.id = 'th-toast-css';
    st.textContent = `
      .th-toast-wrap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);
        display:flex;flex-direction:column;gap:8px;z-index:9999;align-items:center;pointer-events:none;}
      .th-toast{background:#1c1f26;color:#f3f4f6;border:1px solid #313743;border-radius:12px;
        padding:10px 14px;font:500 14px/1.3 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45);
        display:flex;align-items:center;gap:12px;pointer-events:auto;max-width:90vw;}
      .th-toast-btn{background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:5px 10px;
        font:600 13px system-ui;cursor:pointer;}`;
    document.head.appendChild(st);
  }
  function toast(msg, opts = {}) {
    injectToastCss();
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

  // --- passcode-gated writes (same model as the bikes tool) ---
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

  async function ensurePass() {
    let p = getPass();
    if (p) return p;
    p = prompt('Enter passcode to make changes:');
    if (!p) return null;
    if (!(await verifyPass(p))) { toast('Wrong passcode'); return null; }
    setPass(p);
    return p;
  }

  // Call a passcode-gated RPC. Throws 'no-pass' if the user cancels the prompt.
  async function rpc(fn, args = {}) {
    const p = await ensurePass();
    if (!p) throw new Error('no-pass');
    const { data, error } = await sb.rpc(fn, { p_passcode: p, ...args });
    if (error) {
      // passcode may have rotated mid-session — clear so the next call re-prompts
      if (/passcode/i.test(error.message || '')) clearPass();
      throw error;
    }
    return data;
  }

  return { SB_URL, SB_KEY, sb, esc, toast, getPass, setPass, clearPass, verifyPass, ensurePass, rpc };
})();
