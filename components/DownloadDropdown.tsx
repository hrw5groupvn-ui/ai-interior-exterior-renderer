import React, { useState } from 'react';
import { Icon } from './icons';
import { upscaleImage } from '../services/geminiService';
import { SourceImage } from '../types';

const dataUrlToSourceImage = (dataUrl: string): SourceImage | null => {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
        return { mimeType: match[1], base64: match[2] };
    }
    return null;
}

export const DownloadDropdown: React.FC<{ 
    imageUrl: string; 
    filenamePrefix?: string;
}> = ({ imageUrl, filenamePrefix = 'CID-AI' }) => {
  const [isDownloading2K, setIsDownloading2K] = useState(false);
  const [isDownloading4K, setIsDownloading4K] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const handleDownload = async (resolution?: '2k' | '4k') => {
      let finalUrl = imageUrl;
      
      if (resolution === '2k' || resolution === '4k') {
          const source = dataUrlToSourceImage(imageUrl);
          if (source) {
              if (resolution === '2k') setIsDownloading2K(true);
              if (resolution === '4k') setIsDownloading4K(true);
              try {
                  const upscaledUrl = await upscaleImage(source, resolution);
                  if (upscaledUrl) {
                      finalUrl = upscaledUrl;
                  }
              } catch (err) {
                  console.error("Upscale failed:", err);
                  alert("Có lỗi xảy ra khi nâng cấp ảnh.");
              } finally {
                  if (resolution === '2k') setIsDownloading2K(false);
                  if (resolution === '4k') setIsDownloading4K(false);
              }
          }
      }
      
      const link = document.createElement('a');
      link.href = finalUrl;
      link.download = `${filenamePrefix}-${resolution || 'original'}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="relative">
        <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 hover:bg-indigo-600 text-white font-bold text-xs px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 w-full justify-start"
        >
            <Icon name="download" className="w-4 h-4" />
            <span>{isDownloading2K ? 'Đang tải 2K...' : isDownloading4K ? 'Đang tải 4K...' : 'Tải xuống'}</span>
        </button>
        {isMenuOpen && (
            <div className="absolute right-0 mt-1 w-32 bg-slate-800 border border-slate-600 rounded-md shadow-lg z-50 flex flex-col overflow-hidden">
                <button onClick={() => { setIsMenuOpen(false); handleDownload(); }} className="px-3 py-2 text-xs text-left text-white hover:bg-slate-700 transition-colors border-b border-slate-700">Tải Gốc</button>
                <button onClick={() => { setIsMenuOpen(false); handleDownload('2k'); }} disabled={isDownloading2K || isDownloading4K} className="px-3 py-2 text-xs text-left text-white hover:bg-slate-700 transition-colors border-b border-slate-700 flex items-center gap-2">
                    {isDownloading2K ? <div className="w-3 h-3 rounded-full border-t-2 border-b-2 border-indigo-500 animate-spin"></div> : 'Tải 2K'}
                </button>
                <button onClick={() => { setIsMenuOpen(false); handleDownload('4k'); }} disabled={isDownloading2K || isDownloading4K} className="px-3 py-2 text-xs text-left text-white hover:bg-slate-700 transition-colors flex items-center gap-2">
                    {isDownloading4K ? <div className="w-3 h-3 rounded-full border-t-2 border-b-2 border-indigo-500 animate-spin"></div> : 'Tải 4K'}
                </button>
            </div>
        )}
    </div>
  );
};
