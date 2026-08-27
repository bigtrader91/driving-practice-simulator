import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { ControlInputs, Mission, TrafficVehicleData, VehicleConfig } from '../../types/simulator';
import type { VehicleAssetLibrary } from './VehicleAssetLibrary';
import {
  SimulationCanvas,
  SimulationAssetErrorOverlay,
  SimulationAssetLoadingOverlay,
  createCompletionSafeCleanup,
  preloadSimulationVehicleAssets,
} from './SimulationCanvas';

const hookHarness = vi.hoisted(() => {
  type Slot = { value?: unknown; current?: unknown };
  type Effect = { deps?: unknown[]; cleanup?: () => void; pending?: () => void | (() => void) };
  let slots: Slot[] = [];
  let effects: Effect[] = [];
  let cursor = 0;
  const equalDeps = (left?: unknown[], right?: unknown[]) => (
    left !== undefined
    && right !== undefined
    && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]))
  );
  return {
    reset() {
      slots = [];
      effects = [];
      cursor = 0;
    },
    beginRender() {
      cursor = 0;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (value: unknown) => { slots[index].value = value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || !equalDeps(previous.deps, deps)) {
        effects[index] = { ...previous, deps, pending: effect };
      }
    },
    flushEffects() {
      effects.forEach((effect) => {
        if (!effect.pending) return;
        effect.cleanup?.();
        const pending = effect.pending;
        effect.pending = undefined;
        effect.cleanup = pending() || undefined;
      });
    },
    unmount() {
      [...effects].reverse().forEach((effect) => effect?.cleanup?.());
    },
  };
});

const runtimeMocks = vi.hoisted(() => ({
  loadLibrary: vi.fn(),
  buildTrack: vi.fn(),
  createVisual: vi.fn(),
  syncVisual: vi.fn(),
  disposeVisual: vi.fn(),
  rendererInstances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  animationCallbacks: [] as FrameRequestCallback[],
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    default: actual,
    useState: hookHarness.useState,
    useRef: hookHarness.useRef,
    useEffect: hookHarness.useEffect,
  };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class TestWebGLRenderer {
    domElement = {};
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 0;
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    render = vi.fn();
    dispose = vi.fn();

    constructor() {
      runtimeMocks.rendererInstances.push(this);
    }
  }
  return { ...actual, WebGLRenderer: TestWebGLRenderer };
});

vi.mock('./VehicleAssetLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./VehicleAssetLibrary')>();
  return { ...actual, loadVehicleAssetLibrary: runtimeMocks.loadLibrary };
});

vi.mock('./TrackBuilder', () => ({ buildTrackScene: runtimeMocks.buildTrack }));

vi.mock('./TrafficVehicleVisual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./TrafficVehicleVisual')>();
  runtimeMocks.createVisual.mockImplementation(actual.createTrafficVehicleVisual);
  runtimeMocks.syncVisual.mockImplementation(actual.syncTrafficVehicleVisual);
  runtimeMocks.disposeVisual.mockImplementation(actual.disposeTrafficVehicleVisual);
  return {
    ...actual,
    createTrafficVehicleVisual: runtimeMocks.createVisual,
    syncTrafficVehicleVisual: runtimeMocks.syncVisual,
    disposeTrafficVehicleVisual: runtimeMocks.disposeVisual,
  };
});

vi.mock('./CarModel', () => ({
  createCar3DGroup: () => {
    const makeLight = () => new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    return {
      carGroup: new THREE.Group(),
      steeringWheelMesh: new THREE.Group(),
      frontLeftWheel: new THREE.Group(),
      frontRightWheel: new THREE.Group(),
      rearLeftWheel: new THREE.Group(),
      rearRightWheel: new THREE.Group(),
      leftBlinkerLight: makeLight(),
      leftRearBlinkerLight: makeLight(),
      rightBlinkerLight: makeLight(),
      rightRearBlinkerLight: makeLight(),
      brakeLights: [makeLight(), makeLight()],
    };
  },
}));

