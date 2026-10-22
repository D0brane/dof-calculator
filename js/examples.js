/* 内置例题。expected 同时用于测试。 */
var DOF_EXAMPLES = (function () {
  'use strict';

  function L(id, name, extra) {
    var l = { id: id, name: name, ground: false, localDof: 0, redundant: false };
    for (var k in extra) l[k] = extra[k];
    return l;
  }
  function ground(name) {
    return L('L0', name || '机架', { ground: true });
  }
  function J(id, name, type, links, extra) {
    var j = { id: id, name: name, type: type, links: links, redundant: false };
    for (var k in extra) j[k] = extra[k];
    return j;
  }

  return [
    {
      id: 'fourBar',
      title: '铰链四杆机构',
      description: '曲柄、连杆、摇杆 3 个活动构件，A、B、C、D 共 4 个转动副。',
      expected: { n: 3, PL: 4, PH: 0, localDof: 0, F: 1 },
      model: {
        links: [ground(), L('L1', '曲柄 AB'), L('L2', '连杆 BC'), L('L3', '摇杆 CD')],
        joints: [
          J('J1', 'A', 'R', ['L0', 'L1']),
          J('J2', 'B', 'R', ['L1', 'L2']),
          J('J3', 'C', 'R', ['L2', 'L3']),
          J('J4', 'D', 'R', ['L3', 'L0'])
        ]
      }
    },
    {
      id: 'sliderCrank',
      title: '曲柄滑块机构',
      description: '3 个转动副加 1 个移动副，PL = 4。',
      expected: { n: 3, PL: 4, PH: 0, localDof: 0, F: 1 },
      model: {
        links: [ground(), L('L1', '曲柄 AB'), L('L2', '连杆 BC'), L('L3', '滑块 C')],
        joints: [
          J('J1', 'A', 'R', ['L0', 'L1']),
          J('J2', 'B', 'R', ['L1', 'L2']),
          J('J3', 'C', 'R', ['L2', 'L3']),
          J('J4', '滑块导路', 'P', ['L3', 'L0'])
        ]
      }
    },
    {
      id: 'fiveBar',
      title: '铰链五杆机构',
      description: '4 个活动构件、5 个转动副，需要两个原动件。',
      expected: { n: 4, PL: 5, PH: 0, localDof: 0, F: 2 },
      model: {
        links: [ground(), L('L1', '杆 1'), L('L2', '杆 2'), L('L3', '杆 3'), L('L4', '杆 4')],
        joints: [
          J('J1', 'A', 'R', ['L0', 'L1']),
          J('J2', 'B', 'R', ['L1', 'L2']),
          J('J3', 'C', 'R', ['L2', 'L3']),
          J('J4', 'D', 'R', ['L3', 'L4']),
          J('J5', 'E', 'R', ['L4', 'L0'])
        ]
      }
    },
    {
      id: 'gearPair',
      title: '定轴齿轮传动',
      description: '两个齿轮各与机架组成转动副，啮合处 1 个高副。',
      expected: { n: 2, PL: 2, PH: 1, localDof: 0, F: 1 },
      model: {
        links: [ground(), L('L1', '齿轮 1'), L('L2', '齿轮 2')],
        joints: [
          J('J1', 'O1', 'R', ['L0', 'L1']),
          J('J2', 'O2', 'R', ['L0', 'L2']),
          J('J3', '啮合', 'H', ['L1', 'L2'], { hType: 'gear' })
        ]
      }
    },
    {
      id: 'flatCam',
      title: '直动平底从动件凸轮',
      description: '凸轮与机架为转动副，从动件与机架为移动副，接触处 1 个高副。',
      expected: { n: 2, PL: 2, PH: 1, localDof: 0, F: 1 },
      model: {
        links: [ground(), L('L1', '凸轮'), L('L2', '平底从动件')],
        joints: [
          J('J1', '凸轮轴', 'R', ['L0', 'L1']),
          J('J2', '从动件导路', 'P', ['L2', 'L0']),
          J('J3', '接触', 'H', ['L1', 'L2'], { hType: 'cam' })
        ]
      }
    },
    {
      id: 'rollerCam',
      title: '直动滚子从动件凸轮',
      description: '滚子绕自身轴线的转动是局部自由度，F′ = 1。',
      expected: { n: 3, PL: 3, PH: 1, localDof: 1, F: 1 },
      model: {
        links: [ground(), L('L1', '凸轮'), L('L2', '从动件'), L('L3', '滚子', { localDof: 1 })],
        joints: [
          J('J1', '凸轮轴', 'R', ['L0', 'L1']),
          J('J2', '从动件导路', 'P', ['L2', 'L0']),
          J('J3', '滚子销', 'R', ['L3', 'L2']),
          J('J4', '接触', 'H', ['L1', 'L3'], { hType: 'cam' })
        ]
      }
    },
    {
      id: 'rollerCamTwoGuides',
      title: '直动滚子从动件凸轮（双导路）',
      description: '从动件由上下两处导路支承，两处导路共线，其中一处是虚约束；滚子自转是局部自由度。取消导路 2 的虚约束标记会算出 F = −1。',
      expected: { n: 3, PL: 3, PH: 1, localDof: 1, F: 1 },
      model: {
        links: [ground(), L('L1', '凸轮'), L('L2', '推杆'), L('L3', '滚子', { localDof: 1 })],
        joints: [
          J('J1', '凸轮轴 O', 'R', ['L0', 'L1']),
          J('J2', '导路 1', 'P', ['L2', 'L0']),
          J('J3', '导路 2', 'P', ['L2', 'L0'], { redundant: true }),
          J('J4', '滚子销 B', 'R', ['L3', 'L2']),
          J('J5', '凸轮–滚子接触', 'H', ['L1', 'L3'], { hType: 'cam' })
        ]
      }
    },
    {
      id: 'parallelogram',
      title: '含虚约束的平行四边形机构',
      description: 'EF 与 AB、CD 平行且等长，是虚约束。取消 EF 的虚约束标记后会算出 F = 0。',
      expected: { n: 3, PL: 4, PH: 0, localDof: 0, F: 1 },
      model: {
        links: [
          ground(),
          L('L1', '曲柄 AB'),
          L('L2', '连杆 BC'),
          L('L3', '摇杆 CD'),
          L('L4', '平行杆 EF', { redundant: true })
        ],
        joints: [
          J('J1', 'A', 'R', ['L0', 'L1']),
          J('J2', 'B', 'R', ['L1', 'L2']),
          J('J3', 'C', 'R', ['L2', 'L3']),
          J('J4', 'D', 'R', ['L3', 'L0']),
          J('J5', 'E', 'R', ['L0', 'L4']),
          J('J6', 'F', 'R', ['L4', 'L2'])
        ]
      }
    },
    {
      id: 'planetary',
      title: '行星轮系（3 个均布行星轮）',
      description: '齿圈固定为机架。行星轮 2、3 是对称重复的虚约束，只保留行星轮 1。',
      expected: { n: 3, PL: 3, PH: 2, localDof: 0, F: 1 },
      model: {
        links: [
          ground('机架（含固定齿圈）'),
          L('L1', '太阳轮'),
          L('L2', '行星架 H'),
          L('L3', '行星轮 1'),
          L('L4', '行星轮 2', { redundant: true }),
          L('L5', '行星轮 3', { redundant: true })
        ],
        joints: [
          J('J1', '太阳轮轴', 'R', ['L0', 'L1']),
          J('J2', '行星架轴', 'R', ['L0', 'L2']),
          J('J3', '行星轮 1 轴', 'R', ['L3', 'L2']),
          J('J4', '太阳轮–行星轮 1', 'H', ['L1', 'L3'], { hType: 'gear' }),
          J('J5', '行星轮 1–齿圈', 'H', ['L3', 'L0'], { hType: 'gear' }),
          J('J6', '行星轮 2 轴', 'R', ['L4', 'L2']),
          J('J7', '太阳轮–行星轮 2', 'H', ['L1', 'L4'], { hType: 'gear' }),
          J('J8', '行星轮 2–齿圈', 'H', ['L4', 'L0'], { hType: 'gear' }),
          J('J9', '行星轮 3 轴', 'R', ['L5', 'L2']),
          J('J10', '太阳轮–行星轮 3', 'H', ['L1', 'L5'], { hType: 'gear' }),
          J('J11', '行星轮 3–齿圈', 'H', ['L5', 'L0'], { hType: 'gear' })
        ]
      }
    },
    {
      id: 'compoundSixBar',
      title: '含复合铰链的六杆滑块机构',
      description: 'C 处连杆 BC、摇杆 CD、连杆 CE 三杆共铰，计 2 个转动副。',
      expected: { n: 5, PL: 7, PH: 0, localDof: 0, F: 1 },
      model: {
        links: [
          ground(),
          L('L1', '曲柄 AB'),
          L('L2', '连杆 BC'),
          L('L3', '摇杆 CD'),
          L('L4', '连杆 CE'),
          L('L5', '滑块 E')
        ],
        joints: [
          J('J1', 'A', 'R', ['L0', 'L1']),
          J('J2', 'B', 'R', ['L1', 'L2']),
          J('J3', 'C（复合铰链）', 'R', ['L2', 'L3', 'L4']),
          J('J4', 'D', 'R', ['L3', 'L0']),
          J('J5', 'E', 'R', ['L4', 'L5']),
          J('J6', '滑块导路', 'P', ['L5', 'L0'])
        ]
      }
    }
  ];
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DOF_EXAMPLES;
