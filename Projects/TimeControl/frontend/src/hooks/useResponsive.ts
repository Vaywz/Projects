import { Grid } from 'antd';

const { useBreakpoint } = Grid;

export const useResponsive = () => {
  const screens = useBreakpoint();

  const isMobile = !screens.md;        // <768px
  const isTablet = !!screens.md && !screens.lg; // 768-991
  const isDesktop = !!screens.lg;       // >=992

  return {
    screens,
    isMobile,
    isTablet,
    isDesktop,

    modalWidth: (defaultWidth: number = 520) =>
      isMobile ? '95vw' as const : defaultWidth,

    contentPadding: isMobile ? 12 : isTablet ? 16 : 24,
    contentMargin: isMobile ? 8 : isTablet ? 16 : 24,

    formColSpan: isMobile ? 24 : 12,
  };
};
