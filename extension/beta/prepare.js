const fs = require("fs");

const packageJson = require("../package.json");
const betaPackageJson = require("./package-beta.json");

Object.assign(packageJson, betaPackageJson);

fs.writeFileSync("../package.json", JSON.stringify(packageJson, null, 2), "utf8");

fs.copyFileSync("./README.md", "../README.md");
fs.copyFileSync("./icon.png", "../icon.png");
