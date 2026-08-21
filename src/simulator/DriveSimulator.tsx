import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Eye,
  Flag, Gauge, Keyboard, Map as MapIcon, RotateCcw, Settings,
  Volume2, VolumeX, X,
} from 'lucide-react';
import {
  ACTIONS, ActionId, CameraMode, DEFAULT_BINDINGS, DEFAULT_SETTINGS,
  GearMode, KeyBindings, MISSIONS, MissionMode, SimulatorSettings,
  VEHICLES, VehicleOption, keyLabel, loadBindings, loadMissionId,
  loadSettings, loadVehicleId, saveBindings, saveMissionId, saveSettings,
  saveVehicleId,
} from './config';
import {
  INITIAL_TELEMETRY, SimulatorInputs, SimulatorScene, Telemetry,
  resumeSimulatorSound,
} from './SimulatorScene';

/*
 * Runtime invariants implemented in SimulatorScene and checked by CI:
 * vehicle.maxSteeringWheelTurns*360, vehicle.steeringRatio, frontDegrees,
 * lastSafe restoration with speed=0, settings.cameraMotion with a .03 roll cap,
 * and the gear interlock stationary&&inputs.brake.
 */

const cycleCamera = (mode: CameraMode): CameraMode => mode === 'cockpit' ? 'hood' : mode === 'hood' ? 'chase' : mode === 'chase' ? 'top' : 'cockpit';
const cameraLabel = (mode: CameraMode) => mode === 'cockpit' ? '운전석' : mode === 'hood' ? '보닛' : mode === 'chase' ? '추적' : '탑뷰';
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const Modal: React.FC<{ title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, eyebrow, onClose, children, wide }) => (
  <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
      <header className="modal-header">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
      </header>
      {children}
    </section>
  </div>
);

interface SteeringProps {
  vehicle: VehicleOption;
  telemetry: Telemetry;
  inputsRef: React.MutableRefObject<SimulatorInputs>;
  settings: SimulatorSettings;
}

const SteeringWheel: React.FC<SteeringProps> = ({ vehicle, telemetry, inputsRef, settings }) => {
  const wheelRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const lastAngleRef = useRef(0);
  const displayRef = useRef(telemetry.wheelDegrees);
  const [display, setDisplay] = useState(telemetry.wheelDegrees);
  const maximum = vehicle.maxSteeringWheelTurns * 360;

  useEffect(() => {
    if (!draggingRef.current) {
      displayRef.current = telemetry.wheelDegrees;
      setDisplay(telemetry.wheelDegrees);
    }
  }, [telemetry.wheelDegrees]);

  const pointerAngle = (event: React.PointerEvent) => {
    const rectangle = wheelRef.current?.getBoundingClientRect();
    if (!rectangle) return 0;
    return Math.atan2(event.clientY - (rectangle.top + rectangle.height / 2), event.clientX - (rectangle.left + rectangle.width / 2)) * 180 / Math.PI;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resumeSimulatorSound();
    draggingRef.current = true;
    pointerRef.current = event.pointerId;
    lastAngleRef.current = pointerAngle(event);
    displayRef.current = inputsRef.current.wheelDegrees;
    inputsRef.current.steeringHeld = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current || pointerRef.current !== event.pointerId) return;
    const nextAngle = pointerAngle(event);
    let delta = nextAngle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngleRef.current = nextAngle;
    const resistance = 1 - Math.pow(Math.abs(displayRef.current) / maximum, 3) * 0.2;
    const next = clamp(displayRef.current + delta * settings.steeringSensitivity * resistance, -maximum, maximum);
    const reachedLimit = Math.abs(next) >= maximum - 0.5 && Math.abs(displayRef.current) < maximum - 0.5;
    displayRef.current = next;
    inputsRef.current.wheelDegrees = next;
    setDisplay(next);
    if (reachedLimit && 'vibrate' in navigator) navigator.vibrate(18);
  };

  const release = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    pointerRef.current = null;
    inputsRef.current.steeringHeld = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  };

  const direction = Math.abs(display) < 8 ? '정렬' : Math.abs(display) > maximum - 5 ? `${display > 0 ? '우' : '좌'} 끝점` : `${display > 0 ? '우' : '좌'} ${Math.round(Math.abs(display))}°`;
  return (
    <div className="steering-module">
      <div className="steering-readout"><i data-active={Math.abs(display) > 8} /><strong>{direction}</strong><span>{(display / 360).toFixed(2)}바퀴 · 앞바퀴 {Math.abs(telemetry.frontWheelDegrees).toFixed(1)}°</span></div>
      <button ref={wheelRef} type="button" className="steering-wheel-control" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={release} onPointerCancel={release} onContextMenu={(event) => event.preventDefault()} style={{ touchAction: 'none' }} aria-label="좌클릭한 채 원형으로 돌려 조향">
        <span className="steering-wheel-rotor" style={{ transform: `rotate(${display}deg)` }}>
          <span className="steering-center-band" /><span className="steering-spoke horizontal" /><span className="steering-spoke bottom" />
          <span className="steering-hub"><b>DRIVE</b><small>HOLD & TURN</small></span>
        </span>
      </button>
      <div className="steering-instruction">좌클릭 유지 + 원형 드래그 · 좌우 최대 {vehicle.maxSteeringWheelTurns}바퀴</div>
    </div>
  );
};

