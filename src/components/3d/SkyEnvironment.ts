import * as THREE from 'three';

export class SkyEnvironment {
  public static createSkyDome(): THREE.Mesh {
    const skyGeo = new THREE.SphereGeometry(600, 32, 24);
    
    // Custom Shader for Realistic Atmospheric Sky Gradient
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec3 point = normalize(vWorldPosition);
        float height = max(0.0, point.y);
        
        // Atmospheric gradient: Horizon warm haze to deep zenith blue
        vec3 zenithColor = vec3(0.18, 0.42, 0.78);   // Deep sky blue
        vec3 horizonColor = vec3(0.72, 0.84, 0.96);  // Atmospheric haze
        vec3 groundHaze = vec3(0.65, 0.75, 0.85);    // Below horizon
        
        vec3 finalColor = mix(horizonColor, zenithColor, pow(height, 0.45));
        if (point.y < 0.0) {
          finalColor = mix(horizonColor, groundHaze, -point.y * 2.0);
        }
        
        // Subtle Sun Glow
        vec3 sunDir = normalize(vec3(0.5, 0.7, 0.4));
        float sunDot = max(0.0, dot(point, sunDir));
        vec3 sunGlow = vec3(1.0, 0.95, 0.8) * pow(sunDot, 64.0) * 1.5;
        vec3 sunCorona = vec3(1.0, 0.9, 0.7) * pow(sunDot, 8.0) * 0.4;
        
        gl_FragColor = vec4(finalColor + sunGlow + sunCorona, 1.0);
      }
    `;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });

    return new THREE.Mesh(skyGeo, skyMat);
  }

  // Distant City Horizon Silhouette
  public static createCityHorizon(): THREE.Group {
    const horizonGroup = new THREE.Group();
    const buildingMat = new THREE.MeshBasicMaterial({ color: 0x475569, fog: true });

    // Ring of distant skyscrapers 400m away
    const numBuildings = 48;
    const radius = 380;

    for (let i = 0; i < numBuildings; i++) {
      const angle = (i / numBuildings) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const bw = 25 + Math.random() * 30;
      const bh = 50 + Math.random() * 80;
      const bd = 25 + Math.random() * 30;

      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
      bMesh.position.set(x, bh / 2 - 5, z);
      bMesh.rotation.y = angle;
      horizonGroup.add(bMesh);
    }

    return horizonGroup;
  }
}
