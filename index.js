require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const { AzureOpenAI } = require("openai");

const twilio = require("twilio");

const User = require("./models/User");
const Temperature = require("./models/Temperature");
const expressLayouts = require("express-ejs-layouts");
PORT = 3000;
const fetch = require("node-fetch");
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const client = require("twilio")(accountSid, authToken);

require("./config/passport")(passport);

const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(expressLayouts);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

mongoose
  .connect("mongodb://127.0.0.1:27017/Heatscrapers", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.error = req.flash("error");
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

app.get("/send-sms", (req, res) => {});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("error_msg", "Login to view this page!");
  return res.redirect("/user/login");
}

app.get("/", (req, res) => {
  res.send("Server working well...");
});

app.get("/user/signup", (req, res) => res.render("signUp"));

app.post("/user/signup", async (req, res, next) => {
  const { location, phoneNumber, email, username, password, confirmPassword } =
    req.body;

  try {
    if (password !== confirmPassword) {
      req.flash("error_msg", "Passwords do not match! Please try again.");
      return res.redirect("/user/signup");
    }
    // Check if user exists
    let user = await User.findOne({ username });
    if (user) {
      req.flash("error_msg", "User already exists");
      return res.redirect("/user/login");
    }

    // Create new user
    user = new User({ location, phoneNumber, email, username, password });
    await user.save();

    // Automatically log in the user
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success_msg", "Welcome to Heatscrapers! Signup successfull.");
      return res.redirect("/home");
    });
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Something went wrong");
    res.redirect("/user/signup");
  }
});

// Login form
app.get("/user/login", (req, res) => res.render("login"));

// Login POST
app.post("/user/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash("error_msg", info.message);
      return res.redirect("/user/login");
    }

    req.logIn(user, (err) => {
      if (err) return next(err);
      req.flash("success_msg", `Welcome back, ${user.username || user.email}!`);
      return res.redirect("/home");
    });
  })(req, res, next);
});

async function fetchPlantSuggestions(location) {
  let plantSuggestions = [];

  try {
    const prompt = `
Suggest 3 plants or trees suitable for planting in ${location}.
Return ONLY in strict JSON array format:

[
  { "name": "Plant Name", "reason": "One short reason" },
  { "name": "Plant Name", "reason": "One short reason" },
  { "name": "Plant Name", "reason": "One short reason" }
]
`;

    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0].message.content;
    plantSuggestions = JSON.parse(text);
  } catch (err) {
    console.error("Azure OpenAI error:", err);

    // fallback
    plantSuggestions = [
      { name: "Neem", reason: "Very heat-tolerant and low maintenance." },
      { name: "Ashoka", reason: "Grows well in Indian urban conditions." },
      { name: "Bougainvillea", reason: "Survives extreme heat and sunlight." },
    ];
  }

  // --- IMAGE FETCHING ---
  const UNSPLASH_KEY = process.env.UNSPLASH_KEY;

  for (let plant of plantSuggestions) {
    try {
      const imgRes = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
          plant.name + " plant"
        )}&client_id=${UNSPLASH_KEY}&per_page=1`
      );

      const imgData = await imgRes.json();

      plant.image =
        imgData.results?.[0]?.urls?.small ||
        "https://via.placeholder.com/200?text=No+Image";
    } catch (err) {
      console.error("Unsplash error:", err);
      plant.image = "https://via.placeholder.com/200?text=No+Image";
    }
  }

  return plantSuggestions;
}

app.get("/user/get-plants", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = req.user;

  try {
    const plants = await fetchPlantSuggestions(user.location);
    res.json({ plants });
  } catch (err) {
    console.error("Error fetching plants:", err);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

app.get("/user/dashboard", async (req, res) => {
  if (!req.isAuthenticated()) {
    req.flash("error_msg", "Login to view your dashboard.");
    return res.redirect("/user/login");
  }

  const user = req.user;

  //WEATHER STATS

  let weather = {};

  try {
      // Extract city,state from user.location
      let locParts = user.location.split(",");
      const city = locParts[0].trim();
      const state = locParts[1] ? locParts[1].trim() : "";
      const query = `${city},${state}`;

      const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error("Location not found");

      const lat = geoData[0].lat;
      const lon = geoData[0].lon;

      const url = `https://atlas.microsoft.com/weather/currentConditions/json?subscription-key=${process.env.AZURE_MAP_KEY}&api-version=1.0&query=${lat},${lon}`;
      const response = await fetch(url);
      const data = await response.json();

      console.log('Azure API response:', data);

      if (data && data.results && data.results.length > 0) {
          const w = data.results[0];
          weather.temperature = w.temperature?.value;
          weather.feelsLike = w.apparentTemperature?.value;
          weather.humidity = w.relativeHumidity;
          weather.windSpeed = w.wind?.speed?.value;
          weather.condition = w.cloudCover === 0 ? 'Clear' : 'Cloudy';
      }

  } catch(err) {
      console.error('Azure Maps Weather API error:', err);
  }

  const userId = req.user._id;
  const submissions = await Temperature.find({ user: userId }).sort({
    date: -1,
  });
  const totalPoints = submissions.reduce(
    (acc, cur) => acc + (cur.points || 0),
    0
  );

  res.render("userDashboard", {
    user,
    weather,
    plantSuggestions: [],
    iot: {},
    submissions,
    totalPoints,
  });
});

