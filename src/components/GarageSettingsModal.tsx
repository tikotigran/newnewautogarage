import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  FileText,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  Hash,
  Scale,
  Sparkles,
} from 'lucide-react';
import { GarageSettings } from '../types/garage';
import { DEFAULT_GARAGE_SETTINGS, getGarageSettings, saveGarageSettings } from '../services/garageService';
import { useI18n } from '../i18n/I18nContext';

interface GarageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onSettingsSaved?: (newSettings: GarageSettings) => void;
}

export const GarageSettingsModal: React.FC<GarageSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSettingsSaved,
}) => {
  const { t } = useI18n();

  const [settings, setSettings] = useState<GarageSettings>(DEFAULT_GARAGE_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(getGarageSettings());
      setIsSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveGarageSettings(settings, userId);
    setIsSaved(true);
    if (onSettingsSaved) onSettingsSaved(settings);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t('garageSettingsTitle')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('garageSettingsDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Live Preview Box */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 flex items-start justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                Prévisualisation En-Tête Facture & Cession Cerfa
              </span>
              <p className="font-bold text-white text-sm">
                {settings.name || 'Nom du Garage'}
              </p>
              <p className="text-slate-400 text-xs">
                SIRET : {settings.siret || '894 123 456 00012'} • {settings.legalForm || 'SARL'}
              </p>
              <p className="text-slate-400 text-xs">
                {settings.streetNumber ? `${settings.streetNumber} ` : ''}{settings.streetName || 'Rue'}, {settings.postalCode || '75000'} {settings.city || 'Ville'}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <p>{settings.phone || '01 00 00 00 00'}</p>
              <p>{settings.email || 'contact@garage.fr'}</p>
            </div>
          </div>

          {/* Row 1: Raison Sociale & SIRET */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageNameLabel')}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  placeholder="ex. AutoGarage Manager SARL"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageSiretLabel')}
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={settings.siret}
                  onChange={(e) => setSettings({ ...settings, siret: e.target.value })}
                  placeholder="894 123 456 00012"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Adresse (N° de voie & Nom de la voie) */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageStreetNumberLabel')}
              </label>
              <input
                type="text"
                value={settings.streetNumber}
                onChange={(e) => setSettings({ ...settings, streetNumber: e.target.value })}
                placeholder="12"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="col-span-3">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageStreetNameLabel')}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={settings.streetName}
                  onChange={(e) => setSettings({ ...settings, streetName: e.target.value })}
                  placeholder="Rue de l’Industrie"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Row 3: Code postal & Ville */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garagePostalCodeLabel')}
              </label>
              <input
                type="text"
                required
                value={settings.postalCode}
                onChange={(e) => setSettings({ ...settings, postalCode: e.target.value })}
                placeholder="75011"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageCityLabel')}
              </label>
              <input
                type="text"
                required
                value={settings.city}
                onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                placeholder="Paris"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Row 4: Téléphone & Courriel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garagePhoneLabel')}
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  required
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="01 45 88 90 00"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageEmailLabel')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  placeholder="contact@autogarage.fr"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Row 5: Forme juridique & Mention TVA */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageLegalFormLabel')}
              </label>
              <div className="relative">
                <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={settings.legalForm || ''}
                  onChange={(e) => setSettings({ ...settings, legalForm: e.target.value })}
                  placeholder="ex. SARL au capital de 10 000 €"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('garageTvaLabel')}
              </label>
              <input
                type="text"
                value={settings.tvaMention || ''}
                onChange={(e) => setSettings({ ...settings, tvaMention: e.target.value })}
                placeholder="Régime particulier - TVA sur la marge (Art. 297 A du CGI)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <p>
              Ces données professionnelles seront automatiquement injectées dans la section <strong>« Ancien propriétaire »</strong> du Cerfa 15776*02 officiel ainsi que dans l'en-tête de vos <strong>Factures de Vente TTC</strong>.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition"
            >
              {t('cancelBtn')}
            </button>
            <button
              type="submit"
              className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaved ? t('settingsSaved') : t('saveSettingsBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
