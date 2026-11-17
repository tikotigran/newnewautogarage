import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileSettingsPatch,
  buildTransactionTaxSnapshot,
  calculateCorporateIS,
  calculateFrenchVat,
  calculateMicroEntrepriseTaxes,
  calculateVehicleProfitBeforeTaxes,
  createDefaultFrenchTaxConfig,
  getResolvedVehicleSaleSnapshot,
  resolveDealSellerProfileType,
  resolveEffectiveSettingsForDeal,
  resolveUserProfileType,
} from './frenchTaxEngine';
import { GarageSettings, Vehicle } from '../types/garage';

describe('French Tax Engine — Micro-entreprise Achat/Revente', () => {
  it('calculates URSSAF (12.3%) + Versement libératoire (1%) = 13.3% strictly on Turnover even when vehicle makes a loss', () => {
    const config = createDefaultFrenchTaxConfig('micro_entreprise', {
      socialContributionRate: 12.3,
      versementLiberatoireEnabled: true,
      versementLiberatoireRate: 1.0,
    });

    const pnl = calculateVehicleProfitBeforeTaxes({
      purchasePrice: 2000,
      repairCostTotal: 5000,
      generalExpensesTotal: 0,
      salePrice: 5000,
    });
    assert.equal(pnl.profitBeforeTaxes, -2000);

    const micro = calculateMicroEntrepriseTaxes({
      turnover: 5000,
      config,
    });
    assert.equal(micro.turnover, 5000);
    assert.equal(micro.urssafAmount, 615);
    assert.equal(micro.versementLiberatoireAmount, 50);
    assert.equal(micro.totalSocialAndVlAmount, 665);
    assert.equal(micro.combinedSocialAndVlRate, 13.3);
    assert.equal(micro.separateMicroBicIncomeTax, 0);
  });

  it('applies ONLY 12.3% URSSAF and separates Micro-BIC IR when Versement libératoire is NO (does not add 1%)', () => {
    const config = createDefaultFrenchTaxConfig('micro_entreprise', {
      socialContributionRate: 12.3,
      versementLiberatoireEnabled: false,
      versementLiberatoireRate: 1.0,
      microBicAbattementPercent: 71,
      microBicIncomeTaxRate: 11,
    });

    const micro = calculateMicroEntrepriseTaxes({
      turnover: 5000,
      config,
    });
    assert.equal(micro.urssafAmount, 615);
    assert.equal(micro.versementLiberatoireAmount, 0);
    assert.equal(micro.totalSocialAndVlAmount, 615);
    assert.equal(micro.combinedSocialAndVlRate, 12.3);
    // 5000 * (1 - 0.71) = 1450€ taxable base; 1450 * 11% = 159.50€
    assert.equal(micro.microBicTaxableTurnover, 1450);
    assert.equal(micro.separateMicroBicIncomeTax, 159.5);
  });
});

describe('French Tax Engine — SARL / SAS Progressive Corporate IS', () => {
  it('calculates 15% IS on €30,000 annual profit when eligible for reduced rate (= €4,500)', () => {
    const config = createDefaultFrenchTaxConfig('sarl', {
      isRateMode: 'progressive_15_25',
      reducedIsEligible: true,
    });

    const res = calculateCorporateIS({ annualTaxableProfit: 30000, config });
    assert.equal(res.bracket15Base, 30000);
    assert.equal(res.bracket15Tax, 4500);
    assert.equal(res.bracket25Base, 0);
    assert.equal(res.bracket25Tax, 0);
    assert.equal(res.totalIsTax, 4500);
    assert.equal(res.netProfitAfterIs, 25500);
  });

  it('calculates progressive IS on €60,000 annual profit (= €6,375 + €4,375 = €10,750)', () => {
    const config = createDefaultFrenchTaxConfig('sas', {
      isRateMode: 'progressive_15_25',
      reducedIsEligible: true,
    });

    const res = calculateCorporateIS({ annualTaxableProfit: 60000, config });
    assert.equal(res.bracket15Base, 42500);
    assert.equal(res.bracket15Tax, 6375);
    assert.equal(res.bracket25Base, 17500);
    assert.equal(res.bracket25Tax, 4375);
    assert.equal(res.totalIsTax, 10750);
    assert.equal(res.netProfitAfterIs, 49250);
  });

  it('applies full 25% standard IS when reduced rate eligibility is NO (= €15,000 on €60,000)', () => {
    const config = createDefaultFrenchTaxConfig('sarl', {
      isRateMode: 'progressive_15_25',
      reducedIsEligible: false,
    });

    const res = calculateCorporateIS({ annualTaxableProfit: 60000, config });
    assert.equal(res.bracket15Tax, 0);
    assert.equal(res.bracket25Tax, 15000);
    assert.equal(res.totalIsTax, 15000);
  });

  it('returns 0 IS on negative or zero annual taxable profit', () => {
    const config = createDefaultFrenchTaxConfig('sarl');
    const loss = calculateCorporateIS({ annualTaxableProfit: -5000, config });
    assert.equal(loss.totalIsTax, 0);
  });
});

