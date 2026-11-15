import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeChannelProfitability,
  computeSupplierSummaries,
  filterPurchasesByGarage,
  filterSuppliersByGarage,
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

  // Auction: gross = 22500 - 19000 = 3500; tax 15% = 525; net = 2975; ROI = 2975 / 19000 = 15.66%
  const auctionSummary = summaries.find((s) => s.supplier.id === 'sup_auction')!;
  assert.equal(auctionSummary.totalSpent, 18000);
  assert.equal(auctionSummary.soldVehiclesCount, 1);
  assert.equal(auctionSummary.realizedNetProfit, 2975);
  assert.equal(auctionSummary.roiPercent, 15.66);

  // Private seller: gross = 14000 - 11500 = 2500; tax 15% = 375; net = 2125; ROI = 2125 / 11500 = 18.48%
  const privateSummary = summaries.find((s) => s.supplier.id === 'sup_private')!;
  assert.equal(privateSummary.realizedNetProfit, 2125);
  assert.equal(privateSummary.roiPercent, 18.48);
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
  assert.equal(result.bestVehicleChannel?.realizedNetProfit, 2975);
});
