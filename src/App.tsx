import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, UserCircle2, MonitorUp, Image as ImageIcon, Save, Edit2, Check, ChevronDown, Film } from 'lucide-react';
import { Category, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import Avatar3DCanvas, { Avatar3DCanvasRef } from './components/Avatar3DCanvas';
import WebcamFeed from './components/WebcamFeed';
import VideoEditor from './components/VideoEditor';
import { initFaceLandmarker } from './lib/faceTracking';

const SHEET_ID = '1iYe000PUAPL26qjH92xaFaut-89vsshI9iq7CXGW670';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

const BACKGROUNDS = [
  { id: 'transparent', name: 'Transparent', preview: 'bg-zinc-800 bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAACVJREFUKFNjZCASMDKgAhhwGv///x+PBlQxRkZGMvQzUoHhXAwA4/cM/x+v5i0AAAAASUVORK5CYII=")]' },
  { id: 'green', name: 'Green Screen', preview: 'bg-[#00ff00]' },
  { id: 'space', name: 'Deep Space', preview: 'bg-gradient-to-br from-slate-900 to-indigo-950' },
  { id: 'synthwave', name: 'Synthwave', preview: 'bg-gradient-to-b from-purple-900 to-pink-600' },
  { id: 'plasma', name: 'Plasma', preview: 'bg-gradient-to-tr from-rose-500 via-purple-500 to-blue-500' },
  { id: 'sunset', name: 'Sunset', preview: 'bg-gradient-to-t from-orange-500 to-purple-800' },
  { id: 'ocean', name: 'Ocean', preview: 'bg-gradient-to-b from-blue-400 to-blue-800' },
  { id: 'lava', name: 'Lava', preview: 'bg-gradient-to-br from-red-600 to-orange-500' },
  { id: 'rainbow', name: 'Rainbow', preview: 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500' },
];

export default function App() {
  const [blendshapes, setBlendshapes] = useState<Category[] | null>(null);
  const [transformMatrix, setTransformMatrix] = useState<Float32Array | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  
  const [backgroundMode, setBackgroundMode] = useState(() => {
    try {
      const saved = localStorage.getItem('avatar_settings');
      return saved ? JSON.parse(saved).bg || 'transparent' : 'transparent';
    } catch { return 'transparent'; }
  });
  
  const [initialCameraPos, setInitialCameraPos] = useState<{x: number, y: number, z: number} | undefined>(() => {
    try {
      const saved = localStorage.getItem('avatar_settings');
      return saved ? JSON.parse(saved).cam : undefined;
    } catch { return undefined; }
  });

  const [initialPartPositions, setInitialPartPositions] = useState<Record<string, {x: number, y: number}> | undefined>(() => {
    try {
      const saved = localStorage.getItem('avatar_settings');
      return saved ? JSON.parse(saved).parts : undefined;
    } catch { return undefined; }
  });

  const [isSaved, setIsSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isBgMenuOpen, setIsBgMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'avatar' | 'studio'>('avatar');
  const bgMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bgMenuRef.current && !bgMenuRef.current.contains(event.target as Node)) {
        setIsBgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request camera permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const permissions = await CapacitorCamera.checkPermissions();
        if (permissions.camera !== 'granted') {
          await CapacitorCamera.requestPermissions();
        }
      } catch (err) {
        console.log('Camera permission request skipped (likely not in Capacitor context)', err);
      }
    };
    requestPermissions();
  }, []);

  // Load from Google Sheets on mount
  useEffect(() => {
    const loadFromSheet = async () => {
      try {
        const res = await fetch(CSV_URL);
        if (!res.ok) return;
        const text = await res.text();
        
        // Parse first row of CSV
        const firstLine = text.split('\n')[0];
        if (firstLine) {
          const values = firstLine.split(',').map(s => s.replace(/(^"|"$)/g, ''));
          if (values.length >= 4) {
            const x = parseFloat(values[0]);
            const y = parseFloat(values[1]);
            const z = parseFloat(values[2]);
            const bg = values[3];
            
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              setInitialCameraPos({ x, y, z });
              if (bg) setBackgroundMode(bg);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load from Google Sheets:", err);
      }
    };
    
    loadFromSheet();
  }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const canvasRef = useRef<Avatar3DCanvasRef>(null);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
  }, []);

  const handleCalibrate = useCallback(() => {
    // Calibration no longer needed for 3D model as it uses absolute transformation matrix
  }, []);

  const handlePiP = () => {
    if (canvasRef.current) {
      canvasRef.current.togglePiP();
    }
  };

  const handleSave = async () => {
    if (canvasRef.current) {
      const cam = canvasRef.current.getCameraPosition();
      const parts = canvasRef.current.getPartPositions();
      const settings = { bg: backgroundMode, cam, parts };
      
      // Save locally as fallback
      localStorage.setItem('avatar_settings', JSON.stringify(settings));
      
      // Save to Google Sheets via Apps Script
      const scriptUrl = localStorage.getItem('apps_script_url');
      if (!scriptUrl) {
        const url = window.prompt(
          "To write to Google Sheets without API keys, you need a Google Apps Script Web App.\n\n" +
          "Please paste your Web App URL here:"
        );
        if (url) {
          localStorage.setItem('apps_script_url', url);
          handleSave(); // Retry save
        }
        return;
      }

      try {
        await fetch(scriptUrl, {
          method: 'POST',
          mode: 'no-cors', // Required for Apps Script without complex CORS setup
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            x: cam.x,
            y: cam.y,
            zoom: cam.z,
            background: backgroundMode
          })
        });
        
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } catch (err) {
        console.error("Failed to save to Google Sheets:", err);
        alert("Failed to save to Google Sheets. Check console for details.");
      }
    }
  };

  useEffect(() => {
    let active = true;

    const detectWebcamFace = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        if (active) timeoutRef.current = window.setTimeout(detectWebcamFace, 33);
        return;
      }

      try {
        const landmarker = await initFaceLandmarker();
        const video = videoRef.current;
        
        const startTimeMs = performance.now();
        // Always process the frame even if video.currentTime hasn't changed, 
        // to ensure the loop keeps running and updating the PiP canvas when the app is minimized.
        const result = landmarker.detectForVideo(video, startTimeMs);

        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          // Deep clone the landmarks so React detects the state change
          const clonedLandmarks = result.faceLandmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
          setLandmarks(clonedLandmarks);

          if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
            setBlendshapes(result.faceBlendshapes[0].categories);
          }
          if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
            // Clone the matrix array so React detects the change
            setTransformMatrix(new Float32Array(result.facialTransformationMatrixes[0].data));
          }
        } else {
          setLandmarks(null);
        }
      } catch (err) {
        console.error("Webcam detection error:", err);
      }

      if (active) {
        timeoutRef.current = window.setTimeout(detectWebcamFace, 33);
      }
    };

    detectWebcamFace();

    return () => {
      active = false;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 hidden xs:block sm:block">
              Avatar Tracker
            </h1>
          </div>

          <div className="flex items-center bg-zinc-900/80 p-1 rounded-full border border-white/10 shrink-0">
            <button 
              onClick={() => setActiveTab('avatar')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'avatar' ? 'bg-indigo-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <UserCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">Avatar</span>
            </button>
            <button 
              onClick={() => setActiveTab('studio')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'studio' ? 'bg-indigo-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              <Film className="w-4 h-4" />
              <span className="hidden sm:inline">Studio</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 pb-1 -mb-1 scrollbar-hide">
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full transition-all shadow-sm text-sm font-medium border shrink-0 ${
                isEditMode 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30' 
                  : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {isEditMode ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isEditMode ? 'Done Editing' : 'Edit Mode'}</span>
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-full transition-all shadow-sm text-sm font-medium shrink-0"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">{isSaved ? 'Saved!' : 'Save'}</span>
            </button>
            <div className="relative" ref={bgMenuRef}>
              <button
                onClick={() => setIsBgMenuOpen(!isBgMenuOpen)}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2 hover:bg-white/10 transition-colors shrink-0"
              >
                <ImageIcon className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-200">
                  {BACKGROUNDS.find(b => b.id === backgroundMode)?.name || 'Background'}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
              
              {isBgMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-1">
                    {BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => {
                          setBackgroundMode(bg.id);
                          setIsBgMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 w-full p-2 rounded-lg transition-colors ${
                          backgroundMode === bg.id ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-md border border-white/10 shrink-0 ${bg.preview}`} />
                        <span className="text-sm font-medium text-zinc-200 text-left flex-1">{bg.name}</span>
                        {backgroundMode === bg.id && <Check className="w-4 h-4 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handlePiP}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium shrink-0"
            >
              <MonitorUp className="w-4 h-4" />
              <span className="hidden sm:inline">Pop Out (PiP)</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] h-[calc(100vh-4rem-env(safe-area-inset-top))] relative">
        <div className={`flex flex-col gap-4 sm:gap-6 h-full ${activeTab === 'avatar' ? 'block' : 'absolute opacity-0 pointer-events-none -left-[9999px]'}`}>
          {/* Top: Webcam */}
          <div className="flex-1 min-h-0 relative rounded-3xl overflow-hidden border border-white/5 bg-[#111] shadow-2xl flex flex-col">
            <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium tracking-wide flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Webcam Feed
            </div>
            <WebcamFeed onVideoReady={handleVideoReady} onCalibrate={handleCalibrate} landmarks={landmarks} />
          </div>

          {/* Bottom: Avatar */}
          <div className="flex-1 min-h-0 relative rounded-3xl overflow-hidden border border-white/5 bg-[#111] shadow-2xl flex items-center justify-center">
            <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium tracking-wide flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Live Avatar
            </div>
            {isEditMode && (
              <div className="absolute top-4 right-4 z-10 px-4 py-2 bg-amber-500/20 backdrop-blur-md rounded-full border border-amber-500/30 text-amber-300 text-xs font-medium tracking-wide flex items-center gap-2 animate-pulse">
                Drag parts to move them
              </div>
            )}

            {!transformMatrix ? (
              <div className="w-full h-full flex items-center justify-center relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <UserCircle2 className="w-12 h-12 text-white/50 mb-4 animate-pulse" />
                  <p className="text-white font-medium bg-black/60 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 shadow-xl">
                    Waiting for face detection...
                  </p>
                </div>
              </div>
            ) : (
              <Avatar3DCanvas
                ref={canvasRef}
                blendshapes={blendshapes}
                matrix={transformMatrix}
                landmarks={landmarks}
                backgroundMode={backgroundMode}
                initialCameraPosition={initialCameraPos}
                isEditMode={isEditMode}
                initialPartPositions={initialPartPositions}
              />
            )}
          </div>
        </div>

        {activeTab === 'studio' && (
          <div className="h-full w-full">
            <VideoEditor avatarRef={canvasRef} />
          </div>
        )}
      </main>
    </div>
  );
}
