import * as THREE from 'three';
import { VehicleConfig, CarState } from '../../types/simulator';

export class TrajectoryGuideRenderer {
  private lineMesh: THREE.LineSegments | null = null;
  private widthGuideMesh: THREE.LineSegments | null = null;
  private group: THREE.Group;

  constructor(scene: THREE.Object3D) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.init();
  }

  private init() {
    // Dynamic trajectory line
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
    });
    const trajGeo = new THREE.BufferGeometry();
    this.lineMesh = new THREE.LineSegments(trajGeo, trajMat);
    this.group.add(this.lineMesh);

    // Car width margin markers (Yellow caution side bars)
    const widthMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
    });
    const widthGeo = new THREE.BufferGeometry();
    this.widthGuideMesh = new THREE.LineSegments(widthGeo, widthMat);
    this.group.add(this.widthGuideMesh);
  }

  public update(vehicle: VehicleConfig, carState: CarState, isVisible: boolean) {
    if (!this.lineMesh || !this.widthGuideMesh) return;

    if (!isVisible) {
      this.lineMesh.visible = false;
      this.widthGuideMesh.visible = false;
      return;
    }

    this.lineMesh.visible = true;
    this.widthGuideMesh.visible = true;

    const steerAngle = carState.steerAngle;
    const isReverse = carState.gear === 'R';
    const direction = isReverse ? -1 : 1;
    const halfWidth = vehicle.width / 2;
    const wheelBase = vehicle.wheelBase;

    const numPoints = 24;
    const stepDist = 0.55; // meters per sample point
    const pointsLeft: THREE.Vector3[] = [];
    const pointsRight: THREE.Vector3[] = [];
    const widthPoints: THREE.Vector3[] = [];

    // Simulate projected bicycle model trajectory
    let curX = 0;
    let curZ = direction * (vehicle.length / 2);
    let curHeading = 0;

    for (let i = 0; i <= numPoints; i++) {
      const cosH = Math.cos(curHeading);
      const sinH = Math.sin(curHeading);

      // Left and right tire projected points
      const leftP = new THREE.Vector3(
        curX - cosH * halfWidth,
        0.04,
        curZ + sinH * halfWidth
      );
      const rightP = new THREE.Vector3(
        curX + cosH * halfWidth,
        0.04,
        curZ - sinH * halfWidth
      );

      pointsLeft.push(leftP);
      pointsRight.push(rightP);

      // Width distance hash lines every 2 meters
      if (i % 4 === 0) {
        widthPoints.push(leftP);
        widthPoints.push(rightP);
      }

      // Step kinematics
      const deltaDist = stepDist * direction;
      curX += -Math.sin(curHeading) * deltaDist;
      curZ += -Math.cos(curHeading) * deltaDist;
      if (Math.abs(steerAngle) > 0.01) {
        curHeading += (deltaDist / wheelBase) * Math.tan(steerAngle);
      }
    }

    // Build segments
    const lineVertices: number[] = [];
    for (let i = 0; i < pointsLeft.length - 1; i++) {
      lineVertices.push(pointsLeft[i].x, pointsLeft[i].y, pointsLeft[i].z);
      lineVertices.push(pointsLeft[i + 1].x, pointsLeft[i + 1].y, pointsLeft[i + 1].z);

      lineVertices.push(pointsRight[i].x, pointsRight[i].y, pointsRight[i].z);
      lineVertices.push(pointsRight[i + 1].x, pointsRight[i + 1].y, pointsRight[i + 1].z);
    }

    const widthVertices: number[] = [];
    for (let i = 0; i < widthPoints.length; i += 2) {
      widthVertices.push(widthPoints[i].x, widthPoints[i].y, widthPoints[i].z);
      widthVertices.push(widthPoints[i + 1].x, widthPoints[i + 1].y, widthPoints[i + 1].z);
    }

    this.lineMesh.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(lineVertices, 3)
    );
    this.widthGuideMesh.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(widthVertices, 3)
    );

    // Transform group to car coordinates
    this.group.position.set(carState.x, carState.y, carState.z);
    this.group.rotation.y = carState.heading;
  }

  public dispose() {
    if (this.lineMesh) {
      this.lineMesh.geometry.dispose();
      (this.lineMesh.material as THREE.Material).dispose();
    }
    if (this.widthGuideMesh) {
      this.widthGuideMesh.geometry.dispose();
      (this.widthGuideMesh.material as THREE.Material).dispose();
    }
  }
}
