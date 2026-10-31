import {Database} from "bun:sqlite";

import log from "../../log";
import path from "path";
import {mkdirSync} from "fs";
import Config from "../../config";
import Msg, {Message} from "../../models/msg";
import Chan, {Channel} from "../../models/chan";
import Helper from "../../helper";
import type {SearchableMessageStorage, DeletionRequest} from "./types";
import Network from "../../models/network";
import {SearchQuery, SearchResponse} from "../../../shared/types/storage";
import {parseSearchQuery} from "../../../shared/searchQuery";

type Migration = {version: number; stmts: string[]};
type Rollback = {version: number; rollback_forbidden?: boolean; stmts: string[]};

export const currentSchemaVersion = 1793491200000; // use `new Date().getTime()`

// Desired schema, adapt to the newest version and add migrations to the array below
const schema = [
	"CREATE TABLE options (name TEXT, value TEXT, CONSTRAINT name_unique UNIQUE (name))",
	"CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT, msgid TEXT)",
	`CREATE TABLE migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		version INTEGER NOT NULL UNIQUE,
		rollback_forbidden INTEGER DEFAULT 0 NOT NULL
	)`,
	`CREATE TABLE rollback_steps (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		migration_id INTEGER NOT NULL REFERENCES migrations ON DELETE CASCADE,
		step INTEGER NOT NULL,
		statement TEXT NOT NULL
	)`,
	"CREATE INDEX time ON messages (time)",
	// needed for efficient getMessages queries
	"CREATE INDEX network_channel_time ON messages (network, channel, time)",
	"CREATE INDEX msgid_idx ON messages (msgid)",
	// search only reads 'message' rows, this skips the other types without reading them
	"CREATE INDEX msg_search_idx ON messages (network, channel, time) WHERE type = 'message'",
];

// the migrations will be executed in an exclusive transaction as a whole
// add new migrations to the end, with the version being the new 'currentSchemaVersion'
// write a corresponding down migration into rollbacks
export const migrations: Migration[] = [
	{
		version: 1672236339873,
		stmts: [
			"CREATE TABLE messages_new (id INTEGER PRIMARY KEY AUTOINCREMENT, network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT)",
			"INSERT INTO messages_new(network, channel, time, type, msg) select network, channel, time, type, msg from messages order by time asc",
			"DROP TABLE messages",
			"ALTER TABLE messages_new RENAME TO messages",
			"CREATE INDEX network_channel ON messages (network, channel)",
			"CREATE INDEX time ON messages (time)",
		],
	},
	{
		version: 1679743888000,
		stmts: [
			`CREATE TABLE IF NOT EXISTS migrations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				version INTEGER NOT NULL UNIQUE,
				rollback_forbidden INTEGER DEFAULT 0 NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS rollback_steps (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				migration_id INTEGER NOT NULL REFERENCES migrations ON DELETE CASCADE,
				step INTEGER NOT NULL,
				statement TEXT NOT NULL
			)`,
		],
	},
	{
		version: 1703322560448,
		stmts: ["CREATE INDEX msg_type_idx on messages (type)"],
	},
	{
		// replaces network_channel and also covers the sort in getMessages
		version: 1780272000000,
		stmts: [
			"CREATE INDEX IF NOT EXISTS network_channel_time ON messages (network, channel, time)",
			"DROP INDEX IF EXISTS network_channel",
		],
	},
	{
		version: 1784073600000,
		stmts: [
			"ALTER TABLE messages ADD COLUMN msgid TEXT",
			"CREATE INDEX msgid_idx ON messages (msgid)",
		],
	},
	{
		// storageCleaner sorted every old row of the type by time; the time index needs no sort
		version: 1793404800000,
		stmts: ["DROP INDEX IF EXISTS msg_type_idx"],
	},
	{
		version: 1793491200000,
		stmts: [
			"CREATE INDEX IF NOT EXISTS msg_search_idx ON messages (network, channel, time) WHERE type = 'message'",
		],
	},
];

// down migrations need to restore the state of the prior version.
// rollback can be disallowed by adding rollback_forbidden: true to it
export const rollbacks: Rollback[] = [
	{
		version: 1672236339873,
		stmts: [], // changes aren't visible, left empty on purpose
	},
	{
		version: 1679743888000,
		stmts: [], // here we can't drop the tables, as we use them in the code, so just leave those in
	},
	{
		version: 1703322560448,
		stmts: ["drop INDEX msg_type_idx"],
	},
	{
		version: 1780272000000,
		stmts: [
			"DROP INDEX IF EXISTS network_channel_time",
			"CREATE INDEX IF NOT EXISTS network_channel ON messages (network, channel)",
		],
	},
	{
		version: 1784073600000,
		stmts: ["DROP INDEX msgid_idx", "ALTER TABLE messages DROP COLUMN msgid"],
	},
	{
		version: 1793404800000,
		stmts: ["CREATE INDEX IF NOT EXISTS msg_type_idx on messages (type)"],
	},
	{
		version: 1793491200000,
		stmts: ["DROP INDEX IF EXISTS msg_search_idx"],
	},
];

