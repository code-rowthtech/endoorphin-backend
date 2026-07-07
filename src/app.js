require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const trainerRoutes = require('./routes/trainer.routes');
const venueRoutes = require('./routes/venue.routes');
const serviceRoutes = require('./routes/service.routes');
const amenityRoutes = require('./routes/amenity.routes');
const amenityStandaloneRoutes = require('./routes/amenityStandalone.routes');
const { venueStaffRouter, staffRouter } = require('./routes/staff.routes');
const categoryRoutes = require('./routes/category.routes');
const searchRoutes = require('./routes/search.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const uploadRoutes = require('./routes/upload.routes');

const { errorHandler, notFound } = require('./middlewares/error.middleware');

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Morgan logging — use 'dev' in development, 'combined' in production
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Endoorphin API is running',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    },
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainers', trainerRoutes);

// Venue routes — amenity and staff sub-routes via mergeParams
app.use('/api/venues/:venueId/amenities', amenityRoutes);
app.use('/api/venues/:venueId/staff', venueStaffRouter);
app.use('/api/venues', venueRoutes);

// Standalone amenity and staff routes
app.use('/api/amenities', amenityStandaloneRoutes);
app.use('/api/staff', staffRouter);

app.use('/api/services', serviceRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/upload', uploadRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use(notFound);

// ─── Centralized Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