// Logout
app.get("/logout", (req, res) => {
  req.logout(() => {
    req.flash("success_msg", "Logged out successfully!");
    res.redirect("/home");
  });
});

app.get(
  "/home/community/leaderboard",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const users = await User.find({}).select("username").lean();

      // Calculate points for each user
      const leaderboard = await Promise.all(
        users.map(async (u) => {
          const submissions = await Temperature.find({ user: u._id });
          const totalPoints = submissions.reduce(
            (acc, cur) => acc + (cur.points || 0),
            0
          );
          return { ...u, totalPoints };
        })
      );

      // Sort descending by points
      leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

      res.render("leaderboard", {
        leaderboard,
        currentUserId: req.user._id,
      });
    } catch (err) {
      console.log(err);
      res.send("Server error");
    }
  }
);

app.get("/home", (req, res) => {
  res.render("home", { name: "Mrunalini" });
});

app.post("/home/search", async (req, res) => {
  let { searchedPlace } = req.body;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchedPlace
      )}&limit=1`
    );

    const data = await response.json();

    if (data.length > 0) {
      const lat = data[0].lat;
      const lon = data[0].lon;
      res.json({ lat, lon });
    } else {
      res.json({ lat: null, lon: null });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching coordinates");
  }
});


app.get("/api/yearlyHeat", (req, res) => {
  const { place, year } = req.query;
  // Dummy data generator
  const result = {};
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const date = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(
        2,
        "0"
      )}`;
      result[date] = Math.floor(25 + Math.random() * 15); // 25–40°C
    }
  }
  console.log("CALENDER DATA", result);
  res.json(result);
});

app.get("/home/compareCities", (req, res) => {
  res.render("compareCities");
});
app.get("/home/similarProgs", (req, res) => {
  res.render("similarProgs");
});
app.get("/home/timeLine", (req, res) => {
  res.render("timeLine");
});
app.get("/home/viewHeatMap", (req, res) => {
  res.render("viewHeatMap");
});

app.get("/api/azureKey", (req, res) => {
  res.json({ key: process.env.AZURE_MAP_KEY });
});

