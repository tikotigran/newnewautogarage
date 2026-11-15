import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMissingDocumentReminders,
  DOCUMENT_CATEGORIES,
  filterDocumentsByGarage,
  inferCategoryFromFileName,
  resolveDocumentBinding,
  searchAndFilterDocuments,
  validateDocumentInput,
} from './documents';
import { GarageDocument, Vehicle } from '../types/garage';

const mockVehicles: Vehicle[] = [
  {
    id: 'veh_1',
    userId: 'u1',
    garageId: 'garage_default',
    make: 'Peugeot',
    model: '208',
    trim: 'GT',
    year: 2021,
    mileage: 45000,
    vin: 'VF3UPHNK0MT129841',
    registrationNumber: 'AB-123-CD',
    purchaseDate: '2026-10-01',
    purchasePrice: 11000,
    targetSalePrice: 14500,
    status: 'sold',
    photos: ['data:image/jpeg;base64,abc'],
    documents: [],
    buyerInfo: {
      fullName: 'Thomas Beaumont',
      phone: '0611223344',
      email: 'thomas@example.com',
      address: '14 Rue des Lilas, Lyon',
      salePrice: 14200,
      saleDate: '2026-10-20',
    },
    repairCostTotal: 350,
    generalExpensesTotal: 100,
    totalExpenses: 450,
    totalInvested: 11450,
    netProfit: 2750,
    marginPercentage: 19.37,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  },
  {
    id: 'veh_2',
    userId: 'u1',
    garageId: 'garage_two',
    make: 'Renault',
    model: 'Clio V',
    trim: 'Intens',
    year: 2020,
    mileage: 60000,
    vin: 'VF1RJA00365891234',
    purchaseDate: '2026-10-10',
    purchasePrice: 8900,
    targetSalePrice: 12000,
    status: 'for_sale',
    photos: [],
    documents: [],
    repairCostTotal: 0,
    generalExpensesTotal: 0,
    totalExpenses: 0,
    totalInvested: 8900,
    netProfit: 3100,
    marginPercentage: 25.83,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
  },
];

