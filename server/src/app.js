const express = require("express");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.use(express.json());
app.use("/api/v1", routes);
app.use((req, res) =>
  res.status(404).json({ success: false, error: "Route not found" }),
);
app.use(errorHandler);

module.exports = app;
