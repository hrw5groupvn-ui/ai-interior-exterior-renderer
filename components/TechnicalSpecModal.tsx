import React, { useState, useEffect } from 'react';
import type { SourceImage } from '../types';
import {
  analyzePerspectiveForTechnicalSpecs,
  generateTechnicalOrMaterialBoardImage,
  TechnicalAndMaterialReport,
  TechnicalOutputMode
} from '../services/geminiService';
import { Icon } from './icons';
import { DownloadDropdown } from './DownloadDropdown';

interface TechnicalSpecModalProps {
  initialPerspective: SourceImage | null;
  initialMode?: 'technical' | 'material';
  onClose: () => void;
  onAddToStudioGallery?: (dataUrl: string) => void;
  onSendToEditor?: (dataUrl: string) => void;
}

const MODE_OPTIONS: {
  id: TechnicalOutputMode;
  category: 'technical' | 'material';
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'cad-elevation',
    category: 'technical',
    title: 'Bản Vẽ CAD Mặt Đứng & Kích Thước (2D)',
    badge: 'CAD 2D + Dim (mm)',
    desc: 'Chuyển ảnh phối cảnh thành bản vẽ kỹ thuật nét CAD 2D, ghi chú kích thước thông thủy (mm), chia khoang tủ và cao độ.'
  },
  {
    id: 'exploded-joinery',
    category: 'technical',
    title: 'Bản Vẽ Bổ Phân Rã Cấu Tạo Đồ Gỗ (3D Axonometric)',
    badge: 'Bổ Chi Tiết Xưởng',
    desc: 'Phân rã cấu tạo đồ nội thất (khung thùng MDF, cánh tủ, mặt đá, nẹp PVD, rãnh đèn LED) phục vụ sản xuất xưởng.'
  },
  {
    id: 'orthographic-4view',
    category: 'technical',
    title: 'Bản Vẽ Kỹ Thuật 4 Góc Chiếu (Bằng - Đứng - Cắt)',
    badge: '4 Góc Chiếu',
    desc: 'Tổng hợp Mặt bằng bố trí, Mặt đứng chính, Mặt đứng bên và Mặt cắt chi tiết trên cùng một trang bản vẽ.'
  },
  {
    id: 'material-callout',
    category: 'material',
    title: 'Phối Cảnh Chỉ Dẫn Chất Liệu Trực Tiếp (Callout)',
    badge: 'Ghi Chú Trên Ảnh',
    desc: 'Giữ nguyên phối cảnh 3D và kẻ đường gióng chỉ dẫn (Callout) nối ra các ô mẫu vật liệu phóng to kèm mã VL-01, VL-02...'
  },
  {
    id: 'material-board',
    category: 'material',
    title: 'Bảng Moodboard & Mẫu Vật Tư Thi Công (Spec Sheet)',
    badge: 'Bảng Mẫu Vật Tư',
    desc: 'Trích xuất các mẫu gỗ, đá Marble, vải nỉ, da, kim loại PVD và bảng mã màu từ phối cảnh thành bảng trình mẫu khách hàng.'
  }
];

const QUICK_FOCUS_SUGGESTIONS = [
  'Toàn bộ không gian nội thất trong ảnh',
  'Hệ vách Tivi & Tủ rượu trang trí kịch trần',
  'Hệ tủ bếp trên - dưới & Bàn đảo đá',
  'Giường ngủ Master, Vách đầu giường & Tủ quần áo',
  'Bộ Sofa trung tâm, Bàn trà & Thảm trải sàn',
  'Chi tiết Vật liệu Sàn gỗ - Vách ốp đá - Trần đèn LED'
];

