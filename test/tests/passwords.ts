import {expect} from "vitest";
import Helper from "../../server/helper";

describe("Client passwords", function () {
	const inputPassword = "my$Super@Cool Password";

	it("hashed password should match", function () {
		// Generated with third party tool (python bcrypt) to test implementation, at a low cost to
		// keep it fast: the freshly hashed password below runs at the real cost
		const comparedPassword = Helper.password.compare(
			inputPassword,
			"$2a$04$heIrhbM19lUvmdzn1HNEgOoIHVWDCJB0KnWmFPxuGvl869LB3R3Ha"
		);

		return comparedPassword.then((result) => {
			expect(result).to.be.true;
		});
	});

	it("wrong hashed password should not match", function () {
		// Compare against a fake hash
		const comparedPassword = Helper.password.compare(
			inputPassword,
			"$2a$04$heIrhbM19lUWRONGPASSWORDHVWDCJB0KnWmFPxuGvl869LB3R3Ha"
		);

		return comparedPassword.then((result) => {
			expect(result).to.be.false;
		});
	});

	it("freshly hashed password should match", function () {
		const hashedPassword = Helper.password.hash(inputPassword);
		expect(Helper.password.requiresUpdate(hashedPassword)).to.be.false;
		const comparedPassword = Helper.password.compare(inputPassword, hashedPassword);

		return comparedPassword.then((result) => {
			expect(result).to.be.true;
		});
	});

	it("shout passwords should be marked as old", function () {
		expect(
			Helper.password.requiresUpdate(
				"$2a$08$K4l.hteJcCP9D1G5PANzYuBGvdqhUSUDOLQLU.xeRxTbvtp01KINm"
			)
		).to.be.true;
		expect(
			Helper.password.requiresUpdate(
				"$2a$11$zrPPcfZ091WNfs6QrRHtQeUitlgrJcecfZhxOFiQs0FWw7TN3Q1oS"
			)
		).to.be.false;
	});
});
