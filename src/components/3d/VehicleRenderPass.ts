import * as THREE from 'three';

export type VehicleRenderMode = 'cockpit' | 'external';

export const withVehicleRenderMode = (
  handles: {
    carGroup?: THREE.Object3D;
    exteriorRoot?: THREE.Object3D;
    cockpitRoot?: THREE.Object3D;
  },
  mode: VehicleRenderMode,
  render: () => void,
): void => {
  const previousExterior = handles.exteriorRoot?.visible;
  const previousCockpit = handles.cockpitRoot?.visible;
  const previousCarGroup = handles.carGroup?.visible;
  const hasRenderRoots = Boolean(handles.exteriorRoot || handles.cockpitRoot);

  if (handles.exteriorRoot) handles.exteriorRoot.visible = mode === 'external';
  if (handles.cockpitRoot) handles.cockpitRoot.visible = mode === 'cockpit';
  if (!hasRenderRoots && handles.carGroup) handles.carGroup.visible = mode === 'external';

  try {
    render();
  } finally {
    if (handles.exteriorRoot && previousExterior !== undefined) {
      handles.exteriorRoot.visible = previousExterior;
    }
    if (handles.cockpitRoot && previousCockpit !== undefined) {
      handles.cockpitRoot.visible = previousCockpit;
    }
    if (!hasRenderRoots && handles.carGroup && previousCarGroup !== undefined) {
      handles.carGroup.visible = previousCarGroup;
    }
  }
};
