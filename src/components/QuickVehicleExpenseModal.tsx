import React, { useEffect, useMemo, useState } from 'react';
import { Car, Loader2, Plus, Receipt, Trash2, Wrench, X } from 'lucide-react';
import { GeneralExpense, RepairTask, Vehicle } from '../types/garage';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';
import { formatEuro } from '../utils/finance';
import { ThemedSelect } from './ThemedSelect';
import {
  mergeVehicleCostRows,
  QUICK_EXPENSE_CATEGORIES,
  QUICK_EXPENSE_PRESETS,
  QuickExpensePreset,
  UnifiedVehicleCostRow,
  validateQuickExpenseInput,
} from '../utils/quickListUtils';

interface QuickVehicleExpenseModalProps {
  isOpen: boolean;
  vehicle: Vehicle | null;
  expenses: GeneralExpense[];
  repairs: RepairTask[];
  totalExpenses: number;
  totalInvested: number;
  onClose: () => void;
  onAddExpense: (
    vehicleId: string,
    payload: { category: string; description: string; amount: number; date: string }
  ) => Promise<void>;
  onDeleteExpense: (vehicleId: string, expenseId: string) => Promise<void>;
  onDeleteRepair?: (vehicleId: string, repairId: string) => Promise<void>;
}

export const QuickVehicleExpenseModal: React.FC<QuickVehicleExpenseModalProps> = ({
  isOpen,
  vehicle,
  expenses,
  repairs,
  totalExpenses,
  totalInvested,
  onClose,
  onAddExpense,
  onDeleteExpense,
  onDeleteRepair,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('controle_technique');
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActivePresetId(null);
    setCategory('controle_technique');
    setDescription('');
    setAmount('');
    setErrorMsg(null);
    setIsSubmitting(false);
    setDeletingId(null);
  }, [isOpen, vehicle?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const costRows = useMemo(() => {
    if (!vehicle) return [];
    return mergeVehicleCostRows(vehicle.id, expenses, repairs);
  }, [vehicle, expenses, repairs]);

  if (!isOpen || !vehicle) return null;

  const categoryOptions = QUICK_EXPENSE_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.label[lang] || c.label.fr,
  }));

  const getCategoryDisplay = (row: UnifiedVehicleCostRow): string => {
    if (row.source === 'repair') {
      return L('Atelier', 'Ремонт / Сервис', 'Արհեստանոց', 'სერვისი');
    }
    const found = QUICK_EXPENSE_CATEGORIES.find((c) => c.value === row.category);
    return found ? found.label[lang] || found.label.fr : row.category;
  };

  const handlePresetClick = (preset: QuickExpensePreset) => {
    setActivePresetId(preset.id);
    setCategory(preset.category);
    setDescription(preset.description[lang] || preset.description.fr);
    if (!amount.trim() && preset.defaultAmount) {
      setAmount(String(preset.defaultAmount));
    }
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = validateQuickExpenseInput({
      category,
      description,
      rawAmount: amount,
      lang,
    });

    if (!validation.valid || !validation.normalized) {
      setErrorMsg(validation.error || L('Erreur de saisie', 'Ошибка ввода', 'Սխալ մուտք', 'შეყვანის შეცდომა'));
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onAddExpense(vehicle.id, validation.normalized);
      setActivePresetId(null);
      setDescription('');
      setAmount('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRow = async (row: UnifiedVehicleCostRow) => {
    if (deletingId) return;
    setDeletingId(row.id);
    try {
      if (row.source === 'expense') {
        await onDeleteExpense(vehicle.id, row.id);
      } else if (onDeleteRepair) {
        await onDeleteRepair(vehicle.id, row.id);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      data-testid="quick-expense-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        data-testid="quick-expense-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[var(--border)] bg-[var(--ag-table-header-bg)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-[var(--foreground)] truncate">
                  {vehicle.make} {vehicle.model}
                </h2>
                {vehicle.registrationNumber && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--surface-muted)] border border-[var(--border)] font-mono text-[10px] font-bold text-[var(--foreground)]">
                    {vehicle.registrationNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] font-mono tabular-nums mt-0.5">
                {L('Dépenses :', 'Расходы:', 'Ծախսեր՝', 'ხარჯები:')}{' '}
                <span
                  data-testid="quick-expense-modal-total"
                  className="font-bold text-[var(--foreground)]"
                >
                  {formatEuro(totalExpenses)}
                </span>{' '}
                · {L('Total investi :', 'Вложено:', 'Ընդամենը՝', 'სულ:')}{' '}
                <span
                  data-testid="quick-expense-modal-invested"
                  className="font-bold text-[var(--primary)]"
                >
                  {formatEuro(totalInvested)}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="quick-expense-close-btn"
            onClick={onClose}
            aria-label={L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] block">
              {L('Modèles rapides', 'Быстрые шаблоны', 'Արագ ձևանմուշներ', 'სწრაფი შაბლონები')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EXPENSE_PRESETS.map((preset) => {
                const active = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`quick-expense-preset-${preset.id}`}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      active
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm'
                        : 'bg-[var(--surface-muted)]/70 hover:bg-[var(--surface-muted)] text-[var(--foreground)] border-[var(--border)]'
                    }`}
                  >
                    {preset.chipLabel[lang] || preset.chipLabel.fr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add Expense Form */}
          <form onSubmit={handleSubmit} className="space-y-3 bg-[var(--background)]/70 border border-[var(--border)] rounded-xl p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                  {L('Catégorie', 'Категория', 'Կատեգորիա', 'კატეგორია')}
                </label>
                <ThemedSelect
                  testId="quick-expense-category-select"
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  triggerClassName="w-full h-9 px-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-semibold text-[var(--foreground)]"
                />
              </div>

              <div>
                <label
                  htmlFor="quick-expense-amount"
                  className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1"
                >
                  {L('Montant (€)', 'Сумма (€)', 'Գումար (€)', 'თანხა (€)')}
                </label>
                <input
                  id="quick-expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  data-testid="quick-expense-amount-input"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="85"
                  className="w-full h-9 px-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-expense-description"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1"
              >
                {L('Description', 'Описание', 'Նկարագրություն', 'აღწერა')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="quick-expense-description"
                  type="text"
                  data-testid="quick-expense-description-input"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={L(
                    'Ex: Contrôle Technique, Pneus...',
                    'Например: Техосмотр CT, шины...',
                    'Օրինակ՝ Տեխզննում, անվադողեր...',
                    'მაგ: ტექდათვალიერება, საბურავები...'
                  )}
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition"
                />
                <button
                  type="submit"
                  data-testid="quick-expense-submit-btn"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 transition shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{L('Ajouter', 'Добавить', 'Ավելացնել', 'დამატება')}</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <p
                data-testid="quick-expense-error"
                className="text-[11px] font-semibold text-rose-400"
              >
                {errorMsg}
              </p>
            )}
          </form>

          {/* Existing Vehicle Expenses List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                {L(
                  'Dépenses enregistrées',
                  'Записанные расходы',
                  'Գրանցված ծախսեր',
                  'ჩაწერილი ხარჯები'
                )}{' '}
                ({costRows.length})
              </span>
            </div>

            {costRows.length === 0 ? (
              <div
                data-testid="quick-expense-empty"
                className="border border-dashed border-[var(--border)] rounded-xl py-5 px-3 text-center space-y-1"
              >
                <Car className="w-5 h-5 text-[var(--muted-foreground)] mx-auto opacity-60" />
                <p className="text-xs text-[var(--muted-foreground)]">
                  {L(
                    'Aucune dépense enregistrée pour ce véhicule.',
                    'По этому автомобилю пока нет расходов.',
                    'Այս մեքենայի համար դեռ ծախսեր չկան։',
                    'ამ ავტომობილზე ხარჯები ჯერ არ არის.'
                  )}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]/70 border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--background)]/40 max-h-56 overflow-y-auto">
                {costRows.map((row) => {
                  const canDelete = row.source === 'expense' || Boolean(onDeleteRepair);
                  return (
                    <div
                      key={`${row.source}-${row.id}`}
                      data-testid={`quick-expense-row-${row.id}`}
                      className="px-3 py-2 flex items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                            row.source === 'repair'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-[var(--surface-muted)] text-[var(--primary)]'
                          }`}
                        >
                          {row.source === 'repair' ? (
                            <Wrench className="w-3 h-3" />
                          ) : (
                            <Receipt className="w-3 h-3" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--foreground)] truncate">
                            {row.title}
                          </p>
                          <p className="text-[10px] text-[var(--muted-foreground)] truncate">
                            {getCategoryDisplay(row)}
                            {row.date ? ` · ${row.date}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-[var(--foreground)] tabular-nums">
                          {formatEuro(row.amount)}
                        </span>
                        {canDelete && (
                          <button
                            type="button"
                            data-testid={`quick-expense-delete-${row.id}`}
                            disabled={deletingId === row.id}
                            onClick={() => handleDeleteRow(row)}
                            aria-label={L('Supprimer', 'Удалить', 'Ջնջել', 'წაშლა')}
                            title={L('Supprimer', 'Удалить', 'Ջնջել', 'წაშლა')}
                            className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === row.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
