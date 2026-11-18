/**
 * Copyright 2023, Peyton Lee (@ShrimpCryptid)
 */

package game;

import java.io.IOException;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Random;
import java.util.TreeMap;
import java.util.function.ToDoubleFunction;

import game.datastructures.Identity;
import game.datastructures.Player;
import game.datastructures.Policy;

public class CpuPlayer implements Serializable, Comparable<CpuPlayer> {

  /**
   * The value Java computed for this class before it was pinned, which the CPU
   * players in older backups carry. Pinned so the class's methods may change;
   * a field added later comes back empty from an older backup and is filled in
   * {@code readObject}, as {@code random} is.
   */
  private static final long serialVersionUID = 2392054316009854878L;

  private static int MAX_REPUTATION = 5;

  /** A pick's weights left as they are: a factor of exactly 1 changes no Normal pick. */
  private static final ToDoubleFunction<String> NO_FACTOR = name -> 1;

  /**
   * The share of an Easy CPU's decisions that are a random legal move instead
   * of Normal's. Set from {@code botMatches -Pladder}: one 0.05 notch above
   * 0.10, the lowest value at which each side's Easy bots still won clearly
   * less often than Normal ones against Normal opponents, so the ladder is not
   * marginal by design.
   */
  public static final double EASY_MISTAKE_CHANCE = 0.15;

  /**
   * Hard's rule 3: how far a reader lowers each player who voted yes for a government that then
   * enacted a fascist policy, before rule 5 scales it by how unlikely an all-fascist hand was.
   */
  static final double VOTE_DROP = 0.25;

  /**
   * Hard's rule 6: with two failed elections, the share of the way from a liberal's yes chance on
   * its trusting path to certain yes that it moves, as a third failure enacts the top card.
   */
  static final float LIBERAL_TRACKER_PUSH = 0.5f;

  /**
   * Hard's rule 6: with two failed elections, the share of the fascist side's yes chance that it
   * drops for a government with no member it knows is on its side, so the top card may come.
   */
  static final float FASCIST_TRACKER_PULL = 0.5f;

  /**
   * Hard's rule 7: how often a Hard fascist chancellor holding one of each card, under a president
   * it knows is liberal, plays the liberal one while the bluff is open (see {@code bluffs}).
   */
  static final double CHANCELLOR_BLUFF_CHANCE = 0.35;

  /**
   * Hard's rule 7: how often a Hard fascist president dealt two fascists and a liberal, with a
   * chancellor it knows is liberal, discards a fascist and so passes one of each.
   */
  static final double PRESIDENT_BLUFF_CHANCE = 0.35;

  /**
   * Hard's rule 3: one closed election as every seat saw it: its round, its government and each
   * living player's vote (a {@code TreeMap}, so a backup's bytes depend only on the votes).
   */
  record Election(int round, String president, String chancellor, Map<String, Boolean> votes)
      implements Serializable {
  }

  private List<Policy.Type> chancellorChoices;
  private transient Random random;
  private int lastUpdatedRound = 1;

  /**
   * Tracks the current level of reputation in a range from [-5, 5]
   * for each other player (both other CPUs and players) in the game, starting
   * at neutral (0). The lower the reputation value is, the more
   * likely the CpuPlayer will act as though the player is Fascist/Hitler.
   * 
   * Note that this tracks the general reputation a player has, regardless of
   * whether their role is known by this CpuPlayer.
   */
  public final HashMap<String, Integer> playerReputation;

  /**
   * A map of player names to known roles. This is modified at the beginning of
   * the game, and by the Investigate presidential power (which reveals a party:
   * an investigated Hitler is known as FASCIST).
   */
  public final HashMap<String, Identity> knownPlayerRoles;

  /** The name of this CpuPlayer. */
  public final String myName;
  public Player myPlayerData;

  /**
   * How well this CPU plays. Not final: a CPU read from a backup made before
   * levels has none, and {@code readObject} makes it {@code NORMAL}.
   */
  private BotSkill skill;

  /**
   * Hard's rule 1: the players a Hard liberal has seen proved not to be Hitler. A CPU read from a
   * backup made before the rule has none, and {@code readObject} makes an empty one.
   */
  private ClearedPlayers clearedPlayers;

  /**
   * Hard's rule 2: the round whose hand this CPU last read as chancellor, so the choice it makes
   * again after a refused veto reads nothing twice. 0 before any, and from an older backup.
   */
  private int handReadRound;

  /**
   * Hard's rule 4: the peek this CPU holds until the next government's session ends (none below
   * Hard). A CPU read from a backup made before the rule has none, and {@code readObject} makes an
   * empty one.
   */
  private PeekMemory peekMemory;

  /**
   * Hard's rule 5: the cards this CPU saw go to the discard pile since the last reshuffle, for the
   * odds of a hand (none below Hard, or for a CPU that knows every role). A CPU read from a backup
   * made before the rule has none, and {@code readObject} makes an empty one.
   */
  private DeckOdds deck;

  /**
   * The fraction of each score beside {@code playerReputation}'s whole number, for a Hard CPU whose
   * rules scale an amount (rule 5): a score is the two summed, from -5 to 5. A name with none has
   * none. A CPU read from a backup made before the rule has none, and {@code readObject} makes an
   * empty one.
   */
  private HashMap<String, Double> reputationCarry;

  /** Hard's rule 5: the round whose hand {@code drawnAllFascist} is; 0 before any. */
  private int drawnRound;

  /** Hard's rule 5: the chance the hand drawn in round {@code drawnRound} was all fascist. */
  private double drawnAllFascist;

  /**
   * Hard's rule 5: the round in which this CPU, as president, passed {@code chancellorChoices}, so
   * its chancellor's discard is deduced once the session ends; 0 for none, and back to 0 once the
   * discard is deduced or skipped.
   */
  private int passedRound;

  /**
   * Hard's rule 3: every election this CPU saw close, oldest first, one per round (none below Hard,
   * or for a CPU that knows every role). A CPU read from a backup made before the rule has none,
   * and {@code readObject} makes an empty list.
   */
  private ArrayList<Election> elections;

  /** A Normal CPU player. */
  public CpuPlayer(String name) {
    this(name, BotSkill.NORMAL);
  }

