import type { Product } from '../types/models'

/**
 * Does this product (pass / subscription) grant entry to a class of the given
 * type? A product's `allowedClassTypes` is a POSITIVE permission list of tenant
 * classType ids; `null` / absent / empty means "every class type" (the default,
 * matching the codebase's 'empty = all' convention). A non-empty list restricts
 * the product to those class types only — a yoga-only pass never covers pilates.
 *
 * This is the single source of truth for the product→classType direction, so
 * config surfaces and any future booking flow enforce the same rule.
 */
export function productCoversClassType(
  product: Pick<Product, 'allowedClassTypes'>,
  classTypeId: string,
): boolean {
  const allowed = product.allowedClassTypes
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(classTypeId)
}
