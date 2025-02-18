<template>
	<div id="settings" class="window" role="tabpanel" aria-label="Settings">
		<div class="header">
			<SidebarToggle />
		</div>
		<form
			ref="settingsForm"
			class="container"
			autocomplete="off"
			@change="onChange"
			@submit.prevent
		>
			<h1 class="title">Settings</h1>

			<Checkbox
				v-model="$store.state.settings.advanced"
				name="advanced"
				title="Advanced settings"
			/>

			<div v-if="canRegisterProtocol || hasInstallPromptEvent">
				<h2>Native app</h2>
				<button
					v-if="hasInstallPromptEvent"
					type="button"
					class="btn"
					@click.prevent="nativeInstallPrompt"
				>
					Add The Lounge to Home screen
				</button>
				<button
					v-if="canRegisterProtocol"
					type="button"
					class="btn"
					@click.prevent="registerProtocol"
				>
					Open irc:// URLs with The Lounge
				</button>
			</div>

			<div v-if="!$store.state.serverConfiguration.public && $store.state.settings.advanced">
				<h2>Settings synchronisation</h2>
				<Checkbox
					v-model="$store.state.settings.syncSettings"
					name="syncSettings"
					title="Synchronize settings with other clients"
				/>
				<template v-if="!$store.state.settings.syncSettings">
					<div v-if="$store.state.serverHasSettings" class="settings-sync-panel">
						<p>
							<strong>Warning:</strong> Checking this box will override the settings
							of this client with those stored on the server.
						</p>
						<p>
							Use the button below to enable synchronization, and override any
							settings already synced to the server.
						</p>
						<button type="button" class="btn btn-small" @click="onForceSyncClick">
							Sync settings and enable
						</button>
					</div>
					<div v-else class="settings-sync-panel">
						<p>
							<strong>Warning:</strong> No settings have been synced before. Enabling
							this will sync all settings of this client as the base for other
							clients.
						</p>
					</div>
				</template>
			</div>

			<h2>Messages</h2>
			<Checkbox
				v-model="$store.state.settings.motd"
				description="Message Of The Day"
				name="motd"
				title="Show MOTD"
			/>
			<Checkbox
				v-model="$store.state.settings.showSeconds"
				name="showSeconds"
				title="Include seconds in timestamp"
			/>
			<Checkbox
				v-model="$store.state.settings.use12hClock"
				name="use12hClock"
				title="Use 12-hour timestamps"
			/>

			<div v-if="!$store.state.serverConfiguration.public && $store.state.settings.advanced">
				<h2>Automatic away message</h2>

				<Textbox
					id="awayMessage"
					v-model="$store.state.settings.awayMessage"
					name="awayMessage"
					placeholder="Away message if The Lounge is not open"
					screen-reader-title
					title="Automatic away message"
				/>
			</div>
			<h2 id="label-status-messages">
				Status messages
				<HoverHelp text="Joins, parts, quits, kicks, nick changes, and mode changes" />
			</h2>
			<Radio
				v-model="$store.state.settings.statusMessages"
				:items="[
					{value: 'shown', title: 'Show all status messages individually'},
					{value: 'condensed', title: 'Condense status messages together'},
					{value: 'hidden', title: 'Hide all status messages'},
				]"
				name="statusMessages"
			/>

			<h2>Visual Aids</h2>
			<Checkbox
				v-model="$store.state.settings.coloredNicks"
				name="coloredNicks"
				title="Enable colored nicknames"
			/>
			<Checkbox
				v-model="$store.state.settings.autocomplete"
				name="autocomplete"
				title="Enable autocomplete"
			/>

			<Textbox
				id="nickPostfix"
				v-model="$store.state.settings.nickPostfix"
				advanced-only
				description="Nick autocomplete postfix (for example a comma)"
				name="nickPostfix"
				placeholder="Nick autocomplete postfix (e.g. ', ')"
				title="Nick autocomplete postfix"
			/>

			<h2>Theme</h2>
			<Dropdown
				id="theme-select"
				v-model="$store.state.settings.theme"
				:items="
					$store.state.serverConfiguration.themes.map((item) => ({
						value: item.name,
						title: item.displayName,
					}))
				"
				name="theme"
				screen-reader-title
				title="Theme"
			/>

			<template v-if="$store.state.serverConfiguration.prefetch">
				<h2>Link previews</h2>
				<Checkbox
					v-model="$store.state.settings.media"
					name="media"
					title="Auto-expand media"
				/>
				<Checkbox
					v-model="$store.state.settings.links"
					name="links"
					title="Auto-expand websites"
				/>
			</template>

			<template
				v-if="$store.state.settings.advanced && $store.state.serverConfiguration.fileUpload"
			>
				<h2>File uploads</h2>
				<Checkbox
					v-model="$store.state.settings.uploadCanvas"
					name="uploadCanvas"
					title="Attempt to remove metadata from images before uploading"
					description="This option renders the image into a canvas element to remove metadata from the image.
