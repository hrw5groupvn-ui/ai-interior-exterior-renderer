import React, { useState } from 'react';
import { Icon } from './icons';
import type { SourceImage, AspectRatio } from '../types';
import { generateMagicPrompts, generateImages } from '../services/geminiService';
import { DownloadDropdown } from './DownloadDropdown';

const ImageUpload: React.FC<{
  sourceImage: SourceImage | null;
  onImageUpload: (image: SourceImage) => void;
  onRemove: () => void;
  title?: string;
  subtitle?: string;
  heightClass?: string;
}> = ({ sourceImage, onImageUpload, onRemove, title = 'Nhấp hoặc kéo thả ảnh', subtitle = 'PNG, JPG, WEBP', heightClass = 'h-40' }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        const base64Content = base64Data.split(',')[1];
        onImageUpload({
          base64: base64Content,
          mimeType: file.type,
          dataUrl: base64Data
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {title && <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</label>}
      {!sourceImage ? (
        <div
          className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all duration-200 cursor-pointer ${heightClass} ${
            isDraggingOver
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-700/80 bg-slate-900/40 hover:border-indigo-500/60 hover:bg-slate-900/70'
          }`}
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
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
            <Icon name="photo" className="w-5 h-5" />
          </div>
          <p className="text-xs text-center font-semibold text-slate-300">
            {isDraggingOver ? 'Thả ảnh vào đây' : subtitle}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) processFile(e.target.files[0]);
            }}
          />
        </div>
      ) : (
        <div className={`relative rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 group ${heightClass}`}>
          <img
            src={sourceImage.dataUrl || `data:${sourceImage.mimeType};base64,${sourceImage.base64}`}
            alt="Uploaded"
            className="w-full h-full object-contain"
          />
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-500 text-white p-1.5 rounded-full shadow-lg transition"
            title="Xóa ảnh"
          >
            <Icon name="x-mark" className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export const MagicPromptTab: React.FC<{
  onEditRequest?: (imageUrl: string) => void;
}> = ({ onEditRequest }) => {
  const [mainImage, setMainImage] = useState<SourceImage | null>(null);
  const [characterImage, setCharacterImage] = useState<SourceImage | null>(null);
  const [notes, setNotes] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [prompts, setPrompts] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | 'all' | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  const [generatingPromptIndex, setGeneratingPromptIndex] = useState<number | null>(null);
  const [generatedImages, setGeneratedImages] = useState<{ [key: number]: string }>({});

  const notePresets = [
    'Tạp chí ArchDaily, ánh sáng tự nhiên trong trẻo',
    'Hoàng hôn Golden Hour ấm áp, bóng đổ dài nghệ thuật',
    'Ban đêm Blue Hour, lên đèn nội thất sang trọng',
    'Cận cảnh vật liệu (Gỗ, Đá Marble, Kính) xóa phông Bokeh'
  ];

  const handleAnalyze = async () => {
    if (!mainImage) {
      alert('Vui lòng tải lên ảnh công trình/nội thất chính để phân tích.');
      return;
    }
    setIsAnalyzing(true);
    setPrompts([]);
    setGeneratedImages({});
    try {
      const result = await generateMagicPrompts(mainImage, characterImage, notes);
      setPrompts(result);
    } catch (error: any) {
      console.error(error);
      alert(`Đã xảy ra lỗi khi tạo prompt: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateImage = async (prompt: string, index: number) => {
    if (!mainImage) return;
    setGeneratingPromptIndex(index);
    try {
      const images = await generateImages(
        mainImage,
        prompt,
        'interior',
        1,
        characterImage,
        false,
        true,
        { aspectRatio, imageSize: '2K' }
      );
      if (images.length > 0) {
        setGeneratedImages((prev) => ({ ...prev, [index]: images[0] }));
      }
    } catch (error: any) {
      console.error(error);
      alert(`Lỗi khi tạo ảnh: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setGeneratingPromptIndex(null);
    }
  };

  const handleCopy = (text: string, idx: number | 'all') => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[calc(100vh-5.5rem)]">
      {/* Left Studio Control Dock */}
      <div className="w-full lg:w-[360px] xl:w-[380px] flex-shrink-0 flex flex-col gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Icon name="wand" className="w-4 h-4 text-indigo-400" />
              <span>Cấu Hình Magic Prompts</span>
            </h2>
            <span className="text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
              20 Góc Máy AI
            </span>
          </div>

          <ImageUpload
            sourceImage={mainImage}
            onImageUpload={setMainImage}
            onRemove={() => setMainImage(null)}
            title="1. Ảnh Công Trình / Nội Thất Chính"
            subtitle="Tải lên ảnh phối cảnh hoặc hiện trạng"
            heightClass="h-40"
          />

          <ImageUpload
            sourceImage={characterImage}
            onImageUpload={setCharacterImage}
            onRemove={() => setCharacterImage(null)}
            title="2. Ảnh Nhân Vật Mẫu (Tùy chọn)"
            subtitle="Thêm nhân vật vào bối cảnh kiến trúc"
            heightClass="h-28"
          />

          {/* Aspect Ratio for direct render */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Tỷ Lệ Ảnh Khi Bấm Tạo Ảnh
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['16:9', '4:3', '1:1', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border transition ${
                    aspectRatio === ratio
                      ? 'bg-indigo-600/30 border-indigo-500 text-white'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Notes & Presets */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              3. Định Hướng Nhiếp Ảnh (Tùy chọn)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {notePresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setNotes(preset)}
                  className="text-[10px] bg-slate-900/80 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/40 text-slate-300 px-2 py-1 rounded-lg transition text-left"
                >
                  + {preset}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nhập ghi chú ánh sáng, mùa, thời tiết, cảm xúc..."
              rows={2}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!mainImage || isAnalyzing}
            className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/50 text-xs"
          >
            <Icon name="sparkles" className="w-4 h-4" />
            <span>{isAnalyzing ? 'AI Đang Phân Tích Bối Cảnh...' : 'Phân Tích & Tạo 20 Magic Prompts'}</span>
          </button>
        </div>
      </div>

      {/* Right Fullscreen Studio Viewport */}
      <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden min-h-[480px]">
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <Icon name="sparkles" className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Danh Sách 20 Kịch Bản Nhiếp Ảnh Kiến Trúc
            </h3>
            {prompts.length > 0 && (
              <span className="text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {prompts.length} prompts sẵn sàng
              </span>
            )}
          </div>

          {prompts.length > 0 && (
            <button
              onClick={() => handleCopy(prompts.map((p, i) => `${i + 1}. ${p}`).join('\n\n'), 'all')}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
            >
              <Icon name={copiedIndex === 'all' ? 'check' : 'copy'} className="w-3.5 h-3.5 text-indigo-400" />
              <span>{copiedIndex === 'all' ? 'Đã chép toàn bộ!' : 'Sao chép tất cả'}</span>
            </button>
          )}
        </div>

        <div className="flex-grow studio-canvas-bg p-4 overflow-y-auto max-h-[calc(100vh-10rem)]">
          {prompts.length === 0 && !isAnalyzing && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center mb-3 text-slate-600">
                <Icon name="wand" className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-slate-300">
                Tự động khởi tạo 20 góc máy nhiếp ảnh kiến trúc chuyên sâu
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Tải lên ảnh phối cảnh ở cột bên trái và bấm nút Phân tích. AI sẽ tự động đọc vật liệu, ánh sáng và thiết kế 20 góc chụp (Cận cảnh, Trung cảnh, Xóa phông Bokeh, Dưới tán lá, Hoàng hôn...).
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-4"></div>
              <p className="text-sm font-bold text-slate-200">
                Gemini Vision đang đọc vật liệu, bố cục & soạn 20 góc chụp...
              </p>
              <p className="text-xs text-slate-500 mt-1">Quá trình này mất khoảng 5 - 10 giây</p>
            </div>
          )}

          {prompts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-3.5">
              {prompts.map((prompt, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/85 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 hover:border-indigo-500/50 flex flex-col gap-2.5 transition-all shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md">
                      SHOT #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(prompt, idx)}
                        className="bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-1 px-2.5 rounded-lg border border-slate-700/80 transition flex items-center gap-1"
                      >
                        <Icon name={copiedIndex === idx ? 'check' : 'copy'} className="w-3 h-3 text-indigo-400" />
                        <span>{copiedIndex === idx ? 'Đã chép' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => handleGenerateImage(prompt, idx)}
                        disabled={generatingPromptIndex === idx}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold py-1 px-2.5 rounded-lg transition flex items-center gap-1 disabled:opacity-50 shadow"
                      >
                        {generatingPromptIndex === idx ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                        ) : (
                          <Icon name="sparkles" className="w-3 h-3" />
                        )}
                        <span>{generatingPromptIndex === idx ? 'Đang Render...' : 'Tạo Ảnh AI'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      const newPrompts = [...prompts];
                      newPrompts[idx] = e.target.value;
                      setPrompts(newPrompts);
                    }}
                    rows={3}
                    className="w-full bg-slate-950/70 border border-slate-800/90 rounded-lg p-2.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 resize-none"
                  />

                  {generatedImages[idx] && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 group/img mt-1">
                      <img
                        src={generatedImages[idx]}
                        alt={`Shot ${idx + 1}`}
                        className="w-full max-h-64 object-contain mx-auto"
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <button
                          onClick={() => setFullscreenUrl(generatedImages[idx])}
                          className="bg-slate-900/90 border border-slate-700 text-white p-1.5 rounded-lg hover:bg-indigo-600 transition"
                          title="Xem toàn màn hình"
                        >
                          <Icon name="arrows-pointing-out" className="w-3.5 h-3.5" />
                        </button>
                        {onEditRequest && (
                          <button
                            onClick={() => onEditRequest(generatedImages[idx])}
                            className="bg-indigo-600/90 text-white px-2 py-1 rounded-lg text-[11px] font-bold hover:bg-indigo-500 transition"
                          >
                            Sửa
                          </button>
                        )}
                        <DownloadDropdown imageUrl={generatedImages[idx]} filenamePrefix={`96ARCH-Shot-${idx + 1}`} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
            <img src={fullscreenUrl} alt="Fullscreen Shot" className="max-w-full max-h-[88vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};
