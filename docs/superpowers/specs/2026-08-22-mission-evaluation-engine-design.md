# 미션 평가 엔진 & 종합주행 코스 설계

- 날짜: 2026-08-22
- 상태: 승인됨 (사용자 방식 A 선택, 풀코스 개편, 회전교차로 포함, 필수 위반 즉시 실패)
- 범위: P1 게임플레이 완성도 — "장식 objectives"를 실제 작동하는 판정으로 전환

## 1. 문제 정의

현재 missions.ts의 objectives는 HUD 표시용이고, 실제 판정은 다음뿐이다:

1. targetArea 도달 (+ 주차 시 P단 홀드/헤딩 허용오차)
2. 충돌 감점 (장애물 15점 / 차량 30점)
3. 차선변경 중 깜빡이·숄더체크 미확인 각 10점

결과적으로 미션 7(종합 도로주행)은 신호등·교차로·회전교차로 오브젝트가
존재하지 않아 플레이 불가능하며, 목표지점(targetArea x=40)이 도로 밖
잔디(x∈[-12,12] 밖)에 있어 도달 자체가 불가능하다.

추가로 발견된 치명 버그: SimulationCanvas의 useEffect deps에
`cameraMode, showTrajectory, showWidthGuide`가 포함되어 있어 C키(카메라)/
T키(궤적선) 토글만 눌러도 씬·점수·차량 위치가 전부 리셋된다.

## 2. 설계 원칙

- **판정 로직과 렌더링 분리**: 순수 로직은 `src/simulation/` 모듈로 추출해
  단위 테스트 가능하게 한다. Three.js 의존 없이 동작해야 한다.
- **objectives가 진실의 원천**: 판정기는 missions.ts의 `objectives.id`,
  `scorePenalty`, `isMandatory`를 소비한다. 하드코딩 감점값 신설 금지.
- **YAGNI**: 이벤트 버스 등 과설계 배제. 클래스 인스턴스 + 매 프레임
  `evaluate()` 호출 구조.

## 3. 코스 지형 재설계 (TrackBuilder)

city 분기(`else` 브랜치)를 `city_lane_change`용 기존 직선 도로와
`city_traffic`용 신규 코스로 분리한다.

```
출발(0,+140) → 어린이보호구역(z 100~60)
  → 신호 교차로(z=30): N-S 본선 × E-W 가지도로, 정지선·횡단보도·신호등 폴대 4기
     └ 비보호 좌회전 필수 (-X 방향 가지도로 진입)
  → 서쪽 가지도로(z∈[22,38], x 0→-66)
  → 회전교차로(중심 (-80,30), 순환 반경 14m)
  → 북쪽 출구 → 목표지점(-80,+90)
```

- missions.ts `city_traffic.targetArea`를 `(-80, 90)`으로 수정.
- 미션 6(`city_lane_change`)은 기존 직선 도로 그대로 유지.
- 신호등 폴대: 기둥 + 3등(적황녹) 하우징. 램프 emissive는 SimulationCanvas가
  controller 상태를 읽어 갱신 (TrackBuilder는 지형만).
- 회전교차로: 중앙섬(cylinder) + 순환 차로 링 + 4방향 진출입로. 순환 차량 AI 2~3대 배치.
- 온커밍 차량 AI: 음의 x차로(x<0)에서 +Z 방향으로 교차로에 접근 (비보호 좌회전 시 양보 대상).

## 4. TrafficLightController (`src/simulation/TrafficLightController.ts`)

```ts
type LightPhase = 'green' | 'yellow' | 'red';
class TrafficLightController {
  update(dt: number): void          // 내부 타이머 진행
  getPhase(axis: 'NS' | 'EW'): LightPhase
}
```

- 프레임 독립 순수 상태머신. Three.js 의존 zero.
- 주기: 아래 28초 위상표를 반복한다. 한 축이 녹색 또는 황색이면 다른 축은
  반드시 적색이고, 축 전환 전에는 1초간 전방향 적색을 유지한다.

| 주기 시간 | NS | EW |
|---|---|---|
| 0s 이상 10s 미만 | green | red |
| 10s 이상 13s 미만 | yellow | red |
| 13s 이상 14s 미만 | red | red |
| 14s 이상 24s 미만 | red | green |
| 24s 이상 27s 미만 | red | yellow |
| 27s 이상 28s 미만 | red | red |

- 판정 규칙: **적색 통과만 위반**. 황색 진입은 허용 (현실 단순화).

## 5. MissionEvaluator (`src/simulation/MissionEvaluator.ts`)

```ts
interface EvalContext {
  carState: CarState;
  mission: Mission;            // zones 포함
  traffic: TrafficVehicleData[];
  lights: TrafficLightController | null;
  dt: number;
}
interface EvalResult {
  penalties: ScoreDeduction[]; // 이 프레임 신규 감점
  failReason?: string;         // 즉시 실패 사유 (필수 위반)
}
class MissionEvaluator {
  constructor(mission: Mission)
  evaluate(ctx: EvalContext): EvalResult
}
```

