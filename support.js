// A small stand-in for the design canvas runtime, so each .dc.html prototype runs on its own page.
(function () {
  var style = document.createElement('style');
  style.textContent = 'x-dc{display:none}html,body{height:100%}body{background:#1e1e2e;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow:hidden}' +
    '#dc-cap{color:#cdd6f4;font:600 15px Roboto,system-ui,sans-serif;padding:10px 0 8px;letter-spacing:.02em}#dc-stage{transform-origin:top center;box-shadow:0 10px 40px rgba(0,0,0,.45);border-radius:18px;overflow:hidden}';
  document.head.appendChild(style);

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (partial, cb) {
    this.state = Object.assign({}, this.state, typeof partial === 'function' ? partial(this.state) : partial);
    render();
    if (cb) { cb(); }
  };
  DCLogic.prototype.forceUpdate = function () { render(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var tpl, comp, stage, counter;

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') { return true; }
    if (path === 'false') { return false; }
    if (/^-?\d+(\.\d+)?$/.test(path)) { return Number(path); }
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) {
        var v = scopes[i][parts[0]];
        for (var j = 1; j < parts.length; j++) { v = v == null ? v : v[parts[j]]; }
        return v;
      }
    }
    return undefined;
  }
  function interp(text, scopes) {
    return text.replace(HOLE, function (_, p) { var v = lookup(p, scopes); return v == null ? '' : String(v); });
  }

  function renderInto(parent, nodes, scopes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { parent.appendChild(document.createTextNode(interp(n.nodeValue, scopes))); continue; }
      if (n.nodeType !== 1) { continue; }
      var tag = n.localName;
      if (tag === 'sc-for') {
        var m = WHOLE.exec(n.getAttribute('list') || '');
        var list = m ? lookup(m[1], scopes) : [];
        var as = n.getAttribute('as') || 'item';
        (list || []).forEach(function (item, idx) {
          var s = {}; s[as] = item; s.$index = idx;
          renderInto(parent, n.childNodes, scopes.concat([s]));
        });
        continue;
      }
      if (tag === 'sc-if') {
        var mv = WHOLE.exec(n.getAttribute('value') || '');
        if (mv && lookup(mv[1], scopes)) { renderInto(parent, n.childNodes, scopes); }
        continue;
      }
      var el = n.namespaceURI === 'http://www.w3.org/2000/svg'
        ? document.createElementNS(n.namespaceURI, tag)
        : document.createElement(tag);
      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a];
        var name = at.name;
        var whole = WHOLE.exec(at.value);
        if (/^on[a-z]+$/.test(name)) {
          var fn = whole ? lookup(whole[1], scopes) : null;
          if (typeof fn === 'function') {
            var ev = name.slice(2);
            if (ev === 'change' && (tag === 'textarea' || tag === 'input')) { ev = 'input'; }
            el.addEventListener(ev, (function (f) { return function (e) { f(e); }; })(fn));
          }
          continue;
        }
        if (name === 'defaultvalue') { el.value = interp(at.value, scopes); continue; }
        if (name === 'value' && tag === 'textarea') { el.value = interp(at.value, scopes); continue; }
        el.setAttribute(name, interp(at.value, scopes));
      }
      el.setAttribute('data-dc-path', String(counter++));
      renderInto(el, n.childNodes, scopes);
      if (tag === 'textarea') { var tv = n.getAttribute('value'); if (tv) { el.value = interp(tv, scopes); } }
      parent.appendChild(el);
    }
  }

  function render() {
    var active = document.activeElement;
    var path = active && active.getAttribute && active.getAttribute('data-dc-path');
    var sel = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    var scrolls = {};
    stage.querySelectorAll('[data-dc-path]').forEach(function (e) { if (e.scrollTop) { scrolls[e.getAttribute('data-dc-path')] = e.scrollTop; } });
    counter = 0;
    var frag = document.createDocumentFragment();
    renderInto(frag, tpl.content.childNodes, [comp.renderVals()]);
    stage.innerHTML = '';
    stage.appendChild(frag);
    Object.keys(scrolls).forEach(function (k) { var e = stage.querySelector('[data-dc-path="' + k + '"]'); if (e) { e.scrollTop = scrolls[k]; } });
    if (path) {
      var again = stage.querySelector('[data-dc-path="' + path + '"]');
      if (again) { again.focus(); if (sel !== null && again.setSelectionRange) { again.setSelectionRange(sel, sel); } }
    }
  }

  function fit() {
    var scale = Math.min(1.6, (window.innerHeight - 44) / 844);
    stage.style.transform = 'scale(' + scale + ')';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var xdc = document.querySelector('x-dc');
    var helmet = xdc.querySelector('helmet');
    if (helmet) { Array.prototype.slice.call(helmet.children).forEach(function (c) { document.head.appendChild(c); }); helmet.remove(); }
    tpl = document.createElement('template');
    tpl.innerHTML = xdc.innerHTML;
    xdc.remove();
    var code = document.querySelector('script[data-dc-script]').textContent;
    var Component = new Function('DCLogic', code + '\n;return Component;')(DCLogic);
    comp = new Component({});
    var cap = document.createElement('div');
    cap.id = 'dc-cap';
    cap.textContent = document.title;
    stage = document.createElement('div');
    stage.id = 'dc-stage';
    document.body.appendChild(cap);
    document.body.appendChild(stage);
    render();
    fit();
    window.addEventListener('resize', fit);
  });
})();
