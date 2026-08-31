import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../constants/missions';
import { VEHICLES } from '../../constants/vehicles';
import { CameraViewMode, CarState, ControlInputs } from '../../types/simulator';
import { HUD } from './HUD';

const renderHud = (showGuidance: boolean, cameraMode: CameraViewMode = 'cockpit') =>
  renderToStaticMarkup(
    <HUD
      vehicle={VEHICLES.sedan}
      mission={MISSIONS.find((mission) => mission.id === 'city_lane_change') ?? MISSIONS[0]}
      carState={{ speed: 50, gear: 'D', turnSignal: 'none' } as CarState}
      sensors={{
        frontLeft: -1,
        frontCenter: -1,
        frontRight: -1,
        rearLeft: -1,
        rearCenter: -1,
        rearRight: -1,
        minDistance: -1,
      }}
      trafficData={[]}
      score={100}
      recentPenalty={null}
      cameraMode={cameraMode}
      onCameraToggle={() => undefined}
      showTrajectory
      onTrajectoryToggle={() => undefined}
      showWidthGuide
      onWidthGuideToggle={() => undefined}
      inputs={{} as ControlInputs}
      onGearChange={() => undefined}
      onMouseSteer={() => undefined}
      showGuidance={showGuidance}
    />
  );

describe('HUD guidance', () => {
  it('안내 모드와 무관하게 DrivePrep 3D 브랜드를 표시한다', () => {
    expect(renderHud(false)).toContain('class="hidden lg:block"');
    expect(renderHud(false)).toContain('DrivePrep 3D');
    expect(renderHud(true)).toContain('DrivePrep 3D');
  });

  it('무안내 시도에서도 기본 조작표는 유지하고 절차 안내와 보조선 토글은 숨긴다', () => {
    const unguided = renderHud(false);
    expect(unguided).not.toContain('6. 시내 도로 &amp; 미러 확인 차선 변경');
    expect(unguided).not.toContain('깜빡이 켜기 + 사이드미러 숄더체크 필수 훈련');
    expect(unguided).not.toContain('💡 팁:');
    expect(unguided).not.toContain('사각지대 숄더체크');
    expect(unguided).toContain('키보드 조작 가이드');
    expect(unguided).toContain('A 좌깜빡이');
    expect(unguided).not.toContain('궤적선 (T)');

    const guided = renderHud(true);
    expect(guided).toContain('6. 시내 도로 &amp; 미러 확인 차선 변경');
    expect(guided).toContain('깜빡이 켜기 + 사이드미러 숄더체크 필수 훈련');
    expect(guided).toContain('💡 팁:');
    expect(guided).toContain('A 좌깜빡이');
    expect(guided).toContain('궤적선 (T)');
  });

  it('cockpit omits the 2D wheel while external views retain it', () => {
    const cockpit = renderHud(true, 'cockpit');
    const chase = renderHud(true, 'chase');

    expect(cockpit).not.toContain('DRIVE');
    expect(chase).toContain('DRIVE');
  });

  it('cockpit keeps the speed, gear, mission, and keyboard guidance output', () => {
    const cockpit = renderHud(true, 'cockpit');

    expect(cockpit).toContain('50');
    expect(cockpit).toContain('D (4)');
    expect(cockpit).toContain('6. 시내 도로 &amp; 미러 확인 차선 변경');
    expect(cockpit).toContain('키보드 조작 가이드');
  });

  it('모바일에서도 축약 미션 설명과 숄더체크 상태를 시각적으로 제공한다', () => {
    const cockpit = renderHud(true, 'cockpit');

    expect(cockpit).toContain('data-hud-overlay="mobile-mission-status"');
    expect(cockpit).toContain('lg:hidden');
    expect(cockpit).toContain('portrait:top-60');
    expect(cockpit).toContain('portrait:left-3');
    expect(cockpit).toContain('깜빡이 켜기 + 사이드미러 숄더체크 필수 훈련');
    expect(cockpit).toContain('좌 Q');
    expect(cockpit).toContain('룸');
    expect(cockpit).toContain('우 E');
  });

  it('안내가 없어도 외부 시점의 데스크톱 핸들을 하단 중앙 열에 유지한다', () => {
    const unguided = renderHud(false, 'chase');

    expect(unguided).toContain('class="hidden lg:col-start-2 lg:block"');
  });
});
