import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ControlInputs } from '../../types/simulator';
import { MobileControls } from './MobileControls';

const createInputs = (): ControlInputs => ({
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

type ButtonElement = React.ReactElement<{
  'aria-label'?: string;
  onClick?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onLostPointerCapture?: () => void;
}>;

const collectButtons = (node: React.ReactNode): ButtonElement[] => {
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  const descendants = React.Children.toArray(element.props.children).flatMap(collectButtons);
  return element.type === 'button'
    ? [element as ButtonElement, ...descendants]
    : descendants;
};

const renderControls = (
  inputs: ControlInputs,
  onGearChange = vi.fn(),
  currentTurnSignal: 'none' | 'left' | 'right' | 'hazard' = 'none',
) => {
  const props = {
    inputsRef: { current: inputs },
    currentGear: 'D' as const,
    currentTurnSignal,
    onGearChange,
  };
  return {
    buttons: collectButtons(MobileControls(props) as React.ReactNode),
    html: renderToStaticMarkup(<MobileControls {...props} />),
  };
};

const buttonNamed = (buttons: ButtonElement[], label: string) => {
  const button = buttons.find((candidate) => candidate.props['aria-label'] === label);
  expect(button, `${label} button`).toBeDefined();
  return button!;
};

describe('MobileControls', () => {
  it('모바일 미션에 필요한 전체 조작을 접근 가능한 버튼으로 제공한다', () => {
    const { html } = renderControls(createInputs());

    [
      '왼쪽 조향',
      '오른쪽 조향',
      '브레이크',
      '엑셀',
      'P 기어',
      'R 기어',
      'N 기어',
      'D 기어',
      '좌측 방향지시등',
      '비상등',
      '우측 방향지시등',
      '좌측 미러 확인',
      '룸미러 확인',
      '우측 미러 확인',
    ].forEach((label) => expect(html).toContain(`aria-label="${label}"`));
    expect(html).toContain('aria-label="D 기어" aria-pressed="true"');
  });

  it('기어와 방향지시등 입력을 기존 주행 입력 경로로 전달한다', () => {
    const inputs = createInputs();
    const onGearChange = vi.fn();
    const { buttons } = renderControls(inputs, onGearChange);

    buttonNamed(buttons, 'R 기어').props.onClick?.();
    buttonNamed(buttons, '좌측 방향지시등').props.onClick?.();
    buttonNamed(buttons, '비상등').props.onClick?.();

    expect(onGearChange).toHaveBeenCalledWith('R');
    expect(inputs.signalLeft).toBe(true);
    expect(inputs.hazard).toBe(true);
  });

  it('미러 확인은 포인터를 누르는 동안만 유지한다', () => {
    const inputs = createInputs();
    const { buttons } = renderControls(inputs);
    const mirror = buttonNamed(buttons, '좌측 미러 확인');
    const setPointerCapture = vi.fn();

    mirror.props.onPointerDown?.({
      pointerId: 7,
      currentTarget: { setPointerCapture },
    } as unknown as React.PointerEvent<HTMLButtonElement>);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(inputs.lookLeft).toBe(true);

    mirror.props.onPointerUp?.();
    expect(inputs.lookLeft).toBe(false);
  });

  it('키보드로 누른 hold 조작은 keyup과 blur에서 해제한다', () => {
    const inputs = createInputs();
    const { buttons } = renderControls(inputs);
    const accelerator = buttonNamed(buttons, '엑셀');
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    accelerator.props.onKeyDown?.({
      key: ' ',
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(inputs.forward).toBe(true);

    accelerator.props.onKeyUp?.({
      key: ' ',
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    expect(inputs.forward).toBe(false);

    accelerator.props.onKeyDown?.({
      key: 'Enter',
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    expect(inputs.forward).toBe(true);
    accelerator.props.onBlur?.();
    expect(inputs.forward).toBe(false);
  });

  it('pointer cancel과 capture 상실에서도 hold 조작을 해제한다', () => {
    const inputs = createInputs();
    const { buttons } = renderControls(inputs);
    const steering = buttonNamed(buttons, '왼쪽 조향');
    const pointerEvent = {
      pointerId: 3,
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as React.PointerEvent<HTMLButtonElement>;

    steering.props.onPointerDown?.(pointerEvent);
    expect(inputs.steerLeft).toBe(true);
    steering.props.onPointerCancel?.();
    expect(inputs.steerLeft).toBe(false);

    steering.props.onPointerDown?.(pointerEvent);
    steering.props.onLostPointerCapture?.();
    expect(inputs.steerLeft).toBe(false);
  });

  it('현재 방향지시등 상태를 토글 버튼 의미와 지속 스타일로 노출한다', () => {
    const { html } = renderControls(createInputs(), vi.fn(), 'left');

    expect(html).toContain('aria-label="좌측 방향지시등" aria-pressed="true"');
    expect(html).toContain('aria-label="비상등" aria-pressed="false"');
    expect(html).toContain('aria-label="우측 방향지시등" aria-pressed="false"');
    expect(html).toContain('bg-amber-400 text-slate-950');
  });
});
