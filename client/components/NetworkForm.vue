<template>
	<div id="connect" class="window" role="tabpanel" aria-label="Connect">
		<div class="header">
			<SidebarToggle />
		</div>
		<form class="container" method="post" action="" @submit.prevent="onSubmit">
			<h1 class="title">
				<template v-if="defaults.uuid">
					<input v-model="defaults.uuid" type="hidden" name="uuid" />
					Edit {{ defaults.name }}
				</template>
				<template v-else>
					Connect
					<template v-if="config.lockNetwork && $store.state.serverConfiguration.public">
						to {{ defaults.name }}
					</template>
				</template>
			</h1>
			<template v-if="!config.lockNetwork">
				<h2>Network settings</h2>
				<Textbox
					id="connect:name"
					maxlength="100"
					name="name"
					title="Name"
					v-model="defaults.name"
					class="connect-row"
				/>

				<Input separateLabel title="Server" class="connect-row">
					<Textbox
						class="connect:host"
						v-model="defaults.host"
						name="host"
						aria-label="Server address"
						maxlength="255"
						required
					/>
					<span id="connect:portseparator">:</span>
					<Textbox
						class="connect:port"
						v-model="defaults.port"
						type="number"
						min="1"
						max="65535"
						name="port"
						aria-label="Server port"
					/>
				</Input>

				<Password
					class="connect-row"
					id="connect:password"
					maxlength="300"
					name="password"
					placeholder="Server password (optional)"
					title="Password"
					v-model="defaults.password"
				/>

				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<Checkbox
							:disabled="defaults.hasSTSPolicy"
							class="tls"
							name="tls"
							title="Use secure connection (TLS)"
							v-model="defaults.tls"
							:descriptionShown="defaults.hasSTSPolicy"
							description="This network has a strict transport security policy, you will be unable to disable TLS"
							descriptionTitle="🔒 STS"
						/>
						<Checkbox
							class="tls"
							name="rejectUnauthorized"
							title="Only allow trusted certificates"
							v-model="defaults.rejectUnauthorized"
						/>
					</div>
				</div>

				<h2>Proxy Settings</h2>
				<div class="connect-row">
					<label></label>
					<Checkbox
						class="input-wrap"
						id="connect:proxyEnabled"
						name="proxyEnabled"
						title="Enable Proxy"
						v-model="defaults.proxyEnabled"
					/>
				</div>
				<template v-if="defaults.proxyEnabled">
					<Input separateLabel title="SOCKS Address" class="connect-row">
						<Textbox
							aria-label="Proxy host"
							class="connect:proxyHost"
							maxlength="255"
							name="proxyHost"
							v-model="defaults.proxyHost"
						/>
						<span id="connect:proxyPortSeparator">:</span>
						<Textbox
							aria-label="SOCKS port"
							class="connect:proxyPort"
							max="65535"
							min="1"
							name="proxyPort"
							type="number"
							v-model="defaults.proxyPort"
						/>
					</Input>

					<Textbox
						separateLabel
						id="connect:proxyUsername"
						ref="proxyUsernameInput"
						v-model="defaults.proxyUsername"
						class="connect-row"
						name="proxyUsername"
						placeholder="Proxy username"
						title="Proxy username"
					/>

					<Password
						class="connect-row"
						id="connect:proxyPassword"
						name="proxyPassword"
						placeholder="Proxy password"
						title="Proxy password"
						v-model="defaults.proxyPassword"
					/>
				</template>
			</template>
			<template v-else-if="config.lockNetwork && !$store.state.serverConfiguration.public">
				<h2>Network settings</h2>
				<Textbox
					v-model="defaults.name"
					class="connect-row"
					name="name"
					maxlength="100"
					title="Name"
				/>
				<Password
					v-model="defaults.password"
					class="connect-row"
					name="password"
					title="Password"
				/>
			</template>

			<h2>User preferences</h2>
			<Textbox
				id="connect:nick"
				v-model="defaults.nick"
				class="connect-row"
				name="nick"
				pattern="[^\s:!@]+"
				maxlength="100"
				required
				@input="onNickChanged"
				title="Nick"
			/>

			<Textbox
				class="connect-row"
				maxlength="100"
				name="username"
				ref="usernameInput"
				title="Username"
				v-if="!config.useHexIp"
				v-model="defaults.username"
			/>
			<Textbox
				class="connect-row"
				maxlength="300"
				name="realname"
				title="Real name"
				v-model="defaults.realname"
			/>
			<Textbox
				class="connect-row"
				name="leaveMessage"
				title="Leave message"
				v-model="defaults.leaveMessage"
				autocomplete="off"
				placeholder="The Lounge - https://thelounge.chat"
			/>

			<Textbox
				autocomplete="off"
				description="One /command per line.
