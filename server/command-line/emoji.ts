import log from "../log";
import colors from "../colors";
import {Command} from "commander";
import Utils from "./utils";
import {bundledEmojiSets, installedEmojiSets} from "../plugins/emoji";
import {emojiRecipes, installEmojiSet, removeEmojiSet} from "../plugins/emojiInstall";

const program = new Command("emoji").description(
	"install emoji image sets that are not shipped with The Lounge"
);

const recipes = Object.keys(emojiRecipes).join(", ");

program
	.command("list")
	.description("List the bundled and installed emoji image sets, and the installable ones")
	.on("--help", Utils.extraHelp)
	.action(function () {
		log.info("Bundled:");

		for (const set of bundledEmojiSets) {
			log.info(`  ${colors.green(set.id)}: ${set.name} (${set.license})`);
		}

		const installed = installedEmojiSets();
		log.info(installed.length ? "Installed:" : "Installed: none");

		for (const set of installed) {
			const version = set.version ? ` ${set.version}` : "";
			const images = set.manifest.images ?? "?";
			log.info(
				`  ${colors.green(set.id)}: ${set.name}${version} (${
					set.license
				}), ${images} images`
			);
		}

		log.info("Installable with `thelounge emoji install <set>`:");

		for (const [id, recipe] of Object.entries(emojiRecipes)) {
			log.info(`  ${colors.green(id)}: ${recipe.name} ${recipe.version} (${recipe.license})`);
		}
	});

program
	.command("install")
	.argument(
		"<set>",
		`emoji image set to install (${recipes}), or the URL or path of a zip, tarball or folder of PNGs named by code points`
	)
	.option("--id <id>", "id of a custom set (lowercase letters, digits and -)")
	.option("--name <name>", "name of a custom set in Settings")
	.option("--license <license>", "licence of a custom set, shown by `emoji list`")
	.option("--credit <text>", "attribution a custom set's licence requires, shown in Help")
	.option("--sha256 <hex>", "expected sha256 of a custom set's download")
	.description("Download an emoji image set into the emoji folder of The Lounge's home")
	.on("--help", Utils.extraHelp)
	.action(async function (source: string, options) {
		try {
			const result = await installEmojiSet(source, {
				id: options.id,
				name: options.name,
				license: options.license,
				credit: options.credit,
				sha256: options.sha256,
				log: (message) => log.info(message),
			});
			const caveat = result.caveat ? `; ${result.caveat}` : "";
			log.info(
				`Installed ${result.manifest.name} as ${colors.green(result.id)} (${
					result.manifest.images
				} images${caveat}).`
			);
		} catch (err: any) {
			log.error(err.message || String(err));
			process.exit(1);
		}
	});

program
	.command("remove")
	.alias("uninstall")
	.argument("<id>", "installed emoji image set to remove")
	.description("Remove an installed emoji image set")
	.on("--help", Utils.extraHelp)
	.action(function (id: string) {
		try {
			if (removeEmojiSet(id)) {
				log.info(`Removed the ${id} emoji images.`);
			} else {
				log.info(`The ${id} emoji images are not installed.`);
			}
		} catch (err: any) {
			log.error(err.message || String(err));
			process.exit(1);
		}
	});

export default program;
