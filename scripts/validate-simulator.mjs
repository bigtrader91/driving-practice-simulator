import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const app = read('src/App.tsx');
const css = read('src/index.css');

check(app.includes('setPointerCapture') && app.includes('event.button !== 0'), '핸들 좌클릭 유지와 포인터 캡처가 없습니다.');
check(app.includes('onPointerMove') && app.includes('steeringHeld'), '마우스 원형 드래그 조향이 없습니다.');
check(app.includes('clamp(input.wheelDeg, -maxWheel, maxWheel)') && app.includes('const maxWheel = 540'), '핸들 ±540° 제한이 없습니다.');
check(app.includes('steeringRatio') && app.includes('frontWheelDeg'), '차종별 조향비 기반 앞바퀴 각도 계산이 없습니다.');
check(app.includes("throttle: 'KeyW'") && app.includes("brake: 'KeyS'"), 'W 엑셀·S 풋브레이크 기본 배치가 없습니다.');
check(app.includes("const stationary = Math.abs(speedMs) < 0.18") && app.includes('brakeHeld'), 'P/R/D 기어 인터록이 없습니다.');
check(app.includes('lastSafe') && app.includes('speedMs = 0'), '충돌 시 안전 위치 복귀와 정지가 없습니다.');
check(app.includes("cameraMotion === 'off'") && app.includes('0.03'), '카메라 롤 제한이 없습니다.');
check(!/addEventListener\(\s*['"]mousemove['"]/.test(app), '전역 마우스 위치 조향이 남아 있습니다.');
check(app.includes("type CameraMode = 'cockpit' | 'hood' | 'chase' | 'top'"), '4개 카메라 시점이 없습니다.');
check(app.includes('leftMirror') && app.includes('rightMirror') && app.includes('rearMirror') && app.includes('backupMirror'), '미러 또는 후방카메라가 누락되었습니다.');
check(app.includes('trajectoryGeometry') && app.includes('widthGeometry'), '타이어 궤적선 또는 차폭선이 없습니다.');
check(css.includes('.cockpit-overlay') && css.includes('.bottom-hud') && css.includes('.modal-bg'), '컴팩트 HUD 또는 설정 화면 스타일이 없습니다.');
check(exists('.github/workflows/ci.yml'), 'GitHub Actions CI가 없습니다.');

const missionIds = [
  'basic_controls', 'width_slalom', 'curve_s', 'curve_t', 'functional_exam',
  'parking_reverse', 'parking_parallel', 'city_lane_change', 'city_traffic', 'highway_5lane',
];
for (const id of missionIds) check(app.includes(`id: '${id}'`), `코스 누락: ${id}`);

const requiredKeys = [
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyZ', 'Space', 'KeyX',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyC', 'KeyT', 'KeyV', 'KeyF', 'KeyH',
];
for (const code of requiredKeys) check(app.includes(`'${code}'`), `기본 키 누락: ${code}`);

const bindingBlock = app.match(/const DEFAULT_BINDINGS[\s\S]*?\n};/)?.[0] ?? '';
const assigned = [...bindingBlock.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
check(assigned.length === requiredKeys.length, `기본 키 수 오류: ${assigned.length}`);
check(new Set(assigned).size === assigned.length, '기본 키에 중복 배정이 있습니다.');

console.log(JSON.stringify({
  status: 'PASS',
  missions: missionIds.length,
  uniqueBindings: assigned.length,
  invariantChecks: 14,
}, null, 2));
