import React, { useState, useEffect } from 'react';
import { Icon } from './icons';
import type { SourceImage, AspectRatio } from '../types';
import {
  generateMagicPrompts,
  generateImages,
  generateImageFromText,
  buildInteriorPromptFromReference,
  InteriorPromptAnalysis
} from '../services/geminiService';
import { DownloadDropdown } from './DownloadDropdown';

const ImageUpload: React.FC<{
  sourceImage: SourceImage | null;
  onImageUpload: (image: SourceImage) => void;
  onRemove: () => void;
  title?: string;
  subtitle?: string;
  heightClass?: string;
}> = ({
  sourceImage,
  onImageUpload,
  onRemove,
  title = 'Nhấp hoặc kéo thả ảnh',
  subtitle = 'PNG, JPG, WEBP',
  heightClass = 'h-40'
}) => {
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
      {title && <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{title}</label>}
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
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
            <Icon name="photo" className="w-5 h-5" />
          </div>
          <p className="text-xs text-center font-semibold text-slate-200">
            {isDraggingOver ? 'Thả ảnh vào đây' : subtitle}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Hỗ trợ PNG, JPG, WEBP</p>
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
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-500 text-white p-1.5 rounded-full shadow-lg transition cursor-pointer"
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
  initialReferenceImage?: SourceImage | null;
  onApplyPromptToStudio?: (prompt: string, refImage: SourceImage) => void;
}> = ({ onEditRequest, initialReferenceImage, onApplyPromptToStudio }) => {
  const [subMode, setSubMode] = useState<'interior-builder' | '20-shots'>('interior-builder');

  // --- Mode 1: Interior Prompt Builder from Reference Image ---
  const [refImage, setRefImage] = useState<SourceImage | null>(initialReferenceImage || null);
  const [targetRoom, setTargetRoom] = useState('Tự động theo ảnh');
  const [lightingStyle, setLightingStyle] = useState('Tự động theo ảnh');
  const [customNotes, setCustomNotes] = useState('');
  const [isBuildingPrompt, setIsBuildingPrompt] = useState(false);
  const [analysis, setAnalysis] = useState<InteriorPromptAnalysis | null>(null);
  const [activePromptLang, setActivePromptLang] = useState<'vi' | 'en'>('vi');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [previewRenderImage, setPreviewRenderImage] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  // --- Mode 2: 20 Magic Shots ---
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

  useEffect(() => {
    if (initialReferenceImage) {
      setRefImage(initialReferenceImage);
      setSubMode('interior-builder');
    }
  }, [initialReferenceImage]);

  const roomOptions = [
    'Tự động theo ảnh',
    'Phòng khách Luxury',
    'Phòng khách liên thông Bếp',
    'Phòng ngủ Master',
    'Phòng ngủ Trẻ em',
    'Phòng bếp & Bàn ăn',
    'Phòng làm việc / Đọc sách',
    'Phòng tắm / WC Cao cấp',
    'Phòng thờ trang nghiêm',
    'Sảnh đón / Lobby'
  ];

  const lightingOptions = [
    'Tự động theo ảnh',
    'Ban ngày nắng tự nhiên qua cửa sổ lớn',
    'Hoàng hôn ấm áp (Golden Hour)',
    'Ban đêm ấm cúng với đèn LED hắt khe 3000K',
    'Ánh sáng Studio Tạp chí ArchDaily trong trẻo'
  ];

  const notePresets = [
    'Tạp chí ArchDaily, ánh sáng tự nhiên trong trẻo',
    'Hoàng hôn Golden Hour ấm áp, bóng đổ dài nghệ thuật',
    'Ban đêm Blue Hour, lên đèn nội thất sang trọng',
    'Cận cảnh vật liệu (Gỗ, Đá Marble, Kính) xóa phông Bokeh'
  ];

  const handleBuildInteriorPrompt = async () => {
    if (!refImage) {
      alert('Vui lòng tải lên ảnh nội thất tham chiếu để AI phân tích.');
      return;
    }
    setIsBuildingPrompt(true);
    setPreviewRenderImage(null);
    try {
      const result = await buildInteriorPromptFromReference(refImage, targetRoom, lightingStyle, customNotes);
      setAnalysis(result);
    } catch (error: any) {
      console.error(error);
      alert(`Lỗi khi phân tích ảnh tham chiếu: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsBuildingPrompt(false);
    }
  };

  const handleRebuildCombinedPrompt = () => {
    if (!analysis) return;
    const roomPrefix = targetRoom !== 'Tự động theo ảnh' ? `Không gian ${targetRoom}, ` : '';
    const updatedVi = `Ảnh chụp thực tế nội thất ${roomPrefix}phong cách ${analysis.style}. Bảng màu chủ đạo: ${analysis.colorPalette}. Vật liệu hoàn thiện: ${analysis.materials}. Bố trí đồ nội thất: ${analysis.furniture}. Hệ thống ánh sáng & góc máy: ${analysis.lightingAndCamera}. Chất lượng kết xuất 8K V-Ray 6 & Corona Renderer siêu thực, chi tiết vật liệu PBR sắc nét.`;
    setAnalysis({
      ...analysis,
      vietnamesePrompt: updatedVi
    });
  };

  const handleRenderPreviewFromBuiltPrompt = async () => {
    if (!analysis) return;
    setIsRenderingPreview(true);
    try {
      const promptToUse = activePromptLang === 'vi' ? analysis.vietnamesePrompt : analysis.englishPrompt;
      if (refImage) {
        const imgs = await generateImages(refImage, promptToUse, 'interior', 1, null, false, false, {
          aspectRatio,
          imageSize: '2K'
        });
        if (imgs.length > 0) setPreviewRenderImage(imgs[0]);
      } else {
        const img = await generateImageFromText(promptToUse, { aspectRatio, imageSize: '2K' });
        if (img) setPreviewRenderImage(img);
      }
    } catch (error: any) {
      console.error(error);
      alert(`Không thể tạo ảnh xem trước: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsRenderingPreview(false);
    }
  };

  const handleCopyField = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleAnalyze20Shots = async () => {
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
    <div className="flex flex-col gap-4 h-full min-h-[calc(100vh-5.5rem)]">
      {/* Top Sub-Mode Switcher Bar */}
      <div className="glass-panel p-2 rounded-2xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-950/90 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setSubMode('interior-builder')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subMode === 'interior-builder'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name="wand" className="w-4 h-4" />
            <span>Xây Dựng Prompt Nội Thất Từ Ảnh Tham Chiếu</span>
          </button>
          <button
            type="button"
            onClick={() => setSubMode('20-shots')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              subMode === '20-shots'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name="sparkles" className="w-4 h-4" />
            <span>20 Góc Máy Nhiếp Ảnh (20 Magic Shots)</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 px-2 hidden md:inline">
          {subMode === 'interior-builder'
            ? '💡 Tải ảnh nội thất mẫu lên ➔ AI tự động bóc tách Vật liệu, Phong cách, Bảng màu & tạo Prompt chuẩn V-Ray'
            : '📸 Tự động sinh 20 kịch bản góc chụp nhiếp ảnh kiến trúc từ 1 ảnh gốc'}
        </span>
      </div>

      {/* ===================================================================== */}
      {/* MODE 1: INTERIOR PROMPT BUILDER FROM REFERENCE IMAGE                  */}
      {/* ===================================================================== */}
      {subMode === 'interior-builder' && (
        <div className="flex flex-col lg:flex-row gap-4 flex-grow">
          {/* Left Column: Reference Image & Parameters */}
          <div className="w-full lg:w-[380px] xl:w-[410px] flex-shrink-0 flex flex-col gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Icon name="home" className="w-4 h-4 text-indigo-400" />
                  <span>Ảnh Nội Thất Tham Chiếu</span>
                </h2>
                <span className="text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                  AI Reverse-Prompt
                </span>
              </div>

              <ImageUpload
                sourceImage={refImage}
                onImageUpload={setRefImage}
                onRemove={() => {
                  setRefImage(null);
                  setAnalysis(null);
                }}
                title="1. Tải Lên Ảnh Nội Thất Mẫu / Tham Chiếu"
                subtitle="Tải ảnh nội thất bạn muốn lấy phong cách & vật liệu"
                heightClass="h-44"
              />

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    2. Loại Phòng Muốn Áp Dụng
                  </label>
                  <select
                    value={targetRoom}
                    onChange={(e) => setTargetRoom(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    {roomOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    3. Kịch Bản Ánh Sáng Ưu Tiên
                  </label>
                  <select
                    value={lightingStyle}
                    onChange={(e) => setLightingStyle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    {lightingOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  4. Yêu Cầu Bổ Sung (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Ví dụ: đổi sàn sang gỗ óc chó xương cá, thêm bàn đảo đá trắng, trần cao thông tầng..."
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Tỷ Lệ Khung Hình Khi Tạo Ảnh Thử
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['16:9', '4:3', '1:1', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                    <button
                      type="button"
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
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

              <button
                type="button"
                onClick={handleBuildInteriorPrompt}
                disabled={!refImage || isBuildingPrompt}
                className="w-full bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/50 text-xs cursor-pointer"
              >
                <Icon name="wand" className="w-4 h-4" />
                <span>
                  {isBuildingPrompt
                    ? 'AI Đang Bóc Tách Vật Liệu & Xây Dựng Prompt...'
                    : 'Bóc Tách Ảnh & Xây Dựng Prompt Nội Thất'}
                </span>
              </button>
            </div>
          </div>

          {/* Right Column: 5-Layer Breakdown & Final Prompt Studio */}
          <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden min-h-[500px]">
            <div className="px-5 py-3.5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Bảng Cấu Trúc Prompt Nội Thất Chuyên Sâu
                </h3>
              </div>

              {analysis && refImage && onApplyPromptToStudio && (
                <button
                  type="button"
                  onClick={() =>
                    onApplyPromptToStudio(
                      activePromptLang === 'vi' ? analysis.vietnamesePrompt : analysis.englishPrompt,
                      refImage
                    )
                  }
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon name="arrow-uturn-right" className="w-3.5 h-3.5" />
                  <span>Đưa Sang Studio Render Nội Thất Ngay</span>
                </button>
              )}
            </div>

            <div className="flex-grow studio-canvas-bg p-4 overflow-y-auto space-y-4">
              {!analysis && !isBuildingPrompt && (
                <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center mb-3 text-indigo-400/70">
                    <Icon name="home" className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-bold text-slate-200">
                    Trình Xây Dựng Prompt Nội Thất Từ Ảnh Tham Chiếu (AI Reverse-Prompt)
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-lg leading-relaxed">
                    Tải lên bất kỳ bức ảnh nội thất mẫu nào bạn yêu thích ở cột bên trái. Gemini Vision sẽ tự động phân tích sâu <b>5 lớp thông số thiết kế</b> (Phong cách, Bảng màu, Vật liệu Sàn-Tường-Trần, Đồ nội thất & Ánh sáng) để tạo thành bản Prompt hoàn chỉnh bằng cả Tiếng Việt và Tiếng Anh.
                  </p>
                </div>
              )}

              {isBuildingPrompt && (
                <div className="h-full min-h-[420px] flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mb-4"></div>
                  <p className="text-sm font-bold text-slate-100">
                    AI đang phân tích vật liệu PBR, đồ nội thất & ánh sáng từ ảnh tham chiếu...
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Đang tổng hợp cấu trúc 5 lớp và biên soạn Prompt chuẩn V-Ray / Corona
                  </p>
                </div>
              )}

              {analysis && (
                <div className="space-y-4">
                  {/* 5-Layer Extracted Parameters Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <label className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                        <span>🎨</span> 1. Phong Cách Chủ Đạo (Style)
                      </label>
                      <textarea
                        rows={2}
                        value={analysis.style}
                        onChange={(e) => setAnalysis({ ...analysis, style: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                        <span>🌈</span> 2. Bảng Màu & Cảm Xúc (Color & Mood)
                      </label>
                      <textarea
                        rows={2}
                        value={analysis.colorPalette}
                        onChange={(e) => setAnalysis({ ...analysis, colorPalette: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <label className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                        <span>🧱</span> 3. Vật Liệu Sàn – Tường – Trần (Materials)
                      </label>
                      <textarea
                        rows={3}
                        value={analysis.materials}
                        onChange={(e) => setAnalysis({ ...analysis, materials: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <label className="text-[11px] font-bold text-pink-300 flex items-center gap-1.5">
                        <span>🛋️</span> 4. Đồ Nội Thất & Decor (Furniture)
                      </label>
                      <textarea
                        rows={3}
                        value={analysis.furniture}
                        onChange={(e) => setAnalysis({ ...analysis, furniture: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="md:col-span-2 bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                          <span>💡</span> 5. Kịch Bản Ánh Sáng & Góc Máy (Lighting & Camera)
                        </label>
                        <button
                          type="button"
                          onClick={handleRebuildCombinedPrompt}
                          className="text-[10px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition cursor-pointer"
                        >
                          🔄 Ghép Lại 5 Thành Phần Trên Vào Prompt Tổng
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={analysis.lightingAndCamera}
                        onChange={(e) => setAnalysis({ ...analysis, lightingAndCamera: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  {/* Final Master Prompt Card */}
                  <div className="bg-slate-900/95 border border-indigo-500/40 rounded-2xl p-4 space-y-3 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">🎯 Prompt Tạo Ảnh Nội Thất Hoàn Chỉnh:</span>
                        <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            onClick={() => setActivePromptLang('vi')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                              activePromptLang === 'vi' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            🇻🇳 Tiếng Việt
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivePromptLang('en')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                              activePromptLang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            🇬🇧 English (V-Ray Pro)
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyField(
                              activePromptLang === 'vi' ? analysis.vietnamesePrompt : analysis.englishPrompt,
                              'master'
                            )
                          }
                          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Icon name={copiedField === 'master' ? 'check' : 'copy'} className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{copiedField === 'master' ? 'Đã Sao Chép!' : 'Sao Chép Prompt'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRenderPreviewFromBuiltPrompt}
                          disabled={isRenderingPreview}
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition shadow-md disabled:opacity-50 cursor-pointer"
                        >
                          {isRenderingPreview ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            <Icon name="sparkles" className="w-3.5 h-3.5" />
                          )}
                          <span>{isRenderingPreview ? 'Đang Tạo Ảnh...' : 'Tạo Ảnh Nội Thất Ngay'}</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      value={activePromptLang === 'vi' ? analysis.vietnamesePrompt : analysis.englishPrompt}
                      onChange={(e) => {
                        if (activePromptLang === 'vi') {
                          setAnalysis({ ...analysis, vietnamesePrompt: e.target.value });
                        } else {
                          setAnalysis({ ...analysis, englishPrompt: e.target.value });
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 leading-relaxed focus:border-indigo-500 focus:outline-none resize-none"
                    />

                    {/* Preview Generated Image if user clicked "Tạo Ảnh Nội Thất Ngay" */}
                    {previewRenderImage && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            ✨ Ảnh Nội Thất Vừa Khởi Tạo Từ Prompt Trên:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFullscreenUrl(previewRenderImage)}
                              className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1"
                            >
                              <Icon name="arrows-pointing-out" className="w-3.5 h-3.5" /> Phóng to
                            </button>
                            {onEditRequest && (
                              <button
                                type="button"
                                onClick={() => onEditRequest(previewRenderImage)}
                                className="bg-pink-600/25 hover:bg-pink-600/40 border border-pink-500/40 text-pink-200 px-2.5 py-1 rounded-lg text-xs font-bold"
                              >
                                🖌️ Sửa Inpaint
                              </button>
                            )}
                            <DownloadDropdown imageUrl={previewRenderImage} filenamePrefix="96ARCH-Interior-RefPrompt" />
                          </div>
                        </div>
                        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center p-2">
                          <img
                            src={previewRenderImage}
                            alt="Generated Interior Preview"
                            className="max-h-[420px] object-contain rounded-lg shadow-2xl"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODE 2: 20 ARCHITECTURAL PHOTOGRAPHY MAGIC PROMPTS                    */}
      {/* ===================================================================== */}
      {subMode === '20-shots' && (
        <div className="flex flex-col lg:flex-row gap-4 flex-grow">
          {/* Left Studio Control Dock */}
          <div className="w-full lg:w-[360px] xl:w-[380px] flex-shrink-0 flex flex-col gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Icon name="wand" className="w-4 h-4 text-indigo-400" />
                  <span>Cấu Hình 20 Magic Prompts</span>
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

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Tỷ Lệ Ảnh Khi Bấm Tạo Ảnh
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['16:9', '4:3', '1:1', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                    <button
                      type="button"
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border transition cursor-pointer ${
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

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  3. Định Hướng Nhiếp Ảnh (Tùy chọn)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {notePresets.map((preset, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setNotes(preset)}
                      className="text-[10px] bg-slate-900/80 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/40 text-slate-300 px-2 py-1 rounded-lg transition text-left cursor-pointer"
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
                type="button"
                onClick={handleAnalyze20Shots}
                disabled={!mainImage || isAnalyzing}
                className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/50 text-xs cursor-pointer"
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
                  type="button"
                  onClick={() => handleCopy(prompts.map((p, i) => `${i + 1}. ${p}`).join('\n\n'), 'all')}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Icon name={copiedIndex === 'all' ? 'check' : 'copy'} className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{copiedIndex === 'all' ? 'Đã chép toàn bộ!' : 'Sao chép tất cả'}</span>
                </button>
              )}
            </div>

            <div className="flex-grow studio-canvas-bg p-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                            type="button"
                            onClick={() => handleCopy(prompt, idx)}
                            className="bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-1 px-2.5 rounded-lg border border-slate-700/80 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Icon name={copiedIndex === idx ? 'check' : 'copy'} className="w-3 h-3 text-indigo-400" />
                            <span>{copiedIndex === idx ? 'Đã chép' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGenerateImage(prompt, idx)}
                            disabled={generatingPromptIndex === idx}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold py-1 px-2.5 rounded-lg transition flex items-center gap-1 disabled:opacity-50 shadow cursor-pointer"
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
                              type="button"
                              onClick={() => setFullscreenUrl(generatedImages[idx])}
                              className="bg-slate-900/90 border border-slate-700 text-white p-1.5 rounded-lg hover:bg-indigo-600 transition"
                              title="Xem toàn màn hình"
                            >
                              <Icon name="arrows-pointing-out" className="w-3.5 h-3.5" />
                            </button>
                            {onEditRequest && (
                              <button
                                type="button"
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
        </div>
      )}

      {fullscreenUrl && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={() => setFullscreenUrl(null)}
        >
          <div className="relative max-w-6xl w-full max-h-[92vh] flex items-center justify-center">
            <button
              type="button"
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