  /**
   * A CPU player at the given level.
   *
   * @throws NullPointerException if {@code skill} is null.
   */
  public CpuPlayer(String name, BotSkill skill) {
    this.myName = name;
    this.skill = Objects.requireNonNull(skill, "skill");
    playerReputation = new HashMap<>();
    knownPlayerRoles = new HashMap<>();
    clearedPlayers = new ClearedPlayers();
    peekMemory = new PeekMemory();
    deck = new DeckOdds();
    reputationCarry = new HashMap<>();
    elections = new ArrayList<>();
    random = new Random();
  }

  /** How well this CPU plays. */
  public BotSkill skill() {
    return skill;
  }

  /**
   * Replaces this CPU's random source, so a test can seed it. The source is
   * transient: a CPU read from a backup gets a new unseeded one.
   */
  void useRandom(Random random) {
    this.random = random;
  }

  /** Hard's rule 1: the players this CPU has seen proved not to be Hitler (none unless it is a Hard liberal). */
  ClearedPlayers clearedPlayers() {
    return clearedPlayers;
  }

  /** Hard's rule 4: the peek this CPU holds (none unless it is Hard). */
  PeekMemory peekMemory() {
    return peekMemory;
  }

  /** Hard's rule 5: the discards this CPU has seen (none unless it is a Hard CPU that reads the game). */
  DeckOdds deckOdds() {
    return deck;
  }

  /** Hard's rule 3: the elections this CPU saw close, oldest first; unmodifiable. */
  List<Election> elections() {
    return Collections.unmodifiableList(new ArrayList<>(elections));
  }

  /** {@code name}'s score with its fraction, from -5 to 5: {@code playerReputation}'s whole number plus its carry. */
  double score(String name) {
    double whole = playerReputation.get(name) + reputationCarry.getOrDefault(name, 0.0);
    return Math.max(-MAX_REPUTATION, Math.min(MAX_REPUTATION, whole));
  }

  public void initialize(SecretHitlerGame game) {
    List<Player> playerList = game.getPlayerList();

    // Set player suspicion to neutral (5) by default
    playerReputation.clear();
    for (Player player : playerList) {
      playerReputation.put(player.getUsername(), 0);
    }

    // Get a reference to our current player data
    myPlayerData = null;
    for (Player playerData : playerList) {
      if (playerData.getUsername().equals(myName)) {
        myPlayerData = playerData;
        break;
      }
    }
    if (myPlayerData == null) {
      throw new IllegalStateException(
          "Could not find a matching Player username in the current game while initializing this CpuPlayer.");
    }

    // Mark ourselves as a CPU Player in the game
    myPlayerData.markAsCpu();

    // Update known identities, based on identity, according to rules
    knownPlayerRoles.clear();
    if (knowsEveryRole(game)) {
      // Mark players as known if (1) player is fascist or (2) if player is
      // hitler AND there are only 5-6 players in the game.
      for (Player player : playerList) {
        if (!player.getUsername().equals(myName)) {
          // Add to known identities
          knownPlayerRoles.put(player.getUsername(), player.getIdentity());
        }
      }
    }

    // Add our own identity to the list of known roles
    knownPlayerRoles.put(myName, myPlayerData.getIdentity());

    // What a Hard CPU remembers belongs to one game.
    clearedPlayers = new ClearedPlayers();
    handReadRound = 0;
    peekMemory = new PeekMemory();
    deck = new DeckOdds();
    reputationCarry = new HashMap<>();
    drawnRound = 0;
    drawnAllFascist = 0;
    passedRound = 0;
    elections = new ArrayList<>();

  } // end initialize()

  private void updateReputation(String name, int repModifier) {
    if (reputationCarry.containsKey(name)) { // a Hard score with a fraction: clamp the whole of it
      shiftReputation(name, repModifier);
      return;
    }
    int newRep = playerReputation.get(name) + repModifier;
    newRep = Math.max(newRep, -MAX_REPUTATION);
    newRep = Math.min(newRep, MAX_REPUTATION);
    playerReputation.put(name, newRep);
  }

  /**
   * Adds {@code amount}, which may carry a fraction (Hard's rules that scale an amount), to
   * {@code name}'s whole score (its {@code playerReputation} plus its carry), clamped to [-5, 5]:
   * the nearest whole number goes to {@code playerReputation}, which every decision reads, and the
   * rest to the carry.
   */
  private void shiftReputation(String name, double amount) {
    double whole = playerReputation.get(name) + reputationCarry.getOrDefault(name, 0.0) + amount;
    whole = Math.max(-MAX_REPUTATION, Math.min(MAX_REPUTATION, whole));
    int rounded = (int) Math.round(whole);
    playerReputation.put(name, rounded);
    double carry = whole - rounded;
    if (carry == 0) {
      reputationCarry.remove(name);
    } else {
      reputationCarry.put(name, carry);
    }
  }

  /**
   * Allows the CpuPlayer to update assumptions after legislation is passed.
   * 
   * @param game
   */
  public void update(SecretHitlerGame game) {
    if (hardLiberal()) {
      clearedPlayers.observe(game);
    }
    if (skill == BotSkill.HARD) {
      // Hard's rule 4: every Hard CPU follows its peek to its end; one that reads the game blames.
      List<String> blamed = peekMemory.observe(game, myName);
      if (readsTheGame(game)) {
        for (String name : blamed) {
          shiftReputation(name, -PeekMemory.DROP);
        }
      }
    }
    if (readsTheGame(game)) {
      followTheDeck(game); // Hard's rule 5, after rule 4 has followed the peek
      rememberElection(game); // Hard's rule 3
    }
    if (game.getRound() > lastUpdatedRound && game.getState() == GameState.POST_LEGISLATIVE) {
      Policy.Type lastPolicy = game.getLastEnactedPolicy();

      if (lastPolicy == null || game.didElectionTrackerAdvance()) {
        return;
      }

      String lastPresident = game.getCurrentPresident();
      String lastChancellor = game.getCurrentChancellor();

      if (myName.equals(lastPresident)) {
        if (chancellorChoices.get(0) != chancellorChoices.get(1)) {
          // We tested the chancellor. Did they pass?
          if (game.getLastEnactedPolicy() == Policy.Type.FASCIST) {
            updateReputation(lastChancellor, -3);
          } else {
            updateReputation(lastChancellor, 3);
          }
        }
      } else if (myName.equals(lastChancellor)) {
      } else {
        // Update reputation for the chancellor and president based on what policy
        // was passed.
        int repModifier = lastPolicy == Policy.Type.LIBERAL ? 1 : -1;
        if (lastPresident == null || lastChancellor == null) {
          return;
        }
        if (lastPolicy == Policy.Type.FASCIST && readsTheGame(game)) {
          // Hard's rule 5: a fascist policy says less of a government the likelier an all-fascist hand.
          double unlikely = 1 - handAllFascist(game);
          shiftReputation(lastPresident, -unlikely);
          shiftReputation(lastChancellor, -unlikely);
          blameBackers(game, lastPresident, lastChancellor, unlikely); // Hard's rule 3
        } else {
          updateReputation(lastPresident, repModifier);
          updateReputation(lastChancellor, repModifier);
        }
      }

      lastUpdatedRound = game.getRound();
    }
  }

