import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import { DownloadDropdown } from './DownloadDropdown';
import { editImage } from '../services/geminiService';
import { CameraRawEditor } from './CameraRawEditor';
import type { SourceImage, EditHistoryItem } from '../types';

const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (match && match[1] && match[2]) {
    return { mimeType: match[1], base64: match[2] };
  }
  return null;
};

const ImageViewerModal: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-500 transition shadow-lg z-10"
          aria-label="Close"
        >
          <Icon name="x-mark" className="w-5 h-5" />
        </button>
        <div className="p-3 flex-grow overflow-auto flex items-center justify-center">
          <img src={imageUrl} alt="Fullscreen view" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        </div>
      </div>
    </div>
  );
};

const ZoomEditorModal: React.FC<{
  image: SourceImage;
  initialDrawingData: ImageData | null;
  onClose: () => void;
  onSave: (finalDrawingData: ImageData) => void;
}> = ({ image, initialDrawingData, onClose, onSave }) => {
  const [brushSize, setBrushSize] = useState(40);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const imageEl = new Image();
    imageEl.src = `data:${image.mimeType};base64,${image.base64}`;
    imageEl.onload = () => {
      [imageCanvasRef, drawingCanvasRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = imageEl.width;
          ref.current.height = imageEl.height;
        }
      });
      const imgCtx = imageCanvasRef.current?.getContext('2d');
      imgCtx?.drawImage(imageEl, 0, 0);

      if (initialDrawingData) {
        const drawCtx = drawingCanvasRef.current?.getContext('2d');
        drawCtx?.putImageData(initialDrawingData, 0, 0);
        setDrawingHistory([initialDrawingData]);
      }
    };
  }, [image, initialDrawingData]);

  const getMousePos = (canvas: HTMLCanvasElement, evt: React.MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const pos = getMousePos(drawingCanvasRef.current!, e);
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getMousePos(drawingCanvasRef.current!, e);
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = `rgba(236, 72, 153, 0.72)`;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.closePath();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setDrawingHistory((prev) => [...prev, imageData]);
    }
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (drawingHistory.length === 0) return;
    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (newHistory.length > 0) {
        ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
      }
    }
  };

  const handleSave = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onSave(finalData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full h-full flex flex-col relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Icon name="brush" className="w-4 h-4 text-pink-400" />
              <span>Cỡ Cọ Vẽ Mask:</span>
              <input
                type="range"
                min="5"
                max="150"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-32 accent-pink-500"
              />
              <span className="font-mono text-pink-400">{brushSize}px</span>
            </label>
            <button
              onClick={handleUndo}
              disabled={drawingHistory.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition disabled:opacity-40"
            >
              <Icon name="arrow-uturn-left" className="w-3.5 h-3.5" /> Hoàn Tác
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg">
              Hủy
            </button>
            <button onClick={handleSave} className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow">
              ✓ Lưu Vùng Mask & Đóng
            </button>
          </div>
        </div>
        <div ref={containerRef} className="flex-grow w-full h-full p-4 studio-canvas-bg overflow-auto flex items-center justify-center">
          <div className="relative w-max h-max">
            <canvas ref={imageCanvasRef} className="max-w-full max-h-[80vh] object-contain block rounded-lg" />
            <canvas
              ref={drawingCanvasRef}
              className="absolute inset-0 w-full h-full object-contain cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface ImageEditorProps {
  initialImage: SourceImage | null;
  onClearInitialImage: () => void;
  onEditComplete: (details: {
    sourceImage: SourceImage;
    maskImage: SourceImage;
    prompt: string;
    resultImage: string;
  }) => void;
  historyItemToRestore: EditHistoryItem | null;
  onHistoryRestored: () => void;
  editHistory?: EditHistoryItem[];
  onClearEditHistory?: () => void;
}

const LIGHTING_PRESETS = [
  { label: '☀️ Ban ngày tự nhiên', value: 'natural daylight, bright and airy, sunlight casting soft realistic shadows' },
  { label: '🌅 Hoàng hôn ấm áp', value: 'warm golden hour sunset light coming through windows, cozy luxury atmosphere' },
  { label: '🌙 Đêm & Đèn hắt trần', value: 'night time interior scene, warm 3000K LED cove lighting and accent spotlights' },
  { label: '🎬 Ánh sáng Cinematic', value: 'cinematic architectural lighting, dramatic contrast, realistic reflections' }
];

export const ImageEditor: React.FC<ImageEditorProps> = ({
  initialImage,
  onClearInitialImage,
  onEditComplete,
  historyItemToRestore,
  onHistoryRestored,
  editHistory = [],
  onClearEditHistory
}) => {
  const [image, setImage] = useState<SourceImage | null>(null);
  const [referenceImage, setReferenceImage] = useState<SourceImage | null>(null);
  const [prompt, setPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(40);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [generationCount, setGenerationCount] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(50);

  const [isLoading, setIsLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isResultFullscreen, setIsResultFullscreen] = useState(false);
  const [isCameraRawOpen, setIsCameraRawOpen] = useState(false);
  const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);

  const sourceImageCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceDrawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const processRefFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        if (base64) {
          setReferenceImage({ base64, mimeType: file.type });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMask = useCallback(() => {
    const canvas = sourceDrawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDrawingHistory([]);
  }, []);

  const processFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        if (base64) {
          setImage({ base64, mimeType: file.type });
          setResultImages([]);
          setSelectedResultIndex(0);
          setCompareMode(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert('Vui lòng tải lên tệp ảnh hợp lệ (PNG, JPG, WEBP).');
    }
  };

  const drawImageOnCanvas = useCallback(() => {
    if (!image || !sourceImageCanvasRef.current || !sourceDrawingCanvasRef.current || !sourceContainerRef.current) return;

    const imageEl = new Image();
    imageEl.src = `data:${image.mimeType};base64,${image.base64}`;
    imageEl.onload = () => {
      const containerWidth = sourceContainerRef.current?.clientWidth ?? 360;
      const scale = Math.min(1, containerWidth / imageEl.width);
      const width = imageEl.width * scale;
      const height = imageEl.height * scale;

      sourceContainerRef.current!.style.aspectRatio = `${width} / ${height}`;

      [sourceImageCanvasRef, sourceDrawingCanvasRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = imageEl.width;
          ref.current.height = imageEl.height;
        }
      });

      const ctx = sourceImageCanvasRef.current?.getContext('2d');
      ctx?.drawImage(imageEl, 0, 0, imageEl.width, imageEl.height);
      clearMask();
    };
  }, [image, clearMask]);

  useEffect(() => {
    if (initialImage) {
      setImage(initialImage);
      setResultImages([]);
      setSelectedResultIndex(0);
      setCompareMode(false);
      setPrompt('');
      onClearInitialImage();
    }
  }, [initialImage, onClearInitialImage]);

  useEffect(() => {
    drawImageOnCanvas();
    window.addEventListener('resize', drawImageOnCanvas);
    return () => {
      window.removeEventListener('resize', drawImageOnCanvas);
    };
  }, [drawImageOnCanvas]);

  useEffect(() => {
    if (historyItemToRestore) {
      setImage(historyItemToRestore.sourceImage);
      setPrompt(historyItemToRestore.prompt);
      setResultImages([historyItemToRestore.resultImage]);
      setSelectedResultIndex(0);
      setCompareMode(false);
      clearMask();
      onHistoryRestored();
    }
  }, [historyItemToRestore, onHistoryRestored, clearMask]);

  const getMousePos = (canvas: HTMLCanvasElement, evt: MouseEvent | React.MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = useCallback((e: React.MouseEvent) => {
    setIsDrawing(true);
    const pos = getMousePos(sourceDrawingCanvasRef.current!, e);
    const ctx = sourceDrawingCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, []);

  const draw = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      const pos = getMousePos(sourceDrawingCanvasRef.current!, e);
      const ctx = sourceDrawingCanvasRef.current?.getContext('2d');
      if (!ctx) return;

      const nativeBrushSize =
        brushSize * (sourceDrawingCanvasRef.current!.width / sourceDrawingCanvasRef.current!.getBoundingClientRect().width);

      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = `rgba(236, 72, 153, 0.72)`;
      ctx.lineWidth = nativeBrushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
    [isDrawing, brushSize]
  );

  const stopDrawing = useCallback(() => {
    const canvas = sourceDrawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.closePath();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setDrawingHistory((prev) => [...prev, imageData]);
    }
    setIsDrawing(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (drawingHistory.length === 0) return;

    const newHistory = drawingHistory.slice(0, -1);
    setDrawingHistory(newHistory);

    const canvas = sourceDrawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (newHistory.length > 0) {
        ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
      }
    }
  }, [drawingHistory]);

  const handleZoomSave = useCallback((finalImageData: ImageData) => {
    const canvas = sourceDrawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(finalImageData, 0, 0);
      setDrawingHistory((prev) => [...prev, finalImageData]);
    }
    setIsZoomed(false);
  }, []);

  const handleCameraRawSave = useCallback(
    (editedImage: SourceImage) => {
      setResultImages((prev) => {
        const newResults = [...prev];
        newResults[selectedResultIndex] = `data:${editedImage.mimeType};base64,${editedImage.base64}`;
        return newResults;
      });
      setIsCameraRawOpen(false);
    },
    [selectedResultIndex]
  );

  const generateMaskImage = (): SourceImage | null => {
    const drawingCanvas = sourceDrawingCanvasRef.current;
    if (!drawingCanvas) return null;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = drawingCanvas.width;
    maskCanvas.height = drawingCanvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return null;

    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.drawImage(drawingCanvas, 0, 0);
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const dataUrl = maskCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    return { base64, mimeType: 'image/png' };
  };

  const handleGenerate = async () => {
    if (!image || !prompt) {
      alert('Vui lòng tải ảnh, bôi vùng hồng cần sửa và nhập mô tả chỉnh sửa.');
      return;
    }

    const maskImage = generateMaskImage();
    if (!maskImage) {
      alert('Không thể tạo vùng chọn (mask).');
      return;
    }

    setIsLoading(true);
    setResultImages([]);
    setSelectedResultIndex(0);
    setCompareMode(false);
    try {
      const results = await editImage(image, maskImage, prompt, generationCount, referenceImage);
      if (results && results.length > 0) {
        setResultImages(results);
        setSelectedResultIndex(0);
        onEditComplete({ sourceImage: image, maskImage, prompt, resultImage: results[0] });
      } else {
        throw new Error('API không trả về hình ảnh.');
      }
    } catch (error: any) {
      console.error('Image editing failed:', error);
      alert(`Lỗi khi chỉnh sửa ảnh: ${error?.message || 'Vui lòng thử lại.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueEditing = () => {
    const currentResult = resultImages[selectedResultIndex];
    if (!currentResult) return;
    const newSource = dataUrlToSourceImage(currentResult);
    if (newSource) {
      setImage(newSource);
      setResultImages([]);
      setSelectedResultIndex(0);
      setCompareMode(false);
    }
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[calc(100vh-5.5rem)]">
        {/* Left Studio Control Dock */}
        <div className="w-full lg:w-[380px] xl:w-[410px] flex-shrink-0 flex flex-col gap-4">
          <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Icon name="brush" className="w-4 h-4 text-pink-400" />
                <span>Canvas Inpainting & Khoanh Vùng</span>
              </h2>
              {image && (
                <button
                  onClick={() => {
                    setImage(null);
                    setResultImages([]);
                  }}
                  className="text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-lg"
                >
                  Đổi ảnh khác
                </button>
              )}
            </div>

            {image ? (
              <div className="space-y-3">
                <div ref={sourceContainerRef} className="relative group w-full rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950">
                  <canvas ref={sourceImageCanvasRef} className="w-full h-auto object-contain block" />
                  <canvas
                    ref={sourceDrawingCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-[10px] text-pink-300 px-2 py-0.5 rounded border border-pink-500/30 pointer-events-none">
                    🖌️ Tô vùng hồng lên vị trí cần sửa
                  </div>
                </div>

                {/* Brush Toolbar */}
                <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-semibold">Kích thước cọ vẽ:</span>
                    <span className="font-mono text-pink-400 font-bold">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => setIsZoomed(true)}
                      className="bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 font-semibold py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 transition"
                    >
                      <Icon name="arrows-pointing-out" className="w-3.5 h-3.5" /> Phóng To Vẽ
                    </button>
                    <button
                      onClick={handleUndo}
                      disabled={drawingHistory.length === 0}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 transition disabled:opacity-40"
                    >
                      <Icon name="arrow-uturn-left" className="w-3.5 h-3.5" /> Hoàn Tác
                    </button>
                    <button
                      onClick={clearMask}
                      className="bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-300 font-semibold py-1.5 px-2 rounded-lg text-[11px] transition"
                    >
                      Xóa Mask
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
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
                  className={`text-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer min-h-[170px] flex flex-col items-center justify-center ${
                    isDraggingOver
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700/80 bg-slate-900/40 hover:border-indigo-500/60 hover:bg-slate-900/70'
                  }`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mb-2">
                    <Icon name="brush" className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">Tải Ảnh Lên Để Khoanh Vùng Chỉnh Sửa</p>
                  <p className="text-[11px] text-slate-500 mt-1">Kéo thả hoặc nhấp chọn tệp (PNG, JPG, WEBP)</p>
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
              </>
            )}

            {/* Optional Reference Material/Object Image */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Ảnh Vật Liệu / Đồ Nội Thất Tham Chiếu (Tùy chọn)
              </label>
              {referenceImage ? (
                <div className="relative group rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 h-24">
                  <img
                    src={`data:${referenceImage.mimeType};base64,${referenceImage.base64}`}
                    alt="Reference"
                    className="w-full h-full object-contain"
                  />
                  <button
                    onClick={() => setReferenceImage(null)}
                    className="absolute top-1.5 right-1.5 bg-red-600/90 rounded-full text-white p-1 hover:bg-red-500 transition"
                  >
                    <Icon name="x-mark" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => refFileInputRef.current?.click()}
                    className="w-full border border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-xl p-2.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900/30 transition flex items-center justify-center gap-2"
                  >
                    <Icon name="photo" className="w-4 h-4 text-indigo-400" />
                    <span>+ Tải ảnh mẫu vật liệu / đồ rời muốn chèn</span>
                  </button>
                  <input
                    type="file"
                    ref={refFileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) processRefFile(e.target.files[0]);
                    }}
                    className="hidden"
                    accept="image/png, image/jpeg, image/webp"
                  />
                </>
              )}
            </div>

            {/* Prompt & Lighting Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Mô Tả Nội Dung Cần Sửa
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">Phương án:</span>
                  {[1, 2, 4].map((num) => (
                    <button
                      key={num}
                      onClick={() => setGenerationCount(num)}
                      className={`w-6 h-6 rounded-md text-[11px] font-bold transition ${
                        generationCount === num
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {num}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {LIGHTING_PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setPrompt((prev) => (prev ? `${prev}, ${preset.value}` : preset.value));
                    }}
                    className="bg-slate-900/80 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/40 text-slate-300 text-[10px] py-1 px-2 rounded-lg transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Ví dụ: thay sofa thành sofa da bò Ý màu cognac, thêm đèn thả pha lê, đổi sàn gạch sang gỗ óc chó..."
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />

              <button
                onClick={handleGenerate}
                disabled={isLoading || !image}
                className="w-full bg-gradient-to-r from-pink-600 via-indigo-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/50 text-xs"
              >
                <Icon name="sparkles" className="w-4 h-4" />
                <span>{isLoading ? 'Đang Inpainting Với Gemini AI...' : 'Thực Hiện Chỉnh Sửa Vùng Chọn'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Fullscreen Studio Viewport */}
        <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden min-h-[480px]">
          {/* Top Bar */}
          <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className="w-4 h-4 text-pink-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Kết Quả Inpainting & Hậu Kỳ Camera Raw
              </span>
            </div>

            <div className="flex items-center gap-2">
              {resultImages.length > 0 && image && (
                <button
                  onClick={() => setCompareMode(!compareMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    compareMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Icon name="arrows-right-left" className="w-3.5 h-3.5" />
                  <span>{compareMode ? 'Tắt So Sánh' : 'So Sánh Trước/Sau'}</span>
                </button>
              )}
              {resultImages.length > 0 && (
                <>
                  <button
                    onClick={() => setIsCameraRawOpen(true)}
                    className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                  >
                    <Icon name="adjustments-horizontal" className="w-3.5 h-3.5" />
                    <span>Camera Raw</span>
                  </button>
                  <button
                    onClick={handleContinueEditing}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    title="Dùng ảnh kết quả này để sửa tiếp vùng khác"
                  >
                    <Icon name="arrow-path" className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Sửa tiếp</span>
                  </button>
                  <button
                    onClick={() => setIsResultFullscreen(true)}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white p-1.5 rounded-lg transition"
                    title="Xem Toàn Màn Hình"
                  >
                    <Icon name="arrows-pointing-out" className="w-4 h-4" />
                  </button>
                  <DownloadDropdown imageUrl={resultImages[selectedResultIndex]} filenamePrefix="96ARCH-Inpaint" />
                </>
              )}
            </div>
          </div>

          {/* Main Canvas Area */}
          <div className="flex-grow studio-canvas-bg relative flex items-center justify-center p-4 overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full border-2 border-pink-500 border-t-transparent animate-spin mb-3"></div>
                <p className="text-sm font-bold text-slate-200">
                  Đang tái tạo vùng chọn ({generationCount} phương án)...
                </p>
                <p className="text-xs text-slate-500 mt-1">Hòa trộn ánh sáng & vật liệu tự nhiên với vùng xung quanh</p>
              </div>
            ) : resultImages.length > 0 ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {compareMode && image ? (
                  <div className="relative w-full h-[62vh] flex items-center justify-center select-none">
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      alt="Original"
                    />
                    <div
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }}
                    >
                      <img
                        src={resultImages[selectedResultIndex]}
                        className="w-full h-full object-contain"
                        alt="Edited"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderValue}
                      onChange={(e) => setSliderValue(Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10 shadow-[0_0_8px_rgba(0,0,0,0.8)]"
                      style={{ left: `${sliderValue}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white">
                        <Icon name="arrows-right-left" className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={resultImages[selectedResultIndex]}
                    alt="Edited result"
                    className="max-w-full max-h-[68vh] object-contain rounded-xl shadow-2xl"
                  />
                )}
              </div>
            ) : (
              <div className="text-center max-w-md p-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-600">
                  <Icon name="brush" className="w-8 h-8" />
                </div>
                <p className="text-sm font-semibold text-slate-300">
                  {image ? 'Tô vùng hồng trên ảnh gốc và bấm Thực Hiện Chỉnh Sửa' : 'Chưa có ảnh trong Canvas Inpainting'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Khoanh vùng bất kỳ chi tiết nào (bàn ghế, đèn, sàn, tường, cây xanh, mặt tiền...) để AI thay thế hoặc xóa bỏ chính xác mà vẫn giữ nguyên kết cấu xung quanh.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Strip: Result Variations + Edit History */}
          {(resultImages.length > 1 || editHistory.length > 0) && (
            <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between gap-4 overflow-x-auto">
              {resultImages.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Phương án:</span>
                  {resultImages.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedResultIndex(idx)}
                      className={`relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition ${
                        selectedResultIndex === idx ? 'border-indigo-500 glow-active' : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={imgUrl} className="w-full h-full object-cover" alt={`Result ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}

              {editHistory.length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Lịch sử sửa:</span>
                  <div className="flex items-center gap-1.5">
                    {editHistory.slice(0, 6).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setImage(item.sourceImage);
                          setPrompt(item.prompt);
                          setResultImages([item.resultImage]);
                          setSelectedResultIndex(0);
                        }}
                        title={item.prompt}
                        className="w-12 h-12 rounded-lg overflow-hidden border border-slate-800 hover:border-indigo-500 transition flex-shrink-0"
                      >
                        <img src={item.resultImage} alt={item.prompt} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  {onClearEditHistory && (
                    <button
                      onClick={onClearEditHistory}
                      className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1"
                      title="Xóa lịch sử sửa"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isZoomed && image && (
        <ZoomEditorModal
          image={image}
          initialDrawingData={drawingHistory.length > 0 ? drawingHistory[drawingHistory.length - 1] : null}
          onClose={() => setIsZoomed(false)}
          onSave={handleZoomSave}
        />
      )}
      {isResultFullscreen && resultImages.length > 0 && (
        <ImageViewerModal imageUrl={resultImages[selectedResultIndex]} onClose={() => setIsResultFullscreen(false)} />
      )}
      {isCameraRawOpen && resultImages.length > 0 && (
        <CameraRawEditor
          image={dataUrlToSourceImage(resultImages[selectedResultIndex])!}
          onClose={() => setIsCameraRawOpen(false)}
          onSave={handleCameraRawSave}
        />
      )}
    </>
  );
};
