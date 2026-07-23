const mongoose = require('mongoose');
const User = require('../models/User');
const VenueProfile = require('../models/VenueProfile');
const TrainerProfile = require('../models/TrainerProfile');
const Amenity = require('../models/Amenity');
const Category = require('../models/Category');
const Service = require('../models/Service');
const generateToken = require('../utils/generateToken');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { sendSMS } = require('../middlewares/twilio.middleware');
const { sendEmail } = require('../utils/email');

const bcrypt = require('bcryptjs');
const { getFileUrl } = require('../middlewares/upload.middleware');
const ServiceType = require('../models/ServiceType');

const parseJSONField = (field) => {
  if (!field) return field;
  if (typeof field === 'string') {
    try {
      field = JSON.parse(field);
    } catch (e) {
      return field;
    }
  }
  if (Array.isArray(field)) {
    return field.map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch (e) {
          return item;
        }
      }
      return item;
    });
  }
  return field;
};

const ensureArray = (value) => {
  if (value === undefined || value === null) return value;
  return Array.isArray(value) ? value : [value];
};

// --- Auth ---
exports.adminLogin = asyncWrapper(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return sendError(res, 400, 'Email and password are required');

    const user = await User.findOne({ email: email.toLowerCase(), role: 'super_admin', isDeleted: false });
    if (!user) {
        return sendError(res, 403, 'Access denied or invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return sendError(res, 403, 'Access denied or invalid credentials');
    }

    const token = generateToken(user._id);
    return sendSuccess(res, 200, 'Admin login successful', { token, user });
});

// --- Dashboard ---
exports.getDashboardStats = asyncWrapper(async (req, res) => {
    const totalCustomers = await User.countDocuments({ role: 'explorer', isDeleted: false });
    const totalTrainers = await User.countDocuments({ role: 'trainer', isDeleted: false });
    const totalVenueOwners = await User.countDocuments({ role: 'venue_owner', isDeleted: false });
    const totalVenues = await VenueProfile.countDocuments({ isDeleted: false });

    return sendSuccess(res, 200, 'Dashboard stats fetched successfully', {
        totalCustomers,
        totalTrainers,
        totalVenueOwners,
        totalVenues,
    });
});

// --- Users ---
exports.getAllUsers = asyncWrapper(async (req, res) => {
    const users = await User.find({ isDeleted: false, role: 'explorer' });
    return sendSuccess(res, 200, 'Users fetched successfully', users);
});

exports.toggleUserStatus = asyncWrapper(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found');

    user.isActive = !user.isActive;
    await user.save();
    return sendSuccess(res, 200, `User status updated to ${user.isActive ? 'Active' : 'Inactive'}`, user);
});

exports.deleteUser = asyncWrapper(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found');

    user.isDeleted = true;
    await user.save();
    return sendSuccess(res, 200, 'User soft deleted successfully', user);
});

