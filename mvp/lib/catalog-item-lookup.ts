export const MAX_CATALOG_ITEM_IDS = 100;

const catalogItemIdPattern =
  /^(?:PLACE|OPPORTUNITY):[A-Za-z0-9_.:-]{1,148}$/;

export class CatalogItemIdsError extends Error {
  readonly code: 'INVALID_IDS' | 'TOO_MANY_IDS';

  constructor(
    code: 'INVALID_IDS' | 'TOO_MANY_IDS',
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'CatalogItemIdsError';
  }
}

export function parseCatalogItemIds(value: string | null) {
  if (value === null || value.trim() === '') return [];
  const requested = value.split(',').map((id) => id.trim());
  if (requested.length > MAX_CATALOG_ITEM_IDS) {
    throw new CatalogItemIdsError(
      'TOO_MANY_IDS',
      `A maximum of ${MAX_CATALOG_ITEM_IDS} catalog item ids is allowed.`,
    );
  }
  if (requested.some((id) => !catalogItemIdPattern.test(id))) {
    throw new CatalogItemIdsError(
      'INVALID_IDS',
      'Catalog item ids must use a supported PLACE: or OPPORTUNITY: id.',
    );
  }
  return [...new Set(requested)];
}

export function selectCatalogItemsByIds<T extends { id: string }>(
  items: T[],
  ids: string[],
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    items: ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    }),
    missingIds: ids.filter((id) => !byId.has(id)),
  };
}
