import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { releaseTransientInputs } from './simulation/InputSafety';
import {
  VehicleConfig,
  CarState,
  ControlInputs,
  Mission,
  CameraViewMode,
  ProximitySensorData,
  ScoreDeduction,
  TrafficVehicleData,
  GearMode,
} from './types/simulator';
import { VEHICLES } from './constants/vehicles';
import { MISSIONS } from './constants/missions';
import { SimulationCanvas } from './components/3d/SimulationCanvas';
import { HUD } from './components/ui/HUD';
import { MirrorOverlay } from './components/ui/MirrorOverlay';
import { RealisticCockpitFrame } from './components/ui/RealisticCockpitFrame';
import { MissionSelector } from './components/ui/MissionSelector';
import { VehicleSelector } from './components/ui/VehicleSelector';
import { FeedbackModal } from './components/ui/FeedbackModal';
import { ControlPanel } from './components/ui/ControlPanel';
import { MobileControls } from './components/ui/MobileControls';
import { TrainingFlowOverlay } from './components/ui/TrainingFlowOverlay';
import { sounds } from './audio/soundEffects';
import {
  beginPostAssessment,
  completeTrainingAttempt,
  createTrainingSession,
  hasActiveGuidance,
  isTrainingAttemptActive,
  shouldRevealAttemptResult,
  startTrainingSession,
} from './simulation/TrainingSession';
import { missionForTrainingAttempt } from './simulation/TrainingMission';
import {
  assessMissionResult,
  AttemptAssessment,
  AttemptEvent,
  isAttemptPassed,
} from './simulation/AttemptAssessment';

const LANE_CHANGE_MISSION = MISSIONS.find((mission) => mission.id === 'city_lane_change') ?? MISSIONS[0];