export const TechnicalSpecModal: React.FC<TechnicalSpecModalProps> = ({
  initialPerspective,
  initialMode = 'technical',
  onClose,
  onAddToStudioGallery,
  onSendToEditor
}) => {
  const [activeCategory, setActiveCategory] = useState<'technical' | 'material'>(initialMode);
  const [selectedMode, setSelectedMode] = useState<TechnicalOutputMode>(
    initialMode === 'material' ? 'material-callout' : 'cad-elevation'
  );
  const [perspectiveImg, setPerspectiveImg] = useState<SourceImage | null>(initialPerspective);
  const [focusNote, setFocusNote] = useState('');

  const [generatedSheetUrl, setGeneratedSheetUrl] = useState<string | null>(null);
  const [report, setReport] = useState<TechnicalAndMaterialReport | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isAnalyzingSpecs, setIsAnalyzingSpecs] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginalCompare, setShowOriginalCompare] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveCategory(initialMode);
    setSelectedMode(initialMode === 'material' ? 'material-callout' : 'cad-elevation');
  }, [initialMode]);

  const handleCategorySwitch = (cat: 'technical' | 'material') => {
    setActiveCategory(cat);
    const firstMode = MODE_OPTIONS.find((m) => m.category === cat);
    if (firstMode) setSelectedMode(firstMode.id);
  };

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(',')[1];
      if (base64) {
        setPerspectiveImg({ base64, mimeType: file.type });
        setGeneratedSheetUrl(null);
        setReport(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Generate both visual Technical/Material Drawing AND structured Spec Table
  const handleGenerateAll = async () => {
    if (!perspectiveImg) {
      alert('Vui lòng chọn hoặc tải lên ảnh phối cảnh trước khi xuất bản vẽ.');
      return;
    }
    setError(null);
    setIsGeneratingImage(true);
    setIsAnalyzingSpecs(true);
    setShowOriginalCompare(false);

    try {
      const [sheetUrl, specData] = await Promise.all([
        generateTechnicalOrMaterialBoardImage(perspectiveImg, selectedMode, focusNote).catch((err) => {
          console.error('Image generation error:', err);
          throw err;
        }),
        analyzePerspectiveForTechnicalSpecs(perspectiveImg, focusNote).catch((err) => {
          console.error('Spec analysis error:', err);
          return null;
        })
      ]);

      if (sheetUrl) setGeneratedSheetUrl(sheetUrl);
      if (specData) setReport(specData);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Không thể tạo bản vẽ kỹ thuật lúc này. Vui lòng kiểm tra kết nối API Key.');
    } finally {
      setIsGeneratingImage(false);
      setIsAnalyzingSpecs(false);
    }
  };

  // Only analyze text table without regenerating image
  const handleAnalyzeTableOnly = async () => {
    if (!perspectiveImg) return;
    setError(null);
    setIsAnalyzingSpecs(true);
    try {
      const specData = await analyzePerspectiveForTechnicalSpecs(perspectiveImg, focusNote);
      setReport(specData);
    } catch (err: any) {
      setError(err?.message || 'Lỗi phân tích bảng thông số kỹ thuật.');
    } finally {
      setIsAnalyzingSpecs(false);
    }
  };

  // Export full A4 Landscape Technical & Material Dossier PDF with crisp Vietnamese text via Canvas
  const handleExportDossierPdf = async () => {
    if (!perspectiveImg) return;
    setIsExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const loadImage = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      const perspDataUrl = `data:${perspectiveImg.mimeType};base64,${perspectiveImg.base64}`;
      const perspEl = await loadImage(perspDataUrl);
      const sheetEl = generatedSheetUrl ? await loadImage(generatedSheetUrl) : null;

      // Render Page 1: Visual Drawings Sheet onto high-res Canvas (2480 x 1754 px = A4 Landscape @ 210 DPI)
      const canvas1 = document.createElement('canvas');
      canvas1.width = 2400;
      canvas1.height = 1700;
      const ctx1 = canvas1.getContext('2d')!;

      // White technical sheet background & double border
      ctx1.fillStyle = '#FFFFFF';
      ctx1.fillRect(0, 0, 2400, 1700);
      ctx1.strokeStyle = '#1E293B';
      ctx1.lineWidth = 6;
      ctx1.strokeRect(40, 40, 2320, 1620);
      ctx1.lineWidth = 2;
      ctx1.strokeRect(52, 52, 2296, 1596);

      // Header Banner
      ctx1.fillStyle = '#0F172A';
      ctx1.fillRect(52, 52, 2296, 110);
      ctx1.fillStyle = '#F59E0B';
      ctx1.font = 'bold 34px Segoe UI, Inter, Arial, sans-serif';
      ctx1.fillText('96 ARCH AI STUDIO — HỒ SƠ KỸ THUẬT BỔ NỘI THẤT & CHỈ DẪN VẬT LIỆU', 90, 118);
      ctx1.fillStyle = '#94A3B8';
      ctx1.font = '22px Segoe UI, Inter, Arial, sans-serif';
      const dateStr = new Date().toLocaleDateString('vi-VN');
      ctx1.fillText(`Ngày xuất: ${dateStr}  |  Tỷ lệ: NTS`, 1880, 118);

      // Draw images side-by-side or single large
      const drawContainedImage = (
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        boxX: number,
        boxY: number,
        boxW: number,
        boxH: number,
        caption: string
      ) => {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        const pad = 16;
        const availW = boxW - pad * 2;
        const availH = boxH - 60 - pad * 2;
        const scale = Math.min(availW / img.width, availH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const dx = boxX + (boxW - w) / 2;
        const dy = boxY + pad + (availH - h) / 2;
        ctx.drawImage(img, dx, dy, w, h);

        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(boxX + 2, boxY + boxH - 52, boxW - 4, 50);
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 22px Segoe UI, Inter, Arial, sans-serif';
        ctx.fillText(caption, boxX + 24, boxY + boxH - 18);
      };

      if (sheetEl) {
        drawContainedImage(ctx1, perspEl, 80, 195, 1080, 1220, '1. ẢNH PHỐI CẢNH 3D GỐC (PERSPECTIVE VIEW)');
        const modeTitle = MODE_OPTIONS.find((m) => m.id === selectedMode)?.title || 'BẢN VẼ KỸ THUẬT / CHẤT LIỆU';
        drawContainedImage(ctx1, sheetEl, 1200, 195, 1120, 1220, `2. ${modeTitle.toUpperCase()}`);
      } else {
        drawContainedImage(ctx1, perspEl, 80, 195, 2240, 1220, 'ẢNH PHỐI CẢNH 3D NỘI THẤT');
      }

      // Title Block at Bottom of Page 1
      ctx1.fillStyle = '#F8FAFC';
      ctx1.fillRect(80, 1440, 2240, 180);
      ctx1.strokeStyle = '#334155';
      ctx1.lineWidth = 2;
      ctx1.strokeRect(80, 1440, 2240, 180);

      ctx1.fillStyle = '#0F172A';
      ctx1.font = 'bold 24px Segoe UI, Inter, Arial, sans-serif';
      ctx1.fillText('THÔNG TIN HẠNG MỤC & TIÊU CHUẨN THI CÔNG:', 110, 1485);
      ctx1.font = '21px Segoe UI, Inter, Arial, sans-serif';
      ctx1.fillStyle = '#334155';
      const summaryText =
        report?.roomSummary ||
        focusNote ||
        'Bản vẽ bóc tách kỹ thuật nội thất & chỉ dẫn vật liệu hoàn thiện từ phối cảnh 3D.';
      ctx1.fillText(summaryText.slice(0, 125), 110, 1525);
      if (report?.constructionNotes) {
        ctx1.fillStyle = '#475569';
        ctx1.fillText(`Lưu ý: ${report.constructionNotes.slice(0, 130)}`, 110, 1565);
      }

      const page1DataUrl = canvas1.toDataURL('image/jpeg', 0.95);
      pdf.addImage(page1DataUrl, 'JPEG', 0, 0, 297, 210);

      // Page 2: Detailed Joinery & Material Schedule Tables (if report exists)
      if (report && (report.joineryItems.length > 0 || report.materialItems.length > 0)) {
        pdf.addPage('a4', 'landscape');
        const canvas2 = document.createElement('canvas');
        canvas2.width = 2400;
        canvas2.height = 1700;
        const ctx2 = canvas2.getContext('2d')!;

        ctx2.fillStyle = '#FFFFFF';
        ctx2.fillRect(0, 0, 2400, 1700);
        ctx2.strokeStyle = '#1E293B';
        ctx2.lineWidth = 6;
        ctx2.strokeRect(40, 40, 2320, 1620);

        ctx2.fillStyle = '#0F172A';
        ctx2.fillRect(52, 52, 2296, 95);
        ctx2.fillStyle = '#F59E0B';
        ctx2.font = 'bold 30px Segoe UI, Inter, Arial, sans-serif';
        ctx2.fillText('BẢNG KÊ CHI TIẾT BỔ KỸ THUẬT ĐỒ GỖ & BẢNG MÃ CHẤT LIỆU THI CÔNG', 85, 112);

        let curY = 195;

        // Table 1: Joinery Items
        ctx2.fillStyle = '#1E1B4B';
        ctx2.font = 'bold 26px Segoe UI, Inter, Arial, sans-serif';
        ctx2.fillText('I. BẢNG BÓC TÁCH KỸ THUẬT ĐỒ NỘI THẤT (JOINERY SCHEDULE)', 85, curY);
        curY += 25;

        const drawRow = (cols: string[], widths: number[], isHeader: boolean, y: number, hexColor?: string) => {
          const rowH = isHeader ? 54 : 68;
          ctx2.fillStyle = isHeader ? '#1E293B' : '#F8FAFC';
          ctx2.fillRect(85, y, 2230, rowH);
          ctx2.strokeStyle = '#CBD5E1';
          ctx2.lineWidth = 1.5;
          ctx2.strokeRect(85, y, 2230, rowH);

          let curX = 85;
          cols.forEach((text, i) => {
            if (i > 0) {
              ctx2.beginPath();
              ctx2.moveTo(curX, y);
              ctx2.lineTo(curX, y + rowH);
              ctx2.stroke();
            }
            if (!isHeader && hexColor && i === 3) {
              ctx2.fillStyle = hexColor;
              ctx2.fillRect(curX + 14, y + 14, 38, 38);
              ctx2.strokeStyle = '#334155';
              ctx2.strokeRect(curX + 14, y + 14, 38, 38);
              ctx2.fillStyle = '#0F172A';
              ctx2.font = '20px Segoe UI, Inter, Arial, sans-serif';
              ctx2.fillText(text, curX + 64, y + 40);
            } else {
              ctx2.fillStyle = isHeader ? '#FFFFFF' : '#0F172A';
              ctx2.font = isHeader ? 'bold 20px Segoe UI, Inter, Arial, sans-serif' : '19px Segoe UI, Inter, Arial, sans-serif';
              const maxChars = Math.floor(widths[i] / 11);
              const clipped = text.length > maxChars ? text.slice(0, maxChars - 2) + '...' : text;
              ctx2.fillText(clipped, curX + 14, y + (isHeader ? 35 : 42));
            }
            curX += widths[i];
          });
          return y + rowH;
        };

        const jWidths = [140, 430, 320, 460, 440, 440];
        curY = drawRow(
          ['Mã Hiệu', 'Hạng Mục Nội Thất', 'Kích Thước (mm)', 'Cốt Vật Liệu', 'Bề Mặt Hoàn Thiện', 'Phụ Kiện & Ghi Chú'],
          jWidths,
          true,
          curY
        );

        report.joineryItems.slice(0, 6).forEach((item) => {
          curY = drawRow(
            [item.code, item.name, item.dimensions, item.coreMaterial, item.surfaceFinish, item.hardwareAndNotes],
            jWidths,
            false,
            curY
          );
        });

        curY += 55;
        ctx2.fillStyle = '#1E1B4B';
        ctx2.font = 'bold 26px Segoe UI, Inter, Arial, sans-serif';
        ctx2.fillText('II. BẢNG CHỈ DẪN CHẤT LIỆU & MÃ VẬT TƯ (MATERIAL SPECIFICATION)', 85, curY);
        curY += 25;

        const mWidths = [140, 340, 430, 230, 280, 380, 430];
        curY = drawRow(
          ['Mã VL', 'Vị Trí Áp Dụng', 'Tên Chất Liệu', 'Mã Màu', 'Bề Mặt PBR', 'Thương Hiệu Gợi Ý', 'Quy Cách Thi Công'],
          mWidths,
          true,
          curY
        );

        report.materialItems.slice(0, 6).forEach((mat) => {
          curY = drawRow(
            [
              mat.code,
              mat.zone,
              mat.materialName,
              mat.colorHex || '#CCCCCC',
              mat.finishType,
              mat.brandSuggestion,
              mat.applicationNote
            ],
            mWidths,
            false,
            curY,
            mat.colorHex
          );
        });

        const page2DataUrl = canvas2.toDataURL('image/jpeg', 0.95);
        pdf.addImage(page2DataUrl, 'JPEG', 0, 0, 297, 210);
      }

      pdf.save(`96ARCH-HoSo-KyThuat-ChatLieu-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Export PDF failed:', err);
      alert('Không thể xuất PDF lúc này. Bạn vẫn có thể tải trực tiếp ảnh bản vẽ.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const perspectiveDataUrl = perspectiveImg ? `data:${perspectiveImg.mimeType};base64,${perspectiveImg.base64}` : null;
  const filteredModes = MODE_OPTIONS.filter((m) => m.category === activeCategory);

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#090d18] border border-slate-700/90 rounded-2xl max-w-[1560px] w-full max-h-[94vh] flex flex-col shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg border border-amber-400/40">
              <Icon name="cube" className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Xuất Bản Vẽ Kỹ Thuật Bổ Nội Thất & Hồ Sơ Chất Liệu
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  CAD & Material Studio
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tự động chuyển hóa ảnh phối cảnh 3D thành Bản vẽ kỹ thuật 2D/3D, Bảng Callout chỉ dẫn chất liệu & Bảng kê thông số thi công
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switcher between Technical Drawing & Material Spec */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => handleCategorySwitch('technical')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeCategory === 'technical'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon name="pencil" className="w-3.5 h-3.5" />
                <span>1. Bản Vẽ Bổ Nội Thất</span>
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch('material')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeCategory === 'material'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>2. Bóc Tách Chất Liệu</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
              <span>Quay Lại Studio</span>
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Control Column (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Source Perspective Preview */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/90 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                  Ảnh Phối Cảnh Nguồn
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  {perspectiveImg ? 'Đổi ảnh phối cảnh khác' : '+ Tải ảnh lên'}
                </button>
              </div>

              {perspectiveDataUrl ? (
                <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 h-44 flex items-center justify-center">
                  <img src={perspectiveDataUrl} alt="Perspective" className="max-w-full max-h-full object-contain" />
                  <span className="absolute bottom-2 left-2 bg-black/80 text-[10px] text-emerald-300 px-2 py-0.5 rounded font-semibold border border-emerald-500/30">
                    ✓ Phối cảnh 3D sẵn sàng bóc tách
                  </span>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl h-40 flex flex-col items-center justify-center cursor-pointer bg-slate-950/60 p-4 text-center"
                >
                  <Icon name="photo" className="w-8 h-8 text-indigo-400 mb-2" />
                  <p className="text-xs font-semibold text-slate-200">Nhấp để chọn ảnh phối cảnh nội thất / kiến trúc</p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                }}
                className="hidden"
                accept="image/*"
              />
            </div>

            {/* Drawing / Material Mode Selector */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/90 space-y-2.5">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                {activeCategory === 'technical'
                  ? 'Chọn Kiểu Bản Vẽ Kỹ Thuật Bổ Nội Thất'
                  : 'Chọn Kiểu Xuất Bảng Chất Liệu & Vật Tư'}
              </label>

              <div className="space-y-2">
                {filteredModes.map((m) => {
                  const isSelected = selectedMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMode(m.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-100">{m.title}</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold flex-shrink-0 ${
                            isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Focus Item & Custom Instruction */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/90 space-y-2.5">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Hạng Mục Trọng Tâm Cần Bổ Chi Tiết (Tùy chọn)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FOCUS_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFocusNote(item)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg border transition ${
                      focusNote === item
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={focusNote}
                onChange={(e) => setFocusNote(e.target.value)}
                placeholder="VD: Bổ chi tiết hệ tủ bếp chữ L dài 3.6m, cốt MDF chống ẩm An Cường..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />

              {/* Primary CTA Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleGenerateAll}
                  disabled={!perspectiveImg || isGeneratingImage || isAnalyzingSpecs}
                  className="w-full bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 text-xs cursor-pointer"
                >
                  <Icon name="sparkles" className="w-4 h-4" />
                  <span>
                    {isGeneratingImage
                      ? 'Đang Dựng Bản Vẽ Kỹ Thuật & Bóc Tách Vật Tư...'
                      : activeCategory === 'technical'
                      ? '⚡ Xuất Bản Vẽ Kỹ Thuật Bổ Nội Thất + Bảng Kê'
                      : '⚡ Xuất Bảng Chỉ Dẫn Chất Liệu + Bảng Mã Vật Tư'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleAnalyzeTableOnly}
                  disabled={!perspectiveImg || isAnalyzingSpecs}
                  className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Icon name="wand" className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {isAnalyzingSpecs
                      ? 'Đang phân tích thông số...'
                      : 'Chỉ Trích Xuất Nhanh Bảng Bóc Tách Đồ Gỗ & Vật Liệu (Text)'}
                  </span>
                </button>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs">
                  ⚠️ {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Output Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Visual Drawing / Material Callout Sheet Viewport */}
            <div className="glass-panel rounded-2xl border border-slate-800/90 overflow-hidden flex flex-col min-h-[380px]">
              <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-xs font-bold text-slate-100">
                    {MODE_OPTIONS.find((m) => m.id === selectedMode)?.title}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {generatedSheetUrl && perspectiveDataUrl && (
                    <button
                      type="button"
                      onClick={() => setShowOriginalCompare(!showOriginalCompare)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                        showOriginalCompare
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Icon name="arrows-right-left" className="w-3.5 h-3.5" />
                      <span>{showOriginalCompare ? 'Đang xem: Song song Phối Cảnh & Bản Vẽ' : 'So Sánh Với Phối Cảnh'}</span>
                    </button>
                  )}

                  {generatedSheetUrl && onAddToStudioGallery && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddToStudioGallery(generatedSheetUrl);
                        alert('Đã thêm bản vẽ vào danh sách Phương Án trong Studio!');
                      }}
                      className="bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <span>+ Đưa Vào Khung Studio Chính</span>
                    </button>
                  )}

                  {generatedSheetUrl && onSendToEditor && (
                    <button
                      type="button"
                      onClick={() => {
                        onSendToEditor(generatedSheetUrl);
                        onClose();
                      }}
                      className="bg-pink-600/20 hover:bg-pink-600/35 border border-pink-500/40 text-pink-200 px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <Icon name="brush" className="w-3.5 h-3.5" />
                      <span>Sửa Inpaint</span>
                    </button>
                  )}

                  {(generatedSheetUrl || report) && (
                    <button
                      type="button"
                      onClick={handleExportDossierPdf}
                      disabled={isExportingPdf}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs transition flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Icon name="download" className="w-3.5 h-3.5" />
                      <span>{isExportingPdf ? 'Đang tạo PDF...' : 'Xuất Hồ Sơ PDF (A4 Ngang)'}</span>
                    </button>
                  )}

                  {generatedSheetUrl && (
                    <DownloadDropdown
                      imageUrl={generatedSheetUrl}
                      filenamePrefix={`96ARCH-${selectedMode.toUpperCase()}`}
                    />
                  )}
                </div>
              </div>

              <div className="flex-grow studio-canvas-bg p-4 flex items-center justify-center min-h-[340px]">
                {isGeneratingImage ? (
                  <div className="text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mx-auto mb-3"></div>
                    <p className="text-sm font-bold text-slate-100">
                      Gemini AI đang dựng {MODE_OPTIONS.find((m) => m.id === selectedMode)?.title}...
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Đang bóc tách tỷ lệ cấu kiện, đường gióng kích thước (mm) và mẫu vật liệu PBR
                    </p>
                  </div>
                ) : generatedSheetUrl ? (
                  showOriginalCompare && perspectiveDataUrl ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full items-center">
                      <div className="bg-slate-950/90 p-2 rounded-xl border border-slate-800 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                          Ảnh Phối Cảnh 3D Gốc
                        </span>
                        <img
                          src={perspectiveDataUrl}
                          alt="Original Perspective"
                          className="max-h-[42vh] mx-auto object-contain rounded-lg"
                        />
                      </div>
                      <div className="bg-slate-950/90 p-2 rounded-xl border border-indigo-500/40 text-center">
                        <span className="text-[10px] font-bold text-amber-300 uppercase block mb-1.5">
                          Bản Vẽ Kỹ Thuật / Bảng Chất Liệu AI
                        </span>
                        <img
                          src={generatedSheetUrl}
                          alt="Technical Sheet"
                          className="max-h-[42vh] mx-auto object-contain rounded-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={generatedSheetUrl}
                      alt="Generated Technical or Material Sheet"
                      className="max-w-full max-h-[50vh] object-contain rounded-xl shadow-2xl border border-slate-800 bg-white"
                    />
                  )
                ) : (
                  <div className="text-center max-w-md py-10 px-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-amber-400/80">
                      <Icon name="cube" className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-bold text-slate-200">
                      Khung Hiển Thị Bản Vẽ Bổ Kỹ Thuật Nội Thất & Bảng Chỉ Dẫn Chất Liệu
                    </p>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Chọn kiểu bản vẽ bên trái rồi bấm{' '}
                      <b className="text-amber-300">Xuất Bản Vẽ Kỹ Thuật Bổ Nội Thất + Bảng Kê</b> để AI chuyển đổi phối cảnh 3D sang bản vẽ CAD 2D, bản vẽ phân rã cấu tạo đồ gỗ hoặc bảng Callout chất liệu.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Structured Technical Joinery & Material Schedule Tables */}
            <div className="glass-panel rounded-2xl border border-slate-800/90 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <Icon name="sparkles" className="w-4 h-4 text-amber-400" />
                    Bảng Bóc Tách Kỹ Thuật Bổ Nội Thất & Danh Mục Chất Liệu (BOQ)
                  </h3>
                  {report?.roomSummary && <p className="text-[11px] text-indigo-300 mt-0.5">{report.roomSummary}</p>}
                </div>
                {report && (
                  <button
                    type="button"
                    onClick={() => {
                      const text = [
                        `=== HỒ SƠ KỸ THUẬT & CHẤT LIỆU 96 ARCH AI ===`,
                        report.roomSummary,
                        `\n--- I. BÓC TÁCH KỸ THUẬT BỔ ĐỒ NỘI THẤT ---`,
                        ...report.joineryItems.map(
                          (j) =>
                            `[${j.code}] ${j.name} | KT: ${j.dimensions} | Cốt: ${j.coreMaterial} | Bề mặt: ${j.surfaceFinish} | Phụ kiện: ${j.hardwareAndNotes}`
                        ),
                        `\n--- II. BẢNG CHỈ DẪN CHẤT LIỆU & VẬT TƯ ---`,
                        ...report.materialItems.map(
                          (m) =>
                            `[${m.code}] ${m.zone}: ${m.materialName} (${m.colorHex} - ${m.finishType}) | Gợi ý: ${m.brandSuggestion} | Thi công: ${m.applicationNote}`
                        ),
                        `\nLưu ý thi công: ${report.constructionNotes}`
                      ].join('\n');
                      navigator.clipboard.writeText(text);
                      alert('Đã sao chép toàn bộ bảng bóc tách kỹ thuật & vật liệu vào Clipboard!');
                    }}
                    className="text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-lg border border-slate-700 transition"
                  >
                    📋 Copy Toàn Bộ Bảng Kê
                  </button>
                )}
              </div>

              {isAnalyzingSpecs ? (
                <div className="py-8 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mx-auto mb-2"></div>
                  <p className="text-xs text-slate-300">
                    Đang phân tích cấu tạo đồ gỗ, kích thước thông thủy (mm) và mã chất liệu PBR...
                  </p>
                </div>
              ) : report ? (
                <div className="space-y-4">
                  {/* Table 1: Interior Joinery Breakdown */}
                  <div>
                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">
                      I. Bảng Bóc Tách Kỹ Thuật Đồ Nội Thất (Bổ Xưởng Sản Xuất)
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900/95 text-slate-300 border-b border-slate-800 text-[11px]">
                            <th className="py-2 px-3 font-bold w-16">Mã</th>
                            <th className="py-2 px-3 font-bold">Hạng Mục Nội Thất</th>
                            <th className="py-2 px-3 font-bold">Kích Thước (Ước tính)</th>
                            <th className="py-2 px-3 font-bold">Cốt Vật Liệu Kết Cấu</th>
                            <th className="py-2 px-3 font-bold">Bề Mặt Hoàn Thiện</th>
                            <th className="py-2 px-3 font-bold">Phụ Kiện & Chi Tiết Bổ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                          {report.joineryItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 font-mono font-bold text-amber-400">{item.code}</td>
                              <td className="py-2 px-3 font-semibold text-slate-100">{item.name}</td>
                              <td className="py-2 px-3 font-mono text-emerald-300">{item.dimensions}</td>
                              <td className="py-2 px-3 text-slate-300">{item.coreMaterial}</td>
                              <td className="py-2 px-3 text-slate-300">{item.surfaceFinish}</td>
                              <td className="py-2 px-3 text-slate-400">{item.hardwareAndNotes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 2: Material Swatches & Specs */}
                  <div>
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
                      II. Bảng Chỉ Dẫn Chất Liệu & Mã Vật Tư Hoàn Thiện (Material Schedule)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {report.materialItems.map((mat, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 flex items-start gap-3"
                        >
                          <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <div
                              className="w-11 h-11 rounded-xl border border-white/20 shadow-inner"
                              style={{ backgroundColor: mat.colorHex || '#94a3b8' }}
                              title={`Mã màu: ${mat.colorHex}`}
                            />
                            <span className="text-[9px] font-mono text-slate-400">{mat.colorHex}</span>
                          </div>
                          <div className="min-w-0 flex-grow">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-slate-100 truncate">
                                <span className="text-amber-400 font-mono mr-1">[{mat.code}]</span>
                                {mat.materialName}
                              </span>
                              <span className="text-[10px] bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                                {mat.finishType}
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-300 font-medium mt-0.5">
                              Vị trí: {mat.zone} • Gợi ý: {mat.brandSuggestion}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{mat.applicationNote}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {report.constructionNotes && (
                    <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-200">
                      <b className="text-indigo-300">📌 Ghi chú kỹ thuật thi công & đo đạc xưởng: </b>
                      {report.constructionNotes}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Bảng bóc tách kích thước đồ nội thất (Dài x Sâu x Cao mm), cốt gỗ MDF/Gỗ tự nhiên và bảng mã chất liệu sẽ hiển thị tại đây sau khi phân tích.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