describe('French Tax Engine — French VAT (TVA) Regimes & Historical Snapshot Immutability', () => {
  it('computes TVA sur marge, TVA sur prix total, Franchise en base, and Custom VAT cleanly', () => {
    const marginVat = calculateFrenchVat({
      salePrice: 12000,
      purchasePrice: 9000,
      vatRegime: 'tva_marge',
      vatRatePercent: 20,
    });
    // Margin TTC = 3000 -> VAT = 3000 * 20 / 120 = 500
    assert.equal(marginVat.vatAmount, 500);
    assert.equal(marginVat.vatBaseAmount, 2500);

    const totalVat = calculateFrenchVat({
      salePrice: 12000,
      purchasePrice: 9000,
      vatRegime: 'tva_total',
      vatRatePercent: 20,
    });
    assert.equal(totalVat.htAmount, 10000);
    assert.equal(totalVat.vatAmount, 2000);

    const franchise = calculateFrenchVat({
      salePrice: 12000,
      purchasePrice: 9000,
      vatRegime: 'franchise_base',
      vatRatePercent: 20,
    });
    assert.equal(franchise.vatAmount, 0);
    assert.equal(franchise.vatRatePercent, 0);
    assert.match(franchise.legalMention, /293 B/);
  });

  it('preserves historical transaction taxSnapshot even after garage settings change', () => {
    const initialSettings: GarageSettings = {
      name: 'Garage Paris',
      siret: '12345678900011',
      streetNumber: '10',
      streetName: 'Rue de Rivoli',
      postalCode: '75001',
      city: 'Paris',
      phone: '0102030405',
      email: 'contact@garage.fr',
      taxRegime: 'micro',
      frenchTaxConfig: createDefaultFrenchTaxConfig('micro_entreprise', {
        socialContributionRate: 12.3,
        versementLiberatoireEnabled: true,
        versementLiberatoireRate: 1,
        vatRegime: 'tva_marge',
      }),
    };

    const snapshotAtSale = buildTransactionTaxSnapshot({
      salePrice: 5000,
      purchasePrice: 2000,
      repairCostTotal: 5000,
      generalExpensesTotal: 0,
      settings: initialSettings,
    });

    assert.equal(snapshotAtSale.totalTaxAmount, 665);
    assert.equal(snapshotAtSale.profitBeforeTaxes, -2000);
    assert.equal(snapshotAtSale.vatRegime, 'franchise_base');
    assert.equal(snapshotAtSale.vatAmount, 0);

    const soldVehicle: Vehicle = {
      id: 'veh-immutable-1',
      userId: 'u1',
      make: 'Renault',
      model: 'Clio',
      trim: 'Zen',
      year: 2020,
      mileage: 60000,
      vin: 'VF1TEST0000000001',
      purchaseDate: '2026-01-10',
      purchasePrice: 2000,
      targetSalePrice: 5000,
      status: 'sold',
      photos: [],
      documents: [],
      repairCostTotal: 5000,
      generalExpensesTotal: 0,
      totalExpenses: 5000,
      totalInvested: 7000,
      netProfit: -2000,
      marginPercentage: -40,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-02-15T10:00:00Z',
      buyerInfo: {
        fullName: 'Jean Martin',
        address: '10 RueTest',
        phone: '0600000000',
        email: 'jean@test.fr',
        salePrice: 5000,
        saleDate: '2026-02-15',
        vatRegime: 'franchise_base',
        taxSnapshot: snapshotAtSale,
      },
    };

    // Mutate garage settings dramatically (e.g., switch to SARL + standard 20% VAT)
    const mutatedSettings: GarageSettings = {
      ...initialSettings,
      taxRegime: 'sarl',
      frenchTaxConfig: createDefaultFrenchTaxConfig('sarl', {
        vatRegime: 'tva_total',
        corporateTaxRateStandard: 25,
      }),
    };

    const resolved = getResolvedVehicleSaleSnapshot({
      vehicle: soldVehicle,
      garageSettings: mutatedSettings,
    });

    assert.equal(resolved.taxRegime, 'micro');
    assert.equal(resolved.totalTaxAmount, 665);
    assert.equal(resolved.vatRegime, 'franchise_base');
    assert.equal(resolved.vatAmount, 0);
    assert.equal(resolved.isHistoricalSnapshot, true);

    // Corporate historical snapshot (SARL TVA sur marge) also remains frozen when switching to Micro-entrepreneur
    const sarlSettings: GarageSettings = {
      ...initialSettings,
      taxRegime: 'sarl',
      frenchTaxConfig: createDefaultFrenchTaxConfig('sarl', { vatRegime: 'tva_marge', vatRatePercent: 20 }),
    };
    const sarlSnap = buildTransactionTaxSnapshot({
      salePrice: 12000,
      purchasePrice: 9000,
      repairCostTotal: 0,
      generalExpensesTotal: 0,
      settings: sarlSettings,
    });
    assert.equal(sarlSnap.vatRegime, 'tva_marge');
    assert.equal(sarlSnap.vatAmount, 500);

    const resolvedSarlOnMicro = getResolvedVehicleSaleSnapshot({
      vehicle: {
        ...soldVehicle,
        buyerInfo: { ...soldVehicle.buyerInfo!, salePrice: 12000, vatRegime: 'tva_marge', taxSnapshot: sarlSnap },
      },
      garageSettings: initialSettings,
    });
    assert.equal(resolvedSarlOnMicro.vatRegime, 'tva_marge');
    assert.equal(resolvedSarlOnMicro.vatAmount, 500);
    assert.equal(resolvedSarlOnMicro.isHistoricalSnapshot, true);
  });

  it('enforces Franchise en base de TVA (0%) on Micro-entrepreneur transactions even if VAT overrides are supplied', () => {
    const snap = buildTransactionTaxSnapshot({
      salePrice: 10000,
      purchasePrice: 7000,
      repairCostTotal: 500,
      generalExpensesTotal: 0,
      settings: {
        profileType: 'micro_entrepreneur',
        taxRegime: 'micro',
        frenchTaxConfig: createDefaultFrenchTaxConfig('micro_entreprise'),
      },
      vatRegimeOverride: 'tva_marge',
      vatRateOverride: 20,
    });
    assert.equal(snap.vatRegime, 'franchise_base');
    assert.equal(snap.vatRatePercent, 0);
    assert.equal(snap.vatAmount, 0);
    assert.equal(snap.htAmount, 10000);
    assert.equal(snap.urssafAmount, 1230);
    assert.equal(snap.versementLiberatoireAmount, 100);
    assert.equal(snap.totalTaxAmount, 1330);
    assert.match(snap.vatLegalMention, /293 B/);
  });
});

