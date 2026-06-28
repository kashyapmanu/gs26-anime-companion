import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { VRMStage } from "../src/companion/VRMStage";

// Collect RAF callbacks so tests can drive frames.
let rafCallbacks: FrameRequestCallback[] = [];
const origRaf = globalThis.requestAnimationFrame;
const origCaf = globalThis.cancelAnimationFrame;

beforeEach(() => {
  rafCallbacks = [];
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  globalThis.cancelAnimationFrame = () => {};
});

afterEach(() => {
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return {
    ...actual,
    WebGLRenderer: vi.fn(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      domElement: document.createElement("canvas"),
    })),
    Scene: vi.fn(() => ({ add: vi.fn() })),
    PerspectiveCamera: vi.fn(() => ({
      aspect: 1,
      position: { set: vi.fn() },
      lookAt: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    })),
    DirectionalLight: vi.fn(() => ({ position: { set: vi.fn() } })),
    AmbientLight: vi.fn(() => ({})),
    Box3: vi.fn(() => ({
      setFromObject: vi.fn(() => ({
        getCenter: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
        getSize: vi.fn(() => ({ x: 1, y: 1, z: 1 })),
      })),
    })),
    Vector3: vi.fn((x = 0, y = 0, z = 0) => ({ x, y, z })),
  };
});

const mockApplyBodyPose = vi.fn();
vi.mock("../src/companion/VRMHumanoidDriver", () => ({
  applyBodyPose: (...args: unknown[]) => mockApplyBodyPose(...args),
}));

let loadCallback: ((gltf: unknown) => void) | null = null;
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: vi.fn(() => ({
    register: vi.fn(),
    load: vi.fn((_url: string, onLoad: (gltf: unknown) => void) => {
      loadCallback = onLoad;
    }),
  })),
}));

vi.mock("@pixiv/three-vrm", async () => ({
  VRMLoaderPlugin: vi.fn(),
  VRM: class MockVRM {
    scene = { add: vi.fn() };
    expressionManager = {
      setValue: vi.fn(),
      getExpression: vi.fn(() => null),
      getExpressionTrackName: vi.fn(() => null),
    };
    humanoid = {
      getNormalizedBoneNode: vi.fn(() => ({
        rotation: { set: vi.fn() },
      })),
    };
    update = vi.fn();
  },
}));

describe("VRMStage body animation integration", () => {
  it("calls applyBodyPose when body animation is enabled", async () => {
    mockApplyBodyPose.mockClear();
    render(<VRMStage modelUrl="/fake.vrm" enableBodyAnimation={true} />);

    // Simulate VRM load.
    loadCallback?.({
      userData: {
        vrm: new (await import("@pixiv/three-vrm")).VRM(),
      },
    });

    // Pump a few frames.
    expect(rafCallbacks.length).toBeGreaterThan(0);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(16.7);

    await waitFor(() => {
      expect(mockApplyBodyPose).toHaveBeenCalled();
    });
  });

  it("does not call applyBodyPose when body animation is disabled", async () => {
    mockApplyBodyPose.mockClear();
    render(<VRMStage modelUrl="/fake.vrm" enableBodyAnimation={false} />);

    loadCallback?.({
      userData: {
        vrm: new (await import("@pixiv/three-vrm")).VRM(),
      },
    });

    expect(rafCallbacks.length).toBeGreaterThan(0);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(16.7);

    expect(mockApplyBodyPose).not.toHaveBeenCalled();
  });
});
