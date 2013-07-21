// https://developers.google.com/places/documentation/photos

// Your Google Places API Key.
var GOOGLE_PLACES_API_KEY = 'xxx';

/**
 * onRequest hook. Fetches the image URL using Google Places.
 */
function onRequest(request, response, modules) {
  // Extract modules.
  var ca     = modules.collectionAccess;
  var images = ca.collection('images');
  var logger = modules.logger;
  var req    = modules.request;
  var utils  = modules.utils;

  // Extract the reference.
  var id        = request.body._id;
  var reference = request.body.reference;

  // Lookup locally.
  images.findOne({ gpid: id }, function(err, doc) {
    // If the lookup succeeded, return the response.
    if(null != doc) {
      response.body = { URL: doc.url };
      return response.complete();
    }

    // Log any errors, then continue looking.
    if(null != err) {
      logger.error(err);
    }
    logger.info("Lookup reference: " + reference);

    // Lookup using Google Places.
    req.get({
      uri: [
        'https://maps.googleapis.com/maps/api/place/photo?sensor=false&maxheight=100&maxwidth=200',
        'key=' + GOOGLE_PLACES_API_KEY,
        'photoreference=' + reference,
        'sensor=false'
      ].join('&'),
      followRedirect: false
    }, function(err, res) {
      // Log any errors.
      if(null != err) {
        logger.error(err);
      }

      // Extract the URL.
      var url = res.headers ? (res.headers.location || null) : null;

      // Save it.
      var data = utils.kinveyEntity({ gpid: id, url: url });
      images.save(data, {}, function(err) {
        // Log any errors.
        if(null != err) {
          logger.error(err);
        }

        // Return the response.
        response.body = { URL: url };
        response.complete();
      });
    });
  });
}