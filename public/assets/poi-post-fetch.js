// https://developers.google.com/places/documentation/search

// Maximum radius allowed by GP (in miles).
var DEFAULT_RADIUS = 50000;

// Factor to convert miles to meters.
var MILES_TO_METERS = 1609.344;

// Results threshold.
var MIN_RESULTS = 20;

/**
 * onPostFetch hook. Fetches additional POI from Google Places if results below threshold.
 */
var onPostFetch = function(request, response, modules) {

  // Extract modules.
  var ca     = modules.collectionAccess;
  var logger = modules.logger;
  var req    = modules.request;
  var utils  = modules.utils;

  /**
   * Fetches 100 additional POI from Google Places.
   * `fn` is called after the first fetch completes
   * to avoid blocking the client too long.
   */
  var fetchExternalPOI = function(coord, radius, types, fn) {
    logger.info("Fetching external POI for: " + coord + ", with radius: " + radius + "m.");

    // Build the query.
    var query = {
      _geoloc : { $nearSphere: coord, $maxDistance: radius / MILES_TO_METERS },
      radius  : parseInt(radius),
      keyword : 'tourist',
      types   : types.join('|')
    };

    // Build the URL.
    var url = [
      'https://baas.kinvey.com/appdata',
      request.appKey,
      'external-poi',
      '?query=' + JSON.stringify(query)
    ].join('/');

    // Retrieve POI.
    req.get({
      uri     : url,
      headers : {
        Authorization          : request.headers.authorization,
        'X-Kinvey-API-Version' : request.headers['x-kinvey-api-version']
      }
    }, function(err, res, body) {
      // In case of an error, fail.
      if(null != err) {
        return fn(err);
      }

      // Sanitize and batch save POI.
      var data = JSON.parse(body).map(function(poi) {
        var result = utils.kinveyEntity(poi._id);
        result.name    = poi.name;
        result.address = poi.fullResults.vicinity || poi._geoloc.toString();
        result.rating  = poi.rating;
        result.type    = poi.fullResults.types,
        result._geoloc = poi._geoloc;
        return result;
      });

      // Batch-save/update the newly found POI..
      if(data.length) {
        ca.collection('poi').insert(data, { continueOnError: true });
      }

      // Return the fetched POI.
      fn(null, data);
    });
  };

  // If the request has a query, and results are below the threshold,
  // fetch additional POI from GP.
  if(null != request.params.query && MIN_RESULTS > response.body.length) {
    // Parse and validate the query.
    var query = JSON.parse(request.params.query);
    if(null == query._geoloc || null == query._geoloc.$nearSphere || null == query.types || null == query.types.$in) {
      response.body = {
        error       : "BadRequest",
        description : "query must contain: _geoloc.$nearSphere, types.$in.",
        debug       : JSON.stringify(query)
      };
      return response.complete(400);
    }

    // Parse the geo-information in the query.
    var coords = query._geoloc.$nearSphere;
    var radius = Math.min(query._geoloc.$maxDistance * MILES_TO_METERS || DEFAULT_RADIUS, DEFAULT_RADIUS);
    var types  = query.types.$in;

    // Fetch additional POI from GP.
    return fetchExternalPOI(coords, radius, types, function(err, data) {
      // Even in case of an error, return the original response
      // since it might hold useful POI anyway.
      if(null != err) {
        logger.error(err);
      }

      // Replace the body by the newly added POI.
      if(null != data) {
        response.body = data;
      }
      response.continue();
    });
  }
  response.continue();
};