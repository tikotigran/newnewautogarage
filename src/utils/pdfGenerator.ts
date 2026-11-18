import jsPDF from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Vehicle, RepairTask, GeneralExpense, GarageSettings, VatRegime } from '../types/garage';
import { DEFAULT_GARAGE_SETTINGS } from '../services/garageService';
import { calculateSaleTaxReport, formatEuro } from './finance';
import {
  calculateFrenchVat,
  FRENCH_TAX_DEFAULTS,
  normalizeFrenchTaxConfig,
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
} from './frenchTaxEngine';
import { DealershipAnalyticsReport } from './analytics';
import {
  buildFacturXInvoiceNumber,
  buildFacturXXml,
  buildFinancialLedgerRows,
} from './exportBackup';
import {
  Cerfa15776FormData,
  buildInitialCerfaData,
  formatFrenchDate,
  sanitizeWinAnsi,
  splitFrenchDateDigits,
} from './cerfa15776';
import {
  CALIBRATION_DUMMY_TEMPLATE_VALUES,
  CERFA_15776_CONFIG,
  Cerfa15776Config,
  CerfaCalibrationFieldEntry,
  CerfaCheckboxConfig,
  CerfaCombFieldConfig,
  CerfaTemplateOffsetConfig,
  CerfaTextFieldConfig,
  getEffectiveCerfa15776Config,
} from './cerfaConfig';
import { ensureCerfaCalibrationHydrated } from '../services/adminService';

let cachedCerfaTemplateBytes: ArrayBuffer | null = null;

/**
 * Triggers browser download of a Blob
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Opens a print dialog for a PDF Blob using an invisible iframe
 */
export function printPDFBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print error, falling back to window.open:', e);
      window.open(url, '_blank');
    }
  };

  document.body.appendChild(iframe);
  setTimeout(() => {
    document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
  }, 60000);
}

/**
 * 1. Custom Garage Sales Invoice (Facture de Vente)
 * Pre-fills Seller (Garagist) details from saved user profile settings (Name/Company, Address, SIRET, Contact info).
 * Pre-fills Vehicle details (Make, Model, VIN/Immat, Mileage, Sale Price).
 * Pre-fills Buyer details from sales input form (Name, Address, Phone, Email).
 */
