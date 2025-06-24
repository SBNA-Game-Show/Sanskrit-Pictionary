const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { check, validationResult } = require('express-validator');
const CustomError = require('../utils/customError');

router.post(
  '/register',
  [
    check('displayName', 'Display name is required').notEmpty(),
    check('email', 'Valid email is required').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new CustomError(errors.array()[0].msg, 400));
      }
      next();
    }
  ],
  authController.register
);

router.post(
  '/login',
  [
    check('email', 'Valid email is required').isEmail(),
    check('password', 'Password is required').notEmpty()
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new CustomError(errors.array()[0].msg, 400));
    }
    next();
  },
  authController.login
);

module.exports = router;
