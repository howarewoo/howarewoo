import { useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Photo } from "./creative-content";

export default function Polaroid({
  model,
  photo,
}: {
  model: THREE.Group;
  photo: Photo;
}) {
  const images = useLoader(
    THREE.TextureLoader,
    photo.image ? [photo.image] : [],
  );
  const body = useMemo(() => model.clone(true), [model]);
  const resources = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 768;
    const context = canvas.getContext("2d")!;
    if (images[0]) {
      const image = images[0].image;
      const side = Math.min(image.width, image.height);
      context.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        768,
        768,
      );
    } else {
      // Unexposed instant-film chemistry, intentionally no invented photograph.
      const gradient = context.createLinearGradient(0, 0, 240, 768);
      gradient.addColorStop(0, "#4c5558");
      gradient.addColorStop(0.55, "#697371");
      gradient.addColorStop(1, "#818a81");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 768, 768);
      const shade = context.createRadialGradient(384, 330, 100, 384, 384, 520);
      shade.addColorStop(0, "#a8b3a70a");
      shade.addColorStop(1, "#162c3430");
      context.fillStyle = shade;
      context.fillRect(0, 0, 768, 768);
    }
    const image = new THREE.CanvasTexture(canvas);
    image.colorSpace = THREE.SRGBColorSpace;
    image.anisotropy = 4;
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 768;
    labelCanvas.height = 120;
    const labelContext = labelCanvas.getContext("2d")!;
    labelContext.font = 'italic 36px "DM Sans", sans-serif';
    labelContext.fillStyle = "#666459";
    labelContext.textAlign = "center";
    labelContext.textBaseline = "middle";
    labelContext.fillText(photo.caption, 384, 60, 720);
    const caption = new THREE.CanvasTexture(labelCanvas);
    caption.colorSpace = THREE.SRGBColorSpace;
    return { image, caption };
  }, [images, photo.caption]);
  useEffect(
    () => () => {
      resources.image.dispose();
      resources.caption.dispose();
    },
    [resources],
  );
  return (
    <group>
      <primitive object={body} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
      <mesh position={[0, 0.23, 0.03]} receiveShadow>
        <planeGeometry args={[2.48, 2.48]} />
        <meshStandardMaterial
          map={resources.image}
          roughness={0.3}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, -1.34, 0.031]}>
        <planeGeometry args={[2.35, 0.36]} />
        <meshStandardMaterial
          map={resources.caption}
          transparent
          depthWrite={false}
          roughness={0.85}
        />
      </mesh>
    </group>
  );
}
