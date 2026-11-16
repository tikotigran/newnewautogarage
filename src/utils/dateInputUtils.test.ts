import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIsoToLocaleDate,
  formatTypingDateInput,
  getCalendarDaysGrid,
  getDatePlaceholder,
  isValidCalendarDate,
  parseLocaleDateToIso,
} from './dateInputUtils';

test('getDatePlaceholder returns locale-specific date masks', () => {
  assert.equal(getDatePlaceholder('fr'), 'jj/mm/aaaa');
  assert.equal(getDatePlaceholder('ru'), 'дд.мм.гггг');
  assert.equal(getDatePlaceholder('hy'), 'օր.ամ.տարի');
  assert.equal(getDatePlaceholder('ka'), 'დდ.თთ.წწწწ');
});

test('formatIsoToLocaleDate formats ISO dates according to active language', () => {
  assert.equal(formatIsoToLocaleDate('2026-11-16', 'fr'), '16/11/2026');
  assert.equal(formatIsoToLocaleDate('2026-11-16', 'ru'), '16.11.2026');
  assert.equal(formatIsoToLocaleDate('2026-11-16', 'hy'), '16.11.2026');
  assert.equal(formatIsoToLocaleDate('2026-11-16', 'ka'), '16.11.2026');
  assert.equal(formatIsoToLocaleDate('', 'fr'), '');
});

test('parseLocaleDateToIso validates calendar dates and normalizes separators', () => {
  assert.equal(parseLocaleDateToIso('16/11/2026'), '2026-11-16');
  assert.equal(parseLocaleDateToIso('16.11.2026'), '2026-11-16');
  assert.equal(parseLocaleDateToIso('5/4/2026'), '2026-04-05');
  assert.equal(parseLocaleDateToIso('2026-11-16'), '2026-11-16');
  assert.equal(parseLocaleDateToIso('29/02/2024'), '2024-02-29');
  assert.equal(parseLocaleDateToIso('29/02/2025'), null);
  assert.equal(parseLocaleDateToIso('31/04/2026'), null);
  assert.equal(parseLocaleDateToIso('99/99/2026'), null);
  assert.equal(parseLocaleDateToIso(''), null);
});

test('formatTypingDateInput inserts locale separators while preserving backspace', () => {
  assert.equal(formatTypingDateInput('16', '1', '/'), '16/');
  assert.equal(formatTypingDateInput('1611', '16/1', '/'), '16/11/');
  assert.equal(formatTypingDateInput('16112026', '16/11/202', '/'), '16/11/2026');
  assert.equal(formatTypingDateInput('16.11.2026', '16.11.202', '.'), '16.11.2026');
  assert.equal(formatTypingDateInput('16/', '16/1', '/'), '16/');
  assert.equal(isValidCalendarDate(2024, 2, 29), true);
});

test('getCalendarDaysGrid builds Monday-first 7-column weeks', () => {
  // November 2026 starts on Sunday (offset 6) and has 30 days -> 5 weeks * 7 = 35 or 6 weeks * 7 = 42
  const grid = getCalendarDaysGrid(2026, 10);
  assert.equal(grid.length % 7, 0);
  assert.equal(grid[6], 1);
  assert.equal(grid.filter((d) => d !== null).length, 30);
});