This may break orientation if your browser does not support that."
				/>
			</template>

			<template v-if="!$store.state.serverConfiguration.public">
				<h2>Push Notifications</h2>
				<div>
					<button
						id="pushNotifications"
						type="button"
						class="btn"
						:disabled="
							$store.state.pushNotificationState !== 'supported' &&
							$store.state.pushNotificationState !== 'subscribed'
						"
						@click="onPushButtonClick"
					>
						<template v-if="$store.state.pushNotificationState === 'subscribed'">
							Unsubscribe from push notifications
						</template>
						<template v-else-if="$store.state.pushNotificationState === 'loading'">
							Loading…
						</template>
						<template v-else> Subscribe to push notifications </template>
					</button>
					<div v-if="$store.state.pushNotificationState === 'nohttps'" class="error">
						<strong>Warning</strong>: Push notifications are only supported over HTTPS
						connections.
					</div>
					<div v-if="$store.state.pushNotificationState === 'unsupported'" class="error">
						<strong>Warning</strong>:
						<span>Push notifications are not supported by your browser.</span>

						<div v-if="isIOS" class="apple-push-unsupported">
							Safari does
							<a
								href="https://bugs.webkit.org/show_bug.cgi?id=182566"
								target="_blank"
								rel="noopener"
								>not support the web push notification specification</a
							>, and because all browsers on iOS use Safari under the hood, The Lounge
							is unable to provide push notifications on iOS devices.
						</div>
					</div>
				</div>
			</template>

			<h2>Browser Notifications</h2>
			<Checkbox
				id="desktopNotifications"
				v-model="$store.state.settings.desktopNotifications"
				:disabled="$store.state.desktopNotificationState === 'nohttps'"
				name="desktopNotifications"
				title="Enable browser notifications"
			/>
			<div v-if="$store.state.desktopNotificationState === 'unsupported'" class="error">
				<strong>Warning</strong>: Notifications are not supported by your browser.
			</div>
			<div
				v-if="$store.state.desktopNotificationState === 'nohttps'"
				id="warnBlockedDesktopNotifications"
				class="error"
			>
				<strong>Warning</strong>: Notifications are only supported over HTTPS connections.
			</div>
			<div
				v-if="$store.state.desktopNotificationState === 'blocked'"
				id="warnBlockedDesktopNotifications"
				class="error"
			>
				<strong>Warning</strong>: Notifications are blocked by your browser.
			</div>

			<Checkbox
				v-model="$store.state.settings.notification"
				name="notification"
				title="Enable notification sound"
			/>
			<div>
				<div class="opt">
					<button id="play" @click.prevent="playNotification">Play sound</button>
				</div>
			</div>

			<Checkbox
				v-model="$store.state.settings.notifyAllMessages"
				advanced-only
				name="notifyAllMessages"
				title="Enable notification for all messages"
			/>

			<Textbox
				id="highlights"
				v-model="$store.state.settings.highlights"
				advanced-only
				autocomplete="off"
				name="highlights"
				placeholder="Comma-separated, e.g.: word, some more words, anotherword"
				private-only
				title="Custom highlights"
				description="If a message contains any of these comma-separated
expressions, it will trigger a highlight."
			/>
			<Textbox
				id="highlightExceptions"
				v-model="$store.state.settings.highlightExceptions"
				advanced-only
				autocomplete="off"
				name="highlightExceptions"
				placeholder="Comma-separated, e.g.: word, some more words, anotherword"
				private-only
				title="Highlight exceptions"
				description="If a message contains any of these comma-separated
expressions, it will not trigger a highlight even if it contains
your nickname or expressions defined in custom highlights."
			/>

			<div
				v-if="
					!$store.state.serverConfiguration.public &&
					!$store.state.serverConfiguration.ldapEnabled
				"
				id="change-password"
				role="group"
				aria-labelledby="label-change-password"
			>
				<h2 id="label-change-password">Change password</h2>

				<Password
					id="current-password"
					autocomplete="current-password"
					name="old_password"
					placeholder="Enter current password"
					screen-reader-title
					title="Enter current password"
				/>
				<Password
					id="new-password"
					autocomplete="new-password"
					name="new_password"
					placeholder="Enter desired new password"
					screen-reader-title
					title="Enter desired new password"
				/>
				<Password
					id="new-password-verify"
					autocomplete="new-password"
					name="verify_password"
					placeholder="Repeat new password"
					screen-reader-title
					title="Repeat new password"
				/>

				<div
					v-if="passwordChangeStatus && passwordChangeStatus.success"
					class="feedback success"
				>
					Successfully updated your password
				</div>
				<div
					v-else-if="passwordChangeStatus && passwordChangeStatus.error"
					class="feedback error"
				>
					{{ passwordErrors[passwordChangeStatus.error] }}
				</div>
				<div>
					<button type="submit" class="btn" @click.prevent="changePassword">
						Change password
					</button>
				</div>
			</div>

			<div v-if="$store.state.settings.advanced">
				<h2>Custom Stylesheet</h2>
				<Textbox
					id="user-specified-css-input"
					v-model="$store.state.settings.userStyles"
					name="userStyles"
					placeholder="/* You can override any style with CSS here */"
					screen-reader-title
					title="Custom stylesheet. You can override any style with CSS here."
					type="textarea"
				/>
			</div>

			<div v-if="!$store.state.serverConfiguration.public" class="session-list" role="group">
				<h2>Sessions</h2>

				<h3>Current session</h3>
				<Session v-if="currentSession" :session="currentSession" />

				<template v-if="activeSessions.length > 0">
					<h3>Active sessions</h3>
					<Session
						v-for="session in activeSessions"
						:key="session.token"
						:session="session"
					/>
				</template>

				<h3>Other sessions</h3>
				<p v-if="$store.state.sessions.length === 0">Loading…</p>
				<p v-else-if="otherSessions.length === 0">
					<em>You are not currently logged in to any other device.</em>
				</p>
				<Session
					v-for="session in otherSessions"
					v-else
					:key="session.token"
					:session="session"
				/>
			</div>
		</form>
	</div>
