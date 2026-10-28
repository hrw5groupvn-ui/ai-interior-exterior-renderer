export type AspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type ImageResolution = '1K' | '2K' | '4K';

export interface RenderOptions {
  aspectRatio?: AspectRatio;
  imageSize?: ImageResolution;
}

export interface RenderHistoryItem {
  id: number;
  timestamp: string;
  images: string[];
  prompt: string;
  aspectRatio?: AspectRatio;
  resolution?: ImageResolution;
  modelName?: string;
}

export interface EditHistoryItem {
  id: number;
  timestamp: string;
  sourceImage: SourceImage;
  maskImage: SourceImage;
  prompt: string;
  resultImage: string;
}

export interface SourceImage {
  base64: string;
  mimeType: string;
  dataUrl?: string;
}
