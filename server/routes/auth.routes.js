const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.post("/register", authController.register);
router.post("/login", authController.login);
//router.post('/logout', authController.logout); // 👈 each post or get should be before export

module.exports = router;
