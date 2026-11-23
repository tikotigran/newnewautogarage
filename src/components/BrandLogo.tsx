import React, { useState } from 'react';
import voLogoAsset from '../assets/vo-logo.png';

export const APP_LOGO_SRC = voLogoAsset;

interface BrandLogoProps {
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  testId?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  alt = 'AutoGarage Manager',
  size = 'sm',
  className = '',
  testId = 'app-brand-logo',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        data-testid={testId}
        role="img"
        aria-label={alt}
        className={`${SIZE_CLASSES[size]} bg-[#F19504] border border-white/15 shadow-sm shrink-0 select-none flex items-center justify-center ${className}`}
      >
        <svg viewBox="0 0 100 100" className="w-[78%] h-[78%]" aria-hidden="true">
          <path
            d="M12 32 L32 66 C34 69 38 69 40 66 L50 49 C55 41 62 36 72 36 C84 36 91 44 91 55 C91 66 83 74 71 74 C61 74 53 69 48 61 L55 50 C58 58 64 62 71 62 C77 62 80 59 80 55 C80 50 76 47 71 47 C64 47 59 51 55 58 L46 72 C42 78 30 78 26 72 L4 32 Z"
            fill="#ffffff"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={APP_LOGO_SRC}
      alt={alt}
      data-testid={testId}
      onError={() => setImgFailed(true)}
      className={`${SIZE_CLASSES[size]} object-cover bg-[#F19504] border border-white/15 shadow-sm shrink-0 select-none ${className}`}
    />
  );
};
