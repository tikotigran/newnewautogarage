import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, X, Loader2 } from 'lucide-react';
import { Vehicle, VehicleStatus } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface CancelSaleConfirmModalProps {
  isOpen: boolean;
  vehicle: Vehicle | null;
  targetStatus?: VehicleStatus;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const CancelSaleConfirmModal: React.FC<CancelSaleConfirmModalProps> = ({
  isOpen,
  vehicle,
  targetStatus = 'for_sale',
  onConfirm,
  onClose,
}) => {
  const { t, lang } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !vehicle) return null;

  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const targetStatusLabel =
    targetStatus === 'preparation'
      ? t('statusPreparation')
      : targetStatus === 'repair'
      ? t('statusRepair')
      : t('statusForSale');

  const handleConfirm = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-sale-modal-title"
      data-testid="cancel-sale-confirm-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-[var(--card)] border border-red-500/35 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2
              id="cancel-sale-modal-title"
              className="text-base font-bold text-[var(--foreground)] truncate"
            >
              {L(
                'Annuler la vente',
                'Отменить продажу',
                'Չեղարկել վաճառքը',
                'გაყიდვის გაუქმება'
              )}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('closeBtn')}
            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-xs space-y-1">
            <div className="font-bold text-[var(--foreground)]">
              {vehicle.make} {vehicle.model} ({vehicle.year})
            </div>
            <div className="text-[var(--muted-foreground)] font-mono flex flex-wrap gap-2">
              {vehicle.registrationNumber && <span>{vehicle.registrationNumber}</span>}
              {vehicle.buyerInfo?.fullName && (
                <span>· {vehicle.buyerInfo.fullName}</span>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[var(--secondary-foreground)] leading-relaxed">
            {targetStatus === 'for_sale'
              ? L(
                  'Êtes-vous sûr de vouloir annuler la vente ? Les données de l’acheteur et de la transaction seront supprimées et le véhicule repassera au statut « En vente ».',
                  'Вы уверены, что хотите отменить продажу? Данные покупателя и сделки будут удалены, а автомобиль вернётся в статус «В продаже».',
                  'Վստա՞հ եք, որ ցանկանում եք չեղարկել վաճառքը։ Գնորդի և գործարքի տվյալները կջնջվեն, և մեքենան կվերադառնա «Վաճառքում» կարգավիճակին։',
                  'დარწმუნებული ხართ, რომ გსურთ გაყიდვის გაუქმება? მყიდველისა და გარიგების მონაცემები წაიშლება, ხოლო ავტომობილი დაბრუნდება «იყიდება» სტატუსში.'
                )
              : L(
                  `Êtes-vous sûr de vouloir annuler la vente ? Les données de l’acheteur et de la transaction seront supprimées et le véhicule repassera au statut « ${targetStatusLabel} ».`,
                  `Вы уверены, что хотите отменить продажу? Данные покупателя и сделки будут удалены, а автомобиль вернётся в статус «${targetStatusLabel}».`,
                  `Վստա՞հ եք, որ ցանկանում եք չեղարկել վաճառքը։ Գնորդի և գործարքի տվյալները կջնջվեն, և մեքենան կվերադառնա «${targetStatusLabel}» կարգավիճակին։`,
                  `დარწმუნებული ხართ, რომ გსურთ გაყიდვის გაუქმება? მყიდველისა და გარიგების მონაცემები წაიშლება, ხოლო ავტომობილი დაბრუნდება «${targetStatusLabel}» სტატუსში.`
                )}
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              data-testid="cancel-sale-abort-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] bg-[var(--surface-muted)] border border-[var(--border)] transition"
            >
              {t('cancelBtn')}
            </button>
            <button
              type="button"
              data-testid="cancel-sale-confirm-btn"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm transition inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>
                {L(
                  'Confirmer l’annulation',
                  'Подтвердить отмену',
                  'Հաստատել չեղարկումը',
                  'გაუქმების დადასტურება'
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
