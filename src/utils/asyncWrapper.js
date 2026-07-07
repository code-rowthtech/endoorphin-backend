/**
 * Wraps an async controller function to catch errors and pass them to next().
 * Eliminates the need for try/catch in every controller.
 * @param {Function} fn - Async controller function
 * @returns {Function} Express middleware function
 */
const asyncWrapper = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncWrapper;
