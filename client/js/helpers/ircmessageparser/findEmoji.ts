import {Part} from "./merge";
import {findEmojiMatches} from "../emoji";

export type EmojiPart = Part & {
	emoji: string;
	// emoji-data code points, the image file name
	image: string;
};

function findEmoji(text: string): EmojiPart[] {
	return findEmojiMatches(text);
}

export default findEmoji;
