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
  it.each(['D', 'R'] as const)('%s 기어에서도 후방카메라 canvas를 미리 마운트한다', (gear) => {
    const markup = renderOverlay(gear);

    expect(markup.match(/<canvas/g)).toHaveLength(4);
  });
});
