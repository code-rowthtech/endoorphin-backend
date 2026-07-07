require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const OTP = require('../models/OTP');
const TrainerProfile = require('../models/TrainerProfile');
const VenueProfile = require('../models/VenueProfile');
const Service = require('../models/Service');
const Amenity = require('../models/Amenity');
const Staff = require('../models/Staff');
const Category = require('../models/Category');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/endoorphin';

// ─── Seed Data ────────────────────────────────────────────────────────────────

const trainerCategories = [
  { name: 'Gym Trainer', type: 'trainer', icon: '🏋️' },
  { name: 'Yoga Coach', type: 'trainer', icon: '🧘' },
  { name: 'Boxing Coach', type: 'trainer', icon: '🥊' },
  { name: 'Zumba Instructor', type: 'trainer', icon: '💃' },
  { name: 'Pilates Instructor', type: 'trainer', icon: '🤸' },
  { name: 'CrossFit Coach', type: 'trainer', icon: '💪' },
  { name: 'Swimming Coach', type: 'trainer', icon: '🏊' },
  { name: 'Personal Trainer', type: 'trainer', icon: '🏃' },
];

const venueCategories = [
  { name: 'Gym', type: 'venue', icon: '🏋️' },
  { name: 'Yoga Centre', type: 'venue', icon: '🧘' },
  { name: 'Boxing', type: 'venue', icon: '🥊' },
  { name: 'Swimming Pool', type: 'venue', icon: '🏊' },
  { name: 'CrossFit Box', type: 'venue', icon: '💪' },
  { name: 'Dance Studio', type: 'venue', icon: '💃' },
  { name: 'Sports Complex', type: 'venue', icon: '🏟️' },
];

