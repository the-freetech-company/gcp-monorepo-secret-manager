#!/usr/bin/env node
console.warn(
  "[gcp-monorepo-secret-manager] This package has been renamed to 'monorepo-secret-manager'. Please update your dependency."
);
require("monorepo-secret-manager/dist/cli.js");
