import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeVehicleCostRows,
  QUICK_EXPENSE_PRESETS,
  resolveVehicleQuickFlags,
  validateQuickExpenseInput,
} from './quickListUtils';
import type { GeneralExpense, RepairTask } from '../types/garage';

test('QUICK_EXPENSE_PRESETS includes CT, tires, parts/repair, and oil/filters with valid category IDs', () => {
  const ids = QUICK_EXPENSE_PRESETS.map((p) => p.id);
  assert.ok(ids.includes('ct'));
  assert.ok(ids.includes('tires'));
  assert.ok(ids.includes('parts_repair'));
  assert.ok(ids.includes('oil_filters'));
  for (const preset of QUICK_EXPENSE_PRESETS) {
    assert.match(preset.category, /^[a-zA-Z0-9_\-]+$/);
    assert.ok(preset.chipLabel.ru.trim().length > 0);
    assert.ok(preset.chipLabel.fr.trim().length > 0);
  }
});

test('validateQuickExpenseInput rejects empty descriptions and non-positive amounts, normalizes valid input', () => {
  const badDesc = validateQuickExpenseInput({
    category: 'controle_technique',
    description: '   ',
    rawAmount: '85',
    lang: 'ru',
  });
  assert.equal(badDesc.valid, false);

  const badAmount = validateQuickExpenseInput({
    category: 'controle_technique',
    description: 'Техосмотр (CT)',
    rawAmount: '0',
    lang: 'ru',
  });
  assert.equal(badAmount.valid, false);

  const valid = validateQuickExpenseInput({
    category: 'controle_technique',
    description: '  Техосмотр (CT)  ',
    rawAmount: '85,50',
    date: '2026-10-18',
    lang: 'ru',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.normalized, {
    category: 'controle_technique',
    description: 'Техосмотр (CT)',
    amount: 85.5,
    date: '2026-10-18',
  });
});

test('mergeVehicleCostRows merges vehicle expenses and repairs without duplicates sorted newest first', () => {
  const expenses: GeneralExpense[] = [
    {
      id: 'exp-1',
      vehicleId: 'v1',
      userId: 'u1',
      category: 'controle_technique',
      description: 'CT Dekra',
      amount: 85,
      date: '2026-10-18',
      createdAt: '2026-10-18T10:00:00Z',
      updatedAt: '2026-10-18T10:00:00Z',
    },
    {
      id: 'exp-1',
      vehicleId: 'v1',
      userId: 'u1',
      category: 'controle_technique',
      description: 'CT Dekra',
      amount: 85,
      date: '2026-10-18',
      createdAt: '2026-10-18T10:00:00Z',
      updatedAt: '2026-10-18T10:00:00Z',
    },
    {
      id: 'exp-other',
      vehicleId: 'v2',
      userId: 'u1',
      category: 'transport',
      description: 'Other car',
      amount: 150,
      date: '2026-10-19',
      createdAt: '2026-10-19T10:00:00Z',
      updatedAt: '2026-10-19T10:00:00Z',
    },
  ];
  const repairs: RepairTask[] = [
    {
      id: 'rep-1',
      vehicleId: 'v1',
      userId: 'u1',
      title: 'Vidange',
      status: 'done',
      partsCost: 90,
      laborCost: 60,
      totalCost: 150,
      date: '2026-10-19',
      createdAt: '2026-10-19T12:00:00Z',
      updatedAt: '2026-10-19T12:00:00Z',
    },
  ];

  const rows = mergeVehicleCostRows('v1', expenses, repairs);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'rep-1');
  assert.equal(rows[0].amount, 150);
  assert.equal(rows[1].id, 'exp-1');
  assert.equal(rows[1].amount, 85);
});

test('resolveVehicleQuickFlags defaults unset boolean flags to false', () => {
  assert.deepEqual(resolveVehicleQuickFlags({}), { ctPassed: false, docsCompleted: false });
  assert.deepEqual(resolveVehicleQuickFlags({ ctPassed: true, docsCompleted: false }), {
    ctPassed: true,
    docsCompleted: false,
  });
});
