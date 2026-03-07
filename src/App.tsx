import React, { useRef } from 'react';
import { Sparkles, MonitorUp, Save, Upload, Download } from 'lucide-react';
import Avatar3DCanvas, { Avatar3DCanvasRef } from './components/Avatar3DCanvas';
import VideoEditor from './components/VideoEditor';

export default function App() {
  const canvasRef = useRef<Avatar3DCanvasRef>(null);

  const handlePiP = () => {
    if (canvasRef.current) {
      canvasRef.current.togglePiP();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))] h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 hidden xs:block sm:block">
              Ayo's Studio
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end min-w-0 overflow-hidden">
                <button
                  onClick={handlePiP}
                  className={`flex items-center gap-2 px-2 sm:px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium`}
                >
                  <MonitorUp className="w-4 h-4" />
                  <span className="hidden sm:inline">Pop Out (PiP)</span>
                </button>
                <button
                  onClick={() => {
                    const event = new CustomEvent('trigger-import-video');
                    window.dispatchEvent(event);
                  }}
                  className={`flex items-center gap-2 px-2 sm:px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-full transition-all shadow-sm text-sm font-medium`}
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Import</span>
                </button>
                <button
                  onClick={() => {
                    const event = new CustomEvent('trigger-export-video');
                    window.dispatchEvent(event);
                  }}
                  className={`flex items-center gap-2 px-2 sm:px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-full transition-all shadow-sm text-sm font-medium`}
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={() => {
                    const event = new CustomEvent('trigger-save-project');
                    window.dispatchEvent(event);
                  }}
                  className={`flex items-center justify-center w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all shadow-lg shadow-emerald-500/20`}
                  title="Save Project"
                >
                  <Save className="w-4 h-4" />
                </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] h-[calc(100vh-4rem-env(safe-area-inset-top))] relative overflow-hidden">
          <div className="h-full w-full">
            <VideoEditor 
              avatarRef={canvasRef} 
              avatarComponent={
                <div className="w-full h-full relative rounded-xl overflow-hidden bg-[#111]">
                  <Avatar3DCanvas
                    ref={canvasRef}
                    backgroundMode="space"
                    isEditMode={false}
                  />
                </div>
              }
            />
          </div>
      </main>
    </div>
  );
}