  /**
   * Hard's rule 5: what this CPU's seat sees of the deck. First, once a session it presided over
   * has ended with its chancellor's policy, the card its chancellor discarded is deduced from the
   * two it passed, unless the draw pile has grown since the last look (a reshuffle in the
   * enactment took that card back in). Then the look itself (a reshuffle brings the seen discards
   * back into the pool). Then, at its first look at a round's legislative session, the odds that
   * round's hand was all fascist: known from a peek it still holds (the peeked cards are this
   * hand), else worked out from the cards it cannot place.
   */
  private void followTheDeck(SecretHitlerGame game) {
    GameState state = game.getState();
    int round = game.getRound();
    if (passedRound != 0 && (passedRound != round || !inLegislativeSession(state))) {
      if (passedRound == round && !game.didElectionTrackerAdvance() && !deck.reshuffledSince(game.getDrawSize())) {
        deck.discarded(notEnacted(game.getLastEnactedPolicy()));
      }
      passedRound = 0;
    }
    deck.look(game.getDrawSize());
    if (inLegislativeSession(state) && drawnRound != round) {
      drawnRound = round;
      List<Policy.Type> peeked = peekMemory.cards();
      if (!peeked.isEmpty()) {
        drawnAllFascist = peeked.contains(Policy.Type.LIBERAL) ? 0 : 1;
      } else {
        drawnAllFascist = deck.allFascistHand(game.getNumLiberalPolicies(), game.getNumFascistPolicies());
      }
    }
  }

  /**
   * Hard's rule 3: records this round's election at the first look after its vote closes (any
   * state but a nomination, where the game still holds the last round's votes, and an open vote,
   * whose ballots no seat sees), once a round.
   */
  private void rememberElection(SecretHitlerGame game) {
    GameState state = game.getState();
    if (state == GameState.CHANCELLOR_NOMINATION || state == GameState.CHANCELLOR_VOTING
        || electionOf(game.getRound()) != null) {
      return;
    }
    elections.add(new Election(game.getRound(), game.getCurrentPresident(), game.getCurrentChancellor(),
        new TreeMap<>(game.getVotes())));
  }

  /** The election this CPU saw close in {@code round}, or null if it saw none. */
  private Election electionOf(int round) {
    for (int i = elections.size() - 1; i >= 0; i--) {
      if (elections.get(i).round() == round) {
        return elections.get(i);
      }
    }
    return null;
  }

  /**
   * Hard's rule 3: lowers every other living player who voted yes in this round's election, if
   * this CPU saw it close, by {@link #VOTE_DROP} times {@code unlikely} (rule 5's scale), so a forced
   * hand blames no one and repeated backing adds up. The government's two members, whom the
   * onlooker's drop already judges, and this CPU are left out.
   */
  private void blameBackers(SecretHitlerGame game, String president, String chancellor, double unlikely) {
    Election election = electionOf(game.getRound());
    if (election == null) {
      return;
    }
    for (Map.Entry<String, Boolean> vote : election.votes().entrySet()) {
      String voter = vote.getKey();
      if (vote.getValue() && !voter.equals(myName) && !voter.equals(president) && !voter.equals(chancellor)
          && game.getPlayer(voter).isAlive()) {
        shiftReputation(voter, -VOTE_DROP * unlikely);
      }
    }
  }

  /** Of the two cards this CPU passed as president, the one its chancellor did not enact. */
  private Policy.Type notEnacted(Policy.Type enacted) {
    return chancellorChoices.get(0) == enacted ? chancellorChoices.get(1) : chancellorChoices.get(0);
  }

  /**
   * Hard's rule 5: the chance this round's hand was all fascist, as this CPU saw it drawn, or, for
   * a round it never saw drawn (a backup restored mid-round), worked out from the board less the
   * fascist policy just enacted.
   */
  private double handAllFascist(SecretHitlerGame game) {
    if (drawnRound == game.getRound()) {
      return drawnAllFascist;
    }
    return deck.allFascistHand(game.getNumLiberalPolicies(), game.getNumFascistPolicies() - 1);
  }

  /**
   * Allows CpuPlayers to take an action, potentially updating the game state.
   * 
   * @return Returns true if the CPU took an action that updated the game state.
   */
  public boolean act(SecretHitlerGame game) {
    // Do nothing if this CpuPlayer is dead (no actions required).
    if (!myPlayerData.isAlive()) {
      return false;
    }

    switch (game.getState()) {
      case CHANCELLOR_NOMINATION:
        return handleChancellorNomination(game);
      case CHANCELLOR_VOTING:
        return handleChancellorVoting(game);
      case LEGISLATIVE_PRESIDENT:
        return handleLegislativePresident(game);
      case LEGISLATIVE_CHANCELLOR:
        return handleLegislativeChancellor(game);
      case LEGISLATIVE_PRESIDENT_VETO:
        return handlePresidentVeto(game);
      case PRESIDENTIAL_POWER_PEEK:
        return handlePresidentialPowerPeek(game);
      case PRESIDENTIAL_POWER_INVESTIGATE:
        return handlePresidentialPowerInvestigate(game);
      case PRESIDENTIAL_POWER_EXECUTION:
        return handlePresidentialPowerExecution(game);
      case PRESIDENTIAL_POWER_ELECTION:
        return handlePresidentialPowerElection(game);
      case POST_LEGISLATIVE:
        // Update our suspicion rating for the other players
        // president should end term
        return handlePostLegislative(game);
      default:
    }
    return false;
  } // end onUpdate

  private boolean isFascistInDanger(SecretHitlerGame game) {
    return game.getNumLiberalPolicies() >= 4;
  }

  private boolean isLiberalInDanger(SecretHitlerGame game) {
    return game.getNumFascistPolicies() >= 5;
  }

  private boolean canHitlerWinByElection(SecretHitlerGame game) {
    return game.getNumFascistPolicies() >= 3;
  }

