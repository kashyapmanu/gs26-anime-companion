import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { VoiceController } from "./VoiceController";
import { amplitudeToViseme, type VisemeWeights } from "./lipSync";
import {
  computeBodyPose,
  initialBodyAnimationState,
  defaultBodyAnimationConfig,
  type BodyAnimationState,
} from "./bodyAnimation";
import { applyBodyPose } from "./VRMHumanoidDriver";

export interface VRMStageHandle {
  load(url: string): Promise<void>;
  speak(audioBase64: string, mime: string): Promise<void>;
  stopSpeaking(): void;
}

export const VRMStage = forwardRef<
  VRMStageHandle,
  { modelUrl: string; enableBodyAnimation?: boolean }
>(function VRMStage({ modelUrl, enableBodyAnimation = true }, _ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const voiceRef = useRef<VoiceController>(new VoiceController());
  const targetViseme = useRef<VisemeWeights>(amplitudeToViseme(0));
  const speakRef = useRef<VRMStageHandle["speak"]>(() => Promise.resolve());
  const stopRef = useRef<VRMStageHandle["stopSpeaking"]>(() => {});
  const bodyStateRef = useRef<BodyAnimationState>(initialBodyAnimationState());
  const bodyTimeRef = useRef<number>(0);

  useImperativeHandle(_ref as any, () => ({
    load: async () => {},
    speak: (b: string, m: string) => speakRef.current(b, m),
    stopSpeaking: () => stopRef.current(),
  }));

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 20);
    camera.position.set(0, 1.3, 2.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1.5, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      modelUrl,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        vrmRef.current = vrm;
        scene.add(vrm.scene);

        // Frame the model: place the camera so the whole avatar fits in view.
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fovRad = camera.fov * (Math.PI / 180);
        const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.05;
        camera.position.set(center.x, center.y + size.y * 0.15, center.z + distance);
        camera.lookAt(center);
      },
      undefined,
      (err) => { console.error("VRM load failed:", err); },
    );

    speakRef.current = async (audioBase64: string, mime: string) => {
      await voiceRef.current.play(audioBase64, mime, (w) => { targetViseme.current = w; });
    };
    stopRef.current = () => voiceRef.current.stop();

    let raf = 0;
    const render = (time: number) => {
      raf = requestAnimationFrame(render);
      const delta = Math.min(1, 1 / 60);
      bodyTimeRef.current += delta;

      // Lip-sync (existing)
      const v = targetViseme.current;
      const expr = vrmRef.current?.expressionManager;
      if (expr) {
        expr.setValue("aa", v.aa);
        expr.setValue("ih", v.ih);
        expr.setValue("ou", v.ou);
        expr.setValue("ee", v.ee);
        expr.setValue("oh", v.oh);
      }

      // Body animation (new)
      if (enableBodyAnimation && vrmRef.current) {
        const amplitude = voiceRef.current.getCurrentAmplitude();
        const { pose, state } = computeBodyPose(
          bodyTimeRef.current,
          amplitude,
          bodyStateRef.current,
          defaultBodyAnimationConfig,
          delta
        );
        bodyStateRef.current = state;
        applyBodyPose(vrmRef.current, pose);
      }

      if (vrmRef.current) vrmRef.current.update(delta);
      renderer.render(scene, camera);
    };
    render(0);

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch { /* already removed */ }
    };
  }, [modelUrl]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
});
