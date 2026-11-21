import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Handshake,
  History,
  MapPin,
  Package,
  Phone,
  Plus,
  Search,
  Sparkles,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  User,
  Wrench,
  X,
  AlertCircle,
  CheckCircle2,
  Award,
  Mail,
} from 'lucide-react';
import {
  GarageSettings,
  Purchase,
  PurchaseCategory,
  PurchaseDocument,
  PurchasePaymentMethod,
  Supplier,
  SupplierType,
  Vehicle,
} from '../types/garage';
import {
  computeChannelProfitability,
  computeSupplierSummaries,
  getPaymentMethodLabel,
  getPurchaseCategoryLabel,
  getSupplierTypeLabel,
  PAYMENT_METHODS,
  PURCHASE_CATEGORIES,
  SUPPLIER_TYPES,
  validatePurchaseInput,
  validateSupplierInput,
} from '../utils/suppliers';
import {
  createPurchase,
  createSupplier,
  deletePurchase,
  deleteSupplier,
  updatePurchase,
  updateSupplier,
} from '../services/supplierService';
import { generateId, getGarageSettings } from '../services/garageService';
import { formatEuro } from '../utils/finance';
import { DEFAULT_GARAGE_ID } from '../utils/garageUtils';
import { pickLocalized } from '../utils/i18nUtils';
import { useI18n } from '../i18n/I18nContext';
import { ThemedSelect } from './ThemedSelect';

interface SuppliersViewProps {
  vehicles: Vehicle[];
  suppliers: Supplier[];
  purchases: Purchase[];
  userId: string;
  activeGarageId: string | null;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onSeedSuppliers: () => Promise<void>;
  requestedTab?: { tab: SuppliersTab; nonce: number } | null;
}

type SuppliersTab = 'purchases' | 'suppliers' | 'channels';

const MAX_ATTACHMENT_BYTES = 400 * 1024; // 400 KB limit for Firestore 1MB document safety