const trajectoryMocks = vi.hoisted(() => ({ dispose: vi.fn(), update: vi.fn() }));
vi.mock('./TireTracksOverlay', () => ({
  TrajectoryGuideRenderer: class {
    dispose = trajectoryMocks.dispose;
    update = trajectoryMocks.update;
  },
}));

const soundMocks = vi.hoisted(() => ({
  init: vi.fn(),
  startEngine: vi.fn(),
  stopEngine: vi.fn(),
  speakInstructor: vi.fn(),
  playWarning: vi.fn(),
  playTurnSignalClick: vi.fn(),
  updateEngine: vi.fn(),
  playCollision: vi.fn(),
  playSensorBeep: vi.fn(),
  playSuccess: vi.fn(),
}));
vi.mock('../../audio/soundEffects', () => ({ sounds: soundMocks }));

const makeLibrary = (): VehicleAssetLibrary => ({
  createTrafficSedan: vi.fn(),
});

describe('simulation canvas vehicle asset lifecycle', () => {
  it('starts exactly one preload for the supplied base URL and waits for readiness', async () => {
    let resolveLibrary!: (library: VehicleAssetLibrary) => void;
    const pending = new Promise<VehicleAssetLibrary>((resolve) => {
      resolveLibrary = resolve;
    });
    const loadLibrary = vi.fn(() => pending);
    const onReady = vi.fn();

    preloadSimulationVehicleAssets('/practice/', loadLibrary, onReady, vi.fn());

    expect(loadLibrary).toHaveBeenCalledOnce();
    expect(loadLibrary).toHaveBeenCalledWith('/practice/');
    expect(onReady).not.toHaveBeenCalled();

    const library = makeLibrary();
    resolveLibrary(library);
    await pending;
    await Promise.resolve();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(library);
  });

  it('prevents a late ready update after cancellation', async () => {
    let resolveLibrary!: (library: VehicleAssetLibrary) => void;
    const pending = new Promise<VehicleAssetLibrary>((resolve) => {
      resolveLibrary = resolve;
    });
    const onReady = vi.fn();
    const cancel = preloadSimulationVehicleAssets(
      '/practice/',
      () => pending,
      onReady,
      vi.fn(),
    );

    cancel();
    resolveLibrary(makeLibrary());
    await pending;
    await Promise.resolve();

    expect(onReady).not.toHaveBeenCalled();
  });

  it('prevents a late error update and console log after cancellation', async () => {
    let rejectLibrary!: (error: Error) => void;
    const pending = new Promise<VehicleAssetLibrary>((_resolve, reject) => {
      rejectLibrary = reject;
    });
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cancel = preloadSimulationVehicleAssets(
      '/practice/',
      () => pending,
      vi.fn(),
      onError,
    );

    cancel();
    rejectLibrary(new Error('late failure'));
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('reports the same actionable rejection to the console and error state', async () => {
    const failure = new Error(
      'Failed to load vehicle asset /practice/models/vehicles/traffic-compact.glb: 404',
    );
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    preloadSimulationVehicleAssets(
      '/practice/',
      () => Promise.reject(failure),
      vi.fn(),
      onError,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure.message);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(failure.message, failure);

    consoleError.mockRestore();
  });

  it('renders an accessible visible overlay containing the actionable error', () => {
    const message = 'Failed to load vehicle asset /practice/models/vehicles/traffic-compact.glb: 404';

    const markup = renderToStaticMarkup(<SimulationAssetErrorOverlay message={message} />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain(message);
    expect(markup).toContain('페이지를 새로고침');
    expect(markup).toContain('absolute');
  });

  it('renders an accessible visible loading status', () => {
    const markup = renderToStaticMarkup(<SimulationAssetLoadingOverlay />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('교통 차량 모델을 불러오는 중');
  });

  it('attempts every registered cleanup in reverse order and is terminally idempotent', () => {
    const calls: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cleanup = createCompletionSafeCleanup([
      { label: 'renderer', cleanup: () => calls.push('renderer') },
      { label: 'first traffic visual', cleanup: () => { throw new Error('dispose failed'); } },
      { label: 'instructor timeout', cleanup: () => calls.push('timeout') },
    ]);

    cleanup();
    cleanup();

    expect(calls).toEqual(['timeout', 'renderer']);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to clean up simulation resource first traffic visual: dispose failed',
      expect.objectContaining({ message: 'dispose failed' }),
    );
    consoleError.mockRestore();
  });
});

const vehicleFixture: VehicleConfig = {
  id: 'sedan',
  name: 'test',
  nameEn: 'test',
  category: 'test',
  description: 'test',
  width: 1.82,
  length: 4.65,
  height: 1.45,
  wheelBase: 2.7,
  maxWheelAngle: 0.58,
  maxSteeringWheelTurns: 1.5,
  steeringRatio: 15,
  maxSpeed: 120,
  acceleration: 3,
  brakingPower: 7,
  reverseMaxSpeed: 20,
  color: '#2563eb',
  cockpitPos: [0, 1.2, 0],
  leftMirrorPos: [-1, 1, 0],
  rightMirrorPos: [1, 1, 0],
  rearMirrorPos: [0, 1, 0],
  turningRadius: 5,
};

const missionFixture: Mission = {
  id: 'asset-integration',
  title: 'asset integration',
  subtitle: 'test',
  category: 'traffic',
  difficulty: '보통',
  description: 'test',
  tip: 'test',
  startPos: [10, 0, 0],
  startHeading: 0,
  maxScore: 100,
  objectives: [],
};

const makeInputs = (): ControlInputs => ({
  forward: false,
  backward: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  lookLeft: false,
  lookRight: false,
  lookRear: false,
  signalLeft: true,
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
  isMouseSteeringActive: false,
});

const makeTraffic = (
  id: string,
  type: TrafficVehicleData['type'],
  overrides: Partial<TrafficVehicleData> = {},
): TrafficVehicleData => ({
  id,
  x: 0,
  z: 10,
  speedKmH: 45,
  targetLane: 0,
  laneX: 0,
  color: 0x2563eb,
  type,
  behavior: 'normal',
  isYielding: false,
  isHonking: false,
  isFlashingHighBeam: false,
  ...overrides,
});

const makeBoundAsset = () => {
  const group = new THREE.Group();
  group.name = 'LOADED_TRAFFIC_COMPACT';
  const mesh = (name: string, materialName: string) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = materialName;
    const value = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    value.name = name;
    group.add(value);
    return value;
  };
  const body = mesh('BODY', 'PAINT');
  const headlights = [mesh('HEADLIGHT_L', 'HEADLIGHT'), mesh('HEADLIGHT_R', 'HEADLIGHT')];
  const brakeLights = [mesh('BRAKE_L', 'BRAKE'), mesh('BRAKE_R', 'BRAKE')];
  const frontBlinkers = [
    mesh('BLINKER_FL', 'BLINKER'),
    mesh('BLINKER_FR', 'BLINKER'),
  ] as [THREE.Mesh, THREE.Mesh];
  const rearBlinkers = [
    mesh('BLINKER_RL', 'BLINKER'),
    mesh('BLINKER_RR', 'BLINKER'),
  ] as [THREE.Mesh, THREE.Mesh];
  const wheels = ['FL', 'FR', 'RL', 'RR'].map((suffix) => {
    const wheel = new THREE.Group();
    wheel.name = `WHEEL_${suffix}`;
    group.add(wheel);
    return wheel;
  });
  return {
    group,
    bodyMeshes: [body],
    frontLeftWheel: wheels[0],
    frontRightWheel: wheels[1],
    rearLeftWheel: wheels[2],
    rearRightWheel: wheels[3],
    headlights,
    brakeLights,
    frontBlinkers,
    rearBlinkers,
  };
};

const trafficFixture = () => [
  makeTraffic('sedan-decelerating', 'sedan', { x: 7, behavior: 'yielding' }),
  makeTraffic('suv-orbit', 'suv', {
    motion: 'orbit',
    orbit: { cx: 0, cz: 0, radius: 10, angle: 0, angularSpeed: 0.2, direction: 1 },
  }),
  makeTraffic('truck-oncoming', 'truck', { motion: 'oncoming' }),
  makeTraffic('sedan-yielding-no-decel', 'sedan', {
    x: 7,
    z: 12,
    speedKmH: 30,
    behavior: 'yielding',
  }),
];

const makeComponentProps = () => ({
  vehicle: vehicleFixture,
  mission: missionFixture,
  cameraMode: 'cockpit' as const,
  showTrajectory: false,
  showWidthGuide: false,
  inputsRef: { current: makeInputs() },
  onStateUpdate: vi.fn(),
  onMissionComplete: vi.fn(),
  onMissionFail: vi.fn(),
  onPenalty: vi.fn(),
  onReset: vi.fn(),
});

const container = {
  clientWidth: 800,
  clientHeight: 600,
  replaceChildren: vi.fn(),
};

const renderComponent = (props = makeComponentProps()) => {
  hookHarness.beginRender();
  const element = SimulationCanvas(props) as React.ReactElement<{
    ref: React.MutableRefObject<typeof container | null>;
  }>;
  element.props.ref.current = container;
  return element;
};

describe('SimulationCanvas component integration', () => {
  beforeEach(() => {
    hookHarness.reset();
    runtimeMocks.loadLibrary.mockReset();
    runtimeMocks.buildTrack.mockReset();
    runtimeMocks.createVisual.mockClear();
    runtimeMocks.syncVisual.mockClear();
    runtimeMocks.disposeVisual.mockClear();
    runtimeMocks.rendererInstances.length = 0;
    runtimeMocks.animationCallbacks.length = 0;
    container.replaceChildren.mockClear();
    Object.values(soundMocks).forEach((mock) => mock.mockClear());
    trajectoryMocks.dispose.mockClear();
    trajectoryMocks.update.mockClear();
    runtimeMocks.buildTrack.mockReturnValue({
      trackGroup: new THREE.Group(),
      obstacles: [],
      initialTraffic: trafficFixture(),
      signals: [],
    });
    vi.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 1,
      setTimeout: vi.fn(setTimeout),
      clearTimeout: vi.fn(clearTimeout),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runtimeMocks.animationCallbacks.push(callback);
      return runtimeMocks.animationCallbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    hookHarness.unmount();
    vi.unstubAllGlobals();
  });

  it('mounts with loading UI, waits for the exact base URL, then creates selected visuals', async () => {
    let resolveLibrary!: (library: VehicleAssetLibrary) => void;
    runtimeMocks.loadLibrary.mockReturnValue(new Promise((resolve) => {
      resolveLibrary = resolve;
    }));
    const library = { createTrafficSedan: vi.fn(() => makeBoundAsset()) };

    const loading = renderComponent();
    expect(renderToStaticMarkup(loading)).toContain('role="status"');
    hookHarness.flushEffects();

    expect(runtimeMocks.loadLibrary).toHaveBeenCalledOnce();
    expect(runtimeMocks.loadLibrary).toHaveBeenCalledWith('/');
    expect(runtimeMocks.buildTrack).not.toHaveBeenCalled();
    expect(runtimeMocks.createVisual).not.toHaveBeenCalled();

    resolveLibrary(library);
    await Promise.resolve();
    await Promise.resolve();
    renderComponent();
    hookHarness.flushEffects();

    expect(runtimeMocks.buildTrack).toHaveBeenCalledOnce();
    expect(runtimeMocks.createVisual).toHaveBeenCalledTimes(4);
    expect(library.createTrafficSedan).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.createVisual.mock.results.map(({ value }) => value.group.name)).toEqual([
      'LOADED_TRAFFIC_COMPACT',
      'PROCEDURAL_TRAFFIC_SUV',
      'PROCEDURAL_TRAFFIC_TRUCK',
      'LOADED_TRAFFIC_COMPACT',
    ]);

    const frame = runtimeMocks.animationCallbacks[0];
    frame(performance.now() + 16);
    expect(runtimeMocks.syncVisual.mock.calls.map((call) => ({
      id: call[1].id,
      type: call[1].type,
      motion: call[1].motion ?? 'forward',
      isYielding: call[1].isYielding,
      state: call[3],
    }))).toEqual([
      {
        id: 'sedan-decelerating',
        type: 'sedan',
        motion: 'forward',
        isYielding: true,
        state: { isBraking: true },
      },
      {
        id: 'suv-orbit',
        type: 'suv',
        motion: 'orbit',
        isYielding: false,
        state: { isBraking: false },
      },
      {
        id: 'truck-oncoming',
        type: 'truck',
        motion: 'oncoming',
        isYielding: false,
        state: { isBraking: false },
      },
      {
        id: 'sedan-yielding-no-decel',
        type: 'sedan',
        motion: 'forward',
        isYielding: true,
        state: { isBraking: false },
      },
    ]);

    hookHarness.unmount();
    expect(runtimeMocks.disposeVisual).toHaveBeenCalledTimes(4);
    runtimeMocks.createVisual.mock.results.forEach(({ value }) => {
      expect(runtimeMocks.disposeVisual).toHaveBeenCalledWith(value);
    });
  });

  it('shows the active load failure in the console and alert without constructing a fallback', async () => {
    const failure = new Error(
      'Failed to load vehicle asset /models/vehicles/traffic-compact.glb: 404',
    );
    runtimeMocks.loadLibrary.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderComponent();
    hookHarness.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    const failed = renderComponent();
    hookHarness.flushEffects();

    const markup = renderToStaticMarkup(failed);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(failure.message);
    expect(markup).toContain('페이지를 새로고침');
    expect(consoleError).toHaveBeenCalledWith(failure.message, failure);
    expect(runtimeMocks.buildTrack).not.toHaveBeenCalled();
    expect(runtimeMocks.createVisual).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rolls back the first visual and every renderer when the second visual throws', async () => {
    runtimeMocks.loadLibrary.mockResolvedValue({
      createTrafficSedan: vi.fn(() => makeBoundAsset()),
    });
    const firstVisual = {
      group: new THREE.Group(),
      headlights: [],
      brakeLights: [],
      wheels: [],
      lastPosition: new THREE.Vector2(),
    };
    runtimeMocks.createVisual.mockImplementationOnce(() => firstVisual)
      .mockImplementationOnce(() => {
      throw new Error('second visual failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mirror = { current: {} as HTMLCanvasElement };
    const props = {
      ...makeComponentProps(),
      leftMirrorCanvasRef: mirror,
      rightMirrorCanvasRef: mirror,
      rearMirrorCanvasRef: mirror,
      backupCameraCanvasRef: mirror,
    };

    renderComponent(props);
    hookHarness.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    renderComponent(props);
    hookHarness.flushEffects();
    const failed = renderComponent(props);

    expect(renderToStaticMarkup(failed)).toContain('second visual failed');
    expect(runtimeMocks.disposeVisual).toHaveBeenCalledOnce();
    expect(runtimeMocks.rendererInstances).toHaveLength(5);
    runtimeMocks.rendererInstances.forEach(({ dispose }) => {
      expect(dispose).toHaveBeenCalledOnce();
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to initialize driving simulation: second visual failed',
      expect.objectContaining({ message: 'second visual failed' }),
    );
    consoleError.mockRestore();
  });

  it('attempts every visual and renderer cleanup and clears the instructor timeout after a dispose failure', async () => {
    runtimeMocks.loadLibrary.mockResolvedValue({
      createTrafficSedan: vi.fn(() => makeBoundAsset()),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderComponent();
    hookHarness.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    renderComponent();
    hookHarness.flushEffects();
    runtimeMocks.disposeVisual.mockImplementationOnce(() => {
      throw new Error('visual cleanup failed');
    });

    hookHarness.unmount();
    hookHarness.unmount();

    expect(runtimeMocks.disposeVisual).toHaveBeenCalledTimes(4);
    expect(runtimeMocks.rendererInstances).toHaveLength(1);
    expect(runtimeMocks.rendererInstances[0].dispose).toHaveBeenCalledOnce();
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1200);
    expect(window.clearTimeout).toHaveBeenCalledOnce();
    expect(soundMocks.stopEngine).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to clean up simulation resource traffic visual sedan-yielding-no-decel: visual cleanup failed',
      expect.objectContaining({ message: 'visual cleanup failed' }),
    );
    consoleError.mockRestore();
  });
});
