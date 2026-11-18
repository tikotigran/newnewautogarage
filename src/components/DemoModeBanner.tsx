import React, { useState } from 'react';
import { Info, Loader2, LogOut } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface DemoModeBannerProps {
  isAuthenticated: boolean;
  onExitGuestDemo: () => void;
  onExitAuthenticatedDemo: () => Promise<void>;
}

export const DemoModeBanner: React.FC<DemoModeBannerProps> = ({
  isAuthenticated,
  onExitGuestDemo,
  onExitAuthenticatedDemo,
}) => {
  const { lang } = useI18n();
  const [isExiting, setIsExiting] = useState(false);

  const bannerMessage = pickLocalized(lang, {
    fr: 'Vous êtes en mode démonstration (données de test).',
    ru: 'Вы находитесь в демонстрационном режиме (тестовые данные).',
    hy: 'Դուք գտնվում եք ցուցադրական ռեժիմում (փորձնական տվյալներ)։',
    ka: 'თქვენ იმყოფებით სადემონსტრაციო რეჟիմში (სატესტო მონაცემები).',
  });

  const exitLabel = pickLocalized(lang, {
    fr: 'Quitter le mode démo',
    ru: 'Выйти из демо-режима',
    hy: 'Դուրս գալ դեմո ռեժիմից',
    ka: 'დემო რეჟიმიდან გასვლა',
  });

  const handleExitClick = async () => {
    if (isExiting) return;
    if (!isAuthenticated) {
      onExitGuestDemo();
      return;
    }
    setIsExiting(true);
    try {
      await onExitAuthenticatedDemo();
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label={exitLabel}
      data-testid="demo-mode-banner"
      className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 w-full min-w-0"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-60">
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 text-amber-500" />
        </div>
        <p className="text-xs sm:text-sm font-semibold text-[var(--foreground)] leading-snug">
          {bannerMessage}
        </p>
      </div>

      <div className="flex items-center w-full sm:w-auto">
        <button
          type="button"
          data-testid="demo-banner-exit-btn"
          disabled={isExiting}
          onClick={handleExitClick}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/35 transition disabled:opacity-60"
        >
          {isExiting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <LogOut className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{exitLabel}</span>
        </button>
      </div>
    </div>
  );
};
