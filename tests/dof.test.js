const test = require('node:test');
const assert = require('node:assert');
const DOF = require('../js/dof.js');
const EXAMPLES = require('../js/examples.js');

const clone = (o) => JSON.parse(JSON.stringify(o));

for (const ex of EXAMPLES) {
  test('例题：' + ex.title, () => {
    const r = DOF.analyze(ex.model);
    assert.deepStrictEqual(r.errors, []);
    assert.strictEqual(r.n, ex.expected.n, 'n');
    assert.strictEqual(r.PL, ex.expected.PL, 'PL');
    assert.strictEqual(r.PH, ex.expected.PH, 'PH');
    assert.strictEqual(r.localDof, ex.expected.localDof, "F'");
    assert.strictEqual(r.F, ex.expected.F, 'F');
  });
}

test('平行四边形不标虚约束时 F = 0 并给出提示', () => {
  const model = clone(EXAMPLES.find((e) => e.id === 'parallelogram').model);
  model.links.forEach((l) => { l.redundant = false; });
  const r = DOF.analyze(model);
  assert.strictEqual(r.n, 4);
  assert.strictEqual(r.PL, 6);
  assert.strictEqual(r.F, 0);
  assert.ok(r.hints.some((h) => h.includes('虚约束')));
});

test('复合铰链按 k-1 计，并在明细中标出', () => {
  const r = DOF.analyze(EXAMPLES.find((e) => e.id === 'compoundSixBar').model);
  const c = r.details.find((d) => d.id === 'J3');
  assert.strictEqual(c.low, 2);
  assert.strictEqual(c.compound, true);
});

test('复合铰链中含虚约束构件时减少 k', () => {
  const model = clone(EXAMPLES.find((e) => e.id === 'compoundSixBar').model);
  model.links.push({ id: 'L9', name: '多余杆', ground: false, localDof: 0, redundant: true });
  model.joints[2].links.push('L9');
  const r = DOF.analyze(model);
  assert.strictEqual(r.PL, 7);
  assert.strictEqual(r.F, 1);
});

test('行星轮系中虚约束构件的运动副被连带排除', () => {
  const r = DOF.analyze(EXAMPLES.find((e) => e.id === 'planetary').model);
  const excluded = r.details.filter((d) => d.status === 'excluded').map((d) => d.id);
  assert.deepStrictEqual(excluded, ['J6', 'J7', 'J8', 'J9', 'J10', 'J11']);
});

test('没有机架时报错', () => {
  const r = DOF.analyze({ links: [{ id: 'L1', name: 'a' }], joints: [] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].includes('机架'));
});

test('多个机架时报错', () => {
  const r = DOF.analyze({
    links: [{ id: 'L0', ground: true }, { id: 'L1', ground: true }],
    joints: []
  });
  assert.strictEqual(r.ok, false);
});

test('运动副引用无效时报错且不计入', () => {
  const r = DOF.analyze({
    links: [{ id: 'L0', name: '机架', ground: true }, { id: 'L1', name: '杆' }],
    joints: [
      { id: 'J1', type: 'R', links: ['L0', 'L1'] },
      { id: 'J2', type: 'P', links: ['L1', 'L9'] },
      { id: 'J3', type: 'H', links: ['L1', 'L1'] },
      { id: 'J4', type: 'R', links: ['L1'] }
    ]
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.PL, 1);
  assert.strictEqual(r.PH, 0);
  assert.strictEqual(r.details.filter((d) => d.status === 'invalid').length, 3);
});

test('孤立和未连到机架的构件给出警告', () => {
  const r = DOF.analyze({
    links: [
      { id: 'L0', name: '机架', ground: true },
      { id: 'L1', name: '甲' },
      { id: 'L2', name: '乙' },
      { id: 'L3', name: '丙' }
    ],
    joints: [{ id: 'J1', type: 'R', links: ['L2', 'L3'] }]
  });
  assert.ok(r.warnings.some((w) => w.includes('甲') && w.includes('孤立')));
  assert.ok(r.warnings.some((w) => w.includes('乙') && w.includes('机架')));
});

test('同一对构件间的重复移动副给出警告', () => {
  const r = DOF.analyze({
    links: [{ id: 'L0', name: '机架', ground: true }, { id: 'L1', name: '滑块' }],
    joints: [
      { id: 'J1', type: 'P', links: ['L0', 'L1'] },
      { id: 'J2', type: 'P', links: ['L1', 'L0'] }
    ]
  });
  assert.strictEqual(r.F, -1);
  assert.ok(r.warnings.some((w) => w.includes('移动副')));
});

test('原动件数判断', () => {
  assert.strictEqual(DOF.interpret(1, 1).determinacy.ok, true);
  assert.strictEqual(DOF.interpret(2, 1).determinacy.ok, false);
  assert.strictEqual(DOF.interpret(1, 2).determinacy.ok, false);
  assert.strictEqual(DOF.interpret(1).determinacy, null);
  assert.strictEqual(DOF.interpret(0).kind, 'structure');
  assert.strictEqual(DOF.interpret(-2).kind, 'overconstrained');
});

test('数值模式', () => {
  const r = DOF.numeric({ n: 4, PL: 6, PH: 0, localDof: 0, virtual: 1 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.F, 1);
  assert.strictEqual(DOF.numeric({ n: 3, PL: 3, PH: 1, localDof: 1, virtual: 0 }).F, 1);
  assert.strictEqual(DOF.numeric({ n: -1, PL: 0, PH: 0 }).ok, false);
  assert.strictEqual(DOF.numeric({ n: 1.5, PL: 0, PH: 0 }).ok, false);
  assert.strictEqual(DOF.numeric({ n: 1, PL: 0, PH: 0, virtual: 3 }).ok, false);
});
