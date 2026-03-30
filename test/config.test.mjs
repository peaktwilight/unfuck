import test from "node:test";
import assert from "node:assert/strict";

import { applyConfig, generateDefaultConfig } from "../dist/config.js";
import { calcScore } from "../dist/display.js";

test("config helpers filter issues and scoring stays stable", () => {
  const issues = [
    { severity: "HIGH", category: "SEO", title: "Missing title", detail: "missing title tag" },
    { severity: "MEDIUM", category: "Quality", title: "TODO comment", detail: "left in code" },
    { severity: "LOW", category: "Production", title: "No CI/CD configuration", detail: "workflow missing" }
  ];

  const filtered = applyConfig(issues, {
    ignore: ["TODO comment"],
    severity: { "Missing title": "LOW" },
    disable: ["production"]
  });

  assert.deepEqual(filtered, [
    { severity: "LOW", category: "SEO", title: "Missing title", detail: "missing title tag" }
  ]);
  assert.equal(calcScore(filtered), 98);

  const defaults = JSON.parse(generateDefaultConfig());
  assert.equal(defaults.threshold, 50);
  assert.deepEqual(defaults.disable, []);
});