const MissionSelector: React.FC<{ current: MissionMode; onSelect: (mission: MissionMode) => void; onClose: () => void }> = ({ current, onSelect, onClose }) => {
  const [group, setGroup] = useState<'all' | MissionMode['group']>('all');
  const missions = group === 'all' ? MISSIONS : MISSIONS.filter((mission) => mission.group === group);
  return (
    <Modal title="도로 상황별 코스 선택" eyebrow="연습 모드" onClose={onClose} wide>
      <nav className="segmented-row">
        {([['all', '전체'], ['basic', '기본 조작'], ['license', '장내 기능'], ['road', '도로주행']] as const).map(([id, label]) => <button type="button" key={id} data-active={group === id} onClick={() => setGroup(id)}>{label}</button>)}
      </nav>
      <div className="mission-grid">
        {missions.map((mission) => (
          <button type="button" key={mission.id} className="mission-card" data-active={mission.id === current.id} onClick={() => onSelect(mission)}>
            <span className="mission-number">{String(mission.order).padStart(2, '0')}</span>
            <span><b>{mission.title}</b><em data-level={mission.difficulty}>{mission.difficulty}</em><small>{mission.subtitle}</small><p>{mission.description}</p></span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    </Modal>
  );
};

interface SettingsPanelProps {
  settings: SimulatorSettings;
  bindings: KeyBindings;
  vehicle: VehicleOption;
  onSettings: (settings: SimulatorSettings) => void;
  onBindings: (bindings: KeyBindings) => void;
  onVehicle: (vehicle: VehicleOption) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, bindings, vehicle, onSettings, onBindings, onVehicle, onClose }) => {
  const [tab, setTab] = useState<'controls' | 'view'>('controls');
  const [rebinding, setRebinding] = useState<ActionId | null>(null);
  useEffect(() => {
    if (!rebinding) return;
    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') { setRebinding(null); return; }
      const next = { ...bindings };
      const conflict = (Object.keys(next) as ActionId[]).find((action) => action !== rebinding && next[action] === event.code);
      if (conflict) next[conflict] = next[rebinding];
      next[rebinding] = event.code;
      onBindings(next);
      setRebinding(null);
    };
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, [rebinding, bindings, onBindings]);

  const change = <K extends keyof SimulatorSettings>(key: K, value: SimulatorSettings[K]) => onSettings({ ...settings, [key]: value });
  return (
    <Modal title="내 손과 화면에 맞추기" eyebrow="조작 및 화면 설정" onClose={onClose} wide>
      <nav className="settings-tabs">
        <button type="button" data-active={tab === 'controls'} onClick={() => setTab('controls')}><Keyboard size={16} /> 조작·키 설정</button>
        <button type="button" data-active={tab === 'view'} onClick={() => setTab('view')}><Eye size={16} /> 화면·시야</button>
      </nav>
      <div className="settings-scroll">
        {tab === 'controls' ? <>
          <section className="settings-section"><h3>차종과 실제 조향 범위</h3><div className="vehicle-grid">{VEHICLES.map((item) => <button type="button" key={item.id} data-active={item.id === vehicle.id} onClick={() => onVehicle(item)}><b>{item.name}</b><span>{item.category}</span><small>차폭 {item.width.toFixed(2)}m · 조향비 {item.steeringRatio}:1</small></button>)}</div></section>
          <section className="settings-section"><div className="section-heading"><div><h3>키보드 배치</h3><p>중복 키는 두 기능 사이에서 자동 교환됩니다.</p></div><button type="button" className="text-button" onClick={() => onBindings({ ...DEFAULT_BINDINGS })}>기본값</button></div><div className="binding-grid">{ACTIONS.map((action) => <div className="binding-row" key={action.id}><span>{action.label}</span><button type="button" data-listening={rebinding === action.id} onClick={() => setRebinding(action.id)}>{rebinding === action.id ? '새 키를 누르세요' : keyLabel(bindings[action.id])}</button></div>)}</div></section>
          <section className="settings-section two-column"><label><span>핸들 감도 <em>{settings.steeringSensitivity.toFixed(2)}×</em></span><input type="range" min="0.55" max="1.65" step="0.05" value={settings.steeringSensitivity} onChange={(event) => change('steeringSensitivity', Number(event.target.value))} /></label><label><span>주행 중 복원력 <em>{settings.steeringReturn.toFixed(2)}×</em></span><input type="range" min="0.4" max="1.8" step="0.05" value={settings.steeringReturn} onChange={(event) => change('steeringReturn', Number(event.target.value))} /></label></section>
        </> : <>
          <section className="settings-section two-column">
            <label><span>시야각 <em>{settings.fov}°</em></span><input type="range" min="50" max="86" value={settings.fov} onChange={(event) => change('fov', Number(event.target.value))} /></label>
            <label><span>좌석 높이 <em>{settings.seatHeight.toFixed(2)}m</em></span><input type="range" min="-0.18" max="0.24" step="0.01" value={settings.seatHeight} onChange={(event) => change('seatHeight', Number(event.target.value))} /></label>
            <label><span>좌석 앞뒤 <em>{settings.seatForeAft.toFixed(2)}m</em></span><input type="range" min="-0.32" max="0.32" step="0.01" value={settings.seatForeAft} onChange={(event) => change('seatForeAft', Number(event.target.value))} /></label>
            <label><span>미러 크기 <em>{settings.mirrorScale.toFixed(2)}×</em></span><input type="range" min="0.75" max="1.25" step="0.05" value={settings.mirrorScale} onChange={(event) => change('mirrorScale', Number(event.target.value))} /></label>
            <label><span>HUD 크기 <em>{settings.hudScale.toFixed(2)}×</em></span><input type="range" min="0.8" max="1.2" step="0.05" value={settings.hudScale} onChange={(event) => change('hudScale', Number(event.target.value))} /></label>
          </section>
          <section className="settings-section"><h3>카메라 움직임</h3><div className="segmented-row inline">{([['off', '고정'], ['comfort', '편안함'], ['realistic', '현실감']] as const).map(([id, label]) => <button type="button" key={id} data-active={settings.cameraMotion === id} onClick={() => change('cameraMotion', id)}>{label}</button>)}</div><p>화면 롤은 고정 0°, 편안함 ±1.25°, 현실감 ±1.72° 이내로 제한됩니다.</p></section>
          <section className="settings-section"><h3>미러 표시</h3><div className="segmented-row inline">{([['auto', '필요할 때'], ['always', '항상'], ['off', '숨김']] as const).map(([id, label]) => <button type="button" key={id} data-active={settings.mirrorMode === id} onClick={() => change('mirrorMode', id)}>{label}</button>)}</div></section>
          <section className="settings-section toggles">
            <label><span>컴팩트 HUD</span><input type="checkbox" checked={settings.compactHud} onChange={(event) => change('compactHud', event.target.checked)} /></label>
            <label><span>한국어 음성 코칭</span><input type="checkbox" checked={settings.voiceGuide} onChange={(event) => change('voiceGuide', event.target.checked)} /></label>
            <label><span>궤적선 기본 표시</span><input type="checkbox" checked={settings.showTrajectory} onChange={(event) => change('showTrajectory', event.target.checked)} /></label>
            <label><span>차폭선 기본 표시</span><input type="checkbox" checked={settings.showWidthGuide} onChange={(event) => change('showWidthGuide', event.target.checked)} /></label>
          </section>
        </>}
      </div>
      <footer className="modal-footer"><button type="button" className="secondary-button" onClick={() => { onBindings({ ...DEFAULT_BINDINGS }); onSettings({ ...DEFAULT_SETTINGS }); }}>모두 기본값</button><button type="button" className="primary-button" onClick={onClose}>저장하고 닫기</button></footer>
    </Modal>
  );
};

export const DriveSimulator: React.FC = () => {
  const [mission, setMission] = useState(() => MISSIONS.find((item) => item.id === loadMissionId()) ?? MISSIONS[0]);
  const [vehicle, setVehicle] = useState(() => VEHICLES.find((item) => item.id === loadVehicleId()) ?? VEHICLES[1]);
  const [settings, setSettings] = useState(() => loadSettings());
  const [bindings, setBindings] = useState(() => loadBindings());
  const [cameraMode, setCameraMode] = useState<CameraMode>('cockpit');
  const [telemetry, setTelemetry] = useState<Telemetry>({ ...INITIAL_TELEMETRY, speedLimit: mission.speedLimitKmh, laneCount: mission.laneCount });
  const [resetToken, setResetToken] = useState(0);
  const [showMissions, setShowMissions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [completion, setCompletion] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'info' | 'warning' | 'success' } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  const cameraRef = useRef(cameraMode);
  const mutedRef = useRef(muted);
  const leftMirrorRef = useRef<HTMLCanvasElement | null>(null);
  const rightMirrorRef = useRef<HTMLCanvasElement | null>(null);
  const rearMirrorRef = useRef<HTMLCanvasElement | null>(null);
  const backupRef = useRef<HTMLCanvasElement | null>(null);
  const inputsRef = useRef<SimulatorInputs>({ throttle: false, brake: false, lookLeft: false, lookRight: false, lookRear: false, toggleLeft: false, toggleRight: false, toggleHazard: false, toggleParkingBrake: false, horn: false, pendingGear: null, wheelDegrees: 0, steeringHeld: false });

  useEffect(() => { settingsRef.current = settings; saveSettings(settings); }, [settings]);
  useEffect(() => { cameraRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const bindingsByCode = useMemo(() => { const result = new Map<string, ActionId>(); (Object.keys(bindings) as ActionId[]).forEach((action) => result.set(bindings[action], action)); return result; }, [bindings]);
  const clearHeldInputs = useCallback(() => { inputsRef.current.throttle = false; inputsRef.current.brake = false; inputsRef.current.lookLeft = false; inputsRef.current.lookRight = false; inputsRef.current.lookRear = false; inputsRef.current.steeringHeld = false; }, []);
  const reset = useCallback(() => { clearHeldInputs(); inputsRef.current.wheelDegrees = 0; inputsRef.current.pendingGear = null; setCompletion(null); setTelemetry({ ...INITIAL_TELEMETRY, speedLimit: mission.speedLimitKmh, laneCount: mission.laneCount }); setResetToken((value) => value + 1); }, [clearHeldInputs, mission]);

  useEffect(() => {
    if (showSettings || showMissions || showHelp || completion !== null) clearHeldInputs();
  }, [showSettings, showMissions, showHelp, completion, clearHeldInputs]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (showSettings || showMissions || showHelp || completion !== null) return;
      const action = bindingsByCode.get(event.code);
      if (!action) return;
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      resumeSimulatorSound();
      if (action === 'throttle') inputsRef.current.throttle = true;
      else if (action === 'brake') inputsRef.current.brake = true;
      else if (action === 'lookLeft') inputsRef.current.lookLeft = true;
      else if (action === 'lookRight') inputsRef.current.lookRight = true;
      else if (action === 'lookRear') inputsRef.current.lookRear = true;
      else if (!event.repeat) {
        if (action === 'signalLeft') inputsRef.current.toggleLeft = true;
        else if (action === 'signalRight') inputsRef.current.toggleRight = true;
        else if (action === 'hazard') inputsRef.current.toggleHazard = true;
        else if (action === 'parkingBrake') inputsRef.current.toggleParkingBrake = true;
        else if (action === 'horn') inputsRef.current.horn = true;
        else if (action === 'gearP') inputsRef.current.pendingGear = 'P';
        else if (action === 'gearR') inputsRef.current.pendingGear = 'R';
        else if (action === 'gearN') inputsRef.current.pendingGear = 'N';
        else if (action === 'gearD') inputsRef.current.pendingGear = 'D';
        else if (action === 'camera') setCameraMode((mode) => cycleCamera(mode));
        else if (action === 'trajectory') setSettings((value) => ({ ...value, showTrajectory: !value.showTrajectory }));
        else if (action === 'widthGuide') setSettings((value) => ({ ...value, showWidthGuide: !value.showWidthGuide }));
        else if (action === 'reset') reset();
        else if (action === 'hud') setHudVisible((value) => !value);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const action = bindingsByCode.get(event.code);
      if (action === 'throttle') inputsRef.current.throttle = false;
      if (action === 'brake') inputsRef.current.brake = false;
      if (action === 'lookLeft') inputsRef.current.lookLeft = false;
      if (action === 'lookRight') inputsRef.current.lookRight = false;
      if (action === 'lookRear') inputsRef.current.lookRear = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearHeldInputs);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearHeldInputs); };
  }, [bindingsByCode, clearHeldInputs, completion, reset, showHelp, showMissions, showSettings]);

  const showNotice = useCallback((message: string, tone: 'info' | 'warning' | 'success' = 'info') => {
    setNotice({ message, tone });
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'warning' ? 3600 : 2600);
  }, []);
  const complete = useCallback((score: number) => setCompletion(score), []);
  const chooseMission = (next: MissionMode) => { saveMissionId(next.id); setMission(next); setShowMissions(false); setCompletion(null); inputsRef.current.wheelDegrees = 0; setTelemetry({ ...INITIAL_TELEMETRY, speedLimit: next.speedLimitKmh, laneCount: next.laneCount }); setResetToken((value) => value + 1); };
  const chooseVehicle = (next: VehicleOption) => { saveVehicleId(next.id); setVehicle(next); inputsRef.current.wheelDegrees = 0; setResetToken((value) => value + 1); };
  const saveNewBindings = (next: KeyBindings) => { setBindings(next); saveBindings(next); };
  const nextMission = () => { const index = MISSIONS.findIndex((item) => item.id === mission.id); chooseMission(MISSIONS[(index + 1) % MISSIONS.length]); };
  const mirrorsEnabled = settings.mirrorMode !== 'off' && (cameraMode === 'cockpit' || cameraMode === 'hood');
  const leftVisible = mirrorsEnabled && (settings.mirrorMode === 'always' || telemetry.turnSignal === 'left' || telemetry.turnSignal === 'hazard' || telemetry.leftChecked);
  const rightVisible = mirrorsEnabled && (settings.mirrorMode === 'always' || telemetry.turnSignal === 'right' || telemetry.turnSignal === 'hazard' || telemetry.rightChecked);
  const activeDistance = telemetry.gear === 'R' ? telemetry.rearDistance : telemetry.frontDistance;

  return (
    <main className={`driveprep-app camera-${cameraMode} ${settings.compactHud ? 'compact-hud' : 'expanded-hud'} ${telemetry.collision ? 'collision-flash' : ''}`} style={{ '--hud-scale': settings.hudScale, '--mirror-scale': settings.mirrorScale } as React.CSSProperties}>
      <SimulatorScene mission={mission} vehicle={vehicle} resetToken={resetToken} inputsRef={inputsRef} settingsRef={settingsRef} cameraRef={cameraRef} mutedRef={mutedRef} leftMirrorRef={leftMirrorRef} rightMirrorRef={rightMirrorRef} rearMirrorRef={rearMirrorRef} backupRef={backupRef} onTelemetry={setTelemetry} onNotice={showNotice} onComplete={complete} />
      {(cameraMode === 'cockpit' || cameraMode === 'hood') && <div className="cockpit-shell" />}
      <div className="mirror-layer">
        <div className="mirror-frame rear-mirror" data-visible={mirrorsEnabled}><canvas ref={rearMirrorRef} width={336} height={112} /><span>ROOM</span></div>
        <div className="mirror-frame side-mirror left-mirror" data-visible={leftVisible} data-checked={telemetry.leftChecked}><canvas ref={leftMirrorRef} width={240} height={140} /><span>LEFT</span></div>
        <div className="mirror-frame side-mirror right-mirror" data-visible={rightVisible} data-checked={telemetry.rightChecked}><canvas ref={rightMirrorRef} width={240} height={140} /><span>RIGHT</span></div>
        <div className="backup-camera" data-visible={telemetry.gear === 'R'}><canvas ref={backupRef} width={360} height={220} /><div className="backup-guides"><i /><i /><i /></div><span>R · 후방카메라</span></div>
      </div>
      {hudVisible && <div className="hud-layer">
        <header className="top-hud-row">
          <button type="button" className="mission-chip" onClick={() => setShowMissions(true)}><span>{String(mission.order).padStart(2, '0')}</span><span><b>{mission.title}</b><small>{mission.subtitle}</small></span><ChevronRight size={17} /></button>
          <div className="top-tools"><div className="score-chip" data-tone={telemetry.score >= 80 ? 'good' : telemetry.score >= 60 ? 'caution' : 'danger'}><span>안전점수</span><b>{telemetry.score}</b></div><button type="button" className="tool-button" onClick={() => setCameraMode((mode) => cycleCamera(mode))}><Camera size={17} /><span>{cameraLabel(cameraMode)}</span></button><button type="button" className="tool-button icon-only" onClick={reset}><RotateCcw size={18} /></button><button type="button" className="tool-button icon-only" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button type="button" className="tool-button icon-only" onClick={() => setShowSettings(true)}><Settings size={18} /></button><button type="button" className="tool-button icon-only" onClick={() => setShowHelp(true)}><CircleHelp size={18} /></button></div>
        </header>
        <div className="status-ribbon"><span><MapIcon size={14} />{telemetry.zoneLabel}</span><span><Gauge size={14} />제한 {telemetry.speedLimit}km/h</span><span>{formatTime(telemetry.elapsed)}</span>{telemetry.laneCount > 1 && <span>{telemetry.lane}/{telemetry.laneCount}차로</span>}{telemetry.trafficLight !== 'off' && <span data-signal={telemetry.trafficLight}>{telemetry.trafficLight === 'green' ? '녹색' : telemetry.trafficLight === 'yellow' ? '황색' : '적색'} 신호</span>}</div>
        {notice && <div className="notice-banner" data-tone={notice.tone}>{notice.message}</div>}
        {telemetry.trafficWarning !== 'none' && <div className="traffic-warning" data-tone={telemetry.trafficWarning}>{telemetry.trafficWarning === 'yielding' ? '뒤차가 감속 중입니다. 계속 확인하며 진입하세요.' : '뒤차가 가속 중입니다. 차선 변경을 멈추세요.'}</div>}
        {activeDistance > 0 && activeDistance < 3.2 && <div className="proximity-chip" data-danger={activeDistance < 0.8}>{telemetry.gear === 'R' ? '후방' : '전방'} {activeDistance.toFixed(1)}m</div>}
        <section className="bottom-hud-row">
          <div className="left-controls"><div className="pedal-card"><div data-active={telemetry.throttle > 0.05}><kbd>{keyLabel(bindings.throttle)}</kbd><span>엑셀</span><i style={{ height: `${telemetry.throttle * 100}%` }} /></div><div data-active={telemetry.brake > 0.05}><kbd>{keyLabel(bindings.brake)}</kbd><span>풋브레이크</span><i style={{ height: `${telemetry.brake * 100}%` }} /></div></div><div className="quick-keys">{([['signalLeft', '좌깜빡이'], ['signalRight', '우깜빡이'], ['lookLeft', '좌미러'], ['lookRight', '우미러'], ['parkingBrake', '주차B'], ['hazard', '비상등']] as [ActionId, string][]).map(([action, label]) => <span key={action}><kbd>{keyLabel(bindings[action])}</kbd>{label}</span>)}</div><div className="guide-toggles"><button type="button" data-active={settings.showTrajectory} onClick={() => setSettings((value) => ({ ...value, showTrajectory: !value.showTrajectory }))}>궤적선 {keyLabel(bindings.trajectory)}</button><button type="button" data-active={settings.showWidthGuide} onClick={() => setSettings((value) => ({ ...value, showWidthGuide: !value.showWidthGuide }))}>차폭선 {keyLabel(bindings.widthGuide)}</button></div></div>
          <SteeringWheel vehicle={vehicle} telemetry={telemetry} inputsRef={inputsRef} settings={settings} />
          <div className="instrument-cluster"><div className="blinker-row"><span data-active={telemetry.turnSignal === 'left' || telemetry.turnSignal === 'hazard'}><ChevronLeft size={24} /></span><b>{telemetry.speedKmh}</b><span data-active={telemetry.turnSignal === 'right' || telemetry.turnSignal === 'hazard'}><ChevronRight size={24} /></span></div><div className="speed-unit">km/h</div><div className="gear-row">{(['P', 'R', 'N', 'D'] as GearMode[]).map((gear) => <button type="button" key={gear} data-active={telemetry.gear === gear} onClick={() => { resumeSimulatorSound(); inputsRef.current.pendingGear = gear; }}>{gear}<small>{keyLabel(bindings[`gear${gear}` as ActionId])}</small></button>)}</div><div className="cluster-meta"><span data-active={telemetry.parkingBrake}>PARK</span><span>{vehicle.name}</span><span>{telemetry.wheelTurns.toFixed(2)} turn</span></div></div>
        </section>
      </div>}
      {!hudVisible && <button type="button" className="restore-hud" onClick={() => setHudVisible(true)}>HUD 표시 · {keyLabel(bindings.hud)}</button>}
      {showMissions && <MissionSelector current={mission} onSelect={chooseMission} onClose={() => setShowMissions(false)} />}
      {showSettings && <SettingsPanel settings={settings} bindings={bindings} vehicle={vehicle} onSettings={setSettings} onBindings={saveNewBindings} onVehicle={chooseVehicle} onClose={() => setShowSettings(false)} />}
      {showHelp && <Modal title="왼손 키보드 + 오른손 마우스" eyebrow="빠른 조작 안내" onClose={() => setShowHelp(false)}><div className="help-layout"><div className="mouse-help"><div className="mouse-shape"><i /></div><b>핸들을 좌클릭한 채 원형으로 돌리기</b><p>화면 마우스 위치만으로는 조향되지 않습니다. 버튼을 놓으면 주행 속도에 따라 복원됩니다.</p></div><div className="help-keys">{ACTIONS.filter((action) => ['pedal', 'signal', 'mirror', 'gear'].includes(action.group)).map((action) => <span key={action.id}><kbd>{keyLabel(bindings[action.id])}</kbd>{action.label}</span>)}</div></div><div className="help-callout">W는 항상 엑셀, S는 항상 풋브레이크이며 전진·후진 방향은 D/R단이 결정합니다. P/R/D 변속은 정지 후 풋브레이크를 밟은 상태에서만 됩니다.</div><footer className="modal-footer"><button type="button" className="primary-button" onClick={() => setShowHelp(false)}>연습 계속하기</button></footer></Modal>}
      {completion !== null && <div className="modal-backdrop completion"><section className="completion-card"><CheckCircle2 size={50} /><span>COURSE COMPLETE</span><h2>{mission.title} 완료</h2><div><b>{completion}</b><small>/100</small></div><p>{completion >= 90 ? '안정적인 조작과 절차를 잘 지켰습니다.' : completion >= 70 ? '완주했습니다. 감점 구간을 한 번 더 반복해 보세요.' : '저속 조작과 안전 확인 절차부터 다시 연습해 보세요.'}</p><footer><button type="button" className="secondary-button" onClick={reset}><RotateCcw size={16} />다시 연습</button><button type="button" className="primary-button" onClick={nextMission}>다음 코스<ChevronRight size={16} /></button></footer></section></div>}
    </main>
  );
};

export default DriveSimulator;
