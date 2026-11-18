import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BillingCycle,
  SubscriptionPlan,
  SubscriptionPlanId,
  UserProfile,
} from '../types/garage';
import {
  computePlanPricing,
  DEFAULT_SUBSCRIPTION_PLANS,
  getPlanCapabilities,
  getPlanRank,
  normalizeSubscriptionPlans,
} from '../utils/adminUtils';
import { changeUserSubscriptionPlan } from '../services/adminService';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface SubscriptionPlanTabProps {
  userId: string;
  userProfile: UserProfile | null;
  plans?: SubscriptionPlan[];
  activeVehiclesCount: number;
  onPlanUpdated?: (updatedProfile: UserProfile) => void;
  onNotify?: (type: 'success' | 'error', text: string) => void;
}

export const SubscriptionPlanTab: React.FC<SubscriptionPlanTabProps> = ({
  userId,
  userProfile,
  plans: incomingPlans,
  activeVehiclesCount,
  onPlanUpdated,
  onNotify,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const plans = useMemo(
    () =>
      normalizeSubscriptionPlans(
        incomingPlans && incomingPlans.length > 0 ? incomingPlans : DEFAULT_SUBSCRIPTION_PLANS
      ),
    [incomingPlans]
  );

  const currentPlanId: SubscriptionPlanId = userProfile?.planId || 'starter';
  const currentBillingCycle: BillingCycle = userProfile?.billingCycle === 'annual' ? 'annual' : 'monthly';
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(currentBillingCycle);
  const [pendingTargetPlan, setPendingTargetPlan] = useState<SubscriptionPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === currentPlanId) || plans[0],
    [plans, currentPlanId]
  );
  const currentCapabilities = useMemo(
    () => getPlanCapabilities(currentPlanId, plans),
    [currentPlanId, plans]
  );

  const getPlanFeatures = (plan: SubscriptionPlan): string[] => {
    if (lang === 'ru') return plan.featuresRu;
    if (lang === 'hy') return plan.featuresHy?.length ? plan.featuresHy : plan.featuresRu;
    if (lang === 'ka') return plan.featuresKa?.length ? plan.featuresKa : plan.featuresRu;
    return plan.featuresFr;
  };

  const getPlanTagline = (plan: SubscriptionPlan): string => {
    if (lang === 'ru') return plan.taglineRu || '';
    if (lang === 'hy') return plan.taglineHy || plan.taglineRu || '';
    if (lang === 'ka') return plan.taglineKa || plan.taglineRu || '';
    return plan.taglineFr || '';
  };

  const handleConfirmSwitch = async () => {
    if (!pendingTargetPlan || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updatedProfile = await changeUserSubscriptionPlan({
        uid: userId,
        planId: pendingTargetPlan.id,
        billingCycle,
        plans,
        currentProfile: userProfile,
      });
      onPlanUpdated?.(updatedProfile);
      const successText = L(
        `Votre forfait a été changé pour ${pendingTargetPlan.name}`,
        `Тариф успешно изменён на ${pendingTargetPlan.name}`,
        `Սակագինը հաջողությամբ փոխվեց՝ ${pendingTargetPlan.name}`,
        `ტარიფი წარმატებით შეიცვალა: ${pendingTargetPlan.name}`
      );
      onNotify?.('success', successText);
      setPendingTargetPlan(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : L(
              'Impossible de mettre à jour votre abonnement.',
              'Не удалось изменить тариф подписки.',
              'Հնարավոր չեղավ փոխել սակագինը։',
              'ტარიფის შეცვლა ვერ მოხერხდა.'
            );
      onNotify?.('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentRank = getPlanRank(currentPlanId);
  const statusText =
    userProfile?.subscriptionStatus === 'past_due'
      ? L('Paiement en attente', 'Ожидает оплаты', 'Սպասվում է վճարման', 'გადახდის მოლოდინში')
      : userProfile?.subscriptionStatus === 'trial'
      ? L('Période d’essai', 'Пробный период', 'Փորձնական շրջան', 'საცდელი პერიოდი')
      : L('Actif', 'Активна', 'Ակտիվ է', 'აქტიურია');

  const renewalLabel = userProfile?.nextRenewalDate
    ? L(
        `Prochain renouvellement : ${userProfile.nextRenewalDate}`,
        `Продление: ${userProfile.nextRenewalDate}`,
        `Երկարաձգում՝ ${userProfile.nextRenewalDate}`,
        `განახლება: ${userProfile.nextRenewalDate}`
      )
    : currentPlan.priceMonthly === 0
    ? L(
        'Offre gratuite sans engagement',
        'Бесплатный тариф без срока',
        'Անվճար անժամկետ սակագին',
        'უფასო უვადო ტარიფი'
      )
    : currentBillingCycle === 'annual'
    ? L('Facturation annuelle (-20%)', 'Годовая оплата (-20%)', 'Տարեկան վճարում (-20%)', 'წლიური გადახდა (-20%)')
    : L('Facturation mensuelle', 'Ежемесячная оплата', 'Ամսական վճարում', 'ყოველთვიური გადახდა');

  return (
    <div data-testid="subscription-plan-tab" className="space-y-6">
      {/* Compact Header Summary & Billing Cycle Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[var(--border)]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
              <Crown className="w-4 h-4" />
              <span>
                {L(
                  'Forfait et abonnement',
                  'Тариф и подписка',
                  'Սակագին և բաժանորդագրություն',
                  'ტარიფი და გამოწერა'
                )}
              </span>
            </span>
            <span
              data-testid="subscription-active-plan-badge"
              className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]"
            >
              {currentPlan.name}
            </span>
          </div>

          <h3 className="text-lg font-extrabold text-[var(--foreground)]">
            {L(
              'Gérez votre formule AutoGarage Manager',
              'Управление подпиской AutoGarage Manager',
              'Կառավարեք Ձեր AutoGarage Manager սակագինը',
              'მართეთ AutoGarage Manager-ის გამოწერა'
            )}
          </h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)] tabular-nums">
            <span>
              {L('Statut :', 'Статус:', 'Կարգավիճակ՝', 'სტატუსი:')}{' '}
              <strong className="text-[var(--foreground)]">{statusText}</strong>
            </span>
            <span>{renewalLabel}</span>
            <span>
              {L('Véhicules :', 'Авто в парке:', 'Ավտոպարկ՝', 'ავტოპარკი:')}{' '}
              <strong className="text-[var(--foreground)]">
                {activeVehiclesCount} /{' '}
                {currentCapabilities.isUnlimitedVehicles
                  ? L('Illimité', 'Безлимит', 'Անսահմանափակ', 'ულიმიტო')
                  : currentCapabilities.vehicleLimit}
              </strong>
            </span>
          </div>
        </div>

        {/* Billing Cycle Toggle */}
        <div
          role="group"
          aria-label={L('Cycle de facturation', 'Период оплаты', 'Վճարման պարբերականություն', 'გადახდის ციკლი')}
          data-testid="subscription-billing-toggle"
          className="inline-flex items-center p-1 rounded-[var(--ag-button-radius)] bg-[var(--surface-muted)] border border-[var(--border)] self-start lg:self-center shrink-0"
        >
          <button
            type="button"
            data-testid="billing-cycle-monthly"
            onClick={() => setBillingCycle('monthly')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {L('Mensuel', 'Ежемесячно', 'Ամսական', 'ყოველთვიურად')}
          </button>
          <button
            type="button"
            data-testid="billing-cycle-annual"
            onClick={() => setBillingCycle('annual')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              billingCycle === 'annual'
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <span>
              {L('Annuel (-20%)', 'Ежегодно — скидка 20%', 'Տարեկան (-20%)', 'წლიურად — ფასდაკლება 20%')}
            </span>
          </button>
        </div>
      </div>

      {/* 3-Tier Plan Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {plans.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const isExactActiveSubscription =
            isCurrentPlan && (plan.priceMonthly === 0 || billingCycle === currentBillingCycle);
          const targetRank = getPlanRank(plan.id);
          const isDowngrade = targetRank < currentRank;
          const pricing = computePlanPricing(plan.priceMonthly, billingCycle);
          const features = getPlanFeatures(plan);
          const tagline = getPlanTagline(plan);
          const planCaps = getPlanCapabilities(plan.id, plans);
          const isHighlighted = Boolean(plan.isPopular);

          return (
            <div
              key={plan.id}
              data-testid={`plan-card-${plan.id}`}
              className={`relative flex flex-col justify-between rounded-[var(--ag-card-radius)] bg-[var(--card)] p-5 transition ${
                isHighlighted
                  ? 'border-2 border-[var(--primary)] shadow-md'
                  : 'border border-[var(--border)]'
              }`}
            >
              <div className="space-y-4">
                {/* Plan Title & Highlight Tag */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-extrabold text-[var(--foreground)]">
                      {plan.name}
                    </h4>
                    {tagline && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-snug">
                        {tagline}
                      </p>
                    )}
                  </div>

                  {isHighlighted && (
                    <span
                      data-testid={`plan-popular-badge-${plan.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{L('Populaire', 'Популярный', 'Հայտնի', 'პოპულარული')}</span>
                    </span>
                  )}
                </div>

                {/* Price Block */}
                <div className="pt-1 pb-2 border-b border-[var(--border)]">
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
                      {pricing.effectiveMonthly} €
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)] font-medium">
                      / {L('mois', 'мес', 'ամիս', 'თვე')}
                    </span>
                    {billingCycle === 'annual' && plan.priceMonthly > 0 && (
                      <span className="text-xs text-[var(--muted-foreground)] line-through">
                        {plan.priceMonthly} €
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-1 tabular-nums min-h-[16px]">
                    {plan.priceMonthly === 0
                      ? L('Gratuit pour toujours', 'Бесплатно навсегда', 'Անվճար ընդմիշտ', 'უფასო სამუდამოდ')
                      : billingCycle === 'annual'
                      ? L(
                          `Facturé ${pricing.billedAmount} €/an (économie ${pricing.annualSavings} €)`,
                          `Оплата ${pricing.billedAmount} €/год (выгода ${pricing.annualSavings} €)`,
                          `Վճարումը՝ ${pricing.billedAmount} €/տարի (խնայում՝ ${pricing.annualSavings} €)`,
                          `გადახდა ${pricing.billedAmount} €/წელი (დაზოგვა ${pricing.annualSavings} €)`
                        )
                      : L(
                          'Sans engagement · résiliable à tout moment',
                          'Без обязательств · отмена в любой момент',
                          'Առանց պարտավորության · չեղարկում ցանկացած պահի',
                          'ვალდებულების გარეშე · გაუქმება ნებისმიერ დროს'
                        )}
                  </p>
                  <p
                    data-testid={`plan-limit-badge-${plan.id}`}
                    className="text-[11px] font-semibold text-[var(--primary)] mt-1.5 tabular-nums"
                  >
                    {planCaps.isUnlimitedVehicles
                      ? L(
                          'Stock : véhicules illimités',
                          'Склад: безлимит авто',
                          'Ավտոպարկ՝ անսահմանափակ',
                          'ავტოპარკი: ულიმიტო'
                        )
                      : L(
                          `Stock : jusqu’à ${planCaps.vehicleLimit} véhicules`,
                          `Склад: до ${planCaps.vehicleLimit} авто`,
                          `Ավտոպարկ՝ մինչև ${planCaps.vehicleLimit} մեքենա`,
                          `ავტოპარკი: ${planCaps.vehicleLimit} ავტომდე`
                        )}
                  </p>
                </div>

                {/* Feature List */}
                <ul className="space-y-2.5 text-xs text-[var(--foreground)]">
                  {features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                      <Check className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Slot */}
              <div className="pt-5 mt-5 border-t border-[var(--border)]">
                {isExactActiveSubscription ? (
                  <button
                    type="button"
                    disabled
                    data-testid={`plan-action-${plan.id}`}
                    className="w-full h-9 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--muted-foreground)] border border-[var(--border)] cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {L(
                        'Votre forfait actuel',
                        'Ваш текущий тариф',
                        'Ձեր ընթացիկ սակագինը',
                        'თქვენი მიმდინარე ტარიფი'
                      )}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`plan-action-${plan.id}`}
                    onClick={() => setPendingTargetPlan(plan)}
                    className={`w-full h-9 px-3.5 rounded-[var(--ag-button-radius)] text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isDowngrade
                        ? 'bg-[var(--surface-muted)] hover:opacity-90 text-[var(--foreground)] border border-[var(--border)]'
                        : 'bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] shadow-sm'
                    }`}
                  >
                    <span>
                      {isCurrentPlan
                        ? L(
                            billingCycle === 'annual' ? 'Passer à la facturation annuelle' : 'Passer à la facturation mensuelle',
                            billingCycle === 'annual' ? 'Перейти на годовую оплату' : 'Перейти на помесячную оплату',
                            billingCycle === 'annual' ? 'Անցնել տարեկան վճարման' : 'Անցնել ամսական վճարման',
                            billingCycle === 'annual' ? 'წლიურ გადახდაზე გადასვლა' : 'ყოველთვიურ გადახდაზე გადასვლა'
                          )
                        : isDowngrade
                        ? L('Rétrograder', 'Понизить тариф', 'Իջեցնել սակագինը', 'ტარიფის შემცირება')
                        : L(
                            'Passer à ce forfait',
                            'Перейти на этот тариф',
                            'Անցնել այս սակագնին',
                            'ამ ტარიფზე გადასვლა'
                          )}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {pendingTargetPlan && (() => {
        const modalPricing = computePlanPricing(pendingTargetPlan.priceMonthly, billingCycle);
        const modalFeatures = getPlanFeatures(pendingTargetPlan);
        const isDowngrade = getPlanRank(pendingTargetPlan.id) < currentRank;

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-confirm-modal-title"
            data-testid="plan-confirm-modal"
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-[var(--ag-card-radius)] bg-[var(--ag-modal-bg)] border border-[var(--border)] shadow-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 text-[var(--primary)] flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4
                      id="plan-confirm-modal-title"
                      className="text-base font-extrabold text-[var(--foreground)]"
                    >
                      {isDowngrade
                        ? L(
                            `Confirmer le passage à ${pendingTargetPlan.name}`,
                            `Подтвердите переход на ${pendingTargetPlan.name}`,
                            `Հաստատեք անցումը ${pendingTargetPlan.name} սակագնին`,
                            `დაადასტურეთ გადასვლა ტარიფზე ${pendingTargetPlan.name}`
                          )
                        : L(
                            `Activer le forfait ${pendingTargetPlan.name}`,
                            `Активация тарифа ${pendingTargetPlan.name}`,
                            `Ակտիվացնել ${pendingTargetPlan.name} սակագինը`,
                            `გაააქტიურეთ ტარიფი ${pendingTargetPlan.name}`
                          )}
                    </h4>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {billingCycle === 'annual'
                        ? L('Facturation annuelle (-20%)', 'Ежегодная оплата (-20%)', 'Տարեկան վճարում (-20%)', 'წლიური გადახდა (-20%)')
                        : L('Facturation mensuelle', 'Ежемесячная оплата', 'Ամսական վճարում', 'ყოველთვიური გადახდა')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSubmitting && setPendingTargetPlan(null)}
                  aria-label={L('Fermer', 'Закрыть', 'Փակել', 'დახურვა')}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Price Summary Strip */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-between gap-3 tabular-nums">
                <div>
                  <span className="block text-[11px] font-semibold text-[var(--muted-foreground)]">
                    {L('Nouveau tarif', 'Выбранный тариф', 'Ընտրված սակագին', 'არჩეული ტარიფი')}
                  </span>
                  <span className="text-sm font-extrabold text-[var(--foreground)]">
                    {pendingTargetPlan.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-extrabold text-[var(--primary)]">
                    {modalPricing.effectiveMonthly} € / {L('mois', 'мес', 'ամիս', 'თვე')}
                  </span>
                  {billingCycle === 'annual' && pendingTargetPlan.priceMonthly > 0 && (
                    <span className="block text-[11px] text-[var(--muted-foreground)]">
                      {modalPricing.billedAmount} € / {L('an', 'год', 'տարի', 'წელი')}
                    </span>
                  )}
                </div>
              </div>

              {/* Unlocked Features Summary */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--primary)]" />
                  <span>
                    {L(
                      'Fonctionnalités incluses :',
                      'Что входит в тариф:',
                      'Սակագնում ներառված հնարավորությունները՝',
                      'ტარიფში შემავალი ფუნქციები:'
                    )}
                  </span>
                </p>
                <ul className="space-y-1.5 text-xs text-[var(--muted-foreground)]">
                  {modalFeatures.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setPendingTargetPlan(null)}
                  className="h-9 px-4 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:opacity-90 transition cursor-pointer"
                >
                  {L('Annuler', 'Отмена', 'Չեղարկել', 'გაუქმება')}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  data-testid="plan-confirm-submit-btn"
                  onClick={handleConfirmSwitch}
                  className="h-9 px-4 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {L(
                      'Confirmer le changement',
                      'Подтвердить переход',
                      'Հաստատել անցումը',
                      'ცვლილების დადასტურება'
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
