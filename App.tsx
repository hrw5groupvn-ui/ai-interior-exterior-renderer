import React, { useState, useCallback, useEffect } from 'react';
import type { RenderHistoryItem, SourceImage, EditHistoryItem } from './types';
import { generateImages, upscaleImage, describeInteriorImage } from './services/geminiService';
import { Icon } from './components/icons';
import { DownloadDropdown } from './components/DownloadDropdown';
import { ImageEditor } from './components/ImageEditor';
import { UtilitiesTab } from './components/UtilitiesTab';
import { MagicPromptTab } from './components/MagicPromptTab';
import { VirtualTourTab } from './components/VirtualTourTab';

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
      className="relative w-full h-full min-h-[350px] md:min-h-[480px] select-none overflow-hidden rounded-xl cursor-ew-resize border border-slate-700/60 shadow-inner"
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    >
      {/* After Image (Full width background) */}
      <img src={afterUrl} alt="Render AI" className="absolute inset-0 w-full h-full object-contain bg-slate-950" />
      <span className="absolute top-3 right-3 bg-indigo-600/90 text-white font-bold text-xs px-2.5 py-1 rounded-md shadow backdrop-blur-sm z-10">
        AI Render
      </span>

      {/* Before Image (Clipped overlay) */}
      <div 
        className="absolute inset-0 overflow-hidden border-r-2 border-indigo-400 shadow-2xl"
        style={{ width: `${sliderPosition}%` }}
      >
        <img 
          src={beforeUrl} 
          alt="Ảnh Phác Thảo Ban Đầu" 
          className="absolute inset-0 w-full h-full object-contain bg-slate-950 max-w-none" 
          style={{ width: '100%', height: '100%' }}
        />
        <span className="absolute top-3 left-3 bg-slate-800/90 text-slate-200 font-bold text-xs px-2.5 py-1 rounded-md shadow backdrop-blur-sm z-10">
          Ảnh Gốc Phác Thảo
        </span>
      </div>

      {/* Slider Handle Divider */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20 flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-600 border-2 border-white text-white flex items-center justify-center shadow-lg transform -translate-x-1/2 hover:scale-110 transition-transform">
          <Icon name="arrows-right-left" className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; icon?: string }> = ({ title, children, icon }) => (
  <div className="glass-panel p-5 rounded-2xl shadow-xl border border-slate-800 transition-all duration-300">
    <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
      {icon && <Icon name={icon} className="w-5 h-5 text-indigo-400" />}
      {title}
    </h2>
    {children}
  </div>
);

const ImageUpload: React.FC<{
  sourceImage: SourceImage | null;
  onImageUpload: (image: SourceImage) => void;
  onRemove: () => void;
  label?: string;
  sublabel?: string;
}> = ({ sourceImage, onImageUpload, onRemove, label = "Tải Lên Ảnh Phác Thảo / Floorplan", sublabel = "Kéo thả hoặc nhấp để chọn tệp (PNG, JPG, WEBP)" }) => {
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
        alert("Vui lòng tải lên tệp ảnh hợp lệ (PNG, JPG, WEBP).");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); }}
        className={`relative group border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center min-h-[160px] transition-all cursor-pointer ${
          isDraggingOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-800/40'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        {sourceImage ? (
          <div className="relative w-full h-40 flex items-center justify-center">
            <img src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`} alt="Source" className="max-h-full max-w-full object-contain rounded-lg shadow-md" />
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute top-1 right-1 bg-red-600/90 text-white rounded-full p-1 hover:bg-red-700 transition shadow"
                title="Xóa ảnh"
            >
                <Icon name="x-circle" className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="text-center p-3 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-indigo-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
              <Icon name="photo" className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-300">{label}</p>
            <p className="text-xs text-slate-500 mt-1">{sublabel}</p>
          </div>
        )}
      </div>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
    </div>
  );
};

