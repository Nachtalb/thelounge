<template>
	<div id="version-checker" :class="[$store.state.versionStatus]">
		<p v-if="$store.state.versionStatus === 'loading'">Checking for updates…</p>
		<p v-if="$store.state.versionStatus === 'new-version'">
			The Lounge <b>{{ $store.state.versionData.latest.sha.slice(0, 8) }}</b>
			is now available.
			<br />

			<a
				:href="
					'https://github.com/Nachtalb/thelounge/commits/' +
					$store.state.versionData.latest.sha
				"
				target="_blank"
				rel="noopener"
			>
				Read more on GitHub
			</a>
		</p>
		<p v-if="$store.state.versionStatus === 'new-packages'">
			The Lounge is up to date, but there are out of date packages Run
			<code>thelounge upgrade</code> on the server to upgrade packages.
		</p>
		<template v-if="$store.state.versionStatus === 'up-to-date'">
			<p>The Lounge is up to date!</p>

			<button
				v-if="$store.state.versionDataExpired"
				id="check-now"
				class="btn btn-small"
				@click="checkNow"
			>
				Check now
			</button>
		</template>
		<template v-if="$store.state.versionStatus === 'error'">
			<p>Information about latest release could not be retrieved.</p>

			<button id="check-now" class="btn btn-small" @click="checkNow">Try again</button>
		</template>
	</div>
</template>

<script>
import socket from "../js/socket";

export default {
	name: "VersionChecker",
	mounted() {
		if (!this.$store.state.versionData) {
			this.checkNow();
		}
	},
	methods: {
		checkNow() {
			this.$store.commit("versionData", null);
			this.$store.commit("versionStatus", "loading");
			socket.emit("changelog");
		},
	},
};
</script>
