#!/usr/bin/env bun

"use strict";

process.chdir(__dirname);

// Perform Bun version check before loading any other files or modules
// Doing this check as soon as possible allows us to
// avoid ES6 parser errors or other issues
const pkg = require("./package.json");

if (!require("semver").satisfies(process.versions.bun || "0.0.0", pkg.engines.bun)) {
	/* eslint-disable no-console */
	console.error(
		"The Lounge requires Bun " +
			pkg.engines.bun +
			" (current version: " +
			(process.versions.bun || "not Bun") +
			")"
	);
	console.error("Please run it with an up to date Bun in order to use The Lounge");
	console.error("See https://thelounge.chat/docs/install-and-upgrade");
	console.error();

	process.exit(1);
}

const fs = require("fs");

if (fs.existsSync("./dist/server/index.js")) {
	require("./dist/server/index.js");
} else {
	console.error(
		"Files in ./dist/server/ not found. Please run `bun run build` before trying to run `bun index.js`."
	);

	process.exit(1);
}