const ReferenceImageUpload: React.FC<{
  image: SourceImage | null;
  onUpload: (image: SourceImage) => void;
  onRemove: () => void;
}> = ({ image, onUpload, onRemove }) => {
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
      <div className="relative group border border-slate-700 rounded-xl overflow-hidden">
        <img src={`data:${image.mimeType};base64,${image.base64}`} alt="Reference" className="w-full h-36 object-cover" />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 bg-red-600/90 rounded-full text-white p-1 hover:bg-red-700 transition"
        >
          <Icon name="x-circle" className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-3 text-xs text-slate-400 hover:text-slate-200 bg-slate-900/30 hover:bg-slate-800/40 transition flex items-center justify-center gap-2"
      >
        <Icon name="photo" className="w-4 h-4 text-indigo-400" />
        <span>+ Thêm ảnh tham khảo phong cách (Tone/Mood)</span>
      </button>
      <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} className="hidden" accept="image/*" />
    </div>
  );
};

const ResultDisplay: React.FC<{
  expectedCount?: number;
  sourceImage?: SourceImage | null;
  images: string[];
  isLoading: boolean;
  onUpscale: (index: number, target: '2k' | '4k') => void;
  upscalingIndex: number | null;
  onEditRequest: (image: string) => void;
  selectedImageIndex: number;
  onSelectImageIndex: (index: number) => void;
  onChangeAngle: (index: number) => void;
  onFullscreen: (index: number) => void;
  showChangeAngleButton: boolean;
}> = ({ expectedCount = 4, sourceImage, images, isLoading, onUpscale, upscalingIndex, onEditRequest, selectedImageIndex, onSelectImageIndex, onChangeAngle, onFullscreen, showChangeAngleButton }) => {
  const selectedImage = images[selectedImageIndex];
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    setCompareMode(false);
  }, [selectedImage]);

  const sourceDataUrl = sourceImage ? `data:${sourceImage.mimeType};base64,${sourceImage.base64}` : null;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-2xl h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-indigo-400" />
            Kết Quả AI Render
          </h2>
          <p className="text-xs text-slate-500">Xem trước & xuất ảnh độ phân giải cao</p>
        </div>
        
        <div className="flex items-center gap-2">
          {sourceDataUrl && selectedImage && (
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                compareMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon name="arrows-right-left" className="w-4 h-4" />
              {compareMode ? 'Tắt So Sánh' : '↔️ So Sánh Trước/Sau'}
            </button>
          )}
          {images.length > 0 && <span className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded-full text-slate-400">{images.length} ảnh</span>}
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-grow flex items-center justify-center bg-slate-950/60 rounded-xl mb-4 p-2 min-h-[350px] md:min-h-[460px] relative border border-slate-800">
        {isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/50 rounded-xl animate-pulse-glow">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
            <p className="text-slate-200 font-semibold">Đang tổng hợp & render {expectedCount} phương án AI...</p>
            <p className="text-xs text-slate-500 mt-1">Sử dụng mô hình Gemini 3.1 Flash Architectural Renderer</p>
          </div>
        ) : selectedImage ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            {compareMode && sourceDataUrl ? (
              <BeforeAfterSlider beforeUrl={sourceDataUrl} afterUrl={selectedImage} />
            ) : (
              <img src={selectedImage} alt="Render Result" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            )}

            {/* Action Bar Overlay */}
            <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
              <button
                onClick={() => onFullscreen(selectedImageIndex)}
                className="bg-slate-900/90 border border-slate-700 text-white p-2 rounded-lg hover:bg-indigo-600 transition"
                title="Xem Toàn Màn Hình"
              >
                <Icon name="arrows-pointing-out" className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEditRequest(selectedImage)}
                className="bg-indigo-600/90 border border-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-lg"
              >
                <Icon name="pencil" className="w-3.5 h-3.5" />
                Sửa Trong Canvas
              </button>
              {showChangeAngleButton && (
                <button
                  onClick={() => onChangeAngle(selectedImageIndex)}
                  className="bg-slate-900/90 border border-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition flex items-center gap-1.5"
                >
                  <Icon name="viewfinder" className="w-3.5 h-3.5 text-indigo-400" />
                  Đổi Góc
                </button>
              )}
              <DownloadDropdown imageUrl={selectedImage} filenamePrefix={`CID-AI-Render-${selectedImageIndex}`} />
            </div>

            {/* Upscale Badge */}
            {upscalingIndex === null && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
                <button
                  onClick={() => onUpscale(selectedImageIndex, '2k')}
                  className="bg-slate-900/90 border border-slate-700 hover:border-indigo-500 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  ⚡ Upscale 2K
                </button>
                <button
                  onClick={() => onUpscale(selectedImageIndex, '4k')}
                  className="bg-slate-900/90 border border-slate-700 hover:border-indigo-500 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  🔥 Upscale 4K
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 text-slate-500">
            <Icon name="sparkles" className="w-12 h-12 mx-auto mb-3 text-slate-700" />
            <p className="text-sm font-medium text-slate-400">Hình ảnh phối cảnh AI sẽ xuất hiện tại đây</p>
            <p className="text-xs mt-1 text-slate-600">Tải lên bản phác thảo & bấm nút Bắt Đầu Render để khởi tạo</p>
          </div>
        )}
      </div>

      {/* Thumbnails Reel */}
      <div className="grid grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: expectedCount }).map((_, index) => (
            <div key={index} className="aspect-square bg-slate-900/60 rounded-xl animate-pulse border border-slate-800"></div>
          ))
        ) : (
          images.map((image, index) => (
            <div
              key={index}
              className={`relative aspect-square bg-slate-900 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 border ${
                selectedImageIndex === index ? 'border-indigo-500 glow-active scale-95' : 'border-slate-800 opacity-60 hover:opacity-100'
              }`}
              onClick={() => onSelectImageIndex(index)}
            >
              <img src={image} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const HistoryPanel: React.FC<{ 
    history: RenderHistoryItem[]; 
    onClear: () => void; 
    onSelect: (item: RenderHistoryItem) => void;
    title: string;
}> = ({ history, onClear, onSelect, title }) => {
  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 shadow-xl">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Icon name="clock" className="w-4 h-4 text-indigo-400" />
          {title}
        </h2>
        {history.length > 0 &&
            <button onClick={onClear} className="text-red-400 hover:text-red-300 text-xs font-medium flex items-center gap-1">
                <Icon name="trash" className="w-3.5 h-3.5" /> Xóa
            </button>
        }
      </div>
      {history.length > 0 ? (
        <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {history.map((item) => (
            <li key={item.id} 
                className="flex items-center gap-3 bg-slate-900/40 border border-slate-800/80 p-2 rounded-xl hover:bg-slate-800/60 cursor-pointer transition"
                onClick={() => onSelect(item)}
            >
              <img src={item.images[0]} alt="History thumbnail" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
              <div className="flex-grow min-w-0">
                <p className="font-semibold text-xs text-slate-200">{item.images.length} ảnh phương án</p>
                <p className="text-[11px] text-slate-400 truncate">{item.prompt}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{item.timestamp}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 text-center py-4">Chưa có lịch sử render.</p>
      )}
    </div>
  );
};

const ImageViewerModal: React.FC<{ imageUrl: string; onClose: () => void; }> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition shadow-lg z-10"
        >
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="p-3 flex-grow overflow-auto flex items-center justify-center">
            <img src={imageUrl} alt="Fullscreen" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      </div>
    </div>
  );
};

const UpscaleModal: React.FC<{ imageUrl: string; onClose: () => void; }> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl max-h-[90vh] flex flex-col relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition z-10"
        >
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="p-4 overflow-auto">
            <img src={imageUrl} alt="Upscaled result" className="w-full h-auto object-contain rounded-xl" />
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-center">
          <a
            href={imageUrl}
            download={`CID-AI-upscaled-${Date.now()}.png`}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition flex items-center gap-2 shadow-lg"
          >
            <Icon name="download" className="w-5 h-5" />
            Tải Về Ảnh Upscaled
          </a>
        </div>
      </div>
    </div>
  );
};

const ZaloModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full relative shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-white transition z-10">
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-20 w-full relative">
           <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 border-slate-900 bg-slate-800 overflow-hidden shadow-lg">
             <img src="https://ui-avatars.com/api/?name=Vũ+Hoàng+Anh&background=0D8ABC&color=fff&size=128" alt="Avatar" className="w-full h-full object-cover" />
           </div>
        </div>
        <div className="pt-12 pb-6 px-6 text-center">
          <h3 className="text-lg font-bold text-slate-100">Vũ Hoàng Anh</h3>
          <p className="text-slate-400 text-xs mb-4">Hỗ trợ kỹ thuật & Tư vấn CID AI</p>
          <div className="border border-slate-800 p-2 rounded-xl inline-block mb-3 bg-slate-950">
             <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://zalo.me/090" alt="Zalo QR Code" className="w-40 h-40 object-cover rounded-lg" onError={(e) => {
                 e.currentTarget.src = "https://via.placeholder.com/180?text=Zalo+QR";
             }} />
          </div>
          <p className="text-slate-500 text-xs flex items-center justify-center gap-1">
             Quét QR bằng Zalo để kết bạn tư vấn
          </p>
        </div>
      </div>
    </div>
  );
};

const DonateModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-white transition">
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-rose-500/20">
            <Icon name="heart" className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-100">Ủng Hộ Tác Giả</h3>
          <p className="text-slate-400 text-xs mt-1">Tiếp sức phát triển CID AI Render Studio</p>
        </div>
        
        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 mb-4 text-left">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase">Ngân hàng</p>
              <p className="text-sm font-bold text-emerald-400">Techcombank</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase">Số tài khoản</p>
              <p className="text-xl font-mono font-bold text-white tracking-wider">5060396868</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium uppercase">Chủ tài khoản</p>
              <p className="text-sm font-bold text-slate-200 uppercase">Vũ Hoàng Anh</p>
            </div>
          </div>
        </div>
        
        <div className="text-center">
           <img src="https://img.vietqr.io/image/techcombank-5060396868-compact.png?accountName=VU%20HOANG%20ANH" alt="QR Code" className="w-40 h-40 object-cover rounded-xl mx-auto border border-slate-800 bg-white" onError={(e) => {
             e.currentTarget.src = "https://via.placeholder.com/180?text=QR+Code";
           }} />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'exterior' | 'interior' | 'floorplan' | 'edit' | 'utilities' | 'virtual-tour' | 'magic-prompt'>('exterior');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [showDonate, setShowDonate] = useState(false);
  const [showZalo, setShowZalo] = useState(false);
  const [imageForEditing, setImageForEditing] = useState<SourceImage | null>(null);
  const [editHistoryItemToRestore, setEditHistoryItemToRestore] = useState<EditHistoryItem | null>(null);

  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
  const [generationCount, setGenerationCount] = useState(4);
  const [referenceImage, setReferenceImage] = useState<SourceImage | null>(null);

  // Exterior prompts
  const [exteriorPrompt, setExteriorPrompt] = useState('a modern architectural villa, photorealistic, cinematic lighting, 8k');
  const stylePresets = [
    { label: "✨ Tối Giản Luxury", value: "biệt thự hiện đại phong cách tối giản luxury, mặt tiền ốp đá marble xám, cửa kính tấm lớn tràn viền, hồ bơi vô cực" },
    { label: "🌿 Japandi Mộc Mạc", value: "kiến trúc Japandi kết hợp gỗ tuyết tùng, mái xéo nhẹ, sân vườn thiền tông Nhật Bản với rêu và sỏi trắng" },
    { label: "🏛️ Tân Cổ Điển", value: "phối cảnh biệt thự tân cổ điển Pháp, phào chỉ vòm cong tinh tế, cổng nhôm đúc mạ vàng, ban công sắt mỹ thuật" },
    { label: "🏝️ Tropical Villa", value: "villa nghỉ dưỡng Tropical hiện đại, dầm gỗ vươn xa, mảng xanh cây nhiệt đới bao phủ ban công" }
  ];

  // Interior prompts
  const [interiorPrompt, setInteriorPrompt] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // Floorplan state
  const [floorplanPrompt, setFloorplanPrompt] = useState('Biến bản floorplan này thành ảnh render 3d nội thất.');
  const [roomType, setRoomType] = useState('Phòng khách');
  const [roomStyle, setRoomStyle] = useState('Hiện đại');
  const roomTypeOptions = ['Phòng khách', 'Phòng ngủ', 'Nhà bếp', 'Phòng tắm / WC', 'Ban công', 'Phòng làm việc', 'Phòng ăn'];
  const roomStyleOptions = ['Hiện đại', 'Tân cổ điển', 'Wabi-sabi', 'Tối giản (Minimalism)', 'Scandinavian', 'Indochine', 'Industrial'];

  const exteriorAngleOptions = [
    "Góc chụp trực diện toàn cảnh mặt tiền căn nhà",
    "Góc chụp 3/4 bên trái, thể hiện cả mặt tiền và hông nhà",
    "Góc chụp 3/4 bên phải, lấy được chiều sâu công trình",
    "Góc chụp từ trên cao nhìn xuống (drone view) toàn cảnh khuôn viên",
    "Góc chụp cận cảnh chi tiết cửa chính và vật liệu mặt tiền"
  ];

  const interiorAngleOptions = [
    "Ảnh chụp thực tế góc 3/4 bao quát toàn bộ căn phòng",
    "Ảnh chụp thực tế góc chính diện thẳng vào trung tâm phòng",
    "Ảnh chụp thực tế khu vực sofa và bàn trà từ góc nhìn ngang",
    "Ảnh chụp thực tế cận cảnh đèn chùm pha lê hoặc đèn thả trần"
  ];

  const angleOptions = activeTab === 'interior' ? interiorAngleOptions : exteriorAngleOptions;
  const [anglePrompt, setAnglePrompt] = useState(angleOptions[0]);

  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

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
    return history.filter(item => item.id > sevenDaysAgo);
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
      console.error("Failed to load local storage history", e);
    }
  }, []);

  useEffect(() => { safeSetStorage('exteriorRenderHistory', exteriorHistory); }, [exteriorHistory]);
  useEffect(() => { safeSetStorage('interiorRenderHistory', interiorHistory); }, [interiorHistory]);
  useEffect(() => { safeSetStorage('floorplanHistory', floorplanHistory); }, [floorplanHistory]);
  useEffect(() => { safeSetStorage('editHistory', editHistory); }, [editHistory]);

  useEffect(() => {
    if (activeTab === 'floorplan') {
        const basePrompt = 'Biến bản floorplan này thành ảnh render 3d nội thất';
        setFloorplanPrompt(`${basePrompt}. Loại phòng: ${roomType}. Phong cách: ${roomStyle}.`);
    }
  }, [roomType, roomStyle, activeTab]);

  const handleImageUpload = async (image: SourceImage) => {
    setSourceImage(image);
    if (activeTab === 'interior') {
        setIsGeneratingDesc(true);
        setInteriorPrompt('');
        try {
            const description = await describeInteriorImage(image);
            setInteriorPrompt(`tạo ảnh chụp thực tế ${description}`);
        } catch (error) {
            console.error(error);
        } finally {
            setIsGeneratingDesc(false);
        }
    }
  };

  const handleGeneration = useCallback(async (prompt: string, renderType: 'exterior' | 'interior', isAnglePrompt: boolean) => {
    if (!sourceImage || !prompt) {
      alert("Vui lòng tải lên ảnh nguồn và nhập prompt chỉ dẫn.");
      return;
    }
    setIsLoading(true);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    try {
      const refImage = isAnglePrompt ? null : referenceImage;
      const images = await generateImages(sourceImage, prompt, renderType, generationCount, refImage, isAnglePrompt);
      setGeneratedImages(images);
      
      const newHistoryItem: RenderHistoryItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        images: images,
        prompt: prompt,
      };
      const historySetter = renderType === 'exterior' ? setExteriorHistory : setInteriorHistory;
      historySetter(prev => [newHistoryItem, ...prev]);
    } catch (error) {
      console.error(error);
      alert("Xảy ra lỗi trong quá trình render AI. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, [sourceImage, referenceImage, generationCount]);

  const handleFloorplanGeneration = useCallback(async () => {
    if (!sourceImage) {
      alert("Vui lòng tải lên ảnh floorplan 2D.");
      return;
    }
    setIsLoading(true);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    try {
      const images = await generateImages(sourceImage, floorplanPrompt, 'floorplan', generationCount, null, false);
      setGeneratedImages(images);
      const newHistoryItem: RenderHistoryItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        images: images,
        prompt: floorplanPrompt,
      };
      setFloorplanHistory(prev => [newHistoryItem, ...prev]);
    } catch (error) {
      console.error(error);
      alert("Lỗi render floorplan 3D. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }, [sourceImage, floorplanPrompt, generationCount]);

  const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
        return { mimeType: match[1], base64: match[2] };
    }
    return null;
  }

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
      } catch (error) {
          console.error(error);
      } finally {
          setUpscalingIndex(null);
      }
  };

  const navItems = [
    { id: 'exterior', label: 'Render Ngoại Thất', icon: 'building-office', desc: 'Chuyển phác thảo ngoại thất thành 3D' },
    { id: 'interior', label: 'Render Nội Thất', icon: 'home', desc: 'Chuyển phác thảo nội thất thành 3D' },
    { id: 'floorplan', label: 'Mặt Bằng 2D ➔ 3D', icon: 'cube', desc: 'Dựng phối cảnh 3D từ bản vẽ mặt bằng' },
    { id: 'edit', label: 'Canvas Inpainting', icon: 'brush', desc: 'Khoanh vùng & chỉnh sửa nội thất bằng AI' },
    { id: 'magic-prompt', label: 'Magic Prompts', icon: 'wand', desc: 'Sinh 20 prompt nhiếp ảnh kiến trúc' },
    { id: 'utilities', label: 'Bộ Công Cụ AI', icon: 'sparkles', desc: 'Upscale 4K, Phân tích & Xuất PDF' },
    { id: 'virtual-tour', label: 'Virtual Tour 360', icon: 'camera-rotate', desc: 'Góc nhìn Panorama 360 không gian' },
  ];

  const currentTabInfo = navItems.find(item => item.id === activeTab) || navItems[0];

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* --- Sidebar Navigation (Web App Shell) --- */}
      <aside className={`fixed top-0 bottom-0 left-0 z-40 bg-slate-900/90 backdrop-blur-xl border-r border-slate-800 transition-all duration-300 flex flex-col ${
        sidebarCollapsed ? 'w-20' : 'w-72'
      } hidden md:flex`}>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Icon name="cube" className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white font-orbitron">CID ARCH AI</h1>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  PRO 3.1
                </span>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mx-auto">
              <Icon name="cube" className="w-6 h-6 text-white" />
            </div>
          )}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <Icon name={sidebarCollapsed ? "chevron-right" : "chevron-left"} className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-grow p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id || (['exterior', 'interior', 'floorplan'].includes(activeTab) && ['exterior', 'interior', 'floorplan'].includes(item.id));
            const isExactActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                  isExactActive 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-900/30 glow-active'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon name={item.icon} className={`w-5 h-5 flex-shrink-0 ${isExactActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                {!sidebarCollapsed && (
                  <div className="text-left min-w-0">
                    <p className="truncate leading-tight">{item.label}</p>
                    <p className="text-[10px] text-slate-400 font-normal truncate opacity-70 mt-0.5">{item.desc}</p>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Support Quick Links */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Gemini 3.1 Flash
              </span>
              <span className="text-[10px] text-slate-500 font-mono">v1.20</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowZalo(true)}
                className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-1.5 px-2 rounded-lg transition text-center"
              >
                💬 Zalo Hỗ Trợ
              </button>
              <button
                onClick={() => setShowDonate(true)}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-semibold py-1.5 px-2 rounded-lg transition text-center border border-rose-500/20"
              >
                ❤️ Donate
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* --- Main App Container --- */}
      <div className={`flex-grow flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'
      }`}>
        
        {/* Top Bar Header */}
        <header className="h-16 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
            >
              <Icon name="sidebar" className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {currentTabInfo.label}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">{currentTabInfo.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/60 border border-slate-700 px-3 py-1 rounded-full text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              API Status: Ready
            </div>
            
            <button
              onClick={() => setShowDonate(true)}
              className="bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-md hover:opacity-90 transition flex items-center gap-1.5"
            >
              <Icon name="heart" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ủng Hộ</span>
            </button>
          </div>
        </header>

        {/* --- Main Content Viewport --- */}
        <main className="flex-grow p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">

          {/* RENDER STUDIO TAB GROUP */}
          {['exterior', 'interior', 'floorplan'].includes(activeTab) && (
            <div className="space-y-6">
              {/* Sub-tab Switcher Pills */}
              <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 w-fit">
                <button
                  onClick={() => setActiveTab('exterior')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'exterior' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon name="building-office" className="w-4 h-4" />
                  Ngoại Thất
                </button>
                <button
                  onClick={() => setActiveTab('interior')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'interior' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon name="home" className="w-4 h-4" />
                  Nội Thất
                </button>
                <button
                  onClick={() => setActiveTab('floorplan')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'floorplan' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon name="cube" className="w-4 h-4" />
                  Mặt Bằng 2D ➔ 3D
                </button>
              </div>

              {/* Main Studio Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Control Panel (Left Column) */}
                <div className="lg:col-span-5 space-y-5">
                  <Section title="Cấu Hình Đầu Vào AI Render" icon="adjustments">
                    <div className="space-y-4">
                      {/* Image Upload Area */}
                      <ImageUpload
                        sourceImage={sourceImage}
                        onImageUpload={handleImageUpload}
                        onRemove={() => setSourceImage(null)}
                      />

                      {/* Optional Reference Style Upload */}
                      <ReferenceImageUpload
                        image={referenceImage}
                        onUpload={setReferenceImage}
                        onRemove={() => setReferenceImage(null)}
                      />

                      {/* Quick Style Presets for Exterior / Interior */}
                      {activeTab !== 'floorplan' && (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Gợi Ý Phong Cách Nhanh</label>
                          <div className="grid grid-cols-2 gap-2">
                            {stylePresets.map((preset, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (activeTab === 'exterior') setExteriorPrompt(preset.value);
                                  else setInteriorPrompt(preset.value);
                                }}
                                className="bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 p-2 rounded-xl text-[11px] font-medium text-slate-300 text-left transition truncate"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Floorplan Controls */}
                      {activeTab === 'floorplan' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Loại Phòng</label>
                            <select
                              value={roomType}
                              onChange={(e) => setRoomType(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-indigo-500"
                            >
                              {roomTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Phong Cách</label>
                            <select
                              value={roomStyle}
                              onChange={(e) => setRoomStyle(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-indigo-500"
                            >
                              {roomStyleOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Prompt Textarea */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Prompt Chỉ Dẫn AI</label>
                        <textarea
                          rows={3}
                          value={activeTab === 'exterior' ? exteriorPrompt : activeTab === 'interior' ? interiorPrompt : floorplanPrompt}
                          onChange={(e) => {
                            if (activeTab === 'exterior') setExteriorPrompt(e.target.value);
                            else if (activeTab === 'interior') setInteriorPrompt(e.target.value);
                            else setFloorplanPrompt(e.target.value);
                          }}
                          placeholder="Mô tả các chi tiết kiến trúc, chất liệu, ánh sáng mong muốn..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>

                      {/* Generation Options & Action */}
                      <div className="flex items-center justify-between gap-4 pt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400 font-semibold">Số ảnh:</span>
                          {[1, 2, 4].map(num => (
                            <button
                              key={num}
                              onClick={() => setGenerationCount(num)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                generationCount === num ? 'bg-indigo-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              {num}x
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => {
                            if (activeTab === 'floorplan') handleFloorplanGeneration();
                            else handleGeneration(activeTab === 'exterior' ? exteriorPrompt : interiorPrompt, activeTab as any, false);
                          }}
                          disabled={isLoading}
                          className="flex-grow bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-xl transition shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Icon name="sparkles" className="w-5 h-5" />
                          <span>{isLoading ? 'Đang Render...' : 'Bắt Đầu Render AI'}</span>
                        </button>
                      </div>
                    </div>
                  </Section>

                  {/* History Section */}
                  <HistoryPanel
                    history={activeTab === 'exterior' ? exteriorHistory : activeTab === 'interior' ? interiorHistory : floorplanHistory}
                    onClear={() => {
                      if (activeTab === 'exterior') setExteriorHistory([]);
                      else if (activeTab === 'interior') setInteriorHistory([]);
                      else setFloorplanHistory([]);
                    }}
                    onSelect={(item) => {
                      setGeneratedImages(item.images);
                      setSelectedImageIndex(0);
                    }}
                    title={`Lịch Sử Render (${activeTab.toUpperCase()})`}
                  />
                </div>

                {/* Result Display (Right Column) */}
                <div className="lg:col-span-7">
                  <ResultDisplay
                    expectedCount={generationCount}
                    sourceImage={sourceImage}
                    images={generatedImages}
                    isLoading={isLoading}
                    onUpscale={handleUpscale}
                    upscalingIndex={upscalingIndex}
                    onEditRequest={(img) => {
                      const src = dataUrlToSourceImage(img);
                      if (src) {
                        setImageForEditing(src);
                        setActiveTab('edit');
                      }
                    }}
                    selectedImageIndex={selectedImageIndex}
                    onSelectImageIndex={setSelectedImageIndex}
                    onChangeAngle={() => {
                      handleGeneration(anglePrompt, activeTab as any, true);
                    }}
                    onFullscreen={(idx) => setImageForFullscreen(generatedImages[idx])}
                    showChangeAngleButton={activeTab !== 'floorplan'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* OTHER TABS */}
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
                setEditHistory(prev => [item, ...prev]);
              }}
              historyItemToRestore={editHistoryItemToRestore}
              onHistoryRestored={() => setEditHistoryItemToRestore(null)}
            />
          )}

          {activeTab === 'magic-prompt' && <MagicPromptTab />}
          {activeTab === 'utilities' && <UtilitiesTab />}
          {activeTab === 'virtual-tour' && <VirtualTourTab />}

        </main>
      </div>

      {/* Modals */}
      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      {showZalo && <ZaloModal onClose={() => setShowZalo(false)} />}
      {imageForFullscreen && <ImageViewerModal imageUrl={imageForFullscreen} onClose={() => setImageForFullscreen(null)} />}
      {upscaledImageForModal && <UpscaleModal imageUrl={upscaledImageForModal} onClose={() => setUpscaledImageForModal(null)} />}
    </div>
  );
}