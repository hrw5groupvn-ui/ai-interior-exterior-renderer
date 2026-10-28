import React, { useState, useCallback, useEffect } from 'react';
import type { RenderHistoryItem, SourceImage, EditHistoryItem, AspectRatio, ImageResolution } from './types';
import {
  generateImages,
  upscaleImage,
  describeInteriorImage,
  buildInteriorPromptFromReference,
  testGeminiConnection,
  GEMINI_MODELS,
  getSelectedModel,
  setSelectedModel,
  GeminiModelId,
  getApiKey,
  setApiKey
} from './services/geminiService';
import { Icon } from './components/icons';
import { DownloadDropdown } from './components/DownloadDropdown';
import { ImageEditor } from './components/ImageEditor';
import { UtilitiesTab } from './components/UtilitiesTab';
import { MagicPromptTab } from './components/MagicPromptTab';
import { VirtualTourTab } from './components/VirtualTourTab';
import { CameraRawEditor } from './components/CameraRawEditor';

// --- Model Selector Dropdown Component ---
const ModelSelector: React.FC<{
  currentModel: GeminiModelId;
  onSelectModel: (id: GeminiModelId) => void;
}> = ({ currentModel, onSelectModel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeModel = GEMINI_MODELS.find((m) => m.id === currentModel) || GEMINI_MODELS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 hover:border-indigo-500/70 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md transition-all group"
        title="Chọn mô hình Gemini tạo ảnh"
      >
        <span className="text-sm">{activeModel.icon}</span>
        <div className="text-left hidden sm:block">
          <span className="font-bold text-white tracking-wide block leading-none">{activeModel.name}</span>
          <span className="text-[9px] text-indigo-300 font-mono">{activeModel.codename}</span>
        </div>
        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono hidden md:inline">
          {activeModel.badge}
        </span>
        <Icon
          name="chevron-down"
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 z-50">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Mô Hình Gemini Tạo Ảnh
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Auto-Fallback
              </span>
            </div>
            <div className="space-y-1.5 mt-2">
              {GEMINI_MODELS.map((m) => {
                const isSelected = m.id === currentModel;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-indigo-600/25 border border-indigo-500/60 text-white shadow-inner'
                        : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                    }`}
                  >
                    <span className="text-lg mt-0.5">{m.icon}</span>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-100">{m.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0 ${
                            isSelected
                              ? 'bg-indigo-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-indigo-300/90 font-mono mt-0.5">{m.codename} • {m.id}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{m.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const safeSetStorage = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage error (might be full):', e);
    if (Array.isArray(value) && value.length > 1) {
      const prunedValue = value.slice(0, value.length - 1);
      safeSetStorage(key, prunedValue);
    }
  }
};

// --- Custom Interactive Before/After Split Comparison Component ---
const BeforeAfterSlider: React.FC<{
  beforeUrl: string;
  afterUrl: string;
}> = ({ beforeUrl, afterUrl }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let pos = (x / rect.width) * 100;
    if (pos < 0) pos = 0;
    if (pos > 100) pos = 100;
    setSliderPosition(pos);
  }, []);

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    handleMove(e.touches[0].clientX, rect);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    handleMove(e.clientX, rect);
  };

  return (
    <div
      className="relative w-full h-full min-h-[380px] md:min-h-[540px] select-none overflow-hidden rounded-xl cursor-ew-resize border border-slate-800/80 shadow-2xl"
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    >
      {/* After Image */}
      <img src={afterUrl} alt="Render AI" className="absolute inset-0 w-full h-full object-contain bg-slate-950" />
      <span className="absolute top-3 right-3 bg-indigo-600/90 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shadow backdrop-blur-sm z-10">
        ✨ AI Render
      </span>

      {/* Before Image */}
      <div
        className="absolute inset-0 overflow-hidden border-r-2 border-indigo-400 shadow-2xl"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt="Ảnh Gốc Phác Thảo"
          className="absolute inset-0 w-full h-full object-contain bg-slate-950 max-w-none"
          style={{ width: '100%', height: '100%' }}
        />
        <span className="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 text-slate-200 font-bold text-[11px] px-2.5 py-1 rounded-lg shadow backdrop-blur-sm z-10">
          📐 Ảnh Gốc
        </span>
      </div>

      {/* Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize z-20 flex items-center justify-center shadow-[0_0_12px_rgba(0,0,0,0.8)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-600 border-2 border-white text-white flex items-center justify-center shadow-lg transform -translate-x-1/2 hover:scale-110 transition-transform">
          <Icon name="arrows-right-left" className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

const ImageUpload: React.FC<{
  sourceImage: SourceImage | null;
  onImageUpload: (image: SourceImage) => void;
  onRemove: () => void;
  label?: string;
  sublabel?: string;
}> = ({
  sourceImage,
  onImageUpload,
  onRemove,
  label = '1. Ảnh Phác Thảo / 3D Sketch / Floorplan',
  sublabel = 'Kéo thả hoặc nhấp chọn ảnh (PNG, JPG, WEBP)'
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        if (base64) {
          onImageUpload({ base64, mimeType: file.type });
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert('Vui lòng tải lên tệp ảnh hợp lệ (PNG, JPG, WEBP).');
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{label}</label>
        {sourceImage && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300"
          >
            Đổi ảnh khác
          </button>
        )}
      </div>
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
        className={`relative group border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center min-h-[145px] transition-all cursor-pointer ${
          isDraggingOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-700/80 bg-slate-950/60 hover:border-indigo-500/60 hover:bg-slate-900/60'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        {sourceImage ? (
          <div className="relative w-full h-36 flex items-center justify-center">
            <img
              src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`}
              alt="Source"
              className="max-h-full max-w-full object-contain rounded-lg shadow-md"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute top-1 right-1 bg-red-600/90 text-white rounded-full p-1 hover:bg-red-500 transition shadow"
              title="Xóa ảnh"
            >
              <Icon name="x-mark" className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-center p-2 pointer-events-none">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
              <Icon name="photo" className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-200">{sublabel}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Giữ nguyên 100% bố cục & đường nét kiến trúc</p>
          </div>
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
    </div>
  );
};

const ReferenceImageUpload: React.FC<{
  image: SourceImage | null;
  onUpload: (image: SourceImage) => void;
  onRemove: () => void;
  onExtractPrompt?: () => void;
  isExtractingPrompt?: boolean;
  onOpenBuilder?: () => void;
}> = ({ image, onUpload, onRemove, onExtractPrompt, isExtractingPrompt, onOpenBuilder }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        if (base64) onUpload({ base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  if (image) {
    return (
      <div className="space-y-1.5 bg-slate-950/80 border border-indigo-500/40 rounded-xl p-2">
        <div className="relative group rounded-lg overflow-hidden h-24 flex items-center justify-center bg-slate-900">
          <img src={`data:${image.mimeType};base64,${image.base64}`} alt="Reference" className="w-full h-full object-cover" />
          <div className="absolute bottom-1.5 left-2 bg-black/80 text-[10px] text-indigo-300 px-2 py-0.5 rounded font-semibold border border-indigo-500/30">
            🎨 Ảnh Tham Chiếu Style / Nội Thất
          </div>
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 bg-red-600/90 rounded-full text-white p-1 hover:bg-red-500 transition shadow"
            title="Xóa ảnh tham chiếu"
          >
            <Icon name="x-mark" className="w-3.5 h-3.5" />
          </button>
        </div>

        {(onExtractPrompt || onOpenBuilder) && (
          <div className="grid grid-cols-2 gap-1.5">
            {onExtractPrompt && (
              <button
                type="button"
                onClick={onExtractPrompt}
                disabled={isExtractingPrompt}
                className="bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 hover:text-white text-[10px] font-bold py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 disabled:opacity-50"
                title="AI tự động phân tích ảnh tham chiếu này và điền Prompt nội thất chi tiết"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5 text-amber-400" />
                <span>{isExtractingPrompt ? 'Đang trích xuất...' : 'Tạo Prompt Từ Ảnh Này'}</span>
              </button>
            )}
            {onOpenBuilder && (
              <button
                type="button"
                onClick={onOpenBuilder}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-amber-300 text-[10px] font-bold py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1"
                title="Mở bảng bóc tách 5 lớp (Phong cách, Bảng màu, Vật liệu, Đồ rời, Ánh sáng)"
              >
                <Icon name="wand" className="w-3.5 h-3.5 text-indigo-400" />
                <span>Bóc Tách 5 Lớp Chi Tiết</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full border border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-xl p-2.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950/40 hover:bg-slate-900/60 transition flex items-center justify-center gap-2"
      >
        <Icon name="sparkles" className="w-4 h-4 text-indigo-400" />
        <span>+ Tải Ảnh Tham Chiếu Nội Thất / Mood (Trích xuất Prompt)</span>
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) processFile(e.target.files[0]);
        }}
        className="hidden"
        accept="image/*"
      />
    </div>
  );
};

// --- Modals ---
const ImageViewerModal: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => (
  <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div
      className="bg-slate-900 border border-slate-800 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col relative shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-500 transition shadow-lg z-10"
      >
        <Icon name="x-mark" className="w-5 h-5" />
      </button>
      <div className="p-3 flex-grow overflow-auto flex items-center justify-center">
        <img src={imageUrl} alt="Fullscreen" className="max-w-full max-h-[86vh] object-contain rounded-lg" />
      </div>
    </div>
  </div>
);

const UpscaleModal: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => (
  <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div
      className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl max-h-[90vh] flex flex-col relative shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-500 transition z-10"
      >
        <Icon name="x-mark" className="w-5 h-5" />
      </button>
      <div className="p-4 overflow-auto">
        <img src={imageUrl} alt="Upscaled result" className="w-full max-h-[72vh] object-contain rounded-xl" />
      </div>
      <div className="p-4 border-t border-slate-800 flex justify-center">
        <a
          href={imageUrl}
          download={`96-ARCH-AI-Upscaled-${Date.now()}.png`}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition flex items-center gap-2 shadow-lg text-xs"
        >
          <Icon name="download" className="w-4 h-4" />
          Tải Về Ảnh Độ Phân Giải Cao
        </a>
      </div>
    </div>
  </div>
);

const ZaloModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    onClick={onClose}
  >
    <div
      className="bg-slate-900 border border-slate-700/90 rounded-2xl max-w-sm w-full relative shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 text-slate-300 hover:text-white transition z-50 bg-slate-800/90 hover:bg-red-600 p-2 rounded-full border border-slate-700 shadow-lg cursor-pointer"
        title="Đóng và quay lại giao diện chính"
      >
        <Icon name="x-mark" className="w-5 h-5" />
      </button>
      <div className="p-5 text-center">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-100">Hoàn Phạm</h3>
          <p className="text-slate-400 text-xs mt-0.5">Liên hệ Zalo Hỗ Trợ & Tư vấn 96 ARCH AI</p>
        </div>

        <div className="border border-slate-800 p-2 rounded-2xl bg-white shadow-2xl inline-block max-w-[240px]">
          <img
            src="/zalo-qr.jpg"
            alt="Zalo QR Hoàn Phạm"
            className="w-full h-auto rounded-xl object-contain"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src =
                'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=https://zalo.me';
            }}
          />
        </div>

        <p className="text-slate-400 text-xs mt-3 flex items-center justify-center gap-1.5 font-medium">
          <span>📲</span> Mở Zalo bấm nút quét QR để kết bạn
        </p>

        <div className="mt-5 pt-4 border-t border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            <span>Quay Lại Giao Diện App</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);

const DonateModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    onClick={onClose}
  >
    <div
      className="bg-slate-900 border border-slate-700/90 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 text-slate-300 hover:text-white transition z-50 bg-slate-800/90 hover:bg-red-600 p-2 rounded-full border border-slate-700 shadow-lg cursor-pointer"
        title="Đóng và quay lại giao diện chính"
      >
        <Icon name="x-mark" className="w-5 h-5" />
      </button>
      <div className="text-center mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-2.5 shadow-lg shadow-rose-500/20">
          <Icon name="heart" className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-100">Ủng Hộ Tác Giả</h3>
        <p className="text-slate-400 text-xs mt-0.5">Tiếp sức phát triển 96 ARCH AI Render Studio</p>
      </div>

      <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 mb-3.5 text-left">
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-slate-500 font-medium uppercase">Ngân hàng</p>
            <p className="text-sm font-bold text-emerald-400">Techcombank</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-medium uppercase">Số tài khoản</p>
            <p className="text-lg font-mono font-bold text-white tracking-wider">1903 1417 1760 32</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-medium uppercase">Chủ tài khoản</p>
            <p className="text-xs font-bold text-slate-200 uppercase">PHAM TU HOAN</p>
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        <img
          src="https://img.vietqr.io/image/techcombank-19031417176032-compact.png?accountName=PHAM%20TU%20HOAN"
          alt="QR Code"
          className="w-36 h-36 object-cover rounded-xl mx-auto border border-slate-800 bg-white"
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
      >
        <Icon name="arrow-left" className="w-4 h-4" />
        <span>Quay Lại Giao Diện App</span>
      </button>
    </div>
  </div>
);

const StudioWelcomeModal: React.FC<{
  onClose: () => void;
  onOpenZalo: () => void;
  onOpenDonate: () => void;
}> = ({ onClose, onOpenZalo, onOpenDonate }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
    onClick={onClose}
  >
    <div
      className="bg-[#0e1322] border border-indigo-500/30 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(79,70,229,0.25)] relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 text-slate-300 hover:text-white transition z-50 bg-slate-800/90 hover:bg-red-600 p-2 rounded-full border border-slate-700 shadow-lg cursor-pointer"
        title="Đóng cửa sổ này"
      >
        <Icon name="x-mark" className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-3.5 mb-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-amber-400/40">
          <span className="font-bold font-orbitron text-white text-base tracking-wider">96</span>
        </div>
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">96 ARCH AI Design Studio</h3>
          <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1 mt-0.5">
            <span>🛡️</span> Phiên bản PRO 3.1 • Gemini Nano Banana 2
          </span>
        </div>
      </div>

      <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 mb-5 space-y-2.5 text-xs">
        <p className="font-bold text-indigo-300 flex items-center gap-1.5 mb-1">
          <Icon name="sparkles" className="w-4 h-4" />
          Tính Năng Nổi Bật Đã Tích Hợp:
        </p>
        <div className="flex items-start gap-2 text-slate-300">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>Render 3D Siêu Thực từ Phác Thảo & Mặt Bằng 2D Floorplan</span>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>Tích hợp chuẩn Gemini 3.1 Flash Image (Nano Banana 2) & Gemini 3 Pro Image</span>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>Tùy chọn Tỷ lệ khung hình (16:9, 4:3, 1:1, 9:16) & Xuất ảnh 1K / 2K / 4K</span>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>Inpainting Khoanh vùng sửa ảnh & Hậu kỳ Camera Raw trực tiếp</span>
        </div>
        <div className="flex items-start gap-2 text-slate-300">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>Tự động tạo 20 Magic Prompts, Virtual Tour 360° & Xuất Hồ sơ PDF</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenZalo();
          }}
          className="bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>💬</span> Hỗ Trợ Zalo KTS
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenDonate();
          }}
          className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <Icon name="heart" className="w-4 h-4 text-rose-400" /> Ủng Hộ / Donate
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg mb-3 cursor-pointer"
      >
        Bắt Đầu Sử Dụng Studio ➔
      </button>

      <p className="text-[10px] text-center text-slate-500">
        Phát triển trên nền tảng Google Gemini Image SDK • Dành riêng cho Kiến trúc sư & Nhà thiết kế Việt Nam
      </p>
    </div>
  </div>
);

const ApiKeyModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testGeminiConnection(key);
    setTestResult(res);
    setTesting(false);
  };

  const handleSave = () => {
    setApiKey(key.trim());
    setSaved(true);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-white transition">
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/20 text-xl text-white">
            🔑
          </div>
          <h3 className="text-lg font-bold text-slate-100">Kết Nối Gemini Image API</h3>
          <p className="text-slate-400 text-xs mt-1">
            Hỗ trợ Gemini 3.1 Flash Image (Nano Banana 2), Gemini 3 Pro Image & 2.5 Flash Image
          </p>
        </div>

        <div className="space-y-4 mb-5 text-left">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Google Gemini API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="AIzaSy..."
                className="flex-grow bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={handleTest}
                disabled={testing || !key.trim()}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 font-bold px-3 rounded-xl text-xs transition disabled:opacity-40 flex-shrink-0"
              >
                {testing ? 'Đang thử...' : 'Kiểm tra'}
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                testResult.ok
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/30 text-red-300'
              }`}
            >
              {testResult.ok ? '✅ ' : '⚠️ '}
              {testResult.message}
            </div>
          )}

          <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3 text-xs text-indigo-300 space-y-1.5 leading-relaxed">
            <p className="font-semibold text-indigo-200">💡 Hướng dẫn lấy API Key từ Google AI Studio:</p>
            <p>
              1. Truy cập{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline text-indigo-400 hover:text-white font-medium"
              >
                aistudio.google.com/app/apikey
              </a>
            </p>
            <p>
              2. Bấm <b>Create API key</b> và dán mã vào ô phía trên.
            </p>
            <p>
              3. Hệ thống tự động kích hoạt chế độ <b>Smart Fallback</b> giữa các model tạo ảnh để tránh lỗi gián đoạn.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl text-xs transition"
          >
            Đóng
          </button>
          <button
            onClick={handleSave}
            disabled={!key.trim()}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50 shadow-md shadow-indigo-600/20"
          >
            {saved ? '✓ Đã Lưu Key' : 'Lưu & Kết Nối'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'exterior' | 'interior' | 'floorplan' | 'edit' | 'utilities' | 'virtual-tour' | 'magic-prompt'
  >('exterior');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedModel, setModel] = useState<GeminiModelId>(getSelectedModel());
  const handleModelChange = (modelId: GeminiModelId) => {
    setSelectedModel(modelId);
    setModel(modelId);
  };

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(!!getApiKey());
  const [showDonate, setShowDonate] = useState(false);
  const [showZalo, setShowZalo] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);

  // Global ESC key listener to close any open modal and return to main app UI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowZalo(false);
        setShowDonate(false);
        setShowWelcomePro(false);
        setShowApiKeyModal(false);
        setImageForFullscreen(null);
        setUpscaledImageForModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [imageForEditing, setImageForEditing] = useState<SourceImage | null>(null);
  const [editHistoryItemToRestore, setEditHistoryItemToRestore] = useState<EditHistoryItem | null>(null);
  const [isStudioCameraRawOpen, setIsStudioCameraRawOpen] = useState(false);

  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
  const [generationCount, setGenerationCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<ImageResolution>('2K');
  const [referenceImage, setReferenceImage] = useState<SourceImage | null>(null);

  // Exterior prompts & presets
  const [exteriorPrompt, setExteriorPrompt] = useState(
    'Phối cảnh biệt thự hiện đại sang trọng, mặt tiền ốp đá travertine kết hợp lam gỗ ấm, cửa kính lớn tràn viền, sân vườn nhiệt đới, ánh sáng nắng chiều hoàng hôn thực tế, 8k photorealistic'
  );
  const exteriorPresets = [
    {
      label: '✨ Modern Luxury Villa',
      value:
        'Biệt thự hiện đại phong cách tối giản luxury, mặt tiền ốp đá marble xám vân tự nhiên, hệ kính chạm trần khung nhôm mảnh, hồ bơi vô cực phản chiếu ánh đèn ấm áp lúc hoàng hôn'
    },
    {
      label: '🌿 Japandi & Wabi-Sabi',
      value:
        'Kiến trúc nhà vườn Japandi kết hợp gỗ tuyết tùng tự nhiên, tường sơn hiệu ứng bê tông mộc, mái hiên vươn rộng, sân vườn thiền Nhật Bản với sỏi trắng và cây phong'
    },
    {
      label: '🏛️ Tân Cổ Điển Pháp',
      value:
        'Phối cảnh dinh thự tân cổ điển châu Âu sang trọng, đá kem hoàng gia, hệ cột Corinth cân đối, ban công sắt mỹ thuật tinh xảo, cổng nhôm đúc và đèn chùm sảnh chính lộng lẫy'
    },
    {
      label: '🏝️ Tropical Resort',
      value:
        'Villa nghỉ dưỡng Tropical hiện đại, kết cấu bê tông trần kết hợp trần gỗ tếch ấm áp, mảng xanh cây nhiệt đới rủ xuống ban công, nắng ban ngày trong trẻo'
    },
    {
      label: '🏮 Indochine Đương Đại',
      value:
        'Biệt thự phong cách Đông Dương Indochine đương đại, mái ngói dốc truyền thống, cửa lá sách gỗ sẫm màu, gạch bông trang trí, sân trong nhiều cây xanh thoáng đãng'
    },
    {
      label: '🏙️ Nhà Phố Hiện Đại',
      value:
        'Nhà phố mặt tiền 6m hiện đại 4 tầng, mặt đứng sử dụng gạch thông gió kết hợp lam gỗ nhựa ngoài trời, ban công trồng cây xanh rủ, ánh sáng đèn LED hắt khe kiến trúc ban đêm'
    }
  ];

  // Interior prompts & presets
  const [interiorPrompt, setInteriorPrompt] = useState(
    'Không gian nội thất phòng khách hiện đại luxury, sàn gỗ óc chó xương cá, vách tivi ốp đá marble vân mây, sofa da Ý cao cấp, ánh sáng tự nhiên kết hợp đèn LED hắt trần ấm áp 3000K'
  );
  const interiorPresets = [
    {
      label: '💎 Modern Luxury',
      value:
        'Nội thất phong cách Modern Luxury cao cấp, vách ốp đá Marble tự nhiên kết hợp nẹp đồng PVD, sofa bọc nỉ nhung Bỉ, bàn trà mặt đá, hệ tủ kính cánh trà có đèn LED hắt ấm 3000K'
    },
    {
      label: '🪵 Gỗ Óc Chó (Walnut)',
      value:
        'Không gian nội thất gỗ óc chó Bắc Mỹ tự nhiên trầm ấm, đường vân cuộn xoáy sang trọng, kết hợp da bò Ý màu cognac, đá thạch anh trắng và ánh sáng nắng chiều xuyên qua rèm voan'
    },
    {
      label: '🌾 Wabi-Sabi Tĩnh Lặng',
      value:
        'Nội thất phong cách Wabi-Sabi mộc mạc tinh tế, tường sơn hiệu ứng đất sét màu kem ấm, trần và sàn vi xi măng, nội thất gỗ sồi tự nhiên dáng cong mềm mại, ánh sáng dịu nhẹ'
    },
    {
      label: '🎋 Indochine Đông Dương',
      value:
        'Nội thất phong cách Indochine sang trọng, sàn lát gạch bông cổ điển, đồ gỗ tự nhiên sơn đen kết hợp mây đan mắt cáo, tranh sơn dầu hoa sen, quạt trần lá cọ và đèn lồng ấm áp'
    },
    {
      label: '🍵 Japandi Tối Giản',
      value:
        'Nội thất Japandi tối giản Bắc Âu pha Nhật Bản, tông màu gỗ sồi sáng và trắng kem, sofa vải bố linen, cây bàng Singapore, cửa sổ lớn đón ánh sáng tự nhiên tràn ngập'
    },
    {
      label: '👑 Tân Cổ Điển Tinh Tế',
      value:
        'Không gian nội thất Neo-Classic tân cổ điển nhẹ nhàng, tường kẻ chỉ phào PU tinh tế sơn trắng kem, đèn chùm pha lê hiện đại, sàn đá cẩm thạch bóng kính và nội thất bọc nhung'
    }
  ];

  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isBuildingRefPrompt, setIsBuildingRefPrompt] = useState(false);

  // Floorplan state
  const [floorplanPrompt, setFloorplanPrompt] = useState(
    'Biến bản vẽ mặt bằng 2D này thành ảnh render phối cảnh 3D nội thất góc nhìn ngang tầm mắt, đầy đủ vật liệu thực tế và ánh sáng tự nhiên.'
  );
  const [roomType, setRoomType] = useState('Phòng khách liên thông bếp');
  const [roomStyle, setRoomStyle] = useState('Hiện đại Luxury');
  const roomTypeOptions = [
    'Phòng khách liên thông bếp',
    'Phòng khách',
    'Phòng ngủ Master',
    'Phòng bếp & Bàn ăn',
    'Phòng tắm / WC Luxury',
    'Phòng làm việc / Đọc sách',
    'Căn hộ Studio toàn cảnh'
  ];
  const roomStyleOptions = [
    'Hiện đại Luxury',
    'Gỗ Óc Chó Cao Cấp',
    'Japandi Tối Giản',
    'Wabi-sabi Mộc Mạc',
    'Tân cổ điển (Neo-Classic)',
    'Indochine (Đông Dương)',
    'Scandinavian Bắc Âu'
  ];

  const exteriorAngleOptions = [
    'Góc chụp trực diện toàn cảnh mặt tiền chính công trình',
    'Góc chụp 3/4 bên trái thể hiện chiều sâu mặt tiền và hông nhà',
    'Góc chụp 3/4 bên phải kết hợp cảnh quan sân vườn tiền cảnh',
    'Góc chụp từ trên cao nhìn xuống (Drone View / Bird-eye) toàn khuôn viên',
    'Góc chụp ngước từ dưới lên (Low-angle) tôn vẻ bề thế công trình',
    'Góc chụp cận cảnh chi tiết vật liệu mặt tiền và sảnh chính'
  ];

  const interiorAngleOptions = [
    'Góc chụp rộng 24mm bao quát toàn bộ không gian căn phòng',
    'Góc chụp 3/4 hướng vào khu vực trung tâm và điểm nhấn chính',
    'Góc chụp chính diện cân xứng (Symmetrical one-point perspective)',
    'Góc chụp từ cửa sổ nhìn ngược vào bên trong không gian nội thất',
    'Góc chụp cận cảnh (Close-up) chi tiết đồ nội thất và bề mặt vật liệu'
  ];

  const currentAngleList = activeTab === 'interior' ? interiorAngleOptions : exteriorAngleOptions;
  const [anglePrompt, setAnglePrompt] = useState(currentAngleList[0]);

  useEffect(() => {
    setAnglePrompt((activeTab === 'interior' ? interiorAngleOptions : exteriorAngleOptions)[0]);
  }, [activeTab]);

  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [compareMode, setCompareMode] = useState(false);

  const [exteriorHistory, setExteriorHistory] = useState<RenderHistoryItem[]>([]);
  const [interiorHistory, setInteriorHistory] = useState<RenderHistoryItem[]>([]);
  const [floorplanHistory, setFloorplanHistory] = useState<RenderHistoryItem[]>([]);
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [upscalingIndex, setUpscalingIndex] = useState<number | null>(null);
  const [upscaledImageForModal, setUpscaledImageForModal] = useState<string | null>(null);
  const [imageForFullscreen, setImageForFullscreen] = useState<string | null>(null);

  const filterOldHistory = <T extends { id: number }>(history: T[]): T[] => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return history.filter((item) => item.id > sevenDaysAgo);
  };

  useEffect(() => {
    try {
      const storedExterior = localStorage.getItem('exteriorRenderHistory');
      if (storedExterior) setExteriorHistory(filterOldHistory(JSON.parse(storedExterior)));

      const storedInterior = localStorage.getItem('interiorRenderHistory');
      if (storedInterior) setInteriorHistory(filterOldHistory(JSON.parse(storedInterior)));

      const storedFloorplan = localStorage.getItem('floorplanHistory');
      if (storedFloorplan) setFloorplanHistory(filterOldHistory(JSON.parse(storedFloorplan)));

      const storedEdit = localStorage.getItem('editHistory');
      if (storedEdit) setEditHistory(filterOldHistory(JSON.parse(storedEdit)));
    } catch (e) {
      console.error('Failed to load local storage history', e);
    }
  }, []);

  useEffect(() => {
    safeSetStorage('exteriorRenderHistory', exteriorHistory);
  }, [exteriorHistory]);
  useEffect(() => {
    safeSetStorage('interiorRenderHistory', interiorHistory);
  }, [interiorHistory]);
  useEffect(() => {
    safeSetStorage('floorplanHistory', floorplanHistory);
  }, [floorplanHistory]);
  useEffect(() => {
    safeSetStorage('editHistory', editHistory);
  }, [editHistory]);

  useEffect(() => {
    if (activeTab === 'floorplan') {
      const basePrompt = 'Chuyển bản vẽ mặt bằng 2D này thành ảnh render phối cảnh 3D nội thất siêu thực';
      setFloorplanPrompt(`${basePrompt}. Không gian: ${roomType}. Phong cách thiết kế: ${roomStyle}. Ánh sáng tự nhiên kết hợp đèn nội thất ấm áp.`);
    }
  }, [roomType, roomStyle, activeTab]);

  const handleAnalyzeSourceImage = async (imgToAnalyze?: SourceImage | null) => {
    const target = imgToAnalyze || sourceImage;
    if (!target) {
      alert('Vui lòng tải lên ảnh phác thảo / hiện trạng trước khi dùng AI đọc ảnh.');
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const mode = activeTab === 'exterior' ? 'exterior' : activeTab === 'floorplan' ? 'floorplan' : 'interior';
      const description = await describeInteriorImage(target, mode);
      if (activeTab === 'exterior') setExteriorPrompt(description);
      else if (activeTab === 'interior') setInteriorPrompt(description);
      else setFloorplanPrompt(description);
    } catch (error: any) {
      console.error(error);
      const errMsg = error?.message || String(error);
      if (errMsg.includes('API_KEY is not configured')) {
        setShowApiKeyModal(true);
      } else {
        alert(`Không thể phân tích ảnh tự động: ${errMsg}`);
      }
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleExtractPromptFromReference = async (refImg?: SourceImage | null) => {
    const targetRef = refImg || referenceImage;
    if (!targetRef) {
      alert('Vui lòng tải lên Ảnh Tham Chiếu Nội Thất trước khi trích xuất Prompt.');
      return;
    }
    setIsBuildingRefPrompt(true);
    try {
      const analysis = await buildInteriorPromptFromReference(
        targetRef,
        activeTab === 'floorplan' ? roomType : 'Không gian nội thất theo ảnh tham chiếu',
        'Tự động theo ảnh tham chiếu',
        ''
      );
      const extracted = analysis.vietnamesePrompt || analysis.englishPrompt;
      if (activeTab === 'exterior') setExteriorPrompt(extracted);
      else if (activeTab === 'interior') setInteriorPrompt(extracted);
      else setFloorplanPrompt(extracted);
    } catch (error: any) {
      console.error(error);
      const errMsg = error?.message || String(error);
      if (errMsg.includes('API_KEY is not configured')) {
        setShowApiKeyModal(true);
      } else {
        alert(`Không thể trích xuất prompt từ ảnh tham chiếu: ${errMsg}`);
      }
    } finally {
      setIsBuildingRefPrompt(false);
    }
  };

  const handleImageUpload = async (image: SourceImage) => {
    setSourceImage(image);
    if (activeTab === 'interior' && !interiorPrompt.trim()) {
      await handleAnalyzeSourceImage(image);
    }
  };

  const handleGeneration = useCallback(
    async (prompt: string, renderType: 'exterior' | 'interior', isAnglePrompt: boolean) => {
      if (!sourceImage || !prompt) {
        alert('Vui lòng tải lên ảnh nguồn và nhập prompt chỉ dẫn.');
        return;
      }
      setIsLoading(true);
      setGeneratedImages([]);
      setSelectedImageIndex(0);
      setCompareMode(false);
      try {
        const refImage = isAnglePrompt ? null : referenceImage;
        const images = await generateImages(sourceImage, prompt, renderType, generationCount, refImage, isAnglePrompt, false, {
          aspectRatio,
          imageSize: resolution
        });
        setGeneratedImages(images);

        const activeModelObj = GEMINI_MODELS.find((m) => m.id === getSelectedModel());
        const newHistoryItem: RenderHistoryItem = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          images,
          prompt,
          aspectRatio,
          resolution,
          modelName: activeModelObj?.name
        };
        const historySetter = renderType === 'exterior' ? setExteriorHistory : setInteriorHistory;
        historySetter((prev) => [newHistoryItem, ...prev]);
      } catch (error: any) {
        console.error(error);
        const errMsg = error?.message || String(error);
        if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
          alert(
            'Hết hạn mức Quota (429): Tài khoản API Key hiện tại đang chạm giới hạn lượt tạo ảnh miễn phí. Bạn có thể chuyển sang model "Gemini 2.5 Flash Image" hoặc cập nhật API Key mới.'
          );
          setShowApiKeyModal(true);
        } else if (errMsg.includes('API_KEY is not configured') || errMsg.includes('API_KEY_INVALID')) {
          alert('Vui lòng cấu hình Gemini API Key hợp lệ để bắt đầu tạo ảnh AI.');
          setShowApiKeyModal(true);
        } else {
          alert(`Xảy ra lỗi trong quá trình render AI: ${errMsg}`);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [sourceImage, referenceImage, generationCount, aspectRatio, resolution]
  );

  const handleFloorplanGeneration = useCallback(async () => {
    if (!sourceImage) {
      alert('Vui lòng tải lên ảnh mặt bằng Floorplan 2D.');
      return;
    }
    setIsLoading(true);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    setCompareMode(false);
    try {
      const images = await generateImages(sourceImage, floorplanPrompt, 'floorplan', generationCount, referenceImage, false, false, {
        aspectRatio,
        imageSize: resolution
      });
      setGeneratedImages(images);
      const activeModelObj = GEMINI_MODELS.find((m) => m.id === getSelectedModel());
      const newHistoryItem: RenderHistoryItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        images,
        prompt: floorplanPrompt,
        aspectRatio,
        resolution,
        modelName: activeModelObj?.name
      };
      setFloorplanHistory((prev) => [newHistoryItem, ...prev]);
    } catch (error: any) {
      console.error(error);
      const errMsg = error?.message || String(error);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
        alert('Lỗi 429 (Hết hạn mức Quota): Vui lòng đổi sang model Gemini 2.5 Flash Image hoặc nhập API Key mới.');
        setShowApiKeyModal(true);
      } else if (errMsg.includes('API_KEY is not configured')) {
        alert('Chưa cấu hình API Key: Vui lòng nhập Gemini API Key để tiếp tục.');
        setShowApiKeyModal(true);
      } else {
        alert(`Lỗi render floorplan 3D: ${errMsg}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sourceImage, floorplanPrompt, generationCount, referenceImage, aspectRatio, resolution]);

  const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      return { mimeType: match[1], base64: match[2] };
    }
    return null;
  };

  const handleUpscale = async (index: number, target: '2k' | '4k') => {
    const sourceDataUrl = generatedImages[index];
    if (!sourceDataUrl) return;
    const imageToUpscale = dataUrlToSourceImage(sourceDataUrl);
    if (!imageToUpscale) return;

    setUpscalingIndex(index);
    try {
      const upscaledImage = await upscaleImage(imageToUpscale, target);
      if (upscaledImage) {
        const newGeneratedImages = [...generatedImages];
        newGeneratedImages[index] = upscaledImage;
        setGeneratedImages(newGeneratedImages);
        setUpscaledImageForModal(upscaledImage);
      }
    } catch (error: any) {
      console.error(error);
      alert(`Không thể nâng cấp ảnh: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setUpscalingIndex(null);
    }
  };

  const sendDataUrlToEditor = (imgDataUrl: string) => {
    const src = dataUrlToSourceImage(imgDataUrl);
    if (src) {
      setImageForEditing(src);
      setActiveTab('edit');
    }
  };

  const navItems = [
    { id: 'exterior', label: 'Render Ngoại Thất', short: 'Ngoại Thất', icon: 'building-office', desc: 'Phối cảnh công trình & biệt thự 3D' },
    { id: 'interior', label: 'Render Nội Thất', short: 'Nội Thất', icon: 'home', desc: 'Không gian nội thất & vật liệu PBR' },
    { id: 'floorplan', label: 'Mặt Bằng 2D ➔ 3D', short: '2D ➔ 3D', icon: 'cube', desc: 'Dựng phối cảnh 3D từ bản vẽ CAD/2D' },
    { id: 'edit', label: 'Canvas Inpainting', short: 'Inpainting', icon: 'brush', desc: 'Khoanh vùng sửa chi tiết & Camera Raw' },
    { id: 'magic-prompt', label: 'Prompt Nội Thất & 20 Góc', short: 'AI Prompt', icon: 'wand', desc: 'Tạo prompt nội thất từ ảnh mẫu & 20 góc' },
    { id: 'utilities', label: 'Bộ Công Cụ AI', short: 'Tiện Ích', icon: 'sparkles', desc: 'Tách Map 3D, Tiến độ thi công & Xuất PDF' },
    { id: 'virtual-tour', label: 'Virtual Tour 360°', short: 'Tour 360°', icon: 'camera-rotate', desc: 'Điều hướng góc nhìn không gian 3D' }
  ];

  const aspectRatios: { id: AspectRatio; label: string; w: string; h: string }[] = [
    { id: '16:9', label: '16:9 Ngang', w: 'w-4', h: 'h-2.5' },
    { id: '4:3', label: '4:3 Chuẩn', w: 'w-3.5', h: 'h-3' },
    { id: '1:1', label: '1:1 Vuông', w: 'w-3', h: 'h-3' },
    { id: '3:4', label: '3:4 Dọc', w: 'w-2.5', h: 'h-3.5' },
    { id: '9:16', label: '9:16 Story', w: 'w-2', h: 'h-4' }
  ];

  const currentTabInfo = navItems.find((item) => item.id === activeTab) || navItems[0];
  const currentHistory =
    activeTab === 'exterior' ? exteriorHistory : activeTab === 'interior' ? interiorHistory : floorplanHistory;
  const selectedImage = generatedImages[selectedImageIndex] || null;
  const sourceDataUrl = sourceImage ? `data:${sourceImage.mimeType};base64,${sourceImage.base64}` : null;

  return (
    <div className="min-h-screen flex bg-[#050810] text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* --- Mobile Navigation Drawer --- */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative w-72 max-w-[82vw] studio-dock border-r border-slate-800 h-full flex flex-col z-10 p-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg border border-amber-400/30">
                  <span className="font-bold font-orbitron text-white text-xs">96</span>
                </div>
                <div>
                  <h1 className="font-bold text-xs tracking-wide text-amber-200 font-orbitron">96 ARCH AI</h1>
                  <span className="text-[9px] font-mono text-indigo-300">DESIGN STUDIO PRO 3.1</span>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white p-1">
                <Icon name="x-mark" className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-grow py-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const isExactActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isExactActive
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon name={item.icon} className="w-5 h-5 flex-shrink-0" />
                    <div className="text-left">
                      <p>{item.label}</p>
                      <p className="text-[10px] opacity-70 font-normal">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </nav>
            <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowZalo(true);
                }}
                className="bg-slate-800 text-slate-200 text-xs font-semibold py-2 rounded-xl"
              >
                💬 Zalo Hỗ Trợ
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowDonate(true);
                }}
                className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold py-2 rounded-xl"
              >
                ❤️ Donate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Desktop Left Studio Rail / Collapsible Sidebar --- */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 studio-dock border-r border-slate-800/80 transition-all duration-300 flex-col ${
          sidebarCollapsed ? 'w-[68px]' : 'w-60'
        } hidden md:flex`}
      >
        {/* Brand Header */}
        <div className="h-14 px-3.5 border-b border-slate-800/80 flex items-center justify-between">
          {!sidebarCollapsed ? (
            <div
              onClick={() => setShowWelcomePro(true)}
              className="flex items-center gap-2.5 cursor-pointer group"
              title="Xem thông tin phiên bản PRO 3.1"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-amber-400/30 group-hover:scale-105 transition-transform">
                <span className="font-bold font-orbitron text-white text-xs tracking-wider">96</span>
              </div>
              <div>
                <h1 className="font-bold text-xs tracking-wider text-amber-200 font-orbitron leading-none">96 ARCH AI</h1>
                <span className="text-[9px] font-mono font-semibold text-indigo-300 tracking-tight">
                  STUDIO PRO 3.1
                </span>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowWelcomePro(true)}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg border border-amber-400/30 mx-auto cursor-pointer"
              title="96 ARCH AI Studio PRO 3.1"
            >
              <span className="font-bold font-orbitron text-white text-xs">96</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition"
            title={sidebarCollapsed ? 'Mở rộng thanh công cụ' : 'Thu gọn thanh công cụ'}
          >
            <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-grow p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isExactActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 group ${
                  isExactActive
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-950/60 glow-active'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                title={sidebarCollapsed ? `${item.label} - ${item.desc}` : undefined}
              >
                <Icon
                  name={item.icon}
                  className={`w-5 h-5 flex-shrink-0 ${
                    isExactActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'
                  }`}
                />
                {!sidebarCollapsed && (
                  <div className="text-left min-w-0">
                    <p className="truncate leading-tight">{item.label}</p>
                    <p
                      className={`text-[10px] font-normal truncate mt-0.5 ${
                        isExactActive ? 'text-indigo-100/80' : 'text-slate-500'
                      }`}
                    >
                      {item.desc}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Support Quick Links */}
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/50 space-y-2">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center justify-between px-1.5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 font-medium truncate">
                  <span>{GEMINI_MODELS.find((m) => m.id === selectedModel)?.icon || '🍌'}</span>
                  <span className="truncate">{GEMINI_MODELS.find((m) => m.id === selectedModel)?.codename}</span>
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setShowZalo(true)}
                  className="bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold py-1.5 px-2 rounded-lg transition text-center border border-slate-700/70"
                >
                  💬 Zalo KTS
                </button>
                <button
                  onClick={() => setShowDonate(true)}
                  className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold py-1.5 px-2 rounded-lg transition text-center border border-rose-500/25"
                >
                  ❤️ Donate
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setShowZalo(true)}
                className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 flex items-center justify-center text-xs"
                title="Zalo Hỗ Trợ Hoàn Phạm"
              >
                💬
              </button>
              <button
                onClick={() => setShowDonate(true)}
                className="w-9 h-9 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 flex items-center justify-center text-xs"
                title="Ủng hộ tác giả"
              >
                ❤️
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* --- Main Studio Workspace Container --- */}
      <div
        className={`flex-grow flex flex-col min-w-0 transition-all duration-300 ${
          sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-60'
        }`}
      >
        {/* Top Studio Header Bar */}
        <header className="h-14 border-b border-slate-800/80 studio-dock px-4 flex items-center justify-between sticky top-0 z-30 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden text-slate-300 hover:text-white p-1.5 rounded-lg bg-slate-800/80"
            >
              <Icon name="sidebar" className="w-5 h-5" />
            </button>

            {/* Quick Render Mode Switcher Pills in Top Bar */}
            <div className="hidden lg:flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800">
              {(['exterior', 'interior', 'floorplan'] as const).map((tabId) => {
                const info = navItems.find((n) => n.id === tabId)!;
                const active = activeTab === tabId;
                return (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      active
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <Icon name={info.icon} className="w-3.5 h-3.5" />
                    <span>{info.short}</span>
                  </button>
                );
              })}
            </div>

            <div className="truncate">
              <h2 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2 truncate">
                <span className="text-amber-400 font-orbitron tracking-wide hidden xl:inline">96 ARCH AI</span>
                <span className="text-slate-700 hidden xl:inline">/</span>
                <span className="truncate">{currentTabInfo.label}</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ModelSelector currentModel={selectedModel} onSelectModel={handleModelChange} />

            <button
              onClick={() => setShowApiKeyModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                apiKeySet
                  ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-slate-200'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 animate-pulse'
              }`}
              title="Cài đặt & Kiểm tra Gemini API Key"
            >
              <span className={`w-2 h-2 rounded-full ${apiKeySet ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <span className="hidden sm:inline">{apiKeySet ? 'API Ready' : 'Nhập API Key'}</span>
              <span>🔑</span>
            </button>

            <button
              onClick={() => setShowWelcomePro(true)}
              className="bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-indigo-300 p-1.5 rounded-xl transition hidden sm:flex items-center justify-center"
              title="Thông tin phiên bản PRO 3.1"
            >
              <Icon name="info" className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowDonate(true)}
              className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              <Icon name="heart" className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Ủng Hộ</span>
            </button>
          </div>
        </header>

        {/* --- Main Fullscreen Studio Content Area --- */}
        <main className="flex-grow p-3 md:p-4 w-full max-w-[1920px] mx-auto flex flex-col">
          {/* RENDER STUDIO WORKSPACE (EXTERIOR / INTERIOR / FLOORPLAN) */}
          {['exterior', 'interior', 'floorplan'].includes(activeTab) && (
            <div className="flex flex-col lg:flex-row gap-4 flex-grow h-full min-h-[calc(100vh-5.2rem)]">
              {/* Left Control Dock */}
              <div className="w-full lg:w-[390px] xl:w-[420px] flex-shrink-0 flex flex-col gap-3.5 lg:max-h-[calc(100vh-5.2rem)] lg:overflow-y-auto pr-0.5">
                {/* Mobile/Tablet Sub-tab Switcher */}
                <div className="flex lg:hidden items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                  {(['exterior', 'interior', 'floorplan'] as const).map((tabId) => {
                    const info = navItems.find((n) => n.id === tabId)!;
                    return (
                      <button
                        key={tabId}
                        onClick={() => setActiveTab(tabId)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          activeTab === tabId ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'
                        }`}
                      >
                        <Icon name={info.icon} className="w-3.5 h-3.5" />
                        <span>{info.short}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Primary Input Card */}
                <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-xl">
                  {/* Source Upload */}
                  <ImageUpload
                    sourceImage={sourceImage}
                    onImageUpload={handleImageUpload}
                    onRemove={() => setSourceImage(null)}
                    label={
                      activeTab === 'floorplan'
                        ? '1. Bản Vẽ Mặt Bằng 2D / CAD Floorplan'
                        : activeTab === 'interior'
                        ? '1. Ảnh Sketch / Phối Cảnh Thô Nội Thất'
                        : '1. Ảnh Sketch / Khối 3D Ngoại Thất'
                    }
                  />

                  {/* Style Reference Upload */}
                  <ReferenceImageUpload
                    image={referenceImage}
                    onUpload={setReferenceImage}
                    onRemove={() => setReferenceImage(null)}
                    onExtractPrompt={() => handleExtractPromptFromReference()}
                    isExtractingPrompt={isBuildingRefPrompt}
                    onOpenBuilder={() => setActiveTab('magic-prompt')}
                  />

                  {/* Aspect Ratio & Resolution Controls */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tỷ Lệ Khung Hình (Aspect Ratio)
                        </label>
                        <span className="text-[10px] font-mono text-indigo-400 font-bold">{aspectRatio}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {aspectRatios.map((r) => {
                          const active = aspectRatio === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setAspectRatio(r.id)}
                              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-[10px] font-bold transition ${
                                active
                                  ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-sm'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <div
                                className={`${r.w} ${r.h} border rounded-[2px] mb-1 ${
                                  active ? 'border-indigo-400 bg-indigo-400/30' : 'border-slate-500'
                                }`}
                              />
                              <span className="font-mono">{r.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/70">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Chất Lượng Ảnh
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                          {(['1K', '2K', '4K'] as ImageResolution[]).map((res) => (
                            <button
                              key={res}
                              onClick={() => setResolution(res)}
                              className={`py-1 rounded-md text-[10px] font-mono font-bold transition ${
                                resolution === res
                                  ? 'bg-indigo-600 text-white shadow'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Số Phương Án
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                          {[1, 2, 4].map((num) => (
                            <button
                              key={num}
                              onClick={() => setGenerationCount(num)}
                              className={`py-1 rounded-md text-[10px] font-mono font-bold transition ${
                                generationCount === num
                                  ? 'bg-indigo-600 text-white shadow'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {num} ảnh
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floorplan Selectors */}
                  {activeTab === 'floorplan' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Loại Không Gian</label>
                        <select
                          value={roomType}
                          onChange={(e) => setRoomType(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                        >
                          {roomTypeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Phong Cách</label>
                        <select
                          value={roomStyle}
                          onChange={(e) => setRoomStyle(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                        >
                          {roomStyleOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Quick Style Presets for Exterior & Interior */}
                  {activeTab !== 'floorplan' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Gợi Ý Phong Cách Kiến Trúc ({activeTab === 'exterior' ? 'Ngoại Thất' : 'Nội Thất'})
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(activeTab === 'exterior' ? exteriorPresets : interiorPresets).map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (activeTab === 'exterior') setExteriorPrompt(preset.value);
                              else setInteriorPrompt(preset.value);
                            }}
                            className="bg-slate-950/70 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/50 px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-300 hover:text-white text-left transition truncate"
                            title={preset.value}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prompt Input with AI Vision Auto-Describe Button */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Prompt Chỉ Dẫn Kiến Trúc & Vật Liệu
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab('magic-prompt')}
                          className="text-[10px] font-bold bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md transition flex items-center gap-1"
                          title="Mở công cụ Xây Dựng Prompt Nội Thất Từ Ảnh Tham Chiếu (Bóc tách 5 lớp)"
                        >
                          <Icon name="sparkles" className="w-3 h-3" />
                          <span>Prompt Từ Ảnh Mẫu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnalyzeSourceImage()}
                          disabled={!sourceImage || isGeneratingDesc}
                          className="text-[10px] font-bold bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md transition flex items-center gap-1 disabled:opacity-40"
                          title="Dùng Gemini Vision tự động phân tích ảnh gốc và viết Prompt"
                        >
                          <Icon name="wand" className="w-3 h-3" />
                          <span>{isGeneratingDesc ? 'Đang đọc...' : 'AI Đọc Ảnh Gốc'}</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={
                        activeTab === 'exterior'
                          ? exteriorPrompt
                          : activeTab === 'interior'
                          ? interiorPrompt
                          : floorplanPrompt
                      }
                      onChange={(e) => {
                        if (activeTab === 'exterior') setExteriorPrompt(e.target.value);
                        else if (activeTab === 'interior') setInteriorPrompt(e.target.value);
                        else setFloorplanPrompt(e.target.value);
                      }}
                      placeholder="Mô tả chi tiết phong cách, vật liệu (đá marble, gỗ óc chó, kính), ánh sáng..."
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {/* Primary Render CTA Button */}
                  <button
                    onClick={() => {
                      if (activeTab === 'floorplan') handleFloorplanGeneration();
                      else
                        handleGeneration(
                          activeTab === 'exterior' ? exteriorPrompt : interiorPrompt,
                          activeTab as 'exterior' | 'interior',
                          false
                        );
                    }}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-5 rounded-xl transition-all shadow-lg shadow-indigo-950/60 flex items-center justify-center gap-2 disabled:opacity-50 text-xs tracking-wide"
                  >
                    <Icon name="sparkles" className="w-4 h-4" />
                    <span>
                      {isLoading
                        ? `Đang Render ${generationCount} Phương Án (${resolution})...`
                        : `Bắt Đầu Render AI (${generationCount}x • ${resolution})`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Right Max-Canvas Viewport */}
              <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 shadow-2xl flex flex-col overflow-hidden min-h-[520px]">
                {/* Viewport Top Action Toolbar */}
                <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                    <span className="text-xs font-bold text-slate-200">Khung Hiển Thị Render Studio</span>
                    <span className="text-[10px] font-mono bg-slate-800/90 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-md">
                      {aspectRatio} • {resolution}
                    </span>
                  </div>

                  {/* Interactive Camera Angle Selector & Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {activeTab !== 'floorplan' && sourceImage && (
                      <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-0.5">
                        <select
                          value={anglePrompt}
                          onChange={(e) => setAnglePrompt(e.target.value)}
                          className="bg-transparent text-[11px] text-slate-300 px-2 py-1 focus:outline-none max-w-[190px] truncate"
                          title="Chọn góc máy camera muốn đổi"
                        >
                          {currentAngleList.map((ang, i) => (
                            <option key={i} value={ang} className="bg-slate-900 text-slate-200">
                              📷 {ang}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleGeneration(anglePrompt, activeTab as 'exterior' | 'interior', true)}
                          disabled={isLoading}
                          className="bg-indigo-600/80 hover:bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 disabled:opacity-40"
                          title="Render lại công trình từ góc máy đã chọn"
                        >
                          <Icon name="viewfinder" className="w-3.5 h-3.5" />
                          <span>Đổi Góc</span>
                        </button>
                      </div>
                    )}

                    {sourceDataUrl && selectedImage && (
                      <button
                        onClick={() => setCompareMode(!compareMode)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border ${
                          compareMode
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                            : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon name="arrows-right-left" className="w-3.5 h-3.5" />
                        <span>{compareMode ? 'Tắt So Sánh' : 'Trước / Sau'}</span>
                      </button>
                    )}

                    {selectedImage && (
                      <>
                        <button
                          onClick={() => setIsStudioCameraRawOpen(true)}
                          className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                          title="Chỉnh màu & ánh sáng Camera Raw"
                        >
                          <Icon name="adjustments-horizontal" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Camera Raw</span>
                        </button>

                        <button
                          onClick={() => sendDataUrlToEditor(selectedImage)}
                          className="bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-200 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <Icon name="brush" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Sửa Inpaint</span>
                        </button>

                        <button
                          onClick={() => handleUpscale(selectedImageIndex, '2k')}
                          disabled={upscalingIndex !== null}
                          className="bg-slate-900 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 text-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-xl transition disabled:opacity-40"
                          title="Nâng cấp độ nét lên 2K"
                        >
                          {upscalingIndex === selectedImageIndex ? '⏳...' : '⚡ 2K'}
                        </button>

                        <button
                          onClick={() => handleUpscale(selectedImageIndex, '4k')}
                          disabled={upscalingIndex !== null}
                          className="bg-slate-900 hover:bg-indigo-600/30 border border-slate-700/80 hover:border-indigo-500/50 text-amber-300 text-xs font-bold px-2.5 py-1.5 rounded-xl transition disabled:opacity-40"
                          title="Nâng cấp độ nét lên 4K Ultra HD"
                        >
                          {upscalingIndex === selectedImageIndex ? '⏳...' : '🔥 4K'}
                        </button>

                        <button
                          onClick={() => setImageForFullscreen(selectedImage)}
                          className="bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white p-1.5 rounded-xl transition"
                          title="Xem Toàn Màn Hình"
                        >
                          <Icon name="arrows-pointing-out" className="w-4 h-4" />
                        </button>

                        <DownloadDropdown
                          imageUrl={selectedImage}
                          filenamePrefix={`96ARCH-${activeTab.toUpperCase()}-${selectedImageIndex + 1}`}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Center Max-Canvas Display */}
                <div className="flex-grow studio-canvas-bg relative flex items-center justify-center p-4 overflow-hidden">
                  {isLoading ? (
                    <div className="w-full h-full min-h-[380px] flex flex-col items-center justify-center bg-slate-950/60 rounded-2xl border border-indigo-500/20 animate-pulse-glow p-6 text-center">
                      <div className="relative mb-4">
                        <div className="w-14 h-14 rounded-full border-2 border-indigo-500/30"></div>
                        <div className="w-14 h-14 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin absolute inset-0"></div>
                      </div>
                      <p className="text-slate-100 font-bold text-sm">
                        Đang tổng hợp & kết xuất {generationCount} phương án {resolution}...
                      </p>
                      <p className="text-xs text-indigo-300 mt-1 font-mono">
                        Engine: {GEMINI_MODELS.find((m) => m.id === selectedModel)?.name} (
                        {GEMINI_MODELS.find((m) => m.id === selectedModel)?.codename})
                      </p>
                    </div>
                  ) : selectedImage ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      {upscalingIndex !== null && (
                        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center rounded-xl">
                          <div className="w-11 h-11 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mb-3"></div>
                          <p className="text-xs font-bold text-amber-300">
                            Đang tái tạo chi tiết vật liệu Ultra-HD (Upscaling)...
                          </p>
                        </div>
                      )}
                      {compareMode && sourceDataUrl ? (
                        <BeforeAfterSlider beforeUrl={sourceDataUrl} afterUrl={selectedImage} />
                      ) : (
                        <img
                          src={selectedImage}
                          alt="Render Result"
                          className="max-w-full max-h-[66vh] object-contain rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.75)] border border-slate-800/80"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-center max-w-md p-8">
                      <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-center mx-auto mb-4 text-indigo-400/60 shadow-inner">
                        <Icon name="sparkles" className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-bold text-slate-200">
                        Không Gian Hiển Thị Phối Cảnh 96 ARCH AI Studio
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        Tải lên ảnh phác thảo / 3D khối / mặt bằng 2D ở bảng điều khiển bên trái, chọn tỷ lệ khung hình & độ phân giải (1K/2K/4K) rồi bấm{' '}
                        <b className="text-indigo-400">Bắt Đầu Render AI</b>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom Filmstrip: Current Variations + Render History */}
                <div className="p-3 bg-slate-950/85 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Current Variations */}
                  <div className="flex items-center gap-2.5 overflow-x-auto max-w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">
                      Phương án ({generatedImages.length}):
                    </span>
                    {isLoading ? (
                      Array.from({ length: generationCount }).map((_, idx) => (
                        <div
                          key={idx}
                          className="w-16 h-12 bg-slate-900 rounded-lg animate-pulse border border-slate-800 flex-shrink-0"
                        />
                      ))
                    ) : generatedImages.length > 0 ? (
                      generatedImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImageIndex(idx)}
                          className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                            selectedImageIndex === idx
                              ? 'border-indigo-500 glow-active scale-105'
                              : 'border-slate-800 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img src={img} alt={`Phương án ${idx + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 bg-black/75 text-[9px] text-white px-1 font-mono">
                            #{idx + 1}
                          </span>
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-600 italic">Chưa có phương án đang chọn</span>
                    )}
                  </div>

                  {/* Quick History Reel */}
                  <div className="flex items-center gap-2 overflow-x-auto max-w-full sm:ml-auto">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                      <Icon name="clock" className="w-3.5 h-3.5 text-indigo-400" />
                      Lịch sử ({currentHistory.length}):
                    </span>
                    {currentHistory.length > 0 ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          {currentHistory.slice(0, 8).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setGeneratedImages(item.images);
                                setSelectedImageIndex(0);
                              }}
                              title={`${item.timestamp} - ${item.prompt}`}
                              className="relative w-12 h-10 rounded-lg overflow-hidden border border-slate-800 hover:border-indigo-500 transition flex-shrink-0 group"
                            >
                              <img src={item.images[0]} alt="History" className="w-full h-full object-cover" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/75 text-[8px] text-slate-300 truncate px-0.5">
                                {item.timestamp}
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            if (activeTab === 'exterior') setExteriorHistory([]);
                            else if (activeTab === 'interior') setInteriorHistory([]);
                            else setFloorplanHistory([]);
                          }}
                          className="text-slate-500 hover:text-red-400 p-1 transition flex-shrink-0"
                          title="Xóa lịch sử tab này"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-600">Trống</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OTHER STUDIO TABS */}
          {activeTab === 'edit' && (
            <ImageEditor
              initialImage={imageForEditing}
              onClearInitialImage={() => setImageForEditing(null)}
              onEditComplete={(details) => {
                const item: EditHistoryItem = {
                  id: Date.now(),
                  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                  sourceImage: details.sourceImage,
                  maskImage: details.maskImage,
                  prompt: details.prompt,
                  resultImage: details.resultImage
                };
                setEditHistory((prev) => [item, ...prev]);
              }}
              historyItemToRestore={editHistoryItemToRestore}
              onHistoryRestored={() => setEditHistoryItemToRestore(null)}
              editHistory={editHistory}
              onClearEditHistory={() => setEditHistory([])}
            />
          )}

          {activeTab === 'magic-prompt' && (
            <MagicPromptTab
              onEditRequest={sendDataUrlToEditor}
              initialReferenceImage={referenceImage}
              onApplyPromptToStudio={(builtPrompt, refImg) => {
                setReferenceImage(refImg);
                setInteriorPrompt(builtPrompt);
                setActiveTab('interior');
              }}
            />
          )}
          {activeTab === 'utilities' && <UtilitiesTab onEditRequest={sendDataUrlToEditor} />}
          {activeTab === 'virtual-tour' && <VirtualTourTab onEditRequest={sendDataUrlToEditor} />}
        </main>
      </div>

      {/* Modals */}
      {showApiKeyModal && (
        <ApiKeyModal onClose={() => setShowApiKeyModal(false)} onSaved={() => setApiKeySet(!!getApiKey())} />
      )}
      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      {showZalo && <ZaloModal onClose={() => setShowZalo(false)} />}
      {showWelcomePro && (
        <StudioWelcomeModal
          onClose={() => setShowWelcomePro(false)}
          onOpenZalo={() => setShowZalo(true)}
          onOpenDonate={() => setShowDonate(true)}
        />
      )}
      {imageForFullscreen && (
        <ImageViewerModal imageUrl={imageForFullscreen} onClose={() => setImageForFullscreen(null)} />
      )}
      {upscaledImageForModal && (
        <UpscaleModal imageUrl={upscaledImageForModal} onClose={() => setUpscaledImageForModal(null)} />
      )}
      {isStudioCameraRawOpen && selectedImage && (
        <CameraRawEditor
          image={dataUrlToSourceImage(selectedImage)!}
          onClose={() => setIsStudioCameraRawOpen(false)}
          onSave={(edited) => {
            const updated = [...generatedImages];
            updated[selectedImageIndex] = `data:${edited.mimeType};base64,${edited.base64}`;
            setGeneratedImages(updated);
            setIsStudioCameraRawOpen(false);
          }}
        />
      )}
    </div>
  );
}
