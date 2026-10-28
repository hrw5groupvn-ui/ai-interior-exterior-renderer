import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import type { SourceImage, AspectRatio, ImageResolution, RenderOptions } from '../types';

export type GeminiModelId =
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image-preview'
  | 'gemini-2.5-flash-image';

export interface GeminiModelInfo {
  id: GeminiModelId;
  name: string;
  codename: string;
  badge: string;
  desc: string;
  icon: string;
  fallbacks: string[];
}

export const GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    codename: 'Nano Banana 2',
    badge: 'Khuyên dùng • 4K',
    desc: 'Tốc độ siêu nhanh, đồng nhất vật liệu & kết cấu kiến trúc chuẩn 4K',
    icon: '🍌',
    fallbacks: [
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-preview'
    ]
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    codename: 'Nano Banana Pro',
    badge: 'Ultra Pro',
    desc: 'Suy luận không gian 3D, ánh sáng V-Ray/Corona & chi tiết phức tạp nhất',
    icon: '🚀',
    fallbacks: [
      'gemini-3-pro-image-preview',
      'gemini-3-pro-image',
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image'
    ]
  },
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    codename: 'Nano Banana',
    badge: 'Ổn định • Tiết kiệm',
    desc: 'Model nền tảng tốc độ cao, tương thích mọi API Key & tiết kiệm Quota',
    icon: '⚡',
    fallbacks: [
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini-3.1-flash-image'
    ]
  }
];

const VISION_TEXT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash'
];

const STORAGE_MODEL_KEY = '96ARCH_SELECTED_IMAGE_MODEL';

let currentSelectedModel: GeminiModelId = (() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_MODEL_KEY) as GeminiModelId | null;
    if (saved && GEMINI_MODELS.some(m => m.id === saved)) {
      return saved;
    }
  }
  return 'gemini-3.1-flash-image-preview';
})();

export const getSelectedModel = (): GeminiModelId => {
  return currentSelectedModel;
};

export const setSelectedModel = (model: GeminiModelId): void => {
  currentSelectedModel = model;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_MODEL_KEY, model);
  }
};

export const getApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem('GEMINI_API_KEY');
    if (localKey && localKey.trim()) return localKey.trim();
  }
  return (typeof process !== 'undefined' && process.env && (process.env.API_KEY || process.env.GEMINI_API_KEY)) || '';
};

export const setApiKey = (key: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('GEMINI_API_KEY', key.trim());
  }
};

const getAIClient = (customKey?: string): GoogleGenAI => {
  const key = customKey ? customKey.trim() : getApiKey();
  return new GoogleGenAI({ apiKey: key || 'placeholder-key' });
};

/**
 * Extracts the base64 image data from a Gemini API response.
 */
const extractBase64Image = (response: GenerateContentResponse): string | null => {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    const parts = candidate.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
  }
  return null;
};

const isRetryableModelError = (err: any): boolean => {
  const msg = (err?.message || String(err)).toLowerCase();
  // Quota (429) or Invalid API Key (400 API_KEY_INVALID / 403) should surface if all fail,
  // but 404 (not found), 400 (unsupported config/modality), 503 (overloaded) can fallback immediately
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('invalid argument') ||
    msg.includes('image_size') ||
    msg.includes('imagesize') ||
    msg.includes('aspect_ratio') ||
    msg.includes('503') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable')
  );
};

/**
 * Calls the selected Gemini Image model with automatic fallback across model variants & config levels.
 */