type MessageRow = {msg: string; type: string; time: number; msgid: string | null};

function rowToMsg(row: MessageRow, id: number) {
	const msg = JSON.parse(row.msg);
	msg.time = row.time;
	msg.type = row.type;

	if (row.msgid) {
		msg.msgid = row.msgid;
	}

	const newMsg = new Msg(msg);
	newMsg.id = id;

	return newMsg;
}

// exported for tests
export const getMessagesQuery =
	"SELECT msg, type, time, msgid FROM messages WHERE network = ? AND channel = ? ORDER BY time DESC, id DESC LIMIT ?";

class SqliteMessageStorage implements SearchableMessageStorage {
	isEnabled: boolean;
	database!: Database;
	userName: string;

	constructor(userName: string) {
		this.userName = userName;
		this.isEnabled = false;
	}

	_enable(connection_string: string) {
		this.database = new Database(connection_string);
		// every message is its own write: without WAL each one waits for journal fsyncs
		this.database.exec("PRAGMA journal_mode = WAL");
		this.database.exec("PRAGMA synchronous = NORMAL");

		try {
			this.run_migrations();
		} catch (e) {
			this.isEnabled = false;
			throw Helper.catch_to_error("Migration failed", e);
		}

		this.isEnabled = true;
	}

	enable() {
		const logsPath = Config.getUserLogsPath();
		const sqlitePath = path.join(logsPath, `${this.userName}.sqlite3`);
		mkdirSync(logsPath, {recursive: true});
		this._enable(sqlitePath);
	}

	setup_new_db() {
		for (const stmt of schema) {
			this.database.exec(stmt);
		}

		this.database
			.prepare("INSERT INTO options (name, value) VALUES ('schema_version', ?)")
			.run(currentSchemaVersion.toString());
	}

	current_version(): number {
		const have_options = this.database
			.prepare("select 1 from sqlite_master where type = 'table' and name = 'options'")
			.get();

		if (!have_options) {
			return 0;
		}

		const version = this.database
			.prepare("SELECT value FROM options WHERE name = 'schema_version'")
			.get() as {value: string} | null;

		if (!version) {
			// technically shouldn't happen, means something created a schema but didn't populate it
			// we'll try our best to recover
			return 0;
		}

		const storedSchemaVersion = parseInt(version.value, 10);
		return storedSchemaVersion;
	}

	update_version_in_db() {
		this.database
			.prepare("UPDATE options SET value = ? WHERE name = 'schema_version'")
			.run(currentSchemaVersion.toString());
	}

	_run_migrations(dbVersion: number) {
		log.info(
			`sqlite messages schema version is out of date (${dbVersion} < ${currentSchemaVersion}). Running migrations, this may take a while.`
		);

		const to_execute = necessaryMigrations(dbVersion);

		for (const stmt of to_execute.map((m) => m.stmts).flat()) {
			this.database.exec(stmt);
		}

		this.update_version_in_db();
	}

	run_migrations() {
		const version = this.current_version();

		if (version > currentSchemaVersion) {
			throw `sqlite messages schema version is higher than expected (${version} > ${currentSchemaVersion}). Is The Lounge out of date?`;
		} else if (version === currentSchemaVersion) {
			return; // nothing to do
		}

		this.database.exec("BEGIN EXCLUSIVE TRANSACTION");

		try {
			if (version === 0) {
				this.setup_new_db();
			} else {
				this._run_migrations(version);
			}

			this.insert_rollback_since(version);
		} catch (err) {
			this.database.exec("ROLLBACK");
			throw err;
		}

		this.database.exec("COMMIT");
		this.database.exec("VACUUM");
	}

	// helper method that vacuums the db, meant to be used by migration related cli commands
	vacuum() {
		this.database.exec("VACUUM");
	}

	close() {
		if (!this.isEnabled) {
			return;
		}

		this.isEnabled = false;
		// true finalizes open statements, else Windows keeps the file locked until GC
		this.database.close(true);
	}

