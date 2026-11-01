"use strict";

module.exports = {
	// ## Server settings

	// ### `public`
	//
	// When set to `true`, The Lounge starts in public mode. When set to `false`,
	// it starts in private mode.
	//
	// - A **public server** does not require authentication. Anyone can connect
	//   to IRC networks in this mode. All IRC connections and channel
	//   scrollbacks are lost when a user leaves the client.
	// - A **private server** requires users to log in. Their IRC connections are
	//   kept even when they are not using or logged in to the client. All joined
	//   channels and scrollbacks are available when they come back.
	//
	// This value is set to `false` by default.
	public: false,

	// ### `host`
	//
	// IP address or hostname for the web server to listen to. For example, set it
	// to `"127.0.0.1"` to accept connections from localhost only.
	//
	// For UNIX domain sockets, use `"unix:/absolute/path/to/file.sock"`.
	//
	// This value is set to `undefined` by default to listen on all interfaces.
	host: undefined,

	// ### `port`
	//
	// Set the port to listen to.
	//
	// This value is set to `9000` by default.
	port: 9000,

	// ### `bind`
	//
	// Set the local IP to bind to for outgoing connections.
	//
	// This value is set to `undefined` by default to let the operating system
	// pick its preferred one.
	bind: undefined,

	// ### `reverseProxy`
	//
	// When set to `true`, The Lounge is marked as served behind a reverse proxy
	// and will honor the `X-Forwarded-For` header.
	//
	// This value is set to `false` by default.
	reverseProxy: false,

	// ### `maxHistory`
	//
	// Defines the maximum number of history lines that will be kept in memory per
	// channel/query, in order to reduce the memory usage of the server. Setting
	// this to `-1` will keep unlimited amount.
	//
	// This value is set to `10000` by default.
	maxHistory: 10000,

	// ### `https`
	//
	// These settings are used to run The Lounge's web server using encrypted TLS.
	//
	// If you want more control over the webserver,
	// [use a reverse proxy instead](https://thelounge.chat/docs/guides/reverse-proxies).
	//
	// The available keys for the `https` object are:
	//
	// - `enable`: when set to `false`, HTTPS support is disabled
	//    and all other values are ignored.
	// - `key`: Path to the private key file.
	// - `certificate`: Path to the certificate.
	// - `ca`: Path to the CA bundle.
	//
	// The value of `enable` is set to `false` to disable HTTPS by default, in
	// which case the other two string settings are ignored.
	https: {
		enable: false,
		key: "",
		certificate: "",
		ca: "",
	},

	// ## Client settings

	// ### `theme`
	//
	// Set the default theme to serve to new users. They will be able to select a
	// different one in their client settings among those available.
	//
	// The Lounge ships with two themes (`default` and `morning`) and can be
	// extended by installing more themes. Read more about how to manage them
	// [here](https://thelounge.chat/docs/guides/theme-creation).
	//
	// This value needs to be the package name and not the display name. For
	// example, the value for Morning would be `morning`, and the value for
	// Solarized would be `thelounge-theme-solarized`.
	//
	// This value is set to `"default"` by default.
	theme: "default",

	// ### `emojiDefaultStyle`
	//
	// Emoji style for users who did not pick one in Settings > Appearance:
	// `"google"` (Noto Emoji), `"twitter"` (Twemoji), `"native"` (the system
	// emoji font) or the id of an emoji set you installed.
	//
	// The Google and Twitter images are shipped with The Lounge. Other sets are
	// installed by you, at your own discretion, into the
	// `${THELOUNGE_HOME}/emoji/<id>` folder, from where The Lounge serves them
	// and lists them in the Emoji style setting:
	//
	// - `thelounge emoji install <set>` downloads `apple`, `facebook`,
	//   `openmoji`, `fluent-3d`, `fluent-color`, `fluent-flat` or
	//   `fluent-high-contrast` (Apple's and Facebook's images are not freely
	//   licensed, which is why they are not distributed with The Lounge).
	// - `thelounge emoji install <url or path> --id <id> --name <name>`
	//   installs a zip, tarball or folder of PNGs named by their code points
	//   (`1f600.png`, `1F44D-1F3FB.png`, `emoji_u1f600.png`, ...).
	// - `thelounge emoji list` shows them, `thelounge emoji remove <id>`
	//   removes one.
	//
	// Emoji an installed set has no image for are shown from the bundled set
	// named here, or Google if this is not a bundled set. Users who had a
	// style selected that is not available get this default.
	//
	// If this style is not available, `"google"` is used.
	//
	// This value is set to `"google"` by default.
	emojiDefaultStyle: "google",

	// ### `prefetch`
	//
	// When set to `true`, The Lounge will load thumbnails and site descriptions
	// from URLs posted in channels and private messages.
	//
	// This value is set to `false` by default.
	prefetch: false,

	// ### `disableMediaPreview`
	//
	// When set to `true`, The Lounge will not preview media (images, video and
	// audio) hosted on third-party sites. This ensures the client does not
	// make any requests to external sites. If `prefetchStorage` is enabled,
	// images proxied via the The Lounge will be previewed.
	//
	// This has no effect if `prefetch` is set to `false`.
	//
	// This value is set to `false` by default.
	disableMediaPreview: false,

	// ### `prefetchStorage`

	// When set to `true`, The Lounge will store and proxy prefetched images and
	// thumbnails on the filesystem rather than directly display the content at
	// the original URLs.
	//
	// This option primarily exists to resolve mixed content warnings by not
	// loading images from http hosts. This option does not work for video
	// or audio as The Lounge will only load these from https hosts.
	//
	// If storage is enabled, The Lounge will fetch and store images and thumbnails
	// in the `${THELOUNGE_HOME}/storage` folder.
	//
	// Images are deleted when they are no longer referenced by any message
	// (controlled by `maxHistory`), and the folder is cleaned up when The Lounge
	// restarts.
	//
	// This value is set to `false` by default.
	prefetchStorage: false,

	// ### `prefetchCache`
	//
	// When set to `true`, The Lounge caches link previews and their images by
	// URL in the `${THELOUNGE_HOME}/cache/previews` folder, so a link posted in
	// many messages is only fetched once, and the cache survives restarts.
	// Images and thumbnails are served by The Lounge from the cache (or fetched
	// from the source and cached on first request), like `prefetchStorage`,
	// which this option supersedes.
	//
	// Messages loaded from history (on page load, when scrolling up and from
	// the message storage after a restart) that have no previews get them from
	// the cache, or fetched in the background if they are not cached yet.
	//
	// Failed fetches are not cached and are retried the next time the message
	// is loaded after a restart. Cache file names are salted hashes of the URL,
	// the salt is kept in the cache folder. The folder can be deleted at any
	// time to clear the cache.
	//
	// This has no effect if `prefetch` is set to `false`.
	//
	// This value is set to `false` by default.
	prefetchCache: false,

	// ### `prefetchCacheMaxAge`
	//
	// When `prefetchCache` is enabled, cached previews and images older than
	// this many days are deleted on startup and once a day. Set to `0` to keep
	// them forever.
	//
	// This value is set to `30` days by default.
	prefetchCacheMaxAge: 30,

	// ### `prefetchMaxImageSize`
	//
	// When `prefetch` is enabled, images will only be displayed if their file
	// size does not exceed this limit.
	//
	// This value is set to `2048` kilobytes by default.
	prefetchMaxImageSize: 2048,

	// ### prefetchMaxSearchSize
	//
	// This value sets the maximum response size allowed when finding the Open
	// Graph tags for link previews. The entire response is temporarily stored
	// in memory and for some sites like YouTube this can easily exceed 300
	// kilobytes.
	//
	// This value is set to `50` kilobytes by default.
	prefetchMaxSearchSize: 50,

	// ### `prefetchTimeout`
	//
	// When `prefetch` is enabled, this value sets the number of milliseconds
	// before The Lounge gives up attempting to fetch a link. This can be useful
	// if you've increased the `prefetchMaxImageSize`.
	//
	// Take caution, however, that an inordinately large value may lead to
	// performance issues or even a denial of service, since The Lounge will not
	// be able to clean up outgoing connections as quickly. Usually the default
	// value is appropriate, so only change it if necessary.
	//
	// This value is set to `5000` milliseconds by default.
	prefetchTimeout: 5000,

	// ### `prefetchProxy`
	//
	// When `prefetch` is enabled, all link preview requests (pages, images,
	// media and thumbnails, including the ones saved by `prefetchStorage`, the
	// images `prefetchCache` fetches again on demand and the previews it fills
	// in for history) are sent through this proxy, so the linked sites do not
	// see the IP address of the server. IRC connections, file uploads and
	// everything else still connect directly.
	//
	// Supported formats:
	//
	// - `http://user:password@host:port` or `https://…` (HTTP proxy)
	// - `socks5h://user:password@host:port` (SOCKS5, the proxy resolves hostnames)
	// - `socks5://user:password@host:port` (SOCKS5, hostnames are resolved by
	//   The Lounge, so your DNS server sees every previewed domain)
	//
	// For privacy prefer `socks5h://` over `socks5://`. Note that the proxy can
	// reach whatever is reachable from its own network, so link previews may
	// still be used to probe hosts on the proxy's network.
	//
	// If the value is not a valid proxy URL, an error is logged and link
	// previews are disabled instead of connecting directly.
	//
	// This value is set to `""` (no proxy) by default.
	prefetchProxy: "",

	// ### `prefetchBlockPrivate`
	//
	// When set to `true`, The Lounge never fetches link previews from hosts
	// that are, or resolve to, a non-public address, so people in a channel
	// can't make the server send requests into its own network: loopback
	// (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`,
	// `192.168.0.0/16`, `fc00::/7`), carrier-grade NAT (`100.64.0.0/10`),
	// link-local (`169.254.0.0/16`, `fe80::/10`), `0.0.0.0/8`, `::`,
	// multicast, broadcast and other reserved and documentation ranges, the
	// same addresses inside IPv4-mapped, NAT64 and 6to4 IPv6 addresses, and
	// the host names `localhost` and `*.localhost`.
	//
	// Every redirect is checked again, and the address a host name resolves
	// to is checked when connecting to it, so a DNS answer that changes
	// between check and connection (DNS rebinding) is blocked too.
	//
	// With a `socks5://` `prefetchProxy` host names are resolved locally and
	// checked the same way. With `socks5h://` and HTTP proxies the proxy
	// resolves host names (The Lounge does not look them up, to keep DNS
	// private), so only IP addresses and `localhost` names in links are
	// blocked; what other host names reach is up to the proxy's network.
	//
	// Links matching a `@@` exception rule in `prefetchBlocklist` (e.g.
	// `"@@||nas.lan^"`) are exempt, to allow specific internal hosts.
	//
	// Blocked links get no preview, are not cached and log only a debug line.
	//
	// This value is set to `true` by default.
	prefetchBlockPrivate: true,

	// ### `prefetchBlocklist`
	//
	// Adblock-style filter rules for link previews: links matching a rule get
	// no preview (they are not fetched, not cached, and only a debug line is
	// logged). Rules are matched against the full, normalised URL of the link
	// and of every redirect.
	//
	// Each entry is one of:
	//
	// - an `http://` or `https://` URL of a filter list (e.g. EasyList style
	//   lists). Lists are downloaded at startup and every 24 hours through
	//   `prefetchProxy` (if set) and cached in `${THELOUNGE_HOME}/cache/blocklists`;
	//   if a download fails, a warning is logged and the last copy is kept.
	// - a path to a local filter list file: absolute, or starting with `./`,
	//   `../` (relative to `${THELOUNGE_HOME}`) or `~/`. Re-read every 24 hours.
	// - otherwise a single inline rule.
	//
	// Supported rule syntax (subset of Adblock Plus / uBlock Origin network
	// filters):
	//
	// - `||example.com^`: the domain and all its subdomains
	// - `|https://example.com/path`: URLs starting with this (`|` at the end
	//   anchors the end)
	// - `example.com/ads*banner^`: substring, `*` is a wildcard, `^` a
	//   separator (anything but a letter, digit, `_`, `-`, `.` or `%`, or the end)
	// - `/regex/`: a regular expression (case-insensitive)
	// - `@@` before any rule: exception, overrides blocking rules and
	//   `prefetchBlockPrivate`
	// - `!` comments and `[Adblock Plus 2.0]` headers are ignored, so are
	//   cosmetic rules (`##`, `#@#`, ...)
	// - rules with `$` options (`$image`, `$domain=...`) are skipped, since
	//   previews have no request type or originating page
	//
	// Inline substring rules that start with `/` are read as file paths:
	// write them as `*/ads/` instead. To keep blocking IP address links when
	// you set your own list, keep the two default rules in it.
	//
	// The default rules block links whose host is a raw IP address (IPv4 or
	// IPv6, public or not, e.g. `http://203.0.113.7/` or `http://[2001:db8::1]/`),
	// so previews are only fetched for host names. Other spellings of an IPv4
	// address (`http://2130706433/`, `http://0x7f.1/`) are normalised to the
	// dotted form first and blocked too.
	prefetchBlocklist: [
		"/^[a-z][a-z0-9+.-]*:\\/\\/(\\d{1,3}\\.){3}\\d{1,3}(:\\d+)?([\\/?#]|$)/",
		"/^[a-z][a-z0-9+.-]*:\\/\\/\\[[0-9a-f:.]+\\](:\\d+)?([\\/?#]|$)/",
	],

	// ### `fileUpload`
	//
	// Allow uploading files to the server hosting The Lounge.
	//
	// Files are stored in the `${THELOUNGE_HOME}/uploads` folder, do not expire,
	// and are not removed by The Lounge. This may cause issues depending on your
	// hardware, for example in terms of disk usage.
	//
	// The available keys for the `fileUpload` object are:
	//
	// - `enable`: When set to `true`, files can be uploaded on the client with a
	//   drag-and-drop or using the upload dialog.
	// - `maxFileSize`: When file upload is enabled, users sending files above
	//   this limit will be prompted with an error message in their browser. A value of
	//   `-1` disables the file size limit and allows files of any size. **Use at
	//   your own risk.** This value is set to `10240` kilobytes by default.
	// - `baseUrl`: If you want to change the URL where uploaded files are accessed,
	//   you can set this option to `"https://example.com/folder/"` and the final URL
	//   would look like `"https://example.com/folder/aabbccddeeff1234/name.png"`.
	//   If you use this option, you must have a reverse proxy configured,
	//   to correctly proxy the uploads URLs back to The Lounge.
	//   This value is set to `null` by default.
	// - `rustypaste`: Forward every upload to a [rustypaste](https://github.com/orhun/rustypaste)
	//   server and link the URL it returns instead of serving the file from The Lounge.
	//   Set it to `{url: "https://paste.example.com", token: "auth token"}`; `token`
	//   is sent as the `Authorization` header and can be left out if the server has no
	//   auth. The local copy is deleted once the forward finishes.
	//   This value is set to `null` by default.
	fileUpload: {
		enable: false,
		maxFileSize: 10240,
		baseUrl: null,
		rustypaste: null,
	},

	// ### `stickers`
	//
	// Telegram sticker packs in the message input, served by a
	// [tg-sticker-proxy](https://github.com/Nachtalb/tg-sticker-proxy) worker.
	//
	// - `proxyUrl`: Base URL of the worker, for example `"https://s.naa.gg"`.
	//   Users add packs by their t.me/addstickers link, a sent sticker is the
	//   link to its share page (other clients get an image preview), and
	//   messages that are only such a link are shown as the sticker. Packs and
	//   stickers load in the browser straight from this URL. An empty string
	//   turns stickers off.
	//
	// This value is set to `{proxyUrl: ""}` by default.
	stickers: {
		proxyUrl: "",
	},

	// ### `nookle`
	//
	// A picker in the message input for a
	// [Nookle](https://github.com/Nachtalb/nookle) meme collection. Users set
	// their Nookle URL and a read-only API key in Settings > General; picking
	// a meme sends its link. Search and thumbnails load in the browser straight
	// from the user's Nookle, so enabling this lets the page connect to and
	// load images from any `https:` origin.
	//
	// This value is set to `{enable: false}` by default.
	nookle: {
		enable: false,
	},

	// ### `transports`
	//
	// Set `socket.io` transports.
	//
	// This value is set to `["polling", "websocket"]` by default.
	transports: ["polling", "websocket"],

	// ### `leaveMessage`
	//
	// Set users' default `quit` and `part` messages if they are not providing
	// one.
	//
	// This value is set to `"The Lounge, maintained out of spite - https://github.com/Nachtalb/thelounge"` by
	// default.
	leaveMessage: "The Lounge, maintained out of spite - https://github.com/Nachtalb/thelounge",

	// ## Default network

	// ### `defaults`
	//
	// Specifies default network information that will be used as placeholder
	// values in the *Connect* window.
	//
	// The available keys for the `defaults` object are:
	//
	// - `name`: Name to display in the channel list of The Lounge. This value is
	//   not forwarded to the IRC network.
	// - `host`: IP address or hostname of the IRC server.
	// - `port`: Usually 6667 for unencrypted connections and 6697 for
	//   connections encrypted with TLS.
	// - `password`: Connection password. If the server supports SASL capability,
	//   then this password will be used in SASL authentication.
	// - `tls`: Enable TLS connections
	// - `rejectUnauthorized`: Whether the server certificate should be verified
	//   against the list of supplied Certificate Authorities (CAs) by your
	//   Node.js installation.
	// - `nick`: Nick name. Percent signs (`%`) will be replaced by random
	//   numbers from 0 to 9. For example, `Guest%%%` may become `Guest123`.
	// - `username`: User name.
	// - `realname`: Real name displayed by some clients. Defaults to the nick if set to ""
	// - `leaveMessage`: Network specific leave message (overrides global leaveMessage)
	// - `join`: Comma-separated list of channels to auto-join once connected.
	//
	// This value is set to connect to the official channel of The Lounge on
	// Libera.Chat by default:
	//
	// ```js
	// defaults: {
	//   name: "Libera.Chat",
	//   host: "irc.libera.chat",
	//   port: 6697,
	//   password: "",
	//   tls: true,
	//   rejectUnauthorized: true,
	//   nick: "thelounge%%",
	//   username: "thelounge",
	//   realname: "The Lounge User",
	//   join: "#thelounge"
	// }
	// ```
	defaults: {
		name: "Libera.Chat",
		host: "irc.libera.chat",
		port: 6697,
		password: "",
		tls: true,
		rejectUnauthorized: true,
		nick: "thelounge%%",
		username: "thelounge",
		realname: "",
		join: "#thelounge",
		leaveMessage: "",
	},

	// ### `lockNetwork`
	//
	// When set to `true`, users will not be able to modify host, port and TLS
	// settings and will be limited to the configured network.
	// These fields will also be hidden from the UI.
	//
	// This value is set to `false` by default.
	lockNetwork: false,

	// ## User management

	// ### `messageStorage`

	// The Lounge can log user messages, for example to access them later or to
	// reload messages on server restart.

	// Set this array with one or multiple values to enable logging:
	// - `text`: Messages per network and channel will be stored as text files.
	//   **Messages will not be reloaded on restart.**
	// - `sqlite`: Messages are stored in SQLite database files, one per user.
	//
	// Logging can be disabled globally by setting this value to an empty array
	// `[]`. Logging is also controlled per user individually in the `log` key of
	// their JSON configuration file.
	//
	// This value is set to `["sqlite", "text"]` by default.
	messageStorage: ["sqlite", "text"],

	// ### `storagePolicy`

	// When the sqlite storage is in use, control the maximum storage duration.
	// A background task will periodically clean up messages older than the limit.

	// The available keys for the `storagePolicy` object are:
	//
	// - `enabled`: If this is false, the cleaning task is not running.
	// - `maxAgeDays`: Maximum age of an entry in days.
	// - `deletionPolicy`: Controls what types of messages are being deleted.
	//   Valid options are:
	//   - `statusOnly`: Only delete message types which are status related (e.g. away, back, join, parts, mode, ctcp...)
	//     but keep actual messages from nicks. This keeps the DB size down while retaining "precious" messages.
	//   - `everything`: Delete everything, including messages from irc nicks
	storagePolicy: {
		enabled: false,
		maxAgeDays: 7,
		deletionPolicy: "statusOnly",
	},

	// ### `useHexIp`
	//
	// When set to `true`, users' IP addresses will be encoded as hex.
	//
	// This is done to share the real user IP address with the server for host
	// masking purposes. This is encoded in the `username` field and only supports
	// IPv4.
	//
	// This value is set to `false` by default.
	useHexIp: false,

	// ## WEBIRC support
	//
	// When enabled, The Lounge will pass the connecting user's host and IP to the
	// IRC server. Note that this requires to obtain a password from the IRC
	// network that The Lounge will be connecting to and generally involves a lot
	// of trust from the network you are connecting to.
	//
	// There are 2 ways to configure the `webirc` setting:
	//
	// - **Basic**: an object where keys are IRC hosts and values are passwords.
	//   For example:
	//
	//   ```json
	//   webirc: {
	//     "irc.example.net": "thisiswebircpassword1",
	//     "irc.example.org": "thisiswebircpassword2",
	//   },
	//   ```
	//
	// - **Advanced**: an object where keys are IRC hosts and values are functions
	//   that take two arguments (`webircObj`, `network`) and return an
	//   object to be directly passed to `irc-framework`. `webircObj` contains the
	//   generated object which you can modify. For example:
	//
	//   ```js
	//   webirc: {
	//     "irc.example.com": (webircObj, network) => {
	//       webircObj.password = "thisiswebircpassword";
	//       webircObj.hostname = `webirc/${webircObj.hostname}`;
	//       return webircObj;
	//     },
	//   },
	//   ```
	//
	// This value is set to `null` to disable WEBIRC by default.
	webirc: null,

	// ## identd and oidentd support

	// ### `identd`
	//
	// Run The Lounge with `identd` support.
	//
	// The available keys for the `identd` object are:
	//
	// - `enable`: When `true`, the identd daemon runs on server start.
	// - `port`: Port to listen for ident requests.
	//
	// The value of `enable` is set to `false` to disable `identd` support by
	// default, in which case the value of `port` is ignored. The default value of
	// `port` is 113.
	identd: {
		enable: false,
		port: 113,
	},

	// ### `oidentd`
	//
	// When this setting is a string, this enables `oidentd` support using the
	// configuration file located at the given path.
	//
	// This is set to `null` by default to disable `oidentd` support.
	oidentd: null,

	// ## LDAP support

	// These settings enable and configure LDAP authentication.
	//
	// They are only being used in private mode. To know more about private mode,
	// see the `public` setting above.

	//
	// The authentication process works as follows:
	//
	// 1. The Lounge connects to the LDAP server with its system credentials.
	// 2. It performs an LDAP search query to find the full DN associated to the
	//    user requesting to log in.
	// 3. The Lounge tries to connect a second time, but this time using the
	//    user's DN and password. Authentication is validated if and only if this
	//    connection is successful.
	//
	// The search query takes a couple of parameters in `searchDN`:
	//
	// - a base DN `searchDN/base`. Only children nodes of this DN will likely
	//   be returned;
	// - a search scope `searchDN/scope` (see LDAP documentation);
	// - the query itself, built as `(&(<primaryKey>=<username>) <filter>)`
	//   where `<username>` is the user name provided in the log in request,
	//   `<primaryKey>` is provided by the config and `<filter>` is a filtering
	//   complement also given in the config, to filter for instance only for
	//   nodes of type `inetOrgPerson`, or whatever LDAP search allows.
	//
	// Alternatively, you can specify the `bindDN` parameter. This will make The
	// Lounge ignore `searchDN` options and assume that the user DN is always
	// `<bindDN>,<primaryKey>=<username>`, where `<username>` is the user name
	// provided in the log in request, and `<bindDN>` and `<primaryKey>` are
	// provided by the configuration.
	//
	// The available keys for the `ldap` object are:
	ldap: {
		// - `enable`: when set to `false`, LDAP support is disabled and all other
		//   values are ignored.
		enable: false,

		// - `url`: A url of the form `ldaps://<ip>:<port>`.
		//   For plain connections, use the `ldap` scheme.
		url: "ldaps://example.com",

		// - `tlsOptions`: LDAP connection TLS options (only used if scheme is
		//   `ldaps://`). It is an object whose values are Node.js' `tls.connect()`
		//   options. It is set to `{}` by default.
		//   For example, this option can be used in order to force the use of IPv6:
		//   ```js
		//   {
		//     host: 'my::ip::v6',
		//     servername: 'example.com'
		//   }
		//   ```
		tlsOptions: {},

		// - `primaryKey`: LDAP primary key. It is set to `"uid"` by default.
		primaryKey: "uid",

		// - `baseDN`: LDAP base DN, alternative to `searchDN`. For example, set it
		//   to `"ou=accounts,dc=example,dc=com"`.
		//   When unset, the LDAP auth logic with use `searchDN` instead to locate users.

		// - `searchDN`: LDAP search DN settings. This defines the procedure by
		//   which The Lounge first looks for the user DN before authenticating them.
		//   It is ignored if `baseDN` is specified. It is an object with the
		//   following keys:
		searchDN: {
			//   - `rootDN`: This bind DN is used to query the server for the DN of
			//     the user. This is supposed to be a system user that has access in
			//     read-only to the DNs of the people that are allowed to log in.
			//     It is set to `"cn=thelounge,ou=system-users,dc=example,dc=com"` by
			//     default.
			rootDN: "cn=thelounge,ou=system-users,dc=example,dc=com",

			//   - `rootPassword`: Password of The Lounge LDAP system user.
			rootPassword: "1234",

			//   - `filter`: it is set to `"(&(objectClass=person)(memberOf=ou=accounts,dc=example,dc=com))"`
			//     by default.
			filter: "(&(objectClass=person)(memberOf=ou=accounts,dc=example,dc=com))",

			//   - `base`: LDAP search base (search only within this node). It is set
			//     to `"dc=example,dc=com"` by default.
			base: "dc=example,dc=com",

			//   - `scope`: LDAP search scope. It is set to `"sub"` by default.
			scope: "sub",
		},
	},

	// ## Debugging settings

	// The `debug` object contains several settings to enable debugging in The
	// Lounge. Use them to learn more about an issue you are noticing but be aware
	// this may produce more logging or may affect connection performance so it is
	// not recommended to use them by default.
	//
	// All values in the `debug` object are set to `false`.
	debug: {
		// ### `debug.ircFramework`
		//
		// When set to true, this enables extra debugging output provided by
		// [`irc-framework`](https://github.com/kiwiirc/irc-framework), the
		// underlying IRC library for Node.js used by The Lounge.
		ircFramework: false,

		// ### `debug.raw`
		//
		// When set to `true`, this enables logging of raw IRC messages into each
		// server window, displayed on the client.
		raw: false,
	},
};
