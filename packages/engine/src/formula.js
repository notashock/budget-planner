/**
 * Pure formula calculation for usage-based expenses (such as travel/fuel).
 * 
 * Spec:
 * Per-occurrence cost = distance / efficiency * fuel price + extra, rounded to a whole unit.
 */

/**
 * Calculates per-occurrence cost for a formula item.
 * 
 * @param {object} params
 * @param {number} params.distance - Distance per occurrence (e.g. km or miles)
 * @param {number} params.efficiency - Efficiency (e.g. km/L or MPG), must be > 0
 * @param {number} params.fuelPrice - Fuel price per unit in minor units (or major units if scale is 1)
 * @param {number} [params.extraCost=0] - Extra cost per occurrence in minor units (or major units if scale is 1)
 * @param {number} [params.scale=100] - Minor unit factor (e.g. 100 for cents/minor units, 1 for whole units)
 * @returns {number} Cost per occurrence in minor units (always an integer)
 */
export function calculateFormulaCost({
  distance,
  efficiency,
  fuelPrice,
  extraCost = 0,
  scale = 100
}) {
  if (!efficiency || efficiency <= 0) {
    throw new Error('Efficiency must be greater than zero');
  }
  if (distance < 0) {
    throw new Error('Distance cannot be negative');
  }

  // Convert fuel price and extra cost to major units for rounding calculation
  const fuelMajor = scale > 1 ? fuelPrice / scale : fuelPrice;
  const extraMajor = scale > 1 ? extraCost / scale : extraCost;

  // Formula: distance / efficiency * fuel price + extra, rounded to a whole unit
  const majorCost = Math.round((distance / efficiency) * fuelMajor + extraMajor);

  // Return integer minor units
  return Math.round(majorCost * scale);
}
