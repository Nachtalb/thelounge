"use strict";

const got = require("got");
const colors = require("chalk");
const log = require("../log");
const pkg = require("../../package.json");
const {execSync} = require("child_process");

const TIME_TO_LIVE = 15 * 60 * 1000; // 15 minutes, in milliseconds

module.exports = {
	isUpdateAvailable: false,
	fetch,
	checkForUpdates,
};

const infoString = execSync("git show --quiet --format='%H%n%an%n%ci%n%s%n%n%b'").toString().trim();
const info = infoString.split("\n");
const versions = {
	current: {
		sha: info[0],
		author: info[1],
		date: info[2],
		message: info.slice(3).join("\n"),
		branch: execSync("git rev-parse --abbrev-ref HEAD").toString().trim(),
	},
	defaultBranch: "blackjack-and-hookers", // get it dynamically in the future as it might change
};

async function fetch() {
	const time = Date.now();

	// Serving information from cache
	if (versions.expiresAt > time) {
		return versions;
	}

	try {
		const response = await got(
			"https://api.github.com/repos/Nachtalb/thelounge/commits?per_page=8",
			{
				headers: {
					Accept: "application/vnd.github.v3.html", // Request rendered markdown
					"User-Agent": pkg.name + "; +" + pkg.repository.url, // Identify the client
				},
			}
		);

		if (response.statusCode !== 200) {
			return versions;
		}

		updateVersions(response);

		// Add expiration date to the data to send to the client for later refresh
		versions.expiresAt = time + TIME_TO_LIVE;
	} catch (error) {
		log.error(`Failed to fetch changelog: ${error}`);
	}

	return versions;
}

function updateVersions(response) {
	let commit;
	let currentDate = new Date(versions.current.date);
	let dateSet = false;

	const body = JSON.parse(response.body);

	versions.commits = [];
	for (let i = 0; i < body.length; i++) {
		commit = body[i];

		versions.commits.push({
			sha: commit.sha,
			message: commit.commit.message,
			date: commit.commit.committer.date,
		});

		if (versions.current.sha === commit.sha) {
			dateSet = true;
		}
	}

	if (!dateSet) {
		for (let i = 0; i < versions.commits.length; i++) {
			if (currentDate > new Date(versions.commits[i].date)) {
				versions.commits.splice(i, 0, versions.current);
				dateSet = true;
				break;
			}
		}
		if (!dateSet) {
			versions.commits.push(versions.current);
		}
	}

	if (versions.commits[0].sha !== versions.current.sha) {
		module.exports.isUpdateAvailable = true;
		versions.latest = versions.commits[0];
	}
}

function checkForUpdates(manager) {
	fetch().then((versionData) => {
		if (!module.exports.isUpdateAvailable) {
			// Check for updates every 24 hours + random jitter of <3 hours
			setTimeout(
				() => checkForUpdates(manager),
				24 * 3600 * 1000 + Math.floor(Math.random() * 10000000)
			);
		}

		if (!versionData.latest) {
			return;
		}

		log.info(
			`The Lounge ${colors.green(
				versionData.latest.sha.slice(0, 8)
			)} is available. Read more on GitHub: https://github.com/Nachtalb/thelounge/commits/${
				versionData.latest.sha
			}`
		);

		// Notify all connected clients about the new version
		manager.clients.forEach((client) => client.emit("changelog:newversion"));
	});
}
