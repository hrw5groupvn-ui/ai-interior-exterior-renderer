import React, { useState } from 'react';
import { Icon } from './icons';
import type { SourceImage } from '../types';
import { generateMagicPrompts, generateImages } from '../services/geminiService';
import { DownloadDropdown } from './DownloadDropdown';

// Reuse ImageUpload from App.tsx or UtilitiesTab.tsx. We'll duplicate a simplified version here for self-containment.
const ImageUpload: React.FC<{
    sourceImage: SourceImage | null;
    onImageUpload: (image: SourceImage) => void;
    onRemove: () => void;
    title?: string;
    heightClass?: string;
}> = ({ sourceImage, onImageUpload, onRemove, title = "Nhấp hoặc kéo tệp", heightClass = 'h-48' }) => {
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
        <div className="flex flex-col gap-2">
            {title && <label className="text-sm font-medium text-slate-300">{title}</label>}
            {!sourceImage ? (
                <div
                    className={`relative border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-6 transition-all duration-300 cursor-pointer ${heightClass} ${isDraggingOver ? 'border-indigo-400 bg-indigo-400/10' : 'border-slate-600 hover:border-indigo-500 hover:bg-slate-700/30'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Icon name="photo" className={`w-10 h-10 mb-3 ${isDraggingOver ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <p className={`text-sm text-center font-medium ${isDraggingOver ? 'text-indigo-300' : 'text-slate-400'}`}>
                        {isDraggingOver ? 'Thả ảnh vào đây' : title}
                    </p>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
                </div>
            ) : (
                <div className={`relative rounded-lg overflow-hidden border border-slate-700 group ${heightClass}`}>
                    <img src={sourceImage.dataUrl} alt="Uploaded" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <button onClick={onRemove} className="bg-red-500/80 hover:bg-red-500 text-white p-3 rounded-full transition-transform hover:scale-110">
                            <Icon name="trash" className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 shadow-2xl shadow-black/25 p-6 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-300 mb-4">{title}</h2>
        {children}
    </div>
);

export const MagicPromptTab: React.FC<{}> = () => {
    const [mainImage, setMainImage] = useState<SourceImage | null>(null);
    const [characterImage, setCharacterImage] = useState<SourceImage | null>(null);
    const [notes, setNotes] = useState('');
    const [prompts, setPrompts] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // State to handle generating image for a specific prompt
    const [generatingPromptIndex, setGeneratingPromptIndex] = useState<number | null>(null);
    const [generatedImages, setGeneratedImages] = useState<{[key: number]: string}>({});

    const handleAnalyze = async () => {
        if (!mainImage) {
            alert("Vui lòng tải lên ảnh chính để phân tích.");
            return;
        }
        setIsAnalyzing(true);
        setPrompts([]);
        setGeneratedImages({});
        try {
            const result = await generateMagicPrompts(mainImage, characterImage, notes);
            setPrompts(result);
        } catch (error) {
            console.error(error);
            alert("Đã xảy ra lỗi khi tạo prompt. Vui lòng thử lại.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerateImage = async (prompt: string, index: number) => {
        if (!mainImage) return;
        setGeneratingPromptIndex(index);
        try {
            // Using characterImage as reference if available, else just generate
            const images = await generateImages(mainImage, prompt, 'interior', 1, characterImage, false, true);
            if (images.length > 0) {
                setGeneratedImages(prev => ({ ...prev, [index]: images[0] }));
            }
        } catch (error) {
            console.error(error);
            alert("Lỗi khi tạo ảnh.");
        } finally {
            setGeneratingPromptIndex(null);
        }
    };

    return (
        <div className="text-white max-w-7xl mx-auto py-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <Section title="1. Ảnh Cần Phân Tích">
                        <ImageUpload 
                            sourceImage={mainImage}
                            onImageUpload={setMainImage}
                            onRemove={() => setMainImage(null)}
                            title="Ảnh chính (Kiến trúc/Nội thất/Hiện trạng)"
                        />
                    </Section>
                    
                    <Section title="2. Tùy Chọn Bổ Sung">
                        <div className="space-y-4">
                            <ImageUpload 
                                sourceImage={characterImage}
                                onImageUpload={setCharacterImage}
                                onRemove={() => setCharacterImage(null)}
                                title="Ảnh nhân vật (Tùy chọn - Face/Body)"
                                heightClass="h-32"
                            />
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">Bảng Ghi Chú Bổ Sung (Tùy chọn)</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Ví dụ: Tạo các phong cách tươi sáng, chú trọng vào ánh sáng tự nhiên..."
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24"
                                />
                            </div>
                        </div>
                    </Section>
                    
                    <button
                        onClick={handleAnalyze}
                        disabled={!mainImage || isAnalyzing}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:bg-slate-600 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
                    >
                        <Icon name="sparkles" className="w-5 h-5" />
                        {isAnalyzing ? 'Đang Phân Tích...' : 'Tạo 20 Magic Prompts'}
                    </button>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-2">
                    <Section title="3. Kết Quả Prompts">
                        {prompts.length === 0 && !isAnalyzing && (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                                <Icon name="sparkles" className="w-12 h-12 mb-4 text-slate-600" />
                                <p className="text-center">Kết quả 20 prompts chuyên nghiệp sẽ xuất hiện tại đây.</p>
                            </div>
                        )}
                        
                        {isAnalyzing && (
                            <div className="flex flex-col items-center justify-center p-12">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-400 mb-4"></div>
                                <p className="text-slate-300">AI đang phân tích và soạn thảo prompts...</p>
                            </div>
                        )}
                        
                        {prompts.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[800px] overflow-y-auto pr-2">
                                {prompts.map((prompt, idx) => (
                                    <div key={idx} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col gap-3 group hover:border-indigo-500/50 transition-colors">
                                        <div className="flex items-start gap-2">
                                            <span className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2 py-1 rounded">#{idx + 1}</span>
                                            <textarea
    value={prompt}
    onChange={(e) => {
        const newPrompts = [...prompts];
        newPrompts[idx] = e.target.value;
        setPrompts(newPrompts);
    }}
    className="w-full bg-slate-800/50 border border-slate-600 rounded-md p-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none h-32"
/>
                                        </div>
                                        
                                        {!generatedImages[idx] ? (
                                            <div className="mt-auto flex items-center justify-between gap-2">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(prompt);
                                                        alert("Đã sao chép prompt vào bộ nhớ tạm!");
                                                    }}
                                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                                                >
                                                    <Icon name="copy" className="w-3.5 h-3.5 text-indigo-400" />
                                                    Sao Chép
                                                </button>
                                                <button
                                                    onClick={() => handleGenerateImage(prompt, idx)}
                                                    disabled={generatingPromptIndex === idx}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50 shadow-md"
                                                >
                                                    {generatingPromptIndex === idx ? (
                                                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                                                    ) : (
                                                        <Icon name="photo" className="w-3.5 h-3.5" />
                                                    )}
                                                    {generatingPromptIndex === idx ? 'Đang Tạo...' : 'Tạo Ảnh'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="mt-2 relative rounded-xl overflow-hidden group/img border border-slate-700">
                                                <img src={generatedImages[idx]} alt={`Generated ${idx}`} className="w-full h-auto object-cover rounded-xl" />
                                                <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                    <DownloadDropdown imageUrl={generatedImages[idx]} filenamePrefix={`magic-prompt-${idx}`} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </div>
    );
};
