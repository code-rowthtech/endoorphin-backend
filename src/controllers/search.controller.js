const TrainerProfile = require('../models/TrainerProfile');
const VenueProfile = require('../models/VenueProfile');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncWrapper = require('../utils/asyncWrapper');
const { buildGeoNearStage } = require('../utils/distanceCalculator');

/**
 * GET /api/search
 * Unified search — type=all|venue|trainer
 */
const unifiedSearch = asyncWrapper(async (req, res) => {
  const {
    type = 'all',
    search,
    lat,
    lng,
    minDistance = 0,
    maxDistance = 50,
    page = 1,
    limit = 10,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const results = { trainers: [], venues: [] };

  const buildTextMatch = (type) => {
    if (!search) return {};
    if (type === 'trainer') {
      return {
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { shortBio: { $regex: search, $options: 'i' } },
          { categories: { $regex: search, $options: 'i' } },
        ],
      };
    }
    return {
      $or: [
        { companyName: { $regex: search, $options: 'i' } },
        { aboutVenue: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
      ],
    };
  };

  if (type === 'all' || type === 'trainer') {
    if (lat && lng) {
      const pipeline = [
        buildGeoNearStage(
          parseFloat(lng),
          parseFloat(lat),
          parseFloat(maxDistance),
          parseFloat(minDistance),
          'distanceInMeters',
          'serviceAreas.location'
        ),
      ];
      const match = buildTextMatch('trainer');
      if (Object.keys(match).length > 0) pipeline.push({ $match: match });
      pipeline.push(
        { $addFields: { distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] }, resultType: 'trainer' } },
        { $skip: skip },
        { $limit: limitNum }
      );
      results.trainers = await TrainerProfile.aggregate(pipeline);
    } else {
      const match = buildTextMatch('trainer');
      results.trainers = await TrainerProfile.find(match)
        .populate('user', 'fullName phoneNumber profileImage')
        .skip(skip)
        .limit(limitNum)
        .lean();
      results.trainers = results.trainers.map((t) => ({ ...t, resultType: 'trainer' }));
    }
  }

  if (type === 'all' || type === 'venue') {
    if (lat && lng) {
      const pipeline = [
        buildGeoNearStage(
          parseFloat(lng),
          parseFloat(lat),
          parseFloat(maxDistance),
          parseFloat(minDistance),
          'distanceInMeters',
          'location'
        ),
      ];
      const match = buildTextMatch('venue');
      if (Object.keys(match).length > 0) pipeline.push({ $match: match });
      pipeline.push(
        { $addFields: { distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] }, resultType: 'venue' } },
        { $skip: skip },
        { $limit: limitNum }
      );
      results.venues = await VenueProfile.aggregate(pipeline);
    } else {
      const match = buildTextMatch('venue');
      results.venues = await VenueProfile.find(match)
        .populate('owner', 'fullName phoneNumber')
        .skip(skip)
        .limit(limitNum)
        .lean();
      results.venues = results.venues.map((v) => ({ ...v, resultType: 'venue' }));
    }
  }

  const totalResults = results.trainers.length + results.venues.length;

  return sendSuccess(res, 200, 'Search results fetched successfully.', {
    ...results,
    totalResults,
    pagination: { page: pageNum, limit: limitNum },
  });
});

/**
 * GET /api/search/nearby
 * For map view pins — returns both venues and trainers within radius
 */
const nearbySearch = asyncWrapper(async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;

  if (!lat || !lng) {
    return sendError(res, 400, 'Latitude (lat) and longitude (lng) are required.');
  }

  const venuePipeline = [
    buildGeoNearStage(
      parseFloat(lng),
      parseFloat(lat),
      parseFloat(radius),
      0,
      'distanceInMeters',
      'location'
    ),
    {
      $addFields: {
        distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] },
        resultType: 'venue',
      },
    },
    { $limit: 100 },
  ];

  const trainerPipeline = [
    buildGeoNearStage(
      parseFloat(lng),
      parseFloat(lat),
      parseFloat(radius),
      0,
      'distanceInMeters',
      'serviceAreas.location'
    ),
    {
      $addFields: {
        distanceInMiles: { $divide: ['$distanceInMeters', 1609.344] },
        resultType: 'trainer',
      },
    },
    { $limit: 100 },
  ];

  const [venues, trainers] = await Promise.all([
    VenueProfile.aggregate(venuePipeline),
    TrainerProfile.aggregate(trainerPipeline),
  ]);

  return sendSuccess(res, 200, 'Nearby results fetched successfully.', {
    venues,
    trainers,
    totalResults: venues.length + trainers.length,
    radiusInMiles: parseFloat(radius),
  });
});

module.exports = { unifiedSearch, nearbySearch };