// --- Venues ---
exports.createVenue = asyncWrapper(async (req, res) => {
    // console.log(req.body);
    const {
        // Owner (User model) fields
        fullName, email, phoneNumber,
        // Venue profile fields
        companyName, aboutVenue,
        venueEmail, venuePhoneNumber,
        address, location, businessDays, venueImages, tradingLicense, websiteUrl,
        // Arrays: each item is either an ObjectId string or a custom name string
        services: rawServices,
        amenities: rawAmenities,
        // General Manager details
        gmName, gmEmail, gmPhoneNumber, gmProfileImage
    } = req.body;

    if (!email || !phoneNumber || !companyName || !fullName) {
        return sendError(res, 400, 'fullName, email, phoneNumber and companyName are required');
    }

    const parsedAddress = parseJSONField(address);
    const parsedLocation = parseJSONField(location);
    const parsedBusinessDays = ensureArray(parseJSONField(businessDays)) || [];

    const servicesField = rawServices || req.body['services[]'];
    const finalRawServices = servicesField ? ensureArray(parseJSONField(servicesField)) : [];

    const amenitiesField = rawAmenities || req.body['amenities[]'];
    const finalRawAmenities = amenitiesField ? ensureArray(parseJSONField(amenitiesField)) : [];

    let parsedVenueImages = [];
    if (venueImages) {
        const parsed = parseJSONField(venueImages);
        if (parsed) {
            parsedVenueImages = ensureArray(parsed).filter(img => typeof img === 'string' && img.startsWith('http'));
        }
    }

    let finalTradingLicense = tradingLicense || null;
    let finalGmProfileImage = gmProfileImage || null;
    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
        const tradingLicenseFile = req.files.find(f => f.fieldname === 'tradingLicense');
        if (tradingLicenseFile) {
            if (!tradingLicenseFile.mimetype.startsWith('image/') && tradingLicenseFile.mimetype !== 'application/pdf') {
                return sendError(res, 400, 'Trading license must be a PDF or an image.');
            }
            finalTradingLicense = getFileUrl(req, tradingLicenseFile.filename);
        }

        const gmProfileImageFile = req.files.find(f => f.fieldname === 'gmProfileImage');
        if (gmProfileImageFile) {
            finalGmProfileImage = getFileUrl(req, gmProfileImageFile.filename);
        }

        uploadedImages = req.files
            .filter(f => f.fieldname === 'venueImages' || f.fieldname === 'venueImages[]')
            .map(f => getFileUrl(req, f.filename));
    } else if (req.file) {
        if (req.file.fieldname === 'tradingLicense') {
            if (!req.file.mimetype.startsWith('image/') && req.file.mimetype !== 'application/pdf') {
                return sendError(res, 400, 'Trading license must be a PDF or an image.');
            }
            finalTradingLicense = getFileUrl(req, req.file.filename);
        } else if (req.file.fieldname === 'gmProfileImage') {
            finalGmProfileImage = getFileUrl(req, req.file.filename);
        } else if (req.file.fieldname === 'venueImages' || req.file.fieldname === 'venueImages[]') {
            uploadedImages = [getFileUrl(req, req.file.filename)];
        }
    }

    let finalVenueImages = [...parsedVenueImages, ...uploadedImages];
    if (finalVenueImages.length > 15) {
        return sendError(res, 400, 'Maximum 15 venue images allowed');
    }

    // Duplicate checks
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return sendError(res, 400, 'A user with this email already exists');

    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) return sendError(res, 400, 'A user with this phone number already exists');

    // Step 1: Create owner User
    const owner = await User.create({
        fullName,
        email: email.toLowerCase(),
        phoneNumber,
        role: 'venue_owner',
        isActive: true,
    });

    // Step 2: Resolve services — existing _id OR create new custom Service
    const resolvedServices = [];
    if (Array.isArray(finalRawServices)) {
        for (const item of finalRawServices) {
            if (mongoose.Types.ObjectId.isValid(item)) {
                // Existing service
                resolvedServices.push(item);
            } else {
                // Custom service — create it
                const newService = await Service.create({
                    name: item,
                    isCustom: true,
                    isActive: true,
                });
                resolvedServices.push(newService._id);
            }
        }
    }

    // Step 3: Resolve amenities — existing _id OR create new custom Amenity
    const resolvedAmenities = [];
    if (Array.isArray(finalRawAmenities)) {
        for (const item of finalRawAmenities) {
            if (mongoose.Types.ObjectId.isValid(item)) {
                resolvedAmenities.push(item);
            } else {
                const newAmenity = await Amenity.create({
                    name: item,
                    isCustom: true,
                    isActive: true,
                });
                resolvedAmenities.push(newAmenity._id);
            }
        }
    }

    let finalLng = 0;
    let finalLat = 0;
    if (parsedLocation) {
        if (Array.isArray(parsedLocation.coordinates) && parsedLocation.coordinates.length >= 2) {
            finalLng = parseFloat(parsedLocation.coordinates[0]) || 0;
            finalLat = parseFloat(parsedLocation.coordinates[1]) || 0;
        } else {
            finalLng = parseFloat(parsedLocation.lng) || parseFloat(parsedLocation.longitude) || 0;
            finalLat = parseFloat(parsedLocation.lat) || parseFloat(parsedLocation.latitude) || 0;
        }
    }

    if (finalLat < -90 || finalLat > 90) {
        return sendError(res, 400, 'Latitude must be between -90 and 90');
    }
    if (finalLng < -180 || finalLng > 180) {
        return sendError(res, 400, 'Longitude must be between -180 and 180');
    }

    const venueData = {
        owner: owner._id,
        companyName,
        phoneNumber: venuePhoneNumber || phoneNumber,
        email: venueEmail || email,
        aboutVenue,
        address: parsedAddress,
        location: {
            type: 'Point',
            coordinates: [finalLng, finalLat],
        },
        businessDays: parsedBusinessDays,
        venueImages: finalVenueImages,
        tradingLicense: finalTradingLicense,
        websiteUrl: websiteUrl || null,
        services: resolvedServices,
        amenities: resolvedAmenities,
    };

    // Handle General Manager
    if (gmPhoneNumber || gmEmail) {
        let query = [];
        if (gmPhoneNumber) query.push({ phoneNumber: gmPhoneNumber });
        if (gmEmail) query.push({ email: gmEmail.toLowerCase() });

        let gmUser = await User.findOne({ $or: query });

        if (!gmUser) {
            gmUser = await User.create({
                fullName: gmName || 'General Manager',
                email: gmEmail ? gmEmail.toLowerCase() : undefined,
                phoneNumber: gmPhoneNumber,
                profileImage: finalGmProfileImage,
                role: 'general_manager',
                isActive: true,
                isVerified: true
            });
        } else {
            gmUser.role = 'general_manager';
            if (finalGmProfileImage) gmUser.profileImage = finalGmProfileImage;
            await gmUser.save();
        }

        venueData.generalManager = gmUser._id;
    }

    const venue = await VenueProfile.create(venueData);

    if (venueData.generalManager) {
        await User.findByIdAndUpdate(venueData.generalManager, { managedVenue: venue._id });
    }

    venue.profileCompletionPercent = venue.calculateCompletion();

    return sendSuccess(res, 201, 'Venue created successfully', {
        ...venue.toObject(),
        owner: { _id: owner._id, fullName: owner.fullName, email: owner.email, phoneNumber: owner.phoneNumber },
    });
});


