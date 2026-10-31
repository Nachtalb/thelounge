import {expect} from "vitest";
import {parseSearchQuery} from "../../shared/searchQuery";

describe("parseSearchQuery", function () {
	it("searches text without a user filter", function () {
		expect(parseSearchQuery("  hello world ")).to.deep.equal({nick: "", text: "hello world"});
		expect(parseSearchQuery("hello @bob")).to.deep.equal({nick: "", text: "hello @bob"});
	});

	it("takes a leading @nick as user filter", function () {
		expect(parseSearchQuery("@Bob")).to.deep.equal({nick: "Bob", text: ""});
		expect(parseSearchQuery("@bob hello  world")).to.deep.equal({
			nick: "bob",
			text: "hello  world",
		});
	});

	it("strips a trailing : or , from the nick", function () {
		expect(parseSearchQuery("@bob:")).to.deep.equal({nick: "bob", text: ""});
		expect(parseSearchQuery("@bob, hi")).to.deep.equal({nick: "bob", text: "hi"});
	});

	it("searches literally for \\@, quotes and a lone @", function () {
		expect(parseSearchQuery("\\@bob hi")).to.deep.equal({nick: "", text: "@bob hi"});
		expect(parseSearchQuery('"@bob hi"')).to.deep.equal({nick: "", text: "@bob hi"});
		expect(parseSearchQuery("@")).to.deep.equal({nick: "", text: "@"});
		expect(parseSearchQuery("@ hi")).to.deep.equal({nick: "", text: "@ hi"});
	});
});