const generateImageWithFallback = async (
  parts: any[],
  options?: RenderOptions
): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }

  const client = getAIClient();
  const modelInfo = GEMINI_MODELS.find(m => m.id === getSelectedModel()) || GEMINI_MODELS[0];
  const candidateModels = modelInfo.fallbacks;

  const aspectRatio: AspectRatio = options?.aspectRatio || '16:9';
  const imageSize: ImageResolution = options?.imageSize || '2K';

  let lastError: any = null;

  for (const modelName of candidateModels) {
    // Try 1: With full imageConfig (aspectRatio + imageSize) if supported
    const configsToTry: any[] = [
      {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: {
          aspectRatio,
          ...(modelName.includes('3.1') || modelName.includes('3-pro') ? { imageSize } : {})
        }
      },
      // Try 2: Standard responseModalities only (maximum compatibility)
      {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      }
    ];

    for (const cfg of configsToTry) {
      try {
        const response = await client.models.generateContent({
          model: modelName,
          contents: { parts },
          config: cfg,
        });
        const img = extractBase64Image(response);
        if (img) return img;
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();
        // If API key is invalid, throw immediately
        if (msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
          throw err;
        }
        // If config error on first attempt (e.g. imageConfig not supported), continue to second config
        if (isRetryableModelError(err)) {
          continue;
        }
        // If 429 quota error on a preview model, try next fallback model (e.g., 2.5-flash-image has separate quota)
        if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
          break; // break inner config loop and try next model in fallback list
        }
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
};

/**
 * Calls Vision/Text Gemini model with automatic fallback.
 */
const generateTextWithFallback = async (
  parts: any[],
  temperature: number = 0.6
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }

  const client = getAIClient();
  let lastError: any = null;

  for (const modelName of VISION_TEXT_MODELS) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: { parts },
        config: { temperature }
      });
      if (response.text) {
        return response.text.trim();
      }
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || String(err)).toLowerCase();
      if (msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
        throw err;
      }
      continue;
    }
  }

  if (lastError) throw lastError;
  throw new Error("Không nhận được phản hồi văn bản từ Gemini AI.");
};

/**
 * Tests whether a Gemini API Key is valid and connected.
 */
export const testGeminiConnection = async (customKey?: string): Promise<{ ok: boolean; message: string }> => {
  const keyToTest = customKey ? customKey.trim() : getApiKey();
  if (!keyToTest) {
    return { ok: false, message: 'Vui lòng nhập API Key trước khi kiểm tra.' };
  }
  try {
    const client = getAIClient(keyToTest);
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Respond with OK',
    });
    if (response) {
      return {
        ok: true,
        message: `Kết nối thành công! Sẵn sàng tạo ảnh với ${GEMINI_MODELS.find(m => m.id === getSelectedModel())?.name || 'Gemini Image AI'}.`
      };
    }
    return { ok: false, message: 'Không nhận được phản hồi từ máy chủ Gemini.' };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      return { ok: false, message: 'API Key không hợp lệ. Vui lòng kiểm tra lại mã Key từ Google AI Studio.' };
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { ok: true, message: 'API Key hợp lệ nhưng đang chạm giới hạn tốc độ (Quota 429). Hãy thử đổi sang Gemini 2.5 Flash Image hoặc chờ 1 phút.' };
    }
    return { ok: false, message: `Lỗi kết nối: ${msg}` };
  }
};

/**
 * Describes an interior/exterior design image to generate an architectural prompt.
 */
export const describeInteriorImage = async (
  sourceImage: SourceImage,
  mode: 'exterior' | 'interior' | 'floorplan' = 'interior'
): Promise<string> => {
  const roleDesc =
    mode === 'exterior'
      ? 'kiến trúc sư trưởng chuyên thiết kế ngoại thất công trình & cảnh quan'
      : mode === 'floorplan'
      ? 'chuyên gia quy hoạch mặt bằng và dựng phối cảnh nội thất 3D'
      : 'chuyên gia thiết kế nội thất cao cấp (Senior Interior Designer)';

  const engineeredPrompt = `Bạn là một ${roleDesc}. Hãy phân tích bức ảnh được cung cấp và mô tả chi tiết bằng tiếng Việt để làm prompt render 3D siêu thực (photorealistic architectural visualization).
Tập trung mô tả:
1. Phong cách thiết kế chủ đạo (Modern Luxury, Japandi, Wabi-sabi, Indochine, Neoclassical, Tropical...).
2. Vật liệu chính (sàn gỗ óc chó, đá marble vân mây, kính hộp chạm trần, bê tông trần, kim loại mạ PVD...).
3. Bố cục không gian, đồ nội thất/kiến trúc điểm nhấn và ánh sáng (ánh sáng tự nhiên ban ngày, nắng chiều hoàng hôn, đèn hắt khe trần ấm áp).
Viết thành 1 đoạn văn mô tả mạch lạc, giàu tính hình ảnh (khoảng 50-90 từ), KHÔNG dùng gạch đầu dòng, để đưa thẳng vào ô Prompt Render.`;

  return generateTextWithFallback([
    { inlineData: { data: sourceImage.base64, mimeType: sourceImage.mimeType } },
    { text: engineeredPrompt },
  ]);
};

