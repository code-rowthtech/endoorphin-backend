const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

dotenv.config({ path: __dirname + '/../.env' }); // Make sure env path is correct if they have one

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://shubhamrwt789:u62dkzbWYxZgkMPk@bmglocal.efxvrak.mongodb.net/endorphin', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB...');

    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      console.log('Super Admin already exists with email:', existingAdmin.email);
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@1234', salt);

    const newAdmin = new User({
      fullName: 'System Admin',
      phoneNumber: '9090909090',
      email: 'admin@endoorphin.com',
      password: hashedPassword,
      countryCode: '+91',
      role: 'super_admin',
      isVerified: true,
      isActive: true,
    });

    await newAdmin.save();
    console.log('Super Admin created successfully with email: admin@endoorphin.com and password: admin123');
    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();
