import { useLayoutEffect, useRef } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const ENVIRONMENT_PATH = "/textures/desk-art-studio-daylight-1k.hdr";
const ENVIRONMENT_INTENSITY = 0.45;

/**
 * A low, left-side window key backed by restrained indoor daylight fill.
 *
 * The HDRI is Poly Haven's Art Studio by Oliksiy Yakovlyev (CC0):
 * https://polyhaven.com/a/art_studio
 */
export default function DeskLighting() {
  const sourceEnvironment = useLoader(HDRLoader, ENVIRONMENT_PATH);
  const { gl, invalidate, scene } = useThree();
  const keyLight = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    keyLight.current?.shadow.camera.updateProjectionMatrix();
    invalidate();
  }, [invalidate]);

  useLayoutEffect(() => {
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousEnvironmentRotation = scene.environmentRotation.clone();
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromEquirectangular(sourceEnvironment);

    generator.dispose();

    scene.environment = environment.texture;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    // The desk uses world Z as up; HDRIs are authored with world Y as up.
    scene.environmentRotation.set(Math.PI / 2, 0, -0.55);
    invalidate();

    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.environmentRotation.copy(previousEnvironmentRotation);
      environment.dispose();
      invalidate();
    };
  }, [gl, invalidate, scene, sourceEnvironment]);

  return (
    <directionalLight
      ref={keyLight}
      position={[-13, -5, 10]}
      color="#fff1df"
      intensity={3}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-13.5}
      shadow-camera-right={13.5}
      shadow-camera-top={24}
      shadow-camera-bottom={-11.5}
      shadow-camera-near={0.5}
      shadow-camera-far={38}
      shadow-bias={-0.00012}
      shadow-normalBias={0.003}
      shadow-radius={2.5}
    />
  );
}