/**
 * Generates multiple architectural render images based on a source image and a text prompt.
 */
export const generateImages = async (
  sourceImage: SourceImage,
  prompt: string,
  renderType: 'exterior' | 'interior' | 'floorplan',
  count: number = 4,
  referenceImage: SourceImage | null = null,
  isAnglePrompt: boolean = false,
  useRawPrompt: boolean = false,
  options?: RenderOptions
): Promise<string[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }

  const aspectNote = options?.aspectRatio ? ` Target aspect ratio: ${options.aspectRatio}.` : '';
  const resNote = options?.imageSize ? ` Render quality: Ultra-detailed ${options.imageSize} architectural photography.` : '';

  const generationPromises = Array(count).fill(0).map(async (_, idx) => {
    const parts: any[] = [
      {
        inlineData: {
          data: sourceImage.base64,
          mimeType: sourceImage.mimeType,
        },
      },
    ];

    if (referenceImage) {
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    let finalPrompt = prompt;

    if (useRawPrompt) {
      finalPrompt = `${prompt}${aspectNote}${resNote}`;
    } else if (renderType === 'floorplan') {
      finalPrompt = `You are a master 3D architectural visualizer (V-Ray 6 / Corona Renderer expert). Convert the provided 2D floorplan / layout drawing into a breathtaking, photorealistic 3D interior perspective render viewed from a natural human eye-level camera inside the space. Strictly preserve the exact room proportions, wall boundaries, door/window placements, and furniture layout shown in the plan. User specifications: "${prompt}". Apply realistic PBR materials, natural global illumination, soft shadows, and magazine-quality interior styling.${aspectNote}${resNote}`;
    } else if (isAnglePrompt) {
      const subject = renderType === 'exterior' ? 'building architecture and surrounding landscape' : 'interior room space and furniture layout';
      finalPrompt = `You are an expert architectural photographer. Keep the exact same ${subject}, materials, lighting, and design identity from the provided image, but re-render the scene from this new camera perspective: "${prompt}". Maintain 100% architectural and material consistency while showcasing the new camera angle naturally.${aspectNote}${resNote}`;
    } else if (referenceImage) {
      const subjectType = renderType === 'exterior' ? 'architectural building exterior' : 'interior room space';
      finalPrompt = `You are creating a master-grade photorealistic 3D architectural render.
- Image 1 is the primary structural sketch / 3D massing / base layout. You MUST strictly preserve the exact geometry, perspective lines, architectural proportions, and spatial composition of Image 1.
- Image 2 is the Style & Mood Reference ONLY. Transfer the lighting atmosphere, color grading, material richness, and environmental mood from Image 2 onto the ${subjectType} of Image 1. Do NOT copy shapes or objects from Image 2.
- User design instructions: "${prompt}".
Render with V-Ray / Corona photorealism, crisp reflections, accurate PBR textures, and natural lighting.${aspectNote}${resNote}`;
    } else {
      const domainContext =
        renderType === 'exterior'
          ? 'Masterpiece architectural exterior photography, V-Ray 6 & Corona Renderer photorealistic visualization. Strictly follow the structural geometry, massing, and perspective of the provided input image while transforming it into a lifelike completed building with realistic facade materials, glass reflections, natural foliage, and atmospheric lighting.'
          : 'Masterpiece interior design photography, ArchDaily & Elle Decor standard, V-Ray 6 & Corona Renderer photorealistic visualization. Strictly preserve the room geometry, camera perspective, and furniture placement of the provided input image while rendering ultra-realistic PBR materials, fabric textures, wood grains, and balanced natural/artificial lighting.';
      finalPrompt = `${domainContext} User prompt: "${prompt}". Variation #${idx + 1}.${aspectNote}${resNote}`;
    }

    parts.push({ text: finalPrompt });

    return generateImageWithFallback(parts, options);
  });

  const results = await Promise.all(generationPromises);
  return results.filter((result): result is string => result !== null);
};

