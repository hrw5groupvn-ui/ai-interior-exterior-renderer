import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import type { SourceImage } from '../types';

const getApiKey = (): string => {
  return (typeof process !== 'undefined' && process.env && (process.env.API_KEY || process.env.GEMINI_API_KEY)) || '';
};

const getAIClient = (): GoogleGenAI => {
  const key = getApiKey();
  return new GoogleGenAI({ apiKey: key || 'placeholder-key' });
};

/**
 * Extracts the base64 image data from a Gemini API response.
 * @param response - The response object from the API.
 * @returns The base64 encoded image string, or null if not found.
 */
const extractBase64Image = (response: GenerateContentResponse): string | null => {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  for (const part of parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  return null;
};

/**
 * Describes an interior design image to generate a prompt.
 * @param sourceImage - The source image object.
 * @returns A promise that resolves to a descriptive string.
 */
export const describeInteriorImage = async (sourceImage: SourceImage): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }
  
  const engineeredPrompt = "As an expert interior designer, describe the provided image of a room in Vietnamese. Focus on the style (e.g., modern, minimalist, classic), key materials (e.g., wood floors, marble countertops), furniture, and the overall lighting and mood. The description should be suitable for use as a prompt to regenerate the image. Be descriptive and detailed.";

  const response = await getAIClient().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: sourceImage.base64, mimeType: sourceImage.mimeType } },
        { text: engineeredPrompt },
      ],
    },
  });

  return response.text.trim();
};

/**
 * Generates multiple images based on a source image and a text prompt.
 * @param sourceImage - The source image object containing base64 data and mimeType.
 * @param prompt - The text prompt to guide the image generation.
 * @param renderType - The type of render, either 'exterior', 'interior', or 'floorplan'.
 * @param count - The number of images to generate.
 * @param referenceImage - An optional reference image for style, tone, and mood.
 * @param isAnglePrompt - A boolean to indicate if the prompt is for changing the angle.
 * @param useRawPrompt - A boolean to indicate if the provided prompt should be used as-is, without further engineering.
 * @returns A promise that resolves to an array of base64 image URLs.
 */
export const generateImages = async (
  sourceImage: SourceImage,
  prompt: string,
  renderType: 'exterior' | 'interior' | 'floorplan',
  count: number = 4,
  referenceImage: SourceImage | null = null,
  isAnglePrompt: boolean = false,
  useRawPrompt: boolean = false
): Promise<string[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }

  const generationPromises = Array(count).fill(0).map(async () => {
    let textPart = { text: prompt };
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

    if (useRawPrompt) {
        // Use the prompt as-is from the caller.
    } else if (renderType === 'floorplan') {
      textPart.text = `You are an expert 3D architectural visualizer. Your task is to convert the provided 2D floorplan image into a photorealistic 3D interior render, viewed from a human-eye level perspective inside the room. Adhere strictly to the layout, dimensions, and placement of walls, doors, and windows as shown in the floorplan. The user's request is: "${prompt}". Create a beautiful and realistic image based on these instructions.`;
    } else if (isAnglePrompt) {
        const subject = renderType === 'exterior' ? 'building' : 'room';
        const sketchType = renderType === 'exterior' ? 'architectural sketch' : 'interior sketch';
        textPart.text = `The user wants to change the camera angle of the provided ${sketchType}. Render the exact same ${subject} from the image, but from this new perspective: "${prompt}". The prompt's main goal is to define the camera shot, not to add new content to the scene.`;
    } else if (referenceImage) {
        const subjectType = renderType === 'exterior' ? 'building' : 'room';
        const shotType = renderType === 'exterior' ? 'exterior shot' : 'interior shot';
        textPart.text = `The user's prompt is: "${prompt}". You are creating a realistic architectural render. The first image is the architectural sketch. You MUST use the exact structure, form, and layout from this first sketch. The second image is a reference for style ONLY. You must apply the mood, lighting, and color palette from the second image to the ${subjectType} from the first sketch. It is forbidden to copy any shapes, objects, architectural elements, or scene composition (like window frames or foreground elements) from the second style-reference image. The final render must be an ${shotType} based on the user's prompt.`;
    } else {
        textPart.text = prompt;
    }

    parts.push(textPart);
    
    const response = await getAIClient().models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: { parts },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      }
    );
    return extractBase64Image(response);
  });

  const results = await Promise.all(generationPromises);
  return results.filter((result): result is string => result !== null);
};

/**
 * Upscales an image to a target resolution using a descriptive prompt.
 * @param sourceImage - The source image object containing base64 data and mimeType.
 * @param target - The target resolution, either '2k' or '4k'.
 * @returns A promise that resolves to the base64 URL of the upscaled image.
 */
export const upscaleImage = async (
  sourceImage: SourceImage,
  target: '2k' | '4k'
): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }
  
  const prompt = `Upscale this image to ${target.toUpperCase()} resolution. Enhance details, sharpness, and clarity while preserving the original content, style, and composition. Make it photorealistic.`;

  const response = await getAIClient().models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: sourceImage.base64,
              mimeType: sourceImage.mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    }
  );

  return extractBase64Image(response);
};

