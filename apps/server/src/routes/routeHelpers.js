// Wraps an async handler so a rejected promise reaches the error middleware
export const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// [year, month] from /:year/:month route params
export function yearMonth(req) {
  return [Number(req.params.year), Number(req.params.month)];
}
