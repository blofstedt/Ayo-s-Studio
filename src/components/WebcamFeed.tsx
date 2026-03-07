import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface WebcamFeedProps {
  onVideoReady: (video: HTMLVideoElement) => void;
  onCalibrate: () => void;
  landmarks?: NormalizedLandmark[] | null;
}

export default function WebcamFeed({ onVideoReady, landmarks }: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsCameraOn(true);
            setError(null);
            onVideoReady(videoRef.current!);
          };
        }
      } catch (err: any) {
        console.error("Error accessing webcam:", err);
        if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
          setError("Camera access denied. Please allow camera permissions in your browser.");
        } else if (err.name === 'NotFoundError') {
          setError("No webcam found. Please connect a camera.");
        } else {
          setError(`Failed to access camera: ${err.message || 'Unknown error'}`);
        }
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onVideoReady]);

  // Draw landmarks overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to intrinsic video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (landmarks && landmarks.length > 0) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.8)'; // emerald-500
      for (const lm of landmarks) {
        const x = lm.x * canvas.width;
        const y = lm.y * canvas.height;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
  }, [landmarks]);

  return (
    <div className="relative w-full h-full bg-zinc-900 rounded-xl overflow-hidden flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
      />
      
      {!isCameraOn && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
          <CameraOff className="w-12 h-12 mb-4" />
          <p>Starting camera...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-6 text-center bg-zinc-950/80 backdrop-blur-sm">
          <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
          <p className="font-medium mb-2">Camera Error</p>
          <p className="text-sm text-red-400/80">{error}</p>
        </div>
      )}
    </div>
  );
}
