import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Square, Circle, Monitor, Scissors, Video, Music, Type, Layers, Zap, Play, Pause, SkipBack, SkipForward, AlertCircle, Upload, Plus, MoreVertical, Volume2, Star } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenRecorder } from '@capgo/capacitor-screen-recorder';
import { Avatar3DCanvasRef } from './Avatar3DCanvas';

interface VideoEditorProps {
  avatarRef: React.RefObject<Avatar3DCanvasRef>;
  avatarComponent?: React.ReactNode;
}

const VideoThumbnail: React.FC<{ url: any, time: number }> = ({ url, time }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    let video: HTMLVideoElement | null = null;
    let timeoutId: any;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        loadThumbnail();
      }
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    const loadThumbnail = () => {
      video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.preload = 'metadata';
      
      const cleanup = () => {
          video?.removeEventListener('loadedmetadata', handleLoadedMetadata);
          video?.removeEventListener('seeked', handleSeeked);
          video?.removeEventListener('error', handleError);
          clearTimeout(timeoutId);
          video?.remove();
      };

      const handleSeeked = () => {
        if (!isMounted) return;
        
        if (video && video.readyState < 2) {
            setTimeout(handleSeeked, 100);
            return;
        }

        requestAnimationFrame(() => {
          if (!isMounted || !video) return;
          try {
            const canvas = document.createElement('canvas');
            // Further reduce thumbnail size for performance
            canvas.width = 40;
            canvas.height = 40;
            canvas.getContext('2d')?.drawImage(video, 0, 0, 40, 40);
            setThumbnail(canvas.toDataURL('image/jpeg', 0.2)); // Lower quality
            setLoading(false);
          } catch (e) {
            console.error('Error generating thumbnail', e);
            setLoading(false);
          }
          cleanup();
        });
      };

      const handleError = () => {
          if (!isMounted) return;
          setLoading(false);
          cleanup();
      }

      const handleLoadedMetadata = () => {
          if (!isMounted || !video) return;
          video.currentTime = time;
          timeoutId = setTimeout(handleSeeked, 1000);
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('error', handleError);
    };

    return () => {
      isMounted = false;
      observer.disconnect();
      if (video) {
        video.removeEventListener('loadedmetadata', () => {});
        video.removeEventListener('seeked', () => {});
        video.removeEventListener('error', () => {});
        clearTimeout(timeoutId);
        video.remove();
      }
    };
  }, [url, time]);
  
  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center bg-zinc-700 overflow-hidden">
      {thumbnail ? (
        <img src={thumbnail} className="w-full h-full object-contain" />
      ) : (
        loading && <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
      )}
    </div>
  );
};

export type TagType = 'highlight' | 'meme' | 'context' | 'fx' | 'text' | 'intro' | 'outro';

export interface Tag {
  id: string;
  type: TagType;
  timestamp: number;
  startTime: number;
  endTime: number;
  data?: any;
}

export default function VideoEditor({ avatarRef, avatarComponent }: VideoEditorProps) {
  const [tags, setTags] = useState<Tag[]>([
    { id: 'intro-1', type: 'intro', timestamp: 0, startTime: 0, endTime: 3 },
    { id: 'outro-1', type: 'outro', timestamp: 9999, startTime: 9996, endTime: 9999 }
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clips, setClips] = useState<{id: string, url: string, duration: number, laneIndex: number, startTime: number, type: 'video' | 'audio', mediaOffset?: number}[]>([]);
  const [texts, setTexts] = useState<{id: string, text: string, x: number, y: number, startTime: number, duration: number}[]>([]);
  const [assets, setAssets] = useState<{id: string, type: 'video' | 'audio' | 'avatar' | 'vfx', url: string, name: string}[]>([
    { id: 'sfx1', type: 'audio', url: 'https://www.myinstants.com/media/sounds/bruh.mp3', name: 'Bruh' },
    { id: 'sfx2', type: 'audio', url: 'https://www.myinstants.com/media/sounds/vine-boom.mp3', name: 'Vine Boom' },
    { id: 'sfx3', type: 'audio', url: 'https://www.myinstants.com/media/sounds/fbi-open-up.mp3', name: 'FBI Open Up' },
    { id: 'sfx4', type: 'audio', url: 'https://www.myinstants.com/media/sounds/air-horn.mp3', name: 'Air Horn' },
    { id: 'sfx5', type: 'audio', url: 'https://www.myinstants.com/media/sounds/mlg-airhorn.mp3', name: 'MLG Airhorn' },
    { id: 'sfx6', type: 'audio', url: 'https://www.myinstants.com/media/sounds/wow.mp3', name: 'Wow' },
    { id: 'sfx7', type: 'audio', url: 'https://www.myinstants.com/media/sounds/oh-no.mp3', name: 'Oh No' },
    { id: 'sfx8', type: 'audio', url: 'https://www.myinstants.com/media/sounds/windows-xp-startup.mp3', name: 'Windows XP' },
    { id: 'sfx9', type: 'audio', url: 'https://www.myinstants.com/media/sounds/sad-violin.mp3', name: 'Sad Violin' },
    { id: 'sfx10', type: 'audio', url: 'https://www.myinstants.com/media/sounds/run.mp3', name: 'Run' },
    { id: 'sfx11', type: 'audio', url: 'https://www.myinstants.com/media/sounds/fahhhhhhhh.mp3', name: 'fahhhhhhhh' },
    { id: 'sfx12', type: 'audio', url: 'https://www.myinstants.com/media/sounds/spongebob-fail.mp3', name: 'Spongebob Fail' },
    { id: 'sfx13', type: 'audio', url: 'https://www.myinstants.com/media/sounds/discord-notification.mp3', name: 'Discord' },
    { id: 'sfx14', type: 'audio', url: 'https://www.myinstants.com/media/sounds/among-us-impostor.mp3', name: 'Among Us' },
    { id: 'sfx15', type: 'audio', url: 'https://www.myinstants.com/media/sounds/metal-pipe-falling-sound.mp3', name: 'Metal Pipe' },
    { id: 'sfx16', type: 'audio', url: 'https://www.myinstants.com/media/sounds/giga-chad-theme.mp3', name: 'Giga Chad' },
    { id: 'sfx17', type: 'audio', url: 'https://www.myinstants.com/media/sounds/curb-your-enthusiasm.mp3', name: 'Curb' },
    { id: 'sfx18', type: 'audio', url: 'https://www.myinstants.com/media/sounds/to-be-continued.mp3', name: 'To Be Continued' },
    { id: 'sfx19', type: 'audio', url: 'https://www.myinstants.com/media/sounds/rick-roll.mp3', name: 'Rick Roll' },
    { id: 'sfx20', type: 'audio', url: 'https://www.myinstants.com/media/sounds/mii-channel-theme.mp3', name: 'Mii Channel' },
    { id: 'vfx1', type: 'vfx', url: '💥', name: 'Explosion' },
    { id: 'vfx2', type: 'vfx', url: '🎯', name: 'Hitmarker' },
    { id: 'vfx3', type: 'vfx', url: '🔥', name: 'Fire' },
    { id: 'vfx4', type: 'vfx', url: '💀', name: 'Skull' },
    { id: 'vfx5', type: 'vfx', url: '💯', name: '100' },
  ]);
  const [activeMenu, setActiveMenu] = useState<{type: 'video' | 'audio' | 'fx', id: string, x: number, y: number} | null>(null);
  const [audioMenu, setAudioMenu] = useState<{x: number, y: number} | null>(null);
  const [vfxMenu, setVfxMenu] = useState<{x: number, y: number} | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  
  const [draggedClip, setDraggedClip] = useState<{
    id: string, 
    initialLane: number, 
    initialStartTime: number, 
    offsetX: number, 
    dragTotalDuration: number,
    type: 'move' | 'resize-start' | 'resize-end',
    initialDuration: number,
    initialMediaOffset?: number
  } | null>(null);
  const isDraggingPlayheadRef = useRef(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const requestRef = useRef<number>();
  const dragDataRef = useRef<{x: number, y: number} | null>(null);

  const totalDuration = React.useMemo(() => {
    if (draggedClip) {
      return draggedClip.dragTotalDuration;
    }
    const maxEnd = clips.reduce((acc, clip) => Math.max(acc, clip.startTime + clip.duration), 0);
    return Math.max(10, maxEnd);
  }, [clips, draggedClip]);

  const playingVideoClipIndex = React.useMemo(() => {
    let time = progress * totalDuration;
    return clips.findIndex(c => c.type === 'video' && time >= c.startTime && time < c.startTime + c.duration);
  }, [progress, totalDuration, clips]);
  
  const playingAudioClipIndex = React.useMemo(() => {
    let time = progress * totalDuration;
    return clips.findIndex(c => c.type === 'audio' && time >= c.startTime && time < c.startTime + c.duration);
  }, [progress, totalDuration, clips]);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  const startDragging = (e: React.PointerEvent, item: any, type: 'move' | 'resize-start' | 'resize-end' = 'move') => {
    e.stopPropagation();
    const timelineRect = timelineRef.current?.getBoundingClientRect();
    let offsetX = 0;
    if (timelineRect) {
      const clickX = e.clientX - timelineRect.left;
      const itemStartX = (item.startTime / totalDuration) * timelineRect.width;
      offsetX = clickX - itemStartX;
    }
    // Calculate the current max duration to freeze it during the drag
    const maxEnd = clips.reduce((acc, c) => Math.max(acc, c.startTime + c.duration), 0);
    const currentTotalDuration = Math.max(10, maxEnd);
    
    setDraggedClip({ 
      id: item.id, 
      initialLane: item.laneIndex || 0, 
      initialStartTime: item.startTime, 
      offsetX,
      dragTotalDuration: currentTotalDuration,
      type,
      initialDuration: item.duration || 5,
      initialMediaOffset: item.mediaOffset || 0
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const stopDragging = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggedClip(null);
    dragDataRef.current = null;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const handleDrag = (e: React.PointerEvent) => {
    if (!draggedClip) return;
    dragDataRef.current = { x: e.clientX, y: e.clientY };
    
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(() => {
        if (dragDataRef.current && draggedClip) {
          const { x: clientX, y: clientY } = dragDataRef.current;
          const timelineRect = timelineRef.current?.getBoundingClientRect();
          if (timelineRect) {
            const clickX = clientX - timelineRect.left;
            const clickTime = (clickX / timelineRect.width) * draggedClip.dragTotalDuration;
            
            if (draggedClip.type === 'move') {
              const newStartTime = Math.max(0, clickTime - draggedClip.offsetX / timelineRect.width * draggedClip.dragTotalDuration);
              const y = clientY - timelineRect.top;
              let newLaneIndex = 0;
              if (y > timelineRect.height * 0.6) newLaneIndex = 2;
              else if (y > timelineRect.height * 0.3) newLaneIndex = 1;

              setClips(prev => prev.map(c => c.id === draggedClip.id ? { ...c, startTime: newStartTime, laneIndex: newLaneIndex } : c));
              setTexts(prev => prev.map(t => t.id === draggedClip.id ? { ...t, startTime: newStartTime } : t));
            } else if (draggedClip.type === 'resize-start') {
              const newStartTime = Math.min(clickTime, draggedClip.initialStartTime + draggedClip.initialDuration - 0.5);
              const newDuration = Math.max(0.5, draggedClip.initialStartTime + draggedClip.initialDuration - newStartTime);
              const offsetChange = newStartTime - draggedClip.initialStartTime;
              setClips(prev => prev.map(c => {
                if (c.id === draggedClip.id) {
                  return { ...c, startTime: newStartTime, duration: newDuration, mediaOffset: Math.max(0, (draggedClip.initialMediaOffset || 0) + offsetChange) };
                }
                return c;
              }));
              setTexts(prev => prev.map(t => t.id === draggedClip.id ? { ...t, startTime: newStartTime, duration: newDuration } : t));
            } else if (draggedClip.type === 'resize-end') {
              const newDuration = Math.max(0.5, clickTime - draggedClip.initialStartTime);
              setClips(prev => prev.map(c => c.id === draggedClip.id ? { ...c, duration: newDuration } : c));
              setTexts(prev => prev.map(t => t.id === draggedClip.id ? { ...t, duration: newDuration } : t));
            }
          }
        }
        requestRef.current = undefined;
      });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / initialPinchDistRef.current;
      setZoom(Math.max(1, Math.min(10, initialZoomRef.current * scale)));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      initialPinchDistRef.current = null;
    }
  };

  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(prev => Math.max(1, Math.min(10, prev - e.deltaY * 0.01)));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const lastTimeRef = useRef<number>(0);
  const playFrameRef = useRef<number>();

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      const loop = (time: number) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        setProgress(p => {
          const newP = p + delta / totalDuration;
          if (newP >= 1) {
            setIsPlaying(false);
            return 1;
          }
          return newP;
        });
        playFrameRef.current = requestAnimationFrame(loop);
      };
      playFrameRef.current = requestAnimationFrame(loop);
    } else {
      if (playFrameRef.current) cancelAnimationFrame(playFrameRef.current);
    }
    return () => {
      if (playFrameRef.current) cancelAnimationFrame(playFrameRef.current);
    };
  }, [isPlaying, totalDuration]);

  useEffect(() => {
    const time = progress * totalDuration;
    
    if (playingVideoClipIndex !== -1) {
      const media = playbackVideoRef.current;
      if (media) {
        const clip = clips[playingVideoClipIndex];
        const timeInClip = time - clip.startTime + (clip.mediaOffset || 0);
        if (Math.abs(media.currentTime - timeInClip) > 0.25) {
          media.currentTime = timeInClip;
        }
        if (isPlaying && media.paused) {
          media.play().catch(console.error);
        } else if (!isPlaying && !media.paused) {
          media.pause();
        }
      }
    }
    
    if (playingAudioClipIndex !== -1) {
      const media = playbackAudioRef.current;
      if (media) {
        const clip = clips[playingAudioClipIndex];
        const timeInClip = time - clip.startTime + (clip.mediaOffset || 0);
        if (Math.abs(media.currentTime - timeInClip) > 0.25) {
          media.currentTime = timeInClip;
        }
        if (isPlaying && media.paused) {
          media.play().catch(console.error);
        } else if (!isPlaying && !media.paused) {
          media.pause();
        }
      }
    }
  }, [playingVideoClipIndex, playingAudioClipIndex, progress, totalDuration, clips, isPlaying]);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const playbackAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isRecordingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    const handleImport = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*,audio/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const url = URL.createObjectURL(file);
          const type = file.type.startsWith('audio') ? 'audio' : 'video';
          const newAsset = { id: Math.random().toString(36).substr(2, 9), type, url, name: file.name };
          setAssets(prev => [...prev, newAsset]);
          if (type === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.onloadedmetadata = () => {
              setClips(prev => {
                const maxStartTime = prev.filter(c => c.type === 'video').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
                return [...prev, { id: newAsset.id, url, duration: video.duration, laneIndex: 0, startTime: maxStartTime, type }];
              });
            };
          } else {
            const audio = new Audio(url);
            audio.onloadedmetadata = () => {
              setClips(prev => {
                const maxStartTime = prev.filter(c => c.type === 'audio').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
                return [...prev, { id: newAsset.id, url, duration: audio.duration, laneIndex: 0, startTime: maxStartTime, type }];
              });
            };
          }
        }
      };
      input.click();
    };

    const handleExport = () => {
      if (clips.length === 0) {
        setErrorMsg("No clips to export. Record or import a video first.");
        return;
      }
      const a = document.createElement('a');
      a.href = clips[clips.length - 1].url;
      a.download = `Ayos_Studio_Export_${new Date().getTime()}.webm`;
      a.click();
    };

    const handleSaveProject = () => {
      setErrorMsg("Project saved successfully!");
      setTimeout(() => setErrorMsg(null), 3000);
    };

    window.addEventListener('trigger-import-video', handleImport);
    window.addEventListener('trigger-export-video', handleExport);
    window.addEventListener('trigger-save-project', handleSaveProject);

    return () => {
      window.removeEventListener('trigger-import-video', handleImport);
      window.removeEventListener('trigger-export-video', handleExport);
      window.removeEventListener('trigger-save-project', handleSaveProject);
    };
  }, [clips]);

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
      if (Capacitor.isNativePlatform()) {
        await ScreenRecorder.start({ recordAudio: true });
        isRecordingRef.current = true;
        setIsRecording(true);
        return;
      }

      // Try to get screen recording
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      const screenVideo = document.createElement('video');
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      screenVideo.autoplay = true;
      screenVideo.playsInline = true;

      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;

      const draw = () => {
        if (!isRecordingRef.current) return;
        
        // Match canvas size to screen video aspect ratio, but limit to 1080p
        const maxWidth = 1920;
        const maxHeight = 1080;
        let width = screenVideo.videoWidth;
        let height = screenVideo.videoHeight;
        
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        if (canvas.width !== width) {
          canvas.width = width;
          canvas.height = height;
        }

        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        
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
        setAssets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), type: 'video', url, name: `Recording ${prev.length + 1}` }]);
        screenStream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
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

  const addAudioClip = (asset: {id: string, url: string, name: string}) => {
    const audio = new Audio(asset.url);
    audio.onloadedmetadata = () => {
      setClips(prev => {
        const startTime = Math.max(0, progress * totalDuration);
        return [...prev, { id: Math.random().toString(36).substring(7), url: asset.url, duration: audio.duration, laneIndex: 0, startTime, type: 'audio' }];
      });
    };
    setAudioMenu(null);
  };

  const handleImportVideo = (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'audio') => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const newAsset = { id: Math.random().toString(36).substr(2, 9), type, url, name: file.name };
      setAssets(prev => [...prev, newAsset]);
      if (type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.onloadedmetadata = () => {
          setClips(prev => {
            const maxStartTime = prev.filter(c => c.type === 'video').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            return [...prev, { id: newAsset.id, url, duration: video.duration, laneIndex: 0, startTime: maxStartTime, type }];
          });
        };
      } else {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          setClips(prev => {
            const maxStartTime = prev.filter(c => c.type === 'audio').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            return [...prev, { id: newAsset.id, url, duration: audio.duration, laneIndex: 0, startTime: maxStartTime, type }];
          });
        };
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'video' | 'audio' | 'fx', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenu({ type, id, x: e.clientX, y: e.clientY });
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    
    if (Capacitor.isNativePlatform()) {
      try {
        await ScreenRecorder.stop();
        setErrorMsg("Video saved to your device's gallery! Click the import button to add it to your timeline.");
        setIsRecording(false);
      } catch (err) {
        console.error("Failed to stop native recording", err);
        setIsRecording(false);
      }
      return;
    }

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

  const togglePlayback = useCallback(() => {
    if (clips.length === 0) return;
    setIsPlaying(prev => !prev);
  }, [clips]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);

  const seekToStart = () => {
    setProgress(0);
  };

  const seekToEnd = () => {
    setProgress(1);
  };

  const addTextOverlay = () => {
    setTexts(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      text: 'Double click to edit',
      x: 50,
      y: 50,
      startTime: Math.max(0, progress * totalDuration),
      duration: 5
    }]);
  };

  const addVfxOverlay = (emoji: string) => {
    setTexts(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      text: emoji,
      x: 50,
      y: 50,
      startTime: Math.max(0, (progress * totalDuration) - 1), // Add near playhead
      duration: 2 // Short duration for VFX
    }]);
    setVfxMenu(null);
  };

  const setProgressSafe = (p: number) => {
    setProgress(Math.max(0, Math.min(1, p)));
  };

  const updateText = (id: string, newText: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  const splitClip = () => {
    if (clips.length === 0) return;
    const time = progress * totalDuration;
    
    // Find the clip under the playhead
    const clipIndex = clips.findIndex(c => c.type === 'video' && time > c.startTime && time < c.startTime + c.duration);
    if (clipIndex === -1) return;
    
    const clipToSplit = clips[clipIndex];
    const splitPoint = time - clipToSplit.startTime;
    
    // Don't split if too close to edges
    if (splitPoint < 0.5 || clipToSplit.duration - splitPoint < 0.5) return;
    
    const newClip1 = { ...clipToSplit, duration: splitPoint };
    const newClip2 = { 
      ...clipToSplit, 
      id: Math.random().toString(36).substring(7), 
      startTime: time, 
      duration: clipToSplit.duration - splitPoint,
      mediaOffset: (clipToSplit.mediaOffset || 0) + splitPoint
    };
    
    setClips(prev => {
      const newClips = [...prev];
      newClips.splice(clipIndex, 1, newClip1, newClip2);
      // Shift all subsequent video clips
      let acc = newClip2.startTime + newClip2.duration;
      for (let i = clipIndex + 2; i < newClips.length; i++) {
        if (newClips[i].type === 'video') {
          newClips[i].startTime = acc;
          acc += newClips[i].duration;
        }
      }
      return newClips;
    });
  };

  const addTag = (type: TagType) => {
    const time = progress * totalDuration;
    let windowStart = time;
    let windowEnd = time;

    switch (type) {
      case 'highlight':
        windowStart = Math.max(0, time - 3);
        windowEnd = time + 3;
        break;
      case 'meme':
        windowStart = Math.max(0, time - 2);
        windowEnd = time + 2;
        break;
      case 'context':
        windowStart = Math.max(0, time - 5);
        windowEnd = time + 5;
        break;
      case 'fx':
      case 'text':
        windowStart = Math.max(0, time - 1);
        windowEnd = time + 1;
        break;
      default:
        break;
    }

    const newTag: Tag = {
      id: Math.random().toString(36).substring(7),
      type,
      timestamp: time,
      startTime: windowStart,
      endTime: windowEnd,
    };

    setTags(prev => {
      const newTags = [...prev, newTag];
      // Sort tags by timestamp
      return newTags.sort((a, b) => a.timestamp - b.timestamp);
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Preview Area */}
        <div className="relative h-[40vh] sm:flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[100px]">
        {/* Playback Video (shown when not recording and clips exist) */}
        {!isRecording && playingVideoClipIndex !== -1 && (
          <video 
            ref={playbackVideoRef}
            src={clips[playingVideoClipIndex].url} 
            className="max-w-full max-h-full object-contain"
            onEnded={() => {}}
            onPlay={() => {}}
            onPause={() => {}}
            onTimeUpdate={(e) => {
              // Time updates are now driven by requestAnimationFrame loop
            }}
          />
        )}
        {!isRecording && playingAudioClipIndex !== -1 && (
          <audio 
            ref={playbackAudioRef}
            src={clips[playingAudioClipIndex].url} 
            onEnded={() => {}}
            onPlay={() => {}}
            onPause={() => {}}
            onTimeUpdate={(e) => {
              // Time updates are now driven by requestAnimationFrame loop
            }}
          />
        )}
        {!isRecording && playingVideoClipIndex === -1 && (
          <div className="absolute inset-0 bg-black" />
        )}

        {/* Recording Canvas (shown when recording) */}
        <canvas 
          ref={previewCanvasRef} 
          className={`max-w-full max-h-full object-contain ${!isRecording ? 'hidden' : ''}`}
        />

        {/* Avatar Overlay */}
        {avatarComponent && (
          <div className="absolute bottom-4 left-4 w-[30%] max-w-[200px] aspect-square z-30 rounded-xl overflow-hidden shadow-2xl border border-white/10">
            {avatarComponent}
          </div>
        )}
        
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

      {/* Bottom Toolbar */}
      {!isRecording && (
        <div className="bg-zinc-950 border-t border-white/5 p-3 flex items-center justify-around overflow-x-auto hide-scrollbar shrink-0">
          <button onClick={() => addTag('highlight')} className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Zap className="w-6 h-6 text-yellow-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Highlight</span>
          </button>
          <button onClick={() => addTag('meme')} className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Music className="w-6 h-6 text-emerald-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Meme</span>
          </button>
          <button onClick={() => addTag('context')} className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Layers className="w-6 h-6 text-blue-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Context</span>
          </button>
          <button onClick={() => addTag('fx')} className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Star className="w-6 h-6 text-purple-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">FX</span>
          </button>
          <button onClick={() => addTag('text')} className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Type className="w-6 h-6 text-pink-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Text</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors min-w-[64px]">
            <Volume2 className="w-6 h-6 text-indigo-400" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Music</span>
          </button>
        </div>
      )}

      {/* Tag Strip */}
      {!isRecording && (
        <div className="bg-zinc-900 h-24 border-t border-white/5 flex items-center px-4 gap-2 overflow-x-auto hide-scrollbar shrink-0">
          {tags.map((tag) => {
            if (tag.type === 'intro') {
              return (
                <div key={tag.id} className="h-16 px-4 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center shrink-0 cursor-pointer hover:bg-zinc-700 transition-colors">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Intro</span>
                </div>
              );
            }
            if (tag.type === 'outro') {
              return (
                <div key={tag.id} className="h-16 px-4 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center shrink-0 cursor-pointer hover:bg-zinc-700 transition-colors">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Outro</span>
                </div>
              );
            }
            if (tag.type === 'context') {
              return (
                <div key={tag.id} className="h-16 px-6 bg-blue-500/20 border border-blue-500/50 rounded-xl flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-blue-500/30 transition-colors">
                  <Layers className="w-4 h-4 text-blue-400 mb-1" />
                  <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Context</span>
                </div>
              );
            }
            if (tag.type === 'highlight') {
              return (
                <div key={tag.id} className="h-16 px-6 bg-yellow-500/20 border border-yellow-500/50 rounded-xl flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-yellow-500/30 transition-colors">
                  <Zap className="w-4 h-4 text-yellow-400 mb-1" />
                  <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-wider">Highlight</span>
                </div>
              );
            }
            if (tag.type === 'meme') {
              return (
                <div key={tag.id} className="h-16 px-6 bg-emerald-500/20 border border-emerald-500/50 rounded-xl flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-emerald-500/30 transition-colors">
                  <Music className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Meme</span>
                </div>
              );
            }
            if (tag.type === 'fx') {
              return (
                <div key={tag.id} className="h-16 px-6 bg-purple-500/20 border border-purple-500/50 rounded-xl flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-purple-500/30 transition-colors">
                  <Star className="w-4 h-4 text-purple-400 mb-1" />
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">FX</span>
                </div>
              );
            }
            if (tag.type === 'text') {
              return (
                <div key={tag.id} className="h-16 px-6 bg-pink-500/20 border border-pink-500/50 rounded-xl flex flex-col items-center justify-center shrink-0 cursor-pointer hover:bg-pink-500/30 transition-colors">
                  <Type className="w-4 h-4 text-pink-400 mb-1" />
                  <span className="text-[10px] font-bold text-pink-300 uppercase tracking-wider">Text</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
      </div>
    </div>
  );
}