export const App: React.FC = () => {
  // Config & Mission state
  const [currentVehicle, setCurrentVehicle] = useState<VehicleConfig>(VEHICLES.sedan);
  const [currentMission, setCurrentMission] = useState<Mission>(LANE_CHANGE_MISSION);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('cockpit');
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showWidthGuide, setShowWidthGuide] = useState(true);
  const [useRealisticCockpitOverlay, setUseRealisticCockpitOverlay] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Modals state
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [lastCompletedScore, setLastCompletedScore] = useState(100);
  const [lastDeductions, setLastDeductions] = useState<ScoreDeduction[]>([]);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [trainingSession, setTrainingSession] = useState(createTrainingSession);
  const [pendingAttemptResult, setPendingAttemptResult] = useState<{
    score: number;
    passed: boolean;
    assessment: AttemptAssessment;
  } | null>(null);
  const trainingAttemptActive = isTrainingAttemptActive(trainingSession);
  const showTrainingGuidance = hasActiveGuidance(trainingSession);

  // Real-time Sim State
  const [carState, setCarState] = useState<CarState>({
    x: currentMission.startPos[0],
    y: currentMission.startPos[1],
    z: currentMission.startPos[2],
    speed: 0,
    speedMs: 0,
    steerAngle: 0,
    steeringWheelAngle: 0,
    steeringWheelTurns: 0,
    steeringWheelDegrees: 0,
    heading: currentMission.startHeading,
    gear: 'D',
    isBraking: false,
    isAccelerating: false,
    isHandbrake: false,
    turnSignal: 'none',
    headlights: true,
    leftMirrorLooked: false,
    rightMirrorLooked: false,
    rearMirrorLooked: false,
    lastMirrorCheckTime: 0,
    inCollision: false,
    rpm: 800,
    odometer: 0,
  });

  const [sensors, setSensors] = useState<ProximitySensorData>({
    frontLeft: -1,
    frontCenter: -1,
    frontRight: -1,
    rearLeft: -1,
    rearCenter: -1,
    rearRight: -1,
    minDistance: -1,
  });

  const [trafficData, setTrafficData] = useState<TrafficVehicleData[]>([]);
  const [currentScore, setCurrentScore] = useState(100);
  const [recentPenalty, setRecentPenalty] = useState<ScoreDeduction | null>(null);

  // Key / Input Ref
  const inputsRef = useRef<ControlInputs>({
    forward: false,
    backward: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    lookLeft: false,
    lookRight: false,
    lookRear: false,
    signalLeft: false,
    signalRight: false,
    hazard: false,
    gearP: false,
    gearR: false,
    gearN: false,
    gearD: false,
    horn: false,
    toggleView: false,
    toggleTrajectory: false,
    toggleWidthGuide: false,
    resetPosition: false,
    mouseYaw: 0,
    mousePitch: 0,
    mouseSteerRatio: 0,
    isMouseSteeringActive: true,
  });

  // Mirror Canvas Refs
  const leftMirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightMirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rearMirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backupCameraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [simKey, setSimKey] = useState(0);

  const handleResetCar = useCallback(() => {
    releaseTransientInputs(inputsRef.current, true);
    setCurrentScore(100);
    setRecentPenalty(null);
    setShowFeedbackModal(false);
    setFailReason(null);
    setSimKey((prev) => prev + 1);
  }, []);

  const handleGearChange = useCallback((g: GearMode) => {
    sounds.resume();
    if (g === 'P') inputsRef.current.gearP = true;
    if (g === 'R') inputsRef.current.gearR = true;
    if (g === 'N') inputsRef.current.gearN = true;
    if (g === 'D') inputsRef.current.gearD = true;
  }, []);

  const handleMouseSteer = useCallback((ratio: number) => {
    inputsRef.current.mouseSteerRatio = THREE.MathUtils.clamp(ratio, -1.0, 1.0);
    inputsRef.current.isMouseSteeringActive = true;
  }, []);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inputs = inputsRef.current;
      sounds.resume();

      switch (e.code) {
        // Pedals
        case 'KeyW':
        case 'ArrowUp':
          inputs.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          inputs.backward = true;
          break;
        case 'ArrowLeft':
          inputs.steerLeft = true;
          inputs.isMouseSteeringActive = false;
          e.preventDefault();
          break;
        case 'ArrowRight':
          inputs.steerRight = true;
          inputs.isMouseSteeringActive = false;
          e.preventDefault();
          break;

        // Gears (Fixed: D key is Drive!)
        case 'KeyD':
        case 'Digit4':
          inputs.gearD = true;
          break;
        case 'KeyP':
        case 'Digit1':
          inputs.gearP = true;
          break;
        case 'KeyR':
          if (e.ctrlKey || e.metaKey) return;
          inputs.gearR = true;
          break;
        case 'Digit2':
          inputs.gearR = true;
          break;
        case 'KeyN':
        case 'Digit3':
          inputs.gearN = true;
          break;

        // Turn Signals & Hazard
        case 'KeyA':
        case 'BracketLeft':
          inputs.signalLeft = true;
          break;
        case 'KeyF':
        case 'BracketRight':
          inputs.signalRight = true;
          break;
        case 'Space':
        case 'KeyZ':
          inputs.hazard = true;
          e.preventDefault();
          break;

        // Mirrors
        case 'KeyQ':
          inputs.lookLeft = true;
          break;
        case 'KeyE':
          inputs.lookRight = true;
          break;
        case 'Tab':
        case 'KeyX':
          inputs.lookRear = true;
          e.preventDefault();
          break;

        // Camera & Guides
        case 'KeyC':
          setCameraMode((prev) => {
            if (prev === 'cockpit') return 'chase';
            if (prev === 'chase') return 'top';
            if (prev === 'top') return 'hood';
            return 'cockpit';
          });
          break;
        case 'KeyT':
          setShowTrajectory((prev) => !prev);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const inputs = inputsRef.current;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          inputs.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          inputs.backward = false;
          break;
        case 'ArrowLeft':
          inputs.steerLeft = false;
          break;
        case 'ArrowRight':
          inputs.steerRight = false;
          break;
        case 'KeyD':
        case 'Digit4':
          inputs.gearD = false;
          break;
        case 'KeyP':
        case 'Digit1':
          inputs.gearP = false;
          break;
        case 'KeyR':
        case 'Digit2':
          inputs.gearR = false;
          break;
        case 'KeyN':
        case 'Digit3':
          inputs.gearN = false;
          break;
        case 'KeyQ':
          inputs.lookLeft = false;
          break;
        case 'KeyE':
          inputs.lookRight = false;
          break;
        case 'Tab':
        case 'KeyX':
          inputs.lookRear = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const releaseInputs = () => releaseTransientInputs(inputsRef.current);
    const handleVisibilityChange = () => {
      if (document.hidden) releaseInputs();
    };
    window.addEventListener('blur', releaseInputs);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseInputs);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleStateUpdate = useCallback((state: CarState, sensorData: ProximitySensorData, tfData?: TrafficVehicleData[]) => {
    setCarState({ ...state });
    setSensors(sensorData);
    if (tfData) setTrafficData([...tfData]);
  }, []);

  const handlePenalty = useCallback((deduction: ScoreDeduction) => {
    setRecentPenalty(deduction);
    setCurrentScore((prev) => Math.max(0, prev - deduction.points));
    setTimeout(() => {
      setRecentPenalty((prev) => (prev?.id === deduction.id ? null : prev));
    }, 2800);
  }, []);

  const handleMissionComplete = useCallback((
    score: number,
    deductions: ScoreDeduction[],
    events: AttemptEvent[],
  ) => {
    const assessment = assessMissionResult(events);
    setLastCompletedScore(score);
    setLastDeductions(deductions);
    setPendingAttemptResult({
      score,
      passed: isAttemptPassed(score >= 70, assessment),
      assessment,
    });
    setShowFeedbackModal(true);
  }, []);

  const handleMissionFail = useCallback((
    reason: string,
    score: number,
    deductions: ScoreDeduction[],
    events: AttemptEvent[],
  ) => {
    setLastCompletedScore(score);
    setLastDeductions(deductions);
    setFailReason(reason);
    setPendingAttemptResult({ score, passed: false, assessment: assessMissionResult(events) });
    setShowFeedbackModal(true);
  }, []);

  const handleNextTrainingAttempt = useCallback(() => {
    if (!pendingAttemptResult) {
      throw new Error('현재 훈련 시도의 완료 결과가 없습니다.');
    }
    const nextSession = completeTrainingAttempt(trainingSession, pendingAttemptResult);
    setTrainingSession(nextSession);
    setPendingAttemptResult(null);
    setShowFeedbackModal(false);
    setFailReason(null);
    if (nextSession.lifecycle === 'active' && nextSession.currentAttempt) {
      setCurrentMission(missionForTrainingAttempt(LANE_CHANGE_MISSION, nextSession.currentAttempt.direction));
      handleResetCar();
    }
  }, [handleResetCar, pendingAttemptResult, trainingSession]);

  const handleSelectMissionAfterFailure = useCallback(() => {
    setPendingAttemptResult(null);
    setLastCompletedScore(100);
    setLastDeductions([]);
    setFailReason(null);
    setShowFeedbackModal(false);
    setShowMissionModal(true);
  }, []);

  return (
    <div className="w-screen h-screen relative bg-slate-950 overflow-hidden select-none">
      {/* 3D Simulation Canvas */}
      {trainingAttemptActive && <SimulationCanvas
        key={`${currentVehicle.id}-${currentMission.id}-${simKey}`}
        vehicle={currentVehicle}
        mission={currentMission}
        cameraMode={cameraMode}
        showTrajectory={showTrainingGuidance && showTrajectory}
        showWidthGuide={showTrainingGuidance && showWidthGuide}
        guidanceEnabled={showTrainingGuidance}
        resultFeedbackEnabled={shouldRevealAttemptResult(trainingSession.currentAttempt)}
        inputsRef={inputsRef}
        onStateUpdate={handleStateUpdate}
        onMissionComplete={handleMissionComplete}
        onMissionFail={handleMissionFail}
        onPenalty={handlePenalty}
        onReset={handleResetCar}
        leftMirrorCanvasRef={leftMirrorCanvasRef}
        rightMirrorCanvasRef={rightMirrorCanvasRef}
        rearMirrorCanvasRef={rearMirrorCanvasRef}
        backupCameraCanvasRef={backupCameraCanvasRef}
      />}

      {/* Photorealistic Cockpit Frame */}
      <RealisticCockpitFrame
        vehicle={currentVehicle}
        carState={carState}
        isVisible={false}
      />

      {/* Mirrors & Cameras Overlay (Non-overlapping, High Visibility) */}
      <MirrorOverlay
        cameraMode={cameraMode}
        gear={carState.gear}
        leftMirrorCanvasRef={leftMirrorCanvasRef}
        rightMirrorCanvasRef={rightMirrorCanvasRef}
        rearMirrorCanvasRef={rearMirrorCanvasRef}
        backupCameraCanvasRef={backupCameraCanvasRef}
        isLeftLooked={carState.leftMirrorLooked}
        isRightLooked={carState.rightMirrorLooked}
      />

      {/* Main HUD */}
      <HUD
        vehicle={currentVehicle}
        mission={currentMission}
        carState={carState}
        sensors={sensors}
        trafficData={trafficData}
        score={currentScore}
        recentPenalty={recentPenalty}
        cameraMode={cameraMode}
        onCameraToggle={() => {
          setCameraMode((prev) =>
            prev === 'cockpit' ? 'chase' : prev === 'chase' ? 'top' : prev === 'top' ? 'hood' : 'cockpit'
          );
        }}
        showTrajectory={showTrajectory}
        onTrajectoryToggle={() => setShowTrajectory((prev) => !prev)}
        showWidthGuide={showWidthGuide}
        onWidthGuideToggle={() => setShowWidthGuide((prev) => !prev)}
        inputs={inputsRef.current}
        onGearChange={handleGearChange}
        onMouseSteer={handleMouseSteer}
        showGuidance={showTrainingGuidance}
      />

      {/* Control Utility Toolbar */}
      <ControlPanel
        onOpenMissions={() => setShowMissionModal(true)}
        onOpenVehicles={() => setShowVehicleModal(true)}
        onResetCar={handleResetCar}
        isMuted={isMuted}
        onToggleMute={() => {
          const muted = sounds.toggleMute();
          setIsMuted(muted);
        }}
        onGearSelect={handleGearChange}
        currentGear={carState.gear}
        missionChangeDisabled={trainingAttemptActive}
        vehicleChangeDisabled={trainingAttemptActive}
        resetDisabled={trainingAttemptActive}
        guidanceDisabled={trainingAttemptActive && !showTrainingGuidance}
      />

      {/* Mobile Touch Controls */}
      <MobileControls
        inputsRef={inputsRef}
        currentGear={carState.gear}
        currentTurnSignal={carState.turnSignal}
        onGearChange={handleGearChange}
      />

      {/* Mission Selector Modal */}
      {showMissionModal && (
        <MissionSelector
          currentMissionId={currentMission.id}
          onSelectMission={(m) => {
            setCurrentMission(m);
            handleResetCar();
          }}
          onClose={() => setShowMissionModal(false)}
        />
      )}

      {/* Vehicle Selector Modal */}
      {showVehicleModal && (
        <VehicleSelector
          currentVehicleId={currentVehicle.id}
          onSelectVehicle={(v) => {
            setCurrentVehicle(v);
            handleResetCar();
          }}
          onClose={() => setShowVehicleModal(false)}
        />
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          mission={currentMission}
          score={lastCompletedScore}
          deductions={lastDeductions}
          passed={pendingAttemptResult?.passed}
          failReason={failReason ?? undefined}
          onRetry={() => {
            setPendingAttemptResult(null);
            handleResetCar();
          }}
          onSelectMission={handleSelectMissionAfterFailure}
          onNextMission={handleNextTrainingAttempt}
          nextLabel={
            trainingSession.currentAttempt?.id === 'guided-right'
              ? '사후 평가 안내 보기'
              : trainingSession.currentAttempt?.id === 'post-5'
                ? '결과 보기'
                : trainingSession.currentAttempt?.phase === 'post-assessment'
                  ? '다음 평가'
                  : '다음 훈련'
          }
          isScored={trainingSession.currentAttempt?.scored ?? true}
          revealResult={shouldRevealAttemptResult(trainingSession.currentAttempt)}
        />
      )}

      <TrainingFlowOverlay
        session={trainingSession}
        onStart={() => {
          const session = startTrainingSession(trainingSession);
          if (!session.currentAttempt) throw new Error('첫 훈련 시도가 생성되지 않았습니다.');
          setCurrentMission(missionForTrainingAttempt(LANE_CHANGE_MISSION, session.currentAttempt.direction));
          setTrainingSession(session);
          handleResetCar();
        }}
        onBeginPostAssessment={() => {
          const session = beginPostAssessment(trainingSession);
          if (!session.currentAttempt) throw new Error('사후 평가 시도가 생성되지 않았습니다.');
          setCurrentMission(missionForTrainingAttempt(LANE_CHANGE_MISSION, session.currentAttempt.direction));
          setTrainingSession(session);
          handleResetCar();
        }}
        onRestart={() => {
          setTrainingSession(createTrainingSession());
          setPendingAttemptResult(null);
          handleResetCar();
        }}
      />
    </div>
  );
};
export default App;