const mockDocs: GarageDocument[] = [
  {
    id: 'doc_1',
    userId: 'u1',
    garageId: 'garage_default',
    title: 'Carte Grise Peugeot 208',
    category: 'carte_grise',
    bindingType: 'vehicle',
    vehicleId: 'veh_1',
    vehicleLabel: 'Peugeot 208 (2021) · AB-123-CD',
    clientName: 'Thomas Beaumont',
    fileName: 'carte_grise_208.pdf',
    mimeType: 'application/pdf',
    fileSize: 102400,
    fileUrl: 'data:application/pdf;base64,JVBERi0x',
    documentDate: '2026-10-01',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
  {
    id: 'doc_2',
    userId: 'u1',
    garageId: 'garage_two',
    title: 'Contrôle Technique Clio V',
    category: 'controle_technique',
    bindingType: 'vehicle',
    vehicleId: 'veh_2',
    vehicleLabel: 'Renault Clio V (2020)',
    fileName: 'ct_clio.pdf',
    mimeType: 'application/pdf',
    fileSize: 80000,
    fileUrl: 'data:application/pdf;base64,JVBERi0x',
    documentDate: '2026-10-12',
    createdAt: '2026-10-12T10:00:00Z',
    updatedAt: '2026-10-12T10:00:00Z',
  },
];

test('DOCUMENT_CATEGORIES exposes all 10 required document categories', () => {
  const ids = DOCUMENT_CATEGORIES.map((c) => c.id);
  assert.deepEqual(ids, [
    'carte_grise',
    'certificat_cession',
    'controle_technique',
    'facture_achat',
    'facture_reparation',
    'facture_vente',
    'photos_vehicule',
    'contrats',
    'justificatif_paiement',
    'documents_administratifs',
  ]);
});

test('filterDocumentsByGarage isolates documents per garage', () => {
  const g1 = filterDocumentsByGarage(mockDocs, 'garage_default');
  assert.equal(g1.length, 1);
  assert.equal(g1[0].id, 'doc_1');
  assert.equal(filterDocumentsByGarage(mockDocs, null).length, 2);
});

test('resolveDocumentBinding auto-links buyer client from vehicle and vice versa', () => {
  const byVeh = resolveDocumentBinding({
    bindingType: 'vehicle',
    vehicleId: 'veh_1',
    vehicles: mockVehicles,
  });
  assert.equal(byVeh.vehicleLabel, 'Peugeot 208 (2021) · AB-123-CD');
  assert.equal(byVeh.clientName, 'Thomas Beaumont');
  assert.equal(byVeh.clientEmail, 'thomas@example.com');

  const byClient = resolveDocumentBinding({
    bindingType: 'client',
    clientName: 'Thomas Beaumont',
    vehicles: mockVehicles,
  });
  assert.equal(byClient.vehicleId, 'veh_1');
  assert.equal(byClient.vehicleLabel, 'Peugeot 208 (2021) · AB-123-CD');
});

test('validateDocumentInput checks title, binding target, file, and date', () => {
  const errs = validateDocumentInput({
    title: '',
    category: 'carte_grise',
    bindingType: 'vehicle',
    vehicleId: '',
    fileName: '',
    fileUrl: '',
    documentDate: '',
  });
  assert.ok(errs.includes('title_required'));
  assert.ok(errs.includes('vehicle_required'));
  assert.ok(errs.includes('file_required'));
  assert.ok(errs.includes('date_required'));

  const ok = validateDocumentInput({
    title: 'Facture vente 208',
    category: 'facture_vente',
    bindingType: 'client',
    clientName: 'Thomas Beaumont',
    fileName: 'facture.pdf',
    fileUrl: 'data:application/pdf;base64,AA==',
    documentDate: '2026-10-20',
  });
  assert.equal(ok.length, 0);
});

test('searchAndFilterDocuments searches across title, filename, vehicle, and client', () => {
  const byClient = searchAndFilterDocuments({
    documents: mockDocs,
    query: 'Beaumont',
    category: 'all',
    bindingType: 'all',
    vehicleId: '',
    clientName: '',
  });
  assert.equal(byClient.length, 1);
  assert.equal(byClient[0].id, 'doc_1');

  const byCat = searchAndFilterDocuments({
    documents: mockDocs,
    query: '',
    category: 'controle_technique',
    bindingType: 'all',
    vehicleId: '',
    clientName: '',
  });
  assert.equal(byCat.length, 1);
  assert.equal(byCat[0].id, 'doc_2');
});

test('computeMissingDocumentReminders detects missing docs per status and clears when uploaded', () => {
  const remindersBefore = computeMissingDocumentReminders({
    vehicles: [mockVehicles[0]],
    documents: [mockDocs[0]], // only carte_grise uploaded; photos exist on vehicle
  });
  const missingCats = remindersBefore.map((r) => r.category);
  assert.ok(!missingCats.includes('carte_grise'));
  assert.ok(!missingCats.includes('photos_vehicule'));
  assert.ok(missingCats.includes('controle_technique'));
  assert.ok(missingCats.includes('certificat_cession'));
  assert.ok(missingCats.includes('facture_vente'));
  assert.ok(missingCats.includes('facture_reparation'));
  assert.ok(missingCats.includes('justificatif_paiement'));

  const remindersAfter = computeMissingDocumentReminders({
    vehicles: [mockVehicles[0]],
    documents: [
      mockDocs[0],
      {
        ...mockDocs[0],
        id: 'doc_cession',
        category: 'certificat_cession',
        title: 'Cerfa 15776',
      },
    ],
  });
  assert.ok(!remindersAfter.some((r) => r.category === 'certificat_cession'));
});

test('inferCategoryFromFileName classifies PDFs and images accurately', () => {
  assert.equal(inferCategoryFromFileName('Carte_Grise_208.pdf', 'application/pdf'), 'carte_grise');
  assert.equal(inferCategoryFromFileName('Cerfa_15776_Cession.pdf', 'application/pdf'), 'certificat_cession');
  assert.equal(inferCategoryFromFileName('photo_avant.jpg', 'image/jpeg'), 'photos_vehicule');
});
