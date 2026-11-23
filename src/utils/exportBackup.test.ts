import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildFacturXInvoiceNumber,
  buildFacturXXml,
  buildFinancialLedgerRows,
  buildFinancialWorkbookBytes,
  buildVehiclesExportRows,
  buildVehiclesWorkbookBytes,
  computeBackupCounts,
  computeEntityFieldDiffs,
  filterAuditLogsByGarage,
  financialLedgerToCsv,
  parseFullBackupPayload,
  serializeFullBackupV2,
  validateFacturXReadiness,
} from './exportBackup';
import { computeDealershipAnalytics } from './analytics';
import { GarageSettings, Vehicle } from '../types/garage';

const SAMPLE_SETTINGS: GarageSettings = {
  entityType: 'morale',
  name: 'AutoGarage Lyon SAS',
  siret: '894 123 456 00012',
  streetNumber: '18',
  streetName: 'Avenue Jean Jaurès',
  postalCode: '69007',
  city: 'Lyon',
  phone: '04 72 00 11 22',
  email: 'facturation@autogarage-lyon.fr',
  taxRegime: 'sarl',
  taxRatePercent: 15,
  tvaMention: 'Régime particulier - TVA sur la marge (Art. 297 A du CGI)',
  currency: 'EUR',
};

const SOLD_VEHICLE: Vehicle = {
  id: 'veh_1',
  userId: 'user_1',
  garageId: 'garage_default',
  make: 'Peugeot',
  model: '3008',
  trim: 'GT Line',
  year: 2021,
  mileage: 45000,
  vin: 'VF3MCYHZJLS012345',
  registrationNumber: 'FZ-482-KL',
  purchaseDate: '2026-09-01',
  purchasePrice: 15000,
  targetSalePrice: 19900,
  status: 'sold',
  photos: [],
  documents: [],
  buyerInfo: {
    fullName: 'Claire Moreau',
    streetNumber: '4',
    streetName: 'Rue de la République',
    postalCode: '69001',
    city: 'Lyon',
    address: '4 Rue de la République, 69001 Lyon',
    phone: '0611223344',
    email: 'claire.moreau@example.fr',
    salePrice: 19500,
    saleDate: '2026-09-20',
  },
  repairCostTotal: 600,
  generalExpensesTotal: 400,
  totalExpenses: 1000,
  totalInvested: 16000,
  netProfit: 3500,
  marginPercentage: 17.95,
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-20T15:00:00Z',
};

const STOCK_VEHICLE: Vehicle = {
  id: 'veh_2',
  userId: 'user_1',
  garageId: 'garage_b',
  make: 'Renault',
  model: 'Clio V',
  trim: 'Intens',
  year: 2022,
  mileage: 30000,
  vin: 'VF1RJA00365899999',
  registrationNumber: 'GG-101-AA',
  purchaseDate: '2026-10-10',
  purchasePrice: 9500,
  targetSalePrice: 12900,
  status: 'for_sale',
  photos: [],
  documents: [],
  repairCostTotal: 200,
  generalExpensesTotal: 100,
  totalExpenses: 300,
  totalInvested: 9800,
  netProfit: 3100,
  marginPercentage: 24.03,
  createdAt: '2026-10-10T09:00:00Z',
  updatedAt: '2026-10-10T09:00:00Z',
};

