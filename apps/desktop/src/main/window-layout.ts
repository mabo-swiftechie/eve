const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 860;
const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 640;

export const getPreferredWindowSize = ({
  height,
  width
}: {
  height: number;
  width: number;
}): { height: number; width: number } => {
  return {
    height: Math.max(
      MIN_WINDOW_HEIGHT,
      Math.min(DEFAULT_WINDOW_HEIGHT, Math.round(height * 0.88))
    ),
    width: Math.max(
      MIN_WINDOW_WIDTH,
      Math.min(DEFAULT_WINDOW_WIDTH, Math.round(width * 0.82))
    )
  };
};

export const WINDOW_SIZE_LIMITS = {
  defaultHeight: DEFAULT_WINDOW_HEIGHT,
  defaultWidth: DEFAULT_WINDOW_WIDTH,
  minHeight: MIN_WINDOW_HEIGHT,
  minWidth: MIN_WINDOW_WIDTH
} as const;
