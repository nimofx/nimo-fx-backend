require("dotenv").config();   // 🔥 ye line add karni hai

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NIMO FX backend running on port ${PORT}`);
  });
});