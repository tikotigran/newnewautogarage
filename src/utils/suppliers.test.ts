import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncedRepairTaskFromPurchase,
  buildVehiclePayloadFromPurchase,
  computeChannelProfitability,
  computeSupplierSummaries,
  filterPurchasesByGarage,
  filterSuppliersByGarage,
  parseMakeModelFromPurchaseDescription,
  shouldCreateVehicleForPurchase,
  shouldSyncRepairForPurchase,
  SUPPLIER_TYPES,
  validatePurchaseInput,
  validateSupplierInput,
} from './suppliers';
import { Purchase, Supplier, Vehicle } from '../types/garage';

const suppliers: Supplier[] = [
  {
    id: 'sup_auction',
    userId: 'u1',
    garageId: 'garage_default',
    name: 'BCA Enchères Paris',
    type: 'auction',
    city: 'Paris',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'sup_private',
    userId: 'u1',
    garageId: 'garage_default',
    name: 'Jean Martin (Particulier)',
    type: 'private_seller',
    city: 'Lyon',
    createdAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-05T10:00:00Z',
  },
  {
    id: 'sup_parts',
    userId: 'u1',
    garageId: 'garage_2',
    name: 'Oscaro Pro',
    type: 'parts_supplier',
    city: 'Paris',
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
  },
];

const vehicles: Vehicle[] = [
  {
    id: 'veh_1',
    userId: 'u1',
    garageId: 'garage_default',
    make: 'Audi',
    model: 'A3',
    trim: 'S-Line',
    year: 2021,
    mileage: 45000,
    vin: 'WAUZZZ1',
    purchaseDate: '2026-10-01',
    purchasePrice: 18000,
    targetSalePrice: 23000,
    status: 'sold',
    buyerInfo: {
      fullName: 'Client A',
      address: 'Paris',
      phone: '0600',
      email: 'a@test.fr',
      salePrice: 22500,
      saleDate: '2026-10-20',
    },
    photos: [],
    documents: [],
    repairCostTotal: 500,
    generalExpensesTotal: 500,
    totalExpenses: 1000,
    totalInvested: 19000,
    netProfit: 3500,
    marginPercentage: 15.56,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
  },
  {
    id: 'veh_2',
    userId: 'u1',
    garageId: 'garage_default',
    make: 'Peugeot',
    model: '208',
    trim: 'GT',
    year: 2021,
    mileage: 38000,
    vin: 'VF3UPH1',
    purchaseDate: '2026-10-06',
    purchasePrice: 11000,
    targetSalePrice: 14500,
    status: 'sold',
    buyerInfo: {
      fullName: 'Client B',
      address: 'Lyon',
      phone: '0611',
      email: 'b@test.fr',
      salePrice: 14000,
      saleDate: '2026-10-25',
    },
    photos: [],
    documents: [],
    repairCostTotal: 400,
    generalExpensesTotal: 100,
    totalExpenses: 500,
    totalInvested: 11500,
    netProfit: 2500,
    marginPercentage: 17.86,
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
  },
];

const purchases: Purchase[] = [
  {
    id: 'pur_1',
    userId: 'u1',
    garageId: 'garage_default',
    supplierId: 'sup_auction',
    supplierName: 'BCA Enchères Paris',
    supplierType: 'auction',
    vehicleId: 'veh_1',
    vehicleLabel: 'Audi A3',
    category: 'vehicle',
    description: 'Audi A3 Lot #402',
    amount: 18000,
    date: '2026-10-01',
    paymentMethod: 'bank_transfer',
    invoiceNumber: 'BCA-2026-402',
    vehicleDocuments: [],
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'pur_2',
    userId: 'u1',
    garageId: 'garage_default',
    supplierId: 'sup_private',
    supplierName: 'Jean Martin (Particulier)',
    supplierType: 'private_seller',
    vehicleId: 'veh_2',
    vehicleLabel: 'Peugeot 208',
    category: 'vehicle',
    description: 'Peugeot 208 GT',
    amount: 11000,
    date: '2026-10-06',
    paymentMethod: 'cash',
    vehicleDocuments: [],
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'pur_3',
    userId: 'u1',
    garageId: 'garage_2',
    supplierId: 'sup_parts',
    supplierName: 'Oscaro Pro',
    supplierType: 'parts_supplier',
    category: 'parts',
    description: 'Plaquettes & Disques Brembo',
    amount: 320,
    date: '2026-10-12',
    paymentMethod: 'card',
    vehicleDocuments: [],
    createdAt: '2026-10-12T10:00:00Z',
    updatedAt: '2026-10-12T10:00:00Z',
  },
];

test('SUPPLIER_TYPES defines all 6 required supplier categories', () => {
  const ids = SUPPLIER_TYPES.map((t) => t.id);
  assert.deepEqual(ids, [
    'private_seller',
    'dealership',
    'auction',
    'parts_supplier',
    'workshop',
    'transport_company',
  ]);
});

test('filterSuppliersByGarage and filterPurchasesByGarage enforce garage isolation', () => {
  assert.equal(filterSuppliersByGarage(suppliers, 'garage_default').length, 2);
  assert.equal(filterSuppliersByGarage(suppliers, 'garage_2').length, 1);
  assert.equal(filterPurchasesByGarage(purchases, 'garage_default').length, 2);
  assert.equal(filterPurchasesByGarage(purchases, null).length, 3);
});

test('validateSupplierInput and validatePurchaseInput validate required fields and formats', () => {
  assert.deepEqual(
    validateSupplierInput({ name: 'BCA Paris', type: 'auction', email: 'pro@bca.fr' }),
    []
  );
  assert.ok(validateSupplierInput({ name: '', type: 'auction' }).includes('name_required'));
  assert.ok(
    validateSupplierInput({ name: 'Test', type: 'auction', email: 'bad-email' }).includes('invalid_email')
  );

  assert.deepEqual(
    validatePurchaseInput({
      supplierId: 'sup_1',
      category: 'vehicle',
      description: 'Peugeot 208',
      amount: 10500,
      date: '2026-11-01',
      paymentMethod: 'bank_transfer',
    }),
    []
  );
  assert.ok(
    validatePurchaseInput({
      supplierId: '',
      category: 'vehicle',
      description: '',
      amount: -5,
      date: '',
      paymentMethod: 'cash',
    }).length >= 3
  );
});

test('computeSupplierSummaries calculates deal history, spend, realized net profit and ROI', () => {
  const summaries = computeSupplierSummaries({
    suppliers: suppliers.slice(0, 2),
    purchases: purchases.slice(0, 2),
    vehicles,
    taxRegime: 'sarl',
    taxRatePercent: 15,
  });

  // In SARL/SAS, corporate IS is assessed annually on company profit (never flat 15% per car):
  // Auction: profit before IS = 22500 - 19000 = 3500; ROI = 3500 / 19000 = 18.42%
  const auctionSummary = summaries.find((s) => s.supplier.id === 'sup_auction')!;
  assert.equal(auctionSummary.totalSpent, 18000);
  assert.equal(auctionSummary.soldVehiclesCount, 1);
  assert.equal(auctionSummary.realizedNetProfit, 3500);
  assert.equal(auctionSummary.roiPercent, 18.42);

  // Private seller: profit before IS = 14000 - 11500 = 2500; ROI = 2500 / 11500 = 21.74%
  const privateSummary = summaries.find((s) => s.supplier.id === 'sup_private')!;
  assert.equal(privateSummary.realizedNetProfit, 2500);
  assert.equal(privateSummary.roiPercent, 21.74);

  // Micro-entreprise (13.3% on turnover): Auction sale 22500 -> tax 2992.5 -> net 507.5
  const microSummaries = computeSupplierSummaries({
    suppliers: suppliers.slice(0, 1),
    purchases: purchases.slice(0, 1),
    vehicles,
    taxRegime: 'micro',
    taxRatePercent: 13.3,
  });
  assert.equal(microSummaries[0].realizedNetProfit, 507.5);
});

test('computeChannelProfitability identifies most profitable sourcing channel', () => {
  const result = computeChannelProfitability({
    suppliers,
    purchases,
    vehicles,
    taxRegime: 'sarl',
    taxRatePercent: 15,
  });

  assert.equal(result.totalPurchasesCount, 3);
  assert.equal(result.totalPurchasesSpend, 29320);
  assert.equal(result.totalVehiclesSourced, 2);
  assert.equal(result.bestVehicleChannel?.type, 'auction');
  assert.equal(result.bestVehicleChannel?.realizedNetProfit, 3500);
});

test('computeSupplierSummaries & computeChannelProfitability default to micro tax regime when omitted', () => {
  const summaries = computeSupplierSummaries({
    suppliers: suppliers.slice(0, 1),
    purchases: purchases.slice(0, 1),
    vehicles,
    taxRatePercent: 13.3,
  });
  // Sale 22500 -> micro 13.3% tax = 2992.5 -> netProfit = 3500 - 2992.5 = 507.5
  assert.equal(summaries[0].realizedNetProfit, 507.5);

  const channelStats = computeChannelProfitability({
    suppliers: suppliers.slice(0, 1),
    purchases: purchases.slice(0, 1),
    vehicles,
    taxRatePercent: 13.3,
  });
  assert.equal(channelStats.bestVehicleChannel?.realizedNetProfit, 507.5);
});

test('supplier purchase sync helpers determine vehicle auto-creation, repair sync, make/model parsing, and documents cleanly', () => {
  assert.equal(shouldCreateVehicleForPurchase('vehicle', undefined), true);
  assert.equal(shouldCreateVehicleForPurchase('vehicle', ''), true);
  assert.equal(shouldCreateVehicleForPurchase('vehicle', 'veh_1'), false);
  assert.equal(shouldCreateVehicleForPurchase('parts', undefined), false);

  assert.equal(shouldSyncRepairForPurchase('parts', 'veh_1'), true);
  assert.equal(shouldSyncRepairForPurchase('repair', 'veh_1'), true);
  assert.equal(shouldSyncRepairForPurchase('transport', 'veh_1'), true);
  assert.equal(shouldSyncRepairForPurchase('other', 'veh_1'), true);
  assert.equal(shouldSyncRepairForPurchase('vehicle', 'veh_1'), false);
  assert.equal(shouldSyncRepairForPurchase('parts', undefined), false);

  assert.deepEqual(parseMakeModelFromPurchaseDescription('Peugeot 3008 GT Line — Lot 42'), {
    make: 'Peugeot',
    model: '3008 GT Line',
  });
  assert.deepEqual(parseMakeModelFromPurchaseDescription('Renault'), {
    make: 'Renault',
    model: 'Lot',
  });

  const vehiclePayload = buildVehiclePayloadFromPurchase({
    userId: 'u1',
    garageId: 'garage_default',
    supplier: { id: 'sup_auction', name: 'BCA Enchères Paris' },
    description: 'Volkswagen Golf VII 1.6 TDI | Lot #88',
    amount: 10500,
    date: '2026-10-18',
    vehicleDocuments: [
      {
        id: 'pdoc_1',
        name: 'Carte Grise.pdf',
        url: 'data:application/pdf;base64,AAA',
        kind: 'vehicle_doc',
        date: '2026-10-18',
      },
    ],
    invoiceProofName: 'Facture_BCA_88.pdf',
    invoiceProofUrl: 'data:application/pdf;base64,BBB',
  });
  assert.equal(vehiclePayload.garageId, 'garage_default');
  assert.equal(vehiclePayload.make, 'Volkswagen');
  assert.equal(vehiclePayload.model, 'Golf VII 1.6 TDI');
  assert.equal(vehiclePayload.purchasePrice, 10500);
  assert.equal(vehiclePayload.status, 'preparation');
  assert.equal(vehiclePayload.supplierId, 'sup_auction');
  assert.equal(vehiclePayload.documents.length, 2);
  assert.equal(vehiclePayload.documents[1].type, 'INVOICE');

  const repairTask = buildSyncedRepairTaskFromPurchase({
    purchaseId: 'pur_parts_1',
    garageId: 'garage_default',
    supplierName: 'Oscaro Pro',
    category: 'parts',
    description: 'Kit distribution + pompe à eau',
    amount: 425.5,
    date: '2026-10-19',
    invoiceNumber: 'FAC-771',
  });
  assert.equal(repairTask.supplierPurchaseId, 'pur_parts_1');
  assert.equal(repairTask.partsCost, 425.5);
  assert.equal(repairTask.laborCost, 0);
  assert.equal(repairTask.date, '2026-10-19');
  assert.ok(repairTask.title.includes('FAC-771'));
});

