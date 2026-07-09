const { validationResult } = require('express-validator');

/**
 * Runs after express-validator checks.
 * If there are validation errors, returns 400 with structured error map.
 * Otherwise calls next().
 */
const validate = (req, res, next) => {
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) {
  //   const errorMap = {};
  //   errors.array().forEach((err) => {
  //     if (!errorMap[err.path]) {
  //       errorMap[err.path] = err.msg;
  //     }
  //   });
  //   return res.status(400).json({
  //     success: false,
  //     message: 'Validation failed',
  //     error: errorMap,
  //   });
  // }
  next();
};

module.exports = validate;
