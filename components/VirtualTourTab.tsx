import React, { useState, useMemo, useRef } from 'react';
import { Icon } from './icons';
import { DownloadDropdown } from './DownloadDropdown';
import type { SourceImage } from '../types';
import { generateImages } from '../services/geminiService';

const NavButton: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ icon, label, onClick, disabled, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-slate-900/90 hover:bg-indigo-600/25 border border-slate-800 hover:border-indigo-500/60 transition-all text-slate-200 hover:text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-sm group ${className}`}
  >
    <Icon name={icon} className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
    <span>{label}</span>
  </button>
);

export const VirtualTourTab: React.FC<{
  onEditRequest?: (imageUrl: string) => void;
}> = ({ onEditRequest }) => {
  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
  const [history, setHistory] = useState<{ url: string; label: string }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [movementDegree, setMovementDegree] = useState<15 | 30 | 45>(30);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentItem = useMemo(() => {
    if (historyIndex >= 0 && historyIndex < history.length) {
      return history[historyIndex];
    }
    return null;
  }, [history, historyIndex]);

  const currentImage = currentItem?.url || null;

  const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      return { mimeType: match[1], base64: match[2] };
    }
    return null;
  };

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        if (base64) {
          const image = { base64, mimeType: file.type };
          const imageUrl = `data:${image.mimeType};base64,${image.base64}`;
          setSourceImage(image);
          setHistory([{ url: imageUrl, label: 'Góc nhìn gốc' }]);
          setHistoryIndex(0);
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert('Vui lòng tải lên tệp ảnh hợp lệ (PNG, JPG, WEBP).');
    }
  };

  const handleAction = async (action: string, actionLabel: string) => {
    if (!currentImage) {
      alert('Vui lòng tải lên một ảnh để bắt đầu.');
      return;
    }

    const imageForGeneration = dataUrlToSourceImage(currentImage);
    if (!imageForGeneration) {
      alert('Định dạng ảnh không hợp lệ.');
      return;
    }

    let prompt = '';
    switch (action) {
      case 'pan-up':
        prompt = `Pan the camera upwards by ${movementDegree} degrees, revealing more of the ceiling, upper walls, lighting fixtures, or sky while keeping the exact same room/building and materials.`;
        break;
      case 'pan-down':
        prompt = `Pan the camera downwards by ${movementDegree} degrees, revealing more of the floor, foreground furniture, or ground surface while keeping the exact same space and materials.`;
        break;
      case 'pan-left':
        prompt = `Rotate/pan the camera ${movementDegree} degrees to the left from the current standing position, smoothly extending the architectural space and matching all materials and lighting.`;
        break;
      case 'pan-right':
        prompt = `Rotate/pan the camera ${movementDegree} degrees to the right from the current standing position, smoothly extending the architectural space and matching all materials and lighting.`;
        break;
      case 'orbit-left':
        prompt = `Orbit the camera ${movementDegree} degrees to the left around the central subject of the space, showing a new 3D perspective angle of the exact same room/building.`;
        break;
      case 'orbit-right':
        prompt = `Orbit the camera ${movementDegree} degrees to the right around the central subject of the space, showing a new 3D perspective angle of the exact same room/building.`;
        break;
      case 'zoom-in':
        prompt = `Dolly the camera forward (zoom in closer) into the scene, keeping the exact same architectural elements, furniture, and lighting with sharper close-up detail.`;
        break;
      case 'zoom-out':
        prompt = `Dolly the camera backward (wide-angle zoom out) to reveal a broader view of the surrounding room/architectural space while keeping the central scene consistent.`;
        break;
      default:
        return;
    }

    setIsLoading(true);
    try {
      const images = await generateImages(imageForGeneration, prompt, 'interior', 1, null, true);
      if (images.length > 0 && images[0]) {
        const nextHistory = [
          ...history.slice(0, historyIndex + 1),
          { url: images[0], label: actionLabel }
        ];
        setHistory(nextHistory);
        setHistoryIndex(nextHistory.length - 1);
      } else {
        throw new Error('AI không thể tạo góc nhìn mới.');
      }
    } catch (error: any) {
      console.error('Virtual tour action failed:', error);
      alert(`Không thể tạo góc nhìn mới: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[calc(100vh-5.5rem)]">
      {/* Left Studio Control Dock */}
      <div className="w-full lg:w-[360px] xl:w-[380px] flex-shrink-0 flex flex-col gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Icon name="camera-rotate" className="w-4 h-4 text-indigo-400" />
              <span>Điều Khiển Camera 360°</span>
            </h2>
            {sourceImage && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg transition"
              >
                Đổi ảnh gốc
              </button>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files?.[0]) processFile(e.target.files[0]);
            }}
            className="hidden"
            accept="image/png, image/jpeg, image/webp"
          />

          {!sourceImage ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] cursor-pointer transition-all ${
                isDraggingOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700/80 bg-slate-900/40 hover:border-indigo-500/60 hover:bg-slate-900/70'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
                <Icon name="camera-rotate" className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-slate-200 text-center">
                Tải Ảnh Phối Cảnh Để Tham Quan 360°
              </p>
              <p className="text-[11px] text-slate-500 mt-1 text-center">
                Kéo thả hoặc nhấp để chọn ảnh (PNG, JPG, WEBP)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step Angle Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Góc Xoay Mỗi Bước
                  </label>
                  <span className="text-[11px] font-mono text-indigo-400 font-bold">{movementDegree}°</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  {([15, 30, 45] as const).map((deg) => (
                    <button
                      key={deg}
                      onClick={() => setMovementDegree(deg)}
                      className={`py-1.5 rounded-lg font-bold text-xs transition-all ${
                        movementDegree === deg
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Pan Gimbal Controls */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2.5">
                  Pan Camera (Xoay Tại Chỗ)
                </p>
                <div className="grid grid-cols-3 gap-2 max-w-[230px] mx-auto">
                  <div />
                  <NavButton
                    icon="arrow-up"
                    label="Ngẩng Lên"
                    onClick={() => handleAction('pan-up', `Ngẩng +${movementDegree}°`)}
                    disabled={isLoading}
                  />
                  <div />
                  <NavButton
                    icon="arrow-left"
                    label="Liếc Trái"
                    onClick={() => handleAction('pan-left', `Liếc trái ${movementDegree}°`)}
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => setHistoryIndex(0)}
                    disabled={isLoading || historyIndex === 0}
                    title="Về góc nhìn gốc ban đầu"
                    className="flex flex-col items-center justify-center rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 text-[10px] font-bold text-amber-400 disabled:opacity-40 transition"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 mb-1 animate-pulse"></span>
                    Gốc
                  </button>
                  <NavButton
                    icon="arrow-right"
                    label="Liếc Phải"
                    onClick={() => handleAction('pan-right', `Liếc phải ${movementDegree}°`)}
                    disabled={isLoading}
                  />
                  <div />
                  <NavButton
                    icon="arrow-down"
                    label="Cúi Xuống"
                    onClick={() => handleAction('pan-down', `Cúi -${movementDegree}°`)}
                    disabled={isLoading}
                  />
                  <div />
                </div>
              </div>

              {/* Orbit & Zoom */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2">
                    Orbit (Quỹ Đạo)
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NavButton
                      icon="arrow-uturn-left"
                      label="Vòng Trái"
                      onClick={() => handleAction('orbit-left', `Orbit trái ${movementDegree}°`)}
                      disabled={isLoading}
                    />
                    <NavButton
                      icon="arrow-uturn-right"
                      label="Vòng Phải"
                      onClick={() => handleAction('orbit-right', `Orbit phải ${movementDegree}°`)}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2">
                    Dolly Zoom
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NavButton
                      icon="magnifying-glass-plus"
                      label="Tiến Gần"
                      onClick={() => handleAction('zoom-in', 'Tiến gần (Zoom In)')}
                      disabled={isLoading}
                    />
                    <NavButton
                      icon="magnifying-glass-minus"
                      label="Lùi Xa"
                      onClick={() => handleAction('zoom-out', 'Lùi xa (Zoom Out)')}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* Undo / Redo History Controls */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => canUndo && setHistoryIndex(historyIndex - 1)}
                  disabled={!canUndo || isLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="arrow-uturn-left" className="w-4 h-4 text-indigo-400" />
                  <span>Lùi bước ({historyIndex})</span>
                </button>
                <button
                  onClick={() => canRedo && setHistoryIndex(historyIndex + 1)}
                  disabled={!canRedo || isLoading}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="arrow-uturn-right" className="w-4 h-4 text-indigo-400" />
                  <span>Tiến bước ({history.length - 1 - historyIndex})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Fullscreen Studio Viewport */}
      <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden min-h-[480px]">
        {/* Viewport Top Bar */}
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            <span className="text-xs font-bold text-slate-200">
              Không Gian Tham Quan 360°
            </span>
            {currentItem && (
              <span className="text-[11px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                #{historyIndex + 1}: {currentItem.label}
              </span>
            )}
          </div>

          {currentImage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFullscreenUrl(currentImage)}
                className="bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Icon name="arrows-pointing-out" className="w-3.5 h-3.5" />
                <span>Phóng to</span>
              </button>
              {onEditRequest && (
                <button
                  onClick={() => onEditRequest(currentImage)}
                  className="bg-indigo-600/90 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Icon name="pencil" className="w-3.5 h-3.5" />
                  <span>Sửa Canvas</span>
                </button>
              )}
              <DownloadDropdown imageUrl={currentImage} filenamePrefix={`96ARCH-360Tour-Step${historyIndex + 1}`} />
            </div>
          )}
        </div>

        {/* Main Image Canvas */}
        <div className="flex-grow studio-canvas-bg relative flex items-center justify-center p-4 overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center z-20">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3"></div>
              <p className="text-sm font-bold text-white">AI đang dựng góc nhìn 3D mới...</p>
              <p className="text-xs text-slate-400 mt-1">Đồng bộ vật liệu, ánh sáng & phối cảnh không gian</p>
            </div>
          )}

          {currentImage ? (
            <img
              src={currentImage}
              alt="Virtual tour view"
              className="max-w-full max-h-[68vh] object-contain rounded-xl shadow-2xl border border-slate-800/80"
            />
          ) : (
            <div className="text-center max-w-sm p-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-600">
                <Icon name="camera-rotate" className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-300">Chưa có ảnh không gian 360°</p>
              <p className="text-xs text-slate-500 mt-1">
                Tải lên một ảnh phối cảnh nội thất hoặc ngoại thất ở cột bên trái để bắt đầu xoay góc camera tự do bằng AI.
              </p>
            </div>
          )}
        </div>

        {/* Tour Step Timeline Filmstrip */}
        {history.length > 1 && (
          <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center gap-2.5 overflow-x-auto">
            {history.map((step, idx) => (
              <button
                key={idx}
                onClick={() => setHistoryIndex(idx)}
                className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === historyIndex
                    ? 'border-indigo-500 glow-active scale-105'
                    : 'border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={step.url} alt={step.label} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-slate-200 px-1 py-0.5 truncate font-medium">
                  {idx + 1}. {step.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {fullscreenUrl && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setFullscreenUrl(null)}
        >
          <div className="relative max-w-6xl w-full max-h-[92vh] flex items-center justify-center">
            <button
              onClick={() => setFullscreenUrl(null)}
              className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-500 transition shadow-lg z-10"
            >
              <Icon name="x-mark" className="w-5 h-5" />
            </button>
            <img src={fullscreenUrl} alt="Fullscreen 360" className="max-w-full max-h-[88vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};