  private List<Player> removePlayerFromList(String username, List<Player> playerList) {
    if (username == null) {
      return playerList;
    }

    List<Player> ret = new ArrayList<Player>(playerList);
    Iterator<Player> itr = ret.iterator();
    while (itr.hasNext()) {
      if (itr.next().getUsername().equals(username)) {
        itr.remove();
      }
    }
    return ret;
  }

  private List<Player> removeDeadPlayersAndSelf(List<Player> playerList) {
    List<Player> ret = new ArrayList<Player>(playerList);
    Iterator<Player> itr = ret.iterator();
    while (itr.hasNext()) {
      Player curr = itr.next();
      if (curr.getUsername().equals(myName) || !curr.isAlive()) {
        itr.remove();
      }
    }
    return ret;
  }

  private boolean handleChancellorNomination(SecretHitlerGame game) {
    // No action required if we are not president
    if (!game.getCurrentPresident().equals(myName)) {
      return false;
    }
    boolean mistake = mistake();

    List<Player> playerList = game.getPlayerList();

    // Remove the chancellor and optionally the president
    playerList = removePlayerFromList(game.getLastChancellor(), playerList);
    if (game.getLivingPlayerCount() > 5) {
      playerList = removePlayerFromList(game.getLastPresident(), playerList);
    }
    playerList = removeDeadPlayersAndSelf(playerList);

    // Nominate a chancellor using a weighted random, based on our role and the
    // current game state. Keep trying until game state has advanced past
    // nomination.
    String chancellorName = null;

    // Choose chancellor nominee using weighted random
    if (mistake) { // Easy: any eligible player
      chancellorName = anyOf(playerList).getUsername();
    } else if (myPlayerData.getIdentity() == Identity.FASCIST) {
      if (canHitlerWinByElection(game)) { // Increase likelihood of choosing hitler
        chancellorName = chooseRandomPlayerWeighted(playerList, 0.35f, 1.5f, 0.15f, 0.05f);
      } else {
        chancellorName = chooseRandomPlayerWeighted(playerList, 1f, 0.25f, 0.5f, 0.25f);
      }
    } else if (myPlayerData.getIdentity() == Identity.HITLER) {
      // Target liberal players to increase trust
      chancellorName = chooseRandomPlayerWeighted(playerList, 0.5f, 0, 1, 0.25f);
    } else { // Liberal
      // Hard's rule 1: a cleared player weighs more (only the eligible are in the list).
      ToDoubleFunction<String> factor = hardLiberal() ? clearedPlayers::nominationFactor : NO_FACTOR;
      if (canHitlerWinByElection(game)) { // Avoid hitler or fascist players.
        chancellorName = chooseRandomPlayerWeighted(playerList, 0.01f, 0, 1, 0.05f, factor);
      } else { // Less drastic avoidance of F/H players
        chancellorName = chooseRandomPlayerWeighted(playerList, 0.01f, 0, 1, 0.1f, factor);
      }
    }

    game.nominateChancellor(chancellorName);
    return true;

    // Handle checks for whether the player is eligible
  }

  private void voteWithProbability(SecretHitlerGame game, float yesProbability) {
    double t = random.nextDouble();
    boolean vote = t <= yesProbability;
    game.registerVote(myName, vote);
  }

  /**
   * Gets the player reputation, setting to min/max value if identity is known.
   */
  private int getPlayerReputationWithIdentity(String playerName) {
    int reputation = playerReputation.get(playerName);
    if (knownPlayerRoles.containsKey(playerName)) {
      if (isFascistSide(knownPlayerRoles.get(playerName))) {
        reputation = -1 * MAX_REPUTATION;
      } else {
        reputation = MAX_REPUTATION;
      }
    }
    return reputation;
  }

  private boolean handleChancellorVoting(SecretHitlerGame game) {
    // Check that we haven't already voted
    if (game.hasPlayerVoted(myName)) {
      return false;
    }
    boolean mistake = mistake();
    if (mistake) { // Easy: ja or nein at random
      game.registerVote(myName, anyOf(List.of(true, false)));
      return true;
    }
    Optional<Boolean> cleared = clearedVote(game);
    if (cleared.isPresent()) { // Hard's rule 1 decides, with no draw
      game.registerVote(myName, cleared.get());
      return true;
    }
    voteWithProbability(game, chanceOfYes(game));
    return true;
  }

  /**
   * Hard's rule 1's vote on the open election, or empty where it leaves the vote to Normal's (and
   * always below Hard, or for a CPU not dealt Liberal).
   */
  private Optional<Boolean> clearedVote(SecretHitlerGame game) {
    if (!hardLiberal()) {
      return Optional.empty();
    }
    return clearedPlayers.vote(game, getPlayerReputationWithIdentity(game.getCurrentChancellor()), knownPlayerRoles);
  }

  /**
   * The chance this CPU votes yes on the open election, as each voting path works it out: rule 1's
   * ja as 1 and its nein as 0 (a Hard liberal), then the fascist side's vote for Hitler's winning
   * election, the fascist side's mix of its known roles, or the trust curve and its untrusted vote.
   * Easy's coin comes before it and is not part of it.
   */
  float chanceOfYes(SecretHitlerGame game) {
    Optional<Boolean> cleared = clearedVote(game);
    if (cleared.isPresent()) {
      return cleared.get() ? 1f : 0f;
    }

    Identity myId = myPlayerData.getIdentity();
    String chancellor = game.getCurrentChancellor();
    String president = game.getCurrentPresident();
    // Determine reputation level for the nominated players.
    int presidentRep = getPlayerReputationWithIdentity(president);
    int chancellorRep = getPlayerReputationWithIdentity(chancellor);

    // Modify reputation if we're hitler and part of the legislation.
    // (basically, treat ourselves as though we're liberal.)
    if (myId == Identity.HITLER) {
      if (myName.equals(president)) {
        presidentRep = MAX_REPUTATION;
      } else if (myName.equals(chancellor)) {
        chancellorRep = MAX_REPUTATION;
      }
    }

    int combinedRep = presidentRep + chancellorRep;

    // Normalize combined reputation to a [0,1] range
    float t = (combinedRep + 2 * MAX_REPUTATION) / (4f * MAX_REPUTATION);

    // Fascists should vote for win condition almost always
    if (myPlayerData.isFascist() && canHitlerWinByElection(game)
        && game.getPlayer(chancellor).isHitler()) {
      return 0.99f;
    }

    // Fascist voting behavior (+hitler if fascists are in danger)
    if (myId == Identity.FASCIST || (myId == Identity.HITLER && isFascistInDanger(game))) {
      // Vote with some randomness because fascists know the roles of every
      // other player.
      // t will either be 0, 0.5, or 1.0, depending on which roles
      // are elected. Weight the scale slightly more towards fascist players.
      float fascistVoteProbability = 0.8f;
      float liberalVoteProbability = 0.6f;

      // Update these values if we're in danger
      if (isFascistInDanger(game)) {
        fascistVoteProbability = 0.9f;
        liberalVoteProbability = 0.25f;
      }
      return withTracker(game, t * liberalVoteProbability + (1f - t) * fascistVoteProbability, false);
    }

    // DEFAULT voting behavior for liberals + hitler:
    // Use an individual AND combined trust threshold, which get higher when
    // fascists can win by electing hitler.
    int minIndividualRep = -3; // Avoid players with bad rep.
    int minCombinedRep = -2; // Avoid players if they have a bad combined rep.

    if (canHitlerWinByElection(game)) { // Tighten thresholds
      minIndividualRep = -2;
      minCombinedRep = -1;
    }

    if (presidentRep < minIndividualRep || chancellorRep < minIndividualRep || combinedRep < minCombinedRep) {
      // This legislation is untrustworthy and should probably not be voted for.
      return withTracker(game, 0.05f, false);
    }
    // Scale probability of voting yes with the reputation of the players.
    // Use a parabolic curve that's more likely to say yes to neutral or
    // unknown values: f(t) = 2t - t^2
    // f(0) = 0, f(0.5) = 0.75, f(1) = 1
    return withTracker(game, 2f * t - (t * t), true);
  }

