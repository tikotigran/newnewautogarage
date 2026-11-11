import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  DollarSign,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Download,
  AlertCircle,
  Sparkles,
  Building2,
  Clock,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Vehicle, BuyerInfo } from '../types/garage';
import { formatEuro } from '../utils/finance';
import { generateSalesInvoicePDF, generateOfficialCerfa15776PDF } from '../utils/pdfGenerator';
import { getGarageSettings } from '../services/garageService';
import { useI18n } from '../i18n/I18nContext';

interface BuyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  onConfirmSale: (vehicleId: string, buyerInfo: BuyerInfo) => Promise<void>;
}

export const BuyerModal: React.FC<BuyerModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  onConfirmSale,
}) => {
  const { t } = useI18n();

  const [isCompany, setIsCompany] = useState(vehicle?.buyerInfo?.isCompany || false);
  const [fullName, setFullName] = useState(vehicle?.buyerInfo?.fullName || '');
  const [siret, setSiret] = useState(vehicle?.buyerInfo?.siret || '');
  const [birthDate, setBirthDate] = useState(vehicle?.buyerInfo?.birthDate || '1990-01-01');
  const [birthPlace, setBirthPlace] = useState(vehicle?.buyerInfo?.birthPlace || 'Paris');
  const [streetNumber, setStreetNumber] = useState(vehicle?.buyerInfo?.streetNumber || '14');
  const [streetName, setStreetName] = useState(vehicle?.buyerInfo?.streetName || 'Rue des Lilas');
  const [postalCode, setPostalCode] = useState(vehicle?.buyerInfo?.postalCode || '75011');
  const [city, setCity] = useState(vehicle?.buyerInfo?.city || 'Paris');
  const [phone, setPhone] = useState(vehicle?.buyerInfo?.phone || '');
  const [email, setEmail] = useState(vehicle?.buyerInfo?.email || '');
  const [salePrice, setSalePrice] = useState<number | ''>(
    vehicle?.buyerInfo?.salePrice || vehicle?.targetSalePrice || vehicle?.purchasePrice || ''
  );
  const [saleDate, setSaleDate] = useState(
    vehicle?.buyerInfo?.saleDate || new Date().toISOString().split('T')[0]
  );
  const [saleTime, setSaleTime] = useState(vehicle?.buyerInfo?.saleTime || '14:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vehicle && isOpen) {
      setIsCompany(vehicle.buyerInfo?.isCompany || false);
      setFullName(vehicle.buyerInfo?.fullName || '');
      setSiret(vehicle.buyerInfo?.siret || '');
      setBirthDate(vehicle.buyerInfo?.birthDate || '1990-01-01');
      setBirthPlace(vehicle.buyerInfo?.birthPlace || 'Paris');
      setStreetNumber(vehicle.buyerInfo?.streetNumber || '14');
      setStreetName(vehicle.buyerInfo?.streetName || 'Rue des Lilas');
      setPostalCode(vehicle.buyerInfo?.postalCode || '75011');
      setCity(vehicle.buyerInfo?.city || 'Paris');
      setPhone(vehicle.buyerInfo?.phone || '');
      setEmail(vehicle.buyerInfo?.email || '');
      setSalePrice(vehicle.buyerInfo?.salePrice || vehicle.targetSalePrice || vehicle.purchasePrice);
      setSaleDate(vehicle.buyerInfo?.saleDate || new Date().toISOString().split('T')[0]);
      setSaleTime(vehicle.buyerInfo?.saleTime || '14:00');
      setError(null);
    }
  }, [vehicle, isOpen]);

  if (!isOpen || !vehicle) return null;

  // Live calculation of net profit and margin
  const numericSalePrice = Number(salePrice) || 0;
  const projectedNetProfit = numericSalePrice - (vehicle.totalInvested || 0);
  const projectedMargin = numericSalePrice > 0 ? (projectedNetProfit / numericSalePrice) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError(t('buyerFullNamePlaceholder'));
      return;
    }
    if (salePrice === '' || Number(salePrice) <= 0) {
      setError('Veuillez renseigner un prix de vente final valide.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const fullFormattedAddress = `${streetNumber ? streetNumber + ' ' : ''}${streetName.trim()}, ${postalCode.trim()} ${city.trim()}`;

      const buyerData: BuyerInfo = {
        isCompany,
        fullName: fullName.trim(),
        siret: siret.trim() || undefined,
        birthDate: isCompany ? undefined : birthDate,
        birthPlace: isCompany ? undefined : birthPlace.trim(),
        streetNumber: streetNumber.trim(),
        streetName: streetName.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        address: fullFormattedAddress,
        phone: phone.trim() || 'Non renseigné',
        email: email.trim() || 'Non renseigné',
        salePrice: Number(salePrice),
        saleDate,
        saleTime,
      };

      await onConfirmSale(vehicle.id, buyerData);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la vente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t('closeSaleTitle')}
              </h2>
              <p className="text-xs text-slate-400">
                {vehicle.make} {vehicle.model} • {vehicle.vin}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Real-time P&L Outcome Preview Box */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block">{t('totalCapitalInvestedLabel')} :</span>
              <span className="text-slate-200 font-bold text-sm">
                {formatEuro(vehicle.totalInvested)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block">{t('netMargin')}</span>
              <span className={`text-base font-extrabold ${projectedNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {projectedNetProfit >= 0 ? '+' : ''}{formatEuro(projectedNetProfit)}
                <span className="text-xs ml-1 font-normal opacity-80">
                  ({projectedMargin.toFixed(1)}%)
                </span>
              </span>
            </div>
          </div>

          {/* Row 1: Sale Price & Sale Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('finalSalePriceLabel')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold text-emerald-400 focus:outline-none focus:border-amber-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">
                  €
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('saleDateLabel')}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="date"
                  required
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('saleTimeLabel')}
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="time"
                  required
                  value={saleTime}
                  onChange={(e) => setSaleTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Nouveau Propriétaire (Buyer for Cerfa & Invoice) */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                Section Cerfa 15776 : Nouveau Propriétaire (Acquéreur)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsCompany(false)}
                  className={`px-2.5 py-1 rounded-lg border transition ${
                    !isCompany
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {t('individualBuyer')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCompany(true)}
                  className={`px-2.5 py-1 rounded-lg border transition ${
                    isCompany
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {t('companyBuyer')}
                </button>
              </div>
            </div>

            {/* Buyer Name & SIRET */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isCompany ? 'Raison Sociale de l’Entreprise *' : t('buyerFullNameLabel')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={isCompany ? 'ex. SARL Transport Express' : t('buyerFullNamePlaceholder')}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {isCompany ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {t('buyerSiretLabel')}
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                      placeholder="ex. 912 345 678 00019"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('buyerBirthDateLabel')}
                    </label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {t('buyerBirthPlaceLabel')}
                    </label>
                    <input
                      type="text"
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      placeholder="ex. Lyon (69)"
                      className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Address fields */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('buyerStreetNumberLabel')}
                </label>
                <input
                  type="text"
                  value={streetNumber}
                  onChange={(e) => setStreetNumber(e.target.value)}
                  placeholder="14"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('buyerStreetNameLabel')}
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={streetName}
                    onChange={(e) => setStreetName(e.target.value)}
                    placeholder="Rue des Lilas"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('buyerPostalCodeLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="69003"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('buyerCityLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Lyon"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('phone')}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('buyerPhonePlaceholder')}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('buyerEmailPlaceholder')}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Document Auto-Generation info notice */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-indigo-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
            <Sparkles className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200">{t('autoGenNoticeTitle')}</p>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Dès validation, les 2 boutons <strong>« Télécharger / Imprimer la Facture »</strong> et <strong>« Télécharger / Imprimer le Cerfa 15776 »</strong> seront instantanément disponibles dans le dossier du véhicule.
              </p>
            </div>
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
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? t('loading') : t('confirmSaleBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
