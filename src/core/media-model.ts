/** Normalized media shapes shared by every context (MAIN, ISOLATED, background, UI). */

export type SlideKind = 'image' | 'video';

export interface MediaSlide {
  kind: SlideKind;
  /** Highest-quality source: image_versions2.candidates[0] or video_versions[0]. */
  url: string;
  width?: number;
  height?: number;
  /** Poster frame for videos, used by the UI only. */
  thumbUrl?: string;
}

export interface MediaItem {
  /** Instagram media primary key, as a decimal string. */
  pk: string;
  /** Short URL code, e.g. the "Cx1y2z" in instagram.com/p/Cx1y2z/. */
  shortcode?: string;
  type: 'image' | 'video' | 'carousel';
  username?: string;
  /** Unix seconds. */
  takenAt?: number;
  slides: MediaSlide[];
}

/** One file to save, fully resolved. */
export interface DownloadSpec {
  url: string;
  /** Path relative to the browser's download directory, including subfolders. */
  filename: string;
}

export const MEDIA_TYPE_VIDEO = 2;
export const MEDIA_TYPE_CAROUSEL = 8;