exports.updateVenue = asyncWrapper(async (req, res) => {
    const { id } = req.params;
    const venue = await VenueProfile.findById(id);
    if (!venue) return sendError(res, 404, 'Venue not found');

    const owner = await User.findById(venue.owner);

    const {
        fullName, phoneNumber, // Owner details
        companyName, aboutVenue,
        venueEmail, venuePhoneNumber,
        address, location, businessDays, venueImages, tradingLicense, websiteUrl,
        services: rawServices, amenities: rawAmenities,
        // General Manager details
        gmName, gmEmail, gmPhoneNumber, gmProfileImage
    } = req.body;

    if (owner) {
        if (fullName) owner.fullName = fullName;
        if (phoneNumber) owner.phoneNumber = phoneNumber;
        await owner.save();
    }

    const parsedAddress = parseJSONField(address);
    const parsedLocation = parseJSONField(location);
    const parsedBusinessDays = businessDays ? ensureArray(parseJSONField(businessDays)) : null;

    const servicesField = rawServices || req.body['services[]'];
    const finalRawServices = servicesField ? ensureArray(parseJSONField(servicesField)) : null;

    const amenitiesField = rawAmenities || req.body['amenities[]'];
    const finalRawAmenities = amenitiesField ? ensureArray(parseJSONField(amenitiesField)) : null;

    let parsedVenueImages = null;
    if (venueImages) {
        const parsed = parseJSONField(venueImages);
        if (parsed) {
            parsedVenueImages = ensureArray(parsed).filter(img => typeof img === 'string' && img.startsWith('http'));
        }
    }

    let finalTradingLicense = tradingLicense;
    let finalGmProfileImage = gmProfileImage;
    let uploadedImages = [];

    if (req.files && req.files.length > 0) {
        const tradingLicenseFile = req.files.find(f => f.fieldname === 'tradingLicense');
        if (tradingLicenseFile) {
            if (!tradingLicenseFile.mimetype.startsWith('image/') && tradingLicenseFile.mimetype !== 'application/pdf') {
                return sendError(res, 400, 'Trading license must be a PDF or an image.');
            }
            finalTradingLicense = getFileUrl(req, tradingLicenseFile.filename);
        }

        const gmProfileImageFile = req.files.find(f => f.fieldname === 'gmProfileImage');
        if (gmProfileImageFile) {
            finalGmProfileImage = getFileUrl(req, gmProfileImageFile.filename);
        }

        uploadedImages = req.files
            .filter(f => f.fieldname === 'venueImages' || f.fieldname === 'venueImages[]')
            .map(f => getFileUrl(req, f.filename));
    } else if (req.file) {
        if (req.file.fieldname === 'tradingLicense') {
            if (!req.file.mimetype.startsWith('image/') && req.file.mimetype !== 'application/pdf') {
                return sendError(res, 400, 'Trading license must be a PDF or an image.');
            }
            finalTradingLicense = getFileUrl(req, req.file.filename);
        } else if (req.file.fieldname === 'gmProfileImage') {
            finalGmProfileImage = getFileUrl(req, req.file.filename);
        } else if (req.file.fieldname === 'venueImages' || req.file.fieldname === 'venueImages[]') {
            uploadedImages = [getFileUrl(req, req.file.filename)];
        }
    }

    if (parsedVenueImages || uploadedImages.length > 0) {
        let finalVenueImages = parsedVenueImages || [];
        if (uploadedImages.length > 0) {
            finalVenueImages = [...finalVenueImages, ...uploadedImages];
        }
        if (finalVenueImages.length > 15) {
            return sendError(res, 400, 'Maximum 15 venue images allowed');
        }
        venue.venueImages = finalVenueImages;
    }

    let resolvedServices;
    if (finalRawServices) {
        resolvedServices = [];
        for (const item of finalRawServices) {
            if (mongoose.Types.ObjectId.isValid(item)) {
                resolvedServices.push(item);
            } else {
                const newService = await Service.create({ name: item, isCustom: true, isActive: true });
                resolvedServices.push(newService._id);
            }
        }
        venue.services = resolvedServices;
    }

    let resolvedAmenities;
    if (finalRawAmenities) {
        resolvedAmenities = [];
        for (const item of finalRawAmenities) {
            if (mongoose.Types.ObjectId.isValid(item)) {
                resolvedAmenities.push(item);
            } else {
                const newAmenity = await Amenity.create({ name: item, isCustom: true, isActive: true });
                resolvedAmenities.push(newAmenity._id);
            }
        }
        venue.amenities = resolvedAmenities;
    }

    if (companyName) venue.companyName = companyName;
    if (aboutVenue !== undefined) venue.aboutVenue = aboutVenue;
    if (venueEmail) venue.email = venueEmail;
    if (venuePhoneNumber) venue.phoneNumber = venuePhoneNumber;
    if (address) venue.address = parsedAddress;
    
    if (location) {
        let finalLng = venue.location?.coordinates?.[0] || 0;
        let finalLat = venue.location?.coordinates?.[1] || 0;
        if (parsedLocation) {
            if (Array.isArray(parsedLocation.coordinates) && parsedLocation.coordinates.length >= 2) {
                finalLng = parseFloat(parsedLocation.coordinates[0]) || finalLng;
                finalLat = parseFloat(parsedLocation.coordinates[1]) || finalLat;
            } else {
                finalLng = parseFloat(parsedLocation.lng) || parseFloat(parsedLocation.longitude) || finalLng;
                finalLat = parseFloat(parsedLocation.lat) || parseFloat(parsedLocation.latitude) || finalLat;
            }
        }
        if (finalLat < -90 || finalLat > 90) {
            return sendError(res, 400, 'Latitude must be between -90 and 90');
        }
        if (finalLng < -180 || finalLng > 180) {
            return sendError(res, 400, 'Longitude must be between -180 and 180');
        }
        venue.location = {
            type: 'Point',
            coordinates: [finalLng, finalLat],
        };
    }

    if (parsedBusinessDays) venue.businessDays = parsedBusinessDays;
    if (finalTradingLicense !== undefined) venue.tradingLicense = finalTradingLicense;
    if (websiteUrl !== undefined) venue.websiteUrl = websiteUrl;

    // Handle General Manager
    if (gmPhoneNumber || gmEmail) {
        let query = [];
        if (gmPhoneNumber) query.push({ phoneNumber: gmPhoneNumber });
        if (gmEmail) query.push({ email: gmEmail.toLowerCase() });

        let gmUser = await User.findOne({ $or: query });

        if (!gmUser) {
            gmUser = await User.create({
                fullName: gmName || 'General Manager',
                email: gmEmail ? gmEmail.toLowerCase() : undefined,
                phoneNumber: gmPhoneNumber,
                profileImage: finalGmProfileImage || null,
                role: 'general_manager',
                isActive: true,
                isVerified: true
            });
        } else {
            gmUser.role = 'general_manager';
            if (gmName) gmUser.fullName = gmName;
            if (gmEmail) gmUser.email = gmEmail.toLowerCase();
            if (gmPhoneNumber) gmUser.phoneNumber = gmPhoneNumber;
            if (finalGmProfileImage) gmUser.profileImage = finalGmProfileImage;
            await gmUser.save();
        }

        venue.generalManager = gmUser._id;
        await User.findByIdAndUpdate(gmUser._id, { managedVenue: venue._id });
    }

    await venue.save();

    return sendSuccess(res, 200, 'Venue updated successfully', venue);
});


