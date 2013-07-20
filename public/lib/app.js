// Wrap in an IIFE.
(function() {

  // Setup.
  // ======

  // Obtain a reference to the global object.
  var root = this;

  /**
   * Google Places namespace.
   */
  var GP = {
    // Maximum number of points per route.
    MAX_POINTS : 10,

    // Google Places type enumeration.
    // https://developers.google.com/places/documentation/search
    types  : {
      amusement_park   : { icon: 'amusement',      name: 'Amusement Park' },
      aquarium         : { icon: 'aquarium',       name: 'Aquarium' },
      art_gallery      : { icon: 'art-gallery',    name: 'Art Gallery' },
      campground       : { icon: 'camping',        name: 'Campground' },
      casino           : { icon: 'casino',         name: 'Casino' },
      cemetery         : { icon: 'cemetery-grave', name: 'Cemetery' },
      city_hall        : { icon: 'civic-building', name: 'City Hall' },
      church           : { icon: 'civic-building', name: 'Church' },
      courthouse       : { icon: 'courthouse',     name: 'Courthouse' },
      establishment    : { icon: 'home',           name: 'Establishment' },
      hindu_temple     : { icon: 'civic-building', name: 'Hindu Temple' },
      library          : { icon: 'books',          name: 'Library' },
      mosque           : { icon: 'civic-building', name: 'Mosque' },
      museum           : { icon: 'civic-building', name: 'Museum' },
      night_club       : { icon: 'beer',           name: 'Night Club' },
      park             : { icon: 'picnic',         name: 'Park' },
      place_of_worship : { icon: 'civic-building', name: 'Place of Worship' },
      rv_park          : { icon: 'picnic',         name: 'RV Park' },
      stadium          : { icon: 'sport',          name: 'Stadium' },
      synagogue        : { icon: 'civic-building', name: 'Synagogue' },
      train_station    : { icon: 'locomotive',     name: 'Train Station' },
      university       : { icon: 'academy',        name: 'University' },
      zoo              : { icon: 'pet',            name: 'Zoo' }
    }
  };

  // Bootstrap manually since `Kinvey.init` is asynchronous.
  angular.element(document).ready(function() {
    var promise = Kinvey.init({
      appKey    : 'kid_eeshNBAnZM',
      appSecret : 'faca9fbbf01c432c8b7123a08f543d91'
    });
    promise.then(function() {
      // Reset view.
      $('#content').removeClass('hide');
      $('#splash').remove();

      // Initialize Angular.
      angular.bootstrap(document, ['MarkMyRun']);
    });
  });

  // Declare, configure, and run the module.
  var App = angular.module('MarkMyRun', ['$strap.directives']);
  App.config(function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode(true).hashPrefix('!');
    $routeProvider.otherwise({ controller : 'LocationCtrl' });
  });
  App.run(function($rootScope) {
    $rootScope.$safeApply = function($scope, fn) {
      $scope = $scope || $rootScope;
      if(!$scope.$$phase) {
        $scope.$apply();
      }
    }
  });

  // Declare the `Kinvey` service.
  App.factory('Kinvey', function() {
    return Kinvey;
  });


  // Filters.
  // ========

  /**
   * Returns the human-readable type of a place.
   *
   * @returns {string} The type.
   */
  App.filter('humanType', function() {
    return function(input) {
      return GP.types[input] ? GP.types[input].name : '';
    };
  });


  // Factories.
  // ==========

  /**
   * Returns the users’ current position.
   *
   * @returns {Promise} The coordinate.
   */
  App.factory('currentPosition', ['$rootScope', '$q', function($rootScope, $q) {
    var deferred = $q.defer();

    root.navigator.geolocation.getCurrentPosition(function(e) {
      var coord = [ e.coords.longitude, e.coords.latitude ];
      deferred.resolve(coord);
      $rootScope.$safeApply();
    }, function() {
      deferred.reject('Failed to get the users’ current position.');
      $rootScope.$safeApply();
    });

    return deferred.promise;
  }]);

  /**
   * Returns the users’ current location.
   *
   * @returns {Promise} The location.
   */
  App.factory('currentLocation', ['$rootScope', '$q', 'Kinvey', 'currentPosition', function($rootScope, $q, Kinvey, currentPosition) {
    return currentPosition.then(function(coord) {
      var deferred = $q.defer();

      var query = new Kinvey.Query().near('_geoloc', coord).limit(1);
      Kinvey.DataStore.find('locations', query).then(function(response) {
        // Keep the users’ current position.
        response[0]._geoloc = coord;
        deferred.resolve(response[0]);

        $rootScope.$safeApply();
      }, deferred.reject);

      return deferred.promise;
    });
  }]);

  /**
   * Returns the lineair distance between two coordinates.
   *
   * @returns {number} Distance (miles).
   */
  App.factory('distance', function() {
    var DEGREES_TO_RADIANS = 0.01745329252;
    var EARTH_RADIUS       = 6371 / 1.609344; // Miles.
    var FUZZY_FACTOR       = 1.25;
    return function(coord1, coord2, fuzzy) {
      // Convert coordinates to radians.
      var lon1 = coord1[0] * DEGREES_TO_RADIANS;
      var lat1 = coord1[1] * DEGREES_TO_RADIANS;
      var lon2 = coord2[0] * DEGREES_TO_RADIANS;
      var lat2 = coord2[1] * DEGREES_TO_RADIANS;

      // Calculate distance.
      var distance = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2);
      distance = EARTH_RADIUS * Math.acos(distance);
      return distance * (false !== fuzzy ? FUZZY_FACTOR : 1);
    };
  });

  /**
   * Event broadcaster for communication between controllers.
   *
   * @return {Object} The event broadcaster.
   */
  App.factory('eventService', function($rootScope) {
    return {
      broadcast: function(evt, data) {
        this.data = data;
        $rootScope.$broadcast(evt);
      },
      data: null
    };
  });

  /**
   * Returns nearby POI given a coordinate, radius, and POI types.
   *
   * @returns {Promise} List of POI, ordered by distance.
   */
  App.factory('getPointsOfInterest', ['$q', '$rootScope', 'distance', function($q, $rootScope, distance) {
    var MILES_TO_METERS = 1609.344;// Google Places expects the radius in meters.
    return function(coord, radius, types) {
      var deferred = $q.defer();

      // Build the query.
      var query = new Kinvey.Query();
      query.near(   '_geoloc', coord, radius);
      query.equalTo('keyword', 'tourist');// Basic noise filter.
      query.equalTo('radius',  radius / MILES_TO_METERS);
      query.equalTo('types',   types.join('|'))

      // Find POI.
      Kinvey.DataStore.find('poi', query).then(function(response) {
        // Calculate the linear distance between `coord` and the place.
        response = response.map(function(place) {
          place.distance = distance(coord, place._geoloc);

          // Add the place types.
          place.types    = place.fullResults.types;
          place.types.sort();

          // Return the place.
          return place;
        });

        // Sort by distance.
        response.sort(function(a, b) {
          return a.distance < b.distance ? -1 : 1;
        });

        // Return the POI.
        deferred.resolve(response);
        $rootScope.$safeApply();
      }, function(error) {
        deferred.reject(error);
        $rootScope.$safeApply();
      });

      return deferred.promise;
    };
  }]);

  /**
   * GP helper to convert a Kinvey coordinate to a GP one.
   *
   * @param {Array|Object} A Kinvey object or coordinate.
   * @returns {google.maps.LatLng} The GP coordinate.
   */
  App.factory('gpLatLng', function() {
    return function(location) {
      var coord = null != location._geoloc ? location._geoloc : location;
      return new google.maps.LatLng(coord[1], coord[0]);
    };
  });

  /**
   * Returns an approximate solution to the TSP problem.
   *
   * @returns {Promise} The route.
   */
  App.factory('tsp', ['distance', function(getDistance) {
    return function(start, end, waypoints) {
      // Build the distance matrix.
      var places = [ start ].concat(waypoints);
      var matrix = places.map(function(place1, index1) {
        return places.map(function(place2, index2) {
          return index1 === index2 ? root.Infinity : getDistance(place1._geoloc, place2._geoloc);
        });
      });

      // Calculate the path.
      var current  = 0;// Current place.
      var distance = 0;
      var path     = [ start ];
      while(path.length < matrix.length) {
        // The next place is the closest remaining place.
        var minDistance = Math.min.apply(Math, matrix[current]);
        var next        = matrix[current].indexOf(minDistance);

        // Add next place to the path.
        path.push(places[next]);

        // Mark the current place as unreachable to others.
        matrix = matrix.map(function(place) {
          place[current] = root.Infinity;
          return place;
        });

        // Update.
        current   = next;
        distance += minDistance;
      }

      // Add the return trip.
      path.push(end);
      distance += getDistance(end._geoloc, places[current]._geoloc);

      // Return the result.
      return { path: path, distance: distance };
    };
  }]);


  // Controllers.
  // ============

  /**
   * POI controller.
   */
  App.controller('POICtrl', ['$rootScope', '$scope', 'eventService', 'getPointsOfInterest', 'Kinvey', 'tsp', function($rootScope, $scope, eventService, getPOI, Kinvey, tsp) {
    // Places filter.
    $scope.selected = 0;
    $scope.select   = function(place) {
      // “Solve” TSP.
      $scope.places.then(function(places) {
        places = places.filter(function(place) {
          return place.checked;
        });
        $scope.run = tsp($scope.city, $scope.city, places);
      });

      // Update selection metadata.
      if(place.checked) {
        $scope.selected -= 1;
      }
      else {
        $scope.selected += 1;
      }
    };

    // Wait for submit event before retrieving data.
    $scope.$on('submit', function() {
      // Reset view.
      $scope.places = null;
      $scope.run    = null;

      // Extract event data.
      var data     = eventService.data;
      var location = data.location;
      var radius   = parseFloat(data.distance.id);
      var types    = data.types.map(function(type) { return type.id; });

      // Update the view.
      $scope.city   = location;
      $scope.places = getPOI(location._geoloc, radius, types);
    });

    // Submit handler.
    $scope.plot = function(path) {
      // Reset view.
      $scope.places = null;
      $scope.run    = null;

      // Emit event.
      eventService.broadcast('run', path);
    };
  }]);

  /**
   * Location controller.
   */
  App.controller('LocationCtrl', ['$filter', '$location', '$scope', 'Kinvey', 'currentLocation', 'eventService', function($filter, $location, $scope, Kinvey, currentLocation, eventService) {
    // Prefill with the users’ current location.
    var lookup = {};
    currentLocation.then(function(location) {
      // Automatically suggest POI for the users’ current location.
      $scope.submit(location, $scope.distances[0], []);

      // Update view.
      $scope.location     = location.city;
      $scope.locationData = location;

      // Add to lookup data.
      lookup[location.city] = location;

      // Show tooltip for a brief moment.
      var tooltip = $('[name="location"]').tooltip({
        container : '[name="filters"]',
        placement : 'bottom',
        title     : 'Don’t worry, the run will start at your exact position in ' + $scope.location + '.',
        trigger   : 'manual'
      }).tooltip('show');
      setTimeout(function() {
        tooltip.tooltip('hide');
      }, 3000);
    });

    // Location typeahead.
    $scope.typeahead = function(pattern, fn) {
      var query = new Kinvey.Query().matches('city', pattern, { ignoreCase: true }).limit(5);
      Kinvey.DataStore.find('locations', query).then(function(response) {
        response = response.map(function(location) {
          lookup[location.city] = location;
          return location.city;
        });
        fn(response);
      });
    };
    $scope.updateLocationData = function(city) {
      $scope.locationData = lookup[city] || null;
    };

    // Filter slider.
    var dropdown = $('[data-dropdown="filters"]');
    $scope.slideToggle = function(mode) {
      var close = 'close' === mode;
      $('.filters')['slide' + (close ? 'Up' : 'Toggle')]();
      dropdown[(close ? 'remove' : 'toggle') + 'Class']('dropup disabled');
    };

    // Distance filter.
    $scope.distances = [
      { id: '3.1',  checked: true,  name: '5km' },
      { id: '6.2',  checked: false, name: '10km' },
      { id: '5',    checked: false, name: '5 mile' },
      { id: '10',   checked: false, name: '10 mile' },
      { id: '13.1', checked: false, name: 'Half Marathon' },
      { id: '26.2', checked: false, name: 'Marathon' }
    ];
    $scope.selectedDistances = function() {
      return $filter('filter')($scope.distances, { checked: true })[0];
    };
    $scope.setDistance = function(choice) {
      $scope.distances = $scope.distances.map(function(distance) {
        distance.checked = false;
        return distance;
      });
      choice.checked = true;
    };

    // Type filter.
    $scope.types = Object.keys(GP.types).map(function(id) {
      return { id: id, checked: true };
    });
    $scope.selectedTypes = function() {
      return $filter('filter')($scope.types, { checked: true });
    };
    $scope.toggleSelect = function() {
      $scope.types = $scope.types.map(function(type) {
        type.checked = !type.checked;
        return type;
      });
    };

    // Slice in two.
    var length = Math.ceil($scope.types.length / 2);
    $scope.types1 = $scope.types.slice(0, length);
    $scope.types2 = $scope.types.slice(length);

    // Submit handler.
    $scope.submit = function(location, distance, types) {
      // Reset view.
      $scope.slideToggle('close');

      // Emit event.
      eventService.broadcast('submit', {
        location : location,
        distance : distance,
        types    : types
      });
    };
  }]);

  /**
   * Map controller.
   */
  App.controller('MapCtrl', ['$rootScope', '$scope', 'eventService', 'distance', 'gpLatLng', function($rootScope, $scope, eventService, getDistance, gpLatLng) {
    // Obtain a reference to the map.
    var layer = $('#map')[0];

    // Wait for the run event before plotting a map.
    $scope.$on('run', function() {
      // Extract data.
      var path   = eventService.data.path;
      var length = path.length;

      // Normalize start and end.
      var start  = path[0];
      var end    = path[length - 1];
      var oneWay = start !== end;
      start.name = start.name || (oneWay ? 'START'  : 'START/FINISH');
      end.name   = end.name   || (oneWay ? 'FINISH' : 'START/FINISH');

      // Display data.
      $scope.path = true;
      // $scope.path = start === end ? path.slice(0, -1) : path;

      // Plot map.
      var map = new google.maps.Map(layer, {
        zoom      : 15,
        center    : gpLatLng(start),
        mapTypeId : google.maps.MapTypeId.ROADMAP
      });

      // Add markers to the map.
      path.forEach(function(location, index) {
        // Do not place a marker at the end if the run is a round-trip.
        if(length - 1 === index && oneWay) { return; }

        // Create marker.
        var boundary = -1 !== [start, end].indexOf(location);
        var marker = new google.maps.Marker({
          map      : map,
          icon     : [
            '//chart.googleapis.com/chart?chst=d_simple_text_icon_left&chld=|12|FFFFFF',
            boundary ? 'flag' : 'star',
            '16',
            boundary ? '0000FF' : 'FF0000',
            boundary ? '0000FF' : 'FF0000'
          ].join('|'),
          position : gpLatLng(location),
          title    : location.name
        });
      });

      // Add running path. Google Maps allows max. 10 points (start, end, 8 waypoints) per route.
      var distance = 0;
      var index    = 0;
      var pending  = 0;
      var polyline = [];
      var segment  = [];
      while(0 !== (segment = path.slice(index, index + GP.MAX_POINTS)).length) {
        // Update counter.
        index   += GP.MAX_POINTS - 1;
        pending += 1;

        // Prepare route.
        var origin      = segment[0];
        var destination = segment[segment.length - 1];
        var request     = {
          origin      : gpLatLng(origin),
          destination : gpLatLng(destination),
          waypoints   : segment.slice(1, -1).map(function(location) {
            return { location: gpLatLng(location) };
          }),
          travelMode  : google.maps.DirectionsTravelMode.WALKING
        }

        // Get route.
        var directions = new google.maps.DirectionsService();
        directions.route(request, function(response, status) {
          // Update counter.
          pending -= 1;

          if(google.maps.DirectionsStatus.OK !== status) {
            // TODO error.
          }

          // Force map refresh.
          google.maps.event.trigger(map, "resize");

          // Display the running path.
          var directionsDisplay = new google.maps.DirectionsRenderer({
            map             : map,
            polylineOptions : {
              strokeColor  : '#000000',
              strokeWeight : 5
            },
            suppressMarkers : true
          });
          directionsDisplay.setDirections(response);

          // Save polyline path for later.
          polyline = polyline.concat(response.routes[0].overview_path);

          // Calculate distance and add mile markers when done.
          if(0 !== pending) {
            return;
          }

          var mile     = 0;
          var first    = polyline.shift();
          var current  = [ first.lng(), first.lat() ];
          polyline.forEach(function(latLng) {
            // Calculate distance between two points.
            var coord = [ latLng.lng(), latLng.lat() ];
            distance += getDistance(current, coord, false);

            // Add mile markers.
            if(mile !== parseInt(distance)) {
              mile = parseInt(distance);// Update.
              new google.maps.Marker({
                map      : map,
                icon     : '//chart.googleapis.com/chart?chst=d_text_outline&chld=FFFFFF|12|h|000000|b|' + mile + '%20mi',
                position : latLng,
                title    : mile + ' mi'
              });
            }

            // Update counter.
            current = coord;
          });

          // Update view.
          console.log(distance, eventService.data.distance);
          $scope.distance = distance;
          $rootScope.$safeApply($scope);
        });
      }
    });

    // Hide map.
    $scope.$on('submit', function() {
      $scope.path = null;
    })
  }]);

}.call(this));