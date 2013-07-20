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
    // Maximum number of waypoints per route.
    MAX_WAYPOINTS : 8,

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
        deferred.resolve(response[0].city);
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
    var FUZZY_FACTOR       = 1.1;
    return function(coord1, coord2, fuzzy) {
      // Convert coordinates to radians.
      var lon1 = coord1[0] * DEGREES_TO_RADIANS;
      var lat1 = coord1[1] * DEGREES_TO_RADIANS;
      var lon2 = coord2[0] * DEGREES_TO_RADIANS;
      var lat2 = coord2[1] * DEGREES_TO_RADIANS;

      // Calculate distance.
      var distance = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2);
      distance = EARTH_RADIUS * Math.acos(distance);
      return false !== fuzzy ? distance * (FUZZY_FACTOR + distance / 25) : distance;
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
      $scope.locationError = false;
      $scope.places        = null;
      $scope.run           = null;

      // Extract event data.
      var data     = eventService.data;
      var location = data.location;
      var radius   = parseFloat(data.distance.id);
      var types    = data.types.map(function(type) { return type.id; });

      // Retrieve the location information.
      var query   = new Kinvey.Query().equalTo('city', location);
      var promise = Kinvey.DataStore.find('locations', query).then(function(response) {
        if(response[0]) {
          $scope.city   = response[0];
          $scope.places = getPOI($scope.city._geoloc, radius, types);
        }
        else {// No results found.
          $scope.locationError = true;
        }
        $rootScope.$safeApply($scope);
      });
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
    $scope.location = currentLocation.then(function(location) {
      // Automatically suggest POI for the users’ current location.
      $scope.submit(location, $scope.distances[0], []);

      return location;
    });

    // Location typeahead.
    $scope.typeahead = function(pattern, fn) {
      var query = new Kinvey.Query().matches('city', pattern, { ignoreCase: true }).limit(5);
      Kinvey.DataStore.find('locations', query).then(function(response) {
        fn( response.map(function(city) { return city.city; }) );
      });
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
  App.controller('MapCtrl', ['$rootScope', '$scope', 'eventService', 'distance', function($rootScope, $scope, eventService, getDistance) {
    var layer = $('#map')[0];

    // Wait for the run event before plotting a map.
    $scope.$on('run', function() {
      // Extract data.
      var path   = eventService.data.path;
      var start  = path[0]._geoloc;
      var end    = path[path.length - 1]._geoloc;
      var center = [ (start[0] + end[0]) / 2, (start[1] + end[1]) / 2 ];

      // Display data.
      $scope.path = start === end ? path.slice(0, -1) : path;

      // Plot map.
      var map = new google.maps.Map(layer, {
        zoom      : 15,
        center    : new google.maps.LatLng(center[1], center[0]),
        mapTypeId : google.maps.MapTypeId.ROADMAP
      });

      // Add markers.
      $scope.path.forEach(function(place, index) {
        var color = 0 === index ? '0000FF' : 'FF0000';
        var icon  = 0 === index ? 'flag'   : 'star';

        var coord  = place._geoloc;
        var marker = new google.maps.Marker({
          icon      : '//chart.googleapis.com/chart?chst=d_simple_text_icon_left&chld=|12|FFFFFF|' + icon + '|16|' + color + '|' + color,
          map       : map,
          position  : new google.maps.LatLng(coord[1], coord[0]),
          title     : place.name
        });
      });

      // Add directions. Google Maps allows a maximum of 8 waypoints per route.
      var distance = 0;
      var index    = 0;
      var segment  = [];
      while(1 < (segment = path.slice(index, index + GP.MAX_WAYPOINTS)).length) {
        // Update counter.
        index += GP.MAX_WAYPOINTS - 1;

        // Add path.
        var origin      = segment[0]._geoloc;
        var destination = segment[segment.length - 1]._geoloc;
        var request = {
          origin      : new google.maps.LatLng(origin[1], origin[0]),
          destination : new google.maps.LatLng(destination[1],   destination[0]),
          waypoints   : segment.slice(1, -1).map(function(place) {
            var coord = place._geoloc;
            return { location: new google.maps.LatLng(coord[1], coord[0]) };
          }),
          travelMode  : google.maps.DirectionsTravelMode.WALKING
        };

        // Get route.
        var directions = new google.maps.DirectionsService();
        directions.route(request, function(response, status) {
          if(google.maps.DirectionsStatus.OK === status) {
            var directionsDisplay = new google.maps.DirectionsRenderer({
              map             : map,
              polylineOptions : {
                strokeColor  : '#000000',
                strokeWeight : 5
              },
              suppressMarkers : true
            });
            directionsDisplay.setDirections(response);

            // Calculate distance and add mile markers.
            // Add mile markers.
            var distance = 0;
            var mile     = 0;
            var first = response.routes[0].overview_path[0];
            var loc   = [ first.lng(), first.lat() ];
            response.routes[0].overview_path.slice(1).forEach(function(latLng) {
              var coord = [ latLng.lng(), latLng.lat() ];
              distance += getDistance(loc, coord, false);

              // Add mile markers.
              if(mile !== parseInt(distance)) {
                mile = parseInt(distance);
                new google.maps.Marker({
                  icon     : {
                    anchor : new google.maps.Point(0, 10),
                    url    : '//chart.googleapis.com/chart?chst=d_text_outline&chld=FFFFFF|12|h|000000|b|' + mile + '%20mi',
                  },
                  map      : map,
                  position : latLng,
                  title    : mile + ' mi'
                });
              }

              // Update.
              loc = coord;
            });

            // Force map refresh.
            google.maps.event.trigger(map, "resize");

            console.log(distance, eventService.data.distance);
          }
        });
      }
    });

    // Hide map.
    $scope.$on('submit', function() {
      $scope.path = null;
    })
  }]);

}.call(this));