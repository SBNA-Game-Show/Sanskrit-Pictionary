const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  teamName: { type: String, required: true },
  teamLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chatChannelId: { type: String },
  constraints: {
    minPlayersPerTeam: { type: Number, default: 2 },
    maxPlayersPerTeam: { type: Number, default: 4 }
  },
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