app.get("/api/heatpoints", async (req, res) => {
  let place = req.query.place;

  if (!place) {
    return res.status(400).json({ error: "Missing place parameter" });
  }

  // Ensure consistent formatting for Nominatim
  place = place.trim();
  if (!place.toLowerCase().includes("india")) {
    place += ", India";
  }

  try {
    // 1️⃣ Get coordinates from Nominatim
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        place
      )}&limit=1`
    );
    const geoData = await geoRes.json();

    if (!geoData.length) {
      return res.status(404).json({ error: "Place not found" });
    }

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // 2️⃣ Generate grid points
    const points = [];
    const gridSize = 5; // 5x5 grid = 25 points (adjust if needed)
    const offset = 0.02; // ~2 km per step

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    const fetchPromises = [];

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const jitter = 0.01;
        const pointLat =
          lat + (i - gridSize / 2) * offset + (Math.random() - 0.5) * jitter;
        const pointLon =
          lon + (j - gridSize / 2) * offset + (Math.random() - 0.5) * jitter;

        const powerUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?start=${dateStr}&end=${dateStr}&parameters=T2M&community=SB&longitude=${pointLon}&latitude=${pointLat}&format=JSON`;

        // Push all fetch promises in parallel
        fetchPromises.push(
          fetch(powerUrl)
            .then((r) => r.json())
            .then((powerData) => {
              const t2mData = powerData?.properties?.parameter?.T2M;
              if (t2mData) {
                const lastDate = Object.keys(t2mData).sort().pop();
                const temp = t2mData[lastDate];
                if (temp !== null && !isNaN(temp)) {
                  // Normalize between 0 and 1 for heatmap
                  const intensity = Math.max(0, Math.min(1, (temp - 15) / 30));
                  points.push({ lat: pointLat, lon: pointLon, intensity });
                }
              }
            })
            .catch((err) =>
              console.error(
                `NASA POWER fetch failed for point ${pointLat}, ${pointLon}`,
                err
              )
            )
        );
      }
    }

    // Wait for all NASA POWER requests to complete
    await Promise.all(fetchPromises);

    if (!points.length) {
      return res
        .status(500)
        .json({ error: "No heatpoints could be retrieved." });
    }

    console.log(`Heatpoints for ${place}:`, points.length);
    res.json({ points });
  } catch (err) {
    console.error("Error in /api/heatpoints:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/about", (req, res) => {
  res.render("about");
});
app.get("/contact", (req, res) => {
  res.render("contact");
});

app.post("/user/submit-temperature", ensureAuthenticated, async (req, res) => {
  console.log("req recieved at route");
  try {
    const { temperature } = req.body;
    const userId = req.user._id;

    const today = new Date().toISOString().split("T")[0];

    // Check if user already submitted today
    const already = await Temperature.findOne({ user: userId, date: today });

    if (already) {
      return res.json({
        success: false,
        message: "You already submitted today's temperature.",
      });
    }

    // Save submission
    await Temperature.create({
      user: userId,
      temperature,
      date: today,
      points: 1,
    });

    // High temperature alert
    const HIGH_TEMP_THRESHOLD = 40; // °C
    if (temperature >= HIGH_TEMP_THRESHOLD && req.user.phoneNumber) {
      const alertMessage = `⚠️ Alert from Heatscrapers: ${req.user.username}, high temperature of ${temperature}°C recorded. Stay hydrated!`;
      try {
        await client.messages.create({
          body: alertMessage,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: req.user.phoneNumber,
        });
        console.log("ALERT MSG SENT TO NUMBER");
      } catch (err) {
        console.error("Failed to send SMS:", err.message);
      }
    }
    console.log(req.user.phoneNumber , temperature);
    res.json({
      success: true,
      message: "Temperature submitted! You earned 1 point.",
    });

  } catch (err) {
    console.error(err);
    res.json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});

app.post("/contact/submit", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.json({ success: false, message: "All fields are required." });
    }

    console.log("New contact message:", { name, email, message });

    req.flash("success_msg" ,  "Thank you! Your message has been received.");
    return res.redirect("/home");
  } catch (err) {
    console.error(err);
    return res.redirect("/home");
  }
});


app.listen(PORT, () => {
  console.log(`server active at http://localhost:${PORT}/home`);
});