	fetch_rollbacks(since_version: number): Rollback[] {
		const res = this.database
			.prepare(
				`select version, rollback_forbidden, statement
				from rollback_steps
				join migrations on migrations.id=rollback_steps.migration_id
				where version > ?
				order by version desc, step asc`
			)
			.all(since_version) as {
			version: number;
			rollback_forbidden: number;
			statement: string;
		}[];

		const result: Rollback[] = [];

		// convert to Rollback[]
		// requires ordering in the sql statement
		for (const raw of res) {
			const last = result.at(-1);

			if (!last || raw.version !== last.version) {
				result.push({
					version: raw.version,
					rollback_forbidden: Boolean(raw.rollback_forbidden),
					stmts: [raw.statement],
				});
			} else {
				last.stmts.push(raw.statement);
			}
		}

		return result;
	}

	delete_migrations_older_than(version: number) {
		this.database.prepare("delete from migrations where migrations.version > ?").run(version);
	}

	// returns whether any rollback statements were executed
	_downgrade_to(version: number): boolean {
		const _rollbacks = this.fetch_rollbacks(version);

		if (_rollbacks.length === 0) {
			return false;
		}

		const forbidden = _rollbacks.find((item) => item.rollback_forbidden);

		if (forbidden) {
			throw Error(`can't downgrade past ${forbidden.version}`);
		}

		for (const rollback of _rollbacks) {
			for (const stmt of rollback.stmts) {
				this.database.exec(stmt);
			}
		}

		this.delete_migrations_older_than(version);
		this.update_version_in_db();

		return true;
	}

	downgrade_to(version: number): number {
		if (version <= 0) {
			throw Error(`${version} is not a valid version to downgrade to`);
		}

		this.database.exec("BEGIN EXCLUSIVE TRANSACTION");

		let rolled_back = false;

		try {
			rolled_back = this._downgrade_to(version);
		} catch (err) {
			this.database.exec("ROLLBACK");
			throw err;
		}

		this.database.exec("COMMIT");

		if (rolled_back) {
			this.vacuum();
		}

		return version;
	}

	downgrade() {
		return this.downgrade_to(currentSchemaVersion);
	}

	insert_rollback_since(version: number) {
		const missing = newRollbacks(version);

		for (const rollback of missing) {
			const migration = this.database
				.prepare(
					`insert into migrations
					(version, rollback_forbidden)
					values (?, ?)
					returning id`
				)
				.get(rollback.version, rollback.rollback_forbidden ? 1 : 0) as {id: number};

			let step = 0;

			for (const stmt of rollback.stmts) {
				this.database
					.prepare(
						`insert into rollback_steps
						(migration_id, step, statement)
						values (?, ?, ?)`
					)
					.run(migration.id, step, stmt);
				step++;
			}
		}
	}

	index(network: Network, channel: Chan, msg: Msg) {
		if (!this.isEnabled) {
			return;
		}

		const clonedMsg = Object.keys(msg).reduce((newMsg, prop) => {
			// id is regenerated when messages are retrieved
			// previews are not stored because storage is cleared on lounge restart
			// type, time, and msgid are stored in separate columns
			if (
				prop !== "id" &&
				prop !== "previews" &&
				prop !== "type" &&
				prop !== "time" &&
				prop !== "msgid"
			) {
				newMsg[prop] = msg[prop];
			}

			return newMsg;
		}, {});

		this.database
			.query(
				"INSERT INTO messages(network, channel, time, type, msg, msgid) VALUES(?, ?, ?, ?, ?, ?)"
			)
			.run(
				network.uuid,
				channel.name.toLowerCase(),
				msg.time.getTime(),
				msg.type,
				JSON.stringify(clonedMsg),
				msg.msgid ?? null
			);
	}

	deleteChannel(network: Network, channel: Channel) {
		if (!this.isEnabled) {
			return;
		}

		this.database
			.query("DELETE FROM messages WHERE network = ? AND channel = ?")
			.run(network.uuid, channel.name.toLowerCase());
	}

	getMessages(network: Network, channel: Channel, nextID: () => number): Message[] {
		if (!this.isEnabled || Config.values.maxHistory === 0) {
			return [];
		}

		// If unlimited history is specified, load 100k messages
		const limit = Config.values.maxHistory < 0 ? 100000 : Config.values.maxHistory;

		const rows = this.database
			.query(getMessagesQuery)
			.all(network.uuid, channel.name.toLowerCase(), limit) as MessageRow[];

		return rows.reverse().map((row) => rowToMsg(row, nextID()));
	}