export function generateSalesInvoicePDF(
  vehicle: Vehicle,
  garageSettings: GarageSettings = DEFAULT_GARAGE_SETTINGS,
  action: 'download' | 'print' = 'download'
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const buyer = vehicle.buyerInfo || {
    fullName: 'Client Particulier',
    phone: 'Non renseigné',
    email: 'Non renseigné',
    address: 'France',
    salePrice: vehicle.targetSalePrice,
    saleDate: new Date().toISOString().split('T')[0],
  };

  const invoiceNumber = `FAC-${vehicle.year}-${vehicle.vin.slice(-5) || '001'}`;
  const sellerStreetPart = [garageSettings.streetNumber, garageSettings.streetExtension, garageSettings.streetType, garageSettings.streetName].filter(Boolean).join(' ');
  const sellerAddress = `${sellerStreetPart}, ${garageSettings.postalCode} ${garageSettings.city}`;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('FACTURE DE VENTE DE VÉHICULE D’OCCASION', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Facture N° ${invoiceNumber}  |  Date de cession : ${buyer.saleDate}`, 14, 26);

  // Seller & Buyer 2-Column Boxes
  const dealProfile = resolveDealSellerProfileType(vehicle, garageSettings);
  const dealSettings = {
    ...garageSettings,
    ...resolveEffectiveSettingsForDeal({ vehicle, garageSettings }),
  };
  const isParticulierSeller = dealProfile === 'particulier';
  const isMicroDealSeller =
    dealProfile === 'micro_entrepreneur' &&
    (vehicle.buyerInfo?.sellerProfileType === 'micro_entrepreneur' ||
      dealSettings.taxRegime === 'micro');
  const formattedPhysiqueSellerName = [garageSettings.firstName, garageSettings.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displaySellerName = isParticulierSeller
    ? formattedPhysiqueSellerName || garageSettings.name
    : garageSettings.name || formattedPhysiqueSellerName;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isParticulierSeller
      ? 'VENDEUR (PARTICULIER)'
      : isMicroDealSeller
      ? 'VENDEUR (MICRO-ENTREPRENEUR)'
      : 'VENDEUR (GARAGE)',
    14,
    42
  );
  doc.text('ACHETEUR (CLIENT)', 112, 42);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 46, 88, 38, 2, 2, 'F');
  doc.roundedRect(112, 46, 84, 38, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(displaySellerName, 18, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (!isParticulierSeller && garageSettings.siret) {
    doc.text(`SIRET : ${garageSettings.siret}`, 18, 58);
  } else if (isParticulierSeller) {
    doc.text('Vendeur particulier (vente privée)', 18, 58);
  }
  doc.text(sellerAddress, 18, 64, { maxWidth: 80 });
  doc.text(`Tél : ${garageSettings.phone}  |  ${garageSettings.email}`, 18, 76, { maxWidth: 80 });

  // Buyer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(buyer.fullName, 116, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (buyer.isCompany && buyer.siret) {
    doc.text(`SIRET : ${buyer.siret}`, 116, 58);
  } else if (buyer.birthDate) {
    doc.text(`Né(e) le : ${buyer.birthDate}${buyer.birthPlace ? ' à ' + buyer.birthPlace : ''}`, 116, 58);
  }
  doc.text(`Adresse : ${buyer.address}`, 116, 64, { maxWidth: 76 });
  doc.text(`Tél : ${buyer.phone}  |  ${buyer.email}`, 116, 76, { maxWidth: 76 });

  // Vehicle Information Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('CARACTÉRISTIQUES DU VÉHICULE CÉDÉ', 14, 92);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 96, 182, 38, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Marque / Modèle :', 20, 103);
  doc.setFont('helvetica', 'normal');
  doc.text(`${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`, 58, 103);

  doc.setFont('helvetica', 'bold');
  doc.text('N° Immat / VIN :', 20, 111);
  doc.setFont('helvetica', 'normal');
  doc.text(`${vehicle.vin}`, 58, 111);

  doc.setFont('helvetica', 'bold');
  doc.text('Mise en circulation :', 20, 119);
  doc.setFont('helvetica', 'normal');
  doc.text(`${vehicle.year}`, 58, 119);

  doc.setFont('helvetica', 'bold');
  doc.text('Kilométrage certifié :', 115, 103);
  doc.setFont('helvetica', 'normal');
  doc.text(`${vehicle.mileage.toLocaleString('fr-FR')} km`, 155, 103);

  doc.setFont('helvetica', 'bold');
  doc.text('Date de cession :', 115, 111);
  doc.setFont('helvetica', 'normal');
  doc.text(`${buyer.saleDate}${buyer.saleTime ? ' à ' + buyer.saleTime : ''}`, 155, 111);

  doc.setFont('helvetica', 'bold');
  doc.text('Genre / Énergie :', 115, 119);
  doc.setFont('helvetica', 'normal');
  doc.text('VP (Voiture Particulière) / Essence-Diesel', 155, 119);

  // Financial Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DÉCOMPTE FINANCIER & RÈGLEMENT', 14, 142);

  // Table header
  doc.setFillColor(15, 23, 42);
  doc.rect(14, 146, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('DÉSIGNATION', 20, 151.5);
  doc.text('RÉGIME DE TVA', 105, 151.5);
  doc.text('MONTANT NET TTC', 160, 151.5);

  // Table row
  doc.setFillColor(255, 255, 255);
  doc.rect(14, 154, 182, 16);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Véhicule d’occasion ${vehicle.make} ${vehicle.model} (${vehicle.vin})`, 20, 161);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Contrôle technique valide remis et certificat de situation administrative vierge', 20, 166);

  const isCorporateVatSeller =
    !vehicle.buyerInfo?.sellerProfileType &&
    (dealSettings.taxRegime === 'sarl' ||
      dealSettings.taxRegime === 'sas' ||
      dealSettings.taxRegime === 'custom');
  const resolvedVatRegime: VatRegime = isParticulierSeller || isMicroDealSeller
    ? 'franchise_base'
    : isCorporateVatSeller
    ? vehicle.buyerInfo?.vatRegime ||
      vehicle.buyerInfo?.taxSnapshot?.vatRegime ||
      dealSettings.frenchTaxConfig?.vatRegime ||
      'tva_marge'
    : vehicle.buyerInfo?.taxSnapshot?.isHistoricalSnapshot &&
      vehicle.buyerInfo.taxSnapshot.vatAmount > 0
    ? vehicle.buyerInfo.taxSnapshot.vatRegime
    : 'franchise_base';
  const resolvedVatRate = isParticulierSeller || isMicroDealSeller
    ? 0
    : isCorporateVatSeller
    ? vehicle.buyerInfo?.vatRatePercent ??
      vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ??
      dealSettings.frenchTaxConfig?.vatRatePercent ??
      20
    : resolvedVatRegime === 'franchise_base'
    ? 0
    : vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ?? 0;
  const vatBreakdown = calculateFrenchVat({
    salePrice: Number(buyer.salePrice) || 0,
    purchasePrice: Number(vehicle.purchasePrice) || 0,
    vatRegime: resolvedVatRegime,
    vatRatePercent: resolvedVatRate,
  });

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(
    isParticulierSeller ? 'Vente privée (Hors TVA)' : vatBreakdown.regimeShortLabel,
    105,
    163,
    { maxWidth: 50 }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(formatEuro(buyer.salePrice), 160, 163);

  // Total summary box
  doc.setFillColor(248, 250, 252);
  doc.rect(112, 172, 84, 22, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(112, 172, 84, 22);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(isParticulierSeller ? 'Prix de cession :' : 'Total Hors Taxe :', 116, 178);
  doc.text(
    isParticulierSeller
      ? 'TVA (Non assujetti) :'
      : resolvedVatRegime === 'tva_marge'
      ? 'TVA incluse (Marge) :'
      : resolvedVatRegime === 'franchise_base'
      ? 'TVA (Art. 293 B) :'
      : `TVA (${vatBreakdown.vatRatePercent}%) :`,
    116,
    184
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('NET À PAYER TTC :', 116, 190);

  doc.setFont('helvetica', 'normal');
  doc.text(formatEuro(vatBreakdown.htAmount), 162, 178);
  doc.text(
    isParticulierSeller
      ? '0,00 € (Particulier)'
      : resolvedVatRegime === 'franchise_base'
      ? '0,00 € (Exonéré)'
      : resolvedVatRegime === 'tva_marge'
      ? `${formatEuro(vatBreakdown.vatAmount)} (Marge)`
      : formatEuro(vatBreakdown.vatAmount),
    162,
    184
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(formatEuro(buyer.salePrice), 162, 190);

  // Legal Mentions Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 198, 182, 38, 1.5, 1.5, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('MENTIONS LÉGALES & CONDITIONS GÉNÉRALES DE VENTE :', 18, 204);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const mentionFiscal = isParticulierSeller
    ? 'Vente privée réalisée par un particulier non assujetti à la TVA (Art. 256 A du CGI).'
    : resolvedVatRegime === 'tva_marge' && dealSettings.tvaMention?.trim()
    ? dealSettings.tvaMention
    : vatBreakdown.legalMention;
  doc.text(`1. Régime fiscal : ${mentionFiscal}`, 18, 209, { maxWidth: 174 });
  doc.text(
    isParticulierSeller
      ? '2. Garanties légales : Vente entre particuliers soumise à la garantie des vices cachés (Art. 1641 et suivants du Code civil).'
      : '2. Garanties légales : Le véhicule bénéficie de la garantie légale de conformité (Art. L. 217-3 et suivants du Code de la consommation) et de la garantie des vices cachés (Art. 1641 et suivants du Code civil).',
    18,
    215,
    { maxWidth: 174 }
  );
  doc.text('3. Situation administrative : Le vendeur certifie que le véhicule n’est pas gagé et n’a subi aucune transformation susceptible de modifier le certificat d’immatriculation.', 18, 224, { maxWidth: 174 });
  doc.text('4. Paiement : Virement bancaire ou chèque de banque certifié encaissé avant remise définitive des clés et des titres.', 18, 231);

  // Signatures
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Pour le Vendeur (${displaySellerName}) :`, 20, 241);
  doc.text('Pour l’Acheteur (« Bon pour accord ») :', 115, 241);

  doc.setDrawColor(203, 213, 225);
  doc.rect(20, 244, 75, 28);
  doc.rect(115, 244, 75, 28);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    isParticulierSeller ? 'Signature du vendeur (Particulier)' : 'Cachet commercial et signature autorisée',
    22,
    270
  );
  doc.text('Signature de l’acquéreur précédée de la mention manuscrite', 117, 270);

  const cleanVin = vehicle.vin.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `Facture_${vehicle.make}_${vehicle.model}_${invoiceNumber}.pdf`;

  if (action === 'print') {
    const blob = doc.output('blob');
    printPDFBlob(blob);
  } else {
    doc.save(fileName);
  }
}

/**
 * 2. Official French Cerfa 15776 Form (Certificat de Cession d'un véhicule d'occasion)
 * Loads /public/assets/aistudio/cerfa_15776-02__1__c28daa99.pdf
 * Auto-fills Section "LE VÉHICULE":
 *  - (A) Numéro d’immatriculation
 *  - (E) Numéro d’identification du véhicule (VIN)
 *  - (B) Date de 1re immatriculation
 *  - (D.1) Marque
 *  - (D.2) Type, variante, version
 *  - (J.1) Genre national (VP)
 *  - (D.3) Dénomination commerciale
 *  - Kilométrage compteur
 *  - Case OUI certificat d'immatriculation
 * Auto-fills Section "Ancien propriétaire" (Seller) from garage profile settings:
 *  - Personne morale [X]
 *  - Nom/Raison sociale, SIRET, Adresse complète
 *  - Case céder [X]
 *  - Date et Heure de cession
 *  - Cases attestations [X]
 *  - Fait à Commune, le Date
 * Auto-fills Section "Nouveau propriétaire" (Buyer) from buyer info:
 *  - Personne physique / morale [X]
 *  - Nom et Prénom / Raison sociale, SIRET
 *  - Né(e) le ... à ...
 *  - Adresse complète (N°, Voie, Code postal, Commune)
 *  - Case Acquérir [X]
 *  - Fait à Commune, le Date
 */
/**
 * Helper to draw characters into fixed-width comb boxes on the official Cerfa 15776*02 PDF
 */
function drawCombField(
  page: ReturnType<PDFDocument['getPages']>[number],
  value: string,
  cfg: CerfaCombFieldConfig,
  fontRegular: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  color: ReturnType<typeof rgb>
): void {
  const clean = sanitizeWinAnsi(value).slice(0, cfg.maxChars);
  const font = cfg.bold ? fontBold : fontRegular;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch && ch !== ' ') {
      page.drawText(ch, {
        x: cfg.x + i * cfg.stepX,
        y: cfg.y,
        size: cfg.size,
        font,
        color,
      });
    }
  }
}

export interface CerfaPdfRenderOptions {
  highlightedFieldPath?: string | null;
  customOffsets?: Partial<CerfaTemplateOffsetConfig> | null;
  showCalibrationPlaceholderForSelected?: boolean;
}

/**
 * Builds the raw PDF bytes for Cerfa N° 15776*02 using the provided config
 * (defaults to CERFA_15776_CONFIG). Caches the official template in memory for
 * instant live re-rendering in Visual Aligner Mode.
 */
export async function buildCerfa15776PdfBytes(
  formData: Cerfa15776FormData,
  customConfig?: Cerfa15776Config | typeof CERFA_15776_CONFIG,
  options?: CerfaPdfRenderOptions
): Promise<Uint8Array> {
  let config: Cerfa15776Config;
  if (customConfig) {
    config = getEffectiveCerfa15776Config(customConfig, options?.customOffsets);
  } else {
    const cloudCalibration = await ensureCerfaCalibrationHydrated();
    config = getEffectiveCerfa15776Config(
      cloudCalibration.cerfa_15776_02.config,
      options?.customOffsets ?? cloudCalibration.cerfa_15776_02.offsets
    );
  }
  const highlightedPath = options?.highlightedFieldPath || null;
  const showSelectedPlaceholder = Boolean(options?.showCalibrationPlaceholderForSelected);
  const { vehicle: v, seller: s, buyer: b } = formData;

  if (!cachedCerfaTemplateBytes) {
    const response = await fetch(config.templatePath);
    if (!response.ok) {
      throw new Error(`Impossible de charger le modèle officiel Cerfa 15776*02 (HTTP ${response.status}).`);
    }
    cachedCerfaTemplateBytes = await response.arrayBuffer();
  }

  const pdfDoc = await PDFDocument.load(cachedCerfaTemplateBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.08, 0.08, 0.08);
  const highlightTextColor = rgb(0.88, 0.12, 0.04);
  const highlightFillColor = rgb(0.96, 0.62, 0.04);
  const highlightBorderColor = rgb(0.92, 0.18, 0.05);

  const drawField = (
    page: ReturnType<PDFDocument['getPages']>[number],
    text: string,
    cfg: CerfaTextFieldConfig,
    fieldPath?: string
  ) => {
    const isHighlighted = Boolean(highlightedPath && fieldPath === highlightedPath);
    const effectiveText =
      text || (isHighlighted && showSelectedPlaceholder ? 'EXEMPLE' : '');
    const sliced = cfg.maxChars ? effectiveText.slice(0, cfg.maxChars) : effectiveText;
    const clean = sanitizeWinAnsi(sliced);
    if (!clean && !isHighlighted) return;

    const activeFont = cfg.bold ? fontBold : font;
    if (isHighlighted) {
      const measuredW = clean
        ? activeFont.widthOfTextAtSize(clean, cfg.size)
        : Math.max(40, (cfg.maxChars || 12) * cfg.size * 0.52);
      page.drawRectangle({
        x: cfg.x - 2.5,
        y: cfg.y - 2.5,
        width: Math.max(24, measuredW + 5),
        height: cfg.size + 5.5,
        color: highlightFillColor,
        opacity: 0.25,
        borderColor: highlightBorderColor,
        borderWidth: 1.15,
        borderOpacity: 0.95,
      });
    }

    if (clean) {
      page.drawText(clean, {
        x: cfg.x,
        y: cfg.y,
        size: cfg.size,
        font: activeFont,
        color: isHighlighted ? highlightTextColor : dark,
      });
    }
  };

  const drawCheck = (
    page: ReturnType<PDFDocument['getPages']>[number],
    cfg: CerfaCheckboxConfig,
    fieldPath?: string,
    isChecked = true
  ) => {
    const isHighlighted = Boolean(highlightedPath && fieldPath === highlightedPath);
    if (!isChecked && !isHighlighted) return;

    if (isHighlighted) {
      page.drawRectangle({
        x: cfg.x - 2.5,
        y: cfg.y - 2.5,
        width: cfg.size + 5,
        height: cfg.size + 5,
        color: highlightFillColor,
        opacity: 0.28,
        borderColor: highlightBorderColor,
        borderWidth: 1.2,
        borderOpacity: 0.95,
      });
    }

    if (isChecked || showSelectedPlaceholder) {
      page.drawText('X', {
        x: cfg.x,
        y: cfg.y,
        size: cfg.size,
        font: fontBold,
        color: isHighlighted ? highlightTextColor : dark,
      });
    }
  };

  const drawComb = (
    page: ReturnType<PDFDocument['getPages']>[number],
    value: string,
    cfg: CerfaCombFieldConfig,
    fieldPath?: string
  ) => {
    const isHighlighted = Boolean(highlightedPath && fieldPath === highlightedPath);
    const effectiveValue =
      value || (isHighlighted && showSelectedPlaceholder ? '0'.repeat(Math.min(4, cfg.maxChars)) : '');
    if (isHighlighted) {
      const boxWidth = Math.max(
        18,
        (cfg.maxChars - 1) * cfg.stepX + cfg.size * 0.78 + 5
      );
      page.drawRectangle({
        x: cfg.x - 2.5,
        y: cfg.y - 2.5,
        width: boxWidth,
        height: cfg.size + 5.5,
        color: highlightFillColor,
        opacity: 0.25,
        borderColor: highlightBorderColor,
        borderWidth: 1.15,
        borderOpacity: 0.95,
      });
    }
    drawCombField(
      page,
      effectiveValue,
      cfg,
      font,
      fontBold,
      isHighlighted ? highlightTextColor : dark
    );
  };

  const firstRegDigits = splitFrenchDateDigits(v.firstRegistrationDate);
  const certDateDigits = splitFrenchDateDigits(v.certificateDate);
  const saleDateDigits = splitFrenchDateDigits(s.saleDate);
  const sellerSigningDateFr = formatFrenchDate(s.signingDate || s.saleDate);
  const buyerBirthDigits = splitFrenchDateDigits(b.birthDate);
  const buyerSigningDateFr = formatFrenchDate(b.signingDate || s.saleDate);

  const [saleHours = '14', saleMinutes = '00'] = (s.saleTime || '14:00').split(':');

  const sellerFullStreet = [s.streetType, s.streetName].filter(Boolean).join(' ').trim();
  const buyerFullStreet = [b.streetType, b.streetName].filter(Boolean).join(' ').trim();

  const { section1Vehicle: s1, section2Seller: s2, section3Buyer: s3, checkboxes: footerCb } =
    config;

  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    // ==========================================
    // 1. LE VÉHICULE (à remplir par l'ancien propriétaire)
    // ==========================================
    drawComb(page, v.registrationNumber.toUpperCase(), s1.registrationNumber, 'section1Vehicle.registrationNumber');
    drawComb(page, v.vin.toUpperCase(), s1.vin, 'section1Vehicle.vin');
    drawComb(page, firstRegDigits.dd, s1.firstRegistrationDate.dd, 'section1Vehicle.firstRegistrationDate.dd');
    drawComb(page, firstRegDigits.mm, s1.firstRegistrationDate.mm, 'section1Vehicle.firstRegistrationDate.mm');
    drawComb(page, firstRegDigits.yyyy, s1.firstRegistrationDate.yyyy, 'section1Vehicle.firstRegistrationDate.yyyy');

    drawField(page, v.make.toUpperCase(), s1.make, 'section1Vehicle.make');
    drawField(page, v.typeVariantVersion, s1.typeVariantVersion, 'section1Vehicle.typeVariantVersion');
    drawField(page, (v.nationalGenre || 'VP').toUpperCase(), s1.nationalGenre, 'section1Vehicle.nationalGenre');
    drawField(page, v.commercialDesignation.toUpperCase(), s1.commercialDesignation, 'section1Vehicle.commercialDesignation');

    const mileageNum = v.mileage === '' ? 0 : Number(v.mileage);
    drawField(page, `${mileageNum.toLocaleString('fr-FR')} km`, s1.mileage, 'section1Vehicle.mileage');

    drawCheck(page, s1.certificate.checkboxYes, 'section1Vehicle.certificate.checkboxYes', v.hasRegistrationCertificate === true);
    drawCheck(page, s1.certificate.checkboxNo, 'section1Vehicle.certificate.checkboxNo', v.hasRegistrationCertificate === false);

    if (v.hasRegistrationCertificate === true) {
      const cleanFormula = v.formulaNumber.replace(/\s+/g, '').toUpperCase();
      const suffix = cleanFormula.startsWith('20') ? cleanFormula.slice(2) : cleanFormula;
      drawComb(page, suffix, s1.certificate.formulaNumber, 'section1Vehicle.certificate.formulaNumber');
      drawComb(page, certDateDigits.dd, s1.certificate.certificateDate.dd, 'section1Vehicle.certificate.certificateDate.dd');
      drawComb(page, certDateDigits.mm, s1.certificate.certificateDate.mm, 'section1Vehicle.certificate.certificateDate.mm');
      drawComb(page, certDateDigits.yyyy, s1.certificate.certificateDate.yyyy, 'section1Vehicle.certificate.certificateDate.yyyy');
    } else {
      const line1Len = s1.certificate.absenceReasonLine1.maxChars ?? 48;
      drawField(page, v.absenceReason, s1.certificate.absenceReasonLine1, 'section1Vehicle.certificate.absenceReasonLine1');
      if (v.absenceReason.length > line1Len) {
        drawField(page, v.absenceReason.slice(line1Len), s1.certificate.absenceReasonLine2, 'section1Vehicle.certificate.absenceReasonLine2');
      }
    }

    // ==========================================
    // 2. ANCIEN PROPRIÉTAIRE (CÉDANT)
    // ==========================================
    drawCheck(page, s2.checkboxes.personnePhysique, 'section2Seller.checkboxes.personnePhysique', s.entityType === 'physique');
    drawCheck(page, s2.checkboxes.sexM, 'section2Seller.checkboxes.sexM', s.entityType === 'physique' && s.sex === 'M');
    drawCheck(page, s2.checkboxes.sexF, 'section2Seller.checkboxes.sexF', s.entityType === 'physique' && s.sex === 'F');
    drawCheck(page, s2.checkboxes.personneMorale, 'section2Seller.checkboxes.personneMorale', s.entityType !== 'physique');

    drawField(page, s.nameOrCompany, s2.nameOrCompany, 'section2Seller.nameOrCompany');
    drawComb(
      page,
      s.entityType === 'morale' ? s.siret.replace(/\s+/g, '') : '',
      s2.siret,
      'section2Seller.siret'
    );

    drawField(page, s.streetNumber, s2.address.streetNumber, 'section2Seller.address.streetNumber');
    drawField(page, s.streetExtension, s2.address.streetExtension, 'section2Seller.address.streetExtension');
    drawField(page, sellerFullStreet, s2.address.streetFull, 'section2Seller.address.streetFull');
    drawComb(page, s.postalCode.replace(/\s+/g, ''), s2.address.postalCode, 'section2Seller.address.postalCode');
    drawField(page, s.city.toUpperCase(), s2.address.city, 'section2Seller.address.city');

    drawCheck(page, s2.checkboxes.certifyDestruction, 'section2Seller.checkboxes.certifyDestruction', s.saleType === 'destruction');
    drawCheck(page, s2.checkboxes.certifyCeder, 'section2Seller.checkboxes.certifyCeder', s.saleType !== 'destruction');

    drawComb(page, saleDateDigits.dd, s2.saleDateTime.dd, 'section2Seller.saleDateTime.dd');
    drawComb(page, saleDateDigits.mm, s2.saleDateTime.mm, 'section2Seller.saleDateTime.mm');
    drawComb(page, saleDateDigits.yyyy, s2.saleDateTime.yyyy, 'section2Seller.saleDateTime.yyyy');
    drawComb(page, saleHours.padStart(2, '0'), s2.saleDateTime.hours, 'section2Seller.saleDateTime.hours');
    drawComb(page, saleMinutes.padStart(2, '0'), s2.saleDateTime.minutes, 'section2Seller.saleDateTime.minutes');

    drawCheck(page, s2.checkboxes.certifyAdminSituation, 'section2Seller.checkboxes.certifyAdminSituation', s.certifyAdminSituation);
    drawCheck(page, s2.checkboxes.certifyNoTransformation, 'section2Seller.checkboxes.certifyNoTransformation', s.certifyNoTransformation);
    drawCheck(page, s2.checkboxes.certifyVhuDestruction, 'section2Seller.checkboxes.certifyVhuDestruction', s.certifyVhuDestruction);
    if (s.certifyVhuDestruction && s.vhuAgreementNumber.trim()) {
      drawField(page, s.vhuAgreementNumber, s2.vhuAgreementNumber, 'section2Seller.vhuAgreementNumber');
    }

    drawField(page, s.signingCity.toUpperCase(), s2.signatures.faitA, 'section2Seller.signatures.faitA');
    drawField(page, sellerSigningDateFr, s2.signatures.faitLe, 'section2Seller.signatures.faitLe');

    // ==========================================
    // 3. NOUVEAU PROPRIÉTAIRE (ACQUÉREUR)
    // ==========================================
    drawCheck(page, s3.checkboxes.personneMorale, 'section3Buyer.checkboxes.personneMorale', b.entityType === 'morale');
    drawCheck(page, s3.checkboxes.personnePhysique, 'section3Buyer.checkboxes.personnePhysique', b.entityType !== 'morale');
    drawCheck(page, s3.checkboxes.sexM, 'section3Buyer.checkboxes.sexM', b.entityType !== 'morale' && b.sex === 'M');
    drawCheck(page, s3.checkboxes.sexF, 'section3Buyer.checkboxes.sexF', b.entityType !== 'morale' && b.sex === 'F');

    drawField(page, b.nameOrCompany, s3.nameOrCompany, 'section3Buyer.nameOrCompany');
    drawComb(
      page,
      b.entityType === 'morale' ? b.siret.replace(/\s+/g, '') : '',
      s3.siret,
      'section3Buyer.siret'
    );

    drawComb(page, buyerBirthDigits.dd, s3.birth.dd, 'section3Buyer.birth.dd');
    drawComb(page, buyerBirthDigits.mm, s3.birth.mm, 'section3Buyer.birth.mm');
    drawComb(page, buyerBirthDigits.yyyy, s3.birth.yyyy, 'section3Buyer.birth.yyyy');
    drawField(page, b.birthPlace, s3.birth.place, 'section3Buyer.birth.place');

    drawField(page, b.streetNumber, s3.address.streetNumber, 'section3Buyer.address.streetNumber');
    drawField(page, b.streetExtension, s3.address.streetExtension, 'section3Buyer.address.streetExtension');
    drawField(page, buyerFullStreet, s3.address.streetFull, 'section3Buyer.address.streetFull');
    drawComb(page, b.postalCode.replace(/\s+/g, ''), s3.address.postalCode, 'section3Buyer.address.postalCode');
    drawField(page, b.city.toUpperCase(), s3.address.city, 'section3Buyer.address.city');

    drawCheck(page, s3.checkboxes.certifyAcquire, 'section3Buyer.checkboxes.certifyAcquire', b.certifyAcquire);
    drawCheck(page, s3.checkboxes.certifyInformedAdmin, 'section3Buyer.checkboxes.certifyInformedAdmin', b.certifyInformedAdmin);

    drawField(page, (b.signingCity || b.city).toUpperCase(), s3.signatures.faitA, 'section3Buyer.signatures.faitA');
    drawField(page, buyerSigningDateFr, s3.signatures.faitLe, 'section3Buyer.signatures.faitLe');

    // ==========================================
    // FOOTER CHECKBOXES
    // ==========================================
    drawCheck(page, footerCb.opposeProspecting, 'checkboxes.opposeProspecting', s.opposeProspecting || b.opposeProspecting);
  });

  return pdfDoc.save();
}

/**
 * Generates an A4 calibration preview PDF for Cerfa 13750*07 or Déclaration d'Achat
 * using 100% deterministic French dummy/test values and bright amber/red highlight on the selected field.
 */
export async function buildCerfaTemplatePreviewPdfBytes(params: {
  templateKey: 'cerfa_13750_07' | 'declaration_achat';
  fields: Record<string, CerfaCalibrationFieldEntry>;
  offsets: CerfaTemplateOffsetConfig;
  highlightedFieldKey?: string | null;
}): Promise<Uint8Array> {
  const { templateKey, fields, offsets, highlightedFieldKey } = params;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const gridColor = rgb(0.92, 0.94, 0.97);
  const headerBg = rgb(0.1, 0.16, 0.28);
  const borderColor = rgb(0.75, 0.8, 0.88);
  const labelColor = rgb(0.42, 0.48, 0.56);
  const inkColor = rgb(0.08, 0.08, 0.1);
  const highlightTextColor = rgb(0.88, 0.12, 0.04);
  const highlightFillColor = rgb(0.96, 0.62, 0.04);
  const highlightBorderColor = rgb(0.92, 0.18, 0.05);

  // Subtle calibration grid every 50pt
  for (let gx = 50; gx < 595; gx += 50) {
    page.drawLine({
      start: { x: gx, y: 20 },
      end: { x: gx, y: 760 },
      thickness: 0.4,
      color: gridColor,
    });
    page.drawText(`${gx}`, { x: gx + 2, y: 22, size: 6, font, color: labelColor });
  }
  for (let gy = 50; gy < 760; gy += 50) {
    page.drawLine({
      start: { x: 20, y: gy },
      end: { x: 575, y: gy },
      thickness: 0.4,
      color: gridColor,
    });
    page.drawText(`${gy}`, { x: 22, y: gy + 2, size: 6, font, color: labelColor });
  }

  // Header Banner
  page.drawRectangle({
    x: 24,
    y: 778,
    width: 547.28,
    height: 42,
    color: headerBg,
  });

  const is13750 = templateKey === 'cerfa_13750_07';
  const titleText = is13750
    ? "CERFA N° 13750*07 — DEMANDE DE CERTIFICAT D'IMMATRICULATION"
    : "CERFA N° 13751*02 — DÉCLARATION D'ACHAT D'UN VÉHICULE D'OCCASION";
  page.drawText(sanitizeWinAnsi(titleText), {
    x: 36,
    y: 801,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    sanitizeWinAnsi('MODE CALIBRATION SUPERADMIN — DONNÉES DE TEST COMPLÈTES (A4 595 × 842 pt)'),
    {
      x: 36,
      y: 786,
      size: 7.5,
      font,
      color: rgb(0.96, 0.72, 0.25),
    }
  );

  // Section frames
  const sectionBoxes = is13750
    ? [
        { title: '1. VÉHICULE (DONNÉES CARTE GRISE)', y: 598, h: 162 },
        { title: '2. TITULAIRE / NOUVEAU PROPRIÉTAIRE', y: 445, h: 147 },
        { title: '3. SIGNATURE & CERTIFICATION', y: 120, h: 70 },
      ]
    : [
        { title: '1. VÉHICULE CÉDÉ', y: 598, h: 162 },
        { title: '2. ANCIEN PROPRIÉTAIRE (VENDEUR)', y: 525, h: 66 },
        { title: '3. PROFESSIONNEL ACQUÉREUR (GARAGE)', y: 370, h: 145 },
        { title: '4. DATE D’ACHAT & SIGNATURE', y: 120, h: 235 },
      ];

  for (const box of sectionBoxes) {
    page.drawRectangle({
      x: 28,
      y: box.y,
      width: 539,
      height: box.h,
      borderColor,
      borderWidth: 0.8,
    });
    page.drawText(sanitizeWinAnsi(box.title), {
      x: 36,
      y: box.y + box.h - 12,
      size: 7.5,
      font: fontBold,
      color: labelColor,
    });
  }

  // Render every calibrated field with dummy value
  for (const [key, entry] of Object.entries(fields)) {
    const x = Math.round((entry.x + offsets.offsetX) * 100) / 100;
    const y = Math.round((entry.y + offsets.offsetY) * 100) / 100;
    const size = Math.max(4, Math.round((entry.size + offsets.fontSizeDelta) * 100) / 100);
    const dummyValue = sanitizeWinAnsi(CALIBRATION_DUMMY_TEMPLATE_VALUES[key] || 'TEST');
    const isHighlighted = Boolean(highlightedFieldKey && highlightedFieldKey === key);

    // Subtle field label above the value
    page.drawText(sanitizeWinAnsi(entry.label), {
      x,
      y: y + size + 3.5,
      size: 6,
      font,
      color: isHighlighted ? highlightTextColor : labelColor,
    });

    if (isHighlighted) {
      const boxWidth =
        typeof entry.stepX === 'number'
          ? Math.max(28, (dummyValue.length - 1) * entry.stepX + size * 0.78 + 6)
          : Math.max(36, fontBold.widthOfTextAtSize(dummyValue, size) + 6);
      page.drawRectangle({
        x: x - 3,
        y: y - 3,
        width: boxWidth,
        height: size + 6,
        color: highlightFillColor,
        opacity: 0.25,
        borderColor: highlightBorderColor,
        borderWidth: 1.2,
        borderOpacity: 0.95,
      });
    }

    if (typeof entry.stepX === 'number') {
      const step = entry.stepX;
      for (let i = 0; i < dummyValue.length; i++) {
        const ch = dummyValue[i];
        if (ch && ch !== ' ') {
          page.drawText(ch, {
            x: x + i * step,
            y,
            size,
            font: fontBold,
            color: isHighlighted ? highlightTextColor : inkColor,
          });
        }
      }
    } else {
      page.drawText(dummyValue, {
        x,
        y,
        size,
        font: fontBold,
        color: isHighlighted ? highlightTextColor : inkColor,
      });
    }
  }

  return pdfDoc.save();
}

/**
 * Generates an officially compliant Cerfa N° 15776*02 PDF by injecting form data
 * directly onto the official French government PDF template (2 pages: Exemplaire 1 & 2).
 */
export async function generateCerfa15776FromFormData(
  formData: Cerfa15776FormData,
  action: 'download' | 'print' = 'download',
  customConfig?: Cerfa15776Config,
  options?: CerfaPdfRenderOptions
): Promise<void> {
  const { vehicle: v } = formData;
  const cleanVin = sanitizeWinAnsi(v.vin).replace(/[^a-zA-Z0-9]/g, '');
  const cleanMake = sanitizeWinAnsi(v.make).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Cerfa_15776_02_${cleanMake || 'Vehicule'}_${cleanVin || 'auto'}.pdf`;

  const modifiedBytes = await buildCerfa15776PdfBytes(formData, customConfig, options);
  const blob = new Blob([new Uint8Array(modifiedBytes)], { type: 'application/pdf' });

  if (action === 'print') {
    printPDFBlob(blob);
  } else {
    downloadBlob(blob, fileName);
  }
}

export async function generateOfficialCerfa15776PDF(
  vehicle: Vehicle,
  garageSettings: GarageSettings = DEFAULT_GARAGE_SETTINGS,
  action: 'download' | 'print' = 'download'
): Promise<void> {
  const initialData = buildInitialCerfaData(vehicle, garageSettings);
  return generateCerfa15776FromFormData(initialData, action);
}

export const generateCertificatCessionPDF = generateOfficialCerfa15776PDF;

/**
 * High-fidelity fallback Cerfa generator if PDF template loading fails
 */
function generateFallbackCerfaPDF(
  vehicle: Vehicle,
  garageSettings: GarageSettings,
  action: 'download' | 'print'
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const buyer = vehicle.buyerInfo || {
    fullName: 'Acheteur',
    phone: '',
    email: '',
    address: 'France',
    salePrice: vehicle.targetSalePrice,
    saleDate: new Date().toISOString().split('T')[0],
  };

  // Blue header
  doc.setFillColor(30, 58, 138); // blue-900
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CERTIFICAT DE CESSION D’UN VÉHICULE D’OCCASION', 14, 16);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Formulaire officiel Cerfa N° 15776*02 - Articles R322-4 et R322-9 du code de la route', 14, 23);

  // Section 1
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1. LE VÉHICULE (à remplir par l’ancien propriétaire)', 14, 38);

  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 42, 182, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`(A) Numéro d’immatriculation : ${vehicle.vin}`, 18, 50);
  doc.text(`(E) Numéro d’identification (VIN) : ${vehicle.vin}`, 18, 58);
  doc.text(`(D.1) Marque : ${vehicle.make.toUpperCase()}`, 18, 66);
  doc.text(`(D.3) Dénomination : ${vehicle.model} - ${vehicle.trim || ''}`, 18, 74);
  doc.text(`(B) 1ère immatriculation : 01/01/${vehicle.year}`, 115, 50);
  doc.text(`(J.1) Genre national : VP`, 115, 58);
  doc.text(`Kilométrage inscrit au compteur : ${vehicle.mileage.toLocaleString('fr-FR')} km`, 115, 66);
  doc.text(`Certificat d’immatriculation présent : OUI [X]`, 115, 74);

  // Section 2
  doc.setFont('helvetica', 'bold');
  doc.text('2. ANCIEN PROPRIÉTAIRE (CÉDANT)', 14, 92);
  doc.rect(14, 96, 182, 38);
  doc.setFont('helvetica', 'normal');
  doc.text(`[X] Personne morale — Raison sociale : ${garageSettings.name}`, 18, 103);
  doc.text(`N° SIRET : ${garageSettings.siret}`, 18, 110);
  const legacySellerStreet = [garageSettings.streetNumber, garageSettings.streetExtension, garageSettings.streetType, garageSettings.streetName].filter(Boolean).join(' ');
  doc.text(`Adresse : ${legacySellerStreet}, ${garageSettings.postalCode} ${garageSettings.city}`, 18, 117);
  doc.text(`Certifie céder le véhicule le : ${buyer.saleDate} à ${buyer.saleTime || '14:00'}`, 18, 124);
  doc.text(`Fait à ${garageSettings.city}, le ${buyer.saleDate}`, 18, 131);

  // Section 3
  doc.setFont('helvetica', 'bold');
  doc.text('3. NOUVEAU PROPRIÉTAIRE (ACQUÉREUR)', 14, 144);
  doc.rect(14, 148, 182, 46);
  doc.setFont('helvetica', 'normal');
  doc.text(`[X] ${buyer.isCompany ? 'Personne morale' : 'Personne physique'} — Nom / Raison sociale : ${buyer.fullName}`, 18, 156);
  if (buyer.birthDate) {
    doc.text(`Né(e) le : ${buyer.birthDate}${buyer.birthPlace ? ' à ' + buyer.birthPlace : ''}`, 18, 163);
  }
  doc.text(`Adresse de domicile : ${buyer.address}`, 18, 170, { maxWidth: 174 });
  doc.text(`Contact : Tél : ${buyer.phone}  |  Email : ${buyer.email}`, 18, 178);
  doc.text(`Certifie acquérir le véhicule désigné ci-dessus aux dates et heures indiquées.`, 18, 186);

  // Signatures
  doc.setFont('helvetica', 'bold');
  doc.text('Signature de l’ancien propriétaire (Garage) :', 20, 206);
  doc.text('Signature du nouveau propriétaire :', 115, 206);
  doc.rect(20, 210, 75, 34);
  doc.rect(115, 210, 75, 34);

  const cleanVin = vehicle.vin.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `Cerfa_15776_Cession_${vehicle.make}_${vehicle.model}_${cleanVin || 'auto'}.pdf`;

  if (action === 'print') {
    const blob = doc.output('blob');
    printPDFBlob(blob);
  } else {
    doc.save(fileName);
  }
}

/**
 * 3. Generates internal Vehicle Financial Report & Ledger PDF
 */
export function generateVehicleFinancialReportPDF(
  vehicle: Vehicle,
  repairs: RepairTask[],
  expenses: GeneralExpense[],
  garageSettings: GarageSettings = DEFAULT_GARAGE_SETTINGS
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Top bar
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BILAN FINANCIER & DOSSIER VÉHICULE (P&L)', 14, 17);

  // Vehicle summary
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(`${vehicle.make} ${vehicle.model} ${vehicle.trim || ''} (${vehicle.year})`, 14, 38);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`VIN / Immat : ${vehicle.vin} | ${vehicle.mileage.toLocaleString()} km | Achat : ${vehicle.purchaseDate}`, 14, 45);

  // Metrics Grid
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 52, 182, 30, 2, 2, 'F');

  doc.setFontSize(9);
  doc.text('PRIX D’ACHAT', 22, 60);
  doc.text('TOTAL TRAVAUX', 65, 60);
  doc.text('TOTAL FRAIS DIVERS', 108, 60);
  doc.text('CAPITAL TOTAL INVESTI', 148, 60);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatEuro(vehicle.purchasePrice), 22, 70);
  doc.text(formatEuro(vehicle.repairCostTotal), 65, 70);
  doc.text(formatEuro(vehicle.generalExpensesTotal), 108, 70);
  doc.text(formatEuro(vehicle.totalInvested), 148, 70);

  // Outcome & Separated French Fiscal Summary
  const isSold = vehicle.status === 'sold' && vehicle.buyerInfo;
  const outcomePrice = isSold ? vehicle.buyerInfo!.salePrice : vehicle.targetSalePrice;
  const dealProfile = resolveDealSellerProfileType(vehicle, garageSettings);
  const dealEffectiveSettings = resolveEffectiveSettingsForDeal({
    vehicle,
    garageSettings,
  });
  const isParticulierSettings = dealProfile === 'particulier';
  const normalizedTaxConfig = normalizeFrenchTaxConfig(dealEffectiveSettings);
  const existingSnap = vehicle.buyerInfo?.taxSnapshot;
  const snapMatchesDeal =
    Boolean(existingSnap?.isHistoricalSnapshot) &&
    (!vehicle.buyerInfo?.sellerProfileType ||
      (isParticulierSettings
        ? existingSnap?.taxRegime === 'none' || existingSnap?.legalStatus === 'particulier'
        : existingSnap?.taxRegime === 'micro' || existingSnap?.legalStatus === 'micro_entreprise'));

  const rawSaleReport = calculateSaleTaxReport({
    salePrice: outcomePrice,
    purchasePrice: vehicle.purchasePrice,
    repairCostTotal: vehicle.repairCostTotal,
    generalExpensesTotal: vehicle.generalExpensesTotal,
    taxRegime: isParticulierSettings ? 'none' : dealEffectiveSettings.taxRegime,
    taxRatePercent: isParticulierSettings ? 0 : dealEffectiveSettings.taxRatePercent,
    frenchTaxConfig: normalizedTaxConfig,
    vatRegime: vehicle.buyerInfo?.vatRegime,
    vatRatePercent: vehicle.buyerInfo?.vatRatePercent,
    taxSnapshot: isSold && !isParticulierSettings && snapMatchesDeal ? existingSnap : undefined,
  });

  const isParticulierReport = isParticulierSettings || rawSaleReport.taxRegime === 'none';
  const saleReport = isParticulierReport
    ? {
        ...rawSaleReport,
        taxRegime: 'none' as const,
        taxAmount: 0,
        urssafAmount: 0,
        versementLiberatoireEnabled: false,
        versementLiberatoireAmount: 0,
        microBicEstimatedTax: 0,
        vatAmount: 0,
        netProfitAfterTax: rawSaleReport.grossMargin,
      }
    : rawSaleReport;
  const computedTotalInvested =
    Math.round(
      ((Number(vehicle.purchasePrice) || 0) +
        (Number(vehicle.repairCostTotal) || 0) +
        (Number(vehicle.generalExpensesTotal) || 0) +
        Number.EPSILON) *
        100
    ) / 100;
  const outcomeProfit = saleReport.netProfitAfterTax;
  const outcomeMargin = outcomePrice > 0 ? (outcomeProfit / outcomePrice) * 100 : 0;
  const roi = computedTotalInvested > 0 ? (outcomeProfit / computedTotalInvested) * 100 : 0;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 86, 182, 36, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(isSold ? 'PRIX DE VENTE FINAL' : 'PRIX DE VENTE VISÉ', 20, 93);
  doc.text(isParticulierReport ? 'RÉSULTAT NET' : 'BÉNÉFICE NET', 72, 93);
  doc.text(saleReport.vatAmount > 0 ? 'TVA / RÉGIME' : 'RÉGIME FISCAL', 124, 93);
  doc.text('RENTABILITÉ (ROI)', 166, 93);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatEuro(outcomePrice), 20, 101);
  doc.setTextColor(outcomeProfit >= 0 ? 16 : 220, outcomeProfit >= 0 ? 185 : 38, outcomeProfit >= 0 ? 129 : 38);
  doc.text(`${outcomeProfit >= 0 ? '+' : ''}${formatEuro(outcomeProfit)} (${outcomeMargin.toFixed(1)}%)`, 72, 101);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(
    saleReport.vatAmount > 0
      ? `${formatEuro(saleReport.vatAmount)}`
      : saleReport.taxRegime === 'micro'
      ? 'Franchise 0%'
      : 'Particulier',
    124,
    101
  );
  doc.text(`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, 166, 101);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  if (isParticulierReport) {
    doc.text(
      `Profil Particulier — Vente privée sans fiscalité professionnelle (0 € de cotisations / TVA) | Résultat net : ${formatEuro(saleReport.netProfitAfterTax)}`,
      20,
      111,
      { maxWidth: 172 }
    );
  } else {
    const taxDetailLine =
      saleReport.taxRegime === 'micro'
        ? `Marge brute : ${formatEuro(saleReport.grossMargin)} | URSSAF : ${formatEuro(saleReport.urssafAmount)} | VL : ${formatEuro(saleReport.versementLiberatoireAmount)} | Net après cotisations : ${formatEuro(saleReport.netProfitAfterTax)}`
        : saleReport.corporateIsContextNote
        ? `${saleReport.corporateIsContextNote}`
        : `Impôt estimé : ${formatEuro(saleReport.taxAmount)} | Net estimé : ${formatEuro(saleReport.netProfitAfterTax)}`;
    doc.text(`Fiscalité (${saleReport.taxLabel}) : ${taxDetailLine}`, 20, 111, { maxWidth: 172 });
    doc.setFontSize(7);
    doc.text(FRENCH_TAX_DEFAULTS.DISCLAIMER_FR, 20, 118, { maxWidth: 172 });
  }

  // Breakdown tables
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`RÉCAPITULATIF DES RÉPARATIONS (${repairs.length} tâches)`, 14, 131);

  let curY = 137;
  doc.setFillColor(15, 23, 42);
  doc.rect(14, curY, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('INTITULÉ DE LA TÂCHE', 18, curY + 5);
  doc.text('STATUT', 100, curY + 5);
  doc.text('PIÈCES (€)', 130, curY + 5);
  doc.text('M.O (€)', 155, curY + 5);
  doc.text('TOTAL (€)', 175, curY + 5);
  curY += 7;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  if (repairs.length === 0) {
    doc.text('Aucune tâche de réparation enregistrée.', 18, curY + 6);
    curY += 10;
  } else {
    repairs.forEach((r, idx) => {
      if (curY > 265) {
        doc.addPage();
        curY = 20;
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, curY, 182, 6.5, 'F');
      }
      doc.text(r.title.slice(0, 45), 18, curY + 4.5);
      doc.text(r.status === 'done' ? 'Fait' : r.status === 'in_progress' ? 'En cours' : 'À faire', 100, curY + 4.5);
      doc.text(formatEuro(r.partsCost), 130, curY + 4.5);
      doc.text(formatEuro(r.laborCost), 155, curY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.text(formatEuro(r.totalCost), 175, curY + 4.5);
      doc.setFont('helvetica', 'normal');
      curY += 6.5;
    });
  }

  // General Expenses breakdown
  curY += 6;
  if (curY > 240) {
    doc.addPage();
    curY = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FRAIS GÉNÉRAUX & DÉPENSES ANNEXES (${expenses.length} frais)`, 14, curY);
  curY += 6;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, curY, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('CATÉGORIE', 18, curY + 5);
  doc.text('DESCRIPTION', 60, curY + 5);
  doc.text('DATE', 140, curY + 5);
  doc.text('MONTANT (€)', 170, curY + 5);
  curY += 7;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  if (expenses.length === 0) {
    doc.text('Aucun frais annexe enregistré.', 18, curY + 6);
    curY += 10;
  } else {
    expenses.forEach((e, idx) => {
      if (curY > 265) {
        doc.addPage();
        curY = 20;
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, curY, 182, 6.5, 'F');
      }
      doc.text(e.category, 18, curY + 4.5);
      doc.text(e.description.slice(0, 40), 60, curY + 4.5);
      doc.text(e.date, 140, curY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.text(formatEuro(e.amount), 170, curY + 4.5);
      doc.setFont('helvetica', 'normal');
      curY += 6.5;
    });
  }

  doc.save(`Bilan_Financier_${vehicle.make}_${vehicle.model}.pdf`);
}

