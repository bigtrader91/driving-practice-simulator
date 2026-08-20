import * as THREE from 'three';

// Procedural Canvas Texture Generator for Korean Road Signs & Markings

export class RoadTextureGenerator {
  // 1. Korean Road Arrows & Speed Limit Decals
  public static createSpeedLimitTexture(speed: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 256, 256);

    // Red circle border
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();

    // Speed number
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 105px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speed.toString(), 128, 134);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  // 2. Korean Road Turn Arrow (Straight, Left, Right, Straight+Left)
  public static createRoadArrowTexture(type: 'straight' | 'left' | 'right' | 'straight_left' | 'merge'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 256, 512);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'straight') {
      // Shaft
      ctx.fillRect(116, 160, 24, 280);
      // Arrow head
      ctx.beginPath();
      ctx.moveTo(128, 60);
      ctx.lineTo(60, 180);
      ctx.lineTo(105, 180);
      ctx.lineTo(105, 200);
      ctx.lineTo(151, 200);
      ctx.lineTo(151, 180);
      ctx.lineTo(196, 180);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'left' || type === 'merge') {
      // Curved left arrow
      ctx.beginPath();
      ctx.moveTo(128, 440);
      ctx.quadraticCurveTo(128, 220, 50, 200);
      ctx.lineWidth = 26;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(25, 200);
      ctx.lineTo(85, 150);
      ctx.lineTo(75, 190);
      ctx.lineTo(95, 220);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'right') {
      ctx.beginPath();
      ctx.moveTo(128, 440);
      ctx.quadraticCurveTo(128, 220, 206, 200);
      ctx.lineWidth = 26;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(231, 200);
      ctx.lineTo(171, 150);
      ctx.lineTo(181, 190);
      ctx.lineTo(161, 220);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'straight_left') {
      // Straight arrow
      ctx.fillRect(116, 160, 24, 280);
      ctx.beginPath();
      ctx.moveTo(128, 60);
      ctx.lineTo(70, 170);
      ctx.lineTo(186, 170);
      ctx.closePath();
      ctx.fill();

      // Branch to left
      ctx.beginPath();
      ctx.moveTo(128, 300);
      ctx.quadraticCurveTo(128, 220, 45, 200);
      ctx.lineWidth = 22;
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  // 3. Korean Overhead Highway Destination Signboard Texture
  public static createHighwaySignTexture(line1: string, line2: string, exitNo?: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 340;
    const ctx = canvas.getContext('2d')!;

    // Highway Green Background
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, 1024, 340);

    // Outer White Border
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(14, 14, 996, 312);

    // Inner Corner Radius Accent
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, 972, 288);

    // Route Number Symbol (e.g. 1번 경부고속도로 Oval / 국도 Shield)
    ctx.beginPath();
    ctx.ellipse(110, 170, 65, 45, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 110, 170);

    // Main Destination Texts in Korean
    ctx.textAlign = 'left';
    ctx.font = '800 68px Pretendard, sans-serif';
    ctx.fillText(line1, 210, 120);

    ctx.font = '600 42px Pretendard, sans-serif';
    ctx.fillStyle = '#facc15'; // Yellow highlight for sub-destination
    ctx.fillText(line2, 210, 220);

    // Forward Arrow on right
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(930, 80);
    ctx.lineTo(870, 160);
    ctx.lineTo(900, 160);
    ctx.lineTo(900, 260);
    ctx.lineTo(960, 260);
    ctx.lineTo(960, 160);
    ctx.lineTo(990, 160);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  // 4. Korean School Zone (어린이보호구역 30) Road Surface Text Texture
  public static createSchoolZoneTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Red wine background
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(0, 0, 512, 256);

    // White border
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(8, 8, 496, 240);

    // Yellow Text
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 56px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('어린이보호구역', 256, 95);

    ctx.font = 'bold 64px Pretendard, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('30 km/h', 256, 175);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }

  // 5. Crosswalk Diamond Warning Marker
  public static createDiamondMarkerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 256, 512);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(128, 60);
    ctx.lineTo(210, 256);
    ctx.lineTo(128, 452);
    ctx.lineTo(46, 256);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }
}
