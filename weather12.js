const apiKey = '8c2e569999a6352538da620e31f8890b'; 
function loadWeather(city, lat, lon, button) { 
  const forecastContainer = document.getElementById('forecast');
  const todayContainer = document.getElementById('today');
  const tomorrowContainer = document.getElementById('tomorrow');

  // Only do this if a button is provided
  if (button) {
    document.querySelectorAll('.city-buttons button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  }

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
      const daily = data.daily.slice(0, 7); // Use 7 for a week forecast, or keep 16 for all available days
      const hourly = data.hourly ?? [];

      const cardElements = []; // for AQI updating later

      daily.forEach((day, index) => {
        const date = new Date(day.dt * 1000);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'long' });
        const sunrise = new Date(day.sunrise * 1000).toLocaleTimeString();
        const sunset = new Date(day.sunset * 1000).toLocaleTimeString();
        const uvIndex = day.uvi ?? 'N/A';
      
        let hourlyList = '';
        if (index === 0 || index === 1) {
          hourlyList = hourly
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
        .then(res => res.ok ? res.json() : Promise.reject('Air quality error'))
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
              airQualityEl.textContent = `Error loading air quality: ${err}`;
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
let layerControl;
let activeLayers = {}; // Tracks which overlays are currently ON
// Define overlays ONCE outside initMap

const today = new Date().toISOString().split('T')[0];
const lastday = new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0];
const date_for_precipitation = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

const overlayLayers = {
  "VIIRS True Color (SNPP)": L.tileLayer(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${lastday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    { attribution: 'NASA GIBS / VIIRS SNPP', tileSize: 256, minZoom: 1, maxZoom: 9 }
  ),
  "Temperature Overlay": L.tileLayer(
    `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`,
    { attribution: 'Map data © OpenWeatherMap', opacity: 0.8, tileSize: 256 }
  ),
  "Precipitation (IMERG, NASA)": L.tileLayer(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/${date_for_precipitation}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    { attribution: 'NASA GIBS / IMERG', tileSize: 256, opacity: 0.8 }
  )
};

const blackMarbleDate = "2024-05-14" //only for night view
function initMap(lat, lon) {
  if (!map) {

    const baseLayers = {
      "OpenStreetMap": L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
        { attribution: '© OpenStreetMap contributors' }
      ),
      "Blue Marble": L.tileLayer(
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
        { attribution: 'NASA GIBS / Blue Marble', tileSize: 256, minZoom: 1, maxZoom: 8 }
      ),
      
      "Night": L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/${blackMarbleDate}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
        { attribution: 'VIIRS_SNPP_DayNightBand_AtSensor_M15', tileSize: 256, minZoom: 1, maxZoom: 9, opacity: 1}
      )
    };

    //ONE base layer to show first
    map = L.map('map', { layers: [baseLayers["OpenStreetMap"]] }).setView([lat, lon], 7);

    // 3. Add overlays that are active by default
    Object.entries(overlayLayers).forEach(([name, layer]) => {
      if (activeLayers[name]) {
        layer.addTo(map);
      }
    });

    // control with base layers and overlays
    layerControl = L.control.layers(baseLayers, overlayLayers).addTo(map);

    // Listen for overlay add/remove to keep track of activeLayers
    map.on('overlayadd', function(e) {
      for (const [name, layer] of Object.entries(overlayLayers)) {
        if (layer === e.layer) {
          activeLayers[name] = true;
        }
      }
    });
    map.on('overlayremove', function(e) {
      for (const [name, layer] of Object.entries(overlayLayers)) {
        if (layer === e.layer) {
          activeLayers[name] = false;
        }
      }
    });
  } else {
    map.setView([lat, lon], 7);
  }
}


function searchCity(cityName) {
  const dropdown = document.getElementById('city-dropdown');
  dropdown.style.display = 'block'; // Show dropdown
  dropdown.innerHTML = '<li style="padding: 10px; text-align: center;">Loading...</li>'; // Show loading state

  fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${cityName}&limit=5&appid=${apiKey}`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.length === 0) {
        dropdown.innerHTML = '<li style="padding: 10px; text-align: center;">No cities found</li>';
        return;
      }

      // Populate dropdown with cities
      dropdown.innerHTML = '';
      data.forEach(city => {
        const listItem = document.createElement('li');
        listItem.style.padding = '10px';
        listItem.style.cursor = 'pointer';
        listItem.textContent = `${city.name}, ${city.country}`;
        listItem.dataset.lat = city.lat;
        listItem.dataset.lon = city.lon;

        listItem.addEventListener('click', () => {
          const lat = parseFloat(listItem.dataset.lat);
          const lon = parseFloat(listItem.dataset.lon);
          const cityName = city.name;

          dropdown.style.display = 'none'; // Hide dropdown
          document.getElementById('search-input').value = cityName; // Update input field
          initMap(lat, lon); // Update map view
          loadWeather(cityName, lat, lon, null); // Load weather data for the selected city
        });

        dropdown.appendChild(listItem);
      });
    })
    .catch(error => {
      console.error('Error searching for city:', error);
      dropdown.innerHTML = '<li style="padding: 10px; text-align: center;">Error loading cities</li>';
    });
}

window.onload = () => {
  const buttons = document.querySelectorAll('.city-buttons button'); // Declare buttons at the beginning

  if (buttons.length > 0) {
    const lat = parseFloat(buttons[0].dataset.lat);
    const lon = parseFloat(buttons[0].dataset.lon);
    const city = buttons[0].dataset.city;

    if (!isNaN(lat) && !isNaN(lon)) {
      initMap(lat, lon); // Initialize map with default city coordinates
      loadWeather(city, lat, lon, buttons[0]); // Load weather data for default city
      buttons[0].classList.add('active'); // Highlight the default city button
    } else {
      console.error('Invalid default city coordinates.');
    }
  } else {
    console.error('No city buttons found.');
  }

  // Add event listeners to city buttons
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const lat = parseFloat(button.dataset.lat);
      const lon = parseFloat(button.dataset.lon);
      const city = button.dataset.city;

      if (!isNaN(lat) && !isNaN(lon)) {
        initMap(lat, lon); // Update map view
        loadWeather(city, lat, lon, button); // Load weather data
        buttons.forEach(btn => btn.classList.remove('active')); // Remove active class from all buttons
        button.classList.add('active'); // Highlight the clicked button
      } else {
        console.error(`Invalid coordinates for city: ${city}`);
      }
    });
  });

  // Add search functionality
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  searchInput.addEventListener('input', () => {
    const cityName = searchInput.value.trim();
    if (cityName) {
      searchCity(cityName);
    } else {
      document.getElementById('city-dropdown').style.display = 'none'; // Hide dropdown if input is empty
    }
  });

  searchButton.addEventListener('click', () => {
    const cityName = searchInput.value.trim();
    if (cityName) {
      searchCity(cityName);
    } else {
      alert('Please enter a city name.');
    }
  });
};