exports.getAllVenues = asyncWrapper(async (req, res) => {
    const { search } = req.query;
    let query = { isDeleted: false };

    if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        // Find users matching search term to search by owner's name/email
        const matchingUsers = await User.find({
            $or: [
                { fullName: searchRegex },
                { email: searchRegex }
            ]
        }).select('_id');
        const userIds = matchingUsers.map(u => u._id);

        query.$or = [
            { companyName: searchRegex },
            { email: searchRegex },
            { owner: { $in: userIds } }
        ];
    }

    const venues = await VenueProfile.find(query)
        .populate('owner', 'fullName email phoneNumber role')
        .populate('services', 'name')
        .populate('amenities', 'name')
        .populate('generalManager', 'fullName email phoneNumber role');

    return sendSuccess(res, 200, 'Venues fetched successfully', venues);
});

exports.toggleVenueStatus = asyncWrapper(async (req, res) => {
    const venue = await VenueProfile.findById(req.params.id);
    if (!venue) return sendError(res, 404, 'Venue not found');

    venue.isActive = !venue.isActive;
    await venue.save();
    return sendSuccess(res, 200, `Venue status updated to ${venue.isActive ? 'Active' : 'Inactive'}`, venue);
});

exports.deleteVenue = asyncWrapper(async (req, res) => {
    const venue = await VenueProfile.findById(req.params.id);
    if (!venue) return sendError(res, 404, 'Venue not found');

    venue.isDeleted = true;
    await venue.save();
    return sendSuccess(res, 200, 'Venue soft deleted successfully', venue);
});

