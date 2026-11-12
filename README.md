# Secret-Hitler-Online (self-hosted fork)

> **This is a personal fork** of [ShrimpCryptid/Secret-Hitler-Online](https://github.com/ShrimpCryptid/Secret-Hitler-Online),
> run as a private, self-hosted instance. It is not the hosted game at secret-hitler.online and is not
> maintained by the original author. Report problems with this fork on
> [its Issues page](https://github.com/jussaw/Secret-Hitler-Online/issues), not upstream.

![](https://i.postimg.cc/zvnLRbqq/place-policy.gif)

A fan-made web adaptation of [Secret Hitler](https://secrethitler.com), a social deduction board game for up to 10 players by Goat, Wolf & Cabbage.

### The Game
In the game, players are divided into Liberals, Fascists, and one secret Hitler. The Liberals must work together (or not) to discover the secret Hitler hiding in their midst, all while the Fascists try to elevate the secret Hitler to power. Pass policies to achieve victory and unlock presidential powers to investigate your friends.

Can you find and stop the Secret Hitler?

There are instructions on how to play the game provided in the app, and plenty of helpful tips are provided for first-time players. The game takes care of rules for you, making it easy to pick up and play. Lobbies with fewer than 5 players are filled with CPU players.

For more information, read the [official rulebook here](https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf).

## Running locally

Requirements: Java 17 and Node.js 22.12 or newer (tested with Node 24).

Start the backend, which listens on [localhost:4040](http://localhost:4040):

```bash
cd backend
./gradlew runLocal
```

In a second terminal, start the frontend dev server on [localhost:3000](http://localhost:3000):

```bash
cd frontend
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), create a lobby, choose a look and start the game.

Run the tests with `cd backend && ./gradlew test` and `cd frontend && npm test -- --run`. See [DEVELOPMENT.md](DEVELOPMENT.md) for more setups, including Docker Compose.

## About this project
### Technical Details
The Java server is divided into the [game simulation](backend/src/main/java/game) and the [REST API](backend/src/main/java/server). Communication between the server and client is done via websocket and HTTP requests, using the [Javalin library](https://javalin.io/).

The [webpage](frontend) is written in [React](https://reactjs.org/), and features animations created with CSS. Assets were either adapted from the original board game or created using [Inkscape](https://inkscape.org/).

The plan for this fork is tracked in [docs/PLAN.md](docs/PLAN.md).

## Licence and attribution
Secret Hitler Online is licensed under [Creative Commons BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (see [LICENSE](LICENSE)), and is adapted from the original board game released by Goat, Wolf & Cabbage (© 2016-2020). This fork is distributed under the same licence: non-commercial, share-alike.

The web adaptation was created by [ShrimpCryptid](https://github.com/ShrimpCryptid) (© 2020-2023) in [Secret-Hitler-Online](https://github.com/ShrimpCryptid/Secret-Hitler-Online). All credit for the original web game goes to its author and contributors.

*(This project is not affiliated with or endorsed by Goat, Wolf & Cabbage.)*

#### What's changed from the original board game?
![](https://i.postimg.cc/cCNCZxw2/show-votes.gif)
- Artwork for the boards, policy deck, identity cards, party cards, and liberal/fascist icons were adapted for the website with some minor modifications (rounding corners, adding depth, shadows).
- Custom assets (made in Inkscape) were added based on the style of the original, most notably for the election tracker, policy reveal popup windows, and the player icons and tiles.
- Where possible, fonts were replaced with ones licensed under the [Open Font License](https://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=OFL), namely [Germania One](https://fonts.google.com/specimen/Germania+One) and [Montserrat](https://fonts.google.com/specimen/Montserrat).
- The web interface, animations, and server are new additions that use the same rules from the original game.

#### What's changed in this fork?
- Removed Google Analytics, the Twitter share button, and upstream's Firebase and Fly.io deployment config.
- All 20 player portraits are available without sharing on Twitter.
- Further changes (self-hosting, layout, sounds, spectators) are listed in [docs/PLAN.md](docs/PLAN.md) as they land.
