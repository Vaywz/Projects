import React from 'react';
import * as LucideIcons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface DynamicIconProps extends Omit<LucideProps, 'ref'> {
  name: string;
  fallback?: string;
}

const DynamicIcon: React.FC<DynamicIconProps> = ({
  name,
  fallback = 'HelpCircle',
  size = 24,
  color,
  ...props
}) => {
  // Check if the name is a custom SVG URL (either /uploads/ path or data: URL)
  const isCustomIcon = name?.startsWith('/uploads/') || name?.startsWith('data:');

  if (isCustomIcon) {
    // Render custom SVG as an image
    const imgSize = typeof size === 'number' ? size : 24;
    return (
      <img
        src={name}
        alt="custom icon"
        width={imgSize}
        height={imgSize}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          filter: color ? undefined : 'none',
          ...props.style,
        }}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icons = LucideIcons as any;
  const IconComponent = icons[name] || icons[fallback];

  if (!IconComponent) {
    return null;
  }

  return <IconComponent size={size} color={color} {...props} />;
};

export default DynamicIcon;