// --- Trainers ---
exports.createTrainer = asyncWrapper(async (req, res) => {
    const { email, phoneNumber, fullName } = req.body;
    
    if (!email || !phoneNumber || !fullName) {
        return sendError(res, 400, 'fullName, email, and phoneNumber are required');
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return sendError(res, 400, 'A user with this email already exists');

    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) return sendError(res, 400, 'A user with this phone number already exists');

    const trainerUser = await User.create({
        fullName,
        email: email.toLowerCase(),
        phoneNumber,
        role: 'trainer',
        isActive: true,
        isVerified: true
    });

    let parsedCategories = parseJSONField(req.body.categories);
    let parsedServiceTypes = parseJSONField(req.body.serviceTypes);
    let parsedServiceAreas = parseJSONField(req.body.serviceAreas);
    let parsedCertifications = parseJSONField(req.body.certifications);
    let parsedGalleryImages = parseJSONField(req.body.galleryImages);
    let parsedVenues = parseJSONField(req.body.venues);

    if (req.body.categories !== undefined) parsedCategories = ensureArray(parsedCategories);
    if (req.body.serviceTypes !== undefined) parsedServiceTypes = ensureArray(parsedServiceTypes);
    if (req.body.serviceAreas !== undefined) {
      parsedServiceAreas = ensureArray(parsedServiceAreas).map(area => ({
        ...area,
        location: {
          type: 'Point',
          coordinates: [parseFloat(area.lng) || 0, parseFloat(area.lat) || 0]
        }
      }));
    }
    if (req.body.certifications !== undefined) {
      parsedCertifications = ensureArray(parsedCertifications).map(cert => {
        const nameFromUrl = cert.fileUrl ? cert.fileUrl.split('/').pop().replace(/\.[^/.]+$/, '') : 'Untitled';
        return {
          name: cert.name || nameFromUrl,
          fileUrl: cert.fileUrl || null,
          uploadedAt: cert.uploadedAt || new Date(),
        };
      });
    }
    if (req.body.galleryImages !== undefined) parsedGalleryImages = ensureArray(parsedGalleryImages);
    if (req.body.venues !== undefined) parsedVenues = ensureArray(parsedVenues);

    const profileData = {
      user: trainerUser._id,
      fullName: fullName,
      yearsOfExperience: req.body.yearsOfExperience,
      shortBio: req.body.shortBio,
      approvalStatus: 'approved'
    };
    
    if (parsedServiceAreas) profileData.serviceAreas = parsedServiceAreas;
    if (parsedCertifications) profileData.certifications = parsedCertifications;
    if (parsedGalleryImages) profileData.galleryImages = parsedGalleryImages;
    if (parsedVenues) profileData.venues = parsedVenues;

    if (req.files && Array.isArray(req.files)) {
      const profileImages = req.files.filter(f => f.fieldname.toLowerCase().includes('profile'));
      const certFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('cert'));
      const galleryFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('gallery'));

      if (profileImages.length > 0) {
        profileData.profileImage = getFileUrl(req, profileImages[0].filename);
        trainerUser.profileImage = profileData.profileImage;
        await trainerUser.save();
      }
      if (certFiles.length > 0) {
        const uploadedCerts = certFiles.map((file) => ({
          name: file.originalname.replace(/\.[^/.]+$/, ''),
          fileUrl: getFileUrl(req, file.filename),
          uploadedAt: new Date(),
        }));
        profileData.certifications = profileData.certifications
          ? [...profileData.certifications, ...uploadedCerts]
          : uploadedCerts;
      }
      if (galleryFiles.length > 0) {
        const uploadedGallery = galleryFiles.map((file) => getFileUrl(req, file.filename));
        profileData.galleryImages = profileData.galleryImages
          ? [...profileData.galleryImages, ...uploadedGallery]
          : uploadedGallery;
      }
    } else if (req.file) {
      profileData.profileImage = getFileUrl(req, req.file.filename);
      trainerUser.profileImage = profileData.profileImage;
      await trainerUser.save();
    }

    const profile = await TrainerProfile.create(profileData);

    if (parsedCategories && parsedCategories.length > 0) {
      const existingCatIds = [];
      const customCatNames = [];
      for (const cat of parsedCategories) {
        if (typeof cat === 'string' && mongoose.Types.ObjectId.isValid(cat)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat));
        } else if (typeof cat === 'object' && cat !== null && mongoose.Types.ObjectId.isValid(cat._id || cat.id)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat._id || cat.id));
        } else {
          const catName = typeof cat === 'string' ? cat : cat?.name;
          if (catName) {
            const existing = await Category.findOne({ name: { $regex: new RegExp(`^${catName}$`, 'i') }, type: 'trainer' });
            if (existing) {
              existingCatIds.push(existing._id);
            } else {
              customCatNames.push(catName);
            }
          }
        }
      }
      let newCatIds = [];
      if (customCatNames.length > 0) {
        const created = await Category.insertMany(
          customCatNames.map((name) => ({ name, type: 'trainer', trainer: profile._id, isCustom: true }))
        );
        newCatIds = created.map(c => c._id);
      }
      profile.categories = [...existingCatIds, ...newCatIds];
    }

    if (parsedServiceTypes && parsedServiceTypes.length > 0) {
      const existingStIds = [];
      const customStData = [];
      for (const st of parsedServiceTypes) {
        if (typeof st === 'string' && mongoose.Types.ObjectId.isValid(st)) {
          existingStIds.push(new mongoose.Types.ObjectId(st));
        } else if (typeof st === 'object' && st !== null && mongoose.Types.ObjectId.isValid(st._id || st.id || st.serviceType)) {
          existingStIds.push(new mongoose.Types.ObjectId(st._id || st.id || st.serviceType));
        } else {
          const stValue = typeof st === 'string' ? st : (st?.value || st?.name || st?.serviceType);
          if (stValue) {
            const existing = await ServiceType.findOne({ name: { $regex: new RegExp(`^${stValue}$`, 'i') } });
            if (existing) {
              existingStIds.push(existing._id);
            } else {
              const stDesc = typeof st === 'object' && st.description ? st.description : null;
              customStData.push({ name: stValue, description: stDesc });
            }
          }
        }
      }
      let newStIds = [];
      if (customStData.length > 0) {
        const created = await ServiceType.insertMany(
          customStData.map((data) => ({ name: data.name, description: data.description, trainer: profile._id, isCustom: true }))
        );
        newStIds = created.map(c => c._id);
      }
      profile.serviceTypes = [...existingStIds, ...newStIds];
    }

    profile.profileCompletionPercent = profile.calculateCompletion();
    await profile.save();

    return sendSuccess(res, 201, 'Trainer created successfully', {
        trainer: trainerUser,
        profile
    });
});

