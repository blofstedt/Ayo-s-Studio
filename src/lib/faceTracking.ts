import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker | null = null;
let imageLandmarker: FaceLandmarker | null = null;

export async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1
  });
  
  // Clear the console to hide the noisy WebAssembly logs
  setTimeout(() => console.clear(), 100);
  
  return faceLandmarker;
}

export async function initImageFaceLandmarker() {
  if (imageLandmarker) return imageLandmarker;
  
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  imageLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    runningMode: "IMAGE",
    numFaces: 1
  });
  
  // Clear the console to hide the noisy WebAssembly logs
  setTimeout(() => console.clear(), 100);
  
  return imageLandmarker;
}
