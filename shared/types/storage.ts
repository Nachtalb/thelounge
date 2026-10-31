import {SharedMsg} from "./msg";

export type SearchQuery = {
	searchTerm: string;
	networkUuid: string;
	channelName: string;
	offset: number;
	limit?: number; // results per page, 100 by default
};

export type SearchResponse = SearchQuery & {
	results: SharedMsg[];
	times?: number[]; // all matches, newest first (first page only)
};
