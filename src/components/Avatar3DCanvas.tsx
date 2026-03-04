import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface Avatar3DCanvasRef {
  togglePiP: () => Promise<void>;
  getCameraPosition: () => { x: number; y: number; z: number };
  setCameraPosition: (pos: { x: number; y: number; z: number }) => void;
  getPartPositions: () => Record<string, { x: number; y: number }>;
  triggerEmotion: (emotion: 'happy' | 'sad' | 'angry' | 'surprised') => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface Avatar3DCanvasProps {
  blendshapes: Category[] | null;
  matrix: Float32Array | null;
  landmarks?: NormalizedLandmark[] | null;
  backgroundMode?: string;
  initialCameraPosition?: { x: number; y: number; z: number };
  isEditMode?: boolean;
  initialPartPositions?: Record<string, { x: number; y: number }>;
}

const bgVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bgFragmentShader = `
  varying vec2 vUv;
  uniform float u_time;
  uniform int u_mode;

  float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }

  void main() {
    if (u_mode == 2) {
      // Space
      vec2 uv = vUv;
      uv.x += u_time * 0.02;
      vec2 i_uv = floor(uv * 100.0);
      vec2 f_uv = fract(uv * 100.0);
      float star = random(i_uv);
      if (star > 0.98 && distance(f_uv, vec2(0.5)) < 0.2) {
          float twinkle = sin(u_time * 3.0 + star * 100.0) * 0.5 + 0.5;
          gl_FragColor = vec4(vec3(twinkle), 1.0);
      } else {
          gl_FragColor = vec4(0.0, 0.0, 0.05, 1.0);
      }
    } else if (u_mode == 3) {
      // Synthwave
      vec2 uv = vUv;
      if (uv.y > 0.5) {
          gl_FragColor = mix(vec4(1.0, 0.2, 0.5, 1.0), vec4(0.1, 0.0, 0.3, 1.0), (uv.y - 0.5) * 2.0);
      } else {
          float p = (0.5 - uv.y);
          float x = (uv.x - 0.5) / (p + 0.01);
          float lineX = abs(fract(x * 5.0) - 0.5) < 0.05 ? 1.0 : 0.0;
          float lineY = abs(fract(p * 10.0 - u_time) - 0.5) < 0.05 ? 1.0 : 0.0;
          float grid = max(lineX, lineY) * (1.0 - p * 2.0);
          gl_FragColor = mix(vec4(0.05, 0.0, 0.1, 1.0), vec4(0.0, 1.0, 1.0, 1.0), grid);
      }
    } else if (u_mode == 4) {
      // Plasma
      vec2 uv = vUv * 3.0;
      float v = sin(uv.x + u_time) + sin(uv.y + u_time) + sin(uv.x * uv.y + u_time);
      gl_FragColor = vec4(sin(v)*0.5+0.5, cos(v)*0.5+0.5, sin(v*2.0)*0.5+0.5, 1.0);
    } else if (u_mode == 5) {
      // Sunset
      vec2 uv = vUv;
      vec3 topColor = vec3(0.4, 0.1, 0.5);
      vec3 bottomColor = vec3(1.0, 0.5, 0.2);
      vec3 color = mix(bottomColor, topColor, uv.y);
      float sun = smoothstep(0.1, 0.08, length(uv - vec2(0.5, 0.3)));
      color = mix(color, vec3(1.0, 0.9, 0.5), sun);
      gl_FragColor = vec4(color, 1.0);
    } else if (u_mode == 6) {
      // Ocean
      vec2 uv = vUv * 10.0;
      float wave = sin(uv.x + u_time) * 0.5 + 0.5;
      vec3 color = mix(vec3(0.0, 0.3, 0.6), vec3(0.0, 0.6, 0.8), wave * uv.y * 0.1);
      gl_FragColor = vec4(color, 1.0);
    } else if (u_mode == 7) {
      // Lava
      vec2 uv = vUv * 3.0;
      float n = sin(uv.x * 2.0 + u_time) * cos(uv.y * 2.0 + u_time * 0.5);
      vec3 color = mix(vec3(0.8, 0.1, 0.0), vec3(1.0, 0.6, 0.0), n * 0.5 + 0.5);
      gl_FragColor = vec4(color, 1.0);
    } else if (u_mode == 8) {
      // Rainbow
      vec2 uv = vUv;
      vec3 color = 0.5 + 0.5 * cos(u_time + uv.xyx * vec3(1.0, 1.0, 1.0) + vec3(0.0, 2.0, 4.0));
      gl_FragColor = vec4(color, 1.0);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
  }
`;

const Avatar3DCanvas = forwardRef<Avatar3DCanvasRef, Avatar3DCanvasProps>(
  ({ blendshapes, matrix, landmarks, backgroundMode = 'transparent', initialCameraPosition, isEditMode = false, initialPartPositions }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const characterRef = useRef<THREE.Group | null>(null);
    const headGroupRef = useRef<THREE.Group | null>(null);
    const hairGroupRef = useRef<THREE.Group | null>(null);
    const mouthGroupRef = useRef<THREE.Group | null>(null);
    const eyeRef = useRef<THREE.Mesh | null>(null);
    const eyebrowGroupRef = useRef<THREE.Group | null>(null);
    const eyebrowRef = useRef<THREE.Mesh | null>(null);
    const wavyMouthRef = useRef<THREE.Mesh | null>(null);
    const openMouthRef = useRef<THREE.Mesh | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgPlaneRef = useRef<THREE.Mesh | null>(null);

    const matrixRef = useRef(matrix);
    const blendshapesRef = useRef(blendshapes);
    const landmarksRef = useRef(landmarks);
    const isEditModeRef = useRef(isEditMode);
    const bgUniformsRef = useRef({
      u_time: { value: 0 },
      u_mode: { value: 2 }
    });
    const activeEmotionRef = useRef<{type: string, endTime: number} | null>(null);

    useEffect(() => { matrixRef.current = matrix; }, [matrix]);
    useEffect(() => { blendshapesRef.current = blendshapes; }, [blendshapes]);
    useEffect(() => { landmarksRef.current = landmarks; }, [landmarks]);
    useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);

    useImperativeHandle(ref, () => ({
      togglePiP: async () => {
        if (!videoRef.current) return;
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await videoRef.current.requestPictureInPicture();
          }
        } catch (err) {
          console.error("PiP Error:", err);
        }
      },
      getCameraPosition: () => {
        if (!cameraRef.current) return { x: 0, y: 0, z: 8 };
        const { x, y, z } = cameraRef.current.position;
        return { x, y, z };
      },
      setCameraPosition: (pos) => {
        if (cameraRef.current) {
          cameraRef.current.position.set(pos.x, pos.y, pos.z);
        }
      },
      getPartPositions: () => {
        return {
          eye: { x: eyeRef.current?.position.x || 0, y: eyeRef.current?.position.y || 0 },
          eyebrow: { x: eyebrowGroupRef.current?.position.x || 0, y: eyebrowGroupRef.current?.position.y || 0 },
          mouth: { x: mouthGroupRef.current?.position.x || 0, y: mouthGroupRef.current?.position.y || 0 },
          hair: { x: hairGroupRef.current?.position.x || 0, y: hairGroupRef.current?.position.y || 0 }
        };
      },
      triggerEmotion: (emotion) => {
        activeEmotionRef.current = { type: emotion, endTime: Date.now() + 2000 };
      },
      getCanvas: () => rendererRef.current?.domElement || null
    }));

    useEffect(() => {
      if (initialCameraPosition && cameraRef.current) {
        cameraRef.current.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);
      }
    }, [initialCameraPosition]);

    useEffect(() => {
      if (!wrapperRef.current || !containerRef.current) return;

      const wrapper = wrapperRef.current;
      const container = containerRef.current;
      
      const RENDER_SIZE = 1080; // Fixed high resolution for crisp PiP

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(RENDER_SIZE, RENDER_SIZE, false); // false prevents setting CSS width/height
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      if (initialCameraPosition) {
        camera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);
      } else {
        camera.position.set(0, 0, 8);
      }
      cameraRef.current = camera;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(0, 5, 10);
      scene.add(dirLight);

      // Background Plane
      const bgGeo = new THREE.PlaneGeometry(200, 200);
      const bgMat = new THREE.ShaderMaterial({
        vertexShader: bgVertexShader,
        fragmentShader: bgFragmentShader,
        uniforms: bgUniformsRef.current,
        depthWrite: false
      });
      const bgPlane = new THREE.Mesh(bgGeo, bgMat);
      bgPlane.position.z = -50;
      bgPlane.visible = false;
      scene.add(bgPlane);
      bgPlaneRef.current = bgPlane;

      // Character Group
      const character = new THREE.Group();
      scene.add(character);
      characterRef.current = character;

      // Body (Blue Triangle)
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(0, 2);
      bodyShape.lineTo(-2.5, -4);
      bodyShape.lineTo(2.5, -4);
      bodyShape.lineTo(0, 2);
      const bodyGeo = new THREE.ShapeGeometry(bodyShape);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1d52b8 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = -1.5;
      body.position.z = -1.0;
      
      const bodyOutlineGeo = new THREE.ShapeGeometry(bodyShape);
      const bodyOutlineMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const bodyOutline = new THREE.Mesh(bodyOutlineGeo, bodyOutlineMat);
      bodyOutline.scale.set(1.05, 1.05, 1);
      bodyOutline.position.z = -0.01;
      body.add(bodyOutline);
      
      character.add(body);

      // Head Group
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.0;
      character.add(headGroup);
      headGroupRef.current = headGroup;

      // Head (Tan Circle)
      const headGeo = new THREE.CircleGeometry(1.5, 32);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xd49a5b });
      const head = new THREE.Mesh(headGeo, headMat);
      headGroup.add(head);

      const headOutlineGeo = new THREE.CircleGeometry(1.55, 32);
      const headOutlineMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const headOutline = new THREE.Mesh(headOutlineGeo, headOutlineMat);
      headOutline.position.z = -0.01;
      headGroup.add(headOutline);

      // Hair (Brown Puffs)
      const hairGroup = new THREE.Group();
      hairGroup.position.z = 0.01;
      if (initialPartPositions?.hair) {
        hairGroup.position.x = initialPartPositions.hair.x;
        hairGroup.position.y = initialPartPositions.hair.y;
      }
      headGroup.add(hairGroup);
      hairGroupRef.current = hairGroup;
      
      const hairMat = new THREE.MeshBasicMaterial({ color: 0x3e2f25 });
      const hairOutlineMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      
      const addHairPuff = (x: number, y: number, r: number) => {
        const puff = new THREE.Mesh(new THREE.CircleGeometry(r, 32), hairMat);
        puff.position.set(x, y, 0.01);
        const outline = new THREE.Mesh(new THREE.CircleGeometry(r + 0.08, 32), hairOutlineMat);
        outline.position.z = -0.01;
        puff.add(outline);
        hairGroup.add(puff);
      };
      
      addHairPuff(0, 1.2, 1.2);
      addHairPuff(-1.0, 1.0, 0.9);
      addHairPuff(1.0, 1.0, 0.9);
      addHairPuff(-1.5, 0.5, 0.7);
      addHairPuff(1.5, 0.5, 0.7);
      addHairPuff(-1.6, 0.0, 0.5);
      addHairPuff(1.6, 0.0, 0.5);

      // Eye (Large Black Oval on the Left)
      const eyeGeo = new THREE.CircleGeometry(0.5, 32);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.8, 1.5, 1);
      if (initialPartPositions?.eye) {
        eye.position.set(initialPartPositions.eye.x, initialPartPositions.eye.y, 0.05);
      } else {
        eye.position.set(-0.6, 0.2, 0.05);
      }
      headGroup.add(eye);
      eyeRef.current = eye;

      // Eyebrow
      const eyebrowGroup = new THREE.Group();
      if (initialPartPositions?.eyebrow) {
        eyebrowGroup.position.set(initialPartPositions.eyebrow.x, initialPartPositions.eyebrow.y, 0.06);
      } else {
        eyebrowGroup.position.set(-0.6, 1.1, 0.06);
      }
      headGroup.add(eyebrowGroup);
      eyebrowGroupRef.current = eyebrowGroup;

      const browShape = new THREE.Shape();
      browShape.moveTo(-0.4, 0);
      browShape.quadraticCurveTo(0, 0.2, 0.4, 0);
      browShape.quadraticCurveTo(0.45, -0.05, 0.4, -0.1);
      browShape.quadraticCurveTo(0, 0.1, -0.4, -0.1);
      browShape.quadraticCurveTo(-0.45, -0.05, -0.4, 0);

      const eyebrowGeo = new THREE.ShapeGeometry(browShape);
      const eyebrowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const eyebrow = new THREE.Mesh(eyebrowGeo, eyebrowMat);
      eyebrowGroup.add(eyebrow);
      eyebrowRef.current = eyebrow;

      // Mouth
      const mouthGroup = new THREE.Group();
      if (initialPartPositions?.mouth) {
        mouthGroup.position.set(initialPartPositions.mouth.x, initialPartPositions.mouth.y, 0.05);
      } else {
        mouthGroup.position.set(0, -0.5, 0.05);
      }
      headGroup.add(mouthGroup);
      mouthGroupRef.current = mouthGroup;
      
      const wavyMouthShape = new THREE.Shape();
      const t = 0.04;
      wavyMouthShape.moveTo(-0.45, 0.1 - t);
      wavyMouthShape.quadraticCurveTo(-0.25, -0.2 - t, 0, 0.0 - t);
      wavyMouthShape.quadraticCurveTo(0.25, -0.2 - t, 0.45, 0.1 - t);
      wavyMouthShape.absarc(0.45, 0.1, t, -Math.PI/2, Math.PI/2, false);
      wavyMouthShape.quadraticCurveTo(0.25, -0.2 + t, 0, 0.0 + t);
      wavyMouthShape.quadraticCurveTo(-0.25, -0.2 + t, -0.45, 0.1 + t);
      wavyMouthShape.absarc(-0.45, 0.1, t, Math.PI/2, Math.PI*1.5, false);
      
      const wavyMouthGeo = new THREE.ShapeGeometry(wavyMouthShape);
      const wavyMouth = new THREE.Mesh(wavyMouthGeo, eyeMat);
      mouthGroup.add(wavyMouth);
      wavyMouthRef.current = wavyMouth;
      
      const openMouthGeo = new THREE.CircleGeometry(0.4, 32);
      const openMouth = new THREE.Mesh(openMouthGeo, eyeMat);
      openMouth.scale.set(1, 0.01, 1);
      openMouth.visible = false;
      mouthGroup.add(openMouth);
      openMouthRef.current = openMouth;

      // Setup Raycaster for Edit Mode
      const draggableObjects: THREE.Object3D[] = [];
      const dragMap = new Map<THREE.Object3D, THREE.Object3D>();
      
      const hairHit = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshBasicMaterial({ visible: false }));
      hairHit.position.y = 0.8;
      hairGroup.add(hairHit);
      draggableObjects.push(hairHit);
      dragMap.set(hairHit, hairGroup);

      draggableObjects.push(eye);
      dragMap.set(eye, eye);

      const eyebrowHit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
      eyebrowGroup.add(eyebrowHit);
      draggableObjects.push(eyebrowHit);
      dragMap.set(eyebrowHit, eyebrowGroup);

      const mouthHit = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshBasicMaterial({ visible: false }));
      mouthGroup.add(mouthHit);
      draggableObjects.push(mouthHit);
      dragMap.set(mouthHit, mouthGroup);

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let draggedObject: THREE.Object3D | null = null;
      let dragOffset = new THREE.Vector3();

      // Setup PiP Video Stream
      if (videoRef.current) {
        const stream = renderer.domElement.captureStream(30);
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.error("Video play error:", e));
      }

      const handleResize = () => {
        if (!wrapperRef.current || !containerRef.current) return;
        const w = wrapperRef.current.clientWidth;
        const h = wrapperRef.current.clientHeight;
        const newSize = Math.min(w, h);
        
        containerRef.current.style.width = `${newSize}px`;
        containerRef.current.style.height = `${newSize}px`;
      };
      handleResize(); // Set initial size
      window.addEventListener('resize', handleResize);

      // Animation Loop using setTimeout for background execution
      let timeoutId: number;
      const clock = new THREE.Clock();

      // Handle Zoom (Pinch and Scroll) and Pan (Drag)
      let initialPinchDistance = -1;
      let initialCameraZ = camera.position.z;
      let isDragging = false;
      let previousPos = { x: 0, y: 0 };

      const getPos = (e: TouchEvent | MouseEvent) => {
        if ('touches' in e && e.touches.length > 0) {
          return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      };

      const handleDown = (e: TouchEvent | MouseEvent) => {
        if (isEditModeRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          const pos = getPos(e);
          mouse.x = ((pos.x - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((pos.y - rect.top) / rect.height) * 2 + 1;
          
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(draggableObjects, false);
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            draggedObject = dragMap.get(hit) || null;
            if (draggedObject) {
              isDragging = true;
              const intersectPoint = intersects[0].point;
              if (draggedObject.parent) {
                draggedObject.parent.worldToLocal(intersectPoint);
                dragOffset.copy(draggedObject.position).sub(intersectPoint);
              }
              return;
            }
          }
        }

        if ('touches' in e && e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
          initialCameraZ = camera.position.z;
          isDragging = false;
        } else if (!('touches' in e) || e.touches.length === 1) {
          isDragging = true;
          previousPos = getPos(e);
        }
      };

      const handleMove = (e: TouchEvent | MouseEvent) => {
        if (isEditModeRef.current && draggedObject && isDragging) {
          e.preventDefault();
          const rect = renderer.domElement.getBoundingClientRect();
          const pos = getPos(e);
          mouse.x = ((pos.x - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((pos.y - rect.top) / rect.height) * 2 + 1;
          
          raycaster.setFromCamera(mouse, camera);
          const targetZ = new THREE.Vector3().setFromMatrixPosition(draggedObject.matrixWorld).z;
          const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -targetZ);
          const intersectPoint = new THREE.Vector3();
          raycaster.ray.intersectPlane(plane, intersectPoint);
          
          if (intersectPoint && draggedObject.parent) {
            draggedObject.parent.worldToLocal(intersectPoint);
            draggedObject.position.x = intersectPoint.x + dragOffset.x;
            draggedObject.position.y = intersectPoint.y + dragOffset.y;
          }
          return;
        }

        if ('touches' in e && e.touches.length === 2 && initialPinchDistance > 0) {
          e.preventDefault(); // Prevent scrolling while zooming
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const scale = initialPinchDistance / distance;
          let newZ = initialCameraZ * scale;
          newZ = Math.max(3, Math.min(newZ, 60)); // Clamp zoom
          camera.position.z = newZ;
        } else if (isDragging) {
          e.preventDefault();
          const pos = getPos(e);
          const dx = pos.x - previousPos.x;
          const dy = pos.y - previousPos.y;
          previousPos = pos;

          const panSpeed = camera.position.z * 0.0015;
          camera.position.x -= dx * panSpeed;
          camera.position.y += dy * panSpeed;
        }
      };

      const handleUp = (e: TouchEvent | MouseEvent) => {
        if (draggedObject) {
          draggedObject = null;
          isDragging = false;
          return;
        }

        if ('touches' in e && e.touches.length < 2) {
          initialPinchDistance = -1;
        }
        if (!('touches' in e) || e.touches.length === 0) {
          isDragging = false;
        }
      };

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        let newZ = camera.position.z + e.deltaY * 0.01;
        newZ = Math.max(3, Math.min(newZ, 60));
        camera.position.z = newZ;
      };

      const handleTouchStart = (e: TouchEvent) => handleDown(e);
      const handleTouchMove = (e: TouchEvent) => handleMove(e);
      const handleTouchEnd = (e: TouchEvent) => handleUp(e);
      
      const handleMouseDown = (e: MouseEvent) => handleDown(e);
      const handleMouseMove = (e: MouseEvent) => handleMove(e);
      const handleMouseUp = (e: MouseEvent) => handleUp(e);

      wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
      wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
      wrapper.addEventListener('touchend', handleTouchEnd);
      wrapper.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
      wrapper.addEventListener('wheel', handleWheel, { passive: false });

      const animate = () => {
        timeoutId = window.setTimeout(animate, 33);
        const t = clock.getElapsedTime();
        bgUniformsRef.current.u_time.value = t;

        // Apply limited head rotation
        if (matrixRef.current && headGroupRef.current) {
          const mat = new THREE.Matrix4().fromArray(matrixRef.current);
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          mat.decompose(position, quaternion, scale);

          const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
          
          // Limit rotation to a reasonable threshold (e.g., +/- 15 degrees = ~0.26 radians)
          const limit = 0.26;
          
          // MediaPipe matrix axes: Y and Z are usually inverted compared to Three.js
          // Only apply Z-axis rotation (roll) to keep the avatar 2D
          const targetZ = Math.max(-limit, Math.min(limit, -euler.z));
          
          // Smoothly interpolate to the target rotation
          headGroupRef.current.rotation.z += (targetZ - headGroupRef.current.rotation.z) * 0.3;
        }

        // Apply Blendshapes and Landmarks
        if (blendshapesRef.current) {
          let mouthOpenAmount = 0;
          if (landmarksRef.current && landmarksRef.current.length > 14) {
            // Use inner lip landmarks (13 and 14) to calculate actual mouth opening distance
            const upperLip = landmarksRef.current[13];
            const lowerLip = landmarksRef.current[14];
            // Calculate distance and normalize it
            const distance = Math.abs(lowerLip.y - upperLip.y);
            // Threshold to ignore tiny movements, scale up the rest
            mouthOpenAmount = Math.max(0, (distance - 0.01) * 10);
          } else {
            // Fallback to blendshape if landmarks aren't available
            mouthOpenAmount = blendshapesRef.current.find(b => b.categoryName === 'jawOpen')?.score || 0;
          }

          let smileLeft = blendshapesRef.current.find(b => b.categoryName === 'mouthSmileLeft')?.score || 0;
          let smileRight = blendshapesRef.current.find(b => b.categoryName === 'mouthSmileRight')?.score || 0;
          let smile = (smileLeft + smileRight) / 2;
          let blinkLeft = blendshapesRef.current.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
          let blinkRight = blendshapesRef.current.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
          let blink = Math.max(blinkLeft, blinkRight);

          let browInnerUp = blendshapesRef.current.find(b => b.categoryName === 'browInnerUp')?.score || 0;
          let browDownLeft = blendshapesRef.current.find(b => b.categoryName === 'browDownLeft')?.score || 0;
          let browDownRight = blendshapesRef.current.find(b => b.categoryName === 'browDownRight')?.score || 0;
          let browDown = Math.max(browDownLeft, browDownRight);

          if (activeEmotionRef.current) {
            const { type, endTime } = activeEmotionRef.current;
            const now = Date.now();
            if (now < endTime) {
              const progress = (endTime - now) / 2000;
              const intensity = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
              
              if (type === 'happy') {
                smile = Math.max(smile, intensity);
              } else if (type === 'sad') {
                browInnerUp = Math.max(browInnerUp, intensity);
                smile = 0;
              } else if (type === 'angry') {
                browDown = Math.max(browDown, intensity);
              } else if (type === 'surprised') {
                browInnerUp = Math.max(browInnerUp, intensity);
                mouthOpenAmount = Math.max(mouthOpenAmount, intensity * 0.8);
              }
            } else {
              activeEmotionRef.current = null;
            }
          }

          if (eyeRef.current) {
            eyeRef.current.scale.y = blink > 0.4 ? 0.1 : 1.5;
          }

          if (eyebrowRef.current) {
            const browOffset = (browInnerUp * 0.4) - (browDown * 0.3);
            eyebrowRef.current.position.y = browOffset;
            // Very slight rotation just for expression, but not slanted/angry by default
            eyebrowRef.current.rotation.z = (browInnerUp * 0.1);
          }

          if (wavyMouthRef.current && openMouthRef.current) {
            if (mouthOpenAmount > 0.05) {
              wavyMouthRef.current.visible = false;
              openMouthRef.current.visible = true;
              openMouthRef.current.scale.set(1 + smile * 0.5, mouthOpenAmount * 1.5, 1);
            } else {
              wavyMouthRef.current.visible = true;
              openMouthRef.current.visible = false;
              wavyMouthRef.current.scale.set(1 + smile * 0.5, 1 + smile * 0.5, 1);
            }
          }
        }

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        window.removeEventListener('resize', handleResize);
        wrapper.removeEventListener('touchstart', handleTouchStart);
        wrapper.removeEventListener('touchmove', handleTouchMove);
        wrapper.removeEventListener('touchend', handleTouchEnd);
        wrapper.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        wrapper.removeEventListener('wheel', handleWheel);
        clearTimeout(timeoutId);
        renderer.dispose();
        container.innerHTML = '';
      };
    }, []);

    // Handle Background Mode Toggle
    useEffect(() => {
      if (!sceneRef.current || !bgPlaneRef.current) return;
      const scene = sceneRef.current;
      const bgPlane = bgPlaneRef.current;

      if (backgroundMode === 'transparent') {
        scene.background = null;
        bgPlane.visible = false;
      } else if (backgroundMode === 'green') {
        scene.background = new THREE.Color(0x00ff00);
        bgPlane.visible = false;
      } else {
        scene.background = null;
        bgPlane.visible = true;
        if (backgroundMode === 'space') bgUniformsRef.current.u_mode.value = 2;
        if (backgroundMode === 'synthwave') bgUniformsRef.current.u_mode.value = 3;
        if (backgroundMode === 'plasma') bgUniformsRef.current.u_mode.value = 4;
        if (backgroundMode === 'sunset') bgUniformsRef.current.u_mode.value = 5;
        if (backgroundMode === 'ocean') bgUniformsRef.current.u_mode.value = 6;
        if (backgroundMode === 'lava') bgUniformsRef.current.u_mode.value = 7;
        if (backgroundMode === 'rainbow') bgUniformsRef.current.u_mode.value = 8;
      }
    }, [backgroundMode]);

    return (
      <div ref={wrapperRef} className="w-full h-full flex items-center justify-center relative">
        <div ref={containerRef} />
        <video 
          ref={videoRef} 
          muted 
          playsInline 
          style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} 
        />
      </div>
    );
  }
);

export default Avatar3DCanvas;
