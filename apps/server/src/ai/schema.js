/**
 * Strict schema validation for AI model outputs.
 * Rejects model output that does not conform.
 */

export function validateDraftItemSchema(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Model output must be an object');
  }

  const { name, type } = data;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error("Model output must contain a non-empty string 'name'");
  }

  if (!['one-time', 'recurring', 'formula'].includes(type)) {
    throw new Error(`Invalid item type '${type}'. Must be 'one-time', 'recurring', or 'formula'`);
  }

  const sanitized = {
    name: name.trim(),
    type,
    priority: typeof data.priority === 'number' ? data.priority : 0
  };

  if (type === 'one-time') {
    if (typeof data.amount !== 'number') {
      throw new Error("One-time item must contain a numeric 'amount' (in minor units)");
    }
    sanitized.amount = Math.round(data.amount);
    sanitized.day = typeof data.day === 'number' ? Math.max(1, Math.min(31, Math.floor(data.day))) : 1;
  } else if (type === 'recurring') {
    if (typeof data.amount !== 'number') {
      throw new Error("Recurring item must contain a numeric 'amount' (in minor units)");
    }
    sanitized.amount = Math.round(data.amount);
    sanitized.dayOfMonth = typeof data.dayOfMonth === 'number' ? Math.max(1, Math.min(31, Math.floor(data.dayOfMonth))) : 1;
  } else if (type === 'formula') {
    const cfg = data.formulaConfig;
    if (!cfg || typeof cfg !== 'object') {
      throw new Error("Formula item must contain 'formulaConfig' object");
    }
    sanitized.formulaConfig = {
      distance: typeof cfg.distance === 'number' ? cfg.distance : 0,
      efficiency: typeof cfg.efficiency === 'number' && cfg.efficiency > 0 ? cfg.efficiency : 1,
      fuelPrice: typeof cfg.fuelPrice === 'number' ? Math.round(cfg.fuelPrice) : 0,
      extraCost: typeof cfg.extraCost === 'number' ? Math.round(cfg.extraCost) : 0,
      dates: Array.isArray(cfg.dates)
        ? cfg.dates.map((d) => Math.max(1, Math.min(31, Math.floor(Number(d) || 1))))
        : []
    };
  }

  return sanitized;
}

export function validateExplanationSchema(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Model output must be an object');
  }

  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new Error("Model output must contain a non-empty string 'summary'");
  }

  if (!Array.isArray(data.suggestions)) {
    throw new Error("Model output must contain an array of 'suggestions'");
  }

  return {
    summary: data.summary.trim(),
    suggestions: data.suggestions.filter((s) => typeof s === 'string').map((s) => s.trim())
  };
}