/**
 * Upscales an image to 2K or 4K resolution with micro-detail enhancement.
 */
export const upscaleImage = async (
  sourceImage: SourceImage,
  target: '2k' | '4k'
): Promise<string | null> => {
  const targetSize: ImageResolution = target === '4k' ? '4K' : '2K';
  const prompt = `Upscale and remaster this architectural render to native ${target.toUpperCase()} Ultra-HD resolution. Sharpen fine PBR material micro-textures (wood grain, stone veins, brushed metal, fabric weave, foliage, glass reflections) and refine global illumination while 100% preserving the exact original geometry, composition, colors, and lighting.`;

  return generateImageWithFallback(
    [
      {
        inlineData: {
          data: sourceImage.base64,
          mimeType: sourceImage.mimeType,
        },
      },
      { text: prompt },
    ],
    { imageSize: targetSize }
  );
};

/**
 * Edits an image based on a source image, a mask, and a text prompt (Inpainting).
 */
export const editImage = async (
  sourceImage: SourceImage,
  maskImage: SourceImage,
  prompt: string,
  count: number = 1,
  referenceImage?: SourceImage | null
): Promise<string[]> => {
  let engineeredPrompt = `You are an expert architectural & interior photo retoucher and inpainting AI.
- Image 1 is the original architectural/interior image.
- Image 2 is the binary mask: WHITE pixels indicate the exact region to modify; BLACK pixels MUST remain 100% untouched and identical to Image 1.
- Edit instruction for the WHITE masked region: "${prompt}".
Ensure seamless perspective alignment, matching global illumination, realistic shadow casting, and accurate PBR material integration with the surrounding unmasked scene.`;

  if (referenceImage) {
    engineeredPrompt += `
- Image 3 is a Reference Style/Material/Object image. Apply the material, object design, or lighting characteristics from Image 3 into the white masked region of Image 1 seamlessly.`;
  }

  const generationPromises = Array(count).fill(0).map(async () => {
    const parts: any[] = [
      { inlineData: { data: sourceImage.base64, mimeType: sourceImage.mimeType } },
      { inlineData: { data: maskImage.base64, mimeType: maskImage.mimeType } }
    ];
    if (referenceImage) {
      parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    }
    parts.push({ text: engineeredPrompt });

    return generateImageWithFallback(parts);
  });

  const results = await Promise.all(generationPromises);
  return results.filter((result): result is string => result !== null);
};

/**
 * Generates an image purely from a text prompt.
 */
export const generateImageFromText = async (
  prompt: string,
  options?: RenderOptions
): Promise<string | null> => {
  return generateImageWithFallback(
    [{ text: `Photorealistic architectural & interior visualization, 8k V-Ray render: ${prompt}` }],
    options || { aspectRatio: '16:9', imageSize: '2K' }
  );
};

/**
 * Generates 20 professional architectural photography prompts in Vietnamese.
 */