exports.updateTrainer = asyncWrapper(async (req, res) => {
    let profile = await TrainerProfile.findById(req.params.id).populate('user');
    if (!profile) {
        profile = await TrainerProfile.findOne({ user: req.params.id }).populate('user');
    }
    if (!profile) return sendError(res, 404, 'Trainer profile not found');

    const trainerUser = profile.user;
    if (!trainerUser) return sendError(res, 404, 'Associated user not found');

    const { email, phoneNumber, fullName } = req.body;

    if (email && email.toLowerCase() !== trainerUser.email) {
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) return sendError(res, 400, 'Email already in use');
        trainerUser.email = email.toLowerCase();
    }
    if (phoneNumber && phoneNumber !== trainerUser.phoneNumber) {
        const existingPhone = await User.findOne({ phoneNumber });
        if (existingPhone) return sendError(res, 400, 'Phone number already in use');
        trainerUser.phoneNumber = phoneNumber;
    }
    if (fullName) {
        trainerUser.fullName = fullName;
    }

    const allowedFields = ['fullName', 'yearsOfExperience', 'shortBio', 'categories', 'serviceTypes', 'serviceAreas', 'certifications', 'galleryImages', 'venues'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'categories') {
          // handled below
        } else if (field === 'serviceTypes') {
          // handled below
        } else if (field === 'serviceAreas') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed).map(area => ({
            ...area,
            location: {
              type: 'Point',
              coordinates: [parseFloat(area.lng) || 0, parseFloat(area.lat) || 0]
            }
          }));
          profile[field] = parsed;
        } else if (field === 'certifications') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed).map(cert => {
            const nameFromUrl = cert.fileUrl ? cert.fileUrl.split('/').pop().replace(/\.[^/.]+$/, '') : 'Untitled';
            return {
              name: cert.name || nameFromUrl,
              fileUrl: cert.fileUrl || null,
              uploadedAt: cert.uploadedAt || new Date(),
            };
          });
          profile[field] = parsed;
        } else if (field === 'galleryImages') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed);
          profile[field] = parsed;
        } else if (field === 'venues') {
          let parsed = parseJSONField(req.body[field]);
          parsed = ensureArray(parsed);
          profile[field] = parsed;
        } else {
          profile[field] = req.body[field];
        }
      }
    });

    if (req.body.categories !== undefined) {
      let parsedCategories = ensureArray(parseJSONField(req.body.categories));
      const existingCatIds = [];
      const customCatNames = [];
      for (const cat of parsedCategories) {
        if (typeof cat === 'string' && mongoose.Types.ObjectId.isValid(cat)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat));
        } else if (typeof cat === 'object' && cat !== null && mongoose.Types.ObjectId.isValid(cat._id || cat.id)) {
          existingCatIds.push(new mongoose.Types.ObjectId(cat._id || cat.id));
        } else {
          const catName = typeof cat === 'string' ? cat : cat?.name;
          if (catName) {
            const existing = await Category.findOne({ name: { $regex: new RegExp(`^${catName}$`, 'i') }, type: 'trainer' });
            if (existing) {
              existingCatIds.push(existing._id);
            } else {
              customCatNames.push(catName);
            }
          }
        }
      }
      await Category.deleteMany({
        trainer: profile._id,
        isCustom: true,
        _id: { $nin: existingCatIds }
      });

      let newCatIds = [];
      if (customCatNames.length > 0) {
        const created = await Category.insertMany(
          customCatNames.map((name) => ({ name, type: 'trainer', trainer: profile._id, isCustom: true }))
        );
        newCatIds = created.map(c => c._id);
      }
      profile.categories = [...existingCatIds, ...newCatIds];
    }

    if (req.body.serviceTypes !== undefined) {
      let parsedServiceTypes = ensureArray(parseJSONField(req.body.serviceTypes));
      const existingStIds = [];
      const customStData = [];
      for (const st of parsedServiceTypes) {
        if (typeof st === 'string' && mongoose.Types.ObjectId.isValid(st)) {
          existingStIds.push(new mongoose.Types.ObjectId(st));
        } else if (typeof st === 'object' && st !== null && mongoose.Types.ObjectId.isValid(st._id || st.id || st.serviceType)) {
          existingStIds.push(new mongoose.Types.ObjectId(st._id || st.id || st.serviceType));
        } else {
          const stValue = typeof st === 'string' ? st : (st?.value || st?.name || st?.serviceType);
          if (stValue) {
            const existing = await ServiceType.findOne({ name: { $regex: new RegExp(`^${stValue}$`, 'i') } });
            if (existing) {
              existingStIds.push(existing._id);
            } else {
              const stDesc = typeof st === 'object' && st.description ? st.description : null;
              customStData.push({ name: stValue, description: stDesc });
            }
          }
        }
      }
      await ServiceType.deleteMany({
        trainer: profile._id,
        isCustom: true,
        _id: { $nin: existingStIds }
      });

      let newStIds = [];
      if (customStData.length > 0) {
        const created = await ServiceType.insertMany(
          customStData.map((data) => ({ name: data.name, description: data.description, trainer: profile._id, isCustom: true }))
        );
        newStIds = created.map(c => c._id);
      }
      profile.serviceTypes = [...existingStIds, ...newStIds];
    }

    if (req.files && Array.isArray(req.files)) {
      const profileImages = req.files.filter(f => f.fieldname.toLowerCase().includes('profile'));
      const certFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('cert'));
      const galleryFiles = req.files.filter(f => f.fieldname.toLowerCase().includes('gallery'));

      if (profileImages.length > 0) {
        profile.profileImage = getFileUrl(req, profileImages[0].filename);
        trainerUser.profileImage = profile.profileImage;
      }
      if (certFiles.length > 0) {
        const uploadedCerts = certFiles.map((file) => ({
          name: file.originalname.replace(/\.[^/.]+$/, ''), 
          fileUrl: getFileUrl(req, file.filename),
          uploadedAt: new Date(),
        }));
        profile.certifications = profile.certifications ? profile.certifications.concat(uploadedCerts) : uploadedCerts;
      }
      if (galleryFiles.length > 0) {
        const uploadedGallery = galleryFiles.map((file) => getFileUrl(req, file.filename));
        profile.galleryImages = profile.galleryImages ? profile.galleryImages.concat(uploadedGallery) : uploadedGallery;
      }
    } else if (req.file) {
      profile.profileImage = getFileUrl(req, req.file.filename);
      trainerUser.profileImage = profile.profileImage;
    }

    profile.profileCompletionPercent = profile.calculateCompletion();
    await profile.save();
    await trainerUser.save();

    return sendSuccess(res, 200, 'Trainer updated successfully', {
        trainer: trainerUser,
        profile
    });
});

