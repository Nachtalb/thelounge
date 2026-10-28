import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {AddressInfo} from "net";
import {expect} from "vitest";
import Config from "../../server/config";
import Uploader from "../../server/plugins/uploader";

describe("Uploader rustypaste forwarding", function () {
	let server: http.Server;
	let received: {auth?: string; body: string};
	let status = 200;

	beforeEach(function () {
		return new Promise<void>((resolve) => {
			server = http.createServer((req, res) => {
				let body = "";
				req.on("data", (c) => (body += c));
				req.on("end", () => {
					received = {auth: req.headers.authorization, body};
					res.writeHead(status);
					res.end(status === 200 ? "https://f.example/abc.png\n" : "unauthorized\n");
				});
			});
			server.listen(0, "127.0.0.1", () => {
				const {port} = server.address() as AddressInfo;
				Config.values.fileUpload.rustypaste = {
					url: `http://127.0.0.1:${port}`,
					token: "s3cret",
				};
				resolve();
			});
		});
	});

	afterEach(function () {
		Config.values.fileUpload.rustypaste = null;
		status = 200;
		server.close();
	});

	it("posts the file with the token and returns the url", async function () {
		const file = path.join(os.tmpdir(), "rp-upload-test");
		fs.writeFileSync(file, "hello rustypaste");

		const url = await Uploader.forwardToRustypaste(file, "pic.png");

		expect(url).to.equal("https://f.example/abc.png");
		expect(received.auth).to.equal("s3cret");
		expect(received.body).to.contain('name="file"; filename="pic.png"');
		expect(received.body).to.contain("hello rustypaste");
		fs.unlinkSync(file);
	});

	it("throws when rustypaste rejects the upload", async function () {
		status = 401;
		const file = path.join(os.tmpdir(), "rp-upload-test-2");
		fs.writeFileSync(file, "x");

		await expect(Uploader.forwardToRustypaste(file, "x.txt")).rejects.toThrow(
			"Rustypaste responded with 401: unauthorized"
		);
		fs.unlinkSync(file);
	});
});
