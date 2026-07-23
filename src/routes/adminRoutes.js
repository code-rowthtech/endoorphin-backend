const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const { uploadAny } = require('../middlewares/upload.middleware');

// Public route (super_admin login)
router.post('/login', adminController.adminLogin);

// Protect all routes below
router.use(protect);
router.use(restrictTo('super_admin'));

// --- Dashboard ---
router.get('/dashboard', restrictTo('super_admin'), adminController.getDashboardStats);

// --- Users ---
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);

// Venues
router.post('/venues', uploadAny(), adminController.createVenue);
router.get('/venues', adminController.getAllVenues);
router.put('/venues/:id', uploadAny(), adminController.updateVenue);
router.patch('/venues/:id/status', adminController.toggleVenueStatus);
router.delete('/venues/:id', adminController.deleteVenue);

// Trainers
router.post('/trainers', uploadAny(), adminController.createTrainer);
router.put('/trainers/:id', uploadAny(), adminController.updateTrainer);
router.get('/trainers', adminController.getAllTrainers);
router.get('/trainers/:id', adminController.getTrainerById);
router.patch('/trainers/:id/approval', adminController.approveRejectTrainer);
router.post('/documentApproveRejectByAdmin', adminController.approveRejectDocument);
router.patch('/trainers/:id/status', adminController.toggleTrainerStatus);
router.delete('/trainers/:id', adminController.deleteTrainer);

// Amenities
router.post('/amenities', adminController.createAmenity);
router.get('/amenities', adminController.getAllAmenities);
router.put('/amenities/:id', adminController.updateAmenity);
router.patch('/amenities/:id/status', adminController.toggleAmenityStatus);
router.delete('/amenities/:id', adminController.deleteAmenity);

// Categories
router.post('/categories', adminController.createCategory);
router.get('/categories', adminController.getAllCategories);
router.patch('/categories/:id/status', adminController.toggleCategoryStatus);
router.delete('/categories/:id', adminController.deleteCategory);

// Services
router.post('/services', adminController.createService);
router.get('/services', adminController.getAllServices);
router.put('/services/:id', adminController.updateService);
router.patch('/services/:id/status', adminController.toggleServiceStatus);
router.delete('/services/:id', adminController.deleteService);

// Service Types
router.post('/service-types', adminController.createServiceType);
router.get('/service-types', adminController.getAllServiceTypes);
router.put('/service-types/:id', adminController.updateServiceType);
router.patch('/service-types/:id/status', adminController.toggleServiceTypeStatus);
router.delete('/service-types/:id', adminController.deleteServiceType);

module.exports = router;
