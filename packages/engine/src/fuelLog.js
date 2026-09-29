/**
 * Bike fuel stop and efficiency calculations.
 */

/**
 * Calculates fuel efficiency between consecutive fuel stops.
 * 
 * @param {Array<{ date: string, odometer: number, fuelVolume: number, fuelCost: number }>} stops
 * @returns {{
 *   stopsWithEfficiency: Array<object>,
 *   totalDistance: number,
 *   totalFuelVolume: number,
 *   totalFuelCost: number,
 *   averageEfficiency: number | null
 * }}
 */
export function calculateFuelEfficiency(stops = []) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return {
      stopsWithEfficiency: [],
      totalDistance: 0,
      totalFuelVolume: 0,
      totalFuelCost: 0,
      averageEfficiency: null
    };
  }

  // Sort chronologically by date, then odometer
  const sortedStops = [...stops].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.odometer || 0) - (b.odometer || 0);
  });

  let totalDistance = 0;
  let totalFuelVolume = 0;
  let totalFuelCost = 0;

  const stopsWithEfficiency = sortedStops.map((stop, idx) => {
    const fuelCost = Math.round(Number(stop.fuelCost) || 0);
    const fuelVolume = Number(stop.fuelVolume) || 0;
    const odometer = Number(stop.odometer) || 0;

    totalFuelCost += fuelCost;
    totalFuelVolume += fuelVolume;

    if (idx === 0) {
      return {
        ...stop,
        fuelCost,
        fuelVolume,
        odometer,
        distanceTraveled: 0,
        efficiency: null, // First stop is the baseline
        isBaseline: true
      };
    }

    const prevOdometer = Number(sortedStops[idx - 1].odometer) || 0;
    const distanceTraveled = Math.max(0, odometer - prevOdometer);
    totalDistance += distanceTraveled;

    // Efficiency: distance / fuelVolume (e.g. km/L)
    const efficiency = fuelVolume > 0
      ? Math.round((distanceTraveled / fuelVolume) * 100) / 100
      : null;

    return {
      ...stop,
      fuelCost,
      fuelVolume,
      odometer,
      distanceTraveled,
      efficiency,
      isBaseline: false
    };
  });

  // Calculate overall average efficiency
  // Only include fuel volume for stops that measured distance (i.e. from 2nd stop onward)
  const measuredVolume = stopsWithEfficiency
    .slice(1)
    .reduce((sum, s) => sum + s.fuelVolume, 0);

  const averageEfficiency = measuredVolume > 0 && totalDistance > 0
    ? Math.round((totalDistance / measuredVolume) * 100) / 100
    : null;

  return {
    stopsWithEfficiency,
    totalDistance,
    totalFuelVolume,
    totalFuelCost,
    averageEfficiency
  };
}
