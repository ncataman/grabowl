/**
 * Every Instagram DOM assumption lives behind this interface. When Instagram
 * changes its markup we ship a new dated adapter instead of hunting selectors
 * scattered through the UI code.
 */

export type SurfaceKind = 'post' | 'reel' | 'story' | 'grid';

/** Instagram's own row of like/comment/share icons, where our button is inserted. */
export interface ActionBar {
  element: HTMLElement;
  /** Vertical rails read top-down, horizontal rows left-to-right. */
  placement: 'start' | 'end';
}

export interface MediaSurface {
  /** The post, reel, story or grid tile the button belongs to. */
  container: HTMLElement;
  kind: SurfaceKind;
  /** The visible <img> or <video>. Null on grid tiles, whose image is a thumbnail. */
  mediaEl: HTMLElement | null;
  shortcode?: string;
  /**
   * Where to insert an inline button. Absent for grid tiles, which get a corner
   * button revealed on hover instead.
   */
  actionBar?: ActionBar;
}

export interface SelectorSet {
  readonly id: string;
  /** Returns true when this adapter recognises the current page. */
  selfTest(root: ParentNode): boolean;
  findSurfaces(root: ParentNode): MediaSurface[];
  /**
   * Which post a container currently holds. Must be re-read at click time:
   * Instagram recycles containers as the feed virtualises, so a value captured
   * when the button was mounted can belong to a different post by then.
   */
  shortcodeOf(container: HTMLElement): string | undefined;
  /** The image or video currently shown in a container. Also re-read at click time. */
  mediaElOf(container: HTMLElement): HTMLElement | null;
  /** The profile header, when the current page is somebody's profile. */
  profileHeader(root: ParentNode): HTMLElement | null;
  /** 0-based index of the slide currently shown in a carousel container. */
  activeSlideIndex(container: HTMLElement): number;
}