/**
 * Edits an image based on a source image, a mask, and a text prompt.
 * @param sourceImage - The original image to be edited.
 * @param maskImage - A black and white image where white indicates the area to edit.
 * @param prompt - The text prompt describing the desired edit.
 * @returns A promise that resolves to the base64 URL of the edited image.
 */
export const editImage = async (
  sourceImage: SourceImage,
  maskImage: SourceImage,
  prompt: string,
  count: number = 1,
  referenceImage?: SourceImage | null
): Promise<string[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }

  let engineeredPrompt = `You are an expert photo editor. You will receive an original image, a mask image, and a text prompt. Your task is to edit the original image *exclusively* within the white area defined by the mask. The black area of the mask represents the parts of the image that MUST remain completely untouched. The user's instruction for the edit is: "${prompt}". Whether this involves adding a new object, removing an existing one, or altering features, confine all changes strictly to the masked region. The final output should be a photorealistic image where the edits are seamlessly blended with the surrounding, unchanged areas.`;

  if (referenceImage) {
      engineeredPrompt += ` Additionally, a reference image is provided. Please analyze the lighting, materials, and overall style of this reference image and apply those characteristics to the edited region so it perfectly matches the reference's vibe and lighting.`;
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

    const response = await getAIClient().models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: {
        parts,
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
    return extractBase64Image(response);
  });

  const results = await Promise.all(generationPromises);
  return results.filter((result): result is string => result !== null);
};

/**
 * Generates an image purely from a text prompt.
 * @param prompt - The text prompt to guide the image generation.
 * @returns A promise that resolves to a base64 image URL.
 */
export const generateImageFromText = async (prompt: string): Promise<string | null> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }

    const response = await getAIClient().models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
            parts: [
                {
                    text: prompt,
                },
            ],
        },
        config: {
            imageConfig: {
                aspectRatio: "1:1",
                imageSize: "1K"
            }
        },
    });

    return extractBase64Image(response);
};

export const generateMagicPrompts = async (
  sourceImage: SourceImage,
  characterImage: SourceImage | null,
  note: string
): Promise<string[]> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY is not configured.");
  }
  try {
    const parts: any[] = [];
    parts.push({
      inlineData: {
        data: sourceImage.base64,
        mimeType: sourceImage.mimeType,
      }
    });
    
    let prompt = `Bạn là một chuyên gia tạo prompt và nhiếp ảnh gia kiến trúc chuyên nghiệp.
Người dùng đã cung cấp một bức ảnh tham chiếu chính về một công trình hoặc không gian kiến trúc.
Hãy phân tích các yếu tố hình ảnh, phong cách, ánh sáng, và bố cục của bức ảnh này. `;

    if (characterImage) {
      parts.push({
        inlineData: {
          data: characterImage.base64,
          mimeType: characterImage.mimeType,
        }
      });
      prompt += `Bức ảnh thứ hai là ảnh nhân vật. Hãy cố gắng miêu tả lại nhân vật trong prompt sao cho giống với ảnh mẫu nhất có thể. Đặt nhân vật này vào bối cảnh, nhưng luôn nhớ chủ thể chính vẫn là công trình kiến trúc. `;
    }
    
    if (note) {
      prompt += `\n\nGhi chú bổ sung từ người dùng: "${note}". `;
    }
    
    prompt += `\n\nHãy tạo chính xác 20 prompt nhiếp ảnh chuyên nghiệp bằng TIẾNG VIỆT dựa trên các thông tin trên. 
YÊU CẦU QUAN TRỌNG:
- Công trình kiến trúc LUÔN LÀ CHỦ THỂ CHÍNH trong tất cả các bức ảnh.
- 20 shot ảnh phải bao gồm đa dạng các góc máy và kỹ thuật: ảnh nghệ thuật, cận cảnh (close-up chi tiết kiến trúc), trung cảnh (medium shot), tiền cảnh (tiền cảnh có vật thể che mờ), các view xóa phông (depth of field / bokeh), và dưới tán lá.
- Viết bằng TIẾNG VIỆT để người dùng có thể dễ dàng đọc và chỉnh sửa.
- CHỈ TRẢ VỀ các prompt, được phân tách bằng 2 dấu xuống dòng (\n\n). KHÔNG CẦN đánh số thứ tự, KHÔNG DÙNG markdown (như in đậm, in nghiêng), KHÔNG CÓ text thừa. Chỉ trả về nội dung text thô của các prompt.`;

    parts.push({ text: prompt });

    const response = await getAIClient().models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts,
        }
      ],
      config: {
        temperature: 0.7,
      }
    });

    const text = response.text || "";
    const prompts = text.split("\n\n").map(p => p.trim()).filter(p => p.length > 0).slice(0, 20);
    return prompts;
  } catch (error) {
    console.error("Error generating magic prompts:", error);
    throw error;
  }
};
