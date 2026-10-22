(function () {
  'use strict';

  var STORAGE_KEY = 'dof-calculator-v1';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var $ = function (sel) { return document.querySelector(sel); };

  var state = {
    model: emptyModel(),
    drivers: '',
    exampleId: '',
    numeric: { n: '3', PL: '4', PH: '0', localDof: '0', virtual: '0', drivers: '' }
  };
  var lastAnalysis = null;

  function emptyModel() {
    return {
      links: [{ id: 'L0', name: '机架', ground: true, localDof: 0, redundant: false }],
      joints: []
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'className') node.className = attrs[k];
        else if (k in node && typeof attrs[k] !== 'string') node[k] = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function svg(tag, attrs, text) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function nextId(prefix, list) {
    var max = 0;
    list.forEach(function (item) {
      var m = String(item.id).match(/(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return prefix + (max + 1);
  }

  function linkName(id) {
    var l = state.model.links.find(function (x) { return x.id === id; });
    return l ? (l.name || l.id) : id;
  }

  /* ---------- 持久化 ---------- */

  function normalizeModel(m) {
    if (!m || !Array.isArray(m.links) || !Array.isArray(m.joints)) {
      throw new Error('文件格式不对：需要包含 links 和 joints 数组。');
    }
    var links = m.links.map(function (l, i) {
      var ld = Number(l.localDof);
      return {
        id: String(l.id != null ? l.id : 'L' + i),
        name: String(l.name != null ? l.name : ''),
        ground: !!l.ground,
        localDof: isFinite(ld) && ld > 0 ? Math.floor(ld) : 0,
        redundant: !!l.redundant
      };
    });
    var joints = m.joints.map(function (j, i) {
      var type = ['R', 'P', 'H'].indexOf(j.type) !== -1 ? j.type : 'R';
      var out = {
        id: String(j.id != null ? j.id : 'J' + (i + 1)),
        name: String(j.name != null ? j.name : ''),
        type: type,
        links: Array.isArray(j.links) ? j.links.map(String) : [],
        redundant: !!j.redundant
      };
      if (type === 'H') out.hType = DOF.H_TYPES[j.hType] ? j.hType : 'other';
      return out;
    });
    return { links: links, joints: joints };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      state.model = normalizeModel(s.model);
      state.drivers = s.drivers || '';
      state.exampleId = s.exampleId || '';
      if (s.numeric) Object.assign(state.numeric, s.numeric);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 构件表 ---------- */

  function renderLinks() {
    var body = $('#links-body');
    body.textContent = '';
    state.model.links.forEach(function (l) {
      var tr = el('tr', { 'data-id': l.id });
      if (l.redundant && !l.ground) tr.className = 'row-excluded';
      tr.appendChild(el('td', { className: 'id-cell', text: l.id }));
      tr.appendChild(el('td', null, [
        el('input', { type: 'text', value: l.name, 'data-field': 'name', placeholder: '构件名称' })
      ]));
      if (l.ground) {
        tr.appendChild(el('td', { colSpan: 2 }, [el('span', { className: 'ground-tag', text: '机架（固定）' })]));
        tr.appendChild(el('td'));
      } else {
        tr.appendChild(el('td', null, [
          el('input', { type: 'number', min: '0', step: '1', value: String(l.localDof || 0), 'data-field': 'localDof' })
        ]));
        tr.appendChild(el('td', null, [
          el('input', { type: 'checkbox', checked: !!l.redundant, 'data-field': 'redundant', title: '勾选后该构件及其运动副不计入' })
        ]));
        tr.appendChild(el('td', null, [
          el('button', { className: 'btn btn-icon', 'data-action': 'delete', title: '删除构件', text: '✕' })
        ]));
      }
      body.appendChild(tr);
    });
  }

  function onLinkEvent(e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    var link = state.model.links.find(function (l) { return l.id === tr.getAttribute('data-id'); });
    if (!link) return;
    var field = e.target.getAttribute('data-field');

    if (e.type === 'click' && e.target.getAttribute('data-action') === 'delete') {
      state.model.links = state.model.links.filter(function (l) { return l !== link; });
      state.model.joints.forEach(function (j) {
        j.links = j.links.filter(function (id) { return id !== link.id; });
      });
      renderAll();
      return;
    }
    if (!field || e.type === 'click') return;

    if (field === 'name') {
      link.name = e.target.value;
      if (e.type === 'change') renderJoints();
    } else if (field === 'localDof') {
      var v = Number(e.target.value);
      link.localDof = isFinite(v) && v > 0 ? Math.floor(v) : 0;
    } else if (field === 'redundant') {
      link.redundant = e.target.checked;
      tr.className = link.redundant ? 'row-excluded' : '';
    }
    update();
  }

  /* ---------- 运动副表 ---------- */

  function linkSelect(joint, index) {
    var sel = el('select', { 'data-field': 'pair', 'data-index': String(index) });
    sel.appendChild(el('option', { value: '', text: '选择构件' }));
    state.model.links.forEach(function (l) {
      var opt = el('option', { value: l.id, text: l.id + ' ' + (l.name || '') });
      if (joint.links[index] === l.id) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function renderJoints() {
    var body = $('#joints-body');
    body.textContent = '';
    var statusById = {};
    if (lastAnalysis) lastAnalysis.details.forEach(function (d) { statusById[d.id] = d.status; });

    state.model.joints.forEach(function (j) {
      var tr = el('tr', { 'data-id': j.id });
      if (j.redundant) tr.className = 'row-excluded';

      tr.appendChild(el('td', null, [
        el('input', { type: 'text', value: j.name, 'data-field': 'name', placeholder: j.id })
      ]));

      var typeSel = el('select', { 'data-field': 'type' });
      Object.keys(DOF.JOINT_TYPES).forEach(function (t) {
        var opt = el('option', { value: t, text: DOF.JOINT_TYPES[t].label });
        if (j.type === t) opt.selected = true;
        typeSel.appendChild(opt);
      });
      var typeCell = el('div', { className: 'type-cell' }, [typeSel]);
      if (j.type === 'H') {
        var hSel = el('select', { 'data-field': 'hType' });
        Object.keys(DOF.H_TYPES).forEach(function (h) {
          var opt = el('option', { value: h, text: DOF.H_TYPES[h] });
          if (j.hType === h) opt.selected = true;
          hSel.appendChild(opt);
        });
        typeCell.appendChild(hSel);
      }
      tr.appendChild(el('td', null, [typeCell]));

      var picker;
      if (j.type === 'R') {
        picker = el('div', { className: 'link-picker' });
        state.model.links.forEach(function (l) {
          var on = j.links.indexOf(l.id) !== -1;
          picker.appendChild(el('label', { className: 'chip' + (on ? ' on' : '') }, [
            el('input', { type: 'checkbox', checked: on, 'data-field': 'member', value: l.id }),
            l.name || l.id
          ]));
        });
      } else {
        picker = el('div', { className: 'pair-picker' }, [linkSelect(j, 0), '—', linkSelect(j, 1)]);
      }
      tr.appendChild(el('td', null, [picker]));

      tr.appendChild(el('td', null, [
        el('input', { type: 'checkbox', checked: !!j.redundant, 'data-field': 'redundant', title: '勾选后该运动副不计入' })
      ]));
      tr.appendChild(el('td', null, [
        el('button', { className: 'btn btn-icon', 'data-action': 'delete', title: '删除运动副', text: '✕' })
      ]));
      if (statusById[j.id] === 'invalid') tr.style.outline = '1px solid var(--danger)';
      body.appendChild(tr);
    });
  }

  function onJointEvent(e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    var joint = state.model.joints.find(function (j) { return j.id === tr.getAttribute('data-id'); });
    if (!joint) return;
    var field = e.target.getAttribute('data-field');

    if (e.type === 'click' && e.target.getAttribute('data-action') === 'delete') {
      state.model.joints = state.model.joints.filter(function (j) { return j !== joint; });
      renderJoints();
      update();
      return;
    }
    if (!field || e.type === 'click') return;
    if (field === 'name' && e.type === 'input') {
      joint.name = e.target.value;
      update();
      return;
    }
    if (e.type !== 'change') return;

    if (field === 'name') {
      joint.name = e.target.value;
    } else if (field === 'type') {
      joint.type = e.target.value;
      if (joint.type === 'H') joint.hType = joint.hType || 'gear';
      else delete joint.hType;
      if (joint.type !== 'R' && joint.links.length > 2) joint.links = joint.links.slice(0, 2);
    } else if (field === 'hType') {
      joint.hType = e.target.value;
    } else if (field === 'member') {
      var id = e.target.value;
      if (e.target.checked) {
        joint.links.push(id);
        var order = state.model.links.map(function (l) { return l.id; });
        joint.links.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      } else {
        joint.links = joint.links.filter(function (x) { return x !== id; });
      }
    } else if (field === 'pair') {
      var idx = Number(e.target.getAttribute('data-index'));
      var pair = [joint.links[0] || '', joint.links[1] || ''];
      pair[idx] = e.target.value;
      joint.links = pair.filter(function (x) { return x !== ''; });
      if (pair[0] === '' && pair[1] !== '') joint.links = [pair[1]];
    } else if (field === 'redundant') {
      joint.redundant = e.target.checked;
    }
    update();
    renderJoints();
  }

  /* ---------- 结果 ---------- */

  function msgList(container, items, cls) {
    items.forEach(function (m) { container.appendChild(el('div', { className: 'msg ' + cls, text: m })); });
  }

  function countBox(value, label) {
    return el('div', { className: 'count' }, [el('b', { text: String(value) }), el('span', { text: label })]);
  }

  function renderResultCard(container, r, extra) {
    container.textContent = '';
    var hasErrors = r.errors && r.errors.length;
    var it = r.interpretation;
    var wrap = el('div', { className: 'kind-' + (hasErrors ? 'error' : it.kind) });

    wrap.appendChild(el('div', { className: 'result-main' }, [
      el('div', { className: 'f-value', text: hasErrors ? '?' : String(r.F) }),
      el('div', null, [
        el('div', { className: 'result-title', text: hasErrors ? '输入有误，先修正下列问题' : it.title }),
        hasErrors ? null : el('div', { className: 'result-text', text: it.text })
      ])
    ]));

    if (hasErrors) msgList(wrap, r.errors, 'msg-error');
    if (!hasErrors && it.determinacy) {
      msgList(wrap, [it.determinacy.text], it.determinacy.ok ? 'msg-ok' : 'msg-warn');
    }
    if (r.formula) wrap.appendChild(el('div', { className: 'formula', text: r.formula }));
    if (extra) extra(wrap);
    container.appendChild(wrap);
  }

  function renderResult(r) {
    renderResultCard($('#result'), r, function (wrap) {
      wrap.appendChild(el('div', { className: 'counts' }, [
        countBox(r.n, '活动构件 n'),
        countBox(r.PL, '低副 PL'),
        countBox(r.PH, '高副 PH'),
        countBox(r.localDof, '局部自由度 F′')
      ]));
      if (r.localDofItems.length) {
        msgList(wrap, ['局部自由度来自：' + r.localDofItems.map(function (i) {
          return i.name + '（' + i.value + '）';
        }).join('、')], 'msg-hint');
      }
      msgList(wrap, r.warnings, 'msg-warn');
      msgList(wrap, r.hints, 'msg-hint');
    });
  }

  function renderDetails(r) {
    var body = $('#details-body');
    body.textContent = '';
    if (!r.details.length) {
      body.appendChild(el('tr', null, [el('td', { colSpan: 6, className: 'graph-empty', text: '还没有运动副' })]));
      return;
    }
    var statusText = { counted: '计入', excluded: '不计入', invalid: '无效' };
    r.details.forEach(function (d) {
      var note = el('td');
      note.appendChild(el('span', { className: 'status status-' + d.status, text: statusText[d.status] }));
      if (d.compound) {
        note.appendChild(document.createTextNode(' '));
        note.appendChild(el('span', { className: 'status compound-tag', text: '复合铰链' }));
      }
      if (d.notes.length) note.appendChild(document.createTextNode(' ' + d.notes.join('；')));
      body.appendChild(el('tr', null, [
        el('td', { text: d.name }),
        el('td', { text: d.typeLabel }),
        el('td', { text: d.linkNames.join('、') || '—' }),
        el('td', { className: 'num', text: String(d.low) }),
        el('td', { className: 'num', text: String(d.high) }),
        note
      ]));
    });
  }

  /* ---------- 拓扑图 ---------- */

  function renderGraph(r) {
    var box = $('#graph');
    box.textContent = '';
    var links = state.model.links;
    if (!links.length) {
      box.appendChild(el('div', { className: 'graph-empty', text: '没有构件' }));
      return;
    }

    var W = 440, H = 380, cx = W / 2, cy = H / 2 + 4, R = 135, nodeR = 20;
    var pos = {};
    var groundIdx = Math.max(0, links.findIndex(function (l) { return l.ground; }));
    links.forEach(function (l, i) {
      var k = (i - groundIdx + links.length) % links.length;
      var a = -Math.PI / 2 + (2 * Math.PI * k) / links.length;
      pos[l.id] = links.length === 1 ? { x: cx, y: cy } : { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });

    var statusById = {};
    r.details.forEach(function (d) { statusById[d.id] = d.status; });
    var excludedLinks = {};
    links.forEach(function (l) { if (l.redundant && !l.ground) excludedLinks[l.id] = true; });

    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '机构拓扑图' });
    var edgeLayer = svg('g');
    var labelLayer = svg('g');
    var nodeLayer = svg('g');
    root.appendChild(edgeLayer);
    root.appendChild(labelLayer);
    root.appendChild(nodeLayer);

    var pairSeen = {};
    state.model.joints.forEach(function (j) {
      var ids = j.links.filter(function (id, i, arr) { return pos[id] && arr.indexOf(id) === i; });
      if (ids.length < 2) return;
      var status = statusById[j.id];
      var cls = 'edge edge-' + j.type + (status === 'counted' ? '' : ' excluded');
      var label = status === 'counted' ? (j.name || j.id) : '';

      if (ids.length === 2) {
        var a = pos[ids[0]], b = pos[ids[1]];
        var key = ids.slice().sort().join('|');
        var nth = pairSeen[key] = (pairSeen[key] || 0) + 1;
        var offset = nth === 1 ? 0 : (nth % 2 === 0 ? 1 : -1) * 26 * Math.floor(nth / 2);
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        var nx = -dy / len, ny = dx / len;
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var qx = mx + nx * offset * 2, qy = my + ny * offset * 2;
        edgeLayer.appendChild(svg('path', {
          d: 'M' + a.x + ',' + a.y + ' Q' + qx + ',' + qy + ' ' + b.x + ',' + b.y,
          class: cls
        }));
        labelLayer.appendChild(svg('text', { x: mx + nx * offset, y: my + ny * offset, class: 'edge-label' }, label));
      } else {
        var sx = 0, sy = 0;
        ids.forEach(function (id) { sx += pos[id].x; sy += pos[id].y; });
        var jx = sx / ids.length, jy = sy / ids.length;
        ids.forEach(function (id) {
          var memberCls = cls;
          if (excludedLinks[id] && status === 'counted') memberCls += ' excluded';
          edgeLayer.appendChild(svg('line', { x1: jx, y1: jy, x2: pos[id].x, y2: pos[id].y, class: memberCls }));
        });
        labelLayer.appendChild(svg('circle', { cx: jx, cy: jy, r: 5, class: 'junction' + (status === 'counted' ? '' : ' excluded') }));
        labelLayer.appendChild(svg('text', { x: jx, y: jy - 13, class: 'edge-label' }, label));
      }
    });

    links.forEach(function (l, i) {
      var p = pos[l.id];
      var g = svg('g', { class: 'node' + (l.ground ? ' ground' : '') + (excludedLinks[l.id] ? ' excluded' : '') });
      g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: nodeR }));
      g.appendChild(svg('text', { x: p.x, y: p.y }, l.ground ? '机架' : String(l.id).replace(/^L/, '')));
      var outX = p.x - cx, outY = p.y - cy, ol = Math.hypot(outX, outY) || 1;
      var ux = outX / ol, uy = outY / ol;
      var lx = p.x + ux * (nodeR + 6), ly = p.y + uy * (nodeR + 12);
      var anchor = ux > 0.3 ? 'start' : (ux < -0.3 ? 'end' : 'middle');
      if (links.length === 1) { lx = p.x; ly = p.y + nodeR + 14; anchor = 'middle'; }
      g.appendChild(svg('text', { x: lx, y: ly, class: 'node-name', style: 'text-anchor:' + anchor }, l.ground ? '' : (l.name || l.id)));
      nodeLayer.appendChild(g);
    });

    box.appendChild(root);
  }

  /* ---------- 数值模式 ---------- */

  function renderNumeric() {
    var r = DOF.numeric(state.numeric);
    var box = $('#numeric-result');
    if (!r.ok) {
      renderResultCard(box, { errors: r.errors, interpretation: null });
      return;
    }
    renderResultCard(box, r, function (wrap) {
      var v = r.values;
      wrap.appendChild(el('div', { className: 'counts' }, [
        countBox(v.n, '活动构件 n'),
        countBox(2 * v.PL + v.PH, '总约束 2PL+PH'),
        countBox(v.virtual, '虚约束 p′'),
        countBox(v.localDof, '局部自由度 F′')
      ]));
      msgList(wrap, ['结果对应一般位置。死点、共线等奇异位置的瞬时自由度需另外分析。'], 'msg-hint');
    });
  }

  function syncNumericForm() {
    var form = $('#numeric-form');
    Object.keys(state.numeric).forEach(function (k) {
      if (form.elements[k]) form.elements[k].value = state.numeric[k];
    });
  }

  /* ---------- 主流程 ---------- */

  function update() {
    var drivers = state.drivers === '' ? undefined : Number(state.drivers);
    lastAnalysis = DOF.analyze(state.model, { drivers: drivers });
    renderResult(lastAnalysis);
    renderDetails(lastAnalysis);
    renderGraph(lastAnalysis);
    save();
  }

  function renderAll() {
    renderLinks();
    update();
    renderJoints();
    var ex = DOF_EXAMPLES.find(function (e) { return e.id === state.exampleId; });
    var desc = $('#example-desc');
    desc.hidden = !ex;
    desc.textContent = ex ? ex.title + '：' + ex.description : '';
    $('#example-select').value = ex ? ex.id : '';
    $('#drivers').value = state.drivers;
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
  }

  function init() {
    var exSel = $('#example-select');
    DOF_EXAMPLES.forEach(function (ex) {
      exSel.appendChild(el('option', { value: ex.id, text: ex.title }));
    });

    if (!load()) {
      state.model = clone(DOF_EXAMPLES[0].model);
      state.exampleId = DOF_EXAMPLES[0].id;
    }

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
    });

    exSel.addEventListener('change', function () {
      var ex = DOF_EXAMPLES.find(function (e) { return e.id === exSel.value; });
      if (!ex) return;
      state.model = clone(ex.model);
      state.exampleId = ex.id;
      state.drivers = '';
      renderAll();
    });

    ['input', 'change', 'click'].forEach(function (type) {
      $('#links-body').addEventListener(type, onLinkEvent);
      $('#joints-body').addEventListener(type, onJointEvent);
    });

    $('#btn-add-link').addEventListener('click', function () {
      var id = nextId('L', state.model.links);
      state.model.links.push({ id: id, name: '构件 ' + id.slice(1), ground: false, localDof: 0, redundant: false });
      renderAll();
      var inputs = document.querySelectorAll('#links-body input[data-field="name"]');
      if (inputs.length) inputs[inputs.length - 1].select();
    });

    $('#btn-add-joint').addEventListener('click', function () {
      var id = nextId('J', state.model.joints);
      state.model.joints.push({ id: id, name: id, type: 'R', links: [], redundant: false });
      renderAll();
    });

    $('#btn-clear').addEventListener('click', function () {
      if (!confirm('清空当前所有构件和运动副？')) return;
      state.model = emptyModel();
      state.exampleId = '';
      state.drivers = '';
      renderAll();
    });

    $('#btn-export').addEventListener('click', function () {
      var data = JSON.stringify({ version: 1, links: state.model.links, joints: state.model.joints }, null, 2);
      var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      var a = el('a', { href: url, download: 'mechanism.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    $('#btn-import').addEventListener('click', function () { $('#file-import').click(); });
    $('#file-import').addEventListener('change', function (e) {
      var file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state.model = normalizeModel(JSON.parse(reader.result));
          state.exampleId = '';
          renderAll();
        } catch (err) {
          alert('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
    });

    $('#drivers').addEventListener('input', function (e) {
      state.drivers = e.target.value;
      update();
    });

    var form = $('#numeric-form');
    form.addEventListener('input', function () {
      Object.keys(state.numeric).forEach(function (k) {
        if (form.elements[k]) state.numeric[k] = form.elements[k].value;
      });
      renderNumeric();
      save();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    $('#btn-from-structured').addEventListener('click', function () {
      if (!lastAnalysis) return;
      state.numeric = {
        n: String(lastAnalysis.n),
        PL: String(lastAnalysis.PL),
        PH: String(lastAnalysis.PH),
        localDof: String(lastAnalysis.localDof),
        virtual: '0',
        drivers: state.drivers
      };
      syncNumericForm();
      renderNumeric();
      save();
    });

    renderAll();
    syncNumericForm();
    renderNumeric();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
