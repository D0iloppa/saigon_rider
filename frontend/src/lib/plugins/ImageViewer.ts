import { registerPlugin } from '@capacitor/core';

export interface ImageViewerRect {
  x: number;
  y: number;
  width: number;
  height: number;
  dpr?: number;
}

export interface ImageViewerShowOptions {
  images: string[];
  startIndex?: number;
  rect?: ImageViewerRect;
  noImagePopup?: number;
}

export interface ImageViewerOpenOptions {
  images: string[];
  startIndex?: number;
}

export interface ImageViewerPlugin {
  /** 풀스크린 이미지 뷰어 표시 (iOS 전용). */
  show(options: ImageViewerShowOptions): Promise<void>;
  /** rect 기반 transition 없이 단순 오픈 (iOS 전용). */
  open(options: ImageViewerOpenOptions): Promise<void>;
  /** 현재 띄워진 이미지 뷰어 닫기 (iOS 전용). */
  close(): Promise<void>;
}

export const ImageViewer = registerPlugin<ImageViewerPlugin>('ImageViewer');
