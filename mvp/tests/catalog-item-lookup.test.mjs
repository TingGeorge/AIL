import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CatalogItemIdsError,
  MAX_CATALOG_ITEM_IDS,
  parseCatalogItemIds,
  selectCatalogItemsByIds,
} from '../lib/catalog-item-lookup.ts';

test('catalog item ids are validated, deduplicated, and retain request order', () => {
  assert.deepEqual(
    parseCatalogItemIds('PLACE:one,OPPORTUNITY:event_2,PLACE:one'),
    ['PLACE:one', 'OPPORTUNITY:event_2'],
  );
  assert.deepEqual(parseCatalogItemIds(''), []);
});

test('catalog item ids reject unsupported and oversized requests', () => {
  assert.throws(
    () => parseCatalogItemIds('demo-only-id'),
    (error) =>
      error instanceof CatalogItemIdsError && error.code === 'INVALID_IDS',
  );
  assert.throws(
    () =>
      parseCatalogItemIds(
        Array.from(
          { length: MAX_CATALOG_ITEM_IDS + 1 },
          (_, index) => `PLACE:item_${index}`,
        ).join(','),
      ),
    (error) =>
      error instanceof CatalogItemIdsError && error.code === 'TOO_MANY_IDS',
  );
});

test('catalog item selection follows request order and reports missing ids', () => {
  assert.deepEqual(
    selectCatalogItemsByIds(
      [
        { id: 'PLACE:one', title: 'One' },
        { id: 'PLACE:two', title: 'Two' },
      ],
      ['PLACE:two', 'PLACE:missing', 'PLACE:one'],
    ),
    {
      items: [
        { id: 'PLACE:two', title: 'Two' },
        { id: 'PLACE:one', title: 'One' },
      ],
      missingIds: ['PLACE:missing'],
    },
  );
});
