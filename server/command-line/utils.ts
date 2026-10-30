import _ from "lodash";
import log from "../log";
import colors from "../colors";
import fs from "fs";
import Helper from "../helper";
import Config from "../config";
import path from "path";
import {spawn} from "child_process";
import fromRoot from "../rootpath";
let home: string;

class Utils {
	static extraHelp(this: void) {
		[
			"",
			"Environment variable:",
			`  THELOUNGE_HOME            Path for all configuration files and folders. Defaults to ${colors.green(
				Helper.expandHome(Utils.defaultHome())
			)}`,
			"",
		].forEach((e) => log.raw(e));
	}

	static defaultHome() {
		if (home) {
			return home;
		}

		const distConfig = Utils.getFileFromRelativeToRoot(".thelounge_home");

		home = fs.readFileSync(distConfig, "utf-8").trim();

		return home;
	}

	static getFileFromRelativeToRoot(...fileName: string[]) {
		return fromRoot(...fileName);
	}

	// Parses CLI options such as `-c public=true`, `-c debug.raw=true`, etc.
	static parseConfigOptions(this: void, val: string, memo?: any) {
		// Invalid option that is not of format `key=value`, do nothing
		if (!val.includes("=")) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return memo;
		}

		const parseValue = (value: string) => {
			switch (value) {
				case "true":
					return true;
				case "false":
					return false;
				case "undefined":
					return undefined;
				case "null":
					return null;
				default:
					if (/^-?[0-9]+$/.test(value)) {
						// Numbers like port
						return parseInt(value, 10);
					} else if (/^\[.*\]$/.test(value)) {
						// Arrays
						// Supporting arrays `[a,b]` and `[a, b]`
						const array = value.slice(1, -1).split(/,\s*/);

						// If [] is given, it will be parsed as `[ "" ]`, so treat this as empty
						if (array.length === 1 && array[0] === "") {
							return [];
						}

						return array.map(parseValue) as Array<Record<string, string>>; // Re-parses all values of the array
					}

					return value;
			}
		};

		// First time the option is parsed, memo is not set
		if (memo === undefined) {
			memo = {};
		}

		// Note: If passed `-c foo="bar=42"` (with single or double quotes), `val`
		//       will always be passed as `foo=bar=42`, never with quotes.
		const position = val.indexOf("="); // Only split on the first = found
		const key = val.slice(0, position);
		const value = val.slice(position + 1);
		const parsedValue = parseValue(value);

		if (_.has(memo, key)) {
			log.warn(`Configuration key ${colors.bold(key)} was already specified, ignoring...`);
		} else {
			memo = _.set(memo, key, parsedValue);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return memo;
	}

	static executeBunCommand(command: string, ...parameters: string[]): Promise<string> {
		const packagesPath = Config.getPackagesPath();
		const cachePath = path.join(packagesPath, "package_manager_cache");

		const staticParameters = [
			"--cache-dir",
			cachePath,
			"--cwd",
			packagesPath,
			"--ignore-scripts",
			"--no-progress",
		];

		const env = {
			// We only ever operate in production mode
			NODE_ENV: "production",

			// If The Lounge runs from a user that does not have a home directory,
			// bun may fail when it tries to read certain folders,
			// we give it an existing folder so the reads do not throw a permission error.
			HOME: cachePath,
		};

		return new Promise((resolve, reject) => {
			let stdout = "";
			let stderr = "";
			// The Lounge runs on bun, so execPath is the bun binary
			const child = spawn(process.execPath, [command, ...staticParameters, ...parameters], {
				env: env,
			});

			child.stdout.on("data", (data) => (stdout += String(data)));
			child.stderr.on("data", (data) => (stderr += String(data)));

			child.on("error", (e) => {
				log.error(`${e.message}:`, e.stack || "");
				process.exit(1);
			});

			child.on("close", (code) => {
				if (code !== 0) {
					log.error(stderr.trim());
					return reject(code);
				}

				log.debug(stdout.trim());
				resolve(stdout);
			});
		});
	}
}

export default Utils;
