import { Mission } from '../types/simulator';

export const MISSIONS: Mission[] = [
  {
    id: 'highway_5lane',
    title: '★ 5~6차선 대로 & 고속화도로 실전 차선변경',
    subtitle: '양보해주는 차량과 양보 없이 가속하는 차량 분별 훈련',
    category: 'highway',
    difficulty: '보통',
    description: '차량 통행량이 많은 5~6차선 도로에서 5차로에서 시작하여 1차로(또는 반대)로 안전하게 차선을 변경하세요. 깜빡이를 켰을 때 뒤차가 속도를 줄여 양보하는지(상향등 1회 깜빡임), 아니면 속도를 올려 추월하려는지 사이드미러로 확인 후 진입해야 합니다.',
    tip: '💡 실전 팁: 깜빡이를 켜고 즉시 들어가지 말고, 3초간 사이드미러로 뒤차의 크기 변화(다가오면 가속 중, 멀어지거나 그대로면 양보 감속 중)를 확인한 뒤 부드럽게 들어가세요!',
    startPos: [8, 0, 160],
    startHeading: 0,
    targetArea: {
      x: -8,
      z: -180,
      width: 8,
      depth: 10,
    },
    maxScore: 100,
    laneCount: 6,
    objectives: [
      { id: 'reach_exit', text: '1차로 목표 지점까지 안전 진출', isCompleted: false, isMandatory: true, scorePenalty: 40 },
      { id: 'signal_check', text: '차선 변경 3초 전 깜빡이 켜기', isCompleted: false, isMandatory: false, scorePenalty: 25 },
      { id: 'yield_check', text: '비양보 가속 차량 앞 무리한 끼어들기 금지', isCompleted: false, isMandatory: false, scorePenalty: 30 },
      { id: 'shoulder_check', text: '사각지대 숄더체크 & 사이드미러 확인', isCompleted: false, isMandatory: false, scorePenalty: 20 },
    ]
  },
  {
    id: 'width_slalom',
    title: '1. 차폭감 익히기 & 좁은 길 통과',
    subtitle: '보닛 너머 차체 감각과 타이어 궤적선 익히기',
    category: 'width',
    difficulty: '쉬움',
    description: '도로 양쪽에 늘어선 라바콘과 좁은 통로를 차폭 가이드선을 보며 장애물에 닿지 않고 통과하세요.',
    tip: '💡 팁: 운전석 시야에서 보닛 중앙선과 오른쪽 와이퍼 관절이 도로 경계선에 닿는 느낌을 눈에 익히면 차폭감이 잡힙니다. (T키로 궤적선 ON)',
    startPos: [0, 0, 40],
    startHeading: 0,
    targetArea: {
      x: 0,
      z: -50,
      width: 6,
      depth: 6,
    },
    maxScore: 100,
    objectives: [
      { id: 'reach_goal', text: '목표 지점까지 도달하기', isCompleted: false, isMandatory: true, scorePenalty: 50 },
      { id: 'no_cone_hit', text: '라바콘 및 장애물 충돌하지 않기', isCompleted: false, isMandatory: false, scorePenalty: 20 },
      { id: 'stay_in_lane', text: '도로 경계 연석 밟지 않기', isCompleted: false, isMandatory: false, scorePenalty: 15 },
    ]
  },
  {
    id: 'curve_s',
    title: '2. S자 곡선 코스 주행',
    subtitle: '부드러운 핸들링과 내륜차/외륜차 감각 체득',
    category: 'curve',
    difficulty: '보통',
    description: '연속으로 굽어지는 S자 코스를 이탈 없이 통과하세요. 전륜과 후륜의 회전 반경 차이(내륜차)를 확인하세요.',
    tip: '💡 팁: 코너를 돌 때 앞바퀴보다 뒷바퀴가 안쪽으로 더 파고듭니다. 바깥쪽 연석에 앞바퀴를 30~50cm 여유 두고 붙여서 크게 돌아야 뒷바퀴가 탈선하지 않습니다.',
    startPos: [0, 0, 60],
    startHeading: 0,
    targetArea: {
      x: 0,
      z: -60,
      width: 8,
      depth: 8,
    },
    maxScore: 100,
    objectives: [
      { id: 'reach_goal', text: 'S자 코스 완주하기', isCompleted: false, isMandatory: true, scorePenalty: 50 },
      { id: 'no_curb_touch', text: '좌우 연석 탈선하지 않기', isCompleted: false, isMandatory: false, scorePenalty: 30 },
      { id: 'smooth_speed', text: '속도 20km/h 이하로 안전 서행', isCompleted: false, isMandatory: false, scorePenalty: 10 },
    ]
  },
  {
    id: 'curve_t',
    title: '3. 직각(T자) 코스 - 기능시험 공식',
    subtitle: '정확한 회전 타이밍과 후진 수정 감각 익히기',
    category: 'curve',
    difficulty: '보통',
    description: '직각 코스에 진입하여 끝부분 검지선을 확인(일시정지 후 삐-소리)하고, 안전하게 탈출하세요.',
    tip: '💡 팁: 어깨선이 코너 모서리와 일치할 때 핸들을 끝까지 감아 돌리는 것이 기능시험 공식의 핵심입니다.',
    startPos: [-20, 0, 30],
    startHeading: 0,
    targetArea: {
      x: 20,
      z: 30,
      width: 6,
      depth: 6,
    },
    maxScore: 100,
    objectives: [
      { id: 'reach_goal', text: '직각 코스 진입 및 탈출 완료', isCompleted: false, isMandatory: true, scorePenalty: 50 },
      { id: 'no_line_step', text: '검지선 및 탈선 0회 유지', isCompleted: false, isMandatory: false, scorePenalty: 25 },
      { id: 'stop_at_end', text: '주차 확인선에서 2초간 정지', isCompleted: false, isMandatory: false, scorePenalty: 15 },
    ]
  },
  {
    id: 'parking_reverse',
    title: '4. 후진(T자) 주차 마스터',
    subtitle: '사이드미러와 후방 카메라로 아파트/마트 주차 정복',
    category: 'parking',
    difficulty: '보통',
    description: '지정된 주차선 박스 안에 차량을 후진으로 반듯하게 넣고 기어를 P로 변경하세요.',
    tip: '💡 팁: 주차하려는 칸의 모서리가 내 차의 뒷바퀴 축 또는 어깨에 왔을 때 반대편으로 45도 전진 후, 후진 기어(R)를 넣고 핸들을 꺾어 진입합니다.',
    startPos: [-6, 0, 10],
    startHeading: Math.PI / 2, // facing right
    targetArea: {
      x: 0,
      z: -12,
      width: 2.8,
      depth: 5.5,
      targetHeading: Math.PI, // parked facing forward
      toleranceHeading: 0.25,
    },
    maxScore: 100,
    objectives: [
      { id: 'park_in_box', text: '주차선 내 완벽 안착 (오차 20cm 이내)', isCompleted: false, isMandatory: true, scorePenalty: 40 },
      { id: 'parallel_angle', text: '차체 수평 각도 정렬 (10도 이내)', isCompleted: false, isMandatory: false, scorePenalty: 20 },
      { id: 'no_obstacle_hit', text: '인접 차량 및 스토퍼 충돌 없음', isCompleted: false, isMandatory: false, scorePenalty: 30 },
      { id: 'gear_p', text: '주차 완료 후 P단 체결 및 핸드브레이크', isCompleted: false, isMandatory: false, scorePenalty: 10 },
    ]
  },
  {
    id: 'parking_parallel',
    title: '5. 평행 주차 (갓길 주차) 마스터',
    subtitle: '앞뒤 차 사이 45도 공식으로 쏙 집어넣기',
    category: 'parking',
    difficulty: '어려움',
    description: '앞차와 뒷차가 주차된 사이 공간에 갓길 평행 주차를 성공시키세요.',
    tip: '💡 팁: ① 앞차와 1m 간격 나란히 정지 → ② 핸들 오른쪽 끝까지 감고 후진 → ③ 뒷차 번호판이 왼쪽 사이드미러에 보이면(45도) 핸들 정렬 후 후진 → ④ 앞차 범퍼를 비껴갈 때 핸들 왼쪽 끝까지 감기!',
    startPos: [3.5, 0, 15],
    startHeading: 0,
    targetArea: {
      x: 3.5,
      z: -3,
      width: 2.6,
      depth: 6.8,
      targetHeading: 0,
      toleranceHeading: 0.2,
    },
    maxScore: 100,
    objectives: [
      { id: 'park_parallel', text: '평행 주차 구역 내 안착', isCompleted: false, isMandatory: true, scorePenalty: 50 },
      { id: 'no_front_rear_hit', text: '앞차 및 뒷차 범퍼 비접촉', isCompleted: false, isMandatory: false, scorePenalty: 30 },
      { id: 'curb_distance', text: '보도블록 연석과의 간격 30cm 이내', isCompleted: false, isMandatory: false, scorePenalty: 20 },
    ]
  },
  {
    id: 'city_lane_change',
    title: '6. 시내 도로 & 미러 확인 차선 변경',
    subtitle: '깜빡이 켜기 + 사이드미러 숄더체크 필수 훈련',
    category: 'traffic',
    difficulty: '보통',
    description: '3차로 시내 도로에서 3차로 → 2차로 → 1차로로 순차적으로 차선을 변경하여 목표 IC로 진출하세요.',
    tip: '💡 팁: 차선 변경 30m 전에 깜빡이를 켜고([ / ] 키), 사이드미러와 룸미러를 확인(Q/E 키 또는 마우스 회전)해야 감점을 피할 수 있습니다!',
    startPos: [7, 0, 80],
    startHeading: 0,
    targetArea: {
      x: -7,
      z: -120,
      width: 6,
      depth: 8,
    },
    maxScore: 100,
    objectives: [
      { id: 'finish_route', text: '목표 교차로까지 안전하게 진출', isCompleted: false, isMandatory: true, scorePenalty: 40 },
      { id: 'signal_before_change', text: '차선 변경 전 방향지시등 작동', isCompleted: false, isMandatory: false, scorePenalty: 25 },
      { id: 'mirror_check', text: '차선 변경 전 사이드미러/숄더체크 확인', isCompleted: false, isMandatory: false, scorePenalty: 25 },
      { id: 'keep_speed_limit', text: '규정 속도 60km/h 준수', isCompleted: false, isMandatory: false, scorePenalty: 10 },
    ]
  },
  {
    id: 'city_traffic',
    title: '7. 종합 도로주행 (신호등, 어린이보호구역, 회전교차로)',
    subtitle: '실전 운전에서 가장 헷갈리는 도로 규칙 총집합',
    category: 'traffic',
    difficulty: '어려움',
    description: '신호등 교차로, 비보호 좌회전 구역, 30km 어린이보호구역, 회전교차로를 규칙에 맞게 통과하세요.',
    tip: '💡 팁: 어린이보호구역에서는 30km/h 초과 시 감점되며, 비보호 좌회전은 반드시 직진 녹색 신호일 때 반대편 직진 차량이 없을 때만 가능합니다.',
    startPos: [0, 0, 140],
    startHeading: 0,
    targetArea: {
      x: -80,
      z: 90,
      width: 8,
      depth: 8,
    },
    zones: [
      { type: 'school', bounds: { x: 0, z: 80, width: 24, depth: 40 }, speedLimit: 30 },
      { type: 'intersection', bounds: { x: 0, z: 30, width: 24, depth: 16 } },
      { type: 'roundabout', bounds: { x: -80, z: 30, width: 48, depth: 48 } },
    ],
    stopLine: { z: 36 },
    maxScore: 100,
    objectives: [
      { id: 'complete_city', text: '종합 주행 코스 완주', isCompleted: false, isMandatory: true, scorePenalty: 40 },
      { id: 'stop_at_red', text: '적색 신호 정지선 준수 (신호위반 금지)', isCompleted: false, isMandatory: true, scorePenalty: 30 },
      { id: 'school_zone_speed', text: '어린이보호구역 30km/h 이하 준수', isCompleted: false, isMandatory: false, scorePenalty: 15 },
      { id: 'unprotected_left', text: '비보호 좌회전 안전 진입', isCompleted: false, isMandatory: false, scorePenalty: 15 },
      { id: 'roundabout_yield', text: '회전교차로 순환 차량 양보 후 진입', isCompleted: false, isMandatory: false, scorePenalty: 15 },
    ]
  }
];
