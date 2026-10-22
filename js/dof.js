/* 平面机构自由度计算核心：F = 3n - 2PL - PH - F' */
var DOF = (function () {
  'use strict';

  var JOINT_TYPES = {
    R: { label: '转动副', kind: 'low' },
    P: { label: '移动副', kind: 'low' },
    H: { label: '高副', kind: 'high' }
  };

  var H_TYPES = {
    gear: '齿轮啮合',
    cam: '凸轮接触',
    pinSlot: '销槽',
    other: '其他高副'
  };

  function jointTypeLabel(joint) {
    var base = JOINT_TYPES[joint.type] ? JOINT_TYPES[joint.type].label : '未知运动副';
    if (joint.type === 'H' && joint.hType && H_TYPES[joint.hType]) {
      return base + '（' + H_TYPES[joint.hType] + '）';
    }
    return base;
  }

  function isNonNegInt(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v;
  }

  function interpret(F, drivers) {
    var res = { F: F, kind: '', title: '', text: '', determinacy: null };
    if (F > 0) {
      res.kind = 'mechanism';
      res.title = '机构（F = ' + F + '）';
      res.text = '需要 ' + F + ' 个原动件，运动才确定。';
    } else if (F === 0) {
      res.kind = 'structure';
      res.title = '结构（F = 0）';
      res.text = '各构件位置被完全约束，不能运动。';
    } else {
      res.kind = 'overconstrained';
      res.title = '超静定结构（F = ' + F + '）';
      res.text = '约束多于所需。若约束彼此独立，超静定次数为 ' + (-F) + '。';
    }

    if (isNonNegInt(drivers) && drivers > 0) {
      if (F <= 0) {
        res.determinacy = { ok: false, text: '自由度不大于 0，加原动件也不能运动。' };
      } else if (drivers === F) {
        res.determinacy = { ok: true, text: '原动件数 ' + drivers + ' 等于自由度，运动确定。' };
      } else if (drivers < F) {
        res.determinacy = { ok: false, text: '原动件数 ' + drivers + ' 少于自由度 ' + F + '，运动不确定。' };
      } else {
        res.determinacy = {
          ok: false,
          text: '原动件数 ' + drivers + ' 多于自由度 ' + F + '，机构不能运动，或薄弱构件被破坏。'
        };
      }
    }
    return res;
  }

  /* 结构化分析。model: { links: [...], joints: [...] } */
  function analyze(model, options) {
    options = options || {};
    var links = (model && model.links) || [];
    var joints = (model && model.joints) || [];
    var errors = [];
    var warnings = [];
    var hints = [];

    var linkById = {};
    links.forEach(function (l) { linkById[l.id] = l; });
    var linkName = function (id) { return linkById[id] ? (linkById[id].name || id) : id; };

    var grounds = links.filter(function (l) { return l.ground; });
    if (grounds.length === 0) errors.push('没有机架。请把一个构件设为机架。');
    if (grounds.length > 1) {
      errors.push('有 ' + grounds.length + ' 个构件被设为机架。固定在一起的构件应合并为一个机架。');
    }
    var groundId = grounds.length ? grounds[0].id : null;

    var excludedLink = {};
    links.forEach(function (l) {
      if (l.redundant && !l.ground) excludedLink[l.id] = true;
    });

    var countedLinks = links.filter(function (l) { return !l.ground && !excludedLink[l.id]; });
    var n = countedLinks.length;
    var localDof = 0;
    var localDofItems = [];
    countedLinks.forEach(function (l) {
      var v = Number(l.localDof) || 0;
      if (v > 0) {
        localDof += v;
        localDofItems.push({ id: l.id, name: linkName(l.id), value: v });
      }
    });

    var PL = 0;
    var PH = 0;
    var details = [];
    var countedJoints = [];

    joints.forEach(function (j) {
      var d = {
        id: j.id,
        name: j.name || j.id,
        type: j.type,
        typeLabel: jointTypeLabel(j),
        linkNames: (j.links || []).map(linkName),
        k: (j.links || []).length,
        low: 0,
        high: 0,
        status: 'counted',
        compound: false,
        notes: []
      };
      details.push(d);

      var problems = [];
      if (!JOINT_TYPES[j.type]) problems.push('运动副类型无效');
      var ids = j.links || [];
      var seen = {};
      ids.forEach(function (id) {
        if (!linkById[id]) problems.push('引用了不存在的构件 ' + id);
        if (seen[id]) problems.push('重复选择了构件 ' + linkName(id));
        seen[id] = true;
      });
      if (j.type === 'R' && ids.length < 2) problems.push('转动副至少要连接 2 个构件');
      if ((j.type === 'P' || j.type === 'H') && ids.length !== 2) {
        problems.push(JOINT_TYPES[j.type].label + '必须恰好连接 2 个构件');
      }
      if (problems.length) {
        d.status = 'invalid';
        d.notes = problems;
        problems.forEach(function (p) { errors.push('运动副 ' + d.name + '：' + p + '。'); });
        return;
      }

      if (j.redundant) {
        d.status = 'excluded';
        d.notes.push('标记为虚约束，不计入');
        return;
      }

      var active = ids.filter(function (id) { return !excludedLink[id]; });
      var dropped = ids.filter(function (id) { return excludedLink[id]; });
      if (active.length < 2) {
        d.status = 'excluded';
        d.notes.push('连接虚约束构件 ' + dropped.map(linkName).join('、') + '，随之不计入');
        return;
      }
      if (dropped.length) {
        d.notes.push('去掉虚约束构件 ' + dropped.map(linkName).join('、') + ' 后按 ' + active.length + ' 个构件计');
      }

      if (j.type === 'R') {
        d.k = active.length;
        d.low = active.length - 1;
        if (active.length >= 3) {
          d.compound = true;
          d.notes.push('复合铰链：' + active.length + ' 个构件，计 ' + d.low + ' 个转动副');
        }
        PL += d.low;
      } else if (j.type === 'P') {
        d.low = 1;
        PL += 1;
      } else {
        d.high = 1;
        PH += 1;
      }
      countedJoints.push({ joint: j, links: active });
    });

    // 连通性：从机架出发遍历参与计算的构件
    var adj = {};
    countedLinks.forEach(function (l) { adj[l.id] = []; });
    if (groundId) adj[groundId] = [];
    countedJoints.forEach(function (cj) {
      cj.links.forEach(function (a) {
        cj.links.forEach(function (b) {
          if (a !== b && adj[a]) adj[a].push(b);
        });
      });
    });
    if (groundId) {
      var visited = {};
      visited[groundId] = true;
      var queue = [groundId];
      while (queue.length) {
        var cur = queue.shift();
        adj[cur].forEach(function (nb) {
          if (!visited[nb]) { visited[nb] = true; queue.push(nb); }
        });
      }
      countedLinks.forEach(function (l) {
        if (adj[l.id].length === 0) {
          warnings.push('构件 ' + linkName(l.id) + ' 没有任何运动副，是孤立构件。');
        } else if (!visited[l.id]) {
          warnings.push('构件 ' + linkName(l.id) + ' 不能通过运动副连到机架。');
        }
      });
    }

    // 同一对构件之间重复的运动副
    var pairCount = {};
    countedJoints.forEach(function (cj) {
      var t = cj.joint.type;
      for (var a = 0; a < cj.links.length; a++) {
        for (var b = a + 1; b < cj.links.length; b++) {
          var key = t + '|' + [cj.links[a], cj.links[b]].sort().join('|');
          pairCount[key] = (pairCount[key] || 0) + 1;
        }
      }
    });
    Object.keys(pairCount).forEach(function (key) {
      if (pairCount[key] < 2) return;
      var parts = key.split('|');
      var pair = linkName(parts[1]) + ' 与 ' + linkName(parts[2]);
      if (parts[0] === 'P') {
        warnings.push(pair + ' 之间有 ' + pairCount[key] + ' 个移动副。若导路重合或平行，只应计 1 个，其余标为虚约束。');
      } else if (parts[0] === 'R') {
        warnings.push(pair + ' 之间有 ' + pairCount[key] + ' 个转动副。若轴线重合，只应计 1 个，其余标为虚约束。');
      } else {
        warnings.push(pair + ' 之间有 ' + pairCount[key] + ' 个高副。一对齿轮或一处接触只计 1 个高副。');
      }
    });

    // 局部自由度与高副的对应
    localDofItems.forEach(function (item) {
      var hasHigh = countedJoints.some(function (cj) {
        return cj.joint.type === 'H' && cj.links.indexOf(item.id) !== -1;
      });
      if (!hasHigh) {
        hints.push('构件 ' + item.name + ' 设了局部自由度，但没有参与高副。局部自由度通常出现在与凸轮接触的滚子上。');
      }
    });

    var F = 3 * n - 2 * PL - PH - localDof;
    if (!errors.length && n > 0 && F <= 0) {
      hints.push('自由度不大于 0。若这是一个能动的机构，检查是否漏标了虚约束（轨迹重合、对称重复、导路重复、轴线重合、等距连接）。');
    }
    hints.push('结果对应一般位置。死点、共线等奇异位置的瞬时自由度需另外分析。');

    return {
      ok: errors.length === 0,
      n: n,
      PL: PL,
      PH: PH,
      localDof: localDof,
      localDofItems: localDofItems,
      F: F,
      formula: 'F = 3n − 2PL − PH − F′ = 3×' + n + ' − 2×' + PL + ' − ' + PH + ' − ' + localDof + ' = ' + F,
      details: details,
      errors: errors,
      warnings: warnings,
      hints: hints,
      interpretation: interpret(F, options.drivers)
    };
  }

  /* 数值模式：F = 3n − (2PL + PH − p′) − F′ */
  function numeric(input) {
    var fields = { n: '活动构件数 n', PL: '低副数 PL', PH: '高副数 PH', localDof: '局部自由度 F′', virtual: '虚约束数 p′' };
    var errors = [];
    var v = {};
    Object.keys(fields).forEach(function (k) {
      var raw = input[k];
      var num = raw === '' || raw === undefined || raw === null ? 0 : Number(raw);
      if (!isNonNegInt(num)) errors.push(fields[k] + ' 必须是非负整数。');
      v[k] = num;
    });
    if (!errors.length && v.virtual > 2 * v.PL + v.PH) {
      errors.push('虚约束数 p′ 不能超过总约束数 2PL + PH。');
    }
    var drivers = input.drivers === '' || input.drivers === undefined ? undefined : Number(input.drivers);
    if (drivers !== undefined && !isNonNegInt(drivers)) errors.push('原动件数必须是非负整数。');
    if (errors.length) return { ok: false, errors: errors };

    var F = 3 * v.n - (2 * v.PL + v.PH - v.virtual) - v.localDof;
    return {
      ok: true,
      errors: [],
      values: v,
      F: F,
      formula: 'F = 3n − (2PL + PH − p′) − F′ = 3×' + v.n + ' − (2×' + v.PL + ' + ' + v.PH + ' − ' +
        v.virtual + ') − ' + v.localDof + ' = ' + F,
      interpretation: interpret(F, drivers)
    };
  }

  return {
    JOINT_TYPES: JOINT_TYPES,
    H_TYPES: H_TYPES,
    jointTypeLabel: jointTypeLabel,
    analyze: analyze,
    numeric: numeric,
    interpret: interpret
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DOF;
