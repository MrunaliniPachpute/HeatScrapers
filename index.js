const express = require("express");
const app = express();
const expressLayouts = require("express-ejs-layouts");
PORT=3000
require("dotenv").config();

app.set("view engine" , "ejs");

app.use(express.static("public"));
app.use(expressLayouts);

app.use(express.urlencoded({extended : true}));
app.use(express.json());

app.get("/" , (req,res)=>{
  res.send("Server working well...");
});

app.get("/home" , (req,res)=>{
  res.render("home" , {name : "Mrunalini"});
});

app.post("/home/search", async (req, res) => {
  let { searchedPlace } = req.body;
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchedPlace)}&limit=1`);
   
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


app.get("/home/compareCities",(req,res)=>{
  res.render("compareCities");
});
app.get("/home/similarProgs",(req,res)=>{
  res.render("similarProgs");
});
app.get("/home/timeLine",(req,res)=>{
  res.render("timeLine");
});
app.get("/home/viewHeatMap",(req,res)=>{
  res.render("viewHeatMap");
});

app.get("/about",(req,res)=>{
  res.render("about");
});

app.listen(PORT , ()=>{
  console.log(`server active at http://localhost:${PORT}/home`)
})