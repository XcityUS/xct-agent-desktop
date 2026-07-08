import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as SkeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RenderAgent } from "../core/types";
import bizManGlbUrl from "../assets/biz_man.glb?url";
import manGlbUrl from "../assets/man.glb?url";

export const RIGGED_EMPLOYEE_URL = bizManGlbUrl;
export const RIGGED_MAN_URL = manGlbUrl;

const DEFAULT_AGENT_HEIGHT = 0.65;

function computeAutoScale(bbox: THREE.Box3): number {
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const modelHeight = size.y;
  if (modelHeight <= 0) return 1;
  return DEFAULT_AGENT_HEIGHT / modelHeight;
}

function findAnimationByName(
  names: string[],
  target: string,
): number | undefined {
  const wanted = target.toLowerCase();
  // Clip names are often prefixed by the armature (e.g. "Armature|Walk") and/or
  // namespaced (e.g. "Man_Walk", "Man_Sitting"). Compare against the trailing
  // segment after the last "|", then match either the whole leaf or one of its
  // tokens (split on non-alphanumerics) so "Man_Walk" matches "walk".
  const idx = names.findIndex((n) => {
    const leaf = (n.split("|").pop() ?? n).toLowerCase();
    if (leaf === wanted) return true;
    const tokens = leaf.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.includes(wanted);
  });
  return idx >= 0 ? idx : undefined;
}

export function RiggedCharacter({
  url,
  agentId,
  agentsRef,
  agentLookupRef,
  scaleMultiplier = 1.45,
  tint = null,
}: {
  url: string;
  agentId: string;
  agentsRef: React.RefObject<RenderAgent[]>;
  agentLookupRef?: React.RefObject<Map<string, RenderAgent>>;
  scaleMultiplier?: number;
  /** Recolours the model's materials toward this colour (per-instance). */
  tint?: string | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { invalidate } = useThree();

  const clonedScene = useMemo(() => {
    const cloned = SkeletonClone(scene);
    cloned.updateMatrixWorld(true);
    const tintColor = tint ? new THREE.Color(tint) : null;

    // Detect whether the model has a separately-named "Shirt" material.
    // If so we tint only that material; otherwise fall back to tinting all
    // meshes so the agent still gets coloured.
    let hasShirtMaterial = false;
    if (tintColor) {
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          if (
            mats.some((m) => (m as THREE.MeshStandardMaterial).name === "Shirt")
          ) {
            hasShirtMaterial = true;
          }
        }
      });
    }

    // Skinned meshes frequently get incorrectly frustum-culled because their
    // bounding sphere stays at the rig origin, making the avatar vanish.
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
        // SkeletonClone shares material references with the cached GLTF scene,
        // so tinting in place would recolour every agent using this model.
        // Clone the materials per instance, then lerp toward the agent's tint.
        if (tintColor) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          const tinted = mats.map((material) => {
            const mat = material as THREE.MeshStandardMaterial;
            const next = mat.clone() as THREE.Material & {
              color?: THREE.Color;
            };
            // Only tint the "Shirt" material when we found one; otherwise
            // tint every material as a fallback.
            if (next.color && (!hasShirtMaterial || mat.name === "Shirt")) {
              next.color.lerp(tintColor, 0.6);
            }
            return next;
          });
          child.material = Array.isArray(child.material) ? tinted : tinted[0];
        }
      }
    });
    return cloned;
  }, [scene, tint]);

  const { autoScale, bboxMin, bboxCenter } = useMemo(() => {
    clonedScene.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const min = bbox.min.clone();
    bbox.getCenter(center);
    const scaleValue = computeAutoScale(bbox);
    return { autoScale: scaleValue, bboxMin: min, bboxCenter: center };
  }, [clonedScene]);

  const { mixer, clipMap } = useMemo(() => {
    const m = new THREE.AnimationMixer(clonedScene);
    const names = animations.map((c) => c.name);
    const map: Record<string, number | undefined> = {
      idle: findAnimationByName(names, "idle"),
      walk: findAnimationByName(names, "walk"),
      // biz_man.glb has no "Sprint" clip — fall back to "Run".
      sprint:
        findAnimationByName(names, "sprint") ??
        findAnimationByName(names, "run"),
      jump: findAnimationByName(names, "jump"),
      sit:
        findAnimationByName(names, "sit") ??
        findAnimationByName(names, "sitting") ??
        findAnimationByName(names, "chair") ??
        findAnimationByName(names, "seated"),
    };
    return { mixer: m, clipMap: map };
  }, [animations, clonedScene]);

  // Index of the clip currently faded in. Tracked so we only crossfade when the
  // target actually changes — re-triggering reset()/fadeIn() every frame snaps
  // the clip back to frame 0 and looks like a jittery hop.
  const currentClipIdxRef = useRef<number | null>(null);

  useEffect(() => {
    currentClipIdxRef.current = null;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
    };
  }, [mixer, clonedScene]);

  useFrame((_, delta) => {
    const agents = agentsRef.current;
    if (!agents) return;
    const agent =
      agentLookupRef?.current?.get(agentId) ??
      agents.find((a) => a.id === agentId);
    if (!agent) return;

    let targetClipIdx: number | undefined;
    if (agent.state === "walking") {
      targetClipIdx = agent.walkSpeed > 2.5 ? clipMap.sprint : clipMap.walk;
    } else if (agent.state === "sitting") {
      targetClipIdx = clipMap.sit ?? clipMap.idle;
    } else {
      // standing / away / etc. — settle into idle.
      targetClipIdx = clipMap.idle;
    }
    if (targetClipIdx === undefined) targetClipIdx = clipMap.idle;

    if (
      targetClipIdx !== undefined &&
      targetClipIdx !== currentClipIdxRef.current
    ) {
      const prevIdx = currentClipIdxRef.current;
      if (prevIdx !== null && animations[prevIdx]) {
        mixer.clipAction(animations[prevIdx], clonedScene).fadeOut(0.25);
      }
      const nextAction = mixer.clipAction(
        animations[targetClipIdx],
        clonedScene,
      );
      if (agent.state === "sitting") {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
        nextAction.clampWhenFinished = false;
      }
      nextAction.reset().setEffectiveWeight(1).fadeIn(0.25).play();
      currentClipIdxRef.current = targetClipIdx;
    }

    mixer.update(Math.min(delta, 1 / 30));
    invalidate();
  });

  return (
    <group ref={groupRef}>
      <primitive
        object={clonedScene}
        scale={autoScale * scaleMultiplier}
        position={[
          -bboxCenter.x * autoScale * scaleMultiplier,
          -bboxMin.y * autoScale * scaleMultiplier,
          -bboxCenter.z * autoScale * scaleMultiplier,
        ]}
      />
    </group>
  );
}

useGLTF.preload(bizManGlbUrl);
useGLTF.preload(manGlbUrl);
