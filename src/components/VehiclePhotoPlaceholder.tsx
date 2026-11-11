import React from 'react';
import { Camera } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface VehiclePhotoPlaceholderProps {
  variant?: 'card' | 'detail' | 'modal';
  className?: string;
}

export const VehiclePhotoPlaceholder: React.FC<VehiclePhotoPlaceholderProps> = ({
  variant = 'card',
  className = '',
}) => {
  const { lang } = useI18n();
  const isRu = lang === 'ru';

  const label = isRu ? 'Фото не добавлено' : 'Aucune photo';
  const subLabel = isRu ? 'Загрузите с устройства или выберите шаблон' : 'Importez ou choisissez un modèle';

  return (
    <div
      data-testid="vehicle-photo-placeholder"
      className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-500 select-none ${className}`}
    >
      <div className="relative flex items-center justify-center">
        {/* Clean Modern Car Silhouette SVG */}
        <svg
          viewBox="0 0 240 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={
            variant === 'detail'
              ? 'w-56 h-24 text-slate-700'
              : variant === 'modal'
              ? 'w-36 h-16 text-slate-700'
              : 'w-40 h-18 text-slate-700'
          }
          aria-hidden="true"
        >
          {/* Ground shadow */}
          <ellipse cx="120" cy="84" rx="95" ry="5" fill="currentColor" fillOpacity="0.25" />
          {/* Car body silhouette */}
          <path
            d="M28 66 C26 57, 30 48, 42 45 L66 41 L88 23 C94 18, 102 16, 114 16 L152 16 C165 16, 174 20, 182 28 L198 43 L210 47 C217 49, 220 55, 220 62 L220 69 C220 72, 217 74, 213 74 L198 74 C198 63, 189 55, 178 55 C167 55, 158 63, 158 74 L84 74 C84 63, 75 55, 64 55 C53 55, 44 63, 44 74 L33 74 C29 74, 28 71, 28 66 Z"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.12"
          />
          {/* Windows */}
          <path
            d="M74 41 L92 25 C96 22, 102 21, 110 21 L123 21 L123 41 Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.08"
          />
          <path
            d="M129 21 L150 21 C160 21, 167 24, 174 31 L185 41 L129 41 Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.08"
          />
          {/* Wheels */}
          <circle cx="64" cy="74" r="13" stroke="currentColor" strokeWidth="3" fill="#0f172a" />
          <circle cx="64" cy="74" r="5" fill="currentColor" fillOpacity="0.5" />
          <circle cx="178" cy="74" r="13" stroke="currentColor" strokeWidth="3" fill="#0f172a" />
          <circle cx="178" cy="74" r="5" fill="currentColor" fillOpacity="0.5" />
        </svg>

        {/* Camera badge */}
        <div className="absolute -top-1 -right-2 w-7 h-7 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-amber-400/80 shadow">
          <Camera className="w-3.5 h-3.5" />
        </div>
      </div>

      <span className="mt-1.5 text-[11px] font-semibold text-slate-400 tracking-wide">
        {label}
      </span>
      {variant === 'modal' && (
        <span className="text-[10px] text-slate-500 mt-0.5">{subLabel}</span>
      )}
    </div>
  );
};