function getSupplierTypeIcon(type: SupplierType) {
  switch (type) {
    case 'private_seller':
      return <User className="w-3.5 h-3.5" />;
    case 'dealership':
      return <Building2 className="w-3.5 h-3.5" />;
    case 'auction':
      return <Award className="w-3.5 h-3.5" />;
    case 'parts_supplier':
      return <Package className="w-3.5 h-3.5" />;
    case 'workshop':
      return <Wrench className="w-3.5 h-3.5" />;
    case 'transport_company':
      return <Truck className="w-3.5 h-3.5" />;
    default:
      return <Store className="w-3.5 h-3.5" />;
  }
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDefaultCategoryForSupplierType(type: SupplierType): PurchaseCategory {
  switch (type) {
    case 'parts_supplier':
      return 'parts';
    case 'workshop':
      return 'repair';
    case 'transport_company':
      return 'transport';
    case 'auction':
    case 'dealership':
    case 'private_seller':
    default:
      return 'vehicle';
  }
}

function formatRussianPurchasesCount(count: number): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return `${count} закупок`;
  if (last === 1) return `${count} закупка`;
  if (last >= 2 && last <= 4) return `${count} закупки`;
  return `${count} закупок`;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  vehicles,
  suppliers,
  purchases,
  userId,
  activeGarageId,
  onSelectVehicle,
  onSeedSuppliers,
  requestedTab,
}) => {
  const { lang, t } = useI18n();

  const [activeTab, setActiveTab] = useState<SuppliersTab>(() => requestedTab?.tab || 'purchases');

  useEffect(() => {
    if (requestedTab?.tab) {
      setActiveTab(requestedTab.tab);
    }
  }, [requestedTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SupplierType>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PurchaseCategory>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PurchasePaymentMethod>('all');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const [garageSettings, setGarageSettings] = useState<GarageSettings>(() => getGarageSettings());
  useEffect(() => {
    const sync = () => setGarageSettings(getGarageSettings());
    sync();
    window.addEventListener('autogarage_settings_updated', sync);
    return () => window.removeEventListener('autogarage_settings_updated', sync);
  }, []);

  // Delete inline confirmation states (no window.confirm)
  const [confirmDeletePurchaseId, setConfirmDeletePurchaseId] = useState<string | null>(null);
  const [confirmDeleteSupplierId, setConfirmDeleteSupplierId] = useState<string | null>(null);

  // Document preview modal state (replaces window.open)
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  // Supplier Modal state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supName, setSupName] = useState('');
  const [supType, setSupType] = useState<SupplierType>('auction');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supCity, setSupCity] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supSiret, setSupSiret] = useState('');
  const [supNotes, setSupNotes] = useState('');
  const [supError, setSupError] = useState<string | null>(null);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // Purchase Modal state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [purSupplierId, setPurSupplierId] = useState('');
  const [purCategory, setPurCategory] = useState<PurchaseCategory>('vehicle');
  const [purVehicleId, setPurVehicleId] = useState('');
  const [purDescription, setPurDescription] = useState('');
  const [purAmount, setPurAmount] = useState('');
  const [purDate, setPurDate] = useState(getTodayDateString());
  const [purPayment, setPurPayment] = useState<PurchasePaymentMethod>('bank_transfer');
  const [purInvoiceNumber, setPurInvoiceNumber] = useState('');
  const [purInvoiceProofName, setPurInvoiceProofName] = useState('');
  const [purInvoiceProofUrl, setPurInvoiceProofUrl] = useState('');
  const [purVehicleDocs, setPurVehicleDocs] = useState<PurchaseDocument[]>([]);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [purNotes, setPurNotes] = useState('');
  const [purError, setPurError] = useState<string | null>(null);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // Pure computed summaries & channel analytics
  const supplierSummaries = useMemo(
    () =>
      computeSupplierSummaries({
        suppliers,
        purchases,
        vehicles,
        taxRegime: garageSettings.taxRegime,
        taxRatePercent: garageSettings.taxRatePercent,
        frenchTaxConfig: garageSettings.frenchTaxConfig,
      }),
    [
      suppliers,
      purchases,
      vehicles,
      garageSettings.taxRegime,
      garageSettings.taxRatePercent,
      garageSettings.frenchTaxConfig,
    ]
  );

  const channelAnalytics = useMemo(
    () =>
      computeChannelProfitability({
        suppliers,
        purchases,
        vehicles,
        taxRegime: garageSettings.taxRegime,
        taxRatePercent: garageSettings.taxRatePercent,
        frenchTaxConfig: garageSettings.frenchTaxConfig,
      }),
    [
      suppliers,
      purchases,
      vehicles,
      garageSettings.taxRegime,
      garageSettings.taxRatePercent,
      garageSettings.frenchTaxConfig,
    ]
  );

  // Auto-select first supplier when viewing suppliers tab if current selection is absent
  useEffect(() => {
    if (supplierSummaries.length === 0) {
      setSelectedSupplierId(null);
      return;
    }
    if (!selectedSupplierId || !supplierSummaries.some((s) => s.supplier.id === selectedSupplierId)) {
      setSelectedSupplierId(supplierSummaries[0].supplier.id);
    }
  }, [supplierSummaries, selectedSupplierId]);

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      const effectiveType = supplierMap.get(p.supplierId)?.type || p.supplierType;
      if (typeFilter !== 'all' && effectiveType !== typeFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (paymentFilter !== 'all' && p.paymentMethod !== paymentFilter) return false;
      if (q) {
        const veh = p.vehicleId ? vehicleMap.get(p.vehicleId) : undefined;
        const haystack = [
          p.supplierName,
          p.description,
          p.invoiceNumber || '',
          p.invoiceProofName || '',
          p.vehicleLabel || '',
          veh ? `${veh.make} ${veh.model} ${veh.registrationNumber || ''} ${veh.vin}` : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [purchases, supplierMap, vehicleMap, typeFilter, categoryFilter, paymentFilter, searchQuery]);

  const filteredSupplierSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supplierSummaries.filter((sum) => {
      if (typeFilter !== 'all' && sum.supplier.type !== typeFilter) return false;
      if (q) {
        const haystack = [
          sum.supplier.name,
          sum.supplier.contactPerson || '',
          sum.supplier.city || '',
          sum.supplier.phone || '',
          sum.supplier.email || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [supplierSummaries, typeFilter, searchQuery]);

  const selectedSupplierSummary = useMemo(
    () => supplierSummaries.find((s) => s.supplier.id === selectedSupplierId) || null,
    [supplierSummaries, selectedSupplierId]
  );

  // Handlers
  const handleSeed = async () => {
    try {
      setIsSeeding(true);
      await onSeedSuppliers();
    } finally {
      setIsSeeding(false);
    }
  };

  const openNewSupplierModal = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupType('auction');
    setSupContact('');
    setSupPhone('');
    setSupEmail('');
    setSupCity('');
    setSupAddress('');
    setSupSiret('');
    setSupNotes('');
    setSupError(null);
    setIsSupplierModalOpen(true);
  };

  const openEditSupplierModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupName(supplier.name);
    setSupType(supplier.type);
    setSupContact(supplier.contactPerson || '');
    setSupPhone(supplier.phone || '');
    setSupEmail(supplier.email || '');
    setSupCity(supplier.city || '');
    setSupAddress(supplier.address || '');
    setSupSiret(supplier.siret || '');
    setSupNotes(supplier.notes || '');
    setSupError(null);
    setIsSupplierModalOpen(true);
  };

  const formatValidationError = (codes: string[]): string => {
    const map: Record<string, string> = {
      name_required: pickLocalized(lang, {
        fr: 'Veuillez saisir le nom du fournisseur.',
        ru: 'Укажите название или имя поставщика.',
        hy: 'Նշեք մատակարարի անունը կամ անվանումը։',
        ka: 'მიუთითეთ მომწოდებლის სახელი.',
      }),
      name_too_long: pickLocalized(lang, {
        fr: 'Nom trop long (max 120 caractères).',
        ru: 'Название поставщика слишком длинное (макс. 120 символов).',
        hy: 'Անվանումը չափազանց երկար է (առավելագույնը 120 նիշ)։',
        ka: 'სახელი ძალიან გრძელია (მაქს. 120 სიმბოლო).',
      }),
      invalid_type: pickLocalized(lang, {
        fr: 'Type de fournisseur invalide.',
        ru: 'Выберите корректный тип поставщика.',
        hy: 'Ընտրեք մատակարարի ճիշտ տիպը։',
        ka: 'აირჩიეთ მომწოდებლის სწორი ტიპი.',
      }),
      invalid_email: pickLocalized(lang, {
        fr: 'Format d’email invalide.',
        ru: 'Неверный формат email.',
        hy: 'Էլ. փոստի սխալ ձևաչափ։',
        ka: 'ელფოსტის არასწორი ფორმატი.',
      }),
      supplier_required: pickLocalized(lang, {
        fr: 'Veuillez sélectionner un fournisseur.',
        ru: 'Выберите поставщика.',
        hy: 'Ընտրեք մատակարարին։',
        ka: 'აირჩიეთ მომწოდებელი.',
      }),
      description_required: pickLocalized(lang, {
        fr: 'Veuillez saisir une description.',
        ru: 'Укажите описание или автомобиль.',
        hy: 'Նշեք նկարագրությունը կամ ավտոմեքենան։',
        ka: 'მიუთითეთ აღწერა ან ავტომობილი.',
      }),
      description_too_long: pickLocalized(lang, {
        fr: 'Description trop longue.',
        ru: 'Описание слишком длинное (макс. 240 символов).',
        hy: 'Նկարագրությունը չափազանց երկար է (առավելագույնը 240 նիշ)։',
        ka: 'აღწერა ძალიან გრძელია (მაქს. 240 სიმბოლო).',
      }),
      invalid_amount: pickLocalized(lang, {
        fr: 'Montant invalide (≥ 0).',
        ru: 'Введите корректную цену покупки (≥ 0).',
        hy: 'Մուտքագրեք գնման ճիշտ գինը (≥ 0)։',
        ka: 'შეიყვანეთ შესყიდვის სწორი ფასი (≥ 0).',
      }),
      date_required: pickLocalized(lang, {
        fr: 'Veuillez saisir la date.',
        ru: 'Укажите дату закупки.',
        hy: 'Նշեք գնման ամսաթիվը։',
        ka: 'მიუთითეთ შესყიდვის თარიღი.',
      }),
      invalid_payment_method: pickLocalized(lang, {
        fr: 'Mode de paiement invalide.',
        ru: 'Выберите способ оплаты.',
        hy: 'Ընտրեք վճարման եղանակը։',
        ka: 'აირჩიეთ გადახდის მეთოდი.',
      }),
      invalid_category: pickLocalized(lang, {
        fr: 'Catégorie invalide.',
        ru: 'Выберите категорию закупки.',
        hy: 'Ընտրեք գնման կատեգորիան։',
        ka: 'აირჩიეთ შესყიდვის კატეგორია.',
      }),
    };
    return codes.map((c) => map[c] || c).join(' ');
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSupplierInput({
      name: supName,
      type: supType,
      contactPerson: supContact,
      phone: supPhone,
      email: supEmail,
      city: supCity,
      address: supAddress,
      siret: supSiret,
      notes: supNotes,
    });
    if (errs.length > 0) {
      setSupError(formatValidationError(errs));
      return;
    }
    try {
      setIsSavingSupplier(true);
      setSupError(null);
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: supName.trim(),
          type: supType,
          contactPerson: supContact.trim() || undefined,
          phone: supPhone.trim() || undefined,
          email: supEmail.trim() || undefined,
          city: supCity.trim() || undefined,
          address: supAddress.trim() || undefined,
          siret: supSiret.trim() || undefined,
          notes: supNotes.trim() || undefined,
        });
      } else {
        const created = await createSupplier({
          userId,
          garageId: activeGarageId || DEFAULT_GARAGE_ID,
          name: supName.trim(),
          type: supType,
          contactPerson: supContact.trim() || undefined,
          phone: supPhone.trim() || undefined,
          email: supEmail.trim() || undefined,
          city: supCity.trim() || undefined,
          address: supAddress.trim() || undefined,
          siret: supSiret.trim() || undefined,
          notes: supNotes.trim() || undefined,
        });
        setSelectedSupplierId(created.id);
        if (isPurchaseModalOpen) {
          setPurSupplierId(created.id);
        }
      }
      setIsSupplierModalOpen(false);
    } catch (err) {
      console.error('Save supplier error:', err);
      setSupError(
        pickLocalized(lang, {
          fr: 'Erreur lors de l’enregistrement.',
          ru: 'Ошибка сохранения поставщика.',
          hy: 'Մատակարարի պահպանման սխալ։',
          ka: 'მომწოდებლის შენახვის შეცდომა.',
        })
      );
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    await deleteSupplier(supplierId);
    setConfirmDeleteSupplierId(null);
    if (selectedSupplierId === supplierId) {
      setSelectedSupplierId(null);
    }
  };

  const openNewPurchaseModal = (presetSupplierId?: string) => {
    setEditingPurchase(null);
    const defaultSupId = presetSupplierId || suppliers[0]?.id || '';
    const defaultSup = suppliers.find((s) => s.id === defaultSupId);
    const defaultCat: PurchaseCategory = defaultSup
      ? getDefaultCategoryForSupplierType(defaultSup.type)
      : 'vehicle';

    setPurSupplierId(defaultSupId);
    setPurCategory(defaultCat);
    setPurVehicleId('');
    setPurDescription('');
    setPurAmount('');
    setPurDate(getTodayDateString());
    setPurPayment('bank_transfer');
    setPurInvoiceNumber('');
    setPurInvoiceProofName('');
    setPurInvoiceProofUrl('');
    setPurVehicleDocs([]);
    setNewDocLabel('');
    setPurNotes('');
    setPurError(null);
    setIsPurchaseModalOpen(true);
  };

  const openEditPurchaseModal = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setPurSupplierId(purchase.supplierId);
    setPurCategory(purchase.category);
    setPurVehicleId(purchase.vehicleId || '');
    setPurDescription(purchase.description);
    setPurAmount(String(purchase.amount));
    setPurDate(purchase.date);
    setPurPayment(purchase.paymentMethod);
    setPurInvoiceNumber(purchase.invoiceNumber || '');
    setPurInvoiceProofName(purchase.invoiceProofName || '');
    setPurInvoiceProofUrl(purchase.invoiceProofUrl || '');
    setPurVehicleDocs(purchase.vehicleDocuments || []);
    setNewDocLabel('');
    setPurNotes(purchase.notes || '');
    setPurError(null);
    setIsPurchaseModalOpen(true);
  };

  const handleInvoiceProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setPurError(t('fileTooLargeAlert'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPurInvoiceProofName(file.name);
        setPurInvoiceProofUrl(reader.result);
        setPurError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVehicleDocFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setPurError(t('fileTooLargeAlert'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPurVehicleDocs((prev) => [
          ...prev,
          {
            id: generateId('pdoc'),
            name: file.name,
            url: reader.result as string,
            date: purDate || getTodayDateString(),
            kind: 'vehicle_doc',
          },
        ]);
        setPurError(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddNamedVehicleDoc = () => {
    const trimmed = newDocLabel.trim();
    if (!trimmed) return;
    setPurVehicleDocs((prev) => [
      ...prev,
      {
        id: generateId('pdoc'),
        name: trimmed,
        url: '',
        date: purDate || getTodayDateString(),
        kind: 'vehicle_doc',
      },
    ]);
    setNewDocLabel('');
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(purAmount);
    const errs = validatePurchaseInput({
      supplierId: purSupplierId,
      category: purCategory,
      description: purDescription,
      amount: Number.isNaN(numericAmount) ? -1 : numericAmount,
      date: purDate,
      paymentMethod: purPayment,
    });
    if (errs.length > 0) {
      setPurError(formatValidationError(errs));
      return;
    }

    const chosenSupplier = suppliers.find((s) => s.id === purSupplierId);
    if (!chosenSupplier) {
      setPurError(formatValidationError(['supplier_required']));
      return;
    }

    const linkedVehicle = purVehicleId ? vehicleMap.get(purVehicleId) : undefined;
    const vehicleLabel = linkedVehicle
      ? `${linkedVehicle.make} ${linkedVehicle.model} (${linkedVehicle.year})`
      : undefined;

    try {
      setIsSavingPurchase(true);
      setPurError(null);
      if (editingPurchase) {
        await updatePurchase(editingPurchase.id, {
          supplierId: chosenSupplier.id,
          supplierName: chosenSupplier.name,
          supplierType: chosenSupplier.type,
          vehicleId: linkedVehicle?.id || undefined,
          vehicleLabel,
          category: purCategory,
          description: purDescription.trim(),
          amount: numericAmount,
          date: purDate,
          paymentMethod: purPayment,
          invoiceNumber: purInvoiceNumber.trim() || undefined,
          invoiceProofName: purInvoiceProofName.trim() || undefined,
          invoiceProofUrl: purInvoiceProofUrl || undefined,
          vehicleDocuments: purVehicleDocs,
          notes: purNotes.trim() || undefined,
        });
      } else {
        await createPurchase({
          userId,
          garageId: activeGarageId || DEFAULT_GARAGE_ID,
          supplierId: chosenSupplier.id,
          supplierName: chosenSupplier.name,
          supplierType: chosenSupplier.type,
          vehicleId: linkedVehicle?.id || undefined,
          vehicleLabel,
          category: purCategory,
          description: purDescription.trim(),
          amount: numericAmount,
          date: purDate,
          paymentMethod: purPayment,
          invoiceNumber: purInvoiceNumber.trim() || undefined,
          invoiceProofName: purInvoiceProofName.trim() || undefined,
          invoiceProofUrl: purInvoiceProofUrl || undefined,
          vehicleDocuments: purVehicleDocs,
          notes: purNotes.trim() || undefined,
        });
      }
      setIsPurchaseModalOpen(false);
    } catch (err) {
      console.error('Save purchase error:', err);
      setPurError(
        pickLocalized(lang, {
          fr: 'Erreur lors de l’enregistrement.',
          ru: 'Ошибка сохранения закупки.',
          hy: 'Գնման պահպանման սխալ։',
          ka: 'შესყიდვის შენახვის შეცდომა.',
        })
      );
    } finally {
      setIsSavingPurchase(false);
    }
  };

  const handleDeletePurchase = async (purchaseId: string) => {
    await deletePurchase(purchaseId);
    setConfirmDeletePurchaseId(null);
  };

  const renderAttachmentBadge = (
    name: string,
    url?: string,
    iconType: 'invoice' | 'doc' = 'doc',
    maxWidthClass = 'max-w-[135px]'
  ) => {
    const hasFile = Boolean(url && (url.startsWith('data:') || url.startsWith('http')));
    const Icon = iconType === 'invoice' ? FileCheck : FileText;
    if (hasFile && url) {
      return (
        <button
          type="button"
          onClick={() => setPreviewDoc({ name, url })}
          className={`inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline text-left ${maxWidthClass} cursor-pointer`}
          title={name}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{name}</span>
          <Eye className="w-3 h-3 shrink-0 opacity-80" />
        </button>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--secondary-foreground)] ${maxWidthClass}`}
        title={name}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--muted-foreground)]" />
        <span className="truncate">{name}</span>
      </span>
    );
  };

  return (
    <div data-testid="suppliers-view" className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/15 border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] shrink-0">
              <Handshake className="w-4 h-4" />
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--foreground)]">
              {t('suppliersTitle')}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {t('suppliersSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          {suppliers.length === 0 && (
            <button
              type="button"
              data-testid="seed-suppliers-btn"
              onClick={handleSeed}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 h-9 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] hover:opacity-90 transition cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSeeding ? t('loading') : t('seedSuppliersBtn')}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="new-supplier-btn"
            onClick={openNewSupplierModal}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--card)] transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>{t('newSupplierBtn')}</span>
          </button>
          <button
            type="button"
            data-testid="new-purchase-btn"
            onClick={() => openNewPurchaseModal()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-95 transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('newPurchaseBtn')}</span>
          </button>
        </div>
      </div>

      {/* Top Channel Sourcing & Profitability Strip */}
      <section
        data-testid="suppliers-channel-overview"
        className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-[var(--foreground)]">
              {t('channelOverviewTitle')}
            </h2>
          </div>
          {channelAnalytics.bestVehicleChannel && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs">
              <Award className="w-3.5 h-3.5 text-[var(--ag-profit-color)] shrink-0" />
              <span className="text-[var(--muted-foreground)]">{t('channelBestBadge')}:</span>
              <span className="font-bold text-[var(--ag-profit-color)]">
                {pickLocalized(lang, {
                  fr: channelAnalytics.bestVehicleChannel.labelFr,
                  ru: channelAnalytics.bestVehicleChannel.labelRu,
                  hy: channelAnalytics.bestVehicleChannel.labelHy,
                  ka: channelAnalytics.bestVehicleChannel.labelKa,
                })}
              </span>
              <span className="font-bold text-[var(--foreground)] tabular-nums">
                ({formatEuro(channelAnalytics.bestVehicleChannel.realizedNetProfit)}
                {channelAnalytics.bestVehicleChannel.roiPercent !== null
                  ? ` · ROI ${channelAnalytics.bestVehicleChannel.roiPercent.toFixed(1)}%`
                  : ''}
                )
              </span>
            </div>
          )}
        </div>

        {/* 6 Channel Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {channelAnalytics.channels.map((ch) => {
            const isBest = channelAnalytics.bestVehicleChannel?.type === ch.type;
            const isActiveFilter = typeFilter === ch.type;
            return (
              <button
                key={ch.type}
                type="button"
                data-testid={`channel-card-${ch.type}`}
                onClick={() => setTypeFilter(isActiveFilter ? 'all' : ch.type)}
                className={`text-left rounded-xl p-3.5 border transition cursor-pointer ${
                  isActiveFilter
                    ? 'bg-[var(--primary)]/10 border-[var(--primary)]'
                    : isBest
                    ? 'bg-[var(--background)] border-emerald-500/40 hover:border-emerald-500/70'
                    : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--primary)]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                    <span className="text-[var(--primary)]">{getSupplierTypeIcon(ch.type)}</span>
                    <span>
                      {pickLocalized(lang, {
                        fr: ch.labelFr,
                        ru: ch.labelRu,
                        hy: ch.labelHy,
                        ka: ch.labelKa,
                      })}
                    </span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] tabular-nums">
                    {ch.suppliersCount}{' '}
                    {pickLocalized(lang, {
                      fr: 'fourn.',
                      ru: 'пост.',
                      hy: 'մատ.',
                      ka: 'მომწ.',
                    })}{' '}
                    · {ch.purchasesCount}{' '}
                    {pickLocalized(lang, {
                      fr: 'ach.',
                      ru: 'сдел.',
                      hy: 'գործ.',
                      ka: 'შესყ.',
                    })}
                  </span>
                </div>

                <div className="mt-2.5 flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      {t('channelTotalSpend')}
                    </div>
                    <div className="text-base font-extrabold text-[var(--foreground)] tabular-nums">
                      {formatEuro(ch.totalSpent)}
                    </div>
                  </div>

                  {ch.isVehicleSource ? (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        {t('channelNetProfit')}
                      </div>
                      <div
                        className={`text-sm font-bold tabular-nums ${
                          ch.soldVehiclesCount === 0
                            ? 'text-[var(--muted-foreground)]'
                            : ch.realizedNetProfit >= 0
                            ? 'text-[var(--ag-profit-color)]'
                            : 'text-[var(--ag-expense-color)]'
                        }`}
                      >
                        {ch.soldVehiclesCount > 0 ? formatEuro(ch.realizedNetProfit) : '—'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        {pickLocalized(lang, {
                          fr: 'Activité',
                          ru: 'Доля операций',
                          hy: 'Ակտիվություն',
                          ka: 'აქტივობა',
                        })}
                      </div>
                      <div className="text-xs font-semibold text-[var(--secondary-foreground)] tabular-nums">
                        {pickLocalized(lang, {
                          fr: `${ch.purchasesCount} ${ch.purchasesCount <= 1 ? 'achat' : 'achats'}`,
                          ru: formatRussianPurchasesCount(ch.purchasesCount),
                          hy: `${ch.purchasesCount} գնում`,
                          ka: `${ch.purchasesCount} შესყიდვა`,
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {ch.isVehicleSource && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] tabular-nums">
                    <span>
                      {t('channelVehiclesSourced')}: <strong className="text-[var(--foreground)]">{ch.linkedVehiclesCount}</strong>
                      {' · '}
                      {t('channelSoldCount')}: <strong className="text-[var(--foreground)]">{ch.soldVehiclesCount}</strong>
                    </span>
                    <span>
                      {ch.roiPercent !== null ? (
                        <strong className="text-[var(--ag-profit-color)]">
                          ROI {ch.roiPercent.toFixed(1)}%
                        </strong>
                      ) : (
                        'ROI —'
                      )}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Workspace Tabs + Filters */}
      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label={t('suppliersTitle')}
          className="flex sm:inline-flex items-center gap-0.5 sm:gap-1 w-full sm:w-fit bg-[var(--card)] border border-[var(--border)] rounded-xl p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'purchases'}
            data-testid="tab-purchases"
            title={t('tabPurchases').replace('{count}', String(purchases.length))}
            onClick={() => setActiveTab('purchases')}
            className={`flex-auto sm:flex-none px-1.5 sm:px-3.5 py-2 rounded-lg text-[11px] sm:text-sm font-bold truncate text-center transition cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t('tabPurchases').replace('{count}', String(purchases.length))}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'suppliers'}
            data-testid="tab-suppliers"
            title={t('tabSuppliers').replace('{count}', String(suppliers.length))}
            onClick={() => setActiveTab('suppliers')}
            className={`flex-auto sm:flex-none px-1.5 sm:px-3.5 py-2 rounded-lg text-[11px] sm:text-sm font-bold truncate text-center transition cursor-pointer ${
              activeTab === 'suppliers'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t('tabSuppliers').replace('{count}', String(suppliers.length))}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'channels'}
            data-testid="tab-channels"
            title={t('tabChannels')}
            onClick={() => setActiveTab('channels')}
            className={`flex-auto sm:flex-none px-1.5 sm:px-3.5 py-2 rounded-lg text-[11px] sm:text-sm font-bold truncate text-center transition cursor-pointer ${
              activeTab === 'channels'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {t('tabChannels')}
          </button>
        </div>

        {/* Search & Filter Controls */}
        {activeTab !== 'channels' && (
          <div
            data-testid="suppliers-filter-bar"
            className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 w-full"
          >
            <div className="relative w-full lg:w-auto lg:flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                data-testid="suppliers-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('purchasesSearchPlaceholder')}
                className="w-full pl-8 pr-3 py-1.5 rounded-[var(--ag-button-radius)] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>

            <div className="shrink-0">
              <ThemedSelect
                testId="filter-supplier-type"
                ariaLabel={t('allSupplierTypes')}
                value={typeFilter}
                onChange={(val) => setTypeFilter(val as 'all' | SupplierType)}
                options={[
                  { value: 'all', label: t('allSupplierTypes') },
                  ...SUPPLIER_TYPES.map((st) => ({
                    value: st.id,
                    label: getSupplierTypeLabel(st.id, lang),
                  })),
                ]}
                triggerClassName="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] whitespace-nowrap"
              />
            </div>

            {activeTab === 'purchases' && (
              <>
                <div className="shrink-0">
                  <ThemedSelect
                    testId="filter-purchase-category"
                    ariaLabel={t('allCategoriesFilter')}
                    value={categoryFilter}
                    onChange={(val) => setCategoryFilter(val as 'all' | PurchaseCategory)}
                    options={[
                      { value: 'all', label: t('allCategoriesFilter') },
                      ...PURCHASE_CATEGORIES.map((c) => ({
                        value: c.id,
                        label: getPurchaseCategoryLabel(c.id, lang),
                      })),
                    ]}
                    triggerClassName="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] whitespace-nowrap"
                  />
                </div>
                <div className="shrink-0">
                  <ThemedSelect
                    testId="filter-payment-method"
                    ariaLabel={t('allPaymentsFilter')}
                    value={paymentFilter}
                    onChange={(val) => setPaymentFilter(val as 'all' | PurchasePaymentMethod)}
                    options={[
                      { value: 'all', label: t('allPaymentsFilter') },
                      ...PAYMENT_METHODS.map((pm) => ({
                        value: pm.id,
                        label: getPaymentMethodLabel(pm.id, lang),
                      })),
                    ]}
                    triggerClassName="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-button-radius)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] whitespace-nowrap"
                  />
                </div>
              </>
            )}

            {(typeFilter !== 'all' ||
              categoryFilter !== 'all' ||
              paymentFilter !== 'all' ||
              searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setCategoryFilter('all');
                  setPaymentFilter('all');
                  setSearchQuery('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] hover:opacity-90 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Filter className="w-3 h-3" />
                <span>
                  {pickLocalized(lang, {
                    fr: 'Réinit.',
                    ru: 'Сброс',
                    hy: 'Զրոյացնել',
                    ka: 'განულება',
                  })}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: PURCHASES LEDGER */}
      {activeTab === 'purchases' && (
        <div
          data-testid="purchases-ledger-section"
          className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden"
        >
          {filteredPurchases.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Package className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-60" />
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {t('noPurchasesFound')}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {suppliers.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeed}
                    disabled={isSeeding}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('seedSuppliersBtn')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openNewPurchaseModal()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('newPurchaseBtn')}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile & Narrow Tablet Card Stack (< 768px) */}
              <div
                data-testid="purchases-mobile-cards"
                className="block md:hidden p-3 space-y-2.5"
              >
                {filteredPurchases.map((p) => {
                  const supplier = supplierMap.get(p.supplierId);
                  const effectiveType = supplier?.type || p.supplierType;
                  const linkedVehicle = p.vehicleId ? vehicleMap.get(p.vehicleId) : undefined;
                  const isConfirmingDelete = confirmDeletePurchaseId === p.id;
                  const metaLine = [
                    p.date,
                    getPaymentMethodLabel(p.paymentMethod, lang),
                    p.invoiceNumber ? `№ ${p.invoiceNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <div
                      key={p.id}
                      data-testid={`purchase-card-${p.id}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3.5 space-y-2"
                    >
                      {/* Top row: Supplier + Category badge | Price + Edit/Delete */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (supplier) {
                                setSelectedSupplierId(supplier.id);
                                setActiveTab('suppliers');
                              }
                            }}
                            className="font-bold text-xs text-[var(--foreground)] hover:text-[var(--primary)] text-left truncate block max-w-full cursor-pointer"
                          >
                            {supplier?.name || p.supplierName}
                          </button>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[10px] font-semibold text-[var(--secondary-foreground)]">
                              <span className="text-[var(--primary)]">
                                {getSupplierTypeIcon(effectiveType)}
                              </span>
                              <span>{getPurchaseCategoryLabel(p.category, lang)}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-sm font-extrabold text-[var(--foreground)] tabular-nums whitespace-nowrap">
                            {formatEuro(p.amount)}
                          </span>
                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeletePurchase(p.id)}
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                              >
                                {pickLocalized(lang, {
                                  fr: 'Suppr.',
                                  ru: 'Удалить',
                                  hy: 'Ջնջել',
                                  ka: 'წაშლა',
                                })}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePurchaseId(null)}
                                className="px-1.5 py-1 rounded-md text-[10px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer"
                              >
                                {t('cancelBtn')}
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => openEditPurchaseModal(p)}
                                aria-label={`${pickLocalized(lang, {
                                  fr: 'Modifier',
                                  ru: 'Изменить',
                                  hy: 'Փոփոխել',
                                  ka: 'შეცვლა',
                                })} ${p.description}`}
                                title={pickLocalized(lang, {
                                  fr: 'Modifier',
                                  ru: 'Изменить',
                                  hy: 'Փոփոխել',
                                  ka: 'შეცვლა',
                                })}
                                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePurchaseId(p.id)}
                                aria-label={`${t('deleteTooltip')} ${p.description}`}
                                title={t('deleteTooltip')}
                                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Description + Linked car badge */}
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-[var(--foreground)] leading-snug">
                          {p.description}
                        </div>
                        {(linkedVehicle || p.vehicleLabel) && (
                          <div>
                            {linkedVehicle ? (
                              <button
                                type="button"
                                onClick={() => onSelectVehicle(linkedVehicle)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--primary)]/10 border border-[var(--primary)]/25 text-[11px] font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                              >
                                <span>
                                  {linkedVehicle.make} {linkedVehicle.model}
                                </span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] text-[var(--secondary-foreground)]">
                                {p.vehicleLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom row: Metadata line + Clickable PDF chip(s) */}
                      <div className="pt-2 border-t border-[var(--border)]/60 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                          {metaLine}
                        </span>
                        {(p.invoiceProofName ||
                          (p.vehicleDocuments && p.vehicleDocuments.length > 0)) && (
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            {p.invoiceProofName &&
                              renderAttachmentBadge(
                                p.invoiceProofName,
                                p.invoiceProofUrl,
                                'invoice',
                                'max-w-[230px]'
                              )}
                            {p.vehicleDocuments?.map((docItem) => (
                              <React.Fragment key={docItem.id}>
                                {renderAttachmentBadge(
                                  docItem.name,
                                  docItem.url,
                                  'doc',
                                  'max-w-[230px]'
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead>
                    <tr
                      style={{ backgroundColor: 'var(--ag-table-header-bg)' }}
                      className="border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                    >
                      <th className="py-3 px-3 whitespace-nowrap">{t('thPurchaseDate')}</th>
                      <th className="py-3 px-3">{t('thSupplierAndType')}</th>
                      <th className="py-3 px-3 min-w-[200px]">{t('thPurchaseItem')}</th>
                      <th className="py-3 px-3">{t('thPaymentMethod')}</th>
                      <th className="py-3 px-3">{t('thInvoiceAndDocs')}</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">{t('thSupplierPurchasePrice')}</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">
                        {pickLocalized(lang, {
                          fr: 'Actions',
                          ru: 'Действия',
                          hy: 'Գործողություններ',
                          ka: 'მოქმედებები',
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-xs">
                    {filteredPurchases.map((p) => {
                      const supplier = supplierMap.get(p.supplierId);
                      const effectiveType = supplier?.type || p.supplierType;
                      const linkedVehicle = p.vehicleId ? vehicleMap.get(p.vehicleId) : undefined;
                      const isConfirmingDelete = confirmDeletePurchaseId === p.id;
                      return (
                        <tr
                          key={p.id}
                          data-testid={`purchase-row-${p.id}`}
                          className="hover:bg-[var(--ag-table-row-hover)] transition-colors"
                        >
                          <td className="py-3 px-3 whitespace-nowrap font-medium text-[var(--foreground)] tabular-nums align-top">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                              <span>{p.date}</span>
                            </span>
                          </td>

                          <td className="py-3 px-3 align-top">
                            <button
                              type="button"
                              onClick={() => {
                                if (supplier) {
                                  setSelectedSupplierId(supplier.id);
                                  setActiveTab('suppliers');
                                }
                              }}
                              className="font-bold text-[var(--foreground)] hover:text-[var(--primary)] text-left transition cursor-pointer"
                            >
                              {supplier?.name || p.supplierName}
                            </button>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                              <span className="text-[var(--primary)]">
                                {getSupplierTypeIcon(effectiveType)}
                              </span>
                              <span>{getSupplierTypeLabel(effectiveType, lang)}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3 align-top min-w-[200px]">
                            <div className="font-semibold text-[var(--foreground)] leading-snug">
                              {p.description}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted-foreground)]">
                              <span>{getPurchaseCategoryLabel(p.category, lang)}</span>
                              {(linkedVehicle || p.vehicleLabel) && (
                                <>
                                  <span>·</span>
                                  {linkedVehicle ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectVehicle(linkedVehicle)}
                                      className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                                    >
                                      <span>
                                        {linkedVehicle.make} {linkedVehicle.model}
                                      </span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    <span>{p.vehicleLabel}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 align-top">
                            <span className="inline-flex items-center gap-1 text-[var(--secondary-foreground)]">
                              <CreditCard className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                              <span>{getPaymentMethodLabel(p.paymentMethod, lang)}</span>
                            </span>
                          </td>

                          <td className="py-3 px-3 align-top space-y-1">
                            {p.invoiceNumber && (
                              <div className="text-[11px] font-semibold text-[var(--foreground)] tabular-nums">
                                № {p.invoiceNumber}
                              </div>
                            )}
                            {p.invoiceProofName && (
                              <div>
                                {renderAttachmentBadge(
                                  p.invoiceProofName,
                                  p.invoiceProofUrl,
                                  'invoice'
                                )}
                              </div>
                            )}
                            {p.vehicleDocuments && p.vehicleDocuments.length > 0 && (
                              <div className="pt-0.5 space-y-0.5">
                                {p.vehicleDocuments.map((docItem) => (
                                  <div key={docItem.id}>
                                    {renderAttachmentBadge(docItem.name, docItem.url, 'doc')}
                                  </div>
                                ))}
                              </div>
                            )}
                            {!p.invoiceNumber &&
                              !p.invoiceProofName &&
                              (!p.vehicleDocuments || p.vehicleDocuments.length === 0) && (
                                <span className="text-[11px] text-[var(--muted-foreground)]">—</span>
                              )}
                          </td>

                          <td className="py-3 px-3 text-right whitespace-nowrap font-extrabold text-[var(--foreground)] tabular-nums align-top">
                            {formatEuro(p.amount)}
                          </td>

                          <td className="py-3 px-3 text-right whitespace-nowrap align-top">
                            {isConfirmingDelete ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePurchase(p.id)}
                                  className="px-2 py-1 rounded-md text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  {pickLocalized(lang, {
                                    fr: 'Suppr.',
                                    ru: 'Удалить',
                                    hy: 'Ջնջել',
                                    ka: 'წაშლა',
                                  })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePurchaseId(null)}
                                  className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer"
                                >
                                  {t('cancelBtn')}
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditPurchaseModal(p)}
                                  aria-label={`${pickLocalized(lang, {
                                    fr: 'Modifier',
                                    ru: 'Изменить',
                                    hy: 'Փոփոխել',
                                    ka: 'შეცვლა',
                                  })} ${p.description}`}
                                  title={pickLocalized(lang, {
                                    fr: 'Modifier',
                                    ru: 'Изменить',
                                    hy: 'Փոփոխել',
                                    ka: 'შეცვლა',
                                  })}
                                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePurchaseId(p.id)}
                                  aria-label={`${t('deleteTooltip')} ${p.description}`}
                                  title={t('deleteTooltip')}
                                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: SUPPLIERS DIRECTORY & DEAL HISTORY */}
      {activeTab === 'suppliers' && (
        <div
          data-testid="suppliers-directory-section"
          className="grid grid-cols-1 lg:grid-cols-12 gap-4"
        >
          {/* Left: Suppliers List */}
          <div className="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-3 sm:p-4 space-y-2.5 self-start">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('tabSuppliers').replace('{count}', String(filteredSupplierSummaries.length))}
              </span>
              <button
                type="button"
                onClick={openNewSupplierModal}
                className="text-xs font-bold text-[var(--primary)] hover:underline cursor-pointer"
              >
                + {t('newSupplierBtn')}
              </button>
            </div>

            {filteredSupplierSummaries.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--muted-foreground)]">
                {t('noSuppliersFound')}
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                {filteredSupplierSummaries.map((sum) => {
                  const isSelected = sum.supplier.id === selectedSupplierId;
                  return (
                    <button
                      key={sum.supplier.id}
                      type="button"
                      data-testid={`supplier-list-item-${sum.supplier.id}`}
                      onClick={() => setSelectedSupplierId(sum.supplier.id)}
                      className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--primary)]/10 border-[var(--primary)]'
                          : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--primary)]/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[var(--foreground)] truncate">
                            {sum.supplier.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted-foreground)]">
                            <span className="inline-flex items-center gap-1 text-[var(--primary)] font-medium">
                              {getSupplierTypeIcon(sum.supplier.type)}
                              <span>{getSupplierTypeLabel(sum.supplier.type, lang)}</span>
                            </span>
                            {sum.supplier.city && (
                              <>
                                <span>·</span>
                                <span>{sum.supplier.city}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold text-[var(--foreground)] tabular-nums">
                            {formatEuro(sum.totalSpent)}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">
                            {sum.purchasesCount}{' '}
                            {pickLocalized(lang, {
                              fr: 'achats',
                              ru: 'сделок',
                              hy: 'գնում',
                              ka: 'შესყიდვა',
                            })}
                          </div>
                        </div>
                      </div>
                      {sum.soldVehiclesCount > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-[var(--muted-foreground)]">
                            {pickLocalized(lang, {
                              fr: 'Profit réalisé',
                              ru: 'Реализованная прибыль',
                              hy: 'Իրացված շահույթ',
                              ka: 'რეალიზებული მოგება',
                            })}{' '}
                            ({sum.soldVehiclesCount}{' '}
                            {pickLocalized(lang, {
                              fr: 'vendus',
                              ru: 'продано',
                              hy: 'վաճառված',
                              ka: 'გაყიდული',
                            })}
                            )
                          </span>
                          <span className="font-bold text-[var(--ag-profit-color)]">
                            {formatEuro(sum.realizedNetProfit)}
                            {sum.roiPercent !== null ? ` · ROI ${sum.roiPercent.toFixed(1)}%` : ''}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Supplier Deal History Panel */}
          <div
            data-testid="supplier-deal-history-panel"
            className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] p-4 space-y-4"
          >
            {!selectedSupplierSummary ? (
              <div className="py-12 text-center space-y-2">
                <History className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-60" />
                <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
                  {t('supplierSelectPrompt')}
                </p>
              </div>
            ) : (
              <>
                {/* Supplier Header & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[var(--border)]">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--primary)]">
                        {getSupplierTypeIcon(selectedSupplierSummary.supplier.type)}
                      </span>
                      <span className="text-xs font-bold text-[var(--primary)]">
                        {getSupplierTypeLabel(selectedSupplierSummary.supplier.type, lang)}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-[var(--foreground)]">
                      {selectedSupplierSummary.supplier.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      {selectedSupplierSummary.supplier.contactPerson && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          <span>{selectedSupplierSummary.supplier.contactPerson}</span>
                        </span>
                      )}
                      {selectedSupplierSummary.supplier.phone && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{selectedSupplierSummary.supplier.phone}</span>
                        </span>
                      )}
                      {selectedSupplierSummary.supplier.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{selectedSupplierSummary.supplier.email}</span>
                        </span>
                      )}
                      {selectedSupplierSummary.supplier.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>
                            {selectedSupplierSummary.supplier.city}
                            {selectedSupplierSummary.supplier.address
                              ? ` · ${selectedSupplierSummary.supplier.address}`
                              : ''}
                          </span>
                        </span>
                      )}
                      {selectedSupplierSummary.supplier.siret && (
                        <span className="tabular-nums">
                          SIRET: {selectedSupplierSummary.supplier.siret}
                        </span>
                      )}
                    </div>
                    {selectedSupplierSummary.supplier.notes && (
                      <p className="text-xs text-[var(--secondary-foreground)] pt-1">
                        {selectedSupplierSummary.supplier.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditSupplierModal(selectedSupplierSummary.supplier)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:opacity-90 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>
                        {pickLocalized(lang, {
                          fr: 'Modifier',
                          ru: 'Изменить',
                          hy: 'Փոփոխել',
                          ka: 'შეცვლა',
                        })}
                      </span>
                    </button>
                    {confirmDeleteSupplierId === selectedSupplierSummary.supplier.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteSupplier(selectedSupplierSummary.supplier.id)
                          }
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white cursor-pointer"
                        >
                          {pickLocalized(lang, {
                            fr: 'Confirmer',
                            ru: 'Удалить',
                            hy: 'Ջնջել',
                            ka: 'წაშლა',
                          })}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSupplierId(null)}
                          className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] cursor-pointer"
                        >
                          {t('cancelBtn')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteSupplierId(selectedSupplierSummary.supplier.id)
                        }
                        aria-label={`${t('deleteTooltip')} ${selectedSupplierSummary.supplier.name}`}
                        className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-500 hover:bg-rose-500/10 border border-[var(--border)] transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Supplier KPI Summary Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {t('channelTotalSpend')}
                    </div>
                    <div className="mt-0.5 text-base font-extrabold text-[var(--foreground)] tabular-nums">
                      {formatEuro(selectedSupplierSummary.totalSpent)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {pickLocalized(lang, {
                        fr: 'Transactions',
                        ru: 'Всего сделок',
                        hy: 'Ընդամենը գործարք',
                        ka: 'სულ გარიგებები',
                      })}
                    </div>
                    <div className="mt-0.5 text-base font-extrabold text-[var(--foreground)] tabular-nums">
                      {selectedSupplierSummary.purchasesCount}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {t('channelNetProfit')}
                    </div>
                    <div
                      className={`mt-0.5 text-base font-extrabold tabular-nums ${
                        selectedSupplierSummary.soldVehiclesCount > 0
                          ? 'text-[var(--ag-profit-color)]'
                          : 'text-[var(--muted-foreground)]'
                      }`}
                    >
                      {selectedSupplierSummary.soldVehiclesCount > 0
                        ? formatEuro(selectedSupplierSummary.realizedNetProfit)
                        : '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {t('channelRoi')}
                    </div>
                    <div
                      className={`mt-0.5 text-base font-extrabold tabular-nums ${
                        selectedSupplierSummary.roiPercent !== null
                          ? 'text-[var(--ag-profit-color)]'
                          : 'text-[var(--muted-foreground)]'
                      }`}
                    >
                      {selectedSupplierSummary.roiPercent !== null
                        ? `${selectedSupplierSummary.roiPercent.toFixed(1)}%`
                        : '—'}
                    </div>
                  </div>
                </div>

                {/* Deal History List */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-[var(--primary)]" />
                      <h4 className="text-sm font-bold text-[var(--foreground)]">
                        {t('supplierDealHistoryTitle')}
                      </h4>
                    </div>
                    <button
                      type="button"
                      data-testid="supplier-new-deal-btn"
                      onClick={() => openNewPurchaseModal(selectedSupplierSummary.supplier.id)}
                      className="text-xs font-bold text-[var(--primary)] hover:underline cursor-pointer"
                    >
                      {t('supplierNewDealHere')}
                    </button>
                  </div>

                  {selectedSupplierSummary.deals.length === 0 ? (
                    <div className="p-6 rounded-xl bg-[var(--background)] border border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">
                      {t('noPurchasesFound')}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedSupplierSummary.deals.map((deal) => {
                        const veh = deal.vehicleId ? vehicleMap.get(deal.vehicleId) : undefined;
                        return (
                          <div
                            key={deal.id}
                            data-testid={`supplier-deal-${deal.id}`}
                            className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold text-xs sm:text-sm text-[var(--foreground)]">
                                  {deal.description}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted-foreground)] tabular-nums">
                                  <span>{deal.date}</span>
                                  <span>·</span>
                                  <span>{getPurchaseCategoryLabel(deal.category, lang)}</span>
                                  <span>·</span>
                                  <span>{getPaymentMethodLabel(deal.paymentMethod, lang)}</span>
                                  {deal.invoiceNumber && (
                                    <>
                                      <span>·</span>
                                      <span className="font-semibold text-[var(--foreground)]">
                                        № {deal.invoiceNumber}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-sm font-extrabold text-[var(--foreground)] tabular-nums">
                                  {formatEuro(deal.amount)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openEditPurchaseModal(deal)}
                                  className="text-[11px] font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                                >
                                  {pickLocalized(lang, {
                                    fr: 'Modifier',
                                    ru: 'Изменить',
                                    hy: 'Փոփոխել',
                                    ka: 'შეცვლა',
                                  })}
                                </button>
                              </div>
                            </div>

                            {(veh ||
                              deal.invoiceProofName ||
                              (deal.vehicleDocuments && deal.vehicleDocuments.length > 0)) && (
                              <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-3">
                                {veh && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectVehicle(veh)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                                  >
                                    <span>
                                      {veh.make} {veh.model} ({veh.year})
                                    </span>
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                                {deal.invoiceProofName &&
                                  renderAttachmentBadge(
                                    deal.invoiceProofName,
                                    deal.invoiceProofUrl,
                                    'invoice'
                                  )}
                                {deal.vehicleDocuments?.map((docItem) => (
                                  <React.Fragment key={docItem.id}>
                                    {renderAttachmentBadge(docItem.name, docItem.url, 'doc')}
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FULL CHANNEL PROFITABILITY COMPARISON TABLE */}
      {activeTab === 'channels' && (
        <div
          data-testid="channels-profitability-table"
          className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--ag-card-radius)] overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  style={{ backgroundColor: 'var(--ag-table-header-bg)' }}
                  className="border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"
                >
                  <th className="py-3 px-4">
                    {pickLocalized(lang, {
                      fr: 'Canal d’approvisionnement',
                      ru: 'Канал закупки',
                      hy: 'Գնման ալիք',
                      ka: 'შესყიდვის არხი',
                    })}
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    {pickLocalized(lang, {
                      fr: 'Fournisseurs',
                      ru: 'Поставщиков',
                      hy: 'Մատակարարներ',
                      ka: 'მომწოდებლები',
                    })}
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    {pickLocalized(lang, {
                      fr: 'Achats',
                      ru: 'Сделок',
                      hy: 'Գործարքներ',
                      ka: 'გარიგებები',
                    })}
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    {t('channelVehiclesSourced')}
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">{t('channelSoldCount')}</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">{t('channelTotalSpend')}</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">{t('channelNetProfit')}</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">{t('channelAvgProfit')}</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">{t('channelRoi')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs tabular-nums">
                {channelAnalytics.channels.map((ch) => {
                  const isBest = channelAnalytics.bestVehicleChannel?.type === ch.type;
                  return (
                    <tr
                      key={ch.type}
                      className="hover:bg-[var(--ag-table-row-hover)] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-[var(--foreground)]">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--primary)]">
                            {getSupplierTypeIcon(ch.type)}
                          </span>
                          <span>
                            {pickLocalized(lang, {
                              fr: ch.labelFr,
                              ru: ch.labelRu,
                              hy: ch.labelHy,
                              ka: ch.labelKa,
                            })}
                          </span>
                          {isBest && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--ag-profit-color)]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t('channelBestBadge')}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right text-[var(--foreground)]">
                        {ch.suppliersCount}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[var(--foreground)]">
                        {ch.purchasesCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[var(--foreground)]">
                        {ch.isVehicleSource ? ch.linkedVehiclesCount : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[var(--foreground)]">
                        {ch.isVehicleSource ? ch.soldVehiclesCount : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-[var(--foreground)]">
                        {formatEuro(ch.totalSpent)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-extrabold ${
                          ch.soldVehiclesCount === 0
                            ? 'text-[var(--muted-foreground)]'
                            : ch.realizedNetProfit >= 0
                            ? 'text-[var(--ag-profit-color)]'
                            : 'text-[var(--ag-expense-color)]'
                        }`}
                      >
                        {ch.soldVehiclesCount > 0 ? formatEuro(ch.realizedNetProfit) : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[var(--foreground)]">
                        {ch.averageNetProfitPerCar !== null
                          ? formatEuro(ch.averageNetProfitPerCar)
                          : '—'}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-extrabold ${
                          ch.roiPercent !== null
                            ? 'text-[var(--ag-profit-color)]'
                            : 'text-[var(--muted-foreground)]'
                        }`}
                      >
                        {ch.roiPercent !== null ? `${ch.roiPercent.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPPLIER CREATE / EDIT MODAL */}
      {isSupplierModalOpen && (
        <div
          data-testid="supplier-modal"
          role="dialog"
          aria-modal="true"
          aria-label={editingSupplier ? t('supplierModalEditTitle') : t('supplierModalAddTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--ag-modal-bg)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-base font-extrabold text-[var(--foreground)]">
                {editingSupplier ? t('supplierModalEditTitle') : t('supplierModalAddTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                aria-label={t('closeForm')}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {supError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-500"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{supError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSupplier} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierNameLabel')}
                  </label>
                  <input
                    type="text"
                    data-testid="supplier-name-input"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Ex. BCA Enchères ou Auto Distribution',
                      ru: 'Напр. BCA Auto Enchères или Иван Петров',
                      hy: 'Օրինակ՝ BCA Enchères կամ մատակարար',
                      ka: 'მაგ. BCA Enchères ან მომწოდებელი',
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierTypeLabel')}
                  </label>
                  <ThemedSelect
                    testId="supplier-type-select"
                    ariaLabel={t('supplierTypeLabel')}
                    value={supType}
                    onChange={(val) => setSupType(val as SupplierType)}
                    options={SUPPLIER_TYPES.map((st) => ({
                      value: st.id,
                      label: getSupplierTypeLabel(st.id, lang),
                    }))}
                    triggerClassName="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierContactLabel')}
                  </label>
                  <input
                    type="text"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('phone')}
                  </label>
                  <input
                    type="text"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('email')}
                  </label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierCityLabel')}
                  </label>
                  <input
                    type="text"
                    value={supCity}
                    onChange={(e) => setSupCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierAddressLabel')}
                  </label>
                  <input
                    type="text"
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierSiretLabel')}
                  </label>
                  <input
                    type="text"
                    value={supSiret}
                    onChange={(e) => setSupSiret(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('supplierNotesLabel')}
                  </label>
                  <textarea
                    rows={2}
                    value={supNotes}
                    onChange={(e) => setSupNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  data-testid="save-supplier-btn"
                  disabled={isSavingSupplier}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSavingSupplier
                    ? pickLocalized(lang, {
                        fr: 'Enregistrement...',
                        ru: 'Сохранение...',
                        hy: 'Պահպանում...',
                        ka: 'შენახვა...',
                      })
                    : t('saveSupplierBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE CREATE / EDIT MODAL */}
      {isPurchaseModalOpen && (
        <div
          data-testid="purchase-modal"
          role="dialog"
          aria-modal="true"
          aria-label={editingPurchase ? t('purchaseModalEditTitle') : t('purchaseModalAddTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[var(--ag-modal-bg)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-base font-extrabold text-[var(--foreground)]">
                {editingPurchase ? t('purchaseModalEditTitle') : t('purchaseModalAddTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                aria-label={t('closeForm')}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {purError && (
              <div
                role="alert"
                data-testid="purchase-modal-error"
                className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-500"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{purError}</span>
              </div>
            )}

            <form onSubmit={handleSavePurchase} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Supplier Selector + Inline Quick Create */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-[var(--secondary-foreground)]">
                      {t('purchaseSupplierLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={openNewSupplierModal}
                      className="text-[11px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                    >
                      + {t('newSupplierBtn')}
                    </button>
                  </div>
                  {suppliers.length > 0 ? (
                    <ThemedSelect
                      testId="purchase-supplier-select"
                      ariaLabel={t('purchaseSupplierLabel')}
                      value={purSupplierId}
                      onChange={(val) => {
                        setPurSupplierId(val);
                        if (!editingPurchase) {
                          const nextSup = suppliers.find((s) => s.id === val);
                          if (nextSup) {
                            setPurCategory(getDefaultCategoryForSupplierType(nextSup.type));
                          }
                        }
                      }}
                      options={suppliers.map((s) => ({
                        value: s.id,
                        label: `${s.name} (${getSupplierTypeLabel(s.type, lang)})`,
                      }))}
                      triggerClassName="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                    />
                  ) : (
                    <div className="p-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--muted-foreground)] flex items-center justify-between">
                      <span>
                        {pickLocalized(lang, {
                          fr: 'Ajoutez d’abord un fournisseur',
                          ru: 'Сначала добавьте поставщика',
                          hy: 'Նախ ավելացրեք մատակարար',
                          ka: 'ჯერ დაამატეთ მომწოდებელი',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={openNewSupplierModal}
                        className="font-bold text-[var(--primary)] hover:underline cursor-pointer"
                      >
                        + {t('newSupplierBtn')}
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseCategoryLabel')}
                  </label>
                  <ThemedSelect
                    testId="purchase-category-select"
                    ariaLabel={t('purchaseCategoryLabel')}
                    value={purCategory}
                    onChange={(val) => setPurCategory(val as PurchaseCategory)}
                    options={PURCHASE_CATEGORIES.map((c) => ({
                      value: c.id,
                      label: getPurchaseCategoryLabel(c.id, lang),
                    }))}
                    triggerClassName="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseVehicleLabel')}
                  </label>
                  <ThemedSelect
                    testId="purchase-vehicle-select"
                    ariaLabel={t('purchaseVehicleLabel')}
                    value={purVehicleId}
                    onChange={(val) => {
                      setPurVehicleId(val);
                      if (val && !purDescription.trim()) {
                        const v = vehicleMap.get(val);
                        if (v) {
                          setPurDescription(`${v.make} ${v.model} ${v.year}`);
                          if (purCategory === 'vehicle' && !purAmount) {
                            setPurAmount(String(v.purchasePrice || ''));
                          }
                        }
                      }
                    }}
                    options={[
                      { value: '', label: t('purchaseNoVehicle') },
                      ...vehicles.map((v) => ({
                        value: v.id,
                        label: `${v.make} ${v.model} (${v.year})${
                          v.registrationNumber ? ` · ${v.registrationNumber}` : ''
                        }`,
                      })),
                    ]}
                    triggerClassName="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseDescLabel')}
                  </label>
                  <input
                    type="text"
                    data-testid="purchase-desc-input"
                    value={purDescription}
                    onChange={(e) => setPurDescription(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Ex. BMW 320d Touring — Lot #112 ou Kit freinage',
                      ru: 'Напр. BMW 320d Touring — лот №112 или комплект тормозов',
                      hy: 'Օրինակ՝ BMW 320d Touring կամ արգելակման հավաքածու',
                      ka: 'მაგ. BMW 320d Touring — ლოტი #112 ან სამუხრუჭე კომპლექტი',
                    })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseAmountLabel')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="purchase-amount-input"
                    value={purAmount}
                    onChange={(e) => setPurAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs font-bold tabular-nums text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseDateLabel')}
                  </label>
                  <input
                    type="date"
                    data-testid="purchase-date-input"
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchasePaymentLabel')}
                  </label>
                  <ThemedSelect
                    testId="purchase-payment-select"
                    ariaLabel={t('purchasePaymentLabel')}
                    value={purPayment}
                    onChange={(val) => setPurPayment(val as PurchasePaymentMethod)}
                    options={PAYMENT_METHODS.map((pm) => ({
                      value: pm.id,
                      label: getPaymentMethodLabel(pm.id, lang),
                    }))}
                    triggerClassName="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                    {t('purchaseInvoiceNumLabel')}
                  </label>
                  <input
                    type="text"
                    data-testid="purchase-invoice-input"
                    value={purInvoiceNumber}
                    onChange={(e) => setPurInvoiceNumber(e.target.value)}
                    placeholder="FACT-2026-001"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Invoice Proof Upload / Name */}
              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2">
                <label className="block text-xs font-bold text-[var(--secondary-foreground)]">
                  {t('purchaseInvoiceProofLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:opacity-90 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>{t('purchaseUploadProof')}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleInvoiceProofFileChange}
                      className="sr-only"
                    />
                  </label>
                  <input
                    type="text"
                    value={purInvoiceProofName}
                    onChange={(e) => setPurInvoiceProofName(e.target.value)}
                    placeholder={pickLocalized(lang, {
                      fr: 'Ou nom du justificatif...',
                      ru: 'Или название файла / чека...',
                      hy: 'Կամ անդորրագրի / ֆայլի անվանումը...',
                      ka: 'ან ქვითრის / ფაილის სახელი...',
                    })}
                    className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                  {purInvoiceProofName && (
                    <button
                      type="button"
                      onClick={() => {
                        setPurInvoiceProofName('');
                        setPurInvoiceProofUrl('');
                      }}
                      className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-rose-500 cursor-pointer"
                      aria-label={t('deleteTooltip')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Vehicle Documents List & Builder */}
              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2.5">
                <label className="block text-xs font-bold text-[var(--secondary-foreground)]">
                  {t('purchaseVehicleDocsLabel')}
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] hover:opacity-90 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>{t('purchaseAddVehicleDocFile')}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleVehicleDocFileAdd}
                      className="sr-only"
                    />
                  </label>
                  <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                    <input
                      type="text"
                      data-testid="purchase-doc-name-input"
                      value={newDocLabel}
                      onChange={(e) => setNewDocLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddNamedVehicleDoc();
                        }
                      }}
                      placeholder={t('purchaseAddVehicleDocPlaceholder')}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <button
                      type="button"
                      data-testid="purchase-add-doc-btn"
                      onClick={handleAddNamedVehicleDoc}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-muted)] text-[var(--primary)] border border-[var(--border)] hover:opacity-90 cursor-pointer"
                    >
                      {t('purchaseAddDocBtn')}
                    </button>
                  </div>
                </div>

                {purVehicleDocs.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {purVehicleDocs.map((docItem) => (
                      <div
                        key={docItem.id}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                          <span className="truncate text-[var(--foreground)]">{docItem.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPurVehicleDocs((prev) => prev.filter((d) => d.id !== docItem.id))
                          }
                          aria-label={`${t('deleteTooltip')} ${docItem.name}`}
                          className="p-1 text-[var(--muted-foreground)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--secondary-foreground)] mb-1">
                  {pickLocalized(lang, {
                    fr: 'Notes',
                    ru: 'Заметки',
                    hy: 'Նշումներ',
                    ka: 'შენიშვნები',
                  })}
                </label>
                <textarea
                  rows={2}
                  value={purNotes}
                  onChange={(e) => setPurNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-semibold bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] cursor-pointer"
                >
                  {t('cancelBtn')}
                </button>
                <button
                  type="submit"
                  data-testid="save-purchase-btn"
                  disabled={isSavingPurchase}
                  className="px-4 py-2 rounded-[var(--ag-button-radius)] text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSavingPurchase
                    ? pickLocalized(lang, {
                        fr: 'Enregistrement...',
                        ru: 'Сохранение...',
                        hy: 'Պահպանում...',
                        ka: 'შენახვა...',
                      })
                    : t('savePurchaseBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INLINE DOCUMENT PREVIEW MODAL (Avoids window.open inside iFrame) */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={previewDoc.name}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-[var(--ag-modal-bg)] text-[var(--foreground)] border border-[var(--border)] rounded-[var(--ag-card-radius)] shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[var(--primary)] shrink-0" />
                <span className="text-sm font-bold truncate">{previewDoc.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewDoc.url}
                  download={previewDoc.name}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {pickLocalized(lang, {
                      fr: 'Télécharger',
                      ru: 'Скачать',
                      hy: 'Ներբեռնել',
                      ka: 'ჩამოტვირთვა',
                    })}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  aria-label={t('closeForm')}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl bg-[var(--background)] border border-[var(--border)] flex items-center justify-center p-2">
              {previewDoc.url.startsWith('data:image/') ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[65vh] rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
