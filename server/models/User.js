const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isAccepted: { type: Boolean, default: false },
  receivedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date },
  status: { type: String, default: 'pending' }
}, { _id: false });

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isTeamLeader: { type: Boolean, default: false },
  isOnline: { type: Boolean, default: false },
  roles: { type: [String], default: ['USER'] },
  teamID: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  hostedSessions: [{ type: String }],
  invitations: [invitationSchema]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
