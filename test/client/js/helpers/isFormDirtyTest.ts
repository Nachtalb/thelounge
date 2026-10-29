import {expect} from "vitest";
import isFormDirty from "../../../../client/js/helpers/isFormDirty";

describe("isFormDirty", function () {
	const defaults = {
		name: "Libera.Chat",
		host: "irc.libera.chat",
		port: 6697,
		tls: true,
		password: "",
		nick: "thelounge",
		join: "#thelounge",
	};

	it("should be clean when nothing changed", function () {
		expect(isFormDirty(defaults, {...defaults})).to.be.false;
	});

	it("should be dirty when a text field changed", function () {
		expect(isFormDirty(defaults, {...defaults, nick: "Nachtalb"})).to.be.true;
	});

	it("should be dirty when a checkbox changed", function () {
		expect(isFormDirty(defaults, {...defaults, tls: false})).to.be.true;
	});

	it("should be dirty when a field missing from the defaults got a value", function () {
		expect(isFormDirty(defaults, {...defaults, saslAccount: "nick"})).to.be.true;
	});

	it("should be clean when a field missing from the defaults was typed into and cleared", function () {
		expect(isFormDirty(defaults, {...defaults, proxyPassword: ""})).to.be.false;
		expect(isFormDirty({...defaults, sasl: undefined}, {...defaults, sasl: null})).to.be.false;
	});

	it("should be clean when a field was changed back", function () {
		const current = {...defaults, nick: "Nachtalb"};
		current.nick = "thelounge";
		expect(isFormDirty(defaults, current)).to.be.false;
	});

	it("should compare numbers with the text of a number input", function () {
		expect(isFormDirty(defaults, {...defaults, port: "6697"})).to.be.false;
		expect(isFormDirty(defaults, {...defaults, port: "6667"})).to.be.true;
	});

	it("should compare list values by content", function () {
		expect(isFormDirty({commands: ["/msg a"]}, {commands: ["/msg a"]})).to.be.false;
		expect(isFormDirty({commands: ["/msg a"]}, {commands: ["/msg a", "/msg b"]})).to.be.true;
	});
});
