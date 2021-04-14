const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");


module.exports = {
  target: "webworker",
  mode: "production",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "lightning-fs.min.js",
    library: "LightningFS",
    libraryTarget: "global",
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({ parallel: true })]
  },
};