describe('exportBackup utilities', () => {
  it('separates Revenue, Gross Profit, Tax, and Net Profit in financial ledger & CSV', () => {
    const ledger = buildFinancialLedgerRows([SOLD_VEHICLE, STOCK_VEHICLE], SAMPLE_SETTINGS);
    assert.equal(ledger.length, 2);

    const soldRow = ledger[0];
    assert.equal(soldRow.ChiffreAffaires, 19500);
    assert.equal(soldRow.TotalInvesti, 16000);
    assert.equal(soldRow.MargeBrute, 3500);
    assert.equal(soldRow.ProfitAvantImpots_EUR, 3500);
    // In SARL/SAS, IS is NOT calculated flat 15% per car — it is assessed on company annual taxable profit
    assert.equal(soldRow.ImpotEstime, 0);
    assert.equal(soldRow.BeneficeNet, 3500);
    assert.equal(soldRow.RegimeTVA, 'tva_marge');
    assert.equal(soldRow.TVA_EUR, 750); // (19500 - 15000) * 20 / 120 = 750

    // Verify Micro-entreprise Achat/Revente calculates 12.3% URSSAF + 1% VL strictly on Turnover (19500)
    const microLedger = buildFinancialLedgerRows([SOLD_VEHICLE], {
      taxRegime: 'micro',
      taxRatePercent: 13.3,
    });
    assert.equal(microLedger[0].URSSAF_EUR, 2398.5);
    assert.equal(microLedger[0].VersementLiberatoire_EUR, 195);
    assert.equal(microLedger[0].ImpotEstime, 2593.5);
    assert.equal(microLedger[0].BeneficeNet, 906.5);

    const csv = financialLedgerToCsv([SOLD_VEHICLE], SAMPLE_SETTINGS);
    const lines = csv.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('ChiffreAffaires_EUR;PrixAchat_EUR'));
    assert.ok(lines[0].includes('RegimeTVA;TVA_EUR;URSSAF_EUR;VersementLiberatoire_EUR'));
    assert.ok(lines[1].includes('19500;15000;600;400;16000;3500'));
  });

  it('builds readable multi-sheet Excel (.xlsx) workbooks for vehicles and P&L financials', () => {
    const vehBytes = buildVehiclesWorkbookBytes([SOLD_VEHICLE, STOCK_VEHICLE], [], []);
    const vehWb = XLSX.read(vehBytes, { type: 'array' });
    assert.deepEqual(vehWb.SheetNames, ['Vehicules', 'Reparations', 'Frais_Divers']);
    const parsedVeh = XLSX.utils.sheet_to_json<{ Marque: string; PrixVenteFinal: number }>(
      vehWb.Sheets['Vehicules']
    );
    assert.equal(parsedVeh.length, 2);
    assert.equal(parsedVeh[0].Marque, 'Peugeot');
    assert.equal(parsedVeh[0].PrixVenteFinal, 19500);

    const analytics = computeDealershipAnalytics({
      vehicles: [SOLD_VEHICLE, STOCK_VEHICLE],
      repairs: [],
      expenses: [],
      timeRange: 'all',
      taxRegime: 'sarl',
      taxRatePercent: 15,
    });
    const finBytes = buildFinancialWorkbookBytes({
      analytics,
      vehicles: [SOLD_VEHICLE, STOCK_VEHICLE],
      garageSettings: SAMPLE_SETTINGS,
      periodLabel: 'Tout l historique',
    });
    const finWb = XLSX.read(finBytes, { type: 'array' });
    assert.deepEqual(finWb.SheetNames, ['Synthese_PnL', 'Ventes_Marges', 'Depenses_Achats']);
    const summary = XLSX.utils.sheet_to_json<{ Indicateur: string; Valeur: number | string }>(
      finWb.Sheets['Synthese_PnL']
    );
    const revRow = summary.find((r) => String(r.Indicateur).includes('Chiffre d affaires'));
    const netRow = summary.find((r) => String(r.Indicateur).includes('Benefice net'));
    assert.equal(revRow?.Valeur, 19500);
    assert.equal(netRow?.Valeur, 2975);
  });

  it('computes accurate field-level diffs while ignoring timestamps and binary blobs', () => {
    const diffs = computeEntityFieldDiffs(
      {
        make: 'Peugeot',
        purchasePrice: 15000,
        status: 'for_sale',
        updatedAt: '2026-09-01T00:00:00Z',
        photos: ['a.jpg'],
      },
      {
        make: 'Peugeot',
        purchasePrice: 15500,
        status: 'sold',
        updatedAt: '2026-09-20T00:00:00Z',
        photos: ['a.jpg', 'b.jpg'],
      }
    );
    assert.deepEqual(diffs, [
      { field: 'purchasePrice', oldValue: '15000', newValue: '15500' },
      { field: 'status', oldValue: 'for_sale', newValue: 'sold' },
    ]);
  });

  it('validates Factur-X EN 16931 readiness and generates compliant CII D16B XML', () => {
    const readiness = validateFacturXReadiness(SOLD_VEHICLE, SAMPLE_SETTINGS);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.score, 6);
    assert.equal(readiness.invoiceNumber, buildFacturXInvoiceNumber(SOLD_VEHICLE));

    const xml = buildFacturXXml(SOLD_VEHICLE, SAMPLE_SETTINGS);
    assert.ok(xml.includes('CrossIndustryInvoice'));
    assert.ok(xml.includes('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931'));
    assert.ok(xml.includes('<ram:ID schemeID="0002">89412345600012</ram:ID>'));
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260920</udt:DateTimeString>'));
    assert.ok(xml.includes('<ram:GrandTotalAmount>19500.00</ram:GrandTotalAmount>'));
    assert.ok(xml.includes('<ram:CategoryCode>AE</ram:CategoryCode>'));

    const franchiseXml = buildFacturXXml(SOLD_VEHICLE, SAMPLE_SETTINGS, {
      vatMode: 'franchise_base',
    });
    assert.ok(franchiseXml.includes('<ram:CategoryCode>E</ram:CategoryCode>'));
    assert.ok(franchiseXml.includes('293 B'));

    const incompleteReadiness = validateFacturXReadiness(STOCK_VEHICLE, {
      ...SAMPLE_SETTINGS,
      siret: '1234',
    });
    assert.equal(incompleteReadiness.ready, false);
    assert.ok(incompleteReadiness.score < incompleteReadiness.maxScore);
  });

  it('serializes and parses v2 backups and remains backward compatible with v1 backups', () => {
    const v2Json = serializeFullBackupV2({
      version: 2,
      exportedAt: '2026-10-01T10:00:00Z',
      garageId: 'garage_default',
      actorEmail: 'admin@autogarage.fr',
      vehicles: [SOLD_VEHICLE],
      repairs: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      documents: [],
      documentHistory: [],
      settings: SAMPLE_SETTINGS,
    });
    const parsedV2 = parseFullBackupPayload(v2Json);
    assert.equal(parsedV2.version, 2);
    assert.equal(parsedV2.vehicles.length, 1);
    assert.deepEqual(computeBackupCounts(parsedV2).vehicles, 1);

    const v1Json = JSON.stringify({
      version: 1,
      exportedAt: '2026-05-01T08:00:00Z',
      vehicles: [STOCK_VEHICLE],
      repairs: [],
      expenses: [],
      settings: SAMPLE_SETTINGS,
    });
    const parsedV1 = parseFullBackupPayload(v1Json);
    assert.equal(parsedV1.version, 2);
    assert.equal(parsedV1.vehicles.length, 1);
    assert.deepEqual(parsedV1.suppliers, []);
    assert.deepEqual(parsedV1.documents, []);
  });

  it('filters audit logs by garage workspace including legacy default garage', () => {
    const logs = [
      { id: '1', garageId: 'garage_default' },
      { id: '2' }, // legacy without garageId belongs to garage_default
      { id: '3', garageId: 'garage_b' },
    ];
    assert.equal(filterAuditLogsByGarage(logs, 'garage_default').length, 2);
    assert.equal(filterAuditLogsByGarage(logs, 'garage_b').length, 1);
    assert.equal(filterAuditLogsByGarage(logs, null).length, 3);
  });

  it('builds vehicle export rows cleanly', () => {
    const rows = buildVehiclesExportRows([SOLD_VEHICLE]);
    assert.equal(rows[0].Immatriculation, 'FZ-482-KL');
    assert.equal(rows[0].Acheteur, 'Claire Moreau');
    assert.equal(rows[0].MargeBrute, 3500);
  });

  it('localizes backup validation errors for FR, RU, HY, and KA', () => {
    assert.throws(() => parseFullBackupPayload('not-json', 'fr'), /Fichier JSON invalide/);
    assert.throws(() => parseFullBackupPayload('not-json', 'ru'), /Некорректный/);
    assert.throws(() => parseFullBackupPayload('not-json', 'hy'), /Անվավեր/);
    assert.throws(() => parseFullBackupPayload('not-json', 'ka'), /არასწორი/);
    assert.throws(() => parseFullBackupPayload('{"settings":{}}', 'hy'), /vehicles/);
    assert.throws(() => parseFullBackupPayload('{"vehicles":[]}', 'ka'), /settings/);
  });

  it('builds Factur-X readiness and XML using per-vehicle sellerProfileId (Personal exempt from SIRET, Business 2nd entity keeps own SIRET)', () => {
    const multiSettings: GarageSettings = {
      ...SAMPLE_SETTINGS,
      businessProfiles: [
        {
          id: 'biz_primary',
          name: 'GARAGE PRIMARY SAS',
          siret: '11122233300011',
          streetNumber: '1',
          streetName: 'Rue Alpha',
          postalCode: '69001',
          city: 'Lyon',
          phone: '0478000001',
          email: 'alpha@garage.fr',
          isDefault: true,
        },
        {
          id: 'biz_secondary',
          name: 'AUTO SECONDLY SARL',
          siret: '88877766600099',
          streetNumber: '42',
          streetName: 'Avenue Beta',
          postalCode: '75008',
          city: 'Paris',
          phone: '0144000002',
          email: 'beta@garage.fr',
          isDefault: false,
        },
      ],
      personalProfiles: [
        {
          id: 'pers_brother',
          name: '',
          siret: '',
          lastName: 'MARTIN',
          firstName: 'Paul',
          sex: 'M',
          streetNumber: '9',
          streetName: 'Rue Privée',
          postalCode: '13001',
          city: 'Marseille',
          phone: '0600000009',
          email: 'paul@perso.fr',
          isDefault: true,
        },
      ],
    };

    const biz2Vehicle: Vehicle = {
      ...SOLD_VEHICLE,
      purchaseStatus: 'micro',
      sellerProfileId: 'biz_secondary',
    };
    const biz2Readiness = validateFacturXReadiness(biz2Vehicle, multiSettings, 'fr');
    assert.equal(biz2Readiness.ready, true);
    const biz2Xml = buildFacturXXml(biz2Vehicle, multiSettings, {
      vatMode: 'franchise_base',
      vatRatePercent: 0,
    });
    assert.ok(biz2Xml.includes('<ram:Name>AUTO SECONDLY SARL</ram:Name>'));
    assert.ok(biz2Xml.includes('88877766600099'));
    assert.ok(biz2Xml.includes('Paris'));

    const personalVehicle: Vehicle = {
      ...SOLD_VEHICLE,
      purchaseStatus: 'particulier',
      sellerProfileId: 'pers_brother',
    };
    const persReadiness = validateFacturXReadiness(personalVehicle, multiSettings, 'fr');
    assert.equal(persReadiness.ready, true);
    const persXml = buildFacturXXml(personalVehicle, multiSettings, {
      vatMode: 'franchise_base',
      vatRatePercent: 0,
    });
    assert.ok(persXml.includes('<ram:Name>MARTIN Paul</ram:Name>'));
    assert.ok(!persXml.includes('88877766600099'));
    assert.ok(!persXml.includes('11122233300011'));
    assert.ok(!persXml.includes('schemeID="0002"'));
  });
});

