import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../constants/missions';
import { VEHICLES } from '../../constants/vehicles';
import { CarState, ControlInputs } from '../../types/simulator';
import { HUD } from './HUD';

const renderHud = (showGuidance: boolean) =>
  renderToStaticMarkup(
    <HUD
      vehicle={VEHICLES.sedan}
      mission={MISSIONS.find((mission) => mission.id === 'city_lane_change') ?? MISSIONS[0]}
      carState={{ speed: 50, turnSignal: 'none' } as CarState}
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
      cameraMode="cockpit"
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

  it('안내가 없어도 데스크톱 핸들을 하단 중앙 열에 유지한다', () => {
    const unguided = renderHud(false);

    expect(unguided).toContain('class="hidden lg:col-start-2 lg:block"');
  });
});
