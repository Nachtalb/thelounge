<template>
	<div id="sign-in" class="window" role="tabpanel" aria-label="Sign-in">
		<form class="container" method="post" action="" @submit="onSubmit">
			<img
				src="img/logo-vertical-transparent-bg.svg"
				class="logo"
				alt="The Lounge"
				width="256"
				height="170"
			/>
			<img
				src="img/logo-vertical-transparent-bg-inverted.svg"
				class="logo-inverted"
				alt="The Lounge"
				width="256"
				height="170"
			/>

			<Textbox
				id="signin-username"
				ref="username"
				:value="getStoredUser()"
				autocapitalize="none"
				autocomplete="username"
				autocorrect="off"
				autofocus
				name="username"
				required
				title="Username"
			/>

			<Password
				id="signin-password"
				ref="password"
				autocapitalize="none"
				autocomplete="current-password"
				autocorrect="off"
				name="password"
				required
				separate-label
				title="Password"
			/>

			<div v-if="errorShown" class="error">Authentication failed.</div>

			<button :disabled="inFlight" type="submit" class="btn">Sign in</button>
		</form>
	</div>
</template>

<script>
import storage from "../../js/localStorage";
import socket from "../../js/socket";
import Password from "../Inputs/Password.vue";
import Textbox from "../Inputs/Textbox.vue";

export default {
	name: "SignIn",
	components: {
		Textbox,
		Password,
	},
	data() {
		return {
			inFlight: false,
			errorShown: false,
		};
	},
	mounted() {
		socket.on("auth:failed", this.onAuthFailed);
	},
	beforeDestroy() {
		socket.off("auth:failed", this.onAuthFailed);
	},
	methods: {
		onAuthFailed() {
			this.inFlight = false;
			this.errorShown = true;
		},
		onSubmit(event) {
			event.preventDefault();

			this.inFlight = true;
			this.errorShown = false;

			const values = {
				user: this.$refs.username.value,
				password: this.$refs.password.value,
			};

			storage.set("user", values.user);

			socket.emit("auth:perform", values);
		},
		getStoredUser() {
			return storage.get("user") || "";
		},
	},
};
</script>
