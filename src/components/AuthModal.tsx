import React, { useEffect, useState } from 'react';
import {
  X,
  Mail,
  Lock,
  LogIn,
  ShieldCheck,
  AlertCircle,
  Loader2,
  UserPlus,
  User as UserIcon,
  Briefcase,
  Car,
  Sparkles,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from '../services/firebase';
import { SUPERADMIN_BOOTSTRAP_EMAIL } from '../utils/adminUtils';
import { getPendingProfileType, setPendingProfileType } from '../services/adminService';
import { AppUserProfileType, UserProfile } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDevSuperAdminLogin: (profile: UserProfile) => void;
  variant?: 'modal' | 'page';
  initialMode?: 'login' | 'register';
  onEnterDemoMode?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onDevSuperAdminLogin,
  variant = 'modal',
  initialMode = 'login',
  onEnterDemoMode,
}) => {
  const { lang, t } = useI18n();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [selectedProfileType, setSelectedProfileType] = useState<AppUserProfileType>(
    () => getPendingProfileType() || 'micro_entrepreneur'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  if (!isOpen) return null;

  const isDevEnv =
    import.meta.env.DEV ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname.includes('run.app')));

  const handleProfileChoice = (next: AppUserProfileType) => {
    setSelectedProfileType(next);
    setPendingProfileType(next);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'register') {
        setPendingProfileType(selectedProfileType);
      }
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-blocked') || msg.includes('popup-closed')) {
        setError(t('authPopupBlocked'));
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError(t('authMissingFields'));
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        setPendingProfileType(selectedProfileType);
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevBypass = () => {
    const now = new Date().toISOString();
    const adminProfile: UserProfile = {
      uid: 'dev_superadmin_hq',
      email: SUPERADMIN_BOOTSTRAP_EMAIL,
      displayName: 'Direction AutoGarage',
      garageName: 'AutoGarage Manager HQ',
      role: 'superadmin',
      profileType: 'micro_entrepreneur',
      planId: 'enterprise',
      vehicleLimit: 9999,
      activeVehiclesCount: 0,
      subscriptionStatus: 'active',
      mrrAmount: 79,
      createdAt: now,
      updatedAt: now,
    };
    onDevSuperAdminLogin(adminProfile);
    onClose();
  };

  const isFullPage = variant === 'page';

  const cardContent = (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      {isFullPage ? (
        <div className="px-6 pt-6 pb-4 border-b border-slate-800 text-center space-y-2.5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow-lg">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight text-white">
              {t('appName')}
            </div>
            <h1 id="auth-modal-title" className="text-sm font-bold text-slate-200 mt-1">
              {mode === 'login' ? t('authSignInTitle') : t('authRegisterTitle')}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('authSubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <LogIn className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-bold text-white">
                {mode === 'login' ? t('authSignInTitle') : t('authRegisterTitle')}
              </h2>
              <p className="text-[11px] text-slate-400">{t('authSubtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeBtn')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

        {/* Body */}
        <div className="p-5 space-y-3.5">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Two-Profile Type Picker during Registration */}
          {mode === 'register' && (
            <div data-testid="auth-profile-picker" className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-300">
                {t('profileSwitchLabel')}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="auth-profile-particulier"
                  onClick={() => handleProfileChoice('particulier')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedProfileType === 'particulier'
                      ? 'bg-amber-500/15 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <UserIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">{t('profileParticulierTitle')}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                    {t('profileParticulierDesc')}
                  </p>
                </button>

                <button
                  type="button"
                  data-testid="auth-profile-micro"
                  onClick={() => handleProfileChoice('micro_entrepreneur')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedProfileType === 'micro_entrepreneur'
                      ? 'bg-amber-500/15 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Briefcase className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{t('profileMicroTitle')}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                    {t('profileMicroDesc')}
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-900 transition disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{t('authGoogle')}</span>
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-800" />
            <span className="px-3 text-[11px] text-slate-500">{t('authOrEmail')}</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-300 mb-1"
              >
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@garage.fr"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-300 mb-1"
              >
                {t('authPassword')}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>
                {mode === 'login' ? t('authSubmitLogin') : t('authSubmitRegister')}
              </span>
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              data-testid="auth-mode-toggle"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="text-xs text-slate-400 hover:text-amber-400 transition"
            >
              {mode === 'login' ? t('authNoAccount') : t('authHaveAccount')}
            </button>
          </div>

          {isFullPage && onEnterDemoMode && (
            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                data-testid="auth-enter-demo-btn"
                onClick={onEnterDemoMode}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>
                  {pickLocalized(lang, {
                    fr: 'Découvrir le mode démo',
                    ru: 'Попробовать демо-режим',
                    hy: 'Փորձել դեմո ռեժիմը',
                    ka: 'სცადეთ დემო რეჟიმი',
                  })}
                </span>
              </button>
            </div>
          )}

          {/* Dev / Preview SuperAdmin Fallback (modal only) */}
          {!isFullPage && isDevEnv && (
            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleDevBypass}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {t('authDevAdmin', { email: SUPERADMIN_BOOTSTRAP_EMAIL })}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
  );

  if (isFullPage) {
    return (
      <div
        data-testid="full-screen-auth"
        className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)] p-4"
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {cardContent}
    </div>
  );
};