Each command will be executed in the server on a new connection."
				name="commands"
				private
				title="Commands"
				type="textarea"
				v-if="defaults.uuid"
				v-model="parsedCommands"
			/>

			<Textbox
				name="join"
				class="connect-row"
				title="Channels"
				v-if="!defaults.uuid"
				v-model="defaults.join"
				description="Comma separated list of #ChannelName"
			/>

			<template v-if="$store.state.serverConfiguration.public && config.lockNetwork">
				<div class="connect-row">
					<label></label>

					<Checkbox
						title="I have a password"
						name="displayPasswordField"
						v-model="displayPasswordField"
					/>
				</div>
				<Password
					v-if="displayPasswordField"
					title="Password"
					class="connect-row"
					name="publicPassword"
					v-model="defaults.password"
					placeholder="Server password"
				/>
			</template>

			<template v-else>
				<h2 id="label-auth">Authentication</h2>
				<Radio
					class="connect-row"
					name="sasl"
					v-model="defaults.sasl"
					:items="[
						{value: '', title: 'No authentication'},
						{value: 'plain', title: 'Username + Password (SASL PLAIN)'},
						{
							value: 'external',
							title: 'Client certificate (SASL EXTERNAL)',
							condition: !$store.state.serverConfiguration.public && defaults.tls,
						},
					]"
				/>

				<template v-if="defaults.sasl === 'plain'">
					<Textbox
						class="connect-row"
						id="connect:saslAccount"
						name="saslAccount"
						required
						title="Account"
						v-model="defaults.saslAccount"
					/>
					<Password
						class="connect-row"
						name="saslPassword"
						required
						title="Password"
						v-model="defaults.saslPassword"
					/>
				</template>
				<div v-else-if="defaults.sasl === 'external'" class="connect-sasl-external">
					<p>The Lounge automatically generates and manages the client certificate.</p>
					<p>
						On the IRC server, you will need to tell the services to attach the
						certificate fingerprint (certfp) to your account, for example:
					</p>
					<pre><code>/msg NickServ CERT ADD</code></pre>
				</div>
			</template>

			<div>
				<button type="submit" class="btn" :disabled="disabled ? true : false">
					<template v-if="defaults.uuid">Save network</template>
					<template v-else>Connect</template>
				</button>
			</div>
		</form>
	</div>
</template>

<style>
#connect .connect-auth {
	display: block;
	margin-bottom: 10px;
}

#connect .connect-auth .opt {
	display: block;
	width: 100%;
}

#connect .connect-auth input {
	margin: 3px 10px 0 0;
}

#connect .connect-sasl-external {
	padding: 10px;
	border-radius: 2px;
	background-color: #d9edf7;
	color: #31708f;
}

#connect .connect-sasl-external pre {
	margin: 0;
	user-select: text;
}
</style>

<script>
import SidebarToggle from "./SidebarToggle.vue";
import Dropdown from "./Inputs/Dropdown.vue";
import Generic from "./Inputs/Generic.vue";
import HoverHelp from "./Special/HoverHelp.vue";
import Password from "./Inputs/Password.vue";
import Radio from "./Inputs/Radio.vue";
import Textbox from "./Inputs/Textbox.vue";
import Checkbox from "./Inputs/Checkbox.vue";

export default {
	name: "NetworkForm",
	components: {
		SidebarToggle,
		Input: Generic,
		Dropdown,
		HoverHelp,
		Password,
		Radio,
		Textbox,
		Checkbox,
	},
	props: {
		handleSubmit: Function,
		defaults: Object,
		disabled: Boolean,
	},
	data() {
		return {
			config: this.$store.state.serverConfiguration,
			previousUsername: this.defaults.username,
			displayPasswordField: false,
		};
	},
	computed: {
		parsedCommands() {
			return this.defaults.commands ? this.defaults.commands.join("\n") : "";
		},
	},
	watch: {
		displayPasswordField(value) {
			if (value) {
				this.$nextTick(() => this.$refs.publicPassword.focus());
			}
		},
		"defaults.tls"(isSecureChecked) {
			const ports = [6667, 6697];
			const newPort = isSecureChecked ? 0 : 1;

			// If you disable TLS and current port is 6697,
			// set it to 6667, and vice versa
			if (this.defaults.port === ports[newPort]) {
				this.defaults.port = ports[1 - newPort];
			}
		},
	},
	methods: {
		onNickChanged(event) {
			// Username input is not available when useHexIp is set
			if (!this.$refs.usernameInput) {
				return;
			}

			if (
				!this.$refs.usernameInput.value ||
				this.$refs.usernameInput.value === this.previousUsername
			) {
				this.$refs.usernameInput.value = event.target.value;
			}

			this.previousUsername = event.target.value;
		},
		onSubmit(event) {
			const formData = new FormData(event.target);
			const data = {};

			for (const item of formData.entries()) {
				data[item[0]] = item[1];
			}
			debugger;

			this.handleSubmit(data);
		},
	},
};
</script>
