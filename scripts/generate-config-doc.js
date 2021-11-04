"use strict";

// Usage: `node generate-config-doc.js DOC_REPO_PATH`
//
// Example:
//
// ```sh
// node scripts/generate-config-doc.js ../thelounge.github.io/
// ```

const {readFileSync, writeFileSync} = require("fs");
const colors = require("chalk");
const log = require("../src/log");
const {join} = require("path");
const {spawnSync} = require("child_process");

function getGitUsername() {
	return spawnSync("git", ["config", "user.name"], {encoding: "utf8"}).stdout.trim();
}

const configContent = readFileSync(join(__dirname, "..", "defaults", "config.js"), "utf8");

const docPath = join(process.argv[2], "_includes", "config.js.md");

const extractedDoc = configContent
	.replace(/https:\/\/thelounge\.chat\/docs/g, "/docs") // make links relative
	.split("\n")
	.reduce((acc, line) => {
		line = line.trim();

		if (line.startsWith("// ")) {
			acc.push(line.substr(3));
		} else if (acc.length > 0 && acc[acc.length - 1] !== "") {
			// Treat whitespaces between comment blocks as separators in the generated
			// Markdown. Multiple blank lines are treated as one.
			acc.push("");
		}

		return acc;
	}, [])
	.join("\n");

const infoBlockHeader = `<!--
DO NOT EDIT THIS FILE MANUALLY.
Content for the following is generated by this script in the main repo:
https://github.com/Nachtalb/thelounge/blob/master/scripts/generate-config-doc.js`;

const infoBlockTop = `${infoBlockHeader}
Last updated at ${getPrettyDate()} (UTC) by ${getGitUsername()}
-->`;

const infoBlockBottom = `${infoBlockHeader}
-->`;

const generatedContent = `${infoBlockTop}\n\n${extractedDoc}\n${infoBlockBottom}\n`;

writeFileSync(docPath, generatedContent);

log.info(
	`${colors.bold(generatedContent.split("\n").length)} lines ` +
		`(${colors.bold(generatedContent.length)} characters) ` +
		`were written in ${colors.green(docPath)}.`
);

function getPrettyDate() {
	return new Date().toISOString().split(".")[0].replace("T", " ");
}
