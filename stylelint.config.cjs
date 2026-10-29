module.exports = {
	extends: "stylelint-config-standard",
	rules: {
		indentation: "tab",
		"font-family-no-missing-generic-family-keyword": null,
		"no-descending-specificity": null,
		"at-rule-no-vendor-prefix": true,
		"media-feature-name-no-vendor-prefix": true,
		"property-no-vendor-prefix": true,
		"selector-no-vendor-prefix": true,
		"value-no-vendor-prefix": true,
		"selector-class-pattern": null,
		"selector-id-pattern": null,
		// Customizable select, newer than this stylelint
		"selector-pseudo-element-no-unknown": [
			true,
			{ignorePseudoElements: ["picker", "picker-icon", "checkmark"]},
		],
		"selector-type-no-unknown": [
			true,
			{ignore: ["custom-elements"], ignoreTypes: ["selectedcontent"]},
		],
	},
};