export const generateMagicPrompts = async (
  sourceImage: SourceImage,
  characterImage: SourceImage | null,
  note: string
): Promise<string[]> => {
  const parts: any[] = [
    {
      inlineData: {
        data: sourceImage.base64,
        mimeType: sourceImage.mimeType,
      }
    }
  ];

  let prompt = `Bạn là một chuyên gia tạo prompt và nhiếp ảnh gia kiến trúc chuyên nghiệp (ArchDaily / Dezeen photographer).
Người dùng đã cung cấp một bức ảnh tham chiếu chính về một công trình hoặc không gian kiến trúc/nội thất.
Hãy phân tích kỹ các yếu tố hình ảnh, phong cách kiến trúc, vật liệu, ánh sáng và bố cục của bức ảnh này. `;

  if (characterImage) {
    parts.push({
      inlineData: {
        data: characterImage.base64,
        mimeType: characterImage.mimeType,
      }
    });
    prompt += `Bức ảnh thứ hai là ảnh nhân vật mẫu. Hãy miêu tả nhân vật này xuất hiện tự nhiên trong không gian kiến trúc (tương tác tinh tế, đúng tỷ lệ), nhưng chủ thể chính vẫn luôn là công trình kiến trúc. `;
  }

  if (note) {
    prompt += `\n\nGhi chú bổ sung từ người dùng: "${note}". `;
  }

  prompt += `\n\nHãy tạo chính xác 20 prompt nhiếp ảnh kiến trúc chuyên nghiệp bằng TIẾNG VIỆT dựa trên các thông tin trên.
YÊU CẦU QUAN TRỌNG:
- Công trình kiến trúc / không gian nội thất LUÔN LÀ CHỦ THỂ CHÍNH trong tất cả các bức ảnh.
- 20 shot ảnh phải bao gồm đa dạng các góc máy và kỹ thuật: toàn cảnh (wide-angle 24mm), góc 3/4, cận cảnh chi tiết vật liệu (close-up macro), trung cảnh (medium shot), tiền cảnh có tán lá/vật thể xóa phông (depth of field / bokeh), bình minh, hoàng hôn (golden hour), và lên đèn ban đêm (blue hour).
- CHỈ TRẢ VỀ các prompt, được phân tách bằng 2 dấu xuống dòng (\n\n). KHÔNG đánh số thứ tự, KHÔNG dùng markdown (** hay *), KHÔNG có lời dẫn đầu hay kết thúc.`;

  parts.push({ text: prompt });

  const text = await generateTextWithFallback(parts, 0.7);
  const prompts = text
    .split("\n\n")
    .map(p => p.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(p => p.length > 10)
    .slice(0, 20);
  return prompts;
};

export interface InteriorPromptAnalysis {
  style: string;
  colorPalette: string;
  materials: string;
  furniture: string;
  lightingAndCamera: string;
  vietnamesePrompt: string;
  englishPrompt: string;
}

/**
 * Analyzes an uploaded reference interior image and constructs a structured interior design prompt.
 */
export const buildInteriorPromptFromReference = async (
  referenceImage: SourceImage,
  targetRoomType: string = 'Tự động theo ảnh',
  lightingOverride: string = 'Tự động theo ảnh',
  customNotes: string = ''
): Promise<InteriorPromptAnalysis> => {
  const roomInstruction =
    targetRoomType && targetRoomType !== 'Tự động theo ảnh'
      ? `Áp dụng phong cách và vật liệu của ảnh tham chiếu này cho không gian: "${targetRoomType}".`
      : 'Xác định đúng loại không gian nội thất trong ảnh tham chiếu.';

  const lightingInstruction =
    lightingOverride && lightingOverride !== 'Tự động theo ảnh'
      ? `Kịch bản ánh sáng ưu tiên: "${lightingOverride}".`
      : 'Phân tích kịch bản ánh sáng thực tế từ ảnh tham chiếu.';

  const systemPrompt = `Bạn là một Kiến trúc sư Nội thất Trưởng (Lead Interior Designer) và chuyên gia Prompt Engineering cho V-Ray / Corona / Gemini Image AI.
Hãy phân tích bức ảnh nội thất tham chiếu được tải lên và bóc tách chi tiết để xây dựng Prompt tạo ảnh nội thất siêu thực.
${roomInstruction}
${lightingInstruction}
${customNotes ? `Yêu cầu bổ sung từ người dùng: "${customNotes}".` : ''}

Hãy trả về KẾT QUẢ DƯỚI DẠNG JSON HỢP LỆ (không bọc trong markdown, chỉ trả về đối tượng JSON thuần) theo đúng cấu trúc sau:
{
  "style": "Tên phong cách thiết kế chủ đạo & đặc trưng không gian (bằng tiếng Việt, ví dụ: Hiện đại Luxury kết hợp Gỗ Óc Chó...)",
  "colorPalette": "Bảng màu chủ đạo, tỷ lệ phối màu 60-30-10 & cảm xúc không gian (bằng tiếng Việt)",
  "materials": "Chi tiết vật liệu Sàn, Tường, Vách trang trí, Trần, Kim loại/Đá/Gỗ/Vải (bằng tiếng Việt, mô tả rõ bề mặt bóng/mờ/vân)",
  "furniture": "Các món đồ nội thất chính, kiểu dáng, chất liệu bọc và đồ decor điểm nhấn (bằng tiếng Việt)",
  "lightingAndCamera": "Hệ thống ánh sáng tự nhiên, đèn nhân tạo (nhiệt độ màu K, đèn hắt khe, đèn thả) và góc máy nhiếp ảnh (bằng tiếng Việt)",
  "vietnamesePrompt": "Một đoạn Prompt Tiếng Việt hoàn chỉnh, mạch lạc, giàu tính hình ảnh (khoảng 90-140 từ) kết hợp đầy đủ Không gian + Phong cách + Vật liệu Sàn/Tường/Trần + Đồ nội thất + Ánh sáng + Chất lượng 8K V-Ray để dùng tạo ảnh ngay.",
  "englishPrompt": "A master-level English architectural visualization prompt (90-140 words) translating all extracted style, PBR materials, furniture, global illumination lighting, camera lens (24mm tilt-shift, f/8), V-Ray 6 & Corona Renderer photorealism, 8K Ultra-HD."
}`;

  const rawText = await generateTextWithFallback(
    [
      { inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } },
      { text: systemPrompt }
    ],
    0.4
  );

  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const jsonSlice = firstBrace !== -1 && lastBrace !== -1 ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
    const parsed = JSON.parse(jsonSlice);
    return {
      style: parsed.style || 'Hiện đại Luxury',
      colorPalette: parsed.colorPalette || 'Tông màu trung tính ấm áp, sang trọng',
      materials: parsed.materials || 'Sàn gỗ tự nhiên, vách ốp đá Marble và hệ lam gỗ',
      furniture: parsed.furniture || 'Đồ nội thất thiết kế đồng bộ, đường nét tinh tế',
      lightingAndCamera: parsed.lightingAndCamera || 'Ánh sáng tự nhiên kết hợp đèn LED ấm 3000K, góc máy ngang tầm mắt',
      vietnamesePrompt: parsed.vietnamesePrompt || rawText,
      englishPrompt: parsed.englishPrompt || rawText
    };
  } catch {
    return {
      style: 'Phân tích tự động từ ảnh tham chiếu',
      colorPalette: 'Theo tông màu ảnh tham chiếu',
      materials: 'Theo vật liệu trong ảnh tham chiếu',
      furniture: 'Theo bố cục nội thất tham chiếu',
      lightingAndCamera: 'Ánh sáng thực tế chuẩn nhiếp ảnh kiến trúc',
      vietnamesePrompt: rawText,
      englishPrompt: `Masterpiece interior design photography, V-Ray 6 & Corona Renderer photorealistic visualization: ${rawText}`
    };
  }
};

