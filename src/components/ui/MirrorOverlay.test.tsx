import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MirrorOverlay } from './MirrorOverlay';

const renderOverlay = (gear: 'D' | 'R') => renderToStaticMarkup(
  <MirrorOverlay
    cameraMode="cockpit"
    gear={gear}
    leftMirrorCanvasRef={React.createRef<HTMLCanvasElement>()}
    rightMirrorCanvasRef={React.createRef<HTMLCanvasElement>()}
    rearMirrorCanvasRef={React.createRef<HTMLCanvasElement>()}
    backupCameraCanvasRef={React.createRef<HTMLCanvasElement>()}
    isLeftLooked={false}
    isRightLooked={false}
  />
);

describe('MirrorOverlay backup renderer target', () => {
  it('세로 모바일에서는 세 미러를 한 줄에 맞는 크기로 줄인다', () => {
    const markup = renderOverlay('D');

    expect(markup).toContain('portrait:w-32 portrait:h-12');
    expect(markup.match(/portrait:w-24 portrait:h-16/g)).toHaveLength(2);
  });

  it.each(['D', 'R'] as const)('%s 기어에서도 후방카메라 canvas를 미리 마운트한다', (gear) => {
    const markup = renderOverlay(gear);

    expect(markup.match(/<canvas/g)).toHaveLength(4);
  });
});