	// Messages from `context` messages before `from` up to `to` (exclusive), oldest first
	getMessagesBetween(
		network: Network,
		channel: Channel,
		from: number,
		to: number,
		context: number,
		nextID: () => number
	): Message[] {
		if (!this.isEnabled) {
			return [];
		}

		const where = "network = ? AND channel = ?";
		const rows = this.database
			.query(
				`SELECT msg, type, time, msgid FROM messages WHERE ${where} AND time < ? AND time >= COALESCE(` +
					`(SELECT time FROM messages WHERE ${where} AND time < ? ORDER BY time DESC LIMIT 1 OFFSET ?), 0` +
					") ORDER BY time ASC, id ASC"
			)
			.all(
				network.uuid,
				channel.name.toLowerCase(),
				to,
				network.uuid,
				channel.name.toLowerCase(),
				from,
				context - 1
			) as MessageRow[];

		return rows.map((row) => rowToMsg(row, nextID()));
	}

	search(query: SearchQuery): SearchResponse {
		if (!this.isEnabled) {
			// this should never be hit as messageProvider is checked in client.search()
			throw new Error(
				"search called but sqlite provider not enabled. This is a programming error"
			);
		}

		const {nick, text} = parseSearchQuery(query.searchTerm);
		let select =
			"SELECT msg, type, time, network, channel, msgid FROM messages WHERE type = 'message'";
		const params: (string | number)[] = [];

		if (nick) {
			select += " AND json_extract(msg, '$.from.nick') = ? COLLATE NOCASE";
			params.push(nick);
		}

		if (text) {
			// Using the '@' character to escape '%' and '_' in patterns.
			select += " AND json_extract(msg, '$.text') LIKE ? ESCAPE '@'";
			params.push(`%${text.replace(/([%_@])/g, "@$1")}%`);
		}

		if (query.networkUuid) {
			select += " AND network = ? ";
			params.push(query.networkUuid);
		}

		if (query.channelName) {
			select += " AND channel = ? ";
			params.push(query.channelName.toLowerCase());
		}

		const maxResults = Math.min(Math.max(Math.floor(Number(query.limit)) || 100, 1), 50000);
		// Times of all matches (newest first) for the date picker, sent with the first page
		const timesQuery = `SELECT time${select.slice(
			select.indexOf(" FROM ")
		)} ORDER BY time DESC, id DESC LIMIT 50000`;
		const times = query.offset
			? undefined
			: (this.database.prepare(timesQuery).all(...params) as {time: number}[]).map(
					(r) => r.time
			  );

		select += " ORDER BY time DESC, id DESC LIMIT ? OFFSET ? ";
		params.push(maxResults);
		params.push(query.offset);

		const rows = this.database.prepare(select).all(...params) as {
			msg: string;
			type: string;
			time: number;
			network: string;
			channel: string;
			msgid: string | null;
		}[];

		return {
			...query,
			results: parseSearchRowsToMessages(query.offset, rows).reverse(),
			times,
		};
	}

	deleteMessages(req: DeletionRequest): number {
		let sql = "delete from messages where id in (select id from messages where\n";
		// We roughly get a timestamp from N days before.
		// We don't adjust for daylight savings time or other weird time jumps
		const millisecondsInDay = 24 * 60 * 60 * 1000;
		const deleteBefore = Date.now() - req.olderThanDays * millisecondsInDay;
		sql += "time <= ?\n";
		const params: (string | number)[] = [deleteBefore];

		if (req.messageTypes !== null) {
			const placeholder = new Array(req.messageTypes.length).fill("?").join(",");
			sql += `and type in (${placeholder})\n`;
			params.push(...req.messageTypes);
		}

		sql += "order by time asc\n";
		sql += "limit ?\n";
		params.push(req.limit);
		sql += ")";

		return this.database.query(sql).run(...params).changes as number;
	}

	canProvideMessages() {
		return this.isEnabled;
	}
}

// TODO: type any
function parseSearchRowsToMessages(
	id: number,
	rows: {
		msg: string;
		type: string;
		time: number;
		network: string;
		channel: string;
		msgid: string | null;
	}[]
) {
	const messages: Msg[] = [];

	for (const row of rows) {
		const msg = JSON.parse(row.msg);
		msg.time = row.time;
		msg.type = row.type;
		msg.networkUuid = row.network;
		msg.channelName = row.channel;
		msg.id = id;

		if (row.msgid) {
			msg.msgid = row.msgid;
		}

		messages.push(new Msg(msg));
		id += 1;
	}

	return messages;
}

export function necessaryMigrations(since: number): Migration[] {
	return migrations.filter((m) => m.version > since);
}

export function newRollbacks(since: number): Rollback[] {
	return rollbacks.filter((r) => r.version > since);
}

export default SqliteMessageStorage;
