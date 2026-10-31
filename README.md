<h1 align="center">
	<img
		width="300"
		alt="The Lounge"
		src="https://github.com/thelounge/thelounge/blob/master/client/public/img/logo-vertical-transparent-bg.svg?sanitize=true">
</h1>

<h3 align="center">
	Modern web IRC client designed for self-hosting
</h3>

<p align="center">
	<strong>
		<a href="https://thelounge.chat/">Website</a>
		•
		<a href="https://thelounge.chat/docs">Docs</a>
		•
		<a href="https://demo.thelounge.chat/">Demo</a>
    •
		<a href="#docker">Docker</a>
	</strong>
</p>
<p align="center">
	<a href="https://demo.thelounge.chat/"><img
		alt="#thelounge IRC channel on Libera.Chat"
		src="https://img.shields.io/badge/Libera.Chat-%23thelounge-415364.svg?colorA=ff9e18"></a>
	<a href="https://github.com/thelounge/thelounge/actions"><img
		alt="Build Status"
		src="https://github.com/thelounge/thelounge/actions/workflows/build.yml/badge.svg"></a>
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/thelounge/thelounge.github.io/master/img/thelounge-screenshot.png" width="550">
</p>

## Overview

- **Modern features brought to IRC.** Push notifications, link previews, new message markers, and more bring IRC to the 21st century.
- **Always connected.** Remains connected to IRC servers while you are offline.
- **Responsive interface.** The client works smoothly on every desktop, smartphone and tablet.
- **Synchronized experience.** Always resume where you left off no matter what device.

To learn more about configuration, usage and features of The Lounge, take a look at [the website](https://thelounge.chat).

The Lounge is the official and community-managed fork of [Shout](https://github.com/erming/shout), by [Mattias Erming](https://github.com/erming).

## Docker

The Lounge ships as a Linux container image, `ghcr.io/nachtalb/thelounge` (`latest` or `sha-<commit>`).
It listens on port 9000 and keeps its config, users and logs in `/var/opt/thelounge`,
which must be writable by the user it runs as.

```sh
mkdir -p data && sudo chown 1000:1000 data
docker run -d --name thelounge -u 1000:1000 -p 9000:9000 \
	-v "$PWD/data:/var/opt/thelounge" ghcr.io/nachtalb/thelounge:latest
docker exec -it thelounge /usr/local/bin/bun /app/index.js add <user>
```

docker-compose:

```yaml
services:
  thelounge:
    image: ghcr.io/nachtalb/thelounge:latest
    user: "1000:1000"
    ports: ["9000:9000"]
    volumes: ["./data:/var/opt/thelounge"]
    environment:
      TZ: Europe/Zurich
    restart: unless-stopped
```

Kubernetes pod:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: thelounge
spec:
  securityContext: {runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000}
  containers:
    - name: thelounge
      image: ghcr.io/nachtalb/thelounge:latest
      ports: [{containerPort: 9000}]
      volumeMounts: [{name: data, mountPath: /var/opt/thelounge}]
  volumes:
    - name: data
      persistentVolumeClaim: {claimName: thelounge-data}
```

Other commands (`reset`, `install <theme>`, `emoji install ...`) run the same way as `add` above.

## Running from source

The Lounge requires [Bun](https://bun.sh/) 1.4 or more recent. The following commands install and run it:

```sh
git clone https://github.com/Nachtalb/thelounge.git
cd thelounge
bun install
NODE_ENV=production bun run build
bun start
```

When installed like this, `thelounge` executable is not created. Use `bun index <command>` to run commands.

⚠️ While it is the most recent codebase, this is not production-ready! Run at
your own risk. It is also not recommended to run this as root.

## Development setup

Simply follow the instructions to run The Lounge from source above, on your own
fork.

Before submitting any change, make sure to:

- Read the [Contributing instructions](https://github.com/thelounge/thelounge/blob/master/.github/CONTRIBUTING.md#contributing)
- Run `bun run test` to execute linters and the test suite
  - Run `bun run format:prettier` if linting fails
- Run `bun run build:client` if you change or add anything in `client/js` or `client/components`
  - The built files will be output to `public/` by webpack
- Run `bun run build:server` if you change anything in `server/`
  - The built files will be output to `dist/` by tsc
- `bun run dev` can be used to start The Lounge with hot module reloading

To ensure that you don't commit files that fail the linting, you can install a pre-commit git hook.
Execute `bun run githooks-install` to do so.