### 내부 상태 (진입당 1회 감점 보장)
- 존별 진입 플래그 Set (재진입 시 재감점)
- 최근 감점 throttle (기존 triggerPenalty와 동일 3초 dedupe 개념을 내부로 이관)

### 판정 규칙 (objective id 기준)

| objective id | 조건 | 결과 |
|---|---|---|
| stop_at_red | 정지선~교차로 박스 진입 순간 NS 위상이 red | **즉시 실패** (isMandatory) |
| school_zone_speed | school 존 내 speed > speedLimit(30) | 감점 (scorePenalty 소비) |
| unprotected_left | 좌회전 경로 진입 중 온커밍 차량 충돌 or 안전간격 미달(온커밍 30m 내 접근 중 진입) | 감점 |
| yield_check | aggressive 차량 후방 근접(25m 내 접근 중)일 때 해당 차로 진입 | 감점 |
| roundabout_yield | 순환 차량 접근 중 진입 무시 | 감점 |
| signal_check 등 기존 깜빡이/미러 체크 | 기존 SimulationCanvas 인라인 로직을 evaluator로 이관 | 감점 |

**판정 신설 범위 명시**: 새 판정이 연결되는 objective id는 위 표의 5종
(`stop_at_red`, `school_zone_speed`, `unprotected_left`, `yield_check`,
`roundabout_yield`) + 기존 깜빡이/미러 체크 이관분뿐이다. 나머지 장식
objective(`stay_in_lane`, `smooth_speed`, `curb_distance` 등)는 이번
사이클에서 그대로 둔다.

- `city_traffic` 미션에 `roundabout_yield` objective 항목을 missions.ts에
  신규 추가한다 (isMandatory: false, scorePenalty: 15). 그렇지 않으면
  "objectives가 진실의 원천" 원칙상 evaluator 규칙이 no-op이 된다.

- 완료 판정(targetArea 도달, P단 홀드)은 기존 로직 유지하되
  SimulationCanvas에서 evaluator 완료 후 처리.

## 6. 즉시 실패 흐름

1. evaluator가 `failReason` 반환 → SimulationCanvas는 즉시 루프 중단 처리
   (isMissionFinishedRef 재사용), `onMissionFail(reason)` 콜백 호출.
2. App은 실패 사유를 FeedbackModal에 전달 → 모달에 실패 상태 UI 추가
   (빨강 아이콘, 실패 사유, [다시 시도] / [미션 선택]).
3. 기존 onMissionComplete 시그니처 유지 (성공 경로 변경 없음).

## 7. 타입 확장 (`types/simulator.ts`)

```ts
interface MissionZone {
  type: 'school' | 'intersection' | 'roundabout';
  bounds: { x: number; z: number; width: number; depth: number };
  speedLimit?: number;
}
// Mission에 추가
zones?: MissionZone[];
stopLine?: { z: number; };       // city_traffic: 적색 판정선
```

## 8. 치명 버그 수정 (동반)

SimulationCanvas useEffect deps `[vehicle, mission, cameraMode,
showTrajectory, showWidthGuide]`에서 UI 토글 3종 제거 →
`uiRefs = useRef({cameraMode, showTrajectory, showWidthGuide})` 미러링 후
animate 루프가 ref를 읽게 변경. effect는 vehicle/mission 변경 시에만 재실행.

## 9. 테스트 계획 (vitest 신설)

- devDependency로 vitest 추가. simulation 상태머신·판정과 TrackBuilder의 신호 rig
  구조를 자동 검증하고, 실제 표시 상태는 브라우저에서 확인한다.
- TrafficLightController: 28초 위상 전환 경계, 전방향 적색 구간, dt 누적·순환.
- TrackBuilder: NS/EW별 독립 신호 rig 수, 교차로 위치, 접근 방향.
- MissionEvaluator:
  - 학교구역 초과속도 → 진입당 1회 감점, 재진입 시 재감점
  - 적색 정지선 통과 → failReason 반환
  - 황색 통과 → 위반 아님
  - yield_check: aggressive 근접 중 진입 → 감점, yielding 차량은 미감점
  - mandatory 아님 위반은 감점만 하고 fail 없음
- 렌더링(Three.js) 영역은 테스트 범위 외 (브라우저 수동 검증).

## 10. 성공 기준

1. 미션 7을 출발→학교구역→신호→좌회전→회전교차로→목표까지 실제 완주 가능.
2. 적색 신호 통과 시 즉시 실패 모달 노출.
3. 학교구역 31km/h 주행 시 감점 토스트 + 점수 차감 확인.
4. C키/T키 토글이 진행 상황을 리셋하지 않음.
5. `npm run build` 통과 + simulation 단위 테스트 전부 green.

## 11. 범위 외 (명시적 제외)

- 회전교차로 신호/보행자, 강우·야간 환경, 새 미션 추가
- 코드 스플리팅·ESLint (P2), README·배포 (P3)
