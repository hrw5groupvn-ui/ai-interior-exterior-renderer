import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './icons';
import type { SourceImage } from '../types';

interface CameraRawEditorProps {
    image: SourceImage;
    onClose: () => void;
    onSave: (editedImage: SourceImage) => void;
}

export const CameraRawEditor: React.FC<CameraRawEditorProps> = ({ image, onClose, onSave }) => {
    const [exposure, setExposure] = useState(100); // %
    const [contrast, setContrast] = useState(100); // %
    const [saturation, setSaturation] = useState(100); // %
    const [temperature, setTemperature] = useState(0); // -100 to 100
    const [tint, setTint] = useState(0); // -100 to 100
    const [sepia, setSepia] = useState(0); // %
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const img = new Image();
        img.src = `data:${image.mimeType};base64,${image.base64}`;
        img.onload = () => {
            // Resize canvas to match image dimensions for high quality
            canvas.width = img.width;
            canvas.height = img.height;

            // Apply filters
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // CSS filter string
            // We use standard CSS filters supported by canvas ctx.filter
            // Temperature/Tint is tricky, but we can approximate it:
            // Sepia + Hue-rotate can simulate temperature to some degree, but
            // A simpler approach for Canvas is just applying contrast, brightness, saturate.
            // For temperature (orange/blue), we can overlay a color with blending.
            
            ctx.filter = `brightness(${exposure}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%)`;
            ctx.drawImage(img, 0, 0);
            ctx.filter = 'none';

            // Apply Temperature (Warmth) & Tint
            if (temperature !== 0 || tint !== 0) {
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillStyle = temperature > 0 ? `rgba(255, 150, 0, ${temperature / 200})` : `rgba(0, 150, 255, ${Math.abs(temperature) / 200})`;
                if(temperature !== 0) ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = tint > 0 ? `rgba(255, 0, 255, ${tint / 200})` : `rgba(0, 255, 0, ${Math.abs(tint) / 200})`;
                if(tint !== 0) ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.globalCompositeOperation = 'source-over';
            }
        };
    }, [image, exposure, contrast, saturation, temperature, tint, sepia]);

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
        onSave({ base64, mimeType: 'image/jpeg' });
    };

    const resetFilters = () => {
        setExposure(100);
        setContrast(100);
        setSaturation(100);
        setTemperature(0);
        setTint(0);
        setSepia(0);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col md:flex-row overflow-hidden">
                {/* Image Preview */}
                <div className="flex-1 relative bg-black/50 p-4 flex items-center justify-center overflow-hidden min-h-[40vh] md:min-h-0" ref={containerRef}>
                    <canvas 
                        ref={canvasRef} 
                        className="max-w-full max-h-full object-contain rounded shadow-lg"
                    />
                </div>

                {/* Controls Sidebar */}
                <div className="w-full md:w-80 bg-slate-800 p-6 flex flex-col gap-6 overflow-y-auto border-l border-slate-700">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-700">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Icon name="adjustments-horizontal" className="w-5 h-5" />
                            Camera Raw
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <Icon name="x-mark" className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <ControlSlider label="Phơi sáng (Exposure)" value={exposure} min={0} max={200} onChange={setExposure} unit="%" />
                        <ControlSlider label="Độ tương phản (Contrast)" value={contrast} min={0} max={200} onChange={setContrast} unit="%" />
                        <ControlSlider label="Độ bão hòa (Saturation)" value={saturation} min={0} max={200} onChange={setSaturation} unit="%" />
                        <ControlSlider label="Nhiệt độ màu (Temp)" value={temperature} min={-100} max={100} onChange={setTemperature} />
                        <ControlSlider label="Sắc độ (Tint)" value={tint} min={-100} max={100} onChange={setTint} />
                        <ControlSlider label="Sepia (Cổ điển)" value={sepia} min={0} max={100} onChange={setSepia} unit="%" />
                    </div>

                    <div className="mt-auto pt-6 border-t border-slate-700 flex gap-3">
                        <button onClick={resetFilters} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded font-medium transition-colors">
                            Đặt lại
                        </button>
                        <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded font-medium transition-colors flex items-center justify-center gap-2">
                            <Icon name="check" className="w-4 h-4" /> Lưu
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ControlSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
    unit?: string;
}> = ({ label, value, min, max, onChange, unit = '' }) => (
    <div>
        <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300">{label}</span>
            <span className="text-slate-400 font-mono">{value}{unit}</span>
        </div>
        <input 
            type="range" 
            min={min} max={max} 
            value={value} 
            onChange={e => onChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
    </div>
);
