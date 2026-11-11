import React, { useState, useEffect } from 'react';
import {
  X,
  Car,
  Building2,
  UserCheck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Download,
  Printer,
  AlertCircle,
  FileCheck,
  Loader2,
  Wrench,
} from 'lucide-react';
import { Vehicle } from '../types/garage';
import { getGarageSettings } from '../services/garageService';
import {
  Cerfa15776FormData,
  buildInitialCerfaData,
  validateCerfaStep,
} from '../utils/cerfa15776';
import { Cerfa15776Config, cloneCerfaConfig } from '../utils/cerfaConfig';
import { generateCerfa15776FromFormData } from '../utils/pdfGenerator';
import { CerfaAlignerPanel } from './CerfaAlignerPanel';

interface Cerfa15776ModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  initialAlignerMode?: boolean;
}

export const Cerfa15776Modal: React.FC<Cerfa15776ModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  initialAlignerMode = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<Cerfa15776FormData>(() =>
    buildInitialCerfaData(vehicle, getGarageSettings())
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedSuccess, setGeneratedSuccess] = useState(false);
  const [isAlignerMode, setIsAlignerMode] = useState(initialAlignerMode);
  const [alignerConfig, setAlignerConfig] = useState<Cerfa15776Config>(() => cloneCerfaConfig());

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormData(buildInitialCerfaData(vehicle, getGarageSettings()));
      setErrors({});
      setGenerationError(null);
      setGeneratedSuccess(false);
      setIsAlignerMode(initialAlignerMode);
      setAlignerConfig(cloneCerfaConfig());
    }
  }, [isOpen, vehicle, initialAlignerMode]);

  if (!isOpen) return null;

  const updateVehicleField = <K extends keyof Cerfa15776FormData['vehicle']>(
    field: K,
    value: Cerfa15776FormData['vehicle'][K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      vehicle: { ...prev.vehicle, [field]: value },
    }));
  };

  const updateSellerField = <K extends keyof Cerfa15776FormData['seller']>(
    field: K,
    value: Cerfa15776FormData['seller'][K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      seller: { ...prev.seller, [field]: value },
    }));
  };

  const updateBuyerField = <K extends keyof Cerfa15776FormData['buyer']>(
    field: K,
    value: Cerfa15776FormData['buyer'][K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      buyer: { ...prev.buyer, [field]: value },
    }));
  };

  const handleNext = () => {
    const stepErrors = validateCerfaStep(step, formData);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
    }
  };

  const handlePrev = () => {
    setErrors({});
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev));
  };

  const handleGeneratePDF = async (action: 'download' | 'print') => {
    const stepErrors = validateCerfaStep(3, formData);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedSuccess(false);

    try {
      await generateCerfa15776FromFormData(formData, action, alignerConfig);
      setGeneratedSuccess(true);
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la génération du formulaire Cerfa 15776*02.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const steps = [
    { id: 1 as const, label: '1. Le Véhicule', icon: Car },
    { id: 2 as const, label: '2. Ancien Propriétaire', icon: Building2 },
    { id: 3 as const, label: '3. Nouveau Propriétaire', icon: UserCheck },
  ];

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition';
  const labelClass = 'block text-xs font-semibold text-slate-300 mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cerfa-wizard-title"
    >
      <div
        className={`bg-slate-900 border border-slate-800 rounded-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all ${
          isAlignerMode ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cerfa-wizard-title" className="text-lg font-bold text-white">
                Cerfa N° 15776*02 — Certificat de cession
              </h2>
              <p className="text-xs text-slate-400">
                Remplissage officiel sur le modèle gouvernemental (Exemplaires 1 & 2)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAlignerMode((prev) => !prev)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                isAlignerMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-amber-400 border-slate-700'
              }`}
            >
              <span>🔧 Режим выравнивания / Aligner Mode</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l'assistant Cerfa 15776"
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper (hidden in Aligner Mode) */}
        {!isAlignerMode && (
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 grid grid-cols-3 gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < step) {
                    setErrors({});
                    setStep(s.id);
                  }
                }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    : isCompleted
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-pointer'
                    : 'bg-slate-900 text-slate-500 border-slate-800 cursor-default'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
        )}

        {/* Form Body or Aligner Mode */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {isAlignerMode ? (
            <CerfaAlignerPanel
              formData={formData}
              config={alignerConfig}
              onConfigChange={setAlignerConfig}
            />
          ) : (
            <>
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <ul className="space-y-1">
                {Object.values(errors).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {generationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-xs text-red-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{generationError}</span>
            </div>
          )}

          {generatedSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Le formulaire officiel Cerfa N° 15776*02 a été généré avec succès (signatures laissées vierges).
              </span>
            </div>
          )}

          {/* STEP 1: VEHICLE */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="cerfa-reg" className={labelClass}>
                    (A) N° d'immatriculation *
                  </label>
                  <input
                    id="cerfa-reg"
                    type="text"
                    placeholder="AB-123-CD"
                    value={formData.vehicle.registrationNumber}
                    onChange={(e) =>
                      updateVehicleField('registrationNumber', e.target.value.toUpperCase())
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-vin" className={labelClass}>
                    (E) Numéro d'identification (VIN) *
                  </label>
                  <input
                    id="cerfa-vin"
                    type="text"
                    value={formData.vehicle.vin}
                    onChange={(e) => updateVehicleField('vin', e.target.value.toUpperCase())}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-first-reg" className={labelClass}>
                    (B) 1re immatriculation
                  </label>
                  <input
                    id="cerfa-first-reg"
                    type="date"
                    value={formData.vehicle.firstRegistrationDate}
                    onChange={(e) => updateVehicleField('firstRegistrationDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-make" className={labelClass}>
                    (D.1) Marque *
                  </label>
                  <input
                    id="cerfa-make"
                    type="text"
                    value={formData.vehicle.make}
                    onChange={(e) => updateVehicleField('make', e.target.value.toUpperCase())}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-d2" className={labelClass}>
                    (D.2) Type, variante, version
                  </label>
                  <input
                    id="cerfa-d2"
                    type="text"
                    value={formData.vehicle.typeVariantVersion}
                    onChange={(e) => updateVehicleField('typeVariantVersion', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="cerfa-j1" className={labelClass}>
                    (J.1) Genre national
                  </label>
                  <select
                    id="cerfa-j1"
                    value={formData.vehicle.nationalGenre}
                    onChange={(e) => updateVehicleField('nationalGenre', e.target.value)}
                    className={inputClass}
                  >
                    <option value="VP">VP (Voiture particulière)</option>
                    <option value="CTTE">CTTE (Camionnette)</option>
                    <option value="MTT1">MTT1 / MTT2 (Moto)</option>
                    <option value="CAM">CAM (Camion)</option>
                    <option value="VASP">VASP (Véhicule spécialisé)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cerfa-d3" className={labelClass}>
                    (D.3) Dénomination commerciale
                  </label>
                  <input
                    id="cerfa-d3"
                    type="text"
                    value={formData.vehicle.commercialDesignation}
                    onChange={(e) =>
                      updateVehicleField('commercialDesignation', e.target.value.toUpperCase())
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-mileage" className={labelClass}>
                    Kilométrage au compteur *
                  </label>
                  <input
                    id="cerfa-mileage"
                    type="number"
                    min={0}
                    value={formData.vehicle.mileage}
                    onChange={(e) =>
                      updateVehicleField(
                        'mileage',
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Certificat d'immatriculation presence */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <span className="block text-xs font-bold text-white">
                  Présence du certificat d'immatriculation
                </span>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => updateVehicleField('hasRegistrationCertificate', true)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      formData.vehicle.hasRegistrationCertificate
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    OUI — Certificat présent
                  </button>
                  <button
                    type="button"
                    onClick={() => updateVehicleField('hasRegistrationCertificate', false)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      !formData.vehicle.hasRegistrationCertificate
                        ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    NON — Absent
                  </button>
                </div>

                {formData.vehicle.hasRegistrationCertificate ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label htmlFor="cerfa-formula" className={labelClass}>
                        Numéro de formule (ex: 2019AB12345)
                      </label>
                      <input
                        id="cerfa-formula"
                        type="text"
                        placeholder="20..."
                        value={formData.vehicle.formulaNumber}
                        onChange={(e) =>
                          updateVehicleField('formulaNumber', e.target.value.toUpperCase())
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="cerfa-cert-date" className={labelClass}>
                        ou (I) Date du certificat (ancien format)
                      </label>
                      <input
                        id="cerfa-cert-date"
                        type="date"
                        value={formData.vehicle.certificateDate}
                        onChange={(e) => updateVehicleField('certificateDate', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-1">
                    <label htmlFor="cerfa-absence-reason" className={labelClass}>
                      Motif d'absence du certificat d'immatriculation *
                    </label>
                    <input
                      id="cerfa-absence-reason"
                      type="text"
                      placeholder="Ex: Déclaration de perte jointe..."
                      value={formData.vehicle.absenceReason}
                      onChange={(e) => updateVehicleField('absenceReason', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: SELLER */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateSellerField('entityType', 'morale')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                    formData.seller.entityType === 'morale'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Personne morale (Société / Garage)
                </button>
                <button
                  type="button"
                  onClick={() => updateSellerField('entityType', 'physique')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                    formData.seller.entityType === 'physique'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Personne physique
                </button>

                {formData.seller.entityType === 'physique' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-400">Sexe :</span>
                    {(['M', 'F'] as const).map((sx) => (
                      <button
                        key={sx}
                        type="button"
                        onClick={() => updateSellerField('sex', sx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          formData.seller.sex === sx
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        {sx}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-seller-name" className={labelClass}>
                    {formData.seller.entityType === 'morale'
                      ? 'Raison sociale *'
                      : 'Nom et Prénom *'}
                  </label>
                  <input
                    id="cerfa-seller-name"
                    type="text"
                    value={formData.seller.nameOrCompany}
                    onChange={(e) => updateSellerField('nameOrCompany', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-siret" className={labelClass}>
                    N° SIRET {formData.seller.entityType === 'morale' ? '*' : '(le cas échéant)'}
                  </label>
                  <input
                    id="cerfa-seller-siret"
                    type="text"
                    value={formData.seller.siret}
                    onChange={(e) => updateSellerField('siret', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="cerfa-seller-num" className={labelClass}>
                    N° de voie
                  </label>
                  <input
                    id="cerfa-seller-num"
                    type="text"
                    value={formData.seller.streetNumber}
                    onChange={(e) => updateSellerField('streetNumber', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-ext" className={labelClass}>
                    Extension (bis, ter)
                  </label>
                  <input
                    id="cerfa-seller-ext"
                    type="text"
                    value={formData.seller.streetExtension}
                    onChange={(e) => updateSellerField('streetExtension', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-type" className={labelClass}>
                    Type de voie
                  </label>
                  <input
                    id="cerfa-seller-type"
                    type="text"
                    placeholder="Rue, Avenue..."
                    value={formData.seller.streetType}
                    onChange={(e) => updateSellerField('streetType', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-street" className={labelClass}>
                    Nom de la voie
                  </label>
                  <input
                    id="cerfa-seller-street"
                    type="text"
                    value={formData.seller.streetName}
                    onChange={(e) => updateSellerField('streetName', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-seller-zip" className={labelClass}>
                    Code postal *
                  </label>
                  <input
                    id="cerfa-seller-zip"
                    type="text"
                    value={formData.seller.postalCode}
                    onChange={(e) => updateSellerField('postalCode', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-city" className={labelClass}>
                    Commune *
                  </label>
                  <input
                    id="cerfa-seller-city"
                    type="text"
                    value={formData.seller.city}
                    onChange={(e) => updateSellerField('city', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="cerfa-sale-date" className={labelClass}>
                    Cédé le *
                  </label>
                  <input
                    id="cerfa-sale-date"
                    type="date"
                    value={formData.seller.saleDate}
                    onChange={(e) => updateSellerField('saleDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-sale-time" className={labelClass}>
                    à (heure)
                  </label>
                  <input
                    id="cerfa-sale-time"
                    type="time"
                    value={formData.seller.saleTime}
                    onChange={(e) => updateSellerField('saleTime', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-fait-a" className={labelClass}>
                    Fait à (Commune) *
                  </label>
                  <input
                    id="cerfa-seller-fait-a"
                    type="text"
                    value={formData.seller.signingCity}
                    onChange={(e) => updateSellerField('signingCity', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-seller-fait-le" className={labelClass}>
                    Le (Date signature)
                  </label>
                  <input
                    id="cerfa-seller-fait-le"
                    type="date"
                    value={formData.seller.signingDate}
                    onChange={(e) => updateSellerField('signingDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Mandatory administrative checkboxes */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs text-slate-300">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.seller.certifyAdminSituation}
                    onChange={(e) => updateSellerField('certifyAdminSituation', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>
                    Avoir remis au nouveau propriétaire un certificat de situation administrative de moins de 15 jours
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.seller.certifyNoTransformation}
                    onChange={(e) => updateSellerField('certifyNoTransformation', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>
                    Que ce véhicule n'a pas subi de transformation notable susceptible de modifier ses indications
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-800/80">
                  <input
                    type="checkbox"
                    checked={formData.seller.opposeProspecting}
                    onChange={(e) => updateSellerField('opposeProspecting', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>
                    Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: BUYER */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateBuyerField('entityType', 'physique')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                    formData.buyer.entityType === 'physique'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Personne physique
                </button>
                <button
                  type="button"
                  onClick={() => updateBuyerField('entityType', 'morale')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                    formData.buyer.entityType === 'morale'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Personne morale (Société)
                </button>

                {formData.buyer.entityType === 'physique' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-400">Sexe :</span>
                    {(['M', 'F'] as const).map((sx) => (
                      <button
                        key={sx}
                        type="button"
                        onClick={() => updateBuyerField('sex', sx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          formData.buyer.sex === sx
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        {sx}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-buyer-name" className={labelClass}>
                    {formData.buyer.entityType === 'morale'
                      ? 'Raison sociale *'
                      : 'NOM et PRÉNOM *'}
                  </label>
                  <input
                    id="cerfa-buyer-name"
                    type="text"
                    value={formData.buyer.nameOrCompany}
                    onChange={(e) => updateBuyerField('nameOrCompany', e.target.value)}
                    className={inputClass}
                  />
                </div>
                {formData.buyer.entityType === 'morale' ? (
                  <div>
                    <label htmlFor="cerfa-buyer-siret" className={labelClass}>
                      N° SIRET
                    </label>
                    <input
                      id="cerfa-buyer-siret"
                      type="text"
                      value={formData.buyer.siret}
                      onChange={(e) => updateBuyerField('siret', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cerfa-buyer-birth-date" className={labelClass}>
                        Né(e) le *
                      </label>
                      <input
                        id="cerfa-buyer-birth-date"
                        type="date"
                        value={formData.buyer.birthDate}
                        onChange={(e) => updateBuyerField('birthDate', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="cerfa-buyer-birth-place" className={labelClass}>
                        À (Lieu de naissance)
                      </label>
                      <input
                        id="cerfa-buyer-birth-place"
                        type="text"
                        value={formData.buyer.birthPlace}
                        onChange={(e) => updateBuyerField('birthPlace', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="cerfa-buyer-num" className={labelClass}>
                    N° de voie
                  </label>
                  <input
                    id="cerfa-buyer-num"
                    type="text"
                    value={formData.buyer.streetNumber}
                    onChange={(e) => updateBuyerField('streetNumber', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-ext" className={labelClass}>
                    Extension
                  </label>
                  <input
                    id="cerfa-buyer-ext"
                    type="text"
                    value={formData.buyer.streetExtension}
                    onChange={(e) => updateBuyerField('streetExtension', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-type" className={labelClass}>
                    Type de voie
                  </label>
                  <input
                    id="cerfa-buyer-type"
                    type="text"
                    placeholder="Rue, Square..."
                    value={formData.buyer.streetType}
                    onChange={(e) => updateBuyerField('streetType', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-street" className={labelClass}>
                    Nom de la voie
                  </label>
                  <input
                    id="cerfa-buyer-street"
                    type="text"
                    value={formData.buyer.streetName}
                    onChange={(e) => updateBuyerField('streetName', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-buyer-zip" className={labelClass}>
                    Code postal *
                  </label>
                  <input
                    id="cerfa-buyer-zip"
                    type="text"
                    value={formData.buyer.postalCode}
                    onChange={(e) => updateBuyerField('postalCode', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-city" className={labelClass}>
                    Commune *
                  </label>
                  <input
                    id="cerfa-buyer-city"
                    type="text"
                    value={formData.buyer.city}
                    onChange={(e) => updateBuyerField('city', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cerfa-buyer-fait-a" className={labelClass}>
                    Fait à (Commune)
                  </label>
                  <input
                    id="cerfa-buyer-fait-a"
                    type="text"
                    value={formData.buyer.signingCity}
                    onChange={(e) => updateBuyerField('signingCity', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cerfa-buyer-fait-le" className={labelClass}>
                    Le (Date)
                  </label>
                  <input
                    id="cerfa-buyer-fait-le"
                    type="date"
                    value={formData.buyer.signingDate}
                    onChange={(e) => updateBuyerField('signingDate', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs text-slate-300">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.buyer.certifyAcquire}
                    onChange={(e) => updateBuyerField('certifyAcquire', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>
                    Acquérir le véhicule désigné ci-dessus aux dates et heures indiquées par l'ancien propriétaire
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.buyer.certifyInformedAdmin}
                    onChange={(e) => updateBuyerField('certifyInformedAdmin', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>Avoir été informé de la situation administrative du véhicule</span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-800/80">
                  <input
                    type="checkbox"
                    checked={formData.buyer.opposeProspecting}
                    onChange={(e) => updateBuyerField('opposeProspecting', e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                  />
                  <span>
                    Je m'oppose à la réutilisation de mes données personnelles à des fins de prospection commerciale
                  </span>
                </label>
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Précédent</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
              >
                <span>Suivant</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePDF('print')}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white transition flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer</span>
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePDF('download')}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition flex items-center gap-2 shadow-lg"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Télécharger le formulaire n° 15776*02 [PDF]</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
