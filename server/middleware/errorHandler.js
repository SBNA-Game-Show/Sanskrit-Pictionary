//Setup error handling 
const CustomError = require('../utils/customError');

const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  const isCustom = err instanceof CustomError;
  const statusCode = err.statusCode || 500;

  //Prints detailed stack(dvp only)
  if (isDev) {
    console.error(err.stack);
  } else {
    console.error(`[${err.name}] ${err.message}`);
  }

  //CustomError
  if (isCustom) {
    return res.status(statusCode).json({
      success: false,
      errorCode: err.errorCode || 'ERR_CUSTOM',
      error: err.message,
      message: err.friendlyMessage || err.message,
      ...(isDev && { stack: err.stack })
    });
  }

  //Authentication Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      errorCode: 'ERR_VALIDATION',
      error: 'MongoDB Validation Error',
      message: messages[0],
      ...(isDev && { stack: err.stack })
    });
  }

  //Unique index conflict
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({
      success: false,
      errorCode: 'ERR_DUPLICATE_KEY',
      error: 'Duplicate field value',
      message: `This ${field} is already in use.`,
      ...(isDev && { stack: err.stack })
    });
  }

  //Unknown server error
  return res.status(statusCode).json({
    success: false,
    errorCode: 'ERR_SERVER',
    error: err.message || 'Server Error',
    message: 'Something went wrong. Please try again later.',
    ...(isDev && { stack: err.stack })
  });
};

module.exports = errorHandler;