describe('Two-Profile Architecture — Particulier vs Micro-entrepreneur', () => {
  it('resolves profileType strictly to particulier or micro_entrepreneur', () => {
    assert.equal(resolveUserProfileType(undefined), 'micro_entrepreneur');
    assert.equal(resolveUserProfileType({ profileType: 'particulier' }), 'particulier');
    assert.equal(resolveUserProfileType({ legalStatus: 'particulier' }), 'particulier');
    assert.equal(resolveUserProfileType({ taxRegime: 'none' }), 'particulier');
    assert.equal(resolveUserProfileType({ profileType: 'micro_entrepreneur' }), 'micro_entrepreneur');
    assert.equal(resolveUserProfileType({ taxRegime: 'micro' }), 'micro_entrepreneur');
  });

  it('builds non-destructive settings patches for Particulier and Micro-entrepreneur', () => {
    const partPatch = buildProfileSettingsPatch('particulier', {
      name: 'Jean Dupont',
      siret: '89412345600012',
    });
    assert.equal(partPatch.profileType, 'particulier');
    assert.equal(partPatch.legalStatus, 'particulier');
    assert.equal(partPatch.taxRegime, 'none');
    assert.equal(partPatch.taxRatePercent, 0);
    assert.equal(partPatch.frenchTaxConfig?.vatRatePercent, 0);

    const partSnap = buildTransactionTaxSnapshot({
      salePrice: 14000,
      purchasePrice: 10000,
      repairCostTotal: 500,
      generalExpensesTotal: 200,
      settings: partPatch,
    });
    assert.equal(partSnap.totalTaxAmount, 0);
    assert.equal(partSnap.vatAmount, 0);
    assert.equal(partSnap.profitBeforeTaxes, 3300);
    assert.equal(partSnap.netProfitAfterTax, 3300);

    const microPatch = buildProfileSettingsPatch('micro_entrepreneur', partPatch);
    assert.equal(microPatch.profileType, 'micro_entrepreneur');
    assert.equal(microPatch.legalStatus, 'micro_entreprise');
    assert.equal(microPatch.taxRegime, 'micro');
    assert.equal(microPatch.taxRatePercent, 13.3);
    assert.equal(microPatch.frenchTaxConfig?.socialContributionRate, 12.3);
    assert.equal(microPatch.frenchTaxConfig?.versementLiberatoireEnabled, true);
    assert.equal(microPatch.frenchTaxConfig?.vatRegime, 'franchise_base');
    assert.equal(microPatch.frenchTaxConfig?.vatRatePercent, 0);
    assert.match(microPatch.tvaMention || '', /293 B/);
  });

  it('forces 0€ taxes, 0% URSSAF/VL/VAT, and empty disclaimer for Particulier even with stale Micro frenchTaxConfig', () => {
    const staleMicroSettings: Partial<GarageSettings> = {
      profileType: 'particulier',
      legalStatus: 'particulier',
      taxRegime: 'none',
      frenchTaxConfig: {
        ...createDefaultFrenchTaxConfig('micro_entreprise'),
        socialContributionRate: 12.3,
        versementLiberatoireEnabled: true,
        versementLiberatoireRate: 1,
        vatRegime: 'tva_marge',
        vatRatePercent: 20,
      },
    };

    const partPatch = buildProfileSettingsPatch('particulier', {
      frenchTaxConfig: createDefaultFrenchTaxConfig('micro_entreprise'),
    });
    assert.equal(partPatch.frenchTaxConfig?.socialContributionRate, 0);
    assert.equal(partPatch.frenchTaxConfig?.versementLiberatoireEnabled, false);
    assert.equal(partPatch.frenchTaxConfig?.versementLiberatoireRate, 0);
    assert.equal(partPatch.frenchTaxConfig?.microBicIncomeTaxRate, 0);

    const partSnap = buildTransactionTaxSnapshot({
      salePrice: 13990,
      purchasePrice: 10400,
      repairCostTotal: 310,
      generalExpensesTotal: 180,
      settings: staleMicroSettings,
    });
    assert.equal(partSnap.taxRegime, 'none');
    assert.equal(partSnap.legalStatus, 'particulier');
    assert.equal(partSnap.urssafAmount, 0);
    assert.equal(partSnap.versementLiberatoireEnabled, false);
    assert.equal(partSnap.versementLiberatoireAmount, 0);
    assert.equal(partSnap.microBicEstimatedTax, 0);
    assert.equal(partSnap.vatAmount, 0);
    assert.equal(partSnap.totalTaxAmount, 0);
    assert.equal(partSnap.profitBeforeTaxes, 3100);
    assert.equal(partSnap.netProfitAfterTax, 3100);
    assert.equal(partSnap.disclaimerNote, '');
  });

  it('reconciles Micro-entrepreneur Gross Margin, Turnover URSSAF/VL, and Net Profit without double-counting purchase price', () => {
    const microSettings: Partial<GarageSettings> = buildProfileSettingsPatch('micro_entrepreneur');
    // Buy 10,400 + Repairs 310 + Expenses 180 = 10,890 invested; Sale 13,990
    // Gross Margin = 13,990 - 10,890 = 3,100
    // URSSAF = 13,990 * 12.3% = 1,720.77
    // VL = 13,990 * 1% = 139.90
    // Total Taxes = 1,860.67
    // Net Profit = 3,100 - 1,860.67 = 1,239.33
    const snap = buildTransactionTaxSnapshot({
      salePrice: 13990,
      purchasePrice: 10400,
      repairCostTotal: 310,
      generalExpensesTotal: 180,
      settings: microSettings,
    });
    assert.equal(snap.profitBeforeTaxes, 3100);
    assert.equal(snap.urssafAmount, 1720.77);
    assert.equal(snap.versementLiberatoireAmount, 139.9);
    assert.equal(snap.totalTaxAmount, 1860.67);
    assert.equal(snap.netProfitAfterTax, 1239.33);
    assert.equal(snap.vatRegime, 'franchise_base');
    assert.equal(snap.vatAmount, 0);
  });

  it('overrides global profileType per vehicle transaction via buyerInfo.sellerProfileType', () => {
    const globalParticulier = buildProfileSettingsPatch('particulier', {
      name: 'Garage Test',
      siret: '89412345600012',
    });
    const globalMicro = buildProfileSettingsPatch('micro_entrepreneur', {
      name: 'Garage Test',
      siret: '89412345600012',
    });

    const baseVehicle: Vehicle = {
      id: 'veh-per-deal-1',
      userId: 'u1',
      make: 'Peugeot',
      model: '208',
      trim: 'GT',
      year: 2021,
      mileage: 45000,
      vin: 'VF3TEST0000000002',
      purchaseDate: '2026-01-10',
      purchasePrice: 10000,
      targetSalePrice: 13000,
      status: 'sold',
      photos: [],
      documents: [],
      repairCostTotal: 0,
      generalExpensesTotal: 0,
      totalExpenses: 0,
      totalInvested: 10000,
      netProfit: 3000,
      marginPercentage: 23.08,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-02-15T10:00:00Z',
    };

    // Deal sold as Micro-entrepreneur even though global settings are Particulier
    const microDealVehicle: Vehicle = {
      ...baseVehicle,
      buyerInfo: {
        fullName: 'Client A',
        address: 'Paris',
        phone: '0600000001',
        email: 'a@test.fr',
        salePrice: 10000,
        saleDate: '2026-02-15',
        sellerProfileType: 'micro_entrepreneur',
      },
    };
    assert.equal(
      resolveDealSellerProfileType(microDealVehicle, globalParticulier, 'particulier'),
      'micro_entrepreneur'
    );
    const microDealSnap = getResolvedVehicleSaleSnapshot({
      vehicle: microDealVehicle,
      garageSettings: globalParticulier,
      fallbackProfileType: 'particulier',
    });
    assert.equal(microDealSnap.taxRegime, 'micro');
    assert.equal(microDealSnap.urssafAmount, 1230);
    assert.equal(microDealSnap.versementLiberatoireAmount, 100);
    assert.equal(microDealSnap.totalTaxAmount, 1330);

    // Deal sold as Particulier even though global settings are Micro-entrepreneur (and even if an old micro snapshot existed)
    const particulierDealVehicle: Vehicle = {
      ...baseVehicle,
      buyerInfo: {
        fullName: 'Client B',
        address: 'Lyon',
        phone: '0600000002',
        email: 'b@test.fr',
        salePrice: 12000,
        saleDate: '2026-02-16',
        sellerProfileType: 'particulier',
        taxSnapshot: microDealSnap,
      },
    };
    assert.equal(
      resolveDealSellerProfileType(particulierDealVehicle, globalMicro, 'micro_entrepreneur'),
      'particulier'
    );
    const partDealSettings = resolveEffectiveSettingsForDeal({
      vehicle: particulierDealVehicle,
      garageSettings: globalMicro,
      fallbackProfileType: 'micro_entrepreneur',
    });
    assert.equal(partDealSettings.taxRegime, 'none');

    const partDealSnap = getResolvedVehicleSaleSnapshot({
      vehicle: particulierDealVehicle,
      garageSettings: globalMicro,
      fallbackProfileType: 'micro_entrepreneur',
    });
    assert.equal(partDealSnap.taxRegime, 'none');
    assert.equal(partDealSnap.urssafAmount, 0);
    assert.equal(partDealSnap.versementLiberatoireAmount, 0);
    assert.equal(partDealSnap.totalTaxAmount, 0);
    assert.equal(partDealSnap.netProfitAfterTax, 2000);
  });
});


