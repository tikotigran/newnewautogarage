import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBrowserLanguage,
  getIntlLocale,
  getLanguageMeta,
  isSupportedLanguage,
  pickLocalized,
  resolveInitialLanguage,
  SUPPORTED_LANGUAGES,
} from './i18nUtils';

test('SUPPORTED_LANGUAGES exposes RU, FR, HY, KA in expected menu order', () => {
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map((l) => l.code),
    ['ru', 'fr', 'hy', 'ka']
  );
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map((l) => l.menuLabel),
    [
      'Русский (RU)',
      'Français (FR)',
      'Հայերեն / Armenian (HY)',
      'ქართული / Georgian (KA)',
    ]
  );
});

test('isSupportedLanguage validates only fr, ru, hy, ka', () => {
  assert.equal(isSupportedLanguage('fr'), true);
  assert.equal(isSupportedLanguage('ru'), true);
  assert.equal(isSupportedLanguage('hy'), true);
  assert.equal(isSupportedLanguage('ka'), true);
  assert.equal(isSupportedLanguage('en'), false);
  assert.equal(isSupportedLanguage(null), false);
});

test('detectBrowserLanguage matches primary and regional subtags cleanly', () => {
  assert.equal(detectBrowserLanguage('hy-AM'), 'hy');
  assert.equal(detectBrowserLanguage('hy'), 'hy');
  assert.equal(detectBrowserLanguage('ka-GE'), 'ka');
  assert.equal(detectBrowserLanguage('ka'), 'ka');
  assert.equal(detectBrowserLanguage('ru-RU'), 'ru');
  assert.equal(detectBrowserLanguage('fr-FR'), 'fr');
  assert.equal(detectBrowserLanguage('fr-CA'), 'fr');
  assert.equal(detectBrowserLanguage(['es-ES', 'ka-GE', 'ru-RU']), 'ka');
  assert.equal(detectBrowserLanguage(['de-DE', 'en-US']), 'fr');
  assert.equal(detectBrowserLanguage(null), 'fr');
});

test('resolveInitialLanguage honors persisted user choice before auto-detecting', () => {
  assert.equal(resolveInitialLanguage('hy', ['ru-RU', 'fr-FR']), 'hy');
  assert.equal(resolveInitialLanguage('ka', ['fr-FR']), 'ka');
  assert.equal(resolveInitialLanguage(null, ['hy-AM', 'en-US']), 'hy');
  assert.equal(resolveInitialLanguage('invalid', ['ru-RU']), 'ru');
  assert.equal(resolveInitialLanguage(undefined, ['en-US']), 'fr');
});

test('getIntlLocale and getLanguageMeta return accurate locale metadata', () => {
  assert.equal(getIntlLocale('fr'), 'fr-FR');
  assert.equal(getIntlLocale('ru'), 'ru-RU');
  assert.equal(getIntlLocale('hy'), 'hy-AM');
  assert.equal(getIntlLocale('ka'), 'ka-GE');
  assert.equal(getLanguageMeta('hy').shortCode, 'HY');
  assert.equal(getLanguageMeta('ka').shortCode, 'KA');
});

test('pickLocalized selects the right variant for all 4 languages', () => {
  const sample = { fr: 'Bonjour', ru: 'Привет', hy: 'Բարև', ka: 'გამარჯობა' };
  assert.equal(pickLocalized('fr', sample), 'Bonjour');
  assert.equal(pickLocalized('ru', sample), 'Привет');
  assert.equal(pickLocalized('hy', sample), 'Բարև');
  assert.equal(pickLocalized('ka', sample), 'გამარჯობა');
});
