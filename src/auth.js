// Облікові записи й синхронізація прогресу (Supabase Auth + таблиця progress).
// Працює лише з публічним ключем anon; доступ до рядків обмежує RLS на сервері (див. supabase/setup.sql).
// Без налаштованого сервісу курс працює як раніше — з прогресом у браузері.
const AUTH_KEY = 'ai-academy-auth', SYNC_KEY = 'ai-academy-sync';
const OBJ_KEYS = ['done', 'ans', 'miss', 'rub', 'notes', 'proj', 'fav'];

Object.assign(Component.prototype, {
  authOn() { return !!(AUTH_CFG && AUTH_CFG.supabaseUrl && AUTH_CFG.supabaseAnonKey); },
  _base() { return AUTH_CFG.supabaseUrl.replace(/\/+$/, ''); },
  _ls(k, v) {
    try { if (v === undefined) { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    return null;
  },

  async _api(path, opt) {
    opt = opt || {};
    const h = Object.assign({ apikey: AUTH_CFG.supabaseAnonKey, 'Content-Type': 'application/json' }, opt.headers || {});
    if (opt.token) h.Authorization = 'Bearer ' + opt.token; else h.Authorization = 'Bearer ' + AUTH_CFG.supabaseAnonKey;
    let r;
    try { r = await fetch(this._base() + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive }); }
    catch (e) { const er = new Error('network'); er.code = 'network'; throw er; }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const er = new Error((j && (j.msg || j.message || j.error_description)) || 'http ' + r.status); er.code = (j && (j.error_code || j.code)) || String(r.status); er.status = r.status; throw er; }
    return j;
  },

  authError(e) {
    const c = (e && e.code) || '', m = ((e && e.message) || '').toLowerCase();
    if (c === 'network') return 'Немає з’єднання з сервером. Перевірте інтернет і спробуйте ще раз.';
    if (c === 'invalid_credentials' || m.indexOf('invalid login') >= 0) return 'Невірний email або пароль.';
    if (c === 'user_already_exists' || m.indexOf('already registered') >= 0) return 'Цей email уже зареєстровано. Спробуйте увійти або відновіть пароль.';
    if (c === 'weak_password' || m.indexOf('password') >= 0 && m.indexOf('should') >= 0) return 'Пароль занадто простий. Використайте щонайменше 8 символів, краще з літерами й цифрами.';
    if (c === 'email_not_confirmed' || m.indexOf('not confirmed') >= 0) return 'Спершу підтвердьте email: ми надіслали лист із посиланням.';
    if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || e.status === 429) return 'Забагато спроб. Зачекайте кілька хвилин і повторіть.';
    if (c === 'validation_failed' || m.indexOf('valid email') >= 0) return 'Перевірте адресу email.';
    if (c === 'signup_disabled') return 'Реєстрацію тимчасово вимкнено.';
    return 'Щось пішло не так. Спробуйте ще раз трохи згодом.';
  },

  // ---------- сесія ----------
  _setSession(t) {
    const exp = t.expires_at || Math.floor(Date.now() / 1000) + (t.expires_in || 3600);
    const u = t.user || {};
    const prev = this._ls(AUTH_KEY) || {};
    const ses = { access: t.access_token, refresh: t.refresh_token, exp: exp, uid: u.id || prev.uid, email: u.email || prev.email };
    this._ls(AUTH_KEY, ses); this._ses = ses;
    return ses;
  },
  async _token() {
    let s = this._ses || this._ls(AUTH_KEY);
    if (!s) return null;
    this._ses = s;
    if (s.exp - 60 > Date.now() / 1000) return s.access;
    try {
      const t = await this._api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } });
      return this._setSession(t).access;
    } catch (e) {
      if (e.code === 'network') throw e;
      this._ls(AUTH_KEY, null); this._ses = null;
      this.setState({ user: null, sync: 'idle', aMsg: 'Сеанс завершився. Увійдіть ще раз — прогрес на цьому пристрої збережено.', aOk: false });
      return null;
    }
  },

  authInit() {
    if (!this.authOn()) return;
    // повернення з листа підтвердження / відновлення пароля
    let hp = null;
    try { if (/access_token=/.test(location.hash)) hp = new URLSearchParams(location.hash.replace(/^#\/?/, '')); } catch (e) {}
    if (hp && hp.get('access_token')) {
      const type = hp.get('type');
      const s = this._setSession({ access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token'), expires_in: Number(hp.get('expires_in')) || 3600 });
      try { history.replaceState(null, '', location.pathname + location.search + '#/akaunt'); } catch (e) {}
      this._api('/auth/v1/user', { token: s.access }).then((u) => {
        this._setSession({ access_token: s.access, refresh_token: s.refresh, expires_at: s.exp, user: u });
        this.setState({ user: u.email, view: 'account', authMode: type === 'recovery' ? 'newpass' : 'login', aMsg: type === 'recovery' ? 'Введіть новий пароль.' : 'Email підтверджено. Ласкаво просимо!', aOk: true });
        if (type !== 'recovery') this.pullAndMerge();
      }).catch(() => {});
      return;
    }
    const s = this._ls(AUTH_KEY);
    if (s && s.refresh) { this._ses = s; this.setState({ user: s.email || '…' }); this.pullAndMerge(); }
  },

  // ---------- дії ----------
  async signUp() {
    const { aEmail: em, aPass: pw } = this.state;
    const bad = this.validAuth(em, pw, true); if (bad) return this.setState({ aMsg: bad, aOk: false });
    this.setState({ aBusy: true, aMsg: '' });
    try {
      const r = await this._api('/auth/v1/signup', { method: 'POST', body: { email: em.trim(), password: pw, data: {} } });
      if (r && r.user && Array.isArray(r.user.identities) && r.user.identities.length === 0) throw Object.assign(new Error('registered'), { code: 'user_already_exists' });
      if (r && r.access_token) { this._setSession(r); this.setState({ aBusy: false, user: em.trim(), aPass: '', aMsg: '', view: 'progress' }); this.syncHash(); await this.pullAndMerge(); return; }
      this.setState({ aBusy: false, aPass: '', aMsg: 'Майже готово! Ми надіслали лист на ' + em.trim() + ' — натисніть посилання в ньому, щоб підтвердити email, і потім увійдіть.', aOk: true, authMode: 'login' });
    } catch (e) { this.setState({ aBusy: false, aMsg: this.authError(e), aOk: false }); }
  },
  async signIn() {
    const { aEmail: em, aPass: pw } = this.state;
    const bad = this.validAuth(em, pw, false); if (bad) return this.setState({ aMsg: bad, aOk: false });
    this.setState({ aBusy: true, aMsg: '' });
    try {
      const t = await this._api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: em.trim(), password: pw } });
      this._setSession(t);
      this.setState({ aBusy: false, user: em.trim(), aPass: '', aMsg: '' });
      await this.pullAndMerge();
      this.go('progress');
    } catch (e) { this.setState({ aBusy: false, aMsg: this.authError(e), aOk: false }); }
  },
  async resetPass() {
    const em = (this.state.aEmail || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return this.setState({ aMsg: 'Введіть адресу email, на яку надіслати лист.', aOk: false });
    this.setState({ aBusy: true, aMsg: '' });
    try {
      await this._api('/auth/v1/recover', { method: 'POST', body: { email: em } });
      this.setState({ aBusy: false, aMsg: 'Якщо такий акаунт є, лист для відновлення пароля вже в дорозі. Перевірте пошту (і теку «Спам»).', aOk: true, authMode: 'login' });
    } catch (e) { this.setState({ aBusy: false, aMsg: this.authError(e), aOk: false }); }
  },
  async setNewPass() {
    const pw = this.state.aPass;
    if (!pw || pw.length < 8) return this.setState({ aMsg: 'Пароль має містити щонайменше 8 символів.', aOk: false });
    this.setState({ aBusy: true, aMsg: '' });
    try {
      const tk = await this._token();
      await this._api('/auth/v1/user', { method: 'PUT', token: tk, body: { password: pw } });
      this.setState({ aBusy: false, aPass: '', aMsg: 'Пароль змінено.', aOk: true, authMode: 'login' });
    } catch (e) { this.setState({ aBusy: false, aMsg: this.authError(e), aOk: false }); }
  },
  async signOut() {
    this.setState({ aBusy: true, aMsg: '' });
    try { if (this._dirty()) await this.push(true); } catch (e) {}
    if (this._dirty()) { this.setState({ aBusy: false, aMsg: 'Не вдалося зберегти останні зміни на сервері. Перевірте інтернет і спробуйте ще раз, щоб нічого не втратити.', aOk: false }); return; }
    try { const tk = this._ses && this._ses.access; if (tk) this._api('/auth/v1/logout', { method: 'POST', token: tk }).catch(() => {}); } catch (e) {}
    this._ls(AUTH_KEY, null); this._ls(SYNC_KEY, null); this._ses = null;
    // очищаємо локальний прогрес, щоб наступна людина на цьому пристрої не бачила чужих даних
    try { localStorage.removeItem('ai-academy-v2'); } catch (e) {}
    const fresh = new Component({}).state;
    const keep = {}; this.PERSIST.forEach((k) => { keep[k] = fresh[k]; }); keep.dark = this.state.dark;
    this.setState(Object.assign(keep, { user: null, sync: 'idle', aBusy: false, aPass: '', aMsg: 'Ви вийшли. Прогрес збережено в обліковому записі.', aOk: true, authMode: 'login' }));
    this.save({ dark: keep.dark });
    this._ls(SYNC_KEY, null);
  },
  validAuth(em, pw, reg) {
    if (!/^\S+@\S+\.\S+$/.test((em || '').trim())) return 'Введіть коректну адресу email, наприклад name@example.com.';
    if (!pw) return 'Введіть пароль.';
    if (reg && pw.length < 8) return 'Пароль має містити щонайменше 8 символів.';
    return '';
  },

  // ---------- синхронізація ----------
  _dirty() { const m = this._ls(SYNC_KEY); return !!(m && m.dirty); },
  _snapshot() { const o = {}; this.PERSIST.forEach((k) => { o[k] = this.state[k]; }); return o; },
  markDirty() {
    if (!this._ses && !this._ls(AUTH_KEY)) return;
    const m = this._ls(SYNC_KEY) || {}; m.dirty = true; this._ls(SYNC_KEY, m);
    this.setState({ sync: 'saving' });
    clearTimeout(this._tm); this._tm = setTimeout(() => { this.push().catch(() => {}); }, 1200);
  },
  async push(keepalive) {
    if (this._pushing) { this._again = true; return; }
    this._pushing = true;
    try {
      const tk = await this._token(); if (!tk) return;
      const s = this._ses;
      const r = await this._api('/rest/v1/progress?on_conflict=user_id', { method: 'POST', token: tk, keepalive: !!keepalive, headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: { user_id: s.uid, data: this._snapshot(), updated_at: new Date().toISOString() } });
      const row = Array.isArray(r) ? r[0] : r;
      this._ls(SYNC_KEY, { at: row && row.updated_at, dirty: false });
      this.setState({ sync: 'saved' });
    } catch (e) {
      this.setState({ sync: e.code === 'network' ? 'offline' : 'error' });
      throw e;
    } finally {
      this._pushing = false;
      if (this._again) { this._again = false; this.push().catch(() => {}); }
    }
  },
  _merge(server, local) {
    const out = {};
    this.PERSIST.forEach((k) => {
      const a = server[k], b = local[k];
      if (OBJ_KEYS.indexOf(k) >= 0) out[k] = Object.assign({}, a && typeof a === 'object' ? a : {}, b && typeof b === 'object' ? b : {});
      else if (k === 'exBest') out[k] = Math.max(Number(a) || 0, Number(b) || 0);
      else if (k === 'name') out[k] = (b && String(b).trim()) ? b : (a || '');
      else if (k === 'dark') out[k] = b !== undefined ? b : a;
      else out[k] = a !== undefined && a !== null ? a : b;
    });
    return out;
  },
  async pullAndMerge() {
    try {
      const tk = await this._token(); if (!tk) return;
      const s = this._ses;
      this.setState({ sync: 'saving' });
      const rows = await this._api('/rest/v1/progress?select=data,updated_at&user_id=eq.' + encodeURIComponent(s.uid), { token: tk });
      const row = rows && rows[0], meta = this._ls(SYNC_KEY) || {};
      if (!row) { await this.push(); return; }
      const sd = row.data || {};
      if (meta.dirty || !meta.at) {
        // є локальні зміни (або це перший вхід на пристрої): об’єднуємо, нічого не втрачаючи
        const merged = this._merge(sd, this._snapshot());
        this.setState(merged); this.persistLocal();
        await this.push();
      } else if (row.updated_at && row.updated_at !== meta.at) {
        const patch = {}; this.PERSIST.forEach((k) => { if (sd[k] !== undefined && typeof sd[k] === typeof this.state[k]) patch[k] = sd[k]; });
        this.setState(patch); this.persistLocal();
        this._ls(SYNC_KEY, { at: row.updated_at, dirty: false });
        this.setState({ sync: 'saved' });
      } else this.setState({ sync: 'saved' });
    } catch (e) { this.setState({ sync: e.code === 'network' ? 'offline' : 'error' }); }
  },
  persistLocal() { try { localStorage.setItem('ai-academy-v2', JSON.stringify(this._snapshot())); } catch (e) {} },

  authVals() {
    const s = this.state, mode = s.authMode || 'login', signed = !!s.user, on = this.authOn();
    const st = s.sync || 'idle';
    const syncText = { idle: 'Прогрес зберігається у вашому акаунті.', saving: 'Зберігаємо…', saved: 'Усе збережено в акаунті.', offline: 'Немає з’єднання. Зміни збережено на пристрої й синхронізуються, щойно з’явиться інтернет.', error: 'Не вдалося синхронізувати. Зміни збережено на пристрої; спробуємо ще раз.' }[st];
    const titles = { login: 'Вхід в акаунт', register: 'Створення акаунта', reset: 'Відновлення пароля', newpass: 'Новий пароль' };
    const submit = { login: () => this.signIn(), register: () => this.signUp(), reset: () => this.resetPass(), newpass: () => this.setNewPass() }[mode];
    const setMode = (m) => () => this.setState({ authMode: m, aMsg: '', aPass: '' });
    return {
      enabled: on, signed: signed, signedCard: signed && mode !== 'newpass', signedOut: !signed && mode !== 'newpass', off: !on, email: s.user || '',
      initial: (s.user || '?').charAt(0).toUpperCase(),
      headLabel: signed ? 'Акаунт' : 'Увійти',
      headIcon: I('user'),
      open: () => this.go('account'),
      title: titles[mode], mode: mode,
      isLogin: mode === 'login', isRegister: mode === 'register', isReset: mode === 'reset', isNewpass: mode === 'newpass',
      showEmail: mode !== 'newpass', showPass: mode !== 'reset',
      passAuto: mode === 'login' ? 'current-password' : 'new-password',
      passHint: mode === 'login' ? '' : 'Щонайменше 8 символів.',
      submitLabel: s.aBusy ? 'Зачекайте…' : { login: 'Увійти', register: 'Зареєструватися', reset: 'Надіслати лист', newpass: 'Зберегти пароль' }[mode],
      busy: !!s.aBusy, email_: s.aEmail || '', pass: s.aPass || '',
      onEmail: (e) => this.setState({ aEmail: e.target.value }), onPass: (e) => this.setState({ aPass: e.target.value }),
      submit: (e) => { if (e && e.preventDefault) e.preventDefault(); if (!s.aBusy) submit(); },
      toLogin: setMode('login'), toRegister: setMode('register'), toReset: setMode('reset'),
      hasMsg: !!s.aMsg, msg: s.aMsg || '', msgCls: s.aOk ? 'alert ok' : 'alert err', msgIcon: s.aOk ? I('checkCircle') : I('alert'),
      syncText: syncText, syncCls: 'alert ' + (st === 'error' || st === 'offline' ? 'warn' : st === 'saved' ? 'ok' : 'info'),
      signOut: () => this.signOut(),
      syncNow: () => { this.pullAndMerge(); },
      localNote: !signed && on
    };
  }
});
