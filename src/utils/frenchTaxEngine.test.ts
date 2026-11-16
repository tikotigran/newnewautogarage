import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransactionTaxSnapshot,
  calculateCorporateIS,
  calculateFrenchVat,
  calculateMicroEntrepriseTaxes,
  calculateVehicleProfitBeforeTaxes,
  createDefaultFrenchTaxConfig,
  getResolvedVehicleSaleSnapshot,
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
        vatRegime: 'tva_marge',
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
    assert.equal(resolved.vatRegime, 'tva_marge');
    assert.equal(resolved.isHistoricalSnapshot, true);
  });
});
