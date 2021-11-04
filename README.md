<h1 align="center">
	<img
		width="400"
		alt="The Lounge with Blackjack and Hookers"
		src="https://raw.githubusercontent.com/Nachtalb/thelounge/blackjack-and-hookers/client/img/the-lounge-with-blackjack-and-hookers.png">
</h1>

<h3 align="center">
	Modern web IRC client designed for self-hosting based on [The Lounge](https://github.com/thelounge/thelounge)
	but with faster feature updates.
</h3>

<p align="center">
	<strong>
		<a href="https://github.com/Nachtalb/thelounge/">Website</a>
		•
		<a href="https://thelounge.chat/docs">Official Docs</a>
	</strong>
</p>
<p align="center">
	<a href="https://github.com/Nachtalb/thelounge/actions"><img
		alt="Build Status"
		src="https://github.com/Nachtalb/thelounge/workflows/Build/badge.svg"></a>
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/thelounge/thelounge.github.io/master/img/thelounge-screenshot.png" width="550">
</p>

## Overview

- **Modern features brought to IRC.** Push notifications, link previews, new message markers, and more bring IRC to the 21st century.
- **Always connected.** Remains connected to IRC servers while you are offline.
- **Cross platform.** It doesn't matter what OS you use, it just works wherever Node.js runs.
- **Responsive interface.** The client works smoothly on every desktop, smartphone and tablet.
- **Synchronized experience.** Always resume where you left off no matter what device.

As this is not the official client all configurations, setup etc may be a bit different than the original clients. At the current
stage this isn't as big of a deal. But just keep it in mind when using the original clients documentations.

To learn more about configuration, usage and features of The Lounge, take a look at [the website](https://thelounge.chat).

"The Lounge with blackjack and hookers" is fork of [The Lounge](https://github.com/thelounge/thelounge/) which is the official and
community-managed fork of [Shout](https://github.com/erming/shout), by [Mattias Erming](https://github.com/erming).

## Differences to the original

<details>
<summary>Rolling releases!</summary>
Instead of waiting for eons on new releases to add features, the main feature of this version are continuous updates.

I will setup a proper Docker workflow to generate new images for you to use. Maybe I'll look into a "one click to update" feature.

- **Priority:** High
- **Status:** Dockerfile image for source build is available but no automated workflow yet
</details>
<details>
<summary>Jump to searchresult / mentions</summary>
One of the main downsides of the original client is that you are not able to jump to your mentions nor to search results.
(The search has yet to be released, currently only available in the prerelease....).

- **Priority:** High
- **Status:** Planned
</details>

<details>
<summary>PostgreSQL backend</summary>
Instead of using sqlite or text file based logs I want PostgreSQL support. Which should be faster and be able to handle
much more logs / data. [PostgreSQL Website](https://www.postgresql.org/)

- **Priority:** Medium
- **Status:** Planned
</details>

<details>
<summary>Animated WEBP support</summary>
Animated WEBP are basically GIFs but way more spce efficient. Thus you can have looping HD reaction images which only use a few kilobytes.
Currently they are not supported at all. (This was already developed for the official client but it was removed again)

- **Priority:** High
- **Status:** Planned
</details>

<details>
<summary>Auto image compression (togglable)</summary>
Enable automatic image compression (either jpg or webp). This helps to reduce bandwidth makes image previews snappier.

- **Priority:** Low
- **Status:** Planned
</details>

<details>
<summary>Link preview before sending</summary>
Link preview of the links yet to be sent so you won't accidentally send that embarassing photo of yours. (Like any other
reasonable modern message client)

- **Priority:** Medium
- **Status:** Planned
</details>

<details>
<summary>Telegram like sticker support</summary>
I hat searching for reactions to messages in my folders and sending them when it's already too late. Intead I want to
add Telegram stickers support. How this will look like is not yet defind but I do want to be able to convert actual
Telegram sticker packs to packs usable for you in this client.

- **Priority:** Low
- **Status:** Planned
</details>

<details>
<summary>Bits and pieces</summary>
Ther are small things here and there that in my opinion are just not user friendly at all. Stuff as:
- Changing network settins does not reconnect you (eg. when you want to enable a proxy)
- Rightclicking networks is not possible anymore in the latest release preview
- `/quit` instantly removes a network without warning (incl. all settings)
- Topic box on mobile is not userfriendly
- Disconnected networks show the disconnected icon next to the name which can't be clicked to reconnect
	You either have to go to the network, hit the threedot menu and hit connect or write out `/connect` and hit enter.

- **Priority:** Various
- **Status:** Ongoing
</details>

## Installation and usage

The Lounge requires latest [Node.js](https://nodejs.org/) LTS version or more recent.
[Yarn package manager](https://yarnpkg.com/) is also recommended.
If you want to install with npm, `--unsafe-perm` is required for a correct install.

### Running stable releases

Please refer to the [install and upgrade documentation on our website](https://thelounge.chat/docs/install-and-upgrade) for all available installation methods.

### Running from source

The following commands install and run the development version of The Lounge:

```sh
git clone https://github.com/Nachtalb/thelounge.git
cd thelounge
yarn install
NODE_ENV=production yarn build
yarn start
```

When installed like this, `thelounge` executable is not created. Use `node index <command>` to run commands.

⚠️ While it is the most recent codebase, this is not production-ready! Run at
your own risk. It is also not recommended to run this as root.

## Development setup

Simply follow the instructions to run The Lounge from source above, on your own
fork.

Before submitting any change, make sure to:

- Read the [Contributing instructions](https://github.com/Nachtalb/thelounge/blob/blackjack-and-hookers/.github/CONTRIBUTING.md#contributing)
- Run `yarn test` to execute linters and test suite
- Run `yarn build` if you change or add anything in `client/js` or `client/components`
- `yarn dev` can be used to start The Lounge with hot module reloading
