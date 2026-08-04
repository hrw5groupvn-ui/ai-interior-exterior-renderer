import React, { useState, useMemo } from 'react';
import { Icon } from './icons';
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
        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#3c2a1e] hover:bg-[#4a3528] transition-colors text-slate-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
        <Icon name={icon} className="w-6 h-6" />
        <span>{label}</span>
    </button>
);

export const VirtualTourTab: React.FC = () => {
    const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [movementDegree, setMovementDegree] = useState<15 | 30 | 45>(30);

    const currentImage = useMemo(() => {
        if (historyIndex >= 0 && historyIndex < history.length) {
            return history[historyIndex];
        }
        return null;
    }, [history, historyIndex]);

    const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
        const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
            return { mimeType: match[1], base64: match[2] };
        }
        return null;
    }

    const handleImageUpload = (image: SourceImage) => {
        const imageUrl = `data:${image.mimeType};base64,${image.base64}`;
        setSourceImage(image);
        setHistory([imageUrl]);
        setHistoryIndex(0);
    };

    const handleAction = async (action: string) => {
        if (!currentImage) {
            alert("Vui lòng tải lên một ảnh để bắt đầu.");
            return;
        }

        const imageForGeneration = dataUrlToSourceImage(currentImage);
        if (!imageForGeneration) {
            alert("Định dạng ảnh không hợp lệ.");
            return;
        }

        let prompt = '';
        switch (action) {
            case 'pan-up': prompt = `pan camera up by ${movementDegree} degrees`; break;
            case 'pan-down': prompt = `pan camera down by ${movementDegree} degrees`; break;
            case 'pan-left': prompt = `pan camera left by ${movementDegree} degrees`; break;
            case 'pan-right': prompt = `pan camera right by ${movementDegree} degrees`; break;
            case 'orbit-left': prompt = `orbit camera left by ${movementDegree} degrees`; break;
            case 'orbit-right': prompt = `orbit camera right by ${movementDegree} degrees`; break;
            case 'zoom-in': prompt = `zoom in slightly`; break;
            case 'zoom-out': prompt = `zoom out slightly`; break;
            default: return;
        }

        setIsLoading(true);
        try {
            const images = await generateImages(imageForGeneration, prompt, 'interior', 1, null, true);
            if (images.length > 0 && images[0]) {
                const newHistory = [...history.slice(0, historyIndex + 1), images[0]];
                setHistory(newHistory);
                setHistoryIndex(newHistory.length - 1);
            } else {
                throw new Error("AI không thể tạo ảnh mới.");
            }
        } catch (error) {
            console.error("Virtual tour action failed:", error);
            alert("Đã xảy ra lỗi khi điều hướng ảnh. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
        }
    };
    
    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ backgroundColor: '#1c110a' }}>
            {/* Left Column - Controls */}
            <div className="lg:col-span-1 p-6 rounded-xl flex flex-col gap-6">
                {!sourceImage ? (
                    <div className="bg-[#2a1a0e] p-6 rounded-xl border border-slate-700/50">
                        <h2 className="text-lg font-semibold text-slate-300 mb-4">1. Tải Lên Ảnh Tham Quan</h2>
                        <div
                            className={`relative group border-2 border-dashed rounded-lg p-4 flex items-center justify-center h-48 mb-4 border-slate-600`}
                        >
                            <div className="text-center text-slate-400 pointer-events-none">
                                <p>Tải lên một ảnh để bắt đầu tham quan ảo.</p>
                                <p className="text-xs">PNG, JPG, WEBP</p>
                            </div>
                        </div>
                        <label className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded transition-colors text-center cursor-pointer block">
                            Tải Ảnh
                            <input type="file" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                     if (file && file.type.startsWith('image/')) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            const base64 = (ev.target?.result as string).split(',')[1];
                                            if (base64) {
                                                handleImageUpload({ base64, mimeType: file.type });
                                            }
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }
                            }} className="hidden" accept="image/png, image/jpeg, image/webp" />
                        </label>
                    </div>
                ) : (
                    <div className="bg-[#2a1a0e] p-6 rounded-xl border border-slate-700/50 space-y-8">
                        {/* Movement Degree */}
                        <div>
                            <h3 className="font-semibold text-slate-300 mb-2">Mức độ di chuyển</h3>
                            <div className="flex bg-[#3c2a1e] rounded-lg p-1">
                                {([15, 30, 45] as const).map(deg => (
                                    <button
                                        key={deg}
                                        onClick={() => setMovementDegree(deg)}
                                        className={`flex-1 text-center font-bold py-2 rounded-md transition-colors text-sm ${movementDegree === deg ? 'bg-orange-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/10'}`}
                                    >
                                        {deg}°
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">Áp dụng cho Pan và Orbit. Zoom có mức độ cố định.</p>
                        </div>

                        {/* Pan Controls */}
                        <div className="text-center">
                            <h3 className="font-semibold text-slate-300 mb-3">Pan (Xoay camera tại chỗ)</h3>
                            <div className="grid grid-cols-3 gap-2 w-4/5 mx-auto">
                                <div />
                                <NavButton icon="arrow-up" label="Lên" onClick={() => handleAction('pan-up')} disabled={isLoading} />
                                <div />
                                <NavButton icon="arrow-left" label="Trái" onClick={() => handleAction('pan-left')} disabled={isLoading} />
                                <div className="flex items-center justify-center">
                                    <div className="w-4 h-4 bg-slate-500 rounded-full animate-pulse"></div>
                                </div>
                                <NavButton icon="arrow-right" label="Phải" onClick={() => handleAction('pan-right')} disabled={isLoading}/>
                                <div />
                                <NavButton icon="arrow-down" label="Xuống" onClick={() => handleAction('pan-down')} disabled={isLoading} />
                                <div />
                            </div>
                        </div>

                        {/* Orbit and Zoom */}
                        <div className="grid grid-cols-2 gap-6 text-center">
                            <div>
                                <h3 className="font-semibold text-slate-300 mb-3">Orbit (Quỹ đạo)</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <NavButton icon="arrow-uturn-left" label="Quay Trái" onClick={() => handleAction('orbit-left')} disabled={isLoading} />
                                    <NavButton icon="arrow-uturn-right" label="Quay Phải" onClick={() => handleAction('orbit-right')} disabled={isLoading} />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-300 mb-3">Zoom</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <NavButton icon="magnifying-glass-plus" label="Gần Lại" onClick={() => handleAction('zoom-in')} disabled={isLoading} />
                                    <NavButton icon="magnifying-glass-minus" label="Ra Xa" onClick={() => handleAction('zoom-out')} disabled={isLoading}/>
                                </div>
                            </div>
                        </div>

                        {/* Undo/Redo */}
                        <div className="grid grid-cols-2 gap-3 pt-4">
                            <button onClick={handleUndo} disabled={!canUndo || isLoading} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-[#5a3a2a] hover:bg-[#6b4a3a] text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <Icon name="arrow-uturn-left" className="w-5 h-5" />
                                Hoàn Tác ({historyIndex})
                            </button>
                            <button onClick={handleRedo} disabled={!canRedo || isLoading} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-[#5a3a2a] hover:bg-[#6b4a3a] text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <Icon name="arrow-uturn-right" className="w-5 h-5" />
                                Làm Lại ({history.length - 1 - historyIndex})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column - Image Viewer */}
            <div className="lg:col-span-2 bg-black/30 p-6 rounded-xl flex items-center justify-center min-h-[60vh] lg:min-h-0">
                <div className="w-full h-full flex items-center justify-center relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-100"></div>
                            <p className="mt-4 font-semibold text-slate-200">AI đang tạo góc nhìn mới...</p>
                        </div>
                    )}
                    {currentImage ? (
                        <img
                            src={currentImage}
                            alt="Virtual tour view"
                            className={`max-w-full max-h-full object-contain rounded-md transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}
                        />
                    ) : (
                        <div className="text-center text-slate-500">
                            <p className="text-lg">Khu vực hiển thị ảnh</p>
                            <p>Tải lên một ảnh để bắt đầu.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};