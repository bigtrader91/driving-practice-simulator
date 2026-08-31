import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ControlHelp, ControlPanel } from './ControlPanel';

const makeProps = (): React.ComponentProps<typeof ControlPanel> => ({
  onOpenMissions: () => undefined,
  onOpenVehicles: () => undefined,
  onResetCar: () => undefined,
  isMuted: false,
  onToggleMute: () => undefined,
  onGearSelect: () => undefined,
  currentGear: 'D',
  missionChangeDisabled: true,
  vehicleChangeDisabled: true,
  resetDisabled: true,
  guidanceDisabled: true,
});

describe('ControlPanel', () => {
  it('태블릿 폭에서는 필수 유틸리티를 아이콘형 가로 막대로 유지한다', () => {
    const html = renderToStaticMarkup(<ControlPanel {...makeProps()} />);

    expect(html).toContain('md:flex');
    expect(html).toContain('md:top-64');
    expect(html).toContain('md:flex-row');
    expect(html).toContain('md:hidden lg:inline');
  });

  it('1024px 이상 1280px 미만에서는 우측 미러 아래 세로 도구 모음을 사용한다', () => {
    const html = renderToStaticMarkup(
      <ControlPanel
        onOpenMissions={() => undefined}
        onOpenVehicles={() => undefined}
        onResetCar={() => undefined}
        isMuted={false}
        onToggleMute={() => undefined}
        onGearSelect={() => undefined}
        currentGear="D"
        missionChangeDisabled
        vehicleChangeDisabled
        resetDisabled
        guidanceDisabled
      />
    );

    expect(html).toContain('right-3');
    expect(html).toContain('lg:top-36 lg:flex-col lg:items-end');
    expect(html).toContain('xl:top-4 xl:right-44 xl:flex-row');
  });

  it('활성 무안내 시도에서는 코스 변경과 조작법 안내를 잠근다', () => {
    const html = renderToStaticMarkup(
      <ControlPanel
        onOpenMissions={() => undefined}
        onOpenVehicles={() => undefined}
        onResetCar={() => undefined}
        isMuted={false}
        onToggleMute={() => undefined}
        onGearSelect={() => undefined}
        currentGear="D"
        missionChangeDisabled
        vehicleChangeDisabled
        resetDisabled
        guidanceDisabled
      />
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="훈련 중에는 코스를 변경할 수 없습니다\."/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="훈련 중에는 차종을 변경할 수 없습니다\."/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="훈련 중 재시작은 결과 화면에서 선택하세요\."/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="무안내 시도에서는 조작법 안내를 볼 수 없습니다\."/);
  });

  it('조작법 도움말은 실제 키보드와 마우스 매핑을 안내한다', () => {
    const html = renderToStaticMarkup(<ControlHelp onClose={() => undefined} />);

    expect(html).toContain('마우스 이동');
    expect(html).toContain('A / [');
    expect(html).toContain('F / ]');
    expect(html).toContain('Space / Z');
    expect(html).not.toContain('A / D');
    expect(html).not.toContain('사이드 브레이크');
    expect(html).not.toContain('마우스 드래그');
  });
});
