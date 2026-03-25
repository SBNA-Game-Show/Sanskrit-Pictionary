const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");

dotenv.config();

async function main() {
  const targetUserId = process.argv[2] || process.env.ADMIN_USER_ID;
  if (!targetUserId) {
    throw new Error("Usage: node scripts/setSingleAdmin.js <userId> (or set ADMIN_USER_ID)");
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in environment");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new Error(`User not found: ${targetUserId}`);
  }

  await User.updateMany({}, { $pull: { roles: "ADMIN" } });
  await User.updateOne(
    { _id: targetUserId },
    {
      $addToSet: { roles: "ADMIN" },
    },
  );

  const admins = await User.find({ roles: "ADMIN" }).select("_id displayName email roles");
  console.log("Single admin assignment completed.");
  console.log(JSON.stringify(admins, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to set single admin:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
