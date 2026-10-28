
import React, { useState, useCallback } from 'react';
import { Icon } from './icons';
import { DownloadDropdown } from './DownloadDropdown';
import type { SourceImage } from '../types';
import { generateImages, generateImageFromText } from '../services/geminiService';

// --- Reusable Components (Copied from App.tsx for encapsulation) ---

const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="glass-panel border border-slate-800/80 shadow-xl p-5 rounded-2xl">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3.5 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500"></span>
            {title}
        </h2>
        {children}
    </div>
);

const ImageUpload: React.FC<{
    sourceImage: SourceImage | null;
    onImageUpload: (image: SourceImage) => void;
    onRemove: () => void;
    title?: string;
    heightClass?: string;
}> = ({ sourceImage, onImageUpload, onRemove, title = "Nhấp hoặc kéo tệp vào đây", heightClass = 'h-48' }) => {
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
            alert("Vui lòng tải lên một tệp ảnh hợp lệ (PNG, JPG, WEBP).");
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove();
    }

    return (
        <div>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative group border-2 border-dashed rounded-lg p-4 flex items-center justify-center ${heightClass} mb-4 hover:border-indigo-500 transition-colors cursor-pointer ${isDraggingOver ? 'border-indigo-500 bg-slate-700/50' : 'border-slate-600'}`}
                onClick={() => fileInputRef.current?.click()}
            >
                {sourceImage ? (
                    <>
                        <img src={`data:${sourceImage.mimeType};base64,${sourceImage.base64}`} alt="Source" className="max-h-full max-w-full object-contain rounded" />
                        <button onClick={handleRemove} className="absolute top-1 right-1 bg-black/50 rounded-full text-white hover:bg-black/80 p-0.5 transition-colors opacity-0 group-hover:opacity-100 z-10" aria-label="Remove source image">
                            <Icon name="x-circle" className="w-5 h-5" />
                        </button>
                    </>
                ) : (
                    <div className="text-center text-slate-400 pointer-events-none">
                        <p>{title}</p>
                        <p className="text-xs">PNG, JPG, WEBP</p>
                    </div>
                )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
        </div>
    );
};

const ImageViewerModal: React.FC<{ imageUrl: string; onClose: () => void; }> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900/80 backdrop-blur-lg border border-slate-700/50 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700 transition-transform duration-200 hover:scale-110 z-10"
          aria-label="Close"
        >
          <Icon name="x-mark" className="w-6 h-6" />
        </button>
        <div className="p-2 flex-grow overflow-auto flex items-center justify-center">
            <img src={imageUrl} alt="Fullscreen view" className="max-w-full max-h-full object-contain rounded-md" />
        </div>
      </div>
    </div>
  );
};

// --- Task Definitions ---

type TaskService = 'generateImageFromText' | 'generateImages' | 'generateImagesWithReference' | 'generateTwoImages' | 'custom_pdf';

interface PredefinedPrompt {
    label: string;
    value: string;
}

interface UtilityTaskDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    inputs: 0 | 1 | 2 | 'multiple';
    inputLabels?: string[];
    promptPlaceholder: string;
    service: TaskService;
    promptEngineer?: (prompt: string) => string;
    predefinedPrompts?: PredefinedPrompt[];
}

const UTILITY_TASKS: UtilityTaskDef[] = [
    {
        id: 'extract_3d_maps',
        name: 'Tách Map Material 3D',
        description: 'Tách ảnh texture thành các map chính dùng trong 3D: Diffuse, Reflection, Roughness, Metallic, Normal.',
        icon: 'cube',
        inputs: 1,
        inputLabels: ['Ảnh Texture'],
        service: 'generateImages',
        promptPlaceholder: 'Mô tả texture (nếu cần)',
        promptEngineer: (p) => `You are an expert 3D material artist. The user has provided an image of a texture or material. Your task is to extract or generate standard PBR texture maps based on the specific map requested by the user: "${p}". Make the output exactly as a standard PBR map (e.g., flat colors for Albedo, grayscale for Roughness/Metallic/Reflection, and blueish-purple for Normal map).`,
        predefinedPrompts: [
            { label: 'Kênh khuếch tán (Diffuse/Albedo)', value: 'Extract the Diffuse (Albedo) map. Show only the flat base color and pattern without any lighting, shadows, or reflections.' },
            { label: 'Kênh độ phản xạ (Reflection)', value: 'Extract the Reflection map. Generate a grayscale image where lighter areas are more reflective.' },
            { label: 'Kênh độ nhám (Roughness)', value: 'Extract the Roughness map. Generate a grayscale image where white means perfectly rough and black means perfectly smooth.' },
            { label: 'Kênh kim loại (Metallic)', value: 'Extract the Metallic map. Generate a grayscale image where white represents metallic parts and black represents non-metallic/dielectric parts.' },
            { label: 'Kênh độ nổi/gồ ghề (Normal/Bump)', value: 'Extract the Normal map. Generate an RGB image in standard tangent space normal map colors (predominantly bluish-purple) representing surface bumps and depth.' }
        ]
    },
    {
        id: 'construction_stages',
        name: 'Giai Đoạn Thi Công',
        description: 'Tái hiện lại các giai đoạn thi công trong thực tế như bãi đất trống, tập kết vật liệu, phần thô, hoàn thiện sơn và cửa, cảnh quan.',
        icon: 'building-office',
        inputs: 1,
        inputLabels: ['Ảnh Công Trình'],
        service: 'generateImages',
        promptPlaceholder: 'Ví dụ: hiển thị dưới dạng bãi đất trống chưa thi công',
        promptEngineer: (p) => `You are an expert architectural visualizer. The user has provided an image of an architectural project. Your task is to re-render this exact scene, keeping the camera angle and environment scale the same, but completely changing the state of the construction based on the user's text prompt. The user's request is to show this stage: "${p}". Make sure the result looks realistic and matches the requested construction stage.`,
        predefinedPrompts: [
            { label: 'Bãi đất trống', value: 'biến công trình thành bãi đất trống chưa thi công, chỉ có nền đất' },
            { label: 'Tập kết vật liệu', value: 'biến công trình thành giai đoạn tập kết vật liệu xây dựng như gạch, cát, thép trên nền đất' },
            { label: 'Xây dựng phần thô', value: 'biến công trình thành giai đoạn xây dựng phần thô, kết cấu bê tông, tường gạch đỏ chưa trát' },
            { label: 'Hoàn thiện sơn và cửa', value: 'biến công trình thành giai đoạn hoàn thiện, đã sơn lót, đang lắp đặt cửa sổ và cửa ra vào' },
            { label: 'Hoàn thiện cảnh quan', value: 'biến công trình thành giai đoạn hoàn thiện cảnh quan, trồng cây, lát gạch sân vườn' }
        ]
    },
    {
        id: 'render_from_moodboard', name: 'Tạo 3D Render từ Moodboard', description: 'Tải lên moodboard và mô tả căn phòng để tạo ảnh render 3D.', icon: 'cube',
        inputs: 1, inputLabels: ['Ảnh Moodboard'], service: 'generateImages', promptPlaceholder: 'Ví dụ: phòng khách hiện đại, ánh sáng ban ngày',
        promptEngineer: (p) => `Tạo một ảnh render 3D nội thất siêu thực tế của một căn phòng dựa trên bảng vật liệu, màu sắc và phong cách từ hình ảnh moodboard được cung cấp. Yêu cầu của người dùng là: "${p}".`
    },
    {
        id: 'change_style', name: 'Đổi Style Công Trình', description: 'Giữ nguyên kiến trúc từ ảnh gốc, nhưng áp dụng phong cách từ ảnh tham khảo.', icon: 'arrows-right-left',
        inputs: 2, inputLabels: ['Ảnh Công Trình Gốc', 'Ảnh Style Tham Khảo'], service: 'generateImagesWithReference', promptPlaceholder: 'Ví dụ: áp dụng style hoàng hôn vào ban ngày',
        promptEngineer: (p) => `The user's prompt is: "${p}". You are creating a realistic architectural render. The first image is the architectural sketch. You MUST use the exact structure, form, and layout from this first sketch. The second image is a reference for style ONLY. You must apply the mood, lighting, and color palette from the second image to the room from the first sketch. It is forbidden to copy any shapes, objects, architectural elements, or scene composition (like window frames or foreground elements) from the second style-reference image. The final render must be an interior shot based on the user's prompt.`
    },
    {
        id: 'change_interior_style',
        name: 'Đổi Style Nội Thất',
        description: 'Giữ nguyên bố cục phòng, chỉ thay đổi style nội thất theo mô tả.',
        icon: 'sparkles',
        inputs: 1,
        inputLabels: ['Ảnh Nội Thất Gốc'],
        service: 'generateImages',
        promptPlaceholder: 'Ví dụ: đổi thành phong cách tân cổ điển với tông màu vàng gold',
        promptEngineer: (p: string) => `You are an expert interior designer AI. The user has provided an image of a room. Your task is to re-render this exact room, keeping the layout, camera angle, and architectural elements (walls, windows, doors) the same, but completely changing the interior design style based on the user's text prompt. The user's request is: "${p}". Do not change the structure of the room.`,
        predefinedPrompts: [
            { label: 'Phong cách Tối giản (Minimalism)', value: 'đổi style của căn phòng này thành phong cách Tối giản (Minimalism)' },
            { label: 'Phong cách Hiện đại (Modern)', value: 'đổi style của căn phòng này thành phong cách Hiện đại (Modern)' },
            { label: 'Phong cách Bắc Âu (Scandinavian)', value: 'đổi style của căn phòng này thành phong cách Bắc Âu (Scandinavian)' },
            { label: 'Phong cách Công nghiệp (Industrial)', value: 'đổi style của căn phòng này thành phong cách Công nghiệp (Industrial)' },
            { label: 'Phong cách Wabi-sabi', value: 'đổi style của căn phòng này thành phong cách Wabi-sabi' },
            { label: 'Phong cách Bohemian', value: 'đổi style của căn phòng này thành phong cách Bohemian' },
            { label: 'Phong cách Tân cổ điển (Neoclassical)', value: 'đổi style của căn phòng này thành phong cách Tân cổ điển (Neoclassical)' },
            { label: 'Phong cách Coastal (Ven biển)', value: 'đổi style của căn phòng này thành phong cách Coastal (Ven biển)' },
            { label: 'Phong cách Mid-Century Modern', value: 'đổi style của căn phòng này thành phong cách Mid-Century Modern' },
            { label: 'Phong cách Art Deco', value: 'đổi style của căn phòng này thành phong cách Art Deco' },
        ]
    },
    {
        id: 'insert_building', name: 'Chèn công trình vào hiện trạng', description: 'Ghép ảnh công trình của bạn vào một bức ảnh nền hiện trạng một cách chân thực.', icon: 'photo',
        inputs: 2, inputLabels: ['Ảnh Công Trình (nền trắng)', 'Ảnh Hiện Trạng'], service: 'generateImagesWithReference', promptPlaceholder: 'Ví dụ: đặt vào khu đất trống, điều chỉnh ánh sáng cho phù hợp, bóng đổ mềm',
        promptEngineer: (p: string) => `You are an expert architectural visualizer and photo editor. The user has provided two images. The first image is an architectural building, likely with a plain background. The second image is a photo of the existing site/location. Your task is to seamlessly photoshop the building from the first image into the site from the second image. Pay close attention to scale, perspective, lighting, and shadows to make the composition look photorealistic. The user's specific instructions are: "${p}".`,
        predefinedPrompts: [
            {
                label: 'Chèn nhà vào vùng đỏ (ảnh thật)',
                value: 'Place the house in img 2 into the red zone in the img 1. and turn it into a real photo.'
            },
            {
                label: 'Chèn ảnh 2D vào vùng đỏ (thành 3D)',
                value: 'Place the 2d photo in img 2 into the red zone in the img 1. and turn it into a 3d real photo.'
            }
        ]
    },
    {
        id: 'perspective_from_plan', name: 'Tạo phối cảnh từ tổng thể', description: 'Tải lên bản vẽ tổng thể có đánh dấu hướng nhìn để tạo góc phối cảnh.', icon: 'viewfinder',
        inputs: 1, inputLabels: ['Bản vẽ tổng thể (có đánh dấu)'], service: 'generateImages', promptPlaceholder: 'Ví dụ: render 3D, phong cách hiện đại, buổi chiều nắng',
        promptEngineer: (p: string) => `The user has provided a 2D master plan image that includes hand-drawn lines or arrows indicating a specific camera position and viewing direction. Your task is to interpret this drawing and generate a photorealistic 3D perspective view from that exact angle. Create a full 3D scene based on the layout in the plan. The user's specific request for style and mood is: "${p}".`
    },
    {
        id: '3d_to_2d', name: 'Biến ảnh 3D thành bản vẽ 2D', description: 'Chuyển đổi một ảnh render 3D thành một bản vẽ kỹ thuật dạng đường nét.', icon: 'pencil',
        inputs: 1, inputLabels: ['Ảnh Render 3D'], service: 'generateImages', promptPlaceholder: 'Ví dụ: bản vẽ mặt đứng chính diện, nét mảnh',
        promptEngineer: (p) => `Chuyển đổi hình ảnh 3D siêu thực này thành một bản vẽ kiến trúc 2D dạng đường nét kỹ thuật. Giữ lại tất cả các chi tiết và tỷ lệ một cách chính xác. Yêu cầu cụ thể của người dùng là: "${p}".`,
        predefinedPrompts: [{
            label: 'Tạo 4 góc nhìn (Trước, Sau, Trái, Trên)',
            value: 'Sử dụng ảnh kiến ​​trúc được cung cấp làm tham chiếu. Tạo các góc nhìn Mặt trước, Mặt sau, Trái, Trên trên nền trắng. Khoảng cách đều nhau.'
        }]
    },
    {
        id: 'color_floorplan', name: 'Đổ màu & bóng cho Floorplan', description: 'Thêm màu sắc, vật liệu và bóng đổ để floorplan 2D trông chuyên nghiệp hơn.', icon: 'brush',
        inputs: 1, inputLabels: ['Ảnh Floorplan 2D'], service: 'generateImages', promptPlaceholder: 'Ví dụ: sàn gỗ, tường trắng, thêm cây xanh',
        promptEngineer: (p) => `Render một phiên bản chất lượng cao của floorplan 2D này với góc nhìn từ trên xuống. Thêm vật liệu thực tế (như gỗ cho sàn, gạch cho phòng tắm) và bóng đổ mềm để tạo cảm giác chiều sâu. Không chuyển đổi nó thành dạng xem phối cảnh 3D. Yêu cầu của người dùng là: "${p}".`,
    },
    {
        id: 'image_to_3d_model', name: 'Ảnh thành Mô hình 3D', description: 'Biến ảnh chụp thành một mô hình 3D nhỏ đặt trên bàn làm việc.', icon: 'cube',
        inputs: 1, inputLabels: ['Ảnh Công trình / Sản phẩm'], service: 'generateImages', promptPlaceholder: 'Ví dụ: đặt trên bàn làm việc bằng gỗ sồi, có dụng cụ kiến trúc xung quanh',
        promptEngineer: (p) => `Tạo một hình ảnh siêu thực của một mô hình kiến trúc 3D thu nhỏ của tòa nhà từ hình ảnh được cung cấp. Mô hình phải được đặt trên bàn làm việc bằng gỗ của kiến trúc sư. Cảnh nên có độ sâu trường ảnh nông, tập trung vào mô hình. Yêu cầu cụ thể của người dùng là: "${p}".`,
    },
    {
        id: 'remove_watermark', name: 'Xóa Watermark', description: 'Tự động xóa watermark hoặc văn bản trên ảnh.', icon: 'x-circle',
        inputs: 1, inputLabels: ['Ảnh có Watermark'], service: 'generateImages', promptPlaceholder: 'Có thể để trống, hoặc mô tả vị trí watermark nếu cần.',
        promptEngineer: (p) => `Xóa các watermark hoặc bất kỳ văn bản nào trên hình ảnh này. Yêu cầu thêm của người dùng: "${p}"`,
    },
    {
        id: 'export_to_pdf', name: 'Xuất Ảnh Sang PDF', description: 'Chuyển đổi hình ảnh (ví dụ: floorplan, render) thành tài liệu PDF chuyên nghiệp để trình bày khách hàng.', icon: 'photo',
        inputs: 'multiple', inputLabels: ['Thêm ảnh'], service: 'custom_pdf', promptPlaceholder: 'Tên hoặc tiêu đề tài liệu (sẽ được in trên PDF)',
        promptEngineer: (p) => p,
    }
];


// --- Runner Component ---


const AdjustableResultImage: React.FC<{
    res: {label?: string, url: string};
    idx: number;
    taskId: string;
    onFullscreen: (url: string) => void;
    onEdit: (url: string) => void;
}> = ({ res, idx, taskId, onFullscreen, onEdit }) => {
    const [contrast, setContrast] = useState(100);
    const [brightness, setBrightness] = useState(100);
    const [adjustedUrl, setAdjustedUrl] = useState(res.url);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const imgRef = React.useRef<HTMLImageElement>(null);

    React.useEffect(() => {
        // Reset when res.url changes
        setContrast(100);
        setBrightness(100);
        setAdjustedUrl(res.url);
    }, [res.url]);

    React.useEffect(() => {
        if (contrast === 100 && brightness === 100) {
            setAdjustedUrl(res.url);
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = res.url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            // Apply CSS filter to context
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            setAdjustedUrl(canvas.toDataURL('image/jpeg', 0.95));
        };
    }, [contrast, brightness, res.url]);

    return (
        <div className="relative group w-full h-full flex flex-col items-center justify-center bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
            {res.label && <h4 className="text-sm font-bold text-slate-200 mb-2">{res.label}</h4>}
            
            <div className="relative flex-grow flex items-center justify-center w-full overflow-hidden">
                <img src={adjustedUrl} alt="Utility result" className="max-w-full max-h-full object-contain rounded-md transition-all"/>
            </div>

            {taskId === 'extract_3d_maps' && (
                <div className="w-full mt-4 space-y-3 px-2">
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Sáng: {brightness}%</span>
                            <button onClick={() => setBrightness(100)} className="hover:text-indigo-400">Reset</button>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="200" 
                            value={brightness} 
                            onChange={e => setBrightness(Number(e.target.value))}
                            className="w-full accent-indigo-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Tương phản: {contrast}%</span>
                            <button onClick={() => setContrast(100)} className="hover:text-indigo-400">Reset</button>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="200" 
                            value={contrast} 
                            onChange={e => setContrast(Number(e.target.value))}
                            className="w-full accent-indigo-500"
                        />
                    </div>
                </div>
            )}

            <div className="absolute top-8 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                <button
                    onClick={() => onFullscreen(adjustedUrl)}
                    className="bg-slate-800/90 backdrop-blur-sm border border-slate-600 hover:bg-indigo-600 text-white font-bold text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5"
                    title="Xem Toàn Màn Hình"
                >
                    <Icon name="arrows-expand" className="w-4 h-4" />
                    <span>Phóng To</span>
                </button>
                <button
                    onClick={() => onEdit(adjustedUrl)}
                    className="bg-slate-800/90 backdrop-blur-sm border border-slate-600 hover:bg-indigo-600 text-white font-bold text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5"
                    title="Chỉnh Sửa Ảnh Này"
                >
                    <Icon name="pencil" className="w-4 h-4" />
                    <span>Sửa</span>
                </button>
                <DownloadDropdown imageUrl={adjustedUrl} filenamePrefix={`96-ARCH-AI-utility-${taskId}-${idx}`} />
            </div>
        </div>
    );
};

