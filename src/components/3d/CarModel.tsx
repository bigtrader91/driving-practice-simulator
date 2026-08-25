import React from 'react';
import * as THREE from 'three';
import { VehicleConfig, CarState } from '../../types/simulator';

export const createCar3DGroup = (vehicle: VehicleConfig): {
  carGroup: THREE.Group;
  frontLeftWheel: THREE.Group;
  frontRightWheel: THREE.Group;
  rearLeftWheel: THREE.Group;
  rearRightWheel: THREE.Group;
  steeringWheelMesh: THREE.Group;
  leftBlinkerLight: THREE.Mesh;
  rightBlinkerLight: THREE.Mesh;
  leftRearBlinkerLight: THREE.Mesh;
  rightRearBlinkerLight: THREE.Mesh;
  brakeLights: THREE.Mesh[];
  headlights: THREE.Mesh[];
  headlightBeams: THREE.SpotLight[];
  wiperLeft: THREE.Group;
  wiperRight: THREE.Group;
} => {
  const group = new THREE.Group();
  const w = vehicle.width;
  const l = vehicle.length;
  const h = vehicle.height;

  // Materials with Realistic PBR Properties
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: vehicle.color,
    roughness: 0.18,
    metalness: 0.75,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.05,
    transmission: 0.95,
    thickness: 0.2,
    transparent: true,
    opacity: 0.3,
  });

  const dashboardLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x181a20,
    roughness: 0.9,
    metalness: 0.05,
  });

  const interiorAccentMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.6,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.08,
    metalness: 0.95,
  });

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x171717,
    roughness: 0.92,
  });

  const wheelRimMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.9,
  });

  const brakeCaliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.3,
    metalness: 0.7,
  });

  const mirrorGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.01,
    metalness: 0.99,
  });

  const digitalScreenMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
  });

  // 1. Lower Body Chassis
  const lowerBodyHeight = h * 0.42;
  const lowerBodyGeo = new THREE.BoxGeometry(w, lowerBodyHeight, l);
  const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMaterial);
  lowerBody.position.y = lowerBodyHeight / 2 + 0.25;
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  group.add(lowerBody);

  // Front Hood & Grille
  const hoodLength = l * 0.32;
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.94, 0.08, hoodLength),
    bodyMaterial
  );
  hood.position.set(0, lowerBodyHeight + 0.28, l * 0.34);
  group.add(hood);

  // Front Radiator Grille
  const grilleGeo = new THREE.BoxGeometry(w * 0.65, lowerBodyHeight * 0.45, 0.08);
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8, metalness: 0.3 });
  const grille = new THREE.Mesh(grilleGeo, grilleMat);
  grille.position.set(0, lowerBodyHeight * 0.45 + 0.25, l / 2 + 0.02);
  group.add(grille);

  const grilleTrim = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 0.03, 0.1), chromeMaterial);
  grilleTrim.position.set(0, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.025);
  group.add(grilleTrim);

  // 2. HOLLOW Cabin Structure (Roof on top, A-pillars on sides - NO solid black box inside!)
  const cabinWidth = w * 0.88;
  const cabinLength = l * 0.54;
  const cabinHeight = h * 0.46;

  // Thin Roof Panel on Top (does not block cockpit view)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(cabinWidth * 0.92, 0.05, cabinLength * 0.7),
    bodyMaterial
  );
  roof.position.set(0, lowerBodyHeight + cabinHeight + 0.25, -l * 0.08);
  roof.castShadow = true;
  group.add(roof);

  // A-Pillars (Left & Right windshield frame pillars)
  const pillarGeo = new THREE.BoxGeometry(0.06, cabinHeight * 1.15, 0.06);
  const leftPillar = new THREE.Mesh(pillarGeo, dashboardLeatherMat);
  leftPillar.position.set(-cabinWidth / 2 + 0.02, lowerBodyHeight + cabinHeight * 0.55 + 0.25, -l * 0.04 + cabinLength / 2 - 0.18);
  leftPillar.rotation.x = -Math.PI / 4.4;
  group.add(leftPillar);

  const rightPillar = new THREE.Mesh(pillarGeo, dashboardLeatherMat);
  rightPillar.position.set(cabinWidth / 2 - 0.02, lowerBodyHeight + cabinHeight * 0.55 + 0.25, -l * 0.04 + cabinLength / 2 - 0.18);
  rightPillar.rotation.x = -Math.PI / 4.4;
  group.add(rightPillar);

  // Transparent Front Windshield Glass
  const windshieldGeo = new THREE.PlaneGeometry(cabinWidth * 0.94, cabinHeight * 1.05);
  const windshield = new THREE.Mesh(windshieldGeo, glassMaterial);
  windshield.position.set(0, lowerBodyHeight + cabinHeight * 0.55 + 0.25, -l * 0.04 + cabinLength / 2 + 0.02);
  windshield.rotation.x = -Math.PI / 4.2;
  group.add(windshield);

  // Rear Window Glass
  const rearWindow = new THREE.Mesh(windshieldGeo, glassMaterial);
  rearWindow.position.set(0, lowerBodyHeight + cabinHeight * 0.55 + 0.25, -l * 0.04 - cabinLength / 2 - 0.02);
  rearWindow.rotation.x = Math.PI / 4.2;
  group.add(rearWindow);

  // Side Windows
  const sideWindowGeo = new THREE.PlaneGeometry(cabinLength * 0.88, cabinHeight * 0.7);
  const leftWindow = new THREE.Mesh(sideWindowGeo, glassMaterial);
  leftWindow.position.set(-cabinWidth / 2 - 0.01, lowerBodyHeight + cabinHeight * 0.5 + 0.25, -l * 0.04);
  leftWindow.rotation.y = -Math.PI / 2;
  group.add(leftWindow);

  const rightWindow = new THREE.Mesh(sideWindowGeo, glassMaterial);
  rightWindow.position.set(cabinWidth / 2 + 0.01, lowerBodyHeight + cabinHeight * 0.5 + 0.25, -l * 0.04);
  rightWindow.rotation.y = Math.PI / 2;
  group.add(rightWindow);

  // 3. Windshield Wipers
  const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
  const wiperLeft = new THREE.Group();
  const wiperBladeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.015, 0.015), wiperMat);
  wiperBladeLeft.position.set(0.24, 0, 0);
  wiperLeft.add(wiperBladeLeft);
  wiperLeft.position.set(-w * 0.25, lowerBodyHeight + 0.28, l * 0.2);
  wiperLeft.rotation.x = -Math.PI / 4.5;
  wiperLeft.rotation.z = -0.1;
  group.add(wiperLeft);

  const wiperRight = new THREE.Group();
  const wiperBladeRight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.015), wiperMat);
  wiperBladeRight.position.set(0.21, 0, 0);
  wiperRight.add(wiperBladeRight);
  wiperRight.position.set(w * 0.1, lowerBodyHeight + 0.28, l * 0.2);
  wiperRight.rotation.x = -Math.PI / 4.5;
  wiperRight.rotation.z = -0.1;
  group.add(wiperRight);

  // 4. Cockpit Interior (Dashboard below eye level, Center Screen, Steering Wheel)
  const dashGeo = new THREE.BoxGeometry(cabinWidth * 0.95, 0.32, 0.55);
  const dash = new THREE.Mesh(dashGeo, dashboardLeatherMat);
  dash.position.set(0, lowerBodyHeight + 0.24, 0.38);
  group.add(dash);

  const centerTrim = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth * 0.92, 0.03, 0.54), interiorAccentMat);
  centerTrim.position.set(0, lowerBodyHeight + 0.28, 0.38);
  group.add(centerTrim);

  // Center Touch Navigation Display
  const navScreenGeo = new THREE.BoxGeometry(0.35, 0.16, 0.02);
  const navScreen = new THREE.Mesh(navScreenGeo, digitalScreenMat);
  navScreen.position.set(0.04, lowerBodyHeight + 0.38, 0.24);
  navScreen.rotation.x = -0.2;
  group.add(navScreen);

  // Driver Digital Instrument Cluster Screen
  const clusterGeo = new THREE.BoxGeometry(0.34, 0.14, 0.02);
  const clusterScreenMat = new THREE.MeshBasicMaterial({ color: 0x030712 });
  const clusterScreen = new THREE.Mesh(clusterGeo, clusterScreenMat);
  clusterScreen.position.set(-vehicle.width * 0.24, lowerBodyHeight + 0.38, 0.3);
  clusterScreen.rotation.x = -0.22;
  group.add(clusterScreen);

  // Glowing Dials on Cluster
  const dialMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const speedoRing = new THREE.Mesh(new THREE.RingGeometry(0.038, 0.048, 24), dialMat);
  speedoRing.position.set(-vehicle.width * 0.24 - 0.08, lowerBodyHeight + 0.38, 0.29);
  speedoRing.rotation.x = -0.22;
  const rpmRing = new THREE.Mesh(new THREE.RingGeometry(0.038, 0.048, 24), dialMat);
  rpmRing.position.set(-vehicle.width * 0.24 + 0.08, lowerBodyHeight + 0.38, 0.29);
  rpmRing.rotation.x = -0.22;
  group.add(speedoRing);
  group.add(rpmRing);

  // Steering Wheel with 3-Spoke Design
  const steeringWheelGroup = new THREE.Group();
  const rimGeo = new THREE.TorusGeometry(0.18, 0.022, 18, 36);
  const rim = new THREE.Mesh(rimGeo, dashboardLeatherMat);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 18), dashboardLeatherMat);
  hub.rotateX(Math.PI / 2);
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 18), chromeMaterial);
  emblem.rotateX(Math.PI / 2);
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.02), chromeMaterial);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.02), chromeMaterial);
  spokeV.position.y = -0.065;

  steeringWheelGroup.add(rim);
  steeringWheelGroup.add(hub);
  steeringWheelGroup.add(emblem);
  steeringWheelGroup.add(spokeH);
  steeringWheelGroup.add(spokeV);
  steeringWheelGroup.position.set(-vehicle.width * 0.24, lowerBodyHeight + 0.32, 0.16);
  steeringWheelGroup.rotation.x = Math.PI / 4.2;
  group.add(steeringWheelGroup);

  // Driver & Passenger Bucket Seats
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
  const seatBackGeo = new THREE.BoxGeometry(0.48, 0.65, 0.16);
  const seatBaseGeo = new THREE.BoxGeometry(0.48, 0.16, 0.5);

  const driverSeatGroup = new THREE.Group();
  const dBase = new THREE.Mesh(seatBaseGeo, seatMat);
  const dBack = new THREE.Mesh(seatBackGeo, seatMat);
  dBack.position.set(0, 0.38, -0.2);
  dBack.rotation.x = -0.15;
  const dHeadrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.12), seatMat);
  dHeadrest.position.set(0, 0.78, -0.28);
  driverSeatGroup.add(dBase);
  driverSeatGroup.add(dBack);
  driverSeatGroup.add(dHeadrest);
  driverSeatGroup.position.set(-vehicle.width * 0.24, lowerBodyHeight + 0.16, -0.32);
  group.add(driverSeatGroup);

  const passSeatGroup = driverSeatGroup.clone();
  passSeatGroup.position.set(vehicle.width * 0.24, lowerBodyHeight + 0.16, -0.32);
  group.add(passSeatGroup);

  // 5. Side Mirrors & Room Mirror
  const mirrorHousingGeo = new THREE.BoxGeometry(0.22, 0.12, 0.09);
  const mirrorGlassGeo = new THREE.PlaneGeometry(0.2, 0.1);

  // Left Mirror
  const leftMirrorGroup = new THREE.Group();
  const leftMirrorHousing = new THREE.Mesh(mirrorHousingGeo, bodyMaterial);
  const leftMirrorFace = new THREE.Mesh(mirrorGlassGeo, mirrorGlassMaterial);
  leftMirrorFace.position.z = -0.046;
  leftMirrorFace.rotation.y = Math.PI;
  leftMirrorGroup.add(leftMirrorHousing);
  leftMirrorGroup.add(leftMirrorFace);
  leftMirrorGroup.position.set(-w / 2 - 0.11, lowerBodyHeight + 0.26, l * 0.16);
  leftMirrorGroup.rotation.y = -0.22;
  group.add(leftMirrorGroup);

  // Right Mirror
  const rightMirrorGroup = new THREE.Group();
  const rightMirrorHousing = new THREE.Mesh(mirrorHousingGeo, bodyMaterial);
  const rightMirrorFace = new THREE.Mesh(mirrorGlassGeo, mirrorGlassMaterial);
  rightMirrorFace.position.z = -0.046;
  rightMirrorFace.rotation.y = Math.PI;
  rightMirrorGroup.add(rightMirrorHousing);
  rightMirrorGroup.add(rightMirrorFace);
  rightMirrorGroup.position.set(w / 2 + 0.11, lowerBodyHeight + 0.26, l * 0.16);
  rightMirrorGroup.rotation.y = 0.22;
  group.add(rightMirrorGroup);

  // Room Mirror
  const rearMirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.03), dashboardLeatherMat);
  rearMirrorHousing.position.set(0, lowerBodyHeight + cabinHeight + 0.16, -l * 0.02);
  group.add(rearMirrorHousing);

  // 6. Full LED Headlights & Beams
  const lightGeo = new THREE.BoxGeometry(0.32, 0.14, 0.05);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
  });
  const leftHeadlight = new THREE.Mesh(lightGeo, headlightMat);
  leftHeadlight.position.set(-w * 0.35, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.02);
  const rightHeadlight = new THREE.Mesh(lightGeo, headlightMat);
  rightHeadlight.position.set(w * 0.35, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.02);
  group.add(leftHeadlight);
  group.add(rightHeadlight);

  const headlightBeams: THREE.SpotLight[] = [];
  [-w * 0.35, w * 0.35].forEach((hx) => {
    const spot = new THREE.SpotLight(0xfffbeb, 3.2, 45, Math.PI / 6, 0.4, 1.2);
    spot.position.set(hx, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.1);
    const targetObj = new THREE.Object3D();
    targetObj.position.set(hx, 0, l / 2 + 35);
    group.add(targetObj);
    spot.target = targetObj;
    group.add(spot);
    headlightBeams.push(spot);
  });

  // Brake Lights
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xaa0000,
    emissiveIntensity: 0.3,
  });
  const leftBrakeLight = new THREE.Mesh(lightGeo, brakeLightMat);
  leftBrakeLight.position.set(-w * 0.35, lowerBodyHeight * 0.7 + 0.25, -l / 2 - 0.02);
  const rightBrakeLight = new THREE.Mesh(lightGeo, brakeLightMat);
  rightBrakeLight.position.set(w * 0.35, lowerBodyHeight * 0.7 + 0.25, -l / 2 - 0.02);
  group.add(leftBrakeLight);
  group.add(rightBrakeLight);

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.04, 0.04), brakeLightMat);
  tailBar.position.set(0, lowerBodyHeight * 0.7 + 0.25, -l / 2 - 0.02);
  group.add(tailBar);

  // Turn Signals
  const blinkerGeo = new THREE.BoxGeometry(0.14, 0.08, 0.05);
  const blinkerMatLeft = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.1 });
  const blinkerMatRight = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.1 });

  const leftFrontBlinker = new THREE.Mesh(blinkerGeo, blinkerMatLeft);
  leftFrontBlinker.position.set(-w * 0.44, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.02);
  const rightFrontBlinker = new THREE.Mesh(blinkerGeo, blinkerMatRight);
  rightFrontBlinker.position.set(w * 0.44, lowerBodyHeight * 0.7 + 0.25, l / 2 + 0.02);
  group.add(leftFrontBlinker);
  group.add(rightFrontBlinker);

  const leftRearBlinker = new THREE.Mesh(blinkerGeo, blinkerMatLeft);
  leftRearBlinker.position.set(-w * 0.44, lowerBodyHeight * 0.7 + 0.25, -l / 2 - 0.02);
  const rightRearBlinker = new THREE.Mesh(blinkerGeo, blinkerMatRight);
  rightRearBlinker.position.set(w * 0.44, lowerBodyHeight * 0.7 + 0.25, -l / 2 - 0.02);
  group.add(leftRearBlinker);
  group.add(rightRearBlinker);

  // 7. Wheels with Alloy Rims & Brake Calipers
  const wheelRadius = 0.34;
  const wheelThickness = 0.24;

  const makeDetailedWheel = () => {
    const wGroup = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 28);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, tireMaterial);
    tire.castShadow = true;

    const rimMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.7, wheelRadius * 0.7, wheelThickness + 0.01, 16),
      wheelRimMaterial
    );
    rimMesh.rotateZ(Math.PI / 2);

    const brakeDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.52, wheelRadius * 0.52, wheelThickness * 0.8, 16),
      chromeMaterial
    );
    brakeDisc.rotateZ(Math.PI / 2);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), brakeCaliperMat);
    caliper.position.set(0, wheelRadius * 0.35, 0);

    wGroup.add(tire);
    wGroup.add(rimMesh);
    wGroup.add(brakeDisc);
    wGroup.add(caliper);
    return wGroup;
  };

  const frontZ = vehicle.wheelBase / 2;
  const rearZ = -vehicle.wheelBase / 2;
  const wheelX = w / 2;
  const wheelY = wheelRadius;

  const frontLeftWheel = makeDetailedWheel();
  frontLeftWheel.position.set(-wheelX, wheelY, frontZ);
  const frontRightWheel = makeDetailedWheel();
  frontRightWheel.position.set(wheelX, wheelY, frontZ);
  const rearLeftWheel = makeDetailedWheel();
  rearLeftWheel.position.set(-wheelX, wheelY, rearZ);
  const rearRightWheel = makeDetailedWheel();
  rearRightWheel.position.set(wheelX, wheelY, rearZ);

  group.add(frontLeftWheel);
  group.add(frontRightWheel);
  group.add(rearLeftWheel);
  group.add(rearRightWheel);

  // Driving physics uses local -Z as forward. Reflect the authored +Z model
  // so exterior details, lights, and cabin geometry follow that same contract.
  group.scale.z = -1;

  return {
    carGroup: group,
    frontLeftWheel,
    frontRightWheel,
    rearLeftWheel,
    rearRightWheel,
    steeringWheelMesh: steeringWheelGroup,
    leftBlinkerLight: leftFrontBlinker,
    rightBlinkerLight: rightFrontBlinker,
    leftRearBlinkerLight: leftRearBlinker,
    rightRearBlinkerLight: rightRearBlinker,
    brakeLights: [leftBrakeLight, rightBrakeLight, tailBar],
    headlights: [leftHeadlight, rightHeadlight],
    headlightBeams,
    wiperLeft,
    wiperRight,
  };
};
