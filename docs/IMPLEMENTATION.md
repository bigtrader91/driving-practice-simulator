# Simulator completion architecture

## Input model

- Desktop steering is accepted only while the primary pointer button is captured by the on-screen wheel.
- Wheel rotation is accumulated from circular pointer movement and clamped to ±540 degrees.
- W is always accelerator input and S is always foot-brake input; D/R determines travel direction.
- P/R/D changes require a stationary vehicle with the foot brake held. N requires a stationary vehicle.
- The default binding set is unique and can be remapped with conflict swapping.

## Vehicle and camera model

- A bicycle-model yaw update converts steering-wheel rotation through each vehicle's steering ratio.
- Steering self-centering increases with road speed and is disabled while the wheel is held.
- Collisions restore the last non-overlapping pose and set longitudinal speed to zero.
- Cockpit roll is clamped to 0, ±1.25 or ±1.72 degrees according to comfort settings, preventing camera inversion.
- Left, right and rear mirrors use separate Three.js cameras; reverse gear enables a dedicated backup camera.

## Course model

The simulator includes basic controls, width/slalom, S-curve, right-angle, integrated license-test, reverse parking, parallel parking, city lane-change, city traffic and multi-lane express-road modes. Each mode supplies its own road geometry, obstacles, start pose, goal, limit and scoring conditions.

## Verification

`npm run check` runs the invariant validator followed by the TypeScript and Vite production build. GitHub Actions executes the same command for branch pushes and pull requests.
