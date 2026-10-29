import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import tls from "tls";
import {Duplex} from "stream";
import {SocksClient} from "socks";

// Outbound proxy for link preview fetches (`prefetchProxy`), so that the sites
// posted in chat do not see the IP of the server running The Lounge.

export type ProxyAgents = {http: http.Agent; https: https.Agent};

type Target = {host: string; port: number; localAddress?: string};

const defaultPorts: Record<string, number> = {
	"http:": 80,
	"https:": 443,
	"socks5:": 1080,
	"socks5h:": 1080,
};

export function parseProxyUrl(value: string) {
	const proxy = new URL(value);

	if (!(proxy.protocol in defaultPorts)) {
		throw new Error(
			`Unsupported protocol "${proxy.protocol}", use http://, https://, socks5:// or socks5h://`
		);
	}

	if (!proxy.hostname) {
		throw new Error("Missing proxy host");
	}

	return proxy;
}

function proxyHost(proxy: URL) {
	return proxy.hostname.replace(/^\[(.*)\]$/, "$1");
}

function proxyPort(proxy: URL) {
	return Number(proxy.port) || defaultPorts[proxy.protocol];
}

function proxyAuthorization(proxy: URL) {
	if (!proxy.username && !proxy.password) {
		return undefined;
	}

	const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(
		proxy.password
	)}`;
	return "Basic " + Buffer.from(credentials).toString("base64");
}

async function socksTunnel(proxy: URL, target: Target, timeout: number) {
	let host = target.host;

	// socks5:// resolves the target locally (leaks the DNS lookup),
	// socks5h:// lets the proxy resolve it
	if (proxy.protocol === "socks5:") {
		host = (await dns.promises.lookup(host)).address;
	}

	const {socket} = await SocksClient.createConnection({
		proxy: {
			host: proxyHost(proxy),
			port: proxyPort(proxy),
			type: 5,
			userId: decodeURIComponent(proxy.username) || undefined,
			password: decodeURIComponent(proxy.password) || undefined,
		},
		command: "connect",
		destination: {host, port: target.port},
		timeout,
		socket_options: target.localAddress
			? ({localAddress: target.localAddress} as net.SocketConnectOpts)
			: undefined,
	});

	return socket;
}

function connectTunnel(proxy: URL, target: Target, timeout: number) {
	return new Promise<Duplex>((resolve, reject) => {
		const authority = `${net.isIPv6(target.host) ? `[${target.host}]` : target.host}:${
			target.port
		}`;
		const auth = proxyAuthorization(proxy);
		const req = (proxy.protocol === "https:" ? https : http).request({
			host: proxyHost(proxy),
			port: proxyPort(proxy),
			method: "CONNECT",
			path: authority,
			headers: {Host: authority, ...(auth && {"Proxy-Authorization": auth})},
			localAddress: target.localAddress,
			agent: false,
		});
		const timer = setTimeout(
			() => req.destroy(new Error("Proxy connection timed out")),
			timeout
		);

		req.once("connect", (res, socket, head) => {
			clearTimeout(timer);

			if (res.statusCode !== 200) {
				socket.destroy();
				return reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
			}

			if (head.length) {
				socket.unshift(head);
			}

			resolve(socket);
		});
		req.once("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		req.end();
	});
}

type Callback = (err: Error | null, socket?: Duplex) => void;

class TunnelAgent extends http.Agent {
	constructor(private tunnel: (target: Target) => Promise<Duplex>) {
		super();
	}

	createConnection(options: http.ClientRequestArgs, callback: Callback) {
		this.tunnel({
			host: options.host || "localhost",
			port: Number(options.port),
			localAddress: options.localAddress,
		}).then(
			(socket) => callback(null, socket),
			(err: Error) => callback(err)
		);
		return undefined;
	}
}

class TunnelHttpsAgent extends https.Agent {
	constructor(private tunnel: (target: Target) => Promise<Duplex>) {
		super();
	}

	createConnection(options: http.ClientRequestArgs, callback: Callback) {
		this.tunnel({
			host: options.host || "localhost",
			port: Number(options.port),
			localAddress: options.localAddress,
		}).then(
			(socket) =>
				callback(null, tls.connect({...(options as tls.ConnectionOptions), socket})),
			(err: Error) => callback(err)
		);
		return undefined;
	}
}

// Sends plain http requests to an HTTP(S) proxy with an absolute request URI
class ForwardAgent extends http.Agent {
	constructor(private proxy: URL) {
		super();
	}

	addRequest(req: http.ClientRequest, options: http.ClientRequestArgs) {
		const auth = proxyAuthorization(this.proxy);
		req.path = `http://${String(req.getHeader("host"))}${req.path}`;

		if (auth) {
			req.setHeader("Proxy-Authorization", auth);
		}

		// addRequest is not part of the public typings
		(http.Agent.prototype as any).addRequest.call(this, req, options);
	}

	createConnection(options: http.ClientRequestArgs) {
		const connectOptions = {
			host: proxyHost(this.proxy),
			port: proxyPort(this.proxy),
			localAddress: options.localAddress,
		};

		return this.proxy.protocol === "https:"
			? tls.connect({
					...connectOptions,
					servername: net.isIP(connectOptions.host) ? undefined : connectOptions.host,
			  })
			: net.connect(connectOptions);
	}
}

export function createProxyAgents(value: string, timeout: number): ProxyAgents {
	const proxy = parseProxyUrl(value);
	const isSocks = proxy.protocol.startsWith("socks5");
	const tunnel = (target: Target) =>
		isSocks ? socksTunnel(proxy, target, timeout) : connectTunnel(proxy, target, timeout);

	return {
		// Plain http goes through the HTTP proxy as a forward request, many
		// proxies (e.g. squid) refuse CONNECT to anything but port 443
		http: isSocks ? new TunnelAgent(tunnel) : new ForwardAgent(proxy),
		https: new TunnelHttpsAgent(tunnel),
	};
}
