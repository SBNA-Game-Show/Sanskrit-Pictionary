//CustomError class to handle application-specific errors
class CustomError extends Error {
  constructor(statusCode, code, message, friendlyMessage) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.friendlyMessage = friendlyMessage;
  }
}

module.exports = CustomError;