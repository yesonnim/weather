const apiKey = '8c2e569999a6352538da620e31f8890b';

function loadWeather(city, lat, lon, button) {
  const forecastContainer = document.getElementById('forecast');
  const todayContainer = document.getElementById('today');
  const tomorrowContainer = document.getElementById('tomorrow');

  // Clear previous content
  forecastContainer.innerHTML = '';
  todayContainer.innerHTML = '';
  tomorrowContainer.innerHTML = '';

  fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&appid=${apiKey}&units=metric`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      const daily = data.daily.slice(0, 16); // up to 16 days
      const hourly = data.hourly ?? [];

      const cardElements = []; // for AQI updating later

      daily.forEach((day, index) => {
        const date = new Date(day.dt * 1000);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'long' });
        const sunrise = new Date(day.sunrise * 1000).toLocaleTimeString();
        const sunset = new Date(day.sunset * 1000).toLocaleTimeString();
        const uvIndex = day.uvi ?? 'N/A';
      
        // Only generate hourly list for first two days
        let hourlyList = '';
        if (index === 0 || index === 1) {
          hourlyList = (data.hourly ?? [])
            .filter(h => new Date(h.dt * 1000).getDate() === date.getDate())
            .slice(0, 6)
            .map(hour => {
              const time = new Date(hour.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `<li>${time}: ${Math.round(hour.temp)}°C</li>`;
            }).join('');
        }
      
        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <h4><strong>${formattedDate}</strong></h4>
          <img src="https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png" alt="${day.weather[0].description}">
          <p>${day.weather[0].description}</p>
          <h2>${Math.round(day.temp.day)}°C</h2>
          <p>💧 ${day.humidity}%</p>
          <p>💨 ${day.wind_speed} km/h</p>
          <div class="details">
            <p>☀️ Sunrise: ${sunrise}</p>
            <p>🌙 Sunset: ${sunset}</p>
            <p>🔆 UV Index: ${uvIndex}</p>
            ${hourlyList ? `<p><strong>Next Hours:</strong></p><ul>${hourlyList}</ul>` : ''}
            <p class="air-quality">🌫️ Loading air quality...</p>
          </div>
        `;
   

        // Append appropriately
        if (index === 0) {
          todayContainer.appendChild(card);
        } else if (index === 1) {
          tomorrowContainer.appendChild(card);
        } else {
          const detailSection = card.querySelector('.details');
          detailSection.style.display = 'none';
          card.addEventListener('click', () => {
            detailSection.style.display = detailSection.style.display === 'none' ? 'block' : 'none';
          });
          forecastContainer.appendChild(card);
        }

        cardElements.push(card); // collect for AQI insertion
      });

      // Fetch AQI once and update all cards
      fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(airData => {
          const aqi = airData.list[0].main.aqi;
          const quality = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
          cardElements.forEach(card => {
            const airQualityEl = card.querySelector('.air-quality');
            if (airQualityEl) {
              airQualityEl.textContent = `🌫️ Air Quality: ${quality[aqi - 1]}`;
            }
          });
        })
        .catch(err => {
          cardElements.forEach(card => {
            const airQualityEl = card.querySelector('.air-quality');
            if (airQualityEl) {
              airQualityEl.textContent = `Error loading air quality: ${err.message}`;
            }
          });
        });
    })
    .catch(error => {
      forecastContainer.innerHTML = '<p>Unable to fetch weather data. Please try again later.</p>';
      console.error(error);
    });
}


let map;
let baseLayer;
let overlayLayers = {};
let layerControl;
let activeOverlays = {}; // Track which overlays are active
function initMap(lat, lon) {
  const today = new Date().toISOString().split('T')[0];

  // Define base layer (Blue Marble)
  if (!baseLayer) {
    baseLayer = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
      {
        attribution: 'NASA GIBS / Blue Marble',
        tileSize: 256,
        minZoom: 1,
        maxZoom: 8
      }
    );
  }

  // Define overlay layers
  overlayLayers["True Color (Today)"] = L.tileLayer(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${today}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    {
      attribution: 'NASA GIBS / MODIS Terra',
      tileSize: 256,
      minZoom: 1,
      maxZoom: 9
    }
  );

  // Initialize map if not exists
  if (!map) {
    map = L.map('map').setView([lat, lon], 7);
    baseLayer.addTo(map);

    // Initialize all overlays on map if active
    for (const name in overlayLayers) {
      if (activeOverlays[name] === undefined) {
        // Default: true for True Color overlay on first load
        activeOverlays[name] = (name === "True Color (Today)");
      }
      if (activeOverlays[name]) {
        overlayLayers[name].addTo(map);
      }
    }

    // Create layer control with base and overlays
    layerControl = L.control.layers(
      { "Default": baseLayer },
      overlayLayers
    ).addTo(map);

    // Listen to overlayadd and overlayremove events to update activeOverlays state
    map.on('overlayadd', function(e) {
      activeOverlays[e.name] = true;
    });
    map.on('overlayremove', function(e) {
      activeOverlays[e.name] = false;
    });

  } else {
    // Map exists: just update view
    map.setView([lat, lon], 7);

    // Remove all overlays from map first
    for (const name in overlayLayers) {
      if (map.hasLayer(overlayLayers[name])) {
        map.removeLayer(overlayLayers[name]);
      }
    }

    // Add overlays that are active
    for (const name in overlayLayers) {
      if (activeOverlays[name]) {
        overlayLayers[name].addTo(map);
      }
    }
  }
}

window.onload = () => {
  const buttons = document.querySelectorAll('.city-buttons button');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const lat = parseFloat(button.dataset.lat);
      const lon = parseFloat(button.dataset.lon);
      const city = button.dataset.city;

      if (isNaN(lat) || isNaN(lon)) {
        console.error(`Invalid coordinates for city: ${city}`);
        alert(`Invalid coordinates for city: ${city}`);
        return;
      }

      initMap(lat, lon); // re-inits map view and overlays without full reset
      loadWeather(city, lat, lon, button);
    });
  });

  // Load first city on startup
  if (buttons[0]) {
    const lat = parseFloat(buttons[0].dataset.lat);
    const lon = parseFloat(buttons[0].dataset.lon);
    const city = buttons[0].dataset.city;
    initMap(lat, lon);
    loadWeather(city, lat, lon, buttons[0]);
  }
};
