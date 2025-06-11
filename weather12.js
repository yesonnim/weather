const apiKey = '8c2e569999a6352538da620e31f8890b'; 
function loadWeather(city, lat, lon, button) { 
  const forecastContainer = document.getElementById('forecast');
  const todayContainer = document.getElementById('today');
  const tomorrowContainer = document.getElementById('tomorrow');
  const sliderContainer = document.getElementById('slider-container'); // Add slider container

  // Only do this if a button is provided
  if (button) {
    document.querySelectorAll('.city-buttons button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  }

  // Clear previous content
  forecastContainer.innerHTML = '';
  todayContainer.innerHTML = '';
  tomorrowContainer.innerHTML = '';
  sliderContainer.innerHTML = ''; // Clear slider content

  fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&appid=${apiKey}&units=metric`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      const daily = data.daily.slice(0, 16); 
      const hourly = data.hourly ?? [];

      const cardElements = []; // for AQI updating later

      daily.forEach((day, index) => {
        const date = new Date(day.dt * 1000);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'long' });
        const sunrise = new Date(day.sunrise * 1000).toLocaleTimeString();
        const sunset = new Date(day.sunset * 1000).toLocaleTimeString();
        const uvIndex = day.uvi ?? 'N/A';
        const precipitation = day.pop ? `${Math.round(day.pop * 100)}%` : 'N/A'; // Add precipitation data
      
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
          <p>🌧️ Precipitation: ${precipitation}</p> 
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
          sliderContainer.appendChild(card); // Add to slider container
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
  "Air Temp 2m (custom)": L.tileLayer(
    `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.6&palette=-65:821692;-55:821692;-45:821692;-40:821692;-30:8257db;-20:208cec;-10:20c4e8;0:23dddd;10:c2ff28;20:fff028;25:ffc228;30:fc8014`,
    {
      attribution: "OpenWeatherMap TA2",
      tileSize: 256,
      opacity: 0.6,
      minZoom: 1,
      maxZoom: 10
    }
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

    // base layer to show first
    map = L.map('map', { layers: [baseLayers["Blue Marble"]] }).setView([lat, lon], 7);

    // overlays that are active by default
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

async function loadHistory(city, lat, lon) {
  //  today's MM-DD (e.g., "06-12")
  const today = new Date();
  const mmdd = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  // up to last full year (e.g., 2024 if now 2025)
  const endYear = new Date().getFullYear() - 1;
  const startDate = "1940-01-01";
  const endDate = `${endYear}-12-31`;

  document.getElementById('info').innerHTML = `Loading data for ${city}... (can take a while)`;

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean&timezone=Asia/Seoul`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error fetching data");
    const data = await res.json();
    if (!data.daily || !data.daily.time || !data.daily.temperature_2m_mean) {
      document.getElementById('info').innerHTML = 'No data available for this city!';
      return;
    }

    // Filter for today's MM-DD across all years
    const filtered = [];
    for (let i = 0; i < data.daily.time.length; ++i) {
      if (data.daily.time[i].slice(5) === mmdd) {
        filtered.push({ year: data.daily.time[i].slice(0, 4), temp: data.daily.temperature_2m_mean[i] });
      }
    }

    if (filtered.length === 0) {
      document.getElementById('info').innerHTML = 'No data for this date!';
      return;
    }

    // Prepare arrays for plotting
    const years = filtered.map(item => item.year);
    const temps = filtered.map(item => item.temp);

    drawChart(years, temps, `${city} on ${mmdd}`);
    document.getElementById('info').innerHTML =
      `<b>Temperature on ${mmdd} in ${city} from ${years[0]} to ${years[years.length - 1]}</b>`;
  } catch (err) {
    document.getElementById('info').innerHTML = `<b>Error: ${err.message}</b>`;
  }
}

let climateChart;
function drawChart(years, temps, city) {
  if (climateChart) climateChart.destroy(); // Destroy existing chart if any
  const ctx = document.getElementById('climateChart').getContext('2d');
  climateChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: `How Temperature Changed Over the Last 80 Years`,
        data: temps,
        borderColor: 'rgb(3, 127, 59)',
        backgroundColor: 'rgba(3, 127, 59, 0.2)',
        pointRadius: 2,
        tension: 0.12,
        fill: true
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: ` ${city}` }
      },
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: '°C' } }
      }
    }
  });
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
  const buttons = document.querySelectorAll('.city-buttons button'); // Declare city buttons
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');

  // Initialize default city
  if (buttons.length > 0) {
    const lat = parseFloat(buttons[0].dataset.lat);
    const lon = parseFloat(buttons[0].dataset.lon);
    const city = buttons[0].dataset.city;

    if (!isNaN(lat) && !isNaN(lon)) {
      initMap(lat, lon); // Initialize map with default city coordinates
      loadWeather(city, lat, lon, buttons[0]); // Load weather data for default city
      loadHistory(city, lat, lon); // Load historical climate data for default city
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
        loadHistory(city, lat, lon); // Load historical climate data
        buttons.forEach(btn => btn.classList.remove('active')); // Remove active class from all buttons
        button.classList.add('active'); // Highlight the clicked button
      } else {
        console.error(`Invalid coordinates for city: ${city}`);
      }
    });
  });

  // Add search functionality
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

  // Add event listener for dropdown city selection
  const dropdown = document.getElementById('city-dropdown');
  dropdown.addEventListener('click', (event) => {
    const listItem = event.target.closest('li');
    if (listItem) {
      const lat = parseFloat(listItem.dataset.lat);
      const lon = parseFloat(listItem.dataset.lon);
      const cityName = listItem.textContent.trim();

      if (!isNaN(lat) && !isNaN(lon)) {
        initMap(lat, lon); // Update map view
        loadWeather(cityName, lat, lon, null); // Load weather data
        loadHistory(cityName, lat, lon); // Load historical climate data
        dropdown.style.display = 'none'; // Hide dropdown
        searchInput.value = cityName; // Update input field
      } else {
        console.error('Invalid city coordinates.');
      }
    }
  });
};
