import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Square, Circle, Monitor, Scissors, Video, Music, Type, Layers, Zap, Play, Pause, SkipBack, SkipForward, AlertCircle, Upload, Plus, MoreVertical, Volume2, Star, Trash, ChevronLeft, ChevronRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ScreenRecorder } from '@capgo/capacitor-screen-recorder';
import { Avatar3DCanvasRef } from './Avatar3DCanvas';

interface VideoEditorProps {
  avatarRef: React.RefObject<Avatar3DCanvasRef>;
  avatarComponent?: React.ReactNode;
}

const thumbnailCache = new Map<string, string>();

const VideoThumbnail: React.FC<{ url: any, time: number }> = React.memo(({ url, time }) => {
  const roundedTime = Math.floor(time);
  const cacheKey = `${url}-${roundedTime}`;
  const [thumbnail, setThumbnail] = useState<string | null>(thumbnailCache.get(cacheKey) || null);
  const [loading, setLoading] = useState(!thumbnailCache.has(cacheKey));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thumbnailCache.has(cacheKey)) {
      setThumbnail(thumbnailCache.get(cacheKey)!);
      setLoading(false);
      return;
    }

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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.2);
            thumbnailCache.set(cacheKey, dataUrl);
            setThumbnail(dataUrl);
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
          video.currentTime = roundedTime;
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
  }, [url, roundedTime, cacheKey]);
  
  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center bg-zinc-700 overflow-hidden">
      {thumbnail ? (
        <img src={thumbnail} className="w-full h-full object-contain" />
      ) : (
        loading && <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
      )}
    </div>
  );
});

type Clip = {
  id: string,
  url: string,
  duration: number,
  laneIndex: number,
  startTime: number,
  type: 'video' | 'audio',
  mediaOffset?: number,
  gain?: number
};

const Waveform = React.memo(({ clip, totalDuration }: { clip: Clip, totalDuration: number }) => {
  return (
    <div className="w-full h-full flex items-center justify-between gap-[1px]">
      {Array.from({ length: Math.max(1, Math.floor((totalDuration > 0 ? (clip.duration / totalDuration) * 100 : 0) * 2)) }).map((_, i) => {
        // Deterministic height based on clip ID and repeating index, offset by mediaOffset
        let hash = 0;
        const offsetIndex = i + Math.floor((clip.mediaOffset || 0) * 2);
        const seed = `${clip.id}-${offsetIndex % 20}`;
        for (let j = 0; j < seed.length; j++) {
          hash = seed.charCodeAt(j) + ((hash << 5) - hash);
        }
        const height = (Math.abs(hash) % 50) + 10;
        return (
          <div 
            key={i} 
            className="flex-1 min-w-[2px] bg-emerald-400/60 rounded-full" 
            style={{ height: `${height}%` }} 
          />
        );
      })}
    </div>
  );
});

