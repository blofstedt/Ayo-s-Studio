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
  ({ backgroundMode = 'transparent', initialCameraPosition, isEditMode = false, initialPartPositions }, ref) => {
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
    const wavyMouthRef = useRef<THREE.Mesh | null>(null);
    const openMouthRef = useRef<THREE.Mesh | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgPlaneRef = useRef<THREE.Mesh | null>(null);

    const isEditModeRef = useRef(isEditMode);
    const bgUniformsRef = useRef({
      u_time: { value: 0 },
      u_mode: { value: 2 }
    });
    const activeEmotionRef = useRef<{type: string, endTime: number} | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    useEffect(() => {
        const initAudio = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                
                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
                dataArrayRef.current = dataArray;
            } catch (err) {
                console.error("Microphone access denied:", err);
            }
        };
        initAudio();
        
        return () => {
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

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
      bgPlane.visible = backgroundMode !== 'transparent' && backgroundMode !== 'green';
      if (backgroundMode === 'space') bgUniformsRef.current.u_mode.value = 2;
      if (backgroundMode === 'green') scene.background = new THREE.Color(0x00ff00);
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

      // Mouth
      const mouthGroup = new THREE.Group();
      if (initialPartPositions?.mouth) {
        mouthGroup.position.set(initialPartPositions.mouth.x, initialPartPositions.mouth.y, 0.05);
      } else {
        mouthGroup.position.set(0, -0.9, 0.05);
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
      
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let draggedObject: THREE.Object3D | null = null;
      let dragOffset = new THREE.Vector3();

      // Setup PiP Video Stream
      if (videoRef.current) {
        const stream = renderer.domElement.captureStream(30);
        videoRef.current.srcObject = stream;
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

      const animate = () => {
        timeoutId = window.setTimeout(animate, 33);
        const t = clock.getElapsedTime();
        bgUniformsRef.current.u_time.value = t;

        // Random blinking
        if (eyeRef.current) {
            const now = Date.now();
            if (!eyeRef.current.userData.nextBlink) eyeRef.current.userData.nextBlink = now + 3000;
            
            if (now > eyeRef.current.userData.nextBlink) {
                eyeRef.current.scale.y = 0.1; // Blink
                if (!eyeRef.current.userData.blinkEndTime) eyeRef.current.userData.blinkEndTime = now + 200;
            }
            
            if (eyeRef.current.userData.blinkEndTime && now > eyeRef.current.userData.blinkEndTime) {
                eyeRef.current.scale.y = 1.5; // Open
                eyeRef.current.userData.nextBlink = now + 3000 + Math.random() * 2000; // 3-5 seconds
                eyeRef.current.userData.blinkEndTime = null;
            }
        }

        // Mouth movement from mic
        let mouthOpenAmount = 0;
        if (analyserRef.current && dataArrayRef.current) {
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            let sum = 0;
            for (let i = 0; i < dataArrayRef.current.length; i++) {
                sum += dataArrayRef.current[i];
            }
            const average = sum / dataArrayRef.current.length;
            mouthOpenAmount = Math.min(1, average / 50); // Normalize
        }

        if (wavyMouthRef.current && openMouthRef.current) {
            if (mouthOpenAmount > 0.05) {
                wavyMouthRef.current.visible = false;
                openMouthRef.current.visible = true;
                openMouthRef.current.scale.set(1, mouthOpenAmount * 0.8, 1);
            } else {
                wavyMouthRef.current.visible = true;
                openMouthRef.current.visible = false;
            }
        }

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        window.removeEventListener('resize', handleResize);
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
          autoPlay
          style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -1 }} 
        />
      </div>
    );
  }
);

export default Avatar3DCanvas;
