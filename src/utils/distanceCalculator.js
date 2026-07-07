/**
 * Convert miles to meters (for MongoDB $geoNear which uses meters)
 * @param {number} miles
 * @returns {number} meters
 */
const milesToMeters = (miles) => miles * 1609.344;

/**
 * Convert meters to miles
 * @param {number} meters
 * @returns {number} miles
 */
const metersToMiles = (meters) => meters / 1609.344;

/**
 * Build a MongoDB $geoNear pipeline stage for distance-based search.
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {number} maxDistanceMiles - Max distance in miles
 * @param {number} minDistanceMiles - Min distance in miles
 * @param {string} distanceField - Output field name for calculated distance
 * @param {string} [locationPath] - Path to location field (default: 'location')
 * @returns {Object} MongoDB $geoNear stage
 */
const buildGeoNearStage = (
  lng,
  lat,
  maxDistanceMiles = 50,
  minDistanceMiles = 0,
  distanceField = 'distanceInMeters',
  locationPath = 'location'
) => {
  return {
    $geoNear: {
      near: {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
      distanceField,
      maxDistance: milesToMeters(maxDistanceMiles),
      minDistance: milesToMeters(minDistanceMiles),
      spherical: true,
      key: locationPath,
    },
  };
};

module.exports = { milesToMeters, metersToMiles, buildGeoNearStage };