const sampleAmenities = ['AC', 'WiFi', 'Parking', 'Shower', 'Locker', 'CCTV', 'Music System', 'Drinking Water', 'Towel Service', 'Juice Bar'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createUser = async (phone, fullName, role) => {
  return User.create({
    phoneNumber: phone,
    fullName,
    role,
    isVerified: true,
    isActive: true,
  });
};

// ─── Main Seed Function ───────────────────────────────────────────────────────

const seed = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🗑️  Clearing existing seed data...');
    await Promise.all([
      User.deleteMany({}),
      OTP.deleteMany({}),
      TrainerProfile.deleteMany({}),
      VenueProfile.deleteMany({}),
      Service.deleteMany({}),
      Amenity.deleteMany({}),
      Staff.deleteMany({}),
      Category.deleteMany({}),
    ]);

    // ── Seed Categories ──────────────────────────────────────────────────────
    console.log('📂 Seeding categories...');
    const categories = await Category.insertMany([...trainerCategories, ...venueCategories]);
    console.log(`   Created ${categories.length} categories`);

    // ── Seed Users ───────────────────────────────────────────────────────────
    console.log('👤 Seeding users...');

    // Explorers
    const explorer1 = await createUser('9876543210', 'Arjun Sharma', 'explorer');
    const explorer2 = await createUser('9876543211', 'Priya Patel', 'explorer');
    const explorer3 = await createUser('9876543212', 'Rohan Mehta', 'explorer');

    // Trainers
    const trainer1 = await createUser('9876543220', 'Vikram Singh', 'trainer');
    const trainer2 = await createUser('9876543221', 'Anita Joshi', 'trainer');
    const trainer3 = await createUser('9876543222', 'Ravi Kumar', 'trainer');

    // Venue Owners
    const owner1 = await createUser('9876543230', 'Suresh Gupta', 'venue_owner');
    const owner2 = await createUser('9876543231', 'Deepika Rao', 'venue_owner');

    console.log('   Created 8 users (3 explorers, 3 trainers, 2 venue owners)');

    // ── Seed Trainer Profiles ─────────────────────────────────────────────────
    console.log('🏋️  Seeding trainer profiles...');

    const trainerProfile1 = await TrainerProfile.create({
      user: trainer1._id,
      fullName: 'Vikram Singh',
      yearsOfExperience: 8,
      shortBio: 'Certified gym trainer and nutrition coach with 8 years of experience. Specializing in weight loss and muscle building.',
      categories: ['Gym Trainer', 'Personal Trainer'],
      serviceTypes: ['In-Person', 'Home Visit'],
      serviceAreas: [
        {
          label: 'Bandra West',
          streetAddress: '14th Road',
          area: 'Bandra West',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
          location: { type: 'Point', coordinates: [72.8369, 19.0596] },
        },
        {
          label: 'Andheri West',
          streetAddress: 'Link Road',
          area: 'Andheri West',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400058',
          location: { type: 'Point', coordinates: [72.8296, 19.1197] },
        },
      ],
      certifications: [
        { name: 'ACE Certified Personal Trainer', uploadedAt: new Date('2020-03-15') },
        { name: 'Nutrition and Fitness Specialist', uploadedAt: new Date('2021-06-20') },
      ],
      profileCompletionPercent: 85,
    });

    const trainerProfile2 = await TrainerProfile.create({
      user: trainer2._id,
      fullName: 'Anita Joshi',
      yearsOfExperience: 5,
      shortBio: 'Yoga and Pilates instructor helping clients find balance, flexibility, and inner peace.',
      categories: ['Yoga Coach', 'Pilates Instructor'],
      serviceTypes: ['In-Person', 'Home Visit', 'Gym Facility'],
      serviceAreas: [
        {
          label: 'Koramangala',
          streetAddress: '80 Feet Road',
          area: 'Koramangala',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560034',
          location: { type: 'Point', coordinates: [77.6245, 12.9352] },
        },
      ],
      certifications: [
        { name: 'Yoga Alliance RYT-200', uploadedAt: new Date('2019-08-10') },
      ],
      profileCompletionPercent: 75,
    });

    const trainerProfile3 = await TrainerProfile.create({
      user: trainer3._id,
      fullName: 'Ravi Kumar',
      yearsOfExperience: 10,
      shortBio: 'Professional boxing coach and Zumba instructor with national-level competition experience.',
      categories: ['Boxing Coach', 'Zumba Instructor'],
      serviceTypes: ['In-Person', 'Gym Facility'],
      serviceAreas: [
        {
          label: 'Connaught Place',
          streetAddress: 'Block A',
          area: 'Connaught Place',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
          location: { type: 'Point', coordinates: [77.2167, 28.6329] },
        },
      ],
      profileCompletionPercent: 70,
    });

    console.log('   Created 3 trainer profiles');

    // ── Seed Venue Profiles ───────────────────────────────────────────────────
    console.log('🏢 Seeding venue profiles...');

    const venue1 = await VenueProfile.create({
      owner: owner1._id,
      companyName: 'FitZone Premium Gym',
      phoneNumber: '02244556677',
      email: 'info@fitzone.com',
      aboutVenue: 'State-of-the-art gym with modern equipment, experienced trainers, and a welcoming community. Open 24/7.',
      address: {
        streetAddress: '45 Hill Road',
        area: 'Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400050',
      },
      location: { type: 'Point', coordinates: [72.8351, 19.0558] },
      profileCompletionPercent: 80,
    });

    // Add services to venue1
    const venue1Services = await Service.insertMany([
      { name: 'Gym', description: 'Full-equipped gym with free weights and machines', venue: venue1._id },
      { name: 'Yoga', description: 'Daily yoga classes for all levels', venue: venue1._id },
      { name: 'Swimming Pool', description: '25-meter heated swimming pool', venue: venue1._id },
      { name: 'Personal Training', description: 'One-on-one personal training sessions', venue: venue1._id },
    ]);

    // Add amenities to venue1
    const venue1Amenities = await Amenity.insertMany(
      ['AC', 'WiFi', 'Parking', 'Shower', 'Locker', 'Juice Bar'].map((name) => ({
        name,
        venue: venue1._id,
      }))
    );

    // Add staff to venue1
    const venue1Staff = await Staff.insertMany([
      {
        venue: venue1._id,
        name: 'Kiran Nair',
        role: 'Trainer',
        phoneNumber: '9988776655',
        yearsOfExperience: 4,
        expertise: 'Strength Training',
      },
      {
        venue: venue1._id,
        name: 'Pradeep Shetty',
        role: 'Manager',
        phoneNumber: '9988776644',
        yearsOfExperience: 7,
        expertise: 'Operations',
      },
    ]);

    // Link services, amenities, staff to venue1
    venue1.services = venue1Services.map((s) => s._id);
    venue1.amenities = venue1Amenities.map((a) => a._id);
    venue1.staff = venue1Staff.map((s) => s._id);
    venue1.profileCompletionPercent = venue1.calculateCompletion();
    await venue1.save();

    // Venue 2
    const venue2 = await VenueProfile.create({
      owner: owner2._id,
      companyName: 'Serenity Yoga & Wellness',
      phoneNumber: '08023456789',
      email: 'hello@serenity.com',
      aboutVenue: 'A tranquil yoga and wellness center offering yoga, meditation, and Pilates in a peaceful environment.',
      address: {
        streetAddress: 'MG Road',
        area: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
      },
      location: { type: 'Point', coordinates: [77.6408, 12.9784] },
      profileCompletionPercent: 70,
    });

    const venue2Services = await Service.insertMany([
      { name: 'Yoga', description: 'Hatha, Vinyasa, and Restorative yoga', venue: venue2._id },
      { name: 'Meditation', description: 'Guided meditation and mindfulness sessions', venue: venue2._id },
      { name: 'Pilates', description: 'Mat and reformer Pilates classes', venue: venue2._id },
    ]);

    const venue2Amenities = await Amenity.insertMany(
      ['AC', 'WiFi', 'Shower', 'Locker', 'CCTV', 'Drinking Water'].map((name) => ({
        name,
        venue: venue2._id,
      }))
    );

    const venue2Staff = await Staff.insertMany([
      {
        venue: venue2._id,
        name: 'Meera Krishnan',
        role: 'Coach',
        phoneNumber: '9977665544',
        yearsOfExperience: 6,
        expertise: 'Yoga and Meditation',
      },
    ]);

    venue2.services = venue2Services.map((s) => s._id);
    venue2.amenities = venue2Amenities.map((a) => a._id);
    venue2.staff = venue2Staff.map((s) => s._id);
    venue2.profileCompletionPercent = venue2.calculateCompletion();
    await venue2.save();

    console.log('   Created 2 venues with services, amenities, and staff');

    // ── Print summary ─────────────────────────────────────────────────────────
    console.log('\n✅ Seed completed successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Seed Summary:');
    console.log(`   Categories:      ${categories.length}`);
    console.log(`   Users:           8 (3 explorers, 3 trainers, 2 venue owners)`);
    console.log(`   Trainer Profiles: 3`);
    console.log(`   Venues:          2`);
    console.log(`   Services:        ${venue1Services.length + venue2Services.length}`);
    console.log(`   Amenities:       ${venue1Amenities.length + venue2Amenities.length}`);
    console.log(`   Staff Members:   ${venue1Staff.length + venue2Staff.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📱 Test Phone Numbers (OTP: 1234 in dev mode):');
    console.log('   Explorer:    9876543210 (Arjun Sharma)');
    console.log('   Trainer:     9876543220 (Vikram Singh)');
    console.log('   Venue Owner: 9876543230 (Suresh Gupta)');
    console.log('\n🆔 Key IDs for testing:');
    console.log(`   Trainer Profile 1: ${trainerProfile1._id}`);
    console.log(`   Venue 1:           ${venue1._id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
};

seed();
