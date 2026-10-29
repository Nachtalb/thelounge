import {expect} from "vitest";
import fs from "fs";
import path from "path";

describe("built-in themes", function () {
	const clientFolder = path.join(process.cwd(), "client");
	const themesFolder = path.join(clientFolder, "public", "themes");
	const style = fs.readFileSync(path.join(clientFolder, "css", "style.css"), "utf8");

	// Every variable listed in the :root block of style.css, including optional
	// ones that are only documented in comments there
	const rootBlock = /^:root \{\n([\s\S]*?)\n\}/m.exec(style)?.[1] || "";
	const themeVariables = new Set(rootBlock.match(/--[\w-]+(?=:)/g));

	const themes = fs
		.readdirSync(themesFolder)
		.filter((file) => file.endsWith(".css") && file !== "default.css");

	it("style.css defines the theme variables", function () {
		expect(themeVariables.size).to.be.above(100);
		expect(themes).to.include("morning.css");
	});

	for (const theme of themes) {
		it(`${theme} only overrides theme variables`, function () {
			const css = fs
				.readFileSync(path.join(themesFolder, theme), "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "");
			const match = /^@import "default\.css";\s*:root \{([^}]*)\}\s*$/.exec(css);
			expect(match, "must be the default.css import plus one :root block").to.not.be.null;

			const declarations = match![1]
				.split(";")
				.map((declaration) => declaration.trim())
				.filter(Boolean);

			for (const declaration of declarations) {
				const name = declaration.split(":")[0].trim();
				expect(themeVariables.has(name), `${name} is not a theme variable`).to.be.true;
			}
		});
	}
});
