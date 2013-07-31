# MarkMyRun
> [Kinvey](http://www.kinvey.com) hackathon app.

## Summary
The app retrieves Points of Interest based on the users’ current location, or the location entered. After, the user can pick any number of locations it wants to visit during a run. The app will then propose a running route. The purpose of this app is to combine the best of traveling and running.

## Installation
After cloning the repository:

  * Set-up your [Kinvey backend](https://console.kinvey.com).
  * Obtain a [Google Places API Key](https://developers.google.com/places/documentation/), and configure the location addon in your backend.
  * In your backend, create a `locations` collection and import `assets/locations.json`. Set the collection permissions to *Read Only*.
  * In your backend, create an `images` collection. Set the collection permissions to *Private*.
  * In your backend, add an `image` custom endpoint. Paste the code from `assets/custom-endpoint.js`. Set the `GOOGLE_PLACES_API_KEY` constant to your Google Places API Key, obtained in step 2.

Your backend is now set-up. To run your app:

  * Replace `Your App Key` and `Your App Secret` with your application credentials (`public/index.html`).
  * Run `node index` to start your app.
  * Open `http://localhost:3000/index.html`.

## License
    The MIT License (MIT)

    Copyright (c) 2013 Mark van Seventer

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

This product includes data created by MaxMind, available from
http://www.maxmind.com/