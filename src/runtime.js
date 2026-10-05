/* Мінімальний рушій шаблонів: {{ дотований.шлях }}, <sc-for>, <sc-if>, події onClick/onInput, патчинг DOM без втрати фокусу */
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); schedule(); }
  forceUpdate() { schedule(); }
}
let logic, pending = false;
function schedule() { if (pending || !logic) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); }
function look(path, scope) {
  path = path.trim();
  if (path === 'true') return true; if (path === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  const parts = path.split('.'); let v = scope[parts[0]];
  for (let i = 1; i < parts.length; i++) v = v == null ? undefined : v[parts[i]];
  return v;
}
const RE = /\{\{([^}]*)\}\}/g;
function interp(str, scope) { return str.replace(RE, (m, p) => { const v = look(p, scope); return v == null ? '' : String(v); }); }
function holeOf(v) { const m = v.match(/\{\{([^}]*)\}\}/); return m ? m[1] : ''; }
function build(node, scope, out) {
  if (node.nodeType === 3) { out.push(document.createTextNode(node.data.indexOf('{{') >= 0 ? interp(node.data, scope) : node.data)); return; }
  if (node.nodeType !== 1) return;
  const tag = node.nodeName.toLowerCase();
  if (tag === 'sc-for') {
    const list = look(holeOf(node.getAttribute('list')), scope) || [], as = node.getAttribute('as');
    list.forEach((it, i) => { const s = Object.create(scope); s[as] = it; s.$index = i; node.childNodes.forEach((c) => build(c, s, out)); });
    return;
  }
  if (tag === 'sc-if') { if (look(holeOf(node.getAttribute('value')), scope)) node.childNodes.forEach((c) => build(c, scope, out)); return; }
  const el = document.createElement(tag), P = {};
  for (const a of node.attributes) {
    const n = a.name; if (n.indexOf('hint-') === 0) continue;
    const whole = a.value.match(/^\s*\{\{([^}]*)\}\}\s*$/);
    const v = whole ? look(whole[1], scope) : (a.value.indexOf('{{') >= 0 ? interp(a.value, scope) : a.value);
    if (n.indexOf('on') === 0 && whole) { P[n] = v; continue; }
    if (n === 'value' && (tag === 'textarea' || tag === 'input')) { P.value = v == null ? '' : String(v); continue; }
    if (n === 'disabled') { P.disabled = !!v; continue; }
    if (v === false || v == null) continue;
    el.setAttribute(n, v === true ? '' : String(v));
  }
  el.__p = P; applyP(el, P);
  const kids = []; node.childNodes.forEach((c) => build(c, scope, kids)); kids.forEach((k) => el.appendChild(k));
  out.push(el);
}
function applyP(el, P) {
  for (const k in P) {
    if (k === 'value') { if (el.value !== P.value) el.value = P.value; }
    else if (k === 'disabled') el.disabled = P.disabled;
    else el[k] = P[k];
  }
}
function sync(o, n) {
  for (const a of Array.from(o.attributes)) if (!n.hasAttribute(a.name) && !(a.name === 'open' && o.nodeName === 'DETAILS')) o.removeAttribute(a.name);
  for (const a of Array.from(n.attributes)) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  o.__p = n.__p; applyP(o, n.__p || {});
}
function patch(parent, list) {
  const old = Array.from(parent.childNodes);
  list.forEach((n, i) => {
    const o = old[i];
    if (!o) { parent.appendChild(n); return; }
    if (o.nodeType !== n.nodeType || (n.nodeType === 1 && o.nodeName !== n.nodeName)) { parent.replaceChild(n, o); return; }
    if (n.nodeType === 3) { if (o.data !== n.data) o.data = n.data; return; }
    sync(o, n); patch(o, Array.from(n.childNodes));
  });
  for (let i = list.length; i < old.length; i++) parent.removeChild(old[i]);
}
function render() {
  const vals = logic.renderVals(), out = [];
  document.getElementById('tpl').content.childNodes.forEach((c) => build(c, vals, out));
  patch(document.getElementById('app'), out);
}
