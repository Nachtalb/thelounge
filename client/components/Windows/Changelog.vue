<template>
	<div id="changelog" class="window" aria-label="Changelog">
		<div class="header">
			<SidebarToggle />
		</div>
		<div class="container">
			<router-link id="back-to-help" to="/help">« Help</router-link>

			<h1 class="title">Changelog</h1>
			<template v-if="$store.state.versionData">
				<template v-if="$store.state.versionData.commits">
					<ul class="commitlist">
						<li
							v-for="commit in $store.state.versionData.commits"
							:key="commit.sha"
							:class="[
								'commit',
								commit.sha === $store.state.versionData.current.sha
									? 'current'
									: '',
							]"
						>
							<h3>
								<span class="date">{{ date(commit.date) }}</span>
								<span class="separator">-</span>
								<span class="sha">
									<a
										:href="
											'https://github.com/Nachtalb/thelounge/commits/' +
											commit.sha
										"
										target="_blank"
									>
										{{ commit.sha.slice(0, 8) }}
									</a>
								</span>
								<div
									v-if="commit.sha === $store.state.versionData.current.sha"
									class="current"
								>
									Currently Installed
								</div>
							</h3>
							<span class="message">{{ commit.message }}</span>
						</li>
					</ul>
				</template>
				<template v-else>
					<p>Unable to retrieve info about the latest commit.</p>
					<p>
						<a
							:href="`https://github.com/Nachtalb/thelounge/commits/${$store.state.serverConfiguration.sha}`"
							target="_blank"
							rel="noopener"
							>View release notes for this version on GitHub</a
						>
					</p>
				</template>
				<a class="btn" target="_blank" href="https://github.com/Nachtalb/thelounge/commits"
					>Full changelog...</a
				>
			</template>
			<p v-else>Loading changelog…</p>
		</div>
	</div>
</template>

<script>
import socket from "../../js/socket";
import SidebarToggle from "../SidebarToggle.vue";

export default {
	name: "Changelog",
	components: {
		SidebarToggle,
	},
	mounted() {
		if (!this.$store.state.versionData) {
			socket.emit("changelog");
		}
	},
	methods: {
		date(str) {
			return new Date(str).toDateString();
		},
	},
};
</script>
