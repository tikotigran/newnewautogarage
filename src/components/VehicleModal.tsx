import React, { useState, useEffect } from 'react';
import {
  X,
  Car,
  Calendar,
  Gauge,
  Tag,
  Euro,
  FileText,
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder';

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  initialVehicle?: Vehicle | null;
  userId: string;
}

const SAMPLE_PHOTO_PRESETS = [
  { label: 'Citadine Moderne (Peugeot)', url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Berline Compacte (Golf)', url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Premium Sportback (Audi)', url: 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Crossover / SUV (Renault)', url: 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Utilitaire / Van', url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80' },
];

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialVehicle,
  userId,
}) => {
  const { t, lang } = useI18n();
  const isRu = lang === 'ru';
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [mileage, setMileage] = useState<number | ''>('');
  const [vin, setVin] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [targetSalePrice, setTargetSalePrice] = useState<number | ''>('');
  const [status, setStatus] = useState<VehicleStatus>('preparation');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialVehicle) {
      setMake(initialVehicle.make);
      setModel(initialVehicle.model);
      setTrim(initialVehicle.trim || '');
      setYear(initialVehicle.year);
      setMileage(initialVehicle.mileage);
      setVin(initialVehicle.vin || '');
      setRegistrationNumber(initialVehicle.registrationNumber || '');
      setPurchaseDate(initialVehicle.purchaseDate);
      setPurchasePrice(initialVehicle.purchasePrice);
      setTargetSalePrice(initialVehicle.targetSalePrice > 0 ? initialVehicle.targetSalePrice : '');
      setStatus(initialVehicle.status);
      setPhotos(initialVehicle.photos || []);
    } else {
      setMake('');
      setModel('');
      setTrim('');
      setYear(2021);
      setMileage('');
      setVin('');
      setRegistrationNumber('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setPurchasePrice('');
      setTargetSalePrice('');
      setStatus('preparation');
      setPhotos([]);
    }
    setError(null);
  }, [initialVehicle, isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => [reader.result as string, ...prev]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPresetPhoto = (url: string) => {
    if (!photos.includes(url)) {
      setPhotos((prev) => [...prev, url]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedVin = vin.replace(/\s+/g, '').toUpperCase();
    const cleanedReg = registrationNumber.trim().toUpperCase();

    if (!make.trim() || !model.trim()) {
      setError('Veuillez renseigner la marque et le modèle.');
      return;
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanedVin)) {
      setError(
        isRu
          ? 'VIN должен содержать ровно 17 символов (латинские буквы и цифры, без I, O, Q).'
          : 'Le numéro VIN doit contenir exactement 17 caractères alphanumériques (hors I, O, Q).'
      );
      return;
    }
    if (!cleanedReg) {
      setError(
        isRu
          ? 'Укажите госномер (Immatriculation), например AB-123-CD.'
          : 'Veuillez renseigner le numéro d’immatriculation (ex. AB-123-CD).'
      );
      return;
    }
    if (mileage === '' || Number(mileage) < 0) {
      setError('Veuillez renseigner un kilométrage valide.');
      return;
    }
    if (purchasePrice === '' || Number(purchasePrice) < 0) {
      setError('Veuillez renseigner un prix d’achat valide.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim(),
        year: Number(year),
        mileage: Number(mileage),
        vin: cleanedVin,
        registrationNumber: cleanedReg,
        purchaseDate,
        purchasePrice: Number(purchasePrice),
        targetSalePrice: targetSalePrice !== '' && Number(targetSalePrice) > 0 ? Number(targetSalePrice) : 0,
        status,
        photos,
        documents: initialVehicle?.documents || [],
        buyerInfo: initialVehicle?.buyerInfo,
        repairCostTotal: initialVehicle?.repairCostTotal || 0,
        generalExpensesTotal: initialVehicle?.generalExpensesTotal || 0,
        totalExpenses: initialVehicle?.totalExpenses || 0,
        totalInvested: initialVehicle?.totalInvested || Number(purchasePrice),
        netProfit: initialVehicle?.netProfit || 0,
        marginPercentage: initialVehicle?.marginPercentage || 0,
      };

      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue lors de l’enregistrement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialVehicle ? t('editVehicleModalTitle') : t('addVehicleModalTitle')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('vehicleModalSubtitle')}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Make, Model & Trim */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('make')} *
              </label>
              <input
                type="text"
                required
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="ex. Peugeot, Renault..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('model')} *
              </label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="ex. 208, Clio V, Golf..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('trimVersion')}
              </label>
              <input
                type="text"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                placeholder="ex. GT Line 130ch EAT8"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Row 2: Year, Mileage, VIN & Immatriculation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('year')} *
              </label>
              <input
                type="number"
                required
                min={1950}
                max={2030}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('mileage')} (km) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={mileage}
                onChange={(e) => setMileage(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ex. 65000"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="vehicle-vin" className="text-xs font-semibold text-slate-300">
                  VIN (Numéro d'identification) *
                </label>
                <span
                  className={`text-[10px] font-mono ${
                    vin.replace(/\s+/g, '').length === 17 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {vin.replace(/\s+/g, '').length}/17
                </span>
              </div>
              <input
                id="vehicle-vin"
                type="text"
                required
                maxLength={17}
                value={vin}
                onChange={(e) => setVin(e.target.value.replace(/\s+/g, '').toUpperCase())}
                placeholder="ex. VF3UPHNK0MT129841"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white uppercase placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="vehicle-reg" className="block text-xs font-semibold text-slate-300 mb-1">
                {isRu ? 'Госномер / Immatriculation *' : 'Immatriculation (Plaque) *'}
              </label>
              <input
                id="vehicle-reg"
                type="text"
                required
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                placeholder="ex. AB-123-CD"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white uppercase placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Row 3: Purchase Date, Purchase Price & Target Sale Price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('purchaseDate')} *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('purchasePriceLabel')} (€) *
              </label>
              <input
                type="number"
                required
                min={0}
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ex. 8500"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-bold placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('targetSalePriceInput')}
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={targetSalePrice}
                onChange={(e) => setTargetSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ex. 11900"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-bold placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Row 4: Status Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              {t('taskStatusLabel')} *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setStatus('preparation')}
                className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                  status === 'preparation'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🛠️ {t('statusPreparation')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('repair')}
                className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                  status === 'repair'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🔧 {t('statusRepair')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('for_sale')}
                className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                  status === 'for_sale'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🏷️ {t('statusForSale')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('sold')}
                className={`p-2.5 rounded-xl text-xs font-bold border text-center transition ${
                  status === 'sold'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ✅ {t('statusSold')}
              </button>
            </div>
          </div>

          {/* Row 5: Media & Photos Upload */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                {t('photosVehicleLabel')}
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                <Upload className="w-3.5 h-3.5" />
                <span>{t('uploadFromDevice')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Presets quick selection */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              <span className="text-[11px] text-slate-500 self-center">{t('quickPresetsPhotos')}</span>
              {SAMPLE_PHOTO_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddPresetPhoto(p.url)}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  + {p.label}
                </button>
              ))}
            </div>

            {/* Photos thumbnail preview row or Vector Placeholder */}
            {photos.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto py-2">
                {photos.map((url, index) => (
                  <div key={index} className="relative w-24 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-700 group">
                    <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-900/80 text-red-400 hover:bg-red-500 hover:text-white transition opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-28 rounded-2xl overflow-hidden border border-dashed border-slate-700">
                <VehiclePhotoPlaceholder variant="modal" />
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
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
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center gap-2"
            >
              {isSubmitting ? (
                <span>{t('loading')}</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{initialVehicle ? t('updateVehicleBtn') : t('saveVehicleBtn')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
