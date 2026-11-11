import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAdminDashboardMetrics,
  DEFAULT_DYNAMIC_EXPENSE_CATEGORIES,
  DEFAULT_SUBSCRIPTION_PLANS,
  isSuperAdminUser,
  resolveLocalizedLabel,
  sortExpenseCategories,
  SUPERADMIN_BOOTSTRAP_EMAIL,
} from './adminUtils';
import { UserProfile } from '../types/garage';

const mockAccounts: UserProfile[] = [
  {
    uid: 'u1',
    email: SUPERADMIN_BOOTSTRAP_EMAIL,
    displayName: 'Admin',
    garageName: 'AutoGarage HQ',
    role: 'superadmin',
    planId: 'enterprise',
    vehicleLimit: 9999,
    activeVehiclesCount: 12,
    subscriptionStatus: 'active',
    mrrAmount: 149,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u2',
    email: 'garage.lyon@example.fr',
    displayName: 'Marc Dupont',
    garageName: 'Lyon Auto Select',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 18,
    subscriptionStatus: 'active',
    mrrAmount: 49,
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u3',
    email: 'paris.vo@example.fr',
    displayName: 'Sophie Martin',
    garageName: 'Paris VO',
    role: 'user',
    planId: 'starter',
    vehicleLimit: 5,
    activeVehiclesCount: 3,
    subscriptionStatus: 'trial',
    mrrAmount: 0,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  {
    uid: 'u4',
    email: 'late@example.fr',
    displayName: 'Luc Bernard',
    garageName: 'Sud Occasion',
    role: 'user',
    planId: 'pro',
    vehicleLimit: 50,
    activeVehiclesCount: 7,
    subscriptionStatus: 'past_due',
    mrrAmount: 49,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];

test('isSuperAdminUser strictly enforces superadmin role or verified bootstrap email', () => {
  assert.equal(isSuperAdminUser({ email: 'user@example.com', profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: null, profile: null }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: false, profile: { role: 'user' } }), false);
  assert.equal(isSuperAdminUser({ email: SUPERADMIN_BOOTSTRAP_EMAIL, emailVerified: true, profile: { role: 'user' } }), true);
  assert.equal(isSuperAdminUser({ email: 'other@example.com', profile: { role: 'superadmin' } }), true);
});

test('computeAdminDashboardMetrics calculates totalUsers, activeGarages, and MRR accurately', () => {
  const metrics = computeAdminDashboardMetrics(mockAccounts, DEFAULT_SUBSCRIPTION_PLANS);
  assert.equal(metrics.totalUsers, 4);
  assert.equal(metrics.activeGarages, 3); // 2 active + 1 trial
  assert.equal(metrics.monthlyRevenueMRR, 198); // 149 + 49 (past_due excluded from active MRR)
  assert.equal(metrics.totalActiveVehicles, 40);
  assert.equal(metrics.trialAccounts, 1);
  assert.equal(metrics.pastDueAccounts, 1);
  assert.equal(metrics.planCounts.enterprise, 1);
  assert.equal(metrics.planCounts.pro, 2);
  assert.equal(metrics.planCounts.starter, 1);
});

test('sortExpenseCategories sorts categories by order ascending', () => {
  const reversed = [...DEFAULT_DYNAMIC_EXPENSE_CATEGORIES].reverse();
  const sorted = sortExpenseCategories(reversed);
  assert.equal(sorted[0].id, 'transport');
  assert.equal(sorted[sorted.length - 1].id, 'other');
});

test('resolveLocalizedLabel returns override when set and falls back to baseText', () => {
  const overrides = { appName: { fr: 'Mon Garage Pro', ru: 'Мой Автосалон' } };
  assert.equal(resolveLocalizedLabel('appName', 'fr', 'AutoGarage Manager', overrides), 'Mon Garage Pro');
  assert.equal(resolveLocalizedLabel('appName', 'ru', 'AutoGarage Manager', overrides), 'Мой Автосалон');
  assert.equal(resolveLocalizedLabel('newVehicle', 'fr', 'Nouveau Véhicule', overrides), 'Nouveau Véhicule');
});