const TextOverlay: React.FC<{ text: any, onUpdate: (updater: (prev: any) => any) => void, isSelected: boolean, onSelect: () => void }> = ({ text, onUpdate, isSelected, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`absolute group select-none ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-black/50 rounded-sm' : ''}`}
      style={{
        left: `${text.x}%`,
        top: `${text.y}%`,
        transform: `translate(-50%, -50%) rotate(${text.rotation || 0}deg) scale(${text.scale || 1})`,
        touchAction: 'none',
        zIndex: isSelected ? 50 : 10,
        cursor: 'move',
        color: text.color || 'white',
        fontSize: `${text.fontSize || 24}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startY = e.clientY;
        const startTextX = text.x;
        const startTextY = text.y;

        const parent = target.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();

        const handleMove = (moveEvent: PointerEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          const deltaXPercent = (deltaX / parentRect.width) * 100;
          const deltaYPercent = (deltaY / parentRect.height) * 100;
          onUpdate(prev => ({ ...prev, x: startTextX + deltaXPercent, y: startTextY + deltaYPercent }));
        };

        const handleUp = (upEvent: PointerEvent) => {
          target.releasePointerCapture(upEvent.pointerId);
          target.removeEventListener('pointermove', handleMove);
          target.removeEventListener('pointerup', handleUp);
          target.removeEventListener('pointercancel', handleUp);
        };

        target.addEventListener('pointermove', handleMove);
        target.addEventListener('pointerup', handleUp);
        target.addEventListener('pointercancel', handleUp);
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={text.text}
          onChange={(e) => onUpdate(prev => ({ ...prev, text: e.target.value }))}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(false); }}
          className="bg-transparent border-none outline-none text-white"
          autoFocus
        />
      ) : (
        <span>{text.text}</span>
      )}
      
      {isSelected && !isEditing && (
        <>
          <div 
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-12 h-12 flex items-center justify-center cursor-grab" 
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              
              const handleMove = (moveEvent: PointerEvent) => {
                  const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
                  onUpdate(prev => ({ ...prev, rotation: angle + 90 }));
              };
              const handleUp = (upEvent: PointerEvent) => {
                  target.releasePointerCapture(upEvent.pointerId);
                  target.removeEventListener('pointermove', handleMove);
                  target.removeEventListener('pointerup', handleUp);
                  target.removeEventListener('pointercancel', handleUp);
              };
              target.addEventListener('pointermove', handleMove);
              target.addEventListener('pointerup', handleUp);
              target.addEventListener('pointercancel', handleUp);
          }}>
            <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white shadow-lg" />
          </div>
          <div 
            className="absolute -bottom-6 -right-6 w-12 h-12 flex items-center justify-center cursor-nwse-resize" 
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
              const startScale = text.scale || 1;

              const handleMove = (moveEvent: PointerEvent) => {
                  const currentDist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
                  const scaleChange = currentDist / startDist;
                  onUpdate(prev => ({ ...prev, scale: Math.max(0.1, startScale * scaleChange) }));
              };
              const handleUp = (upEvent: PointerEvent) => {
                  target.releasePointerCapture(upEvent.pointerId);
                  target.removeEventListener('pointermove', handleMove);
                  target.removeEventListener('pointerup', handleUp);
                  target.removeEventListener('pointercancel', handleUp);
              };
              target.addEventListener('pointermove', handleMove);
              target.addEventListener('pointerup', handleUp);
              target.addEventListener('pointercancel', handleUp);
          }}>
            <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
};

const VfxOverlay: React.FC<{ vfx: any, onUpdate: (updater: (prev: any) => any) => void, isSelected: boolean, onSelect: () => void }> = ({ vfx, onUpdate, isSelected, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={`absolute group select-none ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-black/50 rounded-sm' : ''}`}
      style={{
        left: `${vfx.x}%`,
        top: `${vfx.y}%`,
        transform: `translate(-50%, -50%) rotate(${vfx.rotation || 0}deg) scale(${vfx.scale || 1})`,
        touchAction: 'none',
        zIndex: isSelected ? 50 : 10,
        cursor: 'move'
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();

        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startY = e.clientY;
        const startVfxX = vfx.x;
        const startVfxY = vfx.y;

        const parent = target.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();

        const handleMove = (moveEvent: PointerEvent) => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          const deltaXPercent = (deltaX / parentRect.width) * 100;
          const deltaYPercent = (deltaY / parentRect.height) * 100;
          onUpdate(prev => ({ ...prev, x: startVfxX + deltaXPercent, y: startVfxY + deltaYPercent }));
        };

        const handleUp = (upEvent: PointerEvent) => {
          target.releasePointerCapture(upEvent.pointerId);
          target.removeEventListener('pointermove', handleMove);
          target.removeEventListener('pointerup', handleUp);
          target.removeEventListener('pointercancel', handleUp);
        };

        target.addEventListener('pointermove', handleMove);
        target.addEventListener('pointerup', handleUp);
        target.addEventListener('pointercancel', handleUp);
      }}
    >
      <img src={vfx.url} alt="VFX" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
      
      {isSelected && (
        <>
          <div 
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-12 h-12 flex items-center justify-center cursor-grab" 
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              
              const handleMove = (moveEvent: PointerEvent) => {
                  const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
                  onUpdate(prev => ({ ...prev, rotation: angle + 90 }));
              };
              const handleUp = (upEvent: PointerEvent) => {
                  target.releasePointerCapture(upEvent.pointerId);
                  target.removeEventListener('pointermove', handleMove);
                  target.removeEventListener('pointerup', handleUp);
                  target.removeEventListener('pointercancel', handleUp);
              };
              target.addEventListener('pointermove', handleMove);
              target.addEventListener('pointerup', handleUp);
              target.addEventListener('pointercancel', handleUp);
          }}>
            <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white shadow-lg" />
          </div>
          <div 
            className="absolute -bottom-6 -right-6 w-12 h-12 flex items-center justify-center cursor-nwse-resize" 
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
              const startScale = vfx.scale || 1;

              const handleMove = (moveEvent: PointerEvent) => {
                  const currentDist = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
                  const scaleChange = currentDist / startDist;
                  onUpdate(prev => ({ ...prev, scale: Math.max(0.1, startScale * scaleChange) }));
              };
              const handleUp = (upEvent: PointerEvent) => {
                  target.releasePointerCapture(upEvent.pointerId);
                  target.removeEventListener('pointermove', handleMove);
                  target.removeEventListener('pointerup', handleUp);
                  target.removeEventListener('pointercancel', handleUp);
              };
              target.addEventListener('pointermove', handleMove);
              target.addEventListener('pointerup', handleUp);
              target.addEventListener('pointercancel', handleUp);
          }}>
            <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white shadow-lg" />
          </div>
        </>
      )}
    </div>
  );
};
export default function VideoEditor({ avatarRef, avatarComponent }: VideoEditorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clips, setClips] = useState<{id: string, url: string, duration: number, laneIndex: number, startTime: number, type: 'video' | 'audio', mediaOffset?: number}[]>([]);
  const [texts, setTexts] = useState<{id: string, text: string, x: number, y: number, startTime: number, duration: number, rotation: number, scale: number, laneIndex: number}[]>([]);
  const [vfxElements, setVfxElements] = useState<{id: string, url: string, x: number, y: number, startTime: number, duration: number, rotation: number, scale: number, laneIndex: number}[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [activeVfxId, setActiveVfxId] = useState<string | null>(null);
  const [assets, setAssets] = useState<{id: string, type: 'video' | 'audio' | 'avatar' | 'vfx', url: string, name: string}[]>([
    { id: 'vid_intro', type: 'video', url: 'https://drive.google.com/uc?export=download&id=1wp2tJrflD4yEK0Wmyg5aE6AIWQpUHGSE', name: 'Intro' },
    { id: 'vid_outro', type: 'video', url: 'https://drive.google.com/uc?export=download&id=15rqHEZIVxq6YckJCZNsuefqVOhbCiLWO', name: 'Outro' },
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
    { id: 'vfx1', type: 'vfx', url: 'https://media.tenor.com/w8iONcO08YUAAAAC/ifera-vtuber.gif', name: 'Explosion' },
    { id: 'vfx2', type: 'vfx', url: 'https://media.tenor.com/RvHWZlv5tgQAAAAC/hitmarker-hitmarker-is-offline.gif', name: 'Hitmarker' },
    { id: 'vfx3', type: 'vfx', url: 'https://media.tenor.com/a-DsT_e4GSQAAAAC/hi-hello.gif', name: 'Fire' },
    { id: 'vfx4', type: 'vfx', url: 'https://media.tenor.com/rw9nhFEg7QIAAAAC/along789.gif', name: 'Skull' },
    { id: 'vfx5', type: 'vfx', url: 'https://media.tenor.com/OioNI6_DlmwAAAAC/worry-froge-froge.gif', name: 'Frog' },
    { id: 'vfx6', type: 'vfx', url: 'https://media.tenor.com/I1-O7n2aNh0AAAAC/fake-headshot-headshot.gif', name: 'Headshot' },
  ]);
  const [activeMenu, setActiveMenu] = useState<{type: 'video' | 'audio' | 'fx', id: string, x: number, y: number} | null>(null);
  const [audioMenu, setAudioMenu] = useState<{x: number, y: number} | null>(null);
  const [videoMenu, setVideoMenu] = useState<{x: number, y: number} | null>(null);
  const [vfxMenu, setVfxMenu] = useState<{x: number, y: number} | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  
  const [draggedClip, setDraggedClip] = useState<{
    id: string, 
    initialLane: number, 
    initialStartTime: number, 
    offsetX: number, 
    dragTotalDuration: number,
    type: 'move' | 'resize-start' | 'resize-end' | 'gain',
    initialDuration: number,
    initialMediaOffset?: number,
    initialGain?: number,
    initialY?: number,
    trackType: 'video' | 'audio' | 'fx'
  } | null>(null);
  const [isDraggingToTrash, setIsDraggingToTrash] = useState<'video' | 'audio' | 'fx' | null>(null);
  const isDraggingToTrashRef = useRef<'video' | 'audio' | 'fx' | null>(null);
  const draggedClipRef = useRef<typeof draggedClip>(null);
  const isDraggingPlayheadRef = useRef(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const requestRef = useRef<number>();
  const dragDataRef = useRef<{x: number, y: number} | null>(null);
  const capturedElementRef = useRef<Element | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickClipIdRef = useRef<string | null>(null);
  const [activeGainClipId, setActiveGainClipId] = useState<string | null>(null);

  useEffect(() => {
    draggedClipRef.current = draggedClip;
  }, [draggedClip]);

  const totalDuration = React.useMemo(() => {
    if (draggedClip) {
      return draggedClip.dragTotalDuration;
    }
    const maxEnd = Math.max(
      clips.reduce((acc, clip) => Math.max(acc, clip.startTime + clip.duration), 0),
      texts.reduce((acc, text) => Math.max(acc, text.startTime + text.duration), 0),
      vfxElements.reduce((acc, vfx) => Math.max(acc, vfx.startTime + vfx.duration), 0)
    );
    const baseDuration = Math.max(10, maxEnd);
    return zoom < 1 ? baseDuration / zoom : baseDuration;
  }, [clips, texts, vfxElements, draggedClip, zoom]);

  const playingVideoClipIndex = React.useMemo(() => {
    return clips.findIndex(c => c.type === 'video' && currentTime >= c.startTime && currentTime < c.startTime + c.duration);
  }, [currentTime, clips]);
  
  const playingAudioClipIndex = React.useMemo(() => {
    return clips.findIndex(c => c.type === 'audio' && currentTime >= c.startTime && currentTime < c.startTime + c.duration);
  }, [currentTime, clips]);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  const handleDrag = useCallback((e: PointerEvent) => {
    const draggedClip = draggedClipRef.current;
    if (!draggedClip) return;
    
    if (draggedClip.type === 'gain') {
        const newGain = Math.max(0, Math.min(1, (draggedClip.initialGain || 1) - e.movementY / 50));
        setClips(prev => prev.map(c => c.id === draggedClip.id ? { ...c, gain: newGain } : c));
        draggedClip.initialGain = newGain;
        return;
    }

    dragDataRef.current = { x: e.clientX, y: e.clientY };
    
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(() => {
        const draggedClip = draggedClipRef.current;
        if (dragDataRef.current && draggedClip) {
          const { x: clientX, y: clientY } = dragDataRef.current;
          const timelineRect = timelineRef.current?.getBoundingClientRect();
          const timelineContainerRect = timelineContainerRef.current?.getBoundingClientRect();
          if (timelineRect && timelineContainerRect) {
            const isOverTrash = clientY < timelineContainerRect.top;
            const newIsDraggingToTrash = isOverTrash ? draggedClip.trackType : null;
            setIsDraggingToTrash(newIsDraggingToTrash);
            isDraggingToTrashRef.current = newIsDraggingToTrash;
            
            const trackWidth = timelineRect.width - 56;
            const clickX = clientX - (timelineRect.left + 56);
            const clickTime = trackWidth > 0 ? (clickX / trackWidth) * draggedClip.dragTotalDuration : 0;
            
            if (draggedClip.type === 'move') {
              const newStartTime = Math.max(0, clickTime - (trackWidth > 0 ? (draggedClip.offsetX / trackWidth) * draggedClip.dragTotalDuration : 0));
              
              const laneHeight = 30;
              const deltaY = clientY - (draggedClip.initialY || clientY);
              const laneDelta = Math.round(deltaY / laneHeight);
              const newLaneIndex = Math.max(0, Math.min(2, draggedClip.initialLane + laneDelta));

              setClips(prev => prev.map(c => c.id === draggedClip.id ? { ...c, startTime: newStartTime, laneIndex: newLaneIndex } : c));
              setTexts(prev => prev.map(t => t.id === draggedClip.id ? { ...t, startTime: newStartTime, laneIndex: newLaneIndex } : t));
              setVfxElements(prev => prev.map(v => v.id === draggedClip.id ? { ...v, startTime: newStartTime, laneIndex: newLaneIndex } : v));
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
              setVfxElements(prev => prev.map(v => v.id === draggedClip.id ? { ...v, startTime: newStartTime, duration: newDuration } : v));
            } else if (draggedClip.type === 'resize-end') {
              const newDuration = Math.max(0.5, clickTime - draggedClip.initialStartTime);
              setClips(prev => prev.map(c => c.id === draggedClip.id ? { ...c, duration: newDuration } : c));
              setTexts(prev => prev.map(t => t.id === draggedClip.id ? { ...t, duration: newDuration } : t));
              setVfxElements(prev => prev.map(v => v.id === draggedClip.id ? { ...v, duration: newDuration } : v));
            }
          }
        }
        requestRef.current = undefined;
      });
    }
  }, []);

  const stopDragging = useCallback((e: any) => {
    if (capturedElementRef.current) {
      try {
        capturedElementRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Pointer might already be released
      }
      capturedElementRef.current = null;
    }
    
    if (isDraggingToTrashRef.current !== null && draggedClipRef.current) {
      const clipId = draggedClipRef.current.id;
      setClips(prev => prev.filter(c => c.id !== clipId));
      setTexts(prev => prev.filter(t => t.id !== clipId));
      setVfxElements(prev => prev.filter(v => v.id !== clipId));
    }
    
    setDraggedClip(null);
    draggedClipRef.current = null;
    dragDataRef.current = null;
    setIsDraggingToTrash(null);
    isDraggingToTrashRef.current = null;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    window.removeEventListener('pointermove', handleDrag as any);
    window.removeEventListener('pointerup', stopDragging as any);
    window.removeEventListener('pointercancel', stopDragging as any);
  }, [handleDrag]);

  const startDragging = useCallback((e: React.PointerEvent, item: any, type: 'move' | 'resize-start' | 'resize-end' | 'gain' = 'move') => {
    e.stopPropagation();
    
    let dragType = type;
    if (item.type === 'audio' && type === 'move') {
      const now = Date.now();
      const isDoubleTap = lastClickClipIdRef.current === item.id && (now - lastClickTimeRef.current) < 300;
      lastClickTimeRef.current = now;
      lastClickClipIdRef.current = item.id;
      
      if (isDoubleTap || activeGainClipId === item.id) {
        setActiveGainClipId(item.id);
        dragType = 'gain';
      } else {
        setActiveGainClipId(null);
      }
    } else {
      setActiveGainClipId(null);
    }

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    let offsetX = 0;
    if (timelineRect) {
      const trackWidth = timelineRect.width - 56;
      const clickX = e.clientX - (timelineRect.left + 56);
      const itemStartX = totalDuration > 0 ? (item.startTime / totalDuration) * trackWidth : 0;
      offsetX = clickX - itemStartX;
    }
    // Calculate the current max duration to freeze it during the drag
    const currentTotalDuration = totalDuration;
    
    let trackType: 'video' | 'audio' | 'fx' = 'fx';
    if (item.type === 'video') trackType = 'video';
    else if (item.type === 'audio') trackType = 'audio';

    const newDraggedClip = { 
      id: item.id, 
      initialLane: item.laneIndex ?? 1, 
      initialStartTime: item.startTime, 
      offsetX,
      dragTotalDuration: currentTotalDuration,
      type: dragType,
      initialDuration: item.duration || 5,
      initialMediaOffset: item.mediaOffset || 0,
      initialGain: item.gain ?? 1,
      initialY: e.clientY,
      trackType
    };
    console.log('startDragging', { id: item.id, type: dragType, initialY: e.clientY });
    setDraggedClip(newDraggedClip);
    draggedClipRef.current = newDraggedClip;
    
    capturedElementRef.current = e.currentTarget;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore capture errors
    }
    
    window.addEventListener('pointermove', handleDrag as any);
    window.addEventListener('pointerup', stopDragging as any);
    window.addEventListener('pointercancel', stopDragging as any);
  }, [activeGainClipId, totalDuration, handleDrag, stopDragging]);

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
      setZoom(Math.max(0.1, Math.min(10, initialZoomRef.current * scale)));
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
        setZoom(prev => Math.max(0.1, Math.min(10, prev - e.deltaY * 0.01)));
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
      const loop = () => {
        const now = performance.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        setCurrentTime(t => {
          const newT = Math.max(0, t + delta);
          if (newT >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return newT;
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
    const time = currentTime;
    
    if (playingVideoClipIndex !== -1) {
      const media = playbackVideoRef.current;
      if (media) {
        const clip = clips[playingVideoClipIndex];
        const timeInClip = time - clip.startTime + (clip.mediaOffset || 0);
        try {
          if (Math.abs(media.currentTime - timeInClip) > 0.25) {
            media.currentTime = timeInClip;
          }
        } catch (e) {
          console.error("Failed to set currentTime", e);
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
        try {
          if (Math.abs(media.currentTime - timeInClip) > 0.25) {
            media.currentTime = timeInClip;
          }
        } catch (e) {
          console.error("Failed to set audio currentTime", e);
        }
        media.volume = Math.max(0, Math.min(1, clip.gain ?? 1));
        if (isPlaying && media.paused) {
          media.play().catch(console.error);
        } else if (!isPlaying && !media.paused) {
          media.pause();
        }
      }
    }
  }, [playingVideoClipIndex, playingAudioClipIndex, currentTime, clips, isPlaying]);

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
                return [...prev, { id: newAsset.id, url, duration: video.duration, laneIndex: 1, startTime: maxStartTime, type }];
              });
            };
          } else {
            const audio = new Audio(url);
            audio.onloadedmetadata = () => {
              setClips(prev => {
                const maxStartTime = prev.filter(c => c.type === 'audio').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
                return [...prev, { id: newAsset.id, url, duration: audio.duration, laneIndex: 1, startTime: maxStartTime, type }];
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
        const startTime = Math.max(0, currentTime);
        return [...prev, { id: Math.random().toString(36).substring(7), url: asset.url, duration: audio.duration, laneIndex: 1, startTime, type: 'audio' }];
      });
    };
    setAudioMenu(null);
  };

  const addVideoClip = (asset: {id: string, url: string, name: string}) => {
    const video = document.createElement('video');
    video.src = asset.url;
    video.onloadedmetadata = () => {
      setClips(prev => {
        const startTime = Math.max(0, currentTime);
        return [...prev, { id: Math.random().toString(36).substring(7), url: asset.url, duration: video.duration, laneIndex: 1, startTime, type: 'video' }];
      });
    };
    setVideoMenu(null);
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
          let duration = video.duration;
          if (isNaN(duration) || !isFinite(duration)) duration = 5;
          setClips(prev => {
            const maxStartTime = prev.filter(c => c.type === 'video').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
            return [...prev, { id: newAsset.id, url, duration, laneIndex: 1, startTime: maxStartTime, type }];
          });
        };
      } else {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          if (audio.duration === Infinity) {
            audio.currentTime = Number.MAX_SAFE_INTEGER;
            let added = false;
            const addClip = () => {
              if (added) return;
              added = true;
              audio.ontimeupdate = null;
              let duration = audio.duration;
              if (isNaN(duration) || !isFinite(duration)) duration = 5;
              audio.currentTime = 0;
              setClips(prev => {
                const maxStartTime = prev.filter(c => c.type === 'audio').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
                return [...prev, { id: newAsset.id, url, duration, laneIndex: 1, startTime: maxStartTime, type }];
              });
            };
            audio.ontimeupdate = addClip;
            setTimeout(addClip, 1000);
          } else {
            let duration = audio.duration;
            if (isNaN(duration) || !isFinite(duration)) duration = 5;
            setClips(prev => {
              const maxStartTime = prev.filter(c => c.type === 'audio').reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
              return [...prev, { id: newAsset.id, url, duration, laneIndex: 1, startTime: maxStartTime, type }];
            });
          }
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
    setCurrentTime(0);
  };

  const seekToEnd = () => {
    setCurrentTime(totalDuration);
  };

  const addTextOverlay = () => {
    setTexts(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      text: 'Double click to edit',
      x: 50,
      y: 50,
      startTime: Math.max(0, currentTime),
      duration: 5,
      rotation: 0,
      scale: 1,
      laneIndex: 1
    }]);
  };

  const addVfxOverlay = (asset: {id: string, url: string, name: string}) => {
    setVfxElements(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      url: asset.url,
      x: 50,
      y: 50,
      startTime: Math.max(0, currentTime - 1),
      duration: 2,
      rotation: 0,
      scale: 1,
      laneIndex: 1
    }]);
    
    if (asset.id === 'vfx1') {
      const audio = new Audio('https://www.myinstants.com/media/sounds/bomb-sound.mp3');
      audio.play().catch(console.error);
    } else if (asset.id === 'vfx2') {
      const audio = new Audio('https://www.myinstants.com/media/sounds/hitmarker_2.mp3');
      audio.play().catch(console.error);
    } else if (asset.id === 'vfx6') {
      const audio = new Audio('https://www.myinstants.com/media/sounds/gta-v-wasted-death-sound.mp3');
      audio.play().catch(console.error);
    }
    setVfxMenu(null);
  };

  const setCurrentTimeSafe = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
  };

  const updateText = (id: string, newText: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  const splitClip = () => {
    if (clips.length === 0) return;
    const time = currentTime;
    
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

  const videoHasExtra = clips.some(c => c.type === 'video' && (c.laneIndex ?? 1) !== 1);
  const audioHasExtra = clips.some(c => c.type === 'audio' && (c.laneIndex ?? 1) !== 1);
  const fxHasExtra = texts.some(t => (t.laneIndex ?? 1) !== 1) || vfxElements.some(v => (v.laneIndex ?? 1) !== 1);

  const videoClipsRender = React.useMemo(() => {
    return clips.filter(c => c.type === 'video').map(clip => (
      <div 
        key={clip.id}
        className={`absolute bg-blue-500/50 border border-blue-400 rounded-sm cursor-move overflow-hidden transition-all duration-75 select-none ${draggedClip?.id === clip.id ? 'opacity-70 scale-105 shadow-2xl z-50 ring-2 ring-white' : ''}`}
        style={{ left: `${totalDuration > 0 ? (clip.startTime / totalDuration) * 100 : 0}%`, width: `${totalDuration > 0 ? (clip.duration / totalDuration) * 100 : 0}%`, top: videoHasExtra ? `${(clip.laneIndex ?? 1) * 33.33}%` : '0%', height: videoHasExtra ? '33.33%' : '100%', touchAction: 'none' }}
        onPointerDown={(e) => startDragging(e, clip, 'move')}
      >
        <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, clip, 'resize-start'); }}>
          <ChevronLeft className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, clip, 'resize-end'); }}>
          <ChevronRight className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
        </div>
        <div className="flex w-full h-full">
          {Array.from({ length: Math.ceil(clip.duration / 1.0) }).map((_, i) => (
            <VideoThumbnail key={i} url={clip.url} time={(i * 1.0) + (clip.mediaOffset || 0)} />
          ))}
        </div>
      </div>
    ));
  }, [clips, draggedClip, totalDuration, videoHasExtra, startDragging]);

  const audioClipsRender = React.useMemo(() => {
    return clips.filter(c => c.type === 'audio').map(clip => (
      <div 
        key={clip.id}
        className={`absolute bg-emerald-500/50 border border-emerald-400 rounded-sm cursor-move overflow-hidden transition-all duration-75 select-none ${draggedClip?.id === clip.id ? 'opacity-70 scale-105 shadow-2xl z-50 ring-2 ring-white' : ''}`}
        style={{ left: `${totalDuration > 0 ? (clip.startTime / totalDuration) * 100 : 0}%`, width: `${totalDuration > 0 ? (clip.duration / totalDuration) * 100 : 0}%`, top: audioHasExtra ? `${(clip.laneIndex ?? 1) * 33.33}%` : '0%', height: audioHasExtra ? '33.33%' : '100%', touchAction: 'none' }}
        onPointerDown={(e) => startDragging(e, clip, 'move')}
      >
        <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, clip, 'resize-start'); }}>
          <ChevronLeft className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, clip, 'resize-end'); }}>
          <ChevronRight className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
        </div>
        <div className="w-full h-full flex items-center justify-center opacity-50 relative">
          {/* Traditional Waveform */}
          <Waveform clip={clip} totalDuration={totalDuration} />
          {/* Gain Indicator */}
          <div className="absolute inset-x-0 bottom-0 bg-emerald-400/30" style={{ height: `${Math.min(100, (clip.gain ?? 1) * 100)}%` }} />
          {activeGainClipId === clip.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold z-20">
              {Math.round((clip.gain ?? 1) * 100)}%
            </div>
          )}
        </div>
      </div>
    ));
  }, [clips, draggedClip, totalDuration, audioHasExtra, startDragging, activeGainClipId]);

  const fxClipsRender = React.useMemo(() => {
    return (
      <>
        {texts.map((text) => (
            <div 
              key={text.id}
              onPointerDown={(e) => startDragging(e, text, 'move')}
              className={`absolute w-24 bg-purple-500/20 border border-purple-500/50 rounded-md flex items-center px-2 cursor-pointer hover:border-purple-400 transition-colors group/clip select-none ${draggedClip?.id === text.id ? 'opacity-70 scale-105 shadow-2xl z-50 ring-2 ring-white' : ''}`}
              style={{ left: `${totalDuration > 0 ? (text.startTime / totalDuration) * 100 : 0}%`, width: `${totalDuration > 0 ? (text.duration / totalDuration) * 100 : 0}%`, top: fxHasExtra ? `${(text.laneIndex ?? 1) * 33.33}%` : '0%', height: fxHasExtra ? '33.33%' : '100%', touchAction: 'none' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, text, 'resize-start'); }}>
                <ChevronLeft className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, text, 'resize-end'); }}>
                <ChevronRight className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
              </div>
              <Type className="w-3 h-3 text-purple-400 mr-1.5 pointer-events-none" />
              <span className="text-[10px] font-medium text-purple-300 truncate pointer-events-none">{text.text}</span>
            </div>
        ))}
        {vfxElements.map((vfx) => (
            <div 
              key={vfx.id}
              onPointerDown={(e) => startDragging(e, vfx, 'move')}
              className={`absolute w-24 bg-yellow-500/20 border border-yellow-500/50 rounded-md flex items-center px-2 cursor-pointer hover:border-yellow-400 transition-colors group/clip select-none ${draggedClip?.id === vfx.id ? 'opacity-70 scale-105 shadow-2xl z-50 ring-2 ring-white' : ''}`}
              style={{ left: `${totalDuration > 0 ? (vfx.startTime / totalDuration) * 100 : 0}%`, width: `${totalDuration > 0 ? (vfx.duration / totalDuration) * 100 : 0}%`, top: fxHasExtra ? `${(vfx.laneIndex ?? 1) * 33.33}%` : '0%', height: fxHasExtra ? '33.33%' : '100%', touchAction: 'none' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, vfx, 'resize-start'); }}>
                <ChevronLeft className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-white/20 hover:bg-white/40 z-10 flex items-center justify-center group/resize" style={{ touchAction: 'none' }} onPointerDown={(e) => { e.stopPropagation(); startDragging(e, vfx, 'resize-end'); }}>
                <ChevronRight className="w-2.5 h-2.5 text-white opacity-50 group-hover/resize:opacity-100 pointer-events-none" />
              </div>
              <Star className="w-3 h-3 text-yellow-400 mr-1.5 pointer-events-none" />
              <span className="text-[10px] font-medium text-yellow-300 truncate pointer-events-none">VFX</span>
            </div>
        ))}
      </>
    );
  }, [texts, vfxElements, draggedClip, totalDuration, fxHasExtra, startDragging]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Preview Area */}
        <div 
          className="relative h-[40vh] sm:flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[100px]" 
          style={{ touchAction: 'none' }}
          onPointerDown={() => {
            setActiveTextId(null);
            setActiveGainClipId(null);
          }}
        >
          {isDraggingToTrash && (
            <div className="absolute inset-0 bg-red-500/20 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-red-500/50">
              <Trash className="w-12 h-12 text-red-500 mb-2 animate-bounce" />
              <span className="text-red-500 font-bold text-lg">Drop to Delete</span>
            </div>
          )}
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
        
        {/* Text Overlays */}
        {!isRecording && texts.filter(t => currentTime >= t.startTime && currentTime <= t.startTime + t.duration).map(text => (
          <TextOverlay 
            key={text.id} 
            text={text} 
            isSelected={activeTextId === text.id}
            onSelect={() => {
              setActiveTextId(text.id);
              setActiveVfxId(null);
            }}
            onUpdate={(updater) => {
              setTexts(prev => prev.map(t => t.id === text.id ? updater(t) : t));
            }} 
          />
        ))}

        {/* VFX Overlays */}
        {!isRecording && vfxElements.filter(v => currentTime >= v.startTime && currentTime <= v.startTime + v.duration).map(vfx => (
          <VfxOverlay 
            key={vfx.id} 
            vfx={vfx} 
            isSelected={activeVfxId === vfx.id}
            onSelect={() => {
              setActiveVfxId(vfx.id);
              setActiveTextId(null);
            }}
            onUpdate={(updater) => {
              setVfxElements(prev => prev.map(v => v.id === vfx.id ? updater(v) : v));
            }} 
          />
        ))}

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
          <div 
            className="absolute bottom-4 left-4 w-[30%] max-w-[200px] aspect-square z-30 rounded-xl overflow-hidden shadow-2xl border border-white/10"
            onPointerDown={(e) => e.stopPropagation()}
          >
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

      {/* Timeline */}
      <div 
        ref={timelineContainerRef}
        className="flex-1 bg-zinc-900 p-2 sm:p-4 overflow-x-auto overflow-y-hidden border-t border-white/5 relative min-h-0 select-none"
      >
        <div 
          ref={timelineRef}
          className="relative h-full touch-none flex flex-col"
          style={{ width: `${Math.max(100, zoom * 100)}%`, minWidth: '600px', touchAction: 'none' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onPointerDown={(e) => {
            e.preventDefault();
            setActiveGainClipId(null);
            if (clips.length === 0) return;
            
            // Allow tapping anywhere on the timeline to move the playhead
            const rect = e.currentTarget.getBoundingClientRect();
            const trackWidth = rect.width - 56;
            const x = Math.max(0, Math.min(e.clientX - (rect.left + 56), trackWidth));
            const newTime = trackWidth > 0 ? (x / trackWidth) * totalDuration : 0;
            setCurrentTimeSafe(newTime);
            
            // Find which clip this progress corresponds to
            let acc = 0;
            for (let i = 0; i < clips.length; i++) {
              if (newTime >= acc && newTime < acc + clips[i].duration) {
                setActiveClipIndex(i);
                break;
              }
              acc += clips[i].duration;
            }
            
            // Start dragging
            isDraggingPlayheadRef.current = true;
            setIsDraggingPlayhead(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!isDraggingPlayheadRef.current || clips.length === 0) return;
            
            const timelineRect = e.currentTarget.getBoundingClientRect();
            const trackWidth = timelineRect.width - 56;
            const x = Math.max(0, Math.min(e.clientX - (timelineRect.left + 56), trackWidth));
            const newTime = trackWidth > 0 ? (x / trackWidth) * totalDuration : 0;
            setCurrentTimeSafe(newTime);
            
            // Find which clip this progress corresponds to
            let acc = 0;
            for (let i = 0; i < clips.length; i++) {
              if (newTime >= acc && newTime < acc + clips[i].duration) {
                setActiveClipIndex(i);
                break;
              }
              acc += clips[i].duration;
            }

            // Auto-scroll timeline container when dragging near edges
            if (timelineContainerRef.current) {
              const container = timelineContainerRef.current;
              const containerRect = container.getBoundingClientRect();
              const scrollMargin = 100; // Increased margin
              const scrollSpeed = 25; // Increased speed
              if (e.clientX < containerRect.left + scrollMargin) {
                container.scrollLeft -= scrollSpeed;
              } else if (e.clientX > containerRect.right - scrollMargin) {
                container.scrollLeft += scrollSpeed;
              }
            }
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            isDraggingPlayheadRef.current = false;
            setIsDraggingPlayhead(false);
          }}
        >
          {/* Ruler */}
          <div className="h-6 border-b border-white/10 relative flex items-end text-[10px] text-zinc-500 select-none ml-14">
            {Array.from({ length: 11 }).map((_, i) => {
              const time = (totalDuration * (i / 10)).toFixed(1);
              return (
                <div key={i} className="absolute flex flex-col items-center pointer-events-none" style={{ left: `${i * 10}%`, transform: 'translateX(-50%)' }}>
                  <span>{time}s</span>
                  <div className="w-px h-1 bg-zinc-600 mt-0.5"></div>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div 
            className="absolute top-6 bottom-0 w-0.5 bg-red-500 z-20 shadow-[0_0_10px_rgba(239,68,68,0.5)] cursor-ew-resize ml-14"
            style={{ left: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
          >
            <div className="absolute -top-2 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-sm" />
          </div>
          
          {/* Tracks */}
          <div className="flex flex-col flex-1 gap-2 mt-4 pb-4">
            {/* Video Track */}
            <div className={`bg-zinc-800/40 rounded-lg flex items-center border border-white/5 relative group transition-all duration-200 ${videoHasExtra ? 'flex-[3]' : 'flex-1'}`}>
              <div className="sticky left-0 w-14 shrink-0 flex flex-col items-center justify-center gap-1 z-30 bg-zinc-800 h-full rounded-l-lg border-r border-white/5">
                <span className="text-[8px] font-bold text-zinc-400 tracking-wider">VIDEO</span>
                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setVideoMenu({ x: e.clientX, y: e.clientY }); }}
                  className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Plus className="w-3 h-3 text-white" />
                  <input id="video-upload" type="file" accept="video/*,image/*" className="hidden" onChange={(e) => { handleImportVideo(e, 'video'); setVideoMenu(null); }} />
                </button>
              </div>
              <div className="flex-1 h-full py-1 relative">
                <div className="flex-1 flex gap-1 relative h-full bg-zinc-700/20 rounded-sm">
                  {videoHasExtra && (
                    <>
                      <div className="absolute inset-x-0 top-[33.33%] h-px bg-white/5 pointer-events-none" />
                      <div className="absolute inset-x-0 top-[66.66%] h-px bg-white/5 pointer-events-none" />
                    </>
                  )}
                  {videoClipsRender}
                </div>
              </div>
            </div>
            
            {/* Audio Track */}
            <div className={`bg-zinc-800/40 rounded-lg flex items-center border border-white/5 relative group transition-all duration-200 ${audioHasExtra ? 'flex-[3]' : 'flex-1'}`}>
              <div className="sticky left-0 w-14 shrink-0 flex flex-col items-center justify-center gap-1 z-30 bg-zinc-800 h-full rounded-l-lg border-r border-white/5">
                <span className="text-[8px] font-bold text-zinc-400 tracking-wider">AUDIO</span>
                <button 
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setAudioMenu({ x: e.clientX, y: e.clientY }); }}
                  className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Plus className="w-3 h-3 text-white" />
                </button>
              </div>
              <div className="flex-1 h-full py-1 relative">
                <div className="flex-1 flex gap-1 relative h-full bg-zinc-700/20 rounded-sm">
                  {audioHasExtra && (
                    <>
                      <div className="absolute inset-x-0 top-[33.33%] h-px bg-white/5 pointer-events-none" />
                      <div className="absolute inset-x-0 top-[66.66%] h-px bg-white/5 pointer-events-none" />
                    </>
                  )}
                  {audioClipsRender}
                </div>
              </div>
            </div>
            
            {/* Effects Track */}
            <div className={`bg-zinc-800/40 rounded-lg flex items-center border border-white/5 relative group transition-all duration-200 ${fxHasExtra ? 'flex-[3]' : 'flex-1'}`}>
              <div className="sticky left-0 w-14 shrink-0 flex flex-col items-center justify-center gap-1 z-30 bg-zinc-800 h-full rounded-l-lg border-r border-white/5">
                <span className="text-[8px] font-bold text-zinc-400 tracking-wider">FX</span>
                <div className="flex flex-col gap-1">
                  <button 
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); addTextOverlay(); }}
                    className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
                    title="Add Text"
                  >
                    <Type className="w-3 h-3 text-white" />
                  </button>
                  <button 
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setVfxMenu({ x: e.clientX, y: e.clientY }); }}
                    className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/20 flex items-center justify-center transition-colors"
                    title="Add VFX"
                  >
                    <Star className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
              <div className="flex-1 h-full py-1 relative">
                <div className="flex-1 flex gap-1 relative h-full bg-zinc-700/20 rounded-sm">
                  {fxHasExtra && (
                    <>
                      <div className="absolute inset-x-0 top-[33.33%] h-px bg-white/5 pointer-events-none" />
                      <div className="absolute inset-x-0 top-[66.66%] h-px bg-white/5 pointer-events-none" />
                    </>
                  )}
                  {fxClipsRender}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Video Menu */}
      {videoMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setVideoMenu(null)} onPointerDown={(e) => e.stopPropagation()} />
          <div 
            className="fixed z-50 w-[320px] max-h-[400px] bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 text-sm"
            style={{ left: Math.min(videoMenu.x, window.innerWidth - 330), top: Math.min(videoMenu.y, window.innerHeight - 410) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1 flex justify-between items-center">
              <span>Select Video</span>
              <button className="text-zinc-400 hover:text-white" onClick={() => setVideoMenu(null)}>Close</button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-2 overflow-y-auto max-h-[300px]">
              <button 
                className="w-full h-24 bg-zinc-700 hover:bg-zinc-600 rounded-lg flex flex-col items-center justify-center text-[10px] text-center p-1 transition-colors border border-dashed border-zinc-500" 
                onClick={() => document.getElementById('video-upload')?.click()}
              >
                <Plus className="w-6 h-6 mb-1 text-zinc-400" />
                <span className="truncate w-full text-zinc-300">Upload New</span>
              </button>
              {assets.filter(a => a.type === 'video')
                .map(asset => (
                  <div key={asset.id} className="relative group">
                    <button 
                      className="w-full h-24 bg-zinc-700 hover:bg-zinc-600 rounded-lg flex flex-col items-center justify-center text-[10px] text-center p-1 transition-colors overflow-hidden" 
                      onClick={() => addVideoClip(asset)}
                    >
                      <video src={asset.url} className="w-full h-16 object-cover mb-1 rounded-sm" />
                      <span className="truncate w-full">{asset.name}</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Audio Menu */}
      {audioMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAudioMenu(null)} onPointerDown={(e) => e.stopPropagation()} />
          <div 
            className="fixed z-50 w-[320px] max-h-[400px] bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 text-sm"
            style={{ left: Math.min(audioMenu.x, window.innerWidth - 330), top: Math.min(audioMenu.y, window.innerHeight - 410) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1 flex justify-between items-center">
              <span>Select Audio</span>
              <button className="text-zinc-400 hover:text-white" onClick={() => setAudioMenu(null)}>Close</button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2 overflow-y-auto max-h-[300px]">
              {assets.filter(a => a.type === 'audio')
                .sort((a, b) => (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0))
                .map(asset => (
                  <div key={asset.id} className="relative group">
                    <button 
                      className="w-full h-16 bg-zinc-700 hover:bg-zinc-600 rounded-lg flex flex-col items-center justify-center text-[10px] text-center p-1 transition-colors" 
                      onClick={() => addAudioClip(asset)}
                    >
                      <Volume2 className="w-5 h-5 mb-1" />
                      <span className="truncate w-full">{asset.name}</span>
                    </button>
                    <button 
                      className={`absolute top-1 right-1 p-0.5 rounded-full ${favorites.includes(asset.id) ? 'text-yellow-400' : 'text-zinc-500 hover:text-white'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavorites(prev => prev.includes(asset.id) ? prev.filter(id => id !== asset.id) : [...prev, asset.id]);
                      }}
                    >
                      <Star className="w-3 h-3" fill={favorites.includes(asset.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                ))}
            </div>
            <button className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2 border-t border-white/5" onClick={() => document.getElementById('audio-upload')?.click()}>
              <Plus className="w-4 h-4" /> Upload New
            </button>
            <input id="audio-upload" type="file" accept="audio/*" className="hidden" onChange={(e) => handleImportVideo(e, 'audio')} />
          </div>
        </>
      )}

      {/* VFX Menu */}
      {vfxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setVfxMenu(null)} onPointerDown={(e) => e.stopPropagation()} />
          <div 
            className="fixed z-50 w-[240px] max-h-[300px] bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 text-sm"
            style={{ left: Math.min(vfxMenu.x, window.innerWidth - 250), top: Math.min(vfxMenu.y, window.innerHeight - 310) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1 flex justify-between items-center">
              <span>Select VFX</span>
              <button className="text-zinc-400 hover:text-white" onClick={() => setVfxMenu(null)}>Close</button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2 overflow-y-auto max-h-[250px]">
              {assets.filter(a => a.type === 'vfx')
                .map(asset => (
                  <button 
                    key={asset.id}
                    className="w-full h-16 bg-zinc-700 hover:bg-zinc-600 rounded-lg flex flex-col items-center justify-center text-[10px] text-center p-1 transition-colors" 
                    onClick={() => addVfxOverlay(asset)}
                  >
                    <img src={asset.url} alt={asset.name} className="w-8 h-8 object-contain mb-1" referrerPolicy="no-referrer" />
                    <span className="truncate w-full">{asset.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Context Menu */}
      {activeMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} onPointerDown={(e) => e.stopPropagation()} />
          <div 
            className="fixed z-50 w-48 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 text-sm"
            style={{ left: Math.min(activeMenu.x, window.innerWidth - 200), top: Math.min(activeMenu.y, window.innerHeight - 200) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-1">
              Edit {activeMenu.type}
            </div>
            <button className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2" onClick={() => setActiveMenu(null)}>
              <Scissors className="w-4 h-4" /> Split Clip
            </button>
            <button className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2" onClick={() => setActiveMenu(null)}>
              <Layers className="w-4 h-4" /> Join Clips
            </button>
            <button className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2" onClick={() => setActiveMenu(null)}>
              <Zap className="w-4 h-4" /> Fade In / Out
            </button>
            {activeMenu.type === 'audio' && (
              <button className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2" onClick={() => setActiveMenu(null)}>
                <Volume2 className="w-4 h-4" /> Adjust Gain
              </button>
            )}
            <div className="h-px bg-white/5 my-1" />
            <button className="w-full text-left px-3 py-2 hover:bg-red-500/20 text-red-400 flex items-center gap-2" onClick={() => setActiveMenu(null)}>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
