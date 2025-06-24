//Assign a unique error code to each error
module.exports = {
  USER_ALREADY_EXISTS: {
    code: 'ERR_USER_EXISTS',
    message: 'User already exists.',
    friendlyMessage: 'This email address is already in use.'
  },
  USER_NOT_FOUND: {
    code: 'ERR_USER_NOT_FOUND',
    message: 'User not found.',
    friendlyMessage: 'No account found with this email.'
  },
  INVALID_PASSWORD: {
    code: 'ERR_INVALID_PASSWORD',
    message: 'Invalid password.',
    friendlyMessage: 'The password you entered is incorrect.'
  },
  VALIDATION_ERROR: {
    code: 'ERR_VALIDATION',
    message: 'Validation error.',
    friendlyMessage: 'Please correct the input fields.'
  },
  SERVER_ERROR: {
    code: 'ERR_SERVER',
    message: 'Server error.',
    friendlyMessage: 'Something went wrong. Please try again later.'
  }
};