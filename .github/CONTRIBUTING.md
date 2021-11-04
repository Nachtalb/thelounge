## Contributing

Welcome to The Lounge with blackjack and hookers, it's great to have you here!
We thank you in advance for your contributions. This is not the official "The
Lounge" repository, but a fork that aims to release features more quickly but
maybe not as fleshed out. If you want to contribute to the official client
please use this: https://github.com/thelounge/thelounge/blob/master/.github/CONTRIBUTING.md

### I want to report a bug

- Look at the [open and closed
  issues](https://github.com/Nachtalb/thelounge/issues?q=is%3Aissue) to see if
  this was not already discussed before. If you can't see any, feel free to
  [open a new issue](https://github.com/Nachtalb/thelounge/issues/new).
- If you think you discovered a security vulnerability, **do not open a public
  issue on GitHub.** Refer to our [security guidelines](/SECURITY.md) instead.

### I want to contribute to the code

- Take a look at the open issues labeled as [`help wanted`](https://github.com/Nachtalb/thelounge/labels/help%20wanted)
  if you want to help without having a specific idea in mind.
- Make sure that your PRs do not contain unnecessary commits or merge commits.
  [Squash commits](https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History)
  whenever possible.
- [Rebase](https://git-scm.com/book/en/v2/Git-Branching-Rebasing) (instead of
  merge) outdated PRs on the `master` branch.
- Note that we use prettier on the project. You can set up IDE plugins to format
  on save ([see VS Code one here](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)).
- We have a git hook to automatically run prettier before commit, in case you don't install the plugin.
- If for any reason, prettier does not work for you, you can run `yarn format:prettier` and that should format everything.
- Make sure your code passes the tests `yarn test`