/**
 * 4. Generates Full Dealership P&L & Cash Flow PDF Report
 * Strictly separates Revenue, Gross Profit, Tax, and Net Profit.
 */
export function generateDealershipFinancialReportPDF(params: {
  analytics: DealershipAnalyticsReport;
  vehicles: Vehicle[];
  garageSettings: GarageSettings;
  periodLabel: string;
}): void {
  const { analytics, vehicles, garageSettings, periodLabel } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Top Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('RAPPORT FINANCIER & P&L CONCESSION', 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${garageSettings.name} (SIRET ${garageSettings.siret || '-'})  |  Période : ${periodLabel}  |  Édité le ${new Date().toISOString().slice(0, 10)}`,
    14,
    23
  );

  // Stock & Capital Block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. VALEUR DU STOCK & CAPITAL IMMOBILISÉ', 14, 40);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 44, 182, 24, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Valeur du stock (cible)', 20, 52);
  doc.text('Capital investi en stock', 82, 52);
  doc.text('Profit potentiel stock', 144, 52);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(formatEuro(analytics.inventory.totalStockValue), 20, 61);
  doc.text(formatEuro(analytics.inventory.totalInvestedInStock), 82, 61);
  doc.setTextColor(16, 185, 129);
  doc.text(formatEuro(analytics.inventory.totalPotentialProfit), 144, 61);

  // Separated P&L Block: Revenue / Gross Profit / Net Profit
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('2. COMPTE DE RÉSULTAT (REVENUE / GROSS PROFIT / NET PROFIT)', 14, 78);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 82, 182, 34, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 82, 182, 34, 2, 2);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('1. Chiffre d’affaires (Revenue)', 20, 90);
  doc.text('2. Marge brute (Gross Profit)', 78, 90);
  doc.text(`Impôts (${analytics.salesPerformance.taxLabel})`, 132, 90);
  doc.text('3. Bénéfice net (Net Profit)', 20, 104);
  doc.text('Marge moyenne / véhicule', 78, 104);
  doc.text('Délai moyen de vente', 132, 104);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatEuro(analytics.salesPerformance.revenue), 20, 97);
  doc.text(formatEuro(analytics.salesPerformance.grossProfit), 78, 97);
  doc.setTextColor(217, 119, 6);
  doc.text(formatEuro(analytics.salesPerformance.taxAmount), 132, 97);

  doc.setTextColor(
    analytics.salesPerformance.netProfit >= 0 ? 16 : 220,
    analytics.salesPerformance.netProfit >= 0 ? 185 : 38,
    analytics.salesPerformance.netProfit >= 0 ? 129 : 38
  );
  doc.text(formatEuro(analytics.salesPerformance.netProfit), 20, 111);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${formatEuro(analytics.salesPerformance.averageNetMarginEuro)} (${analytics.salesPerformance.netMarginPercent.toFixed(1)}%)`,
    78,
    111
  );
  doc.text(
    analytics.salesPerformance.averageDaysToSell !== null
      ? `${analytics.salesPerformance.averageDaysToSell.toFixed(0)} j`
      : '—',
    132,
    111
  );

  const hasAnyDealTaxes =
    analytics.salesPerformance.taxAmount > 0 ||
    analytics.salesPerformance.urssafAmount > 0 ||
    analytics.salesPerformance.corporateIsAmount > 0;
  const isParticulierDealership =
    !hasAnyDealTaxes &&
    (garageSettings.profileType === 'particulier' ||
      garageSettings.legalStatus === 'particulier' ||
      garageSettings.taxRegime === 'none');

  // Cash Flow Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isParticulierDealership
      ? '3. SYNTHÈSE TRÉSORERIE (PROFIL PARTICULIER)'
      : '3. DÉTAIL FISCAL SÉPARÉ & TRÉSORERIE (TVA / URSSAF / IS)',
    14,
    125
  );

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 128, 182, 14, 2, 2, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  if (isParticulierDealership) {
    doc.text(
      'Profil Particulier — Ventes privées sans fiscalité professionnelle (0 € URSSAF / 0 € TVA). Résultat net égal à la marge nette.',
      18,
      136,
      { maxWidth: 174 }
    );
  } else {
    doc.text(
      `TVA estimée : ${formatEuro(analytics.salesPerformance.vatAmount)}  |  URSSAF Micro : ${formatEuro(analytics.salesPerformance.urssafAmount)}  |  VL : ${formatEuro(analytics.salesPerformance.versementLiberatoireAmount)}  |  IR Micro-BIC sép. : ${formatEuro(analytics.salesPerformance.microBicEstimatedIrAmount)}  |  IS Société : ${formatEuro(analytics.salesPerformance.corporateIsAmount)}`,
      18,
      134,
      { maxWidth: 174 }
    );
    doc.setFontSize(6.8);
    doc.text(FRENCH_TAX_DEFAULTS.DISCLAIMER_FR, 18, 139.5, { maxWidth: 174 });
  }

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 145, 182, 22, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Entrées (Encaissements ventes)', 20, 153);
  doc.text('Sorties (Achats, Travaux, Frais, Taxes)', 82, 153);
  doc.text('Flux net de trésorerie', 148, 153);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(formatEuro(analytics.cashFlow.inflow), 20, 161);
  doc.setTextColor(220, 38, 38);
  doc.text(formatEuro(analytics.cashFlow.outflow), 82, 161);
  doc.setTextColor(
    analytics.cashFlow.netCashFlow >= 0 ? 16 : 220,
    analytics.cashFlow.netCashFlow >= 0 ? 185 : 38,
    analytics.cashFlow.netCashFlow >= 0 ? 129 : 38
  );
  doc.text(formatEuro(analytics.cashFlow.netCashFlow), 148, 161);

  // Fleet Ledger Table
  const ledger = buildFinancialLedgerRows(vehicles, garageSettings);
  let curY = 176;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`4. DÉTAIL PAR VÉHICULE (${ledger.length})`, 14, curY);
  curY += 5;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, curY, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('VÉHICULE', 17, curY + 4.8);
  doc.text('STATUT', 78, curY + 4.8);
  doc.text('INVESTI', 102, curY + 4.8);
  doc.text('REVENUE', 128, curY + 4.8);
  doc.text('BRUT', 154, curY + 4.8);
  doc.text('NET', 176, curY + 4.8);
  curY += 7;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  if (ledger.length === 0) {
    doc.text('Aucun véhicule enregistré.', 17, curY + 6);
  } else {
    ledger.forEach((row, idx) => {
      if (curY > 272) {
        doc.addPage();
        curY = 20;
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, curY, 182, 6.5, 'F');
      }
      doc.setFontSize(7.5);
      doc.text(row.Vehicule.slice(0, 32), 17, curY + 4.5);
      doc.text(row.Statut, 78, curY + 4.5);
      doc.text(formatEuro(row.TotalInvesti), 102, curY + 4.5);
      doc.text(row.ChiffreAffaires > 0 ? formatEuro(row.ChiffreAffaires) : '—', 128, curY + 4.5);
      doc.text(row.ChiffreAffaires > 0 ? formatEuro(row.MargeBrute) : '—', 154, curY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.text(row.ChiffreAffaires > 0 ? formatEuro(row.BeneficeNet) : '—', 176, curY + 4.5);
      doc.setFont('helvetica', 'normal');
      curY += 6.5;
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Rapport_Financier_AutoGarage_${stamp}.pdf`);
}

/**
 * 5. Generates a Factur-X Hybrid PDF/A-3-style Invoice with embedded factur-x.xml (EN 16931 CII)
 */
export async function generateFacturXHybridPdf(params: {
  vehicle: Vehicle;
  garageSettings: GarageSettings;
  paymentMeansCode?: '30' | '48' | '10' | '20';
  vatMode?: VatRegime | 'margin' | 'standard_20';
  vatRatePercent?: number;
}): Promise<{ fileName: string; invoiceNumber: string; xml: string }> {
  const { vehicle, garageSettings, paymentMeansCode = '30', vatMode, vatRatePercent } = params;
  const dealProfile = resolveDealSellerProfileType(vehicle, garageSettings);
  const dealSettings = {
    ...garageSettings,
    ...resolveEffectiveSettingsForDeal({ vehicle, garageSettings }),
  };
  const isParticulierDeal = dealProfile === 'particulier';
  const isCorporateVatSeller =
    !vehicle.buyerInfo?.sellerProfileType &&
    (dealSettings.taxRegime === 'sarl' ||
      dealSettings.taxRegime === 'sas' ||
      dealSettings.taxRegime === 'custom');
  const resolvedVatRegime: VatRegime = (() => {
    if (isParticulierDeal || vehicle.buyerInfo?.sellerProfileType === 'micro_entrepreneur') {
      return (vatMode === 'margin' ? 'tva_marge' : vatMode === 'standard_20' ? 'tva_total' : vatMode) || 'franchise_base';
    }
    const raw = isCorporateVatSeller
      ? vatMode ||
        vehicle.buyerInfo?.vatRegime ||
        vehicle.buyerInfo?.taxSnapshot?.vatRegime ||
        dealSettings.frenchTaxConfig?.vatRegime ||
        'tva_marge'
      : vatMode ||
        (vehicle.buyerInfo?.taxSnapshot?.isHistoricalSnapshot &&
        vehicle.buyerInfo.taxSnapshot.vatAmount > 0
          ? vehicle.buyerInfo.taxSnapshot.vatRegime
          : 'franchise_base');
    if (raw === 'margin') return 'tva_marge';
    if (raw === 'standard_20') return 'tva_total';
    return raw;
  })();
  const resolvedVatRate = isParticulierDeal || vehicle.buyerInfo?.sellerProfileType === 'micro_entrepreneur'
    ? vatRatePercent ?? 0
    : isCorporateVatSeller
    ? vatRatePercent ??
      vehicle.buyerInfo?.vatRatePercent ??
      vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ??
      dealSettings.frenchTaxConfig?.vatRatePercent ??
      20
    : vatRatePercent ??
      (resolvedVatRegime === 'franchise_base'
        ? 0
        : vehicle.buyerInfo?.taxSnapshot?.vatRatePercent ?? 0);

  const invoiceNumber = buildFacturXInvoiceNumber(vehicle);
  const xml = buildFacturXXml(vehicle, garageSettings, {
    invoiceNumber,
    paymentMeansCode,
    vatMode: resolvedVatRegime,
    vatRatePercent: resolvedVatRate,
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const buyer = vehicle.buyerInfo || {
    fullName: 'Client Particulier',
    phone: 'Non renseigné',
    email: 'Non renseigné',
    address: 'France',
    salePrice: vehicle.targetSalePrice,
    saleDate: new Date().toISOString().split('T')[0],
  };
  const sellerStreetPart = [
    garageSettings.streetNumber,
    garageSettings.streetExtension,
    garageSettings.streetType,
    garageSettings.streetName,
  ]
    .filter(Boolean)
    .join(' ');
  const sellerAddress = `${sellerStreetPart}, ${garageSettings.postalCode} ${garageSettings.city}`;
  const grossPrice = Number(buyer.salePrice) || Number(vehicle.targetSalePrice) || 0;
  const vatBreakdown = calculateFrenchVat({
    salePrice: grossPrice,
    purchasePrice: Number(vehicle.purchasePrice) || 0,
    vatRegime: resolvedVatRegime,
    vatRatePercent: resolvedVatRate,
  });
  const htAmount = vatBreakdown.htAmount;
  const vatAmount = vatBreakdown.vatAmount;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('FACTURE ÉLECTRONIQUE — FACTUR-X (EN 16931)', 14, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Facture N° ${invoiceNumber}  |  Date : ${buyer.saleDate}  |  XML factur-x.xml embarqué`,
    14,
    25
  );

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    isParticulierDeal
      ? 'VENDEUR (PARTICULIER)'
      : dealProfile === 'micro_entrepreneur'
      ? 'VENDEUR (MICRO-ENTREPRENEUR)'
      : 'VENDEUR (GARAGE)',
    14,
    42
  );
  doc.text('ACHETEUR (CLIENT)', 112, 42);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 46, 88, 36, 2, 2, 'F');
  doc.roundedRect(112, 46, 84, 36, 2, 2, 'F');

  const facturxSellerName =
    isParticulierDeal || garageSettings.entityType === 'physique'
      ? `${garageSettings.firstName || ''} ${garageSettings.lastName || ''}`.trim() || garageSettings.name
      : garageSettings.name;

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(facturxSellerName, 18, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    isParticulierDeal ? 'Vendeur particulier (vente privée)' : `SIRET : ${garageSettings.siret || '-'}`,
    18,
    58
  );
  doc.text(sellerAddress, 18, 64, { maxWidth: 80 });
  doc.text(`${garageSettings.phone} | ${garageSettings.email}`, 18, 75, { maxWidth: 80 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(buyer.fullName, 116, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (buyer.siret) doc.text(`SIRET : ${buyer.siret}`, 116, 58);
  doc.text(`Adresse : ${buyer.address}`, 116, 64, { maxWidth: 76 });
  doc.text(`${buyer.phone} | ${buyer.email}`, 116, 75, { maxWidth: 76 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DÉSIGNATION DU VÉHICULE & DÉCOMPTE FISCAL', 14, 94);

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 98, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('DÉSIGNATION', 18, 103.5);
  doc.text('RÉGIME TVA', 105, 103.5);
  doc.text('MONTANT TTC', 162, 103.5);

  doc.setFillColor(255, 255, 255);
  doc.rect(14, 106, 182, 18);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${vehicle.make} ${vehicle.model} ${vehicle.trim || ''} (${vehicle.year})`,
    18,
    113
  );
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `VIN : ${vehicle.vin}  |  Immat : ${vehicle.registrationNumber || 'N/A'}  |  ${vehicle.mileage.toLocaleString('fr-FR')} km`,
    18,
    119
  );
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(vatBreakdown.regimeShortLabel, 105, 116, { maxWidth: 50 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(formatEuro(grossPrice), 162, 116);

  doc.setFillColor(248, 250, 252);
  doc.rect(112, 130, 84, 24, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(112, 130, 84, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Base Hors Taxe :', 116, 137);
  doc.text('TVA applicable :', 116, 143);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL TTC À PAYER :', 116, 150);

  doc.setFont('helvetica', 'normal');
  doc.text(formatEuro(htAmount), 162, 137);
  doc.text(
    resolvedVatRegime === 'franchise_base'
      ? '0,00 € (Art. 293 B)'
      : resolvedVatRegime === 'tva_marge'
      ? `${formatEuro(vatAmount)} (Marge)`
      : formatEuro(vatAmount),
    162,
    143
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(formatEuro(grossPrice), 162, 150);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${vatBreakdown.legalMention} Document hybride Factur-X conforme au profil EN 16931 (UN/CEFACT CII D16B). Fichier factur-x.xml joint en pièce embarquée.`,
    14,
    170,
    { maxWidth: 182 }
  );

  // Embed factur-x.xml inside the PDF using pdf-lib
  const basePdfBytes = doc.output('arraybuffer');
  const pdfDoc = await PDFDocument.load(basePdfBytes);
  pdfDoc.setTitle(`Factur-X ${invoiceNumber}`);
  pdfDoc.setSubject('Facture électronique conforme Factur-X EN 16931');
  pdfDoc.setCreator('AutoGarage Manager');
  pdfDoc.setProducer('AutoGarage Manager (pdf-lib Factur-X)');

  const xmlBytes = new TextEncoder().encode(xml);
  await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
    mimeType: 'application/xml',
    description: 'Factur-X EN 16931 UN/CEFACT CII XML Invoice',
    creationDate: new Date(),
    modificationDate: new Date(),
  });

  const hybridBytes = await pdfDoc.save();
  const cleanMake = sanitizeWinAnsi(vehicle.make).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `FacturX_${invoiceNumber}_${cleanMake || 'Vehicule'}.pdf`;
  const blob = new Blob([new Uint8Array(hybridBytes)], { type: 'application/pdf' });
  downloadBlob(blob, fileName);

  return { fileName, invoiceNumber, xml };
}