  /**
   * Hard's rule 6 on a yes chance: with two failed elections, a third enacts the top card. A Hard
   * liberal moves its chance on the trusting path ({@code trusting}) {@link #LIBERAL_TRACKER_PUSH}
   * of the way to certain yes, and keeps its untrusted chance; the Hard fascist side (fascists, and
   * Hitler at every size) drops {@link #FASCIST_TRACKER_PULL} of its chance for a government with
   * no member it knows is on its side, itself included. Below Hard, or at any other tracker, the
   * chance is as it was.
   */
  private float withTracker(SecretHitlerGame game, float chance, boolean trusting) {
    if (skill != BotSkill.HARD || game.getElectionTracker() != SecretHitlerGame.MAX_FAILED_ELECTIONS - 1) {
      return chance;
    }
    if (myPlayerData.getIdentity() == Identity.LIBERAL) {
      return trusting ? chance + LIBERAL_TRACKER_PUSH * (1f - chance) : chance;
    }
    if (isFascistSide(knownPlayerRoles.get(game.getCurrentPresident()))
        || isFascistSide(knownPlayerRoles.get(game.getCurrentChancellor()))) {
      return chance;
    }
    return chance * (1f - FASCIST_TRACKER_PULL);
  }

  /**
   * Gets the index of the first policy of a matching type, if it exists.
   * Returns -1 otherwise.
   */
  private int tryGetIndexOfPolicy(List<Policy> policies, Policy.Type type) {
    for (int i = 0; i < policies.size(); i++) {
      Policy policy = policies.get(i);
      if (policy.getType() == type) {
        return i;
      }
    }
    return -1;
  }

  private boolean handleLegislativePresident(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false; // We are not president, no action required
    }
    boolean mistake = mistake();