exports.getAllTrainers = asyncWrapper(async (req, res) => {
    const { status, search, categoryIds } = req.query;
    const page = parseInt(req.query.page, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 10;

    // Build the user query
    let userQuery = { isDeleted: false, role: 'trainer' };
    if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        userQuery.$or = [
            { fullName: searchRegex },
            { email: searchRegex },
            { phoneNumber: searchRegex }
        ];
    }

    // Fetch matching users
    const users = await User.find(userQuery).lean();
    const userIds = users.map(u => u._id);

    // Build the profile query
    let profileQuery = { user: { $in: userIds } };
    if (categoryIds) {
        if (mongoose.Types.ObjectId.isValid(categoryIds)) {
            profileQuery.categories = new mongoose.Types.ObjectId(categoryIds);
        } else {
            profileQuery.categories = categoryIds;
        }
    }

    // Fetch profiles
    const profiles = await TrainerProfile.find(profileQuery).lean();

    // Map profiles back to users and construct trainer list
    let trainers = [];
    for (const user of users) {
        const profile = profiles.find(p => p.user.toString() === user._id.toString());
        
        // If a category filter is applied, we must have a matching profile
        if (categoryIds && !profile) {
            continue;
        }

        const trainerData = {
            ...user,
            profile: profile || null,
            approvalStatus: profile ? profile.approvalStatus : 'pending'
        };

        // Filter by status if provided
        if (status && trainerData.approvalStatus !== status) {
            continue;
        }

        trainers.push(trainerData);
    }

    const totalCount = trainers.length;
    const paginatedTrainers = trainers.slice(page * limit, (page + 1) * limit);

    return sendSuccess(res, 200, 'Trainers fetched successfully', { trainers: paginatedTrainers, totalCount });
});
exports.getTrainerById = asyncWrapper(async (req, res) => {
    let profile = await TrainerProfile.findById(req.params.id)
        .populate('user', 'fullName email phoneNumber profileImage role')
        .populate('categories')
        .populate('serviceTypes')
        .populate('venues');
        
    if (!profile) {
        profile = await TrainerProfile.findOne({ user: req.params.id })
            .populate('user', 'fullName email phoneNumber profileImage role')
            .populate('categories')
            .populate('serviceTypes')
            .populate('venues');
    }
        
    if (!profile) {
        return sendError(res, 404, 'Trainer profile not found.');
    }
    
    return sendSuccess(res, 200, 'Trainer profile fetched successfully', {
        trainer: profile.user,
        profile
    });
});

exports.approveRejectTrainer = asyncWrapper(async (req, res) => {
    const { status, reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return sendError(res, 400, 'Invalid status. Must be "approved" or "rejected".');
    }

    let trainer = await TrainerProfile.findById(req.params.id).populate('user');
    if (!trainer) {
        trainer = await TrainerProfile.findOne({ user: req.params.id }).populate('user');
    }
    if (!trainer) return sendError(res, 404, 'Trainer profile not found');
    if (!trainer.user) return sendError(res, 404, 'Associated user not found');

    trainer.approvalStatus = status;
    if (status === 'rejected') {
        if (!reason) return sendError(res, 400, 'Rejection reason is required when rejecting a trainer.');
        trainer.rejectionReason = reason;
    } else {
        trainer.rejectionReason = null;
    }
    await trainer.save();

    // Send notifications
    const phoneNumber = trainer.user.phoneNumber;
    const email = trainer.user.email;
    const name = trainer.fullName || trainer.user.fullName || 'Trainer';

    if (status === 'approved') {
        const msg = `Congratulations ${name}! Your trainer profile on Endoorphin has been approved. You can now log in.`;
        if (phoneNumber) sendSMS(phoneNumber, msg);
        if (email) sendEmail(email, 'Trainer Profile Approved', msg);
    } else {
        const msg = `Hi ${name}, unfortunately your trainer application on Endoorphin was rejected. Reason: ${reason}`;
        if (phoneNumber) sendSMS(phoneNumber, msg);
        if (email) sendEmail(email, 'Trainer Profile Rejected', msg);
    }

    return sendSuccess(res, 200, `Trainer profile ${status} successfully`, trainer);
});

exports.toggleTrainerStatus = asyncWrapper(async (req, res) => {
    const trainer = await TrainerProfile.findById(req.params.id);
    if (!trainer) return sendError(res, 404, 'Trainer not found');

    trainer.isActive = !trainer.isActive;
    await trainer.save();
    return sendSuccess(res, 200, `Trainer status updated to ${trainer.isActive ? 'Active' : 'Inactive'}`, trainer);
});

exports.deleteTrainer = asyncWrapper(async (req, res) => {
    const trainer = await TrainerProfile.findById(req.params.id);
    if (!trainer) return sendError(res, 404, 'Trainer not found');

    trainer.isDeleted = true;
    await trainer.save();
    return sendSuccess(res, 200, 'Trainer soft deleted successfully', trainer);
});

// --- Amenities ---
exports.createAmenity = asyncWrapper(async (req, res) => {
    const { name, icon } = req.body;
    const amenity = await Amenity.create({ name, icon });
    return sendSuccess(res, 201, 'Amenity created successfully', amenity);
});

exports.getAllAmenities = asyncWrapper(async (req, res) => {
    const amenities = await Amenity.find({ isDeleted: false });
    return sendSuccess(res, 200, 'Amenities fetched successfully', amenities);
});

exports.updateAmenity = asyncWrapper(async (req, res) => {
    const { name, icon } = req.body;
    const amenity = await Amenity.findById(req.params.id);
    if (!amenity) return sendError(res, 404, 'Amenity not found');
    if (name) amenity.name = name;
    if (icon) amenity.icon = icon;
    await amenity.save();
    return sendSuccess(res, 200, 'Amenity updated successfully', amenity);
});

