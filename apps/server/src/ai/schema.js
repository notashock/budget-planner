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

  const resolvedType = (type === 'recurring') ? 'recurring' : 'one-time';

  const sanitized = {
    name: name.trim(),
    type: resolvedType,
    priority: typeof data.priority === 'number' ? data.priority : 0
  };

  if (typeof data.amount !== 'number') {
    throw new Error("Draft item must contain a numeric 'amount' (in minor units)");
  }
  sanitized.amount = Math.round(data.amount);

  if (resolvedType === 'one-time') {
    sanitized.day = typeof data.day === 'number' ? Math.max(1, Math.min(31, Math.floor(data.day))) : 1;
  } else {
    sanitized.dayOfMonth = typeof data.dayOfMonth === 'number' ? Math.max(1, Math.min(31, Math.floor(data.dayOfMonth))) : 1;
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
