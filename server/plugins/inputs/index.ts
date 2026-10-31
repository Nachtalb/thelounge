import Client from "../../client";
import log from "../../log";
import Chan, {Channel} from "../../models/chan";
import Network, {NetworkWithIrcFramework} from "../../models/network";
import {PackageInfo} from "../packages";
import PublicClient from "../packages/publicClient";
import action from "./action";
import away from "./away";
import ban from "./ban";
import connect from "./connect";
import ctcp from "./ctcp";
import disconnect from "./disconnect";
import ignore from "./ignore";
import ignorelist from "./ignorelist";
import invite from "./invite";
import kick from "./kick";
import kill from "./kill";
import list from "./list";
import mode from "./mode";
import msg from "./msg";
import nick from "./nick";
import notice from "./notice";
import part from "./part";
import quit from "./quit";
import raw from "./raw";
import rejoin from "./rejoin";
import topic from "./topic";
import whois from "./whois";
import mute from "./mute";

export type InputExtras = {
	replyTo?: string;
};

export type PluginInputHandler = (
	this: Client,
	network: NetworkWithIrcFramework,
	chan: Channel,
	cmd: string,
	args: string[],
	extras?: InputExtras
) => void;

type Plugin = {
	commands: string[];
	input: (
		network: Network,
		chan: Chan,
		cmd: string,
		args: string[],
		extras?: InputExtras
	) => void;
	allowDisconnected?: boolean;
};

type ExternalPluginCommand = {
	packageInfo: PackageInfo;
	input: (
		pub: PublicClient,
		netChan: {network: Network; chan: Chan},
		cmd: string,
		args: string[]
	) => void;
	allowDisconnected?: boolean;
};

const clientSideCommands = ["/collapse", "/expand", "/help", "/network", "/search", "/settings"];

const passThroughCommands = [
	"/as",
	"/bs",
	"/cs",
	"/ho",
	"/hs",
	"/join",
	"/ms",
	"/ns",
	"/os",
	"/rs",
];

// Loaded statically: a dynamic import() finishes after startup, when commands may already arrive
const builtInInputs = [
	action,
	away,
	ban,
	connect,
	ctcp,
	disconnect,
	ignore,
	ignorelist,
	invite,
	kick,
	kill,
	list,
	mode,
	msg,
	nick,
	notice,
	part,
	quit,
	raw,
	rejoin,
	topic,
	whois,
	mute,
] as Plugin[];
const userInputs = new Map<string, Plugin>();

for (const plugin of builtInInputs) {
	plugin.commands.forEach((command) => userInputs.set(command, plugin));
}

const pluginCommands = new Map<string, ExternalPluginCommand>();

const getCommands = () =>
	Array.from(userInputs.keys())
		.concat(Array.from(pluginCommands.keys()))
		.map((command) => `/${command}`)
		.concat(clientSideCommands)
		.concat(passThroughCommands)
		.sort();

const addPluginCommand = (packageInfo: PackageInfo, command: any, obj: any) => {
	if (typeof command !== "string") {
		log.error(`plugin {packageInfo.packageName} tried to register a bad command`);
		return;
	} else if (!obj || typeof obj.input !== "function") {
		log.error(
			`plugin ${packageInfo.packageName} tried to register command "${command}" without a callback`
		);
		return;
	}

	pluginCommands.set(command, {
		packageInfo: packageInfo,
		input: obj.input,
		allowDisconnected: obj.allowDisconnected,
	});
};

export default {
	addPluginCommand,
	getCommands,
	pluginCommands,
	userInputs,
};