const UtilityRunner: React.FC<{ 
    task: UtilityTaskDef; 
    onBack: () => void;
    onEditRequest: (imageUrl: string) => void;
}> = ({ task, onBack, onEditRequest }) => {
    const [sourceImage1, setSourceImage1] = useState<SourceImage | null>(null);
    const [sourceImage2, setSourceImage2] = useState<SourceImage | null>(null);
    const [multipleImages, setMultipleImages] = useState<{image: SourceImage, note: string}[]>([]);
    const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
    const [prompt, setPrompt] = useState('');
    const [resultImages, setResultImages] = useState<{label?: string, url: string}[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isResultFullscreen, setIsResultFullscreen] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsLoading(true);
        setResultImages(null);
        try {
            if (task.service === 'custom_pdf') {
                if (multipleImages.length === 0) {
                    alert("Vui lòng tải lên ít nhất 1 ảnh.");
                    setIsLoading(false);
                    return;
                }
                const jsPDF = (await import('jspdf')).jsPDF;
                const pdf = new jsPDF();
                
                for (let i = 0; i < multipleImages.length; i++) {
                    const imgItem = multipleImages[i];
                    const imgObj = imgItem.image;
                    const note = imgItem.note;
                    if (i > 0) pdf.addPage();
                    
                    const imgData = `data:${imgObj.mimeType};base64,${imgObj.base64}`;
                    
                    const img = new Image();
                    img.src = imgData;
                    await new Promise(r => {
                        img.onload = r;
                        img.onerror = () => r(null);
                    });
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    const safeImgData = canvas.toDataURL('image/jpeg', 0.95);
                    
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    let renderWidth = pdfWidth - 20;
                    let renderHeight = (img.height * renderWidth) / img.width;
                    
                    if (renderHeight > pdfHeight - 40) {
                        renderHeight = pdfHeight - 40;
                        renderWidth = (img.width * renderHeight) / img.height;
                    }
                    
                    const x = (pdfWidth - renderWidth) / 2;
                    const y = 25;
                    
                    pdf.setDrawColor(200, 200, 200);
                    pdf.rect(x - 2, y - 2, renderWidth + 4, renderHeight + 4);
                    
                    pdf.addImage(safeImgData, 'JPEG', x, y, renderWidth, renderHeight);
                    
                    pdf.setFontSize(10);
                    pdf.setTextColor(150, 150, 150);
                    pdf.text('Generated by AI Studio', pdfWidth / 2, pdfHeight - 10, { align: 'center' });
                    
                    pdf.setFontSize(16);
                    pdf.setTextColor(50, 50, 50);
                    pdf.text(prompt || 'Tài liệu Render', pdfWidth / 2, 15, { align: 'center' });
                    
                    if (note) {
                        pdf.setFontSize(12);
                        pdf.setTextColor(80, 80, 80);
                        // split text to fit page width
                        const lines = pdf.splitTextToSize(note, pdfWidth - 20);
                        // add below image
                        pdf.text(lines, 10, y + renderHeight + 10);
                    }
                    
                    if (i === 0) {
                         setResultImages([{ url: safeImgData }]);
                    }
                }
                pdf.save(`96-ARCH-AI-Export-${Date.now()}.pdf`);
                alert("Xuất PDF thành công!");
                setIsLoading(false);
                return;
            }

            let result: string | null = null;
            const engineeredPrompt = task.promptEngineer ? task.promptEngineer(prompt) : prompt;

            if (task.service === 'generateImageFromText') {
                result = await generateImageFromText(engineeredPrompt);
            } else {
                const source = sourceImage1;
                if (!source) {
                    alert("Vui lòng tải lên ảnh nguồn.");
                    setIsLoading(false);
                    return;
                }
                let images: string[] = [];
                if (task.service === 'generateImagesWithReference') {
                    if (!sourceImage2) {
                        alert("Vui lòng tải lên ảnh tham khảo.");
                        setIsLoading(false);
                        return;
                    }
                    images = await generateImages(source, engineeredPrompt, 'interior', 1, sourceImage2, false, true);
                } else { // 'generateImages'
                     images = await generateImages(source, engineeredPrompt, 'interior', 1, null, false, true);
                }
                result = images.length > 0 ? images[0] : null;
            }

            if(result) {
                setResultImages([{ url: result }]);
            } else {
                 throw new Error("API did not return an image.");
            }
        } catch (error) {
            console.error("Utility task failed:", error);
            alert("Đã xảy ra lỗi khi thực hiện tác vụ. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };
    
    
    const handleGenerateAll = async () => {
        if (!sourceImage1) {
            alert("Vui lòng tải lên ảnh nguồn.");
            return;
        }
        setIsLoading(true);
        setResultImages(null);
        try {
            const promises = task.predefinedPrompts!.map(async (p) => {
                const engineeredPrompt = task.promptEngineer ? task.promptEngineer(p.value) : p.value;
                const images = await generateImages(sourceImage1, engineeredPrompt, 'interior', 1, null, false, true);
                if (images.length > 0) {
                    return { label: p.label, url: images[0] };
                }
                return null;
            });
            const results = (await Promise.all(promises)).filter((r): r is {label: string, url: string} => r !== null);
            if (results.length > 0) {
                setResultImages(results);
            } else {
                throw new Error("Không tạo được ảnh nào.");
            }
        } catch (error) {
            console.error("Generate all failed:", error);
            alert("Đã xảy ra lỗi. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    const canGenerate = () => {
        if (isLoading) return false;
        const hasPrompt = task.id === 'remove_watermark' || prompt.length > 0;
        if (task.inputs === 0) return prompt.length > 0;
        if (task.inputs === 1) return !!sourceImage1 && hasPrompt;
        if (task.inputs === 2) return !!sourceImage1 && !!sourceImage2 && hasPrompt;
        if (task.inputs === 'multiple') return multipleImages.length > 0 && hasPrompt;
        return false;
    };
    
    const handleEdit = (url: string) => {
        onEditRequest(url);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between glass-panel px-4 py-3 rounded-2xl border border-slate-800/80">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="flex items-center gap-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition">
                        <Icon name="arrow-uturn-left" className="w-4 h-4" />
                        Quay Lại Bộ Công Cụ
                    </button>
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Icon name={task.icon} className="w-4 h-4 text-indigo-400" />
                            {task.name}
                        </h3>
                        <p className="text-[11px] text-slate-400">{task.description}</p>
                    </div>
                </div>
            </div>
            <div className="flex flex-col lg:flex-row gap-4 flex-grow">
                {/* Left Column: Inputs */}
                <div className="w-full lg:w-[390px] xl:w-[420px] flex-shrink-0 flex flex-col gap-4">
                    <Section title="1. Dữ Liệu Đầu Vào">
                        <div className="space-y-4">
                            {task.inputs === 1 && <ImageUpload sourceImage={sourceImage1} onImageUpload={setSourceImage1} onRemove={() => setSourceImage1(null)} title={task.inputLabels?.[0]} />}
                            {task.inputs === 2 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     <ImageUpload sourceImage={sourceImage1} onImageUpload={setSourceImage1} onRemove={() => setSourceImage1(null)} title={task.inputLabels?.[0]} heightClass="h-36"/>
                                     <ImageUpload sourceImage={sourceImage2} onImageUpload={setSourceImage2} onRemove={() => setSourceImage2(null)} title={task.inputLabels?.[1]} heightClass="h-36"/>
                                </div>
                            )}
                            {task.inputs === 'multiple' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {multipleImages.map((item, idx) => (
                                            <div key={idx} className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-700 cursor-pointer group" onClick={() => setEditingNoteIndex(idx)}>
                                                <img src={`data:${item.image.mimeType};base64,${item.image.base64}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Uploaded" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <div className="bg-black/70 text-white text-xs px-2 py-1 rounded">Ghi chú</div>
                                                </div>
                                                {item.note && (
                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate text-center">
                                                        {item.note}
                                                    </div>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); setMultipleImages(prev => prev.filter((_, i) => i !== idx)); }} className="absolute top-1 right-1 bg-black/70 p-1 rounded-full text-white hover:bg-red-500 z-10">
                                                    <Icon name="x-mark" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <ImageUpload sourceImage={null} onImageUpload={img => setMultipleImages(prev => [...prev, {image: img, note: ''}])} onRemove={() => {}} title={task.inputLabels?.[0] || 'Thêm ảnh'} heightClass="aspect-square h-auto" />
                                    </div>
                                    
                                    {editingNoteIndex !== null && multipleImages[editingNoteIndex] && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                                            <div className="bg-slate-900 rounded-2xl max-w-2xl w-full p-6 border border-slate-800 shadow-2xl flex flex-col gap-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-base font-bold text-white">Ghi chú chi tiết trang PDF</h3>
                                                    <button onClick={() => setEditingNoteIndex(null)} className="text-slate-400 hover:text-white">
                                                        <Icon name="x-mark" className="w-6 h-6" />
                                                    </button>
                                                </div>
                                                <div className="flex flex-col md:flex-row gap-4 items-start">
                                                    <div className="w-full md:w-1/2 aspect-video md:aspect-square bg-black/50 rounded-xl overflow-hidden flex items-center justify-center">
                                                        <img src={`data:${multipleImages[editingNoteIndex].image.mimeType};base64,${multipleImages[editingNoteIndex].image.base64}`} className="max-w-full max-h-full object-contain" alt="Preview" />
                                                    </div>
                                                    <textarea
                                                        value={multipleImages[editingNoteIndex].note}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setMultipleImages(prev => {
                                                                const arr = [...prev];
                                                                arr[editingNoteIndex].note = val;
                                                                return arr;
                                                            });
                                                        }}
                                                        placeholder="Nhập ghi chú chi tiết cho ảnh này (sẽ xuất hiện dưới ảnh trong PDF)..."
                                                        className="w-full md:w-1/2 bg-slate-950 border border-slate-800 p-3 rounded-xl h-40 md:h-full min-h-[160px] resize-none text-xs focus:border-indigo-500 focus:outline-none text-white"
                                                    />
                                                </div>
                                                <div className="flex justify-end mt-2">
                                                    <button onClick={() => setEditingNoteIndex(null)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl text-xs transition-colors">
                                                        Xong
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={task.promptPlaceholder}
                                className="w-full bg-slate-950/90 border border-slate-800 p-3 rounded-xl h-28 resize-none text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                            />
                             {task.predefinedPrompts && (
                                <div className="mt-2 space-y-1.5">
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gợi ý kịch bản nhanh:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {task.predefinedPrompts.map((p, index) => (
                                            <button
                                                key={index}
                                                onClick={() => setPrompt(p.value)}
                                                title={p.value}
                                                className="bg-slate-900 hover:bg-indigo-600/20 border border-slate-800 hover:border-indigo-500/40 text-slate-300 text-[11px] font-medium py-1 px-2.5 rounded-lg transition-colors"
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>
                    <button
                        onClick={handleGenerate}
                        disabled={!canGenerate()}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg text-xs"
                    >
                        <Icon name="sparkles" className="w-4 h-4" />
                        {isLoading ? 'Đang Xử Lý Với Gemini AI...' : (task.service === 'custom_pdf' ? 'Xuất Hồ Sơ PDF' : 'Thực Hiện Tác Vụ AI')}
                    </button>
                    {(task.id === 'construction_stages' || task.id === 'extract_3d_maps') && task.predefinedPrompts && (
                        <button
                            onClick={handleGenerateAll}
                            disabled={!canGenerate()}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-xs shadow-lg"
                        >
                            <Icon name="bolt" className="w-4 h-4" />
                            {isLoading ? 'Đang Tạo Đồng Loạt...' : 'Tạo Tất Cả Các Kênh Cùng Lúc'}
                        </button>
                    )}
                </div>
                {/* Right Column: Output */}
                <div className="flex-grow glass-panel rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden min-h-[460px]">
                    <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                            <Icon name="sparkles" className="w-4 h-4 text-indigo-400" />
                            Kết Quả Xử Lý AI
                        </span>
                    </div>
                    <div className="w-full flex-grow studio-canvas-bg flex items-center justify-center p-4">
                        <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center group">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center text-center">
                                    <div className="animate-spin rounded-full h-11 w-11 border-2 border-indigo-500 border-t-transparent"></div>
                                    <p className="mt-3 font-bold text-xs text-slate-200">Gemini AI đang xử lý tác vụ, vui lòng chờ...</p>
                                </div>
                            ) : resultImages && resultImages.length > 0 ? (
                                <div className={`w-full h-full p-2 overflow-y-auto ${resultImages.length > 1 ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'flex items-center justify-center'}`}>
                                    {resultImages.map((res, idx) => (
                                        <AdjustableResultImage 
                                            key={idx} 
                                            res={res} 
                                            idx={idx} 
                                            taskId={task.id} 
                                            onFullscreen={setIsResultFullscreen} 
                                            onEdit={handleEdit} 
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 text-center p-4">Kết quả sẽ xuất hiện ở đây sau khi bạn bấm Thực Hiện.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isResultFullscreen && (
                <ImageViewerModal imageUrl={isResultFullscreen} onClose={() => setIsResultFullscreen(null)} />
            )}
        </div>
    );
};


// --- Main Component ---

export const UtilitiesTab: React.FC<{ onEditRequest?: (imageUrl: string) => void; }> = ({ onEditRequest = () => {} }) => {
    const [selectedTask, setSelectedTask] = useState<UtilityTaskDef | null>(null);

    if (selectedTask) {
        return <UtilityRunner task={selectedTask} onBack={() => setSelectedTask(null)} onEditRequest={onEditRequest} />;
    }

    return (
        <div className="space-y-5">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Icon name="sparkles" className="w-5 h-5 text-indigo-400" />
                        Bộ Công Cụ AI Chuyên Ngành Kiến Trúc & Nội Thất
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">11 tiện ích chuyên sâu hỗ trợ tách Map PBR 3D, diễn họa tiến độ thi công, đổi Style & xuất hồ sơ PDF</p>
                </div>
                <span className="text-xs font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-xl w-fit">
                    {UTILITY_TASKS.length} Công Cụ Sẵn Sàng
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {UTILITY_TASKS.map(task => {
                    return (
                        <div
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className="group relative glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col items-start cursor-pointer"
                        >
                            <div className="flex items-center justify-between w-full mb-3.5">
                                <div className="rounded-xl p-2.5 bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Icon name={task.icon} className="w-5 h-5" />
                                </div>
                                <Icon name="chevron-right" className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-100 mb-1.5 group-hover:text-indigo-300 transition-colors">{task.name}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed flex-grow">{task.description}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
