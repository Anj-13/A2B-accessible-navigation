"use strict";

const { demoScenarios } = require("./demoScenarios");
const { recommendRoute } = require("./scoreRoute");

for (const [name, scenario] of Object.entries(demoScenarios)) {
  const result = recommendRoute(scenario);

  console.log(`\n${name.toUpperCase()}`);
  console.log(JSON.stringify(result, null, 2));
}
