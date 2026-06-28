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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const voiceRef = useRef<VoiceController>(new VoiceController());
  const targetViseme = useRef<VisemeWeights>(amplitudeToViseme(0));
  const speakRef = useRef<VRMStageHandle["speak"]>(() => Promise.resolve());
  const stopRef = useRef<VRMStageHandle["stopSpeaking"]>(() => {});
  const enableBodyAnimationRef = useRef<boolean>(enableBodyAnimation);
  enableBodyAnimationRef.current = enableBodyAnimation;

  useImperativeHandle(_ref as any, () => ({
    load: async () => {},
    speak: (b: string, m: string) => speakRef.current(b, m),
    stopSpeaking: () => stopRef.current(),
  }));

  useEffect(() => {
    const mount = mountRef.current!;
    const canvas = canvasRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 20);
    camera.position.set(0, 1.3, 2.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    
    // Cyberpunk ambient and spotlighting
    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    dirLight.position.set(1, 2, 1.5);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xff007f, 1.0);
    rimLight.position.set(-1.5, 1, -1);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x1a1a2e, 0.8));

    // Setup visualizer canvas dimensions
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;

    // Body animation state is local to this effect/mount.
    const bodyState = initialBodyAnimationState();
    let bodyTime = 0;
    let lastRafTime: number | undefined;

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
        const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.45;
        camera.position.set(center.x, center.y + size.y * 0.18, center.z + distance);
        camera.lookAt(new THREE.Vector3(center.x, center.y + size.y * 0.1, center.z));
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
      // Dynamic resize check to handle flexbox rendering delay
      const currentWidth = mount.clientWidth;
      const currentHeight = mount.clientHeight;
      const canvasWidth = parseInt(renderer.domElement.style.width, 10) || 0;
      const canvasHeight = parseInt(renderer.domElement.style.height, 10) || 0;
      
      if (currentWidth > 0 && currentHeight > 0 && (currentWidth !== canvasWidth || currentHeight !== canvasHeight)) {
        renderer.setSize(currentWidth, currentHeight);
        camera.aspect = currentWidth / currentHeight;
        camera.updateProjectionMatrix();
        
        const vCanvas = canvasRef.current;
        if (vCanvas) {
          vCanvas.width = vCanvas.clientWidth * window.devicePixelRatio;
          vCanvas.height = vCanvas.clientHeight * window.devicePixelRatio;
        }
      }

      const deltaSeconds = lastRafTime === undefined ? 1 / 60 : (time - lastRafTime) / 1000;
      lastRafTime = time;
      const delta = Math.min(1, deltaSeconds);
      bodyTime += delta;

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
      if (enableBodyAnimationRef.current && vrmRef.current) {
        const amplitude = voiceRef.current.getCurrentAmplitude();
        const { pose, state } = computeBodyPose(
          bodyTime,
          amplitude,
          bodyState,
          defaultBodyAnimationConfig,
          delta
        );
        // Update the local state object properties without replacing the reference.
        Object.assign(bodyState, state);
        applyBodyPose(vrmRef.current, pose);
      }

      if (vrmRef.current) vrmRef.current.update(delta);
      renderer.render(scene, camera);

      // Render custom audio visualizer on canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const amp = voiceRef.current.getCurrentAmplitude();
        const numBars = 40;
        const barWidth = canvas.width / numBars;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#00f0ff";

        for (let i = 0; i < numBars; i++) {
          const x = i * barWidth;
          const sineFactor = Math.sin(time * 0.008 + i * 0.2);
          
          // Amplified reactive height when speaking, soft pulse when silent
          const height = amp > 0.01 
            ? (amp * canvas.height * 2.2 * (0.5 + 0.5 * sineFactor))
            : (6 + 4 * Math.sin(time * 0.004 + i * 0.3));

          const barH = Math.min(canvas.height - 8, height);
          const y = (canvas.height - barH) / 2;

          // Electric neon gradient
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, "#00f0ff");
          grad.addColorStop(0.5, "#ff007f");
          grad.addColorStop(1, "#00f0ff");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x + 3, y, barWidth - 6, barH, 3);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();

      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      try { mount.removeChild(renderer.domElement); } catch { /* already removed */ }
    };
  }, [modelUrl]);

  return (
    <div className="vrm-stage-container">
      <div ref={mountRef} className="vrm-mount" />
      <div className="vrm-hologram-grid" />
      <div className="vrm-scanline-overlay" />
      <canvas ref={canvasRef} className="vrm-visualizer-canvas" />
    </div>
  );
});
