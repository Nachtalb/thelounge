export type ConfigTheme = {
	displayName: string;
	name: string;
	themeColor: string | null;
};
// An emoji image set clients can pick (bundled, or installed by the operator)
export type EmojiSetInfo = {
	id: string;
	name: string;
	license: string;
	bundled: boolean;
	// Attribution its licence requires, shown in Help > About (with a link to creditUrl)
	credit?: string;
	creditUrl?: string;
	source?: string;
	version?: string;
};

type SharedConfigurationBase = {
	public: boolean;
	useHexIp: boolean;
	prefetch: boolean;
	fileUpload: boolean;
	ldapEnabled: boolean;
	isUpdateAvailable: boolean;
	applicationServerKey: string;
	version: string;
	gitCommit: string | null;
	themes: ConfigTheme[];
	defaultTheme: string;
	emojiSets: EmojiSetInfo[];
	emojiDefaultStyle: string;
	fileUploadMaxFileSize?: number;
};

export type ConfigNetDefaults = {
	name: string;
	host: string;
	port: number;
	password: string;
	tls: boolean;
	rejectUnauthorized: boolean;
	nick: string;
	username: string;
	realname: string;
	join: string;
	leaveMessage: string;
	sasl: string;
	saslAccount: string;
	saslPassword: string;
};
export type LockedConfigNetDefaults = Omit<
	ConfigNetDefaults,
	"host" | "port" | "tls" | "rejectUnauthorized"
>;

export type LockedSharedConfiguration = SharedConfigurationBase & {
	lockNetwork: true;
	defaults: LockedConfigNetDefaults;
};

export type SharedConfiguration = SharedConfigurationBase & {
	lockNetwork: false;
	defaults: ConfigNetDefaults;
};
