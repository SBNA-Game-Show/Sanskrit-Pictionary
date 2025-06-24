const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CustomError = require('../utils/customError');
const errorCodes = require('../utils/errorCodes');

exports.register = async (req, res, next) => {

  try {

    const { displayName, email, password } = req.body;

    //Check already registered
    const existing = await User.findOne({ email });
    if (existing) {
  throw new CustomError(
    400,
    errorCodes.USER_ALREADY_EXISTS.code,
    errorCodes.USER_ALREADY_EXISTS.message,
    errorCodes.USER_ALREADY_EXISTS.friendlyMessage
  );
}

    
    //Check password strength
    const hash = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({ displayName, email, password: hash, isOnline: true });
    await user.save();

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '2h',
    });

    res.status(201).json({
      message: 'User registered',
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
      },
      token,
    });
  } catch (err) {
     next(err); 
  }
};

exports.login = async (req, res, next) => {
  try {
    
    const { email, password } = req.body;

    //seach user by email
    const user = await User.findOne({ email });
    if (!user) {
      throw new CustomError(
       401,
    errorCodes.USER_NOT_FOUND.code,
    errorCodes.USER_NOT_FOUND.message,
    errorCodes.USER_NOT_FOUND.friendlyMessage
      );
    }

    //Check password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new CustomError(
        401,
    errorCodes.INVALID_PASSWORD.code,
    errorCodes.INVALID_PASSWORD.message,
    errorCodes.INVALID_PASSWORD.friendlyMessage
      );
    }

    // Update user status to online
    user.isOnline = true;
    await user.save();

    //Issuing tokens
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '2h',
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
      },
      token,
    });
  } catch (err) {
     next(err); 
  }
};
