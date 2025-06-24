const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

app.use(requestLogger);
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

//404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