    List<Policy> policies = game.getPresidentLegislativeChoices();
    int policyIndexToRemove;
    if (mistake) { // Easy: any of the three cards
      policyIndexToRemove = anyOf(List.of(0, 1, 2));
    } else if (countOf(policies, Policy.Type.FASCIST) == 2
        && bluffs(game, game.getCurrentChancellor(), PRESIDENT_BLUFF_CHANCE)) {
      // Hard's rule 7: discard a fascist, so the liberal chancellor holds one of each.
      policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.FASCIST);
    } else { // Normal's choice
      policyIndexToRemove = normalDiscard(game, policies);
    }

    // Track what choices we gave the chancellor.
    chancellorChoices = new ArrayList<>();
    for (Policy policy : policies) {
      chancellorChoices.add(policy.getType());
    }
    chancellorChoices.remove(policyIndexToRemove);

    if (readsTheGame(game)) { // Hard's rule 5: the card it discards, and the two it passes
      deck.discarded(policies.get(policyIndexToRemove).getType());
      passedRound = game.getRound();
    }
    game.presidentDiscardPolicy(policyIndexToRemove);
    return true;
  }

  /** The card a Normal president discards from {@code policies}, by its index. */
  private int normalDiscard(SecretHitlerGame game, List<Policy> policies) {
    // Count the number of fascist and liberal policies
    int fascistPolicyCount = 0;
    for (Policy policy : policies) {
      if (policy.getType() == Policy.Type.FASCIST) {
        fascistPolicyCount++;
      }
    }
    int liberalPolicyCount = SecretHitlerGame.PRESIDENT_DRAW_SIZE - fascistPolicyCount;

    // Choose a policy to discard
    int policyIndexToRemove = 0;

    // Check if the policy deck is all of one card type. If so, choose any to
    // discard, since there is essentially no choice to make.
    Identity myId = myPlayerData.getIdentity();
    if (fascistPolicyCount == SecretHitlerGame.PRESIDENT_DRAW_SIZE
        || liberalPolicyCount == SecretHitlerGame.PRESIDENT_DRAW_SIZE) {
      policyIndexToRemove = 0;

    } else if (fascistPolicyCount == 1) { // One fascist, two liberal policies
      if (myId == Identity.FASCIST) {
        // Discard one of the liberal policies
        policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL);
      } else if (myId == Identity.HITLER) {
        if (isFascistInDanger(game)) {
          // Don't let liberals win by policy election
          policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL);
        } else {
          // Choose random policy
          policyIndexToRemove = random.nextInt(SecretHitlerGame.PRESIDENT_DRAW_SIZE);
        }

      } else { // Liberal
        if (isLiberalInDanger(game)) {
          // Don't give choices if in danger.
          policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.FASCIST);
        } else {
          // Choose a random policy to discard
          policyIndexToRemove = random.nextInt(SecretHitlerGame.PRESIDENT_DRAW_SIZE);
        }
      }

    } else if (fascistPolicyCount == 2) { // Two fascist, one liberal policy
      if (myId == Identity.FASCIST) {
        // Discard the liberal policy
        policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL);
      } else if (myId == Identity.HITLER) {
        if (isFascistInDanger(game)) {
          // Don't let liberals win by policy election
          policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL);
        } else {
          // Choose a random policy to discard
          policyIndexToRemove = random.nextInt(SecretHitlerGame.PRESIDENT_DRAW_SIZE);
        }
      } else {
        // Liberals should always discard the fascist policy
        policyIndexToRemove = tryGetIndexOfPolicy(policies, Policy.Type.FASCIST);
      }
    }
    return policyIndexToRemove;
  }

  private boolean handleLegislativeChancellor(SecretHitlerGame game) {
    if (!myName.equals(game.getCurrentChancellor())) {
      return false;
    }
    boolean mistake = mistake();

    Identity myId = myPlayerData.getIdentity();
    List<Policy> policies = game.getChancellorLegislativeChoices();
    // Hard's rule 2: what the two cards say of the president, read once a session, whatever
    // this CPU then does with them.
    if (readsTheGame(game) && handReadRound != game.getRound()) {
      handReadRound = game.getRound();
      double change = ChancellorHand.presidentChange(policies, chancellorHandDrop(game));
      if (change != 0) {
        shiftReputation(game.getCurrentPresident(), change);
      }
    }
    // Veto can't re-occur
    boolean canVeto = game.getNumFascistPolicies() == 5 && !game.didVetoOccurThisTurn();

    if (mistake) { // Easy: either card, or a veto where one may be asked for
      List<Runnable> moves = new ArrayList<>();
      moves.add(() -> enact(game, policies, 0));
      moves.add(() -> enact(game, policies, 1));
      if (canVeto) {
        moves.add(game::chancellorVeto);
      }
      anyOf(moves).run();
      return true;
    }

    if (policies.get(0).getType() == policies.get(1).getType()) {
      // Both policies are the same.
      Policy.Type policyType = policies.get(0).getType();
      if (canVeto && policyType == Policy.Type.FASCIST && myId == Identity.LIBERAL) {
        // We are liberal and there are two fascist policies, so we should veto.
        game.chancellorVeto();
        return true;
      } else if (canVeto && policyType == Policy.Type.LIBERAL && myPlayerData.isFascist()) {
        // Check if our president is a known fascist/hitler. If so, we can pull
        // off a veto with them.
        String president = game.getCurrentPresident();
        if (isFascistSide(knownPlayerRoles.get(president))) {
          game.chancellorVeto();
          return true;
        }
      }
      // Otherwise, enact one of them because the order doesn't matter
      enact(game, policies, 0);
    } else {
      // One Liberal and one fascist policy, so decide based on role
      if (myId == Identity.FASCIST) {
        // Fascists should always try and pass more fascist policies, unless a Hard one bluffs
        // (rule 7) to a liberal president.
        boolean bluff = bluffs(game, game.getCurrentPresident(), CHANCELLOR_BLUFF_CHANCE);
        enact(game, policies, tryGetIndexOfPolicy(policies, bluff ? Policy.Type.LIBERAL : Policy.Type.FASCIST));
      } else if (myId == Identity.HITLER) {
        if (isFascistInDanger(game)) {
          // Don't pass liberal policies if fascists are in danger of losing from them
          enact(game, policies, tryGetIndexOfPolicy(policies, Policy.Type.FASCIST));
        } else {
          // preferentially choose liberal policies to gain trust
          enact(game, policies, tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL));
        }
      } else { // Liberal
        enact(game, policies, tryGetIndexOfPolicy(policies, Policy.Type.LIBERAL));
      }
    }
    return true;
  }

  /**
   * Enacts {@code policies}' card at {@code index} as chancellor; a Hard CPU that reads the game
   * first notes the other card, which goes to the discard pile (rule 5).
   */
  private void enact(SecretHitlerGame game, List<Policy> policies, int index) {
    if (readsTheGame(game)) {
      deck.discarded(policies.get(1 - index).getType());
    }
    game.chancellorEnactPolicy(index);
  }

  private boolean handlePresidentVeto(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false; // We are not president, no action required
    }

    boolean mistake = mistake();

    Identity myId = myPlayerData.getIdentity();
    List<Policy> policies = game.getChancellorLegislativeChoices();
    String chancellor = game.getCurrentChancellor();

    // What the chancellor's cards say of them is learned whatever the answer:
    // an Easy mistake changes only the answer.
    boolean allowVeto;
    int repModifier = 0;
    // Check if policies are the same
    if (policies.get(0).getType() == policies.get(1).getType()) {
      Policy.Type policyType = policies.get(0).getType();
      if (myId == Identity.LIBERAL) {
        // Allow veto for fascist policies, deny for liberal policies
        allowVeto = policyType == Policy.Type.FASCIST;
        repModifier = allowVeto ? 4 : -4;
      } else { // Fascists and hitler should do the inverse
        allowVeto = policyType == Policy.Type.LIBERAL;
      }
    } else { // 1 F, 1 L
      // No reason to veto since chancellor has a choice
      allowVeto = false;
      repModifier = -1;
    }
    if (mistake) { // Easy: accept or refuse at random
      allowVeto = anyOf(List.of(true, false));
    }
    if (allowVeto && readsTheGame(game)) { // Hard's rule 5: both cards go to the discard pile
      for (Policy policy : policies) {
        deck.discarded(policy.getType());
      }
    }
    game.presidentialVeto(allowVeto);
    if (repModifier != 0) {
      updateReputation(chancellor, repModifier);
    }
    return true;
  }

  private boolean handlePresidentialPowerPeek(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false;
    }
    List<Policy> peek = game.getPeek();
    if (skill == BotSkill.HARD) { // Hard's rule 4: keep the cards (thrown away below Hard)
      peekMemory.saw(peek, game.getDrawSize());
    }
    game.endPeek();
    return true;
  }

  private boolean handlePresidentialPowerInvestigate(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false;
    }
    boolean mistake = mistake();
    // Pick once, among the players who may be investigated.
    List<Player> targets = investigationTargets(game);
    String selectedPlayer;
    if (mistake) { // Easy: any of them
      selectedPlayer = anyOf(targets).getUsername();
    } else if (myPlayerData.getIdentity() == Identity.LIBERAL) {
      selectedPlayer = chooseRandomPlayerWeighted(targets, 1f, 0, -0.4f, 0.5f);
    } else {
      // Totally randomize selection
      selectedPlayer = chooseRandomPlayerWeighted(targets, 1f, 1f, 1f, 0.5f);
    }
    // Update known roles using the investigated role
    knownPlayerRoles.put(selectedPlayer, game.investigatePlayer(selectedPlayer));
    return true;
  }

  private boolean handlePresidentialPowerElection(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false;
    }
    boolean mistake = mistake();
    String selectedPlayer = "";
    // Liberals should avoid suspicious players, while fascists should
    // slightly avoid liberals. For both, preferentially choose players.
    List<Player> playerList = removeDeadPlayersAndSelf(game.getPlayerList());
    if (mistake) { // Easy: any living player but itself
      selectedPlayer = anyOf(playerList).getUsername();
    } else if (myPlayerData.getIdentity() == Identity.LIBERAL) {
      selectedPlayer = chooseRandomPlayerWeighted(playerList, -0.8f, 0, 1f, 0.5f);
    } else {
      selectedPlayer = chooseRandomPlayerWeighted(playerList, 1f, 1f, 0.5f, 0.5f);
    }
    game.electNextPresident(selectedPlayer);
    return true;
  }

  private boolean handlePresidentialPowerExecution(SecretHitlerGame game) {
    if (!game.getCurrentPresident().equals(myName)) {
      return false;
    }

    boolean mistake = mistake();
    // Pick once, among the players who may be executed: never a known teammate.
    List<Player> targets = executionTargets(game);
    String selectedPlayer;
    if (mistake) { // Easy: any of them, so still never a known teammate
      selectedPlayer = anyOf(targets).getUsername();
    } else if (myPlayerData.getIdentity() == Identity.LIBERAL) {
      // Aim for fascist or suspicious players
      // TODO: Keep a pool of players that are tested/untested for hitler role?
      selectedPlayer = chooseRandomPlayerWeighted(targets, 1f, 1f, -0.4f, 0);
    } else {
      selectedPlayer = chooseRandomPlayerWeighted(targets, 0.5f, 0, 1f, 0);
    }
    game.executePlayer(selectedPlayer);
    return true;
  }

  /**
   * The players this CPU may investigate: living, not itself, and not
   * investigated before.
   */
  private List<Player> investigationTargets(SecretHitlerGame game) {
    List<Player> targets = new ArrayList<>();
    for (Player player : removeDeadPlayersAndSelf(game.getPlayerList())) {
      if (!player.hasBeenInvestigated()) {
        targets.add(player);
      }
    }
    return targets;
  }

  /**
   * The players this CPU may execute: living and not itself. A fascist or Hitler
   * also leaves out every player it knows to be on its side (a fascist knows
   * them all; Hitler at 5 or 6 does too, and at 7 or more only those it
   * investigated).
   */
  private List<Player> executionTargets(SecretHitlerGame game) {
    List<Player> targets = new ArrayList<>();
    for (Player player : removeDeadPlayersAndSelf(game.getPlayerList())) {
      if (myPlayerData.isFascist() && isFascistSide(knownPlayerRoles.get(player.getUsername()))) {
        continue; // a known teammate
      }
      targets.add(player);
    }
    return targets;
  }

  /** How many of {@code policies} are of {@code type}. */
  private static int countOf(List<Policy> policies, Policy.Type type) {
    int count = 0;
    for (Policy policy : policies) {
      if (policy.getType() == type) {
        count++;
      }
    }
    return count;
  }

  /**
   * Hard's rule 7: whether this CPU bluffs now, with {@code other} in the other office. Only a Hard
   * fascist (Hitler keeps its play) with fewer than 3 fascist and fewer than 4 liberal policies down
   * (a bluff then could hand the liberals their fifth), and {@code other} known to be liberal (a
   * teammate gets no bluff), draws: then it bluffs with {@code chance}. No other path draws.
   */
  private boolean bluffs(SecretHitlerGame game, String other, double chance) {
    if (skill != BotSkill.HARD || myPlayerData.getIdentity() != Identity.FASCIST
        || canHitlerWinByElection(game) || isFascistInDanger(game)
        || knownPlayerRoles.get(other) != Identity.LIBERAL) {
      return false;
    }
    return random.nextDouble() < chance;
  }

  /** Whether a known role is on the fascist side (a fascist or Hitler); false for null. */
  static boolean isFascistSide(Identity role) {
    return role == Identity.FASCIST || role == Identity.HITLER;
  }

  /**
   * Whether {@code state} is part of a legislative session: an election has passed and the
   * government has not yet enacted (or vetoed), so no policy has been enacted since the election.
   */
  static boolean inLegislativeSession(GameState state) {
    return state == GameState.LEGISLATIVE_PRESIDENT || state == GameState.LEGISLATIVE_CHANCELLOR
        || state == GameState.LEGISLATIVE_PRESIDENT_VETO;
  }

  /**
   * Whether this decision is an Easy mistake: only an Easy CPU draws, once the
   * decision is its own and before anything else, so Normal's and Hard's draws
   * are as they were before levels.
   */
  private boolean mistake() {
    return skill == BotSkill.EASY && random.nextDouble() < EASY_MISTAKE_CHANCE;
  }

  /** One of {@code moves}, each equally likely. */
  private <T> T anyOf(List<T> moves) {
    return moves.get(random.nextInt(moves.size()));
  }

  /** Whether this CPU runs Hard's rule 1: a Hard CPU dealt Liberal. */
  private boolean hardLiberal() {
    return skill == BotSkill.HARD && myPlayerData.getIdentity() == Identity.LIBERAL;
  }

  /**
   * Whether this CPU's role shows it every other role: a fascist does, and Hitler at a table of 5
   * or 6.
   */
  private boolean knowsEveryRole(SecretHitlerGame game) {
    Identity role = myPlayerData.getIdentity();
    return role == Identity.FASCIST || (role == Identity.HITLER && game.getPlayerList().size() <= 6);
  }

  /**
   * Whether this CPU runs the Hard rules that read the game (rule 2, and rule 4's blame): a Hard
   * CPU that does not know every role, so a liberal, or Hitler at 7 or more.
   */
  private boolean readsTheGame(SecretHitlerGame game) {
    return skill == BotSkill.HARD && !knowsEveryRole(game);
  }

  /**
   * How far rule 2's two fascist cards lower the president, scaled by rule 5: by the chance the
   * card the president discarded was liberal, from the cards this CPU cannot place (a liberal
   * president dealt three fascists had to pass two).
   */
  private double chancellorHandDrop(SecretHitlerGame game) {
    return ChancellorHand.FF_DROP * deck.liberalThirdCard(game.getNumLiberalPolicies(), game.getNumFascistPolicies());
  }

  private boolean handlePostLegislative(SecretHitlerGame game) {
    if (game.getCurrentPresident().equals(myName)) {
      game.endPresidentialTerm();
      return true;
    }
    return false;
  }

  /**
   * Returns the name of a player, chosen by weighted random. Weighting is
   * determined by suspected or known roles, and can be biased towards or away
   * from users.
   * 
   * If a player's role is unknown, the weight will be calculated based
   * on the strength of their reputation, interpolated between the fascist and
   * liberal role weights.
   * 
   * Only the list's living players other than this CPU can be chosen. Each is
   * chosen in proportion to its weight: a weight of 0 (or less) is never chosen,
   * unless every weight is 0, and then each is equally likely.
   * 
   * @param playerList    : List of players to traverse.
   * @param fascistWeight : Relative weight assigned to known or suspected
   *                      fascist players. Higher values mean the player is
   *                      more likely to be chosen.
   * @param hitlerWeight  : Used only if Hitler identity is known. (relevant
   *                      only for fascist players.)
   * @param liberalWeight : Relative weight assigned to known or suspected
   *                      liberal players.
   * @param userBias      : How much selection should be biased towards non-CPU
   *                      players, relative. Positive values increase likelihood
   *                      that players are chosen.
   * @return The name of a player, chosen by weighted random.
   * @throws IllegalArgumentException if the list holds no living player other
   *                                  than this CPU.
   */
  public String chooseRandomPlayerWeighted(List<Player> playerList,
      float fascistWeight, float hitlerWeight, float liberalWeight,
      float userBias) {
    return chooseRandomPlayerWeighted(playerList, fascistWeight, hitlerWeight, liberalWeight, userBias, NO_FACTOR);
  }

  /**
   * {@link #chooseRandomPlayerWeighted(List, float, float, float, float)}, with each eligible
   * player's weight then multiplied by {@code factor} of their name (after the clamp, so a weight
   * of 0 stays 0).
   */
  private String chooseRandomPlayerWeighted(List<Player> playerList,
      float fascistWeight, float hitlerWeight, float liberalWeight,
      float userBias, ToDoubleFunction<String> factor) {

    // Only living players other than this CpuPlayer can be chosen.
    List<Player> eligible = removeDeadPlayersAndSelf(playerList);
    if (eligible.isEmpty()) {
      throw new IllegalArgumentException("There is no living player other than " + myName + " to choose.");
    }

    // Traverse the eligible players, calculating weight for each player based on
    // known or suspected roles
    float[] weights = new float[eligible.size()];
    for (int i = 0; i < eligible.size(); i++) {
      Player currPlayer = eligible.get(i);
      String currPlayerName = currPlayer.getUsername();
      float currWeight;

      if (knownPlayerRoles.containsKey(currPlayerName)) { // Role is known
        Identity currId = knownPlayerRoles.get(currPlayerName);
        if (currId == Identity.FASCIST) {
          currWeight = fascistWeight;
        } else if (currId == Identity.HITLER) {
          currWeight = hitlerWeight;
        } else {
          currWeight = liberalWeight;
        }
      } else { // Role unknown
        // Normalize suspicion value to [0, 1] range, where 0 is fascist.
        int reputation = playerReputation.get(currPlayerName);
        float t = (reputation + MAX_REPUTATION) / (2f * MAX_REPUTATION);
        // Interpolate between fascist and liberal weights.
        currWeight = t * liberalWeight + (1f - t) * fascistWeight;
      }

      // Add player biases
      if (!currPlayer.isCpu()) {
        currWeight += userBias;
      }

      // Clamp weight so there are no negative values, and treat a weight that
      // is all but 0 as 0.
      currWeight = Math.max(currWeight, 0f);
      if (currWeight < 0.000001f) {
        currWeight = 0f;
      }
      weights[i] = (float) (currWeight * factor.applyAsDouble(currPlayerName));
    } // end for

    return eligible.get(getWeightedRandomIndex(weights, random.nextDouble())).getUsername();
  } // end chooseRandomPlayerWeighted()

  /**
   * Picks an index in proportion to its weight. A weight at or below 0 counts as
   * 0 and is never picked, unless every weight is 0: then the draw is split
   * evenly among the indices.
   * 
   * @param weights the weights, one per index.
   * @param draw    a number in [0, 1), such as {@code Random.nextDouble()}.
   * @return the first index whose running total of weights (summed in double)
   *         exceeds {@code draw} times the total weight, or the last index with a
   *         positive weight if rounding leaves none; with every weight 0,
   *         {@code min((int) (draw * length), length - 1)}.
   * @throws IllegalArgumentException if {@code weights} is empty.
   */
  static int getWeightedRandomIndex(float[] weights, double draw) {
    if (weights.length == 0) {
      throw new IllegalArgumentException("There is nothing to choose from.");
    }
    double totalWeight = 0;
    int lastWeighted = -1;
    for (int i = 0; i < weights.length; i++) {
      if (weights[i] > 0f) {
        totalWeight += weights[i];
        lastWeighted = i;
      }
    }
    if (lastWeighted == -1) { // every weight is 0
      return Math.min((int) (draw * weights.length), weights.length - 1);
    }

    double target = draw * totalWeight;
    double runningTotal = 0;
    for (int i = 0; i < weights.length; i++) {
      if (weights[i] > 0f) {
        runningTotal += weights[i];
        if (runningTotal > target) {
          return i;
        }
      }
    }
    return lastWeighted; // the draw rounded up to the total
  }

  @Override
  public int compareTo(CpuPlayer o) {
    return this.myName.compareTo(((CpuPlayer) o).myName);
  }

  private void readObject(java.io.ObjectInputStream in) throws IOException, ClassNotFoundException {
    in.defaultReadObject();
    random = new Random();
    if (skill == null) { // backed up before bots had levels
      skill = BotSkill.NORMAL;
    }
    if (clearedPlayers == null) { // backed up before Hard's rule 1
      clearedPlayers = new ClearedPlayers();
    }
    if (peekMemory == null) { // backed up before Hard's rule 4
      peekMemory = new PeekMemory();
    }
    if (deck == null) { // backed up before Hard's rule 5
      deck = new DeckOdds();
    }
    if (reputationCarry == null) { // backed up before scores carried fractions
      reputationCarry = new HashMap<>();
    }
    if (elections == null) { // backed up before Hard's rule 3
      elections = new ArrayList<>();
    }
  }

} // end CpuPlayer
