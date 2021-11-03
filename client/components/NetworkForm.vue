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
					v-model="defaults.name"
					class="connect-row"
					maxlength="100"
					name="name"
					title="Name"
				/>

				<Input separate-label title="Server" class="connect-row">
					<Textbox
						v-model="defaults.host"
						aria-label="Server address"
						class="connect:host"
						maxlength="255"
						name="host"
						required
					/>
					<span id="connect:portseparator">:</span>
					<Textbox
						v-model="defaults.port"
						aria-label="Server port"
						class="connect:port"
						max="65535"
						min="1"
						name="port"
						type="number"
					/>
				</Input>

				<Password
					id="connect:password"
					v-model="defaults.password"
					class="connect-row"
					maxlength="300"
					name="password"
					placeholder="Server password (optional)"
					title="Password"
				/>

				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<Checkbox
							v-model="defaults.tls"
							:description-shown="defaults.hasSTSPolicy"
							description="This network has a strict transport security policy, you will be unable to disable TLS"
							description-title="🔒 STS"
							:disabled="defaults.hasSTSPolicy"
							class="tls"
							name="tls"
							title="Use secure connection (TLS)"
						/>
						<Checkbox
							v-model="defaults.rejectUnauthorized"
							class="tls"
							name="rejectUnauthorized"
							title="Only allow trusted certificates"
						/>
					</div>
				</div>

				<h2>Proxy Settings</h2>
				<div class="connect-row">
					<label></label>
					<Checkbox
						id="connect:proxyEnabled"
						v-model="defaults.proxyEnabled"
						class="input-wrap"
						name="proxyEnabled"
						title="Enable Proxy"
					/>
				</div>
				<template v-if="defaults.proxyEnabled">
					<Input separate-label title="SOCKS Address" class="connect-row">
						<Textbox
							v-model="defaults.proxyHost"
							aria-label="Proxy host"
							class="connect:proxyHost"
							maxlength="255"
							name="proxyHost"
						/>
						<span id="connect:proxyPortSeparator">:</span>
						<Textbox
							v-model="defaults.proxyPort"
							aria-label="SOCKS port"
							class="connect:proxyPort"
							max="65535"
							min="1"
							name="proxyPort"
							type="number"
						/>
					</Input>

					<Textbox
						id="connect:proxyUsername"
						ref="proxyUsernameInput"
						v-model="defaults.proxyUsername"
						class="connect-row"
						name="proxyUsername"
						placeholder="Proxy username"
						separate-label
						title="Proxy username"
					/>

					<Password
						id="connect:proxyPassword"
						v-model="defaults.proxyPassword"
						class="connect-row"
						name="proxyPassword"
						placeholder="Proxy password"
						title="Proxy password"
					/>
				</template>
			</template>
			<template v-else-if="config.lockNetwork && !$store.state.serverConfiguration.public">
				<h2>Network settings</h2>
				<Textbox
					v-model="defaults.name"
					class="connect-row"
					maxlength="100"
					name="name"
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
				maxlength="100"
				name="nick"
				pattern="[^\s:!@]+"
				required
				title="Nick"
				@input="onNickChanged"
			/>

			<Textbox
				v-if="!config.useHexIp"
				ref="usernameInput"
				v-model="defaults.username"
				class="connect-row"
				maxlength="100"
				name="username"
				title="Username"
			/>
			<Textbox
				v-model="defaults.realname"
				class="connect-row"
				maxlength="300"
				name="realname"
				title="Real name"
			/>
			<Textbox
				v-model="defaults.leaveMessage"
				autocomplete="off"
				class="connect-row"
				name="leaveMessage"
				placeholder="The Lounge - https://thelounge.chat"
				title="Leave message"
			/>

			<Textbox
				v-if="defaults.uuid"
				v-model="parsedCommands"
				autocomplete="off"
				description="One /command per line.
				Each command will be executed in the server on a new connection."
				name="commands"
				private
				title="Commands"
				type="textarea"
			/>

			<Textbox
				v-if="!defaults.uuid"
				v-model="defaults.join"
				class="connect-row"
				description="Comma separated list of #ChannelName"
				name="join"
				title="Channels"
			/>

			<template v-if="$store.state.serverConfiguration.public && config.lockNetwork">
				<div class="connect-row">
					<label></label>

					<Checkbox
						v-model="displayPasswordField"
						name="displayPasswordField"
						title="I have a password"
					/>
				</div>
				<Password
					v-if="displayPasswordField"
					v-model="defaults.password"
					class="connect-row"
					name="publicPassword"
					placeholder="Server password"
					title="Password"
				/>
			</template>

			<template v-else>
				<h2 id="label-auth">Authentication</h2>
				<Radio
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
					class="connect-row"
					name="sasl"
				/>

				<template v-if="defaults.sasl === 'plain'">
					<Textbox
						id="connect:saslAccount"
						v-model="defaults.saslAccount"
						class="connect-row"
						name="saslAccount"
						required
						title="Account"
					/>
					<Password
						v-model="defaults.saslPassword"
						class="connect-row"
						name="saslPassword"
						required
						title="Password"
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
import Generic from "./Inputs/Generic.vue";
import Password from "./Inputs/Password.vue";
import Radio from "./Inputs/Radio.vue";
import Textbox from "./Inputs/Textbox.vue";
import Checkbox from "./Inputs/Checkbox.vue";

export default {
	name: "NetworkForm",
	components: {
		SidebarToggle,
		Input: Generic,
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

			this.handleSubmit(data);
		},
	},
};
</script>
