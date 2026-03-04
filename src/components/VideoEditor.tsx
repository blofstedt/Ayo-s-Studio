import React, { useState, useRef, useEffect } from 'react';
import { Square, Circle, Monitor, Scissors, Video, Music, Type, Layers, Zap, Play, Pause, SkipBack, SkipForward, AlertCircle, Upload } from 'lucide-react';
import { Avatar3DCanvasRef } from './Avatar3DCanvas';

interface VideoEditorProps {
  avatarRef: React.RefObject<Avatar3DCanvasRef>;
}

export default function VideoEditor({ avatarRef }: VideoEditorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [texts, setTexts] = useState<{id: string, text: string, x: number, y: number}[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isRecordingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    destNodeRef.current = audioCtxRef.current.createMediaStreamDestination();
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  const playEmotionSound = (emotion: string) => {
    if (!audioCtxRef.current || !destNodeRef.current) return;
    const ctx = audioCtxRef.current;
    const dest = destNodeRef.current;
    
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(dest);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (emotion === 'happy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (emotion === 'sad') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.5);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (emotion === 'angry') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (emotion === 'surprised') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  };

  const triggerEmotion = (emotion: 'happy' | 'sad' | 'angry' | 'surprised') => {
    avatarRef.current?.triggerEmotion(emotion);
    playEmotionSound(emotion);
  };

  const startRecording = async () => {
    setErrorMsg(null);
    try {
      // Try to get screen recording
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      const screenVideo = document.createElement('video');
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      await screenVideo.play();

      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;

      const draw = () => {
        if (!isRecordingRef.current) return;
        
        // Match canvas size to screen video aspect ratio
        if (canvas.width !== screenVideo.videoWidth) {
          canvas.width = screenVideo.videoWidth;
          canvas.height = screenVideo.videoHeight;
        }

        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        
        const avatarCanvas = avatarRef.current?.getCanvas();
        if (avatarCanvas) {
          const avSize = Math.min(canvas.width, canvas.height) * 0.3;
          ctx.drawImage(avatarCanvas, canvas.width - avSize - 20, canvas.height - avSize - 20, avSize, avSize);
        }
        requestAnimationFrame(draw);
      };
      
      isRecordingRef.current = true;
      setIsRecording(true);
      draw();

      const combinedStream = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...(destNodeRef.current ? destNodeRef.current.stream.getAudioTracks() : [])
      ]);

      if (screenStream.getAudioTracks().length > 0 && audioCtxRef.current && destNodeRef.current) {
        const screenSource = audioCtxRef.current.createMediaStreamSource(new MediaStream([screenStream.getAudioTracks()[0]]));
        screenSource.connect(destNodeRef.current);
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setClips(prev => [...prev, url]);
        screenStream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      screenStream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

    } catch (err: any) {
      console.error("Recording failed", err);
      setIsRecording(false);
      isRecordingRef.current = false;
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        setErrorMsg("Screen recording permission denied. Please allow it in your browser.");
      } else {
        setErrorMsg("Screen recording is not supported in this browser. For mobile gameplay, use the PiP button to float your avatar, then use your phone's built-in screen recorder! You can then import the video here.");
      }
    }
  };

  const handleImportVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setClips(prev => [...prev, url]);
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Clear canvas
    const canvas = previewCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const togglePlayback = () => {
    if (!playbackVideoRef.current || clips.length === 0) return;
    if (isPlaying) {
      playbackVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      playbackVideoRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekToStart = () => {
    if (playbackVideoRef.current) {
      playbackVideoRef.current.currentTime = 0;
      if (!isPlaying) playbackVideoRef.current.play().then(() => playbackVideoRef.current?.pause());
    }
  };

  const seekToEnd = () => {
    if (playbackVideoRef.current) {
      playbackVideoRef.current.currentTime = playbackVideoRef.current.duration || 0;
    }
  };

  const addTextOverlay = () => {
    setTexts(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      text: 'Double click to edit',
      x: 50,
      y: 50
    }]);
  };

  const updateText = (id: string, newText: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Preview Area */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[200px]">
        {/* Playback Video (shown when not recording and clips exist) */}
        {!isRecording && clips.length > 0 && (
          <video 
            ref={playbackVideoRef}
            src={clips[clips.length - 1]} 
            className="max-w-full max-h-full object-contain"
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {/* Recording Canvas (shown when recording) */}
        <canvas 
          ref={previewCanvasRef} 
          className={`max-w-full max-h-full object-contain ${!isRecording ? 'hidden' : ''}`}
        />
        
        {!isRecording && clips.length === 0 && !errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-6 text-center">
            <Monitor className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm font-medium mb-2">Click Record to capture your screen & avatar</p>
            <p className="text-xs opacity-70 max-w-sm">
              For mobile gameplay: Pop out your avatar (PiP), use your phone's built-in screen recorder, then import the video here!
            </p>
          </div>
        )}

        {errorMsg && !isRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-6 text-center bg-zinc-950/80 backdrop-blur-sm z-20">
            <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
            <p className="text-sm font-medium">{errorMsg}</p>
            <button 
              onClick={() => setErrorMsg(null)}
              className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Text Overlays */}
        {!isRecording && texts.map((textItem) => (
          <div 
            key={textItem.id}
            className="absolute z-20 cursor-move"
            style={{ left: `${textItem.x}%`, top: `${textItem.y}%`, transform: 'translate(-50%, -50%)' }}
            onDoubleClick={(e) => {
              const newText = prompt('Edit text:', textItem.text);
              if (newText !== null) updateText(textItem.id, newText);
            }}
          >
            <div className="text-white font-bold text-2xl sm:text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap">
              {textItem.text}
            </div>
          </div>
        ))}

        {/* Emotion Buttons (Not recorded) */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-10">
          <EmotionButton icon="😄" label="Happy" onClick={() => triggerEmotion('happy')} />
          <EmotionButton icon="😢" label="Sad" onClick={() => triggerEmotion('sad')} />
          <EmotionButton icon="😡" label="Angry" onClick={() => triggerEmotion('angry')} />
          <EmotionButton icon="😲" label="Surprised" onClick={() => triggerEmotion('surprised')} />
        </div>

        {/* Playback Controls (Not recorded) */}
        {!isRecording && clips.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-zinc-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 shadow-xl">
            <button onClick={seekToStart} className="text-zinc-400 hover:text-white transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>
            <button onClick={togglePlayback} className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>
            <button onClick={seekToEnd} className="text-zinc-400 hover:text-white transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Record & Import Buttons (Not recorded) */}
        <div className="absolute bottom-6 right-6 z-10 flex items-center gap-3">
          {!isRecording && (
            <label className="flex items-center justify-center w-12 h-12 bg-zinc-800 hover:bg-zinc-700 rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer border border-white/10">
              <Upload className="w-5 h-5 text-white" />
              <input type="file" accept="video/*" className="hidden" onChange={handleImportVideo} />
            </label>
          )}
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform hover:scale-105 ${
              isRecording ? 'bg-zinc-800 border-2 border-zinc-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isRecording ? <Square className="w-5 h-5 text-red-500 fill-current" /> : <div className="w-5 h-5 rounded-full bg-white" />}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-16 bg-zinc-900 border-y border-white/5 flex items-center justify-between px-2 sm:px-4 shrink-0">
        <ToolButton icon={<Scissors className="w-4 h-4" />} label="Split" />
        <div className="w-px h-8 bg-white/10 mx-1 sm:mx-2" />
        <ToolButton icon={<Video className="w-4 h-4" />} label="Media" />
        <ToolButton icon={<Music className="w-4 h-4" />} label="Audio" />
        <ToolButton icon={<Type className="w-4 h-4" />} label="Text" onClick={addTextOverlay} />
        <ToolButton icon={<Layers className="w-4 h-4" />} label="Overlay" />
        <ToolButton icon={<Zap className="w-4 h-4" />} label="Effects" />
      </div>

      {/* Timeline */}
      <div className="h-48 sm:h-64 bg-zinc-900 p-4 overflow-y-auto shrink-0">
        <div className="relative w-full h-full min-w-[600px]">
          {/* Playhead */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 left-1/4 z-10 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
            <div className="absolute -top-2 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-sm" />
          </div>
          
          {/* Tracks */}
          <div className="flex flex-col gap-3 mt-6">
            {/* Video Track */}
            <div className="h-16 bg-zinc-800/50 rounded-lg flex items-center px-2 border border-white/5 relative">
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 -rotate-90 origin-center">VIDEO</div>
              <div className="flex gap-1 ml-6 h-12">
                {clips.map((clip, i) => (
                  <div key={i} className="h-full w-32 bg-indigo-500/20 border border-indigo-500/50 rounded flex items-center justify-center overflow-hidden relative group">
                    <video src={clip} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                    <span className="text-xs font-medium text-indigo-200 z-10">Clip {i + 1}</span>
                  </div>
                ))}
                {clips.length === 0 && (
                  <div className="h-full w-48 border border-dashed border-white/10 rounded flex items-center justify-center text-xs text-zinc-600">
                    Record to add clips
                  </div>
                )}
              </div>
            </div>
            
            {/* Audio Track */}
            <div className="h-12 bg-zinc-800/50 rounded-lg flex items-center px-2 border border-white/5 relative">
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 -rotate-90 origin-center">AUDIO</div>
              <div className="flex gap-1 ml-6 h-8">
                <div className="h-full w-64 bg-emerald-500/20 border border-emerald-500/50 rounded flex items-center px-2">
                  <span className="text-[10px] font-medium text-emerald-300">Background Music.mp3</span>
                </div>
              </div>
            </div>
            
            {/* Effects Track */}
            <div className="h-10 bg-zinc-800/50 rounded-lg flex items-center px-2 border border-white/5 relative">
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 -rotate-90 origin-center">FX</div>
              <div className="flex gap-1 ml-6 h-6">
                <div className="h-full w-24 ml-32 bg-purple-500/20 border border-purple-500/50 rounded flex items-center px-2">
                  <span className="text-[10px] font-medium text-purple-300">Glitch</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 flex-1 h-12 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-zinc-100 min-w-0"
    >
      {icon}
      <span className="text-[9px] sm:text-[10px] font-medium truncate w-full text-center px-1">{label}</span>
    </button>
  );
}

function EmotionButton({ icon, label, onClick }: { icon: string, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-12 h-12 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-2xl shadow-lg hover:bg-zinc-800 hover:scale-110 transition-all group relative"
    >
      {icon}
      <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-800 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {label}
      </span>
    </button>
  );
}