exports.toggleAmenityStatus = asyncWrapper(async (req, res) => {
    const amenity = await Amenity.findById(req.params.id);
    if (!amenity) return sendError(res, 404, 'Amenity not found');

    amenity.isActive = !amenity.isActive;
    await amenity.save();
    return sendSuccess(res, 200, `Amenity status updated`, amenity);
});

exports.deleteAmenity = asyncWrapper(async (req, res) => {
    const amenity = await Amenity.findById(req.params.id);
    if (!amenity) return sendError(res, 404, 'Amenity not found');

    amenity.isDeleted = true;
    await amenity.save();
    return sendSuccess(res, 200, 'Amenity soft deleted successfully', amenity);
});

// --- Categories ---
exports.createCategory = asyncWrapper(async (req, res) => {
    const { name, icon, type } = req.body;
    const category = await Category.create({ name, icon, type });
    return sendSuccess(res, 201, 'Category created successfully', category);
});

exports.getAllCategories = asyncWrapper(async (req, res) => {
    const categories = await Category.find({ isDeleted: false });
    const totalCount = await Category.countDocuments({ isDeleted: false });

    return sendSuccess(res, 200, 'Categories fetched successfully', { categories, totalCount });
});

exports.toggleCategoryStatus = asyncWrapper(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) return sendError(res, 404, 'Category not found');

    category.isActive = !category.isActive;
    await category.save();
    return sendSuccess(res, 200, `Category status updated`, category);
});

exports.deleteCategory = asyncWrapper(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) return sendError(res, 404, 'Category not found');

    category.isDeleted = true;
    await category.save();
    return sendSuccess(res, 200, 'Category soft deleted successfully', category);
});

// --- Services ---
exports.createService = asyncWrapper(async (req, res) => {
    const { name, description } = req.body;
    const service = await Service.create({ name, description });
    return sendSuccess(res, 201, 'Service created successfully', service);
});

exports.getAllServices = asyncWrapper(async (req, res) => {
    const services = await Service.find({ isDeleted: false });
    return sendSuccess(res, 200, 'Services fetched successfully', services);
});

exports.updateService = asyncWrapper(async (req, res) => {
    const { name, description } = req.body;
    const service = await Service.findById(req.params.id);
    if (!service) return sendError(res, 404, 'Service not found');
    if (name) service.name = name;
    if (description) service.description = description;
    await service.save();
    return sendSuccess(res, 200, 'Service updated successfully', service);
});

exports.toggleServiceStatus = asyncWrapper(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) return sendError(res, 404, 'Service not found');

    service.isActive = !service.isActive;
    await service.save();
    return sendSuccess(res, 200, `Service status updated`, service);
});

exports.deleteService = asyncWrapper(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) return sendError(res, 404, 'Service not found');

    service.isDeleted = true;
    await service.save();
    return sendSuccess(res, 200, 'Service soft deleted successfully', service);
});

// --- Service Types ---
exports.createServiceType = asyncWrapper(async (req, res) => {
    const { name, description } = req.body;
    const serviceType = await ServiceType.create({ name, description });
    return sendSuccess(res, 201, 'ServiceType created successfully', serviceType);
});

exports.getAllServiceTypes = asyncWrapper(async (req, res) => {
    const serviceTypes = await ServiceType.find({ isDeleted: false });
    return sendSuccess(res, 200, 'ServiceTypes fetched successfully', serviceTypes);
});

exports.updateServiceType = asyncWrapper(async (req, res) => {
    const { name, description } = req.body;
    const serviceType = await ServiceType.findById(req.params.id);
    if (!serviceType) return sendError(res, 404, 'ServiceType not found');
    if (name) serviceType.name = name;
    if (description) serviceType.description = description;
    await serviceType.save();
    return sendSuccess(res, 200, 'ServiceType updated successfully', serviceType);
});

exports.toggleServiceTypeStatus = asyncWrapper(async (req, res) => {
    const serviceType = await ServiceType.findById(req.params.id);
    if (!serviceType) return sendError(res, 404, 'ServiceType not found');

    serviceType.isActive = !serviceType.isActive;
    await serviceType.save();
    return sendSuccess(res, 200, `ServiceType status updated`, serviceType);
});

exports.deleteServiceType = asyncWrapper(async (req, res) => {
    const serviceType = await ServiceType.findById(req.params.id);
    if (!serviceType) return sendError(res, 404, 'ServiceType not found');

    serviceType.isDeleted = true;
    await serviceType.save();
    return sendSuccess(res, 200, 'ServiceType soft deleted successfully', serviceType);
});

exports.approveRejectDocument = asyncWrapper(async (req, res) => {
    const { id, status, remark, comment } = req.body;
    if (!id) {
        return sendError(res, 400, 'Document ID is required.');
    }
    if (status === undefined || status === null) {
        return sendError(res, 400, 'Status is required.');
    }

    // Find the profile containing this certification ID
    const profile = await TrainerProfile.findOne({ "certifications._id": id });
    if (!profile) {
        return sendError(res, 404, 'Trainer profile with the specified document not found.');
    }

    // Find the specific certification
    const doc = profile.certifications.id(id);
    if (!doc) {
        return sendError(res, 404, 'Document not found inside trainer profile.');
    }

    // Update document properties
    doc.status = status;
    if (status === false) {
        doc.remark = remark || null;
        doc.comment = comment || null;
    } else {
        doc.remark = null;
        doc.comment = null;
    }

    await profile.save();

    return sendSuccess(res, 200, 'Document status updated successfully', doc);
});
