import _ from "lodash";
import Network from "../server/models/network";
import Chan from "../server/models/chan";
import {EventEmitter} from "events";
import {Message} from "../server/models/msg";
import {pki} from "node-forge";
import {vi} from "vitest";

type WebRoute = (
	req: Request,
	params: Record<string, string>
) => Response | null | Promise<Response | null>;

class MockClient extends EventEmitter {
	config: {
		browser: any;
	};

	constructor() {
		super();

		this.config = {
			browser: {},
		};
	}

	createMessage(opts: any) {
		const message = _.extend(
			{
				text: "dummy message",
				nick: "test-user",
				target: "#test-channel",
				previews: [],
			},
			opts
		) as Message;

		return message;
	}
}

let rsaKeyPair: unknown;

function sanitizeLog(callback: (log: string) => void) {
	return function (...args: string[]) {
		// Concats and removes ANSI colors. See https://stackoverflow.com/a/29497680
		const stdout = args
			.join(" ")
			.replace(
				/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
				""
			);

		callback(stdout + "\n");
	};
}

export default {
	createClient() {
		return new MockClient();
	},
	createNetwork() {
		return new Network({
			host: "example.com",
			channels: [
				new Chan({
					name: "#test-channel",
				}),
			],
		});
	},
	// Fake web server on a free 127.0.0.1 port; routes ("/a/:b") can be added at any time
	createWebserver(onRequest?: (req: Request) => void) {
		const routes = new Map<string, WebRoute>();
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(req) {
				onRequest?.(req);
				const parts = new URL(req.url).pathname.split("/");

				for (const [route, handler] of routes) {
					const want = route.split("/");
					const params: Record<string, string> = {};

					if (
						want.length === parts.length &&
						want.every((w, i) =>
							w.startsWith(":")
								? (params[w.slice(1)] = decodeURIComponent(parts[i]))
								: w === parts[i]
						)
					) {
						return (
							(await handler(req, params)) || new Response("Not found", {status: 404})
						);
					}
				}

				return new Response("Not found", {status: 404});
			},
		});

		return {
			url: (urlPath: string) => `http://127.0.0.1:${server.port}/${urlPath}`,
			get: (route: string, handler: WebRoute) => void routes.set(route, handler),
			stop: () => server.stop(true),
		};
	},
	send(body: BodyInit = "", type = "text/html; charset=utf-8") {
		return new Response(body, {headers: {"Content-Type": type}});
	},
	// Every client certificate gets a fresh 2048-bit RSA key, which takes up to a second on CI:
	// share one between the tests of a worker
	reuseClientCertificateKey() {
		const generate = pki.rsa.generateKeyPair;
		vi.spyOn(pki.rsa, "generateKeyPair").mockImplementation(() => {
			rsaKeyPair ??= generate(2048) as unknown;
			return rsaKeyPair;
		});
	},
	sanitizeLog,
	isRunningOnCI() {
		return process.env.CI || process.env.GITHUB_ACTIONS;
	},
};
