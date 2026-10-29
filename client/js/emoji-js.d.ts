declare module "emoji-js" {
	// Only the parts of emoji-js used by helpers/emoji.ts
	export default class EmojiConvertor {
		// (base emoji)(optional skin tone), longest sequences first
		rx_unified: RegExp;
		map: {
			// emoji -> emoji-data code points
			unified: Record<string, string>;
			// emoji with skin tones -> [base code points, skin tone code points]
			unified_vars: Record<string, [string, string]>;
		};
		// base code points -> skin tone code points -> [full code points, ...]
		variations_data: Record<string, Record<string, [string, ...unknown[]]>>;
		init_unified(): void;
	}
}