</template>

<style>
textarea#user-specified-css-input {
	height: 100px;
}
</style>

<script>
import socket from "../../js/socket";
import webpush from "../../js/webpush";
import Session from "../Session.vue";
import SidebarToggle from "../SidebarToggle.vue";
import Dropdown from "../Inputs/Dropdown.vue";
import HoverHelp from "../Special/HoverHelp.vue";
import Password from "../Inputs/Password.vue";
import Radio from "../Inputs/Radio.vue";
import Textbox from "../Inputs/Textbox.vue";
import Checkbox from "../Inputs/Checkbox.vue";

let installPromptEvent = null;

window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	installPromptEvent = e;
});

export default {
	name: "Settings",
	components: {
		Session,
		SidebarToggle,
		Dropdown,
		HoverHelp,
		Password,
		Radio,
		Textbox,
		Checkbox,
	},
	data() {
		return {
			canRegisterProtocol: false,
			passwordChangeStatus: null,
			passwordErrors: {
				missing_fields: "Please enter a new password",
				password_mismatch: "Both new password fields must match",
				password_incorrect:
					"The current password field does not match your account password",
				update_failed: "Failed to update your password",
			},
			isIOS: navigator.platform.match(/(iPhone|iPod|iPad)/i) || false,
		};
	},
	computed: {
		hasInstallPromptEvent() {
			// TODO: This doesn't hide the button after clicking
			return installPromptEvent !== null;
		},
		currentSession() {
			return this.$store.state.sessions.find((item) => item.current);
		},
		activeSessions() {
			return this.$store.state.sessions.filter((item) => !item.current && item.active > 0);
		},
		otherSessions() {
			return this.$store.state.sessions.filter((item) => !item.current && !item.active);
		},
	},
	mounted() {
		socket.emit("sessions:get");

		// Enable protocol handler registration if supported,
		// and the network configuration is not locked
		this.canRegisterProtocol =
			window.navigator.registerProtocolHandler &&
			!this.$store.state.serverConfiguration.lockNetwork;
	},
	methods: {
		onChange(event) {
			const ignore = ["old_password", "new_password", "verify_password"];

			const name = event.target.name;

			if (ignore.includes(name)) {
				return;
			}

			let value;

			if (event.target.type === "checkbox") {
				value = event.target.checked;
			} else {
				value = event.target.value;
			}

			this.$store.dispatch("settings/update", {name, value, sync: true});
		},
		changePassword() {
			const allFields = new FormData(this.$refs.settingsForm);
			const data = {
				old_password: allFields.get("old_password"),
				new_password: allFields.get("new_password"),
				verify_password: allFields.get("verify_password"),
			};

			if (!data.old_password || !data.new_password || !data.verify_password) {
				this.passwordChangeStatus = {
					success: false,
					error: "missing_fields",
				};
				return;
			}

			if (data.new_password !== data.verify_password) {
				this.passwordChangeStatus = {
					success: false,
					error: "password_mismatch",
				};
				return;
			}

			socket.once("change-password", (response) => {
				this.passwordChangeStatus = response;
			});

			socket.emit("change-password", data);
		},
		onForceSyncClick() {
			this.$store.dispatch("settings/syncAll", true);
			this.$store.dispatch("settings/update", {
				name: "syncSettings",
				value: true,
				sync: true,
			});
		},
		registerProtocol() {
			const uri = document.location.origin + document.location.pathname + "?uri=%s";

			window.navigator.registerProtocolHandler("irc", uri, "The Lounge");
			window.navigator.registerProtocolHandler("ircs", uri, "The Lounge");
		},
		nativeInstallPrompt() {
			installPromptEvent.prompt();
			installPromptEvent = null;
		},
		playNotification() {
			const pop = new Audio();
			pop.src = "audio/pop.wav";
			pop.play();
		},
		onPushButtonClick() {
			webpush.togglePushSubscription();
		},
	},
};
</script>
