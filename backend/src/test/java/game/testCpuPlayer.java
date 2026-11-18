package game;

import game.datastructures.Identity;
import game.datastructures.Player;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.Timeout;
import static junit.framework.TestCase.*;
import static org.junit.Assert.assertNotEquals;

import java.io.ObjectStreamClass;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.commons.lang3.SerializationUtils;
import server.GameDriver;

public class testCpuPlayer {
  static int ITERATIONS = 100000;
  /** How far a player's share of the picks may be from its weight's share. */
  static final double TOLERANCE = 0.01;

  @Rule
  public Timeout globalTimeout = Timeout.seconds(100);

  private ArrayList<String> makePlayers(int numPlayers) {
    ArrayList<String> out = new ArrayList<>();
    for (int i = 0; i < numPlayers; i++) {
      out.add(Integer.toString(i));
    }
    return out;
  }

  private String getPlayerOfIdentity(SecretHitlerGame game, Identity id) {
    for (Player player : game.getPlayerList()) {
      if (player.getIdentity() == id) {
        return player.getUsername();
      }
    }
    return null;
  }

  /**
   * A game of {@link #makePlayers} seats in {@code state} whose president was dealt
   * {@code presidentRole}: a new game for {@code CHANCELLOR_NOMINATION}, otherwise one played
   * there by {@link GameDriver#playUntil}. A game that ends first is skipped.
   */
  private SecretHitlerGame gameAt(int seats, GameState state, Identity presidentRole) {
    for (int attempt = 0; attempt < 200; attempt++) {
      SecretHitlerGame game = new SecretHitlerGame(makePlayers(seats));
      if (state != GameState.CHANCELLOR_NOMINATION) {
        try {
          GameDriver.playUntil(game, state);
        } catch (IllegalStateException endedFirst) {
          continue;
        }
      }
      if (game.getState() == state
          && game.getPlayer(game.getCurrentPresident()).getIdentity() == presidentRole) {
        return game;
      }
    }
    fail("No game of " + seats + " reached " + state + " with a " + presidentRole + " president in 200 games.");
    return null;
  }

  /** A copy of the game, so each pick starts from the same state. */
  private static SecretHitlerGame copyOf(SecretHitlerGame game) {
    return SerializationUtils.clone(game);
  }

  /** A CPU player for the game's president, initialized. */
  private static CpuPlayer presidentBot(SecretHitlerGame game) {
    CpuPlayer bot = new CpuPlayer(game.getCurrentPresident());
    bot.initialize(game);
    return bot;
  }

  /** The seats other than {@code name}'s, in seat order. */
  private static List<String> othersThan(SecretHitlerGame game, String name) {
    List<String> others = new ArrayList<>();
    for (Player player : game.getPlayerList()) {
      if (!player.getUsername().equals(name)) {
        others.add(player.getUsername());
      }
    }
    return others;
  }

  /**
   * Each expected name's share of all the picks is within {@link #TOLERANCE} of its expected
   * share, and no other name was picked.
   */
  private static void assertShares(Map<String, Integer> picks, Map<String, Double> expected) {
    int total = 0;
    for (Map.Entry<String, Integer> pick : picks.entrySet()) {
      assertTrue("picked " + pick.getKey() + ", who should never be picked: " + picks,
          expected.containsKey(pick.getKey()));
      total += pick.getValue();
    }
    for (Map.Entry<String, Double> share : expected.entrySet()) {
      double actual = picks.getOrDefault(share.getKey(), 0) / (double) total;
      assertEquals("the share of " + share.getKey() + " in " + picks, share.getValue(), actual, TOLERANCE);
    }
  }

  /**
   * Runs {@code body} on a daemon thread and fails with {@code whatNeverEnded} if it has not
   * returned within {@code seconds}: a loop that never ends then fails the test, and the daemon
   * thread lets the test JVM exit. What the body throws is thrown here.
   */
  private static void endsWithin(int seconds, String whatNeverEnded, Runnable body) throws Throwable {
    AtomicReference<Throwable> thrown = new AtomicReference<>();
    Thread thread = new Thread(() -> {
      try {
        body.run();
      } catch (Throwable t) {
        thrown.set(t);
      }
    });
    thread.setDaemon(true);
    thread.start();
    thread.join(seconds * 1000L);
    if (thread.isAlive()) {
      fail(whatNeverEnded);
    }
    if (thrown.get() != null) {
      throw thrown.get();
    }
  }

  private static void expectIllegalArgument(Runnable call) {
    try {
      call.run();
      fail("expected an IllegalArgumentException");
    } catch (IllegalArgumentException expected) {
      // as expected
    }
  }

  /**
   * Backups hold CPU players, so the class keeps the UID Java computed for it
   * before it was pinned (the value both backup fixtures' CPU players carry).
   */
  @Test
  public void cpuPlayerPinsItsSerialVersionUid() throws NoSuchFieldException {
    Field field = CpuPlayer.class.getDeclaredField("serialVersionUID");
    int modifiers = field.getModifiers();
    assertTrue(Modifier.isPrivate(modifiers));
    assertTrue(Modifier.isStatic(modifiers));
    assertTrue(Modifier.isFinal(modifiers));
    assertEquals(long.class, field.getType());
    assertEquals(2392054316009854878L,
        ObjectStreamClass.lookup(CpuPlayer.class).getSerialVersionUID());
  }

  @Test
  public void testSelectingRandomPlayerDoesNotChooseSelf() {
    List<String> players = makePlayers(5);
    SecretHitlerGame game = new SecretHitlerGame(players);

    CpuPlayer cpu = new CpuPlayer(players.get(0));
    cpu.initialize(game);

    for (int i = 0; i < ITERATIONS; i++) {
      String selectedName = cpu.chooseRandomPlayerWeighted(game.getPlayerList(),
          1f,
          1f,
          1f,
          0f);
      assertNotNull(selectedName);
      assertNotEquals(cpu.myName, selectedName);
    }
  }

  @Test
  public void testSelectingRandomPlayersChoosesAll() {
    int numPlayers = 10;
    List<String> players = makePlayers(10);
    SecretHitlerGame game = new SecretHitlerGame(players);

    CpuPlayer cpu = new CpuPlayer(getPlayerOfIdentity(game, Identity.FASCIST));
    HashMap<String, Integer> playerChosenCount = new HashMap<>();
    for (String playerName : players) {
      playerChosenCount.put(playerName, 0);
    }
    cpu.initialize(game);

    for (int i = 0; i < ITERATIONS; i++) {
      String selectedName = cpu.chooseRandomPlayerWeighted(game.getPlayerList(),
          1f,
          1f,
          1f,
          0f);
      playerChosenCount.put(selectedName, playerChosenCount.get(selectedName) + 1);
    }

    // Check that no values are negative
    int min = Integer.MAX_VALUE;
    int max = Integer.MIN_VALUE;
    for (String name : players) {
      if (name.equals(cpu.myName)) {
        continue;
      }
      int count = playerChosenCount.get(name);
      min = Math.min(count, min);
      max = Math.max(count, max);
      assertNotEquals(count, 0);
    }

    // Values are random, but ensure they're within a bounded range from one
    // another
    assertTrue(max - min < ITERATIONS / numPlayers);
  }

  @Test
  public void testSelectingRandomPlayerIgnoresZeroProbability() {
    List<String> players = makePlayers(8);
    SecretHitlerGame game = new SecretHitlerGame(players);

    CpuPlayer cpu = new CpuPlayer(getPlayerOfIdentity(game, Identity.FASCIST));
    cpu.initialize(game);

    String hitler = getPlayerOfIdentity(game, Identity.HITLER);

    for (int i = 0; i < ITERATIONS; i++) {
      String selectedName = cpu.chooseRandomPlayerWeighted(game.getPlayerList(),
          1f,
          0f,
          1f,
          0f);
      assertNotNull(selectedName);
      assertNotEquals(cpu.myName, selectedName);
      assertNotEquals(hitler, selectedName);
    }
  }

  @Test
  public void testBiasesTowardsPlayers() {
    List<String> players = makePlayers(8);
    SecretHitlerGame game = new SecretHitlerGame(players);

    CpuPlayer cpu = new CpuPlayer(getPlayerOfIdentity(game, Identity.LIBERAL));
    cpu.initialize(game);

    String randomPlayer = getPlayerOfIdentity(game, Identity.FASCIST);
    // Mark every other player as a CPU
    for (Player player : game.getPlayerList()) {
      if (!player.getUsername().equals(randomPlayer)) {
        player.markAsCpu();
      }
    }

    for (int i = 0; i < ITERATIONS; i++) {
      String selectedName = cpu.chooseRandomPlayerWeighted(game.getPlayerList(),
          0f,
          0f,
          0f,
          0.5f);
      assertEquals(randomPlayer, selectedName);
    }
  }

  @Test
  public void testCanNominateChancellor() {
    List<String> players = makePlayers(8);
    for (int i = 0; i < ITERATIONS; i++) {
      SecretHitlerGame game = new SecretHitlerGame(players);
      CpuPlayer cpu = new CpuPlayer(game.getCurrentPresident());
      cpu.initialize(game);
      cpu.act(game);
      assertEquals(game.getState(), GameState.CHANCELLOR_VOTING);
    }
  }

  @Test
  public void testCanPlayFullGame() {
    Random random = new Random();
    HashMap<GameState, Integer> winTypes = new HashMap<>();

    for (int i = 0; i < ITERATIONS; i++) {
      List<String> players = makePlayers(random.nextInt(6) + 5);
      Collections.shuffle(players);
      SecretHitlerGame game = new SecretHitlerGame(players);

      // Mark all as CPUs
      List<CpuPlayer> cpus = new ArrayList<CpuPlayer>();
      for (String player : players) {
        CpuPlayer cpu = new CpuPlayer(player);
        cpu.initialize(game);
        cpus.add(cpu);
      }

      // Run through the game until a victory state is achieved
      while (!game.hasGameFinished()) {
        for (CpuPlayer cpu : cpus) {
          cpu.update(game);
        }
        for (CpuPlayer cpu : cpus) {
          try {

            if (cpu.act(game)) {
              break;
            }
          } catch (Exception e) {
            System.out.println("players: " + game.getPlayerList().size());
            System.out.println("draw: " + game.getDrawSize());
            System.out.println("discard: " + game.getDiscardSize());
            System.out.println("fascist: " + game.getNumFascistPolicies());
            System.out.println("liberal: " + game.getNumLiberalPolicies());
            System.out.println("state: " + game.getState());
            throw e;
          }
        }
      }

      // Register victory types and conditions
      if (!winTypes.containsKey(game.getState())) {
        winTypes.put(game.getState(), 0);
      }
      winTypes.put(game.getState(), winTypes.get(game.getState()) + 1);
    }

    List<GameState> states = new ArrayList<>(winTypes.keySet());
    Collections.sort(states);
    for (GameState state : states) {
      System.out.println("" + state.toString() + ": "
        + (winTypes.get(state) * 1f / ITERATIONS * 100f) + "%");
    }
  }

  @Test
  public void theDrawLandsInTheRunningTotals() {
    float[] weights = { 1f, 0f, 3f };
    assertEquals(0, CpuPlayer.getWeightedRandomIndex(weights, 0.0));
    assertEquals(0, CpuPlayer.getWeightedRandomIndex(weights, 0.2));
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, 0.25));
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, 0.9));
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, Math.nextDown(1.0)));
  }

  @Test
  public void aDrawAtTheTopPicksTheLastWeightedEntry() {
    float[] weights = { 0.1f, 0.2f, 0.3f, 0f };
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, Math.nextDown(1.0)));
  }

  @Test
  public void allZeroWeightsSplitTheDrawEvenly() {
    float[] weights = { 0f, 0f, 0f, 0f };
    assertEquals(0, CpuPlayer.getWeightedRandomIndex(weights, 0.0));
    assertEquals(1, CpuPlayer.getWeightedRandomIndex(weights, 0.25));
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, 0.5));
    assertEquals(2, CpuPlayer.getWeightedRandomIndex(weights, 0.74));
    assertEquals(3, CpuPlayer.getWeightedRandomIndex(weights, Math.nextDown(1.0)));
  }

  @Test
  public void anEmptyListOfWeightsIsRefused() {
    expectIllegalArgument(() -> CpuPlayer.getWeightedRandomIndex(new float[0], 0.5));
  }

  @Test
  public void everyWeightZeroPicksUniformlyAmongTheLiving() {
    SecretHitlerGame game = new SecretHitlerGame(makePlayers(6));
    CpuPlayer cpu = new CpuPlayer("0");
    cpu.initialize(game);
    game.getPlayer("3").kill();

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS; i++) {
      picks.merge(cpu.chooseRandomPlayerWeighted(game.getPlayerList(), 0, 0, 0, 0), 1, Integer::sum);
    }

    assertShares(picks, Map.of("1", 0.25, "2", 0.25, "4", 0.25, "5", 0.25));
  }

  @Test
  public void noOneToPickIsRefused() {
    SecretHitlerGame game = new SecretHitlerGame(makePlayers(5));
    CpuPlayer cpu = new CpuPlayer("0");
    cpu.initialize(game);
    game.getPlayer("1").kill();
    List<Player> onlySelfAndDead = List.of(game.getPlayer("0"), game.getPlayer("1"));

    expectIllegalArgument(() -> cpu.chooseRandomPlayerWeighted(onlySelfAndDead, 1, 1, 1, 1));
  }

  /** #72: four people at reputation 0 weigh 0.605 each (today 15.1%, 15.1%, 15.1%, 54.7%). */
  @Test
  public void aLiberalsFirstNominationIsEven() {
    SecretHitlerGame game = gameAt(5, GameState.CHANCELLOR_NOMINATION, Identity.LIBERAL);

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS; i++) {
      SecretHitlerGame copy = copyOf(game);
      assertTrue(presidentBot(copy).act(copy));
      picks.merge(copy.getCurrentChancellor(), 1, Integer::sum);
    }

    Map<String, Double> expected = new HashMap<>();
    for (String other : othersThan(game, game.getCurrentPresident())) {
      expected.put(other, 0.25);
    }
    assertShares(picks, expected);
  }

  /**
   * #72: the first other seat at reputation −5 weighs 1.0 and the other three, at 0, weigh 0.3
   * (today 25.0%, 7.6%, 7.4%, 60.1%).
   */
  @Test
  public void aLiberalsExecutionFollowsTheWeights() {
    SecretHitlerGame game = gameAt(5, GameState.PRESIDENTIAL_POWER_EXECUTION, Identity.LIBERAL);
    List<String> others = othersThan(game, game.getCurrentPresident());

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS; i++) {
      SecretHitlerGame copy = copyOf(game);
      CpuPlayer bot = presidentBot(copy);
      bot.playerReputation.put(others.get(0), -5);
      assertTrue(bot.act(copy));
      picks.merge(copy.getTarget(), 1, Integer::sum);
    }

    Map<String, Double> expected = new HashMap<>();
    expected.put(others.get(0), 1.0 / 1.9);
    for (String other : others.subList(1, others.size())) {
      expected.put(other, 0.3 / 1.9);
    }
    assertShares(picks, expected);
  }

  /**
   * #72: after 3 fascist policies a fascist weighs Hitler (a CPU) at 1.5 and each liberal (a
   * person) at 0.15 + 0.05, wherever Hitler sits in the list.
   */
  @Test
  public void aFascistNominatesHitlerByWeightWhereverHeSits() {
    SecretHitlerGame game = new SecretHitlerGame(makePlayers(5));
    CpuPlayer cpu = new CpuPlayer(getPlayerOfIdentity(game, Identity.FASCIST));
    cpu.initialize(game);
    Player hitler = game.getPlayer(getPlayerOfIdentity(game, Identity.HITLER));
    hitler.markAsCpu();
    List<Player> liberals = new ArrayList<>();
    for (Player player : game.getPlayerList()) {
      if (player.getIdentity() == Identity.LIBERAL && liberals.size() < 2) {
        liberals.add(player);
      }
    }
    Map<String, Double> expected = Map.of(
        hitler.getUsername(), 1.5 / 1.9,
        liberals.get(0).getUsername(), 0.2 / 1.9,
        liberals.get(1).getUsername(), 0.2 / 1.9);

    for (List<Player> list : List.of(List.of(hitler, liberals.get(0), liberals.get(1)),
        List.of(liberals.get(0), liberals.get(1), hitler))) {
      Map<String, Integer> picks = new HashMap<>();
      for (int i = 0; i < ITERATIONS; i++) {
        picks.merge(cpu.chooseRandomPlayerWeighted(list, 0.35f, 1.5f, 0.15f, 0.05f), 1, Integer::sum);
      }
      assertShares(picks, expected);
    }
  }

  /**
   * #72: a fascist's special election weighs the other fascist and Hitler at 1.5 and the four
   * liberals at 1.0, all people (today the last seat 0.0%).
   */
  @Test
  public void aFascistsSpecialElectionFollowsTheWeights() {
    SecretHitlerGame game = gameAt(7, GameState.PRESIDENTIAL_POWER_ELECTION, Identity.FASCIST);

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS; i++) {
      SecretHitlerGame copy = copyOf(game);
      assertTrue(presidentBot(copy).act(copy));
      picks.merge(copy.getTarget(), 1, Integer::sum);
    }

    Map<String, Double> expected = new HashMap<>();
    for (String other : othersThan(game, game.getCurrentPresident())) {
      boolean liberal = game.getPlayer(other).getIdentity() == Identity.LIBERAL;
      expected.put(other, (liberal ? 1.0 : 1.5) / 7.0);
    }
    assertShares(picks, expected);
  }

  /**
   * Every other player is a CPU at +3, which a liberal's execution weighs at 0: the pick is then
   * even among the living others (today always the first).
   */
  @Test
  public void aLiberalExecutionEndsWhenEveryoneLeftIsTrusted() {
    SecretHitlerGame game = gameAt(5, GameState.PRESIDENTIAL_POWER_EXECUTION, Identity.LIBERAL);
    String president = game.getCurrentPresident();
    List<String> others = othersThan(game, president);

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS / 10; i++) {
      SecretHitlerGame copy = copyOf(game);
      CpuPlayer bot = presidentBot(copy);
      for (String other : others) {
        copy.getPlayer(other).markAsCpu();
        bot.playerReputation.put(other, 3);
      }

      assertTrue(bot.act(copy));

      String target = copy.getTarget();
      assertNotEquals(president, target);
      assertTrue(target + " was alive before", game.getPlayer(target).isAlive());
      picks.merge(target, 1, Integer::sum);
    }

    for (String other : others) {
      assertTrue(other + " was never executed: " + picks, picks.containsKey(other));
    }
  }

  /** Executes on {@code ITERATIONS / 10} copies of the game, counting each target. */
  private static Map<String, Integer> executionTargetsOf(SecretHitlerGame game) {
    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS / 10; i++) {
      SecretHitlerGame copy = copyOf(game);
      assertTrue(presidentBot(copy).act(copy));
      picks.merge(copy.getTarget(), 1, Integer::sum);
    }
    return picks;
  }

  @Test
  public void aFascistNeverExecutesAKnownTeammate() {
    SecretHitlerGame game = gameAt(7, GameState.PRESIDENTIAL_POWER_EXECUTION, Identity.FASCIST);

    Map<String, Integer> picks = executionTargetsOf(game);

    for (String target : picks.keySet()) {
      assertEquals(target + " was executed: " + picks, Identity.LIBERAL, game.getPlayer(target).getIdentity());
    }
    for (Player player : game.getPlayerList()) {
      if (player.getIdentity() == Identity.LIBERAL) {
        assertTrue(player.getUsername() + " was never executed: " + picks, picks.containsKey(player.getUsername()));
      }
    }
  }

  @Test
  public void hitlerAtFiveNeverExecutesTheFascist() {
    SecretHitlerGame game = gameAt(5, GameState.PRESIDENTIAL_POWER_EXECUTION, Identity.HITLER);
    String fascist = getPlayerOfIdentity(game, Identity.FASCIST);

    Map<String, Integer> picks = executionTargetsOf(game);

    assertFalse("Hitler executed the fascist: " + picks, picks.containsKey(fascist));
    for (Player player : game.getPlayerList()) {
      if (player.getIdentity() == Identity.LIBERAL) {
        assertTrue(player.getUsername() + " was never executed: " + picks, picks.containsKey(player.getUsername()));
      }
    }
  }

  /**
   * Hitler at 7 is dealt no teammates, so every other player keeps the reputation's weight: the
   * first other seat at −5 weighs 0.5 and the five at 0 weigh 0.75 (as before the fix).
   */
  @Test
  public void hitlerAtSevenStillWeighsByReputation() {
    SecretHitlerGame game = gameAt(7, GameState.PRESIDENTIAL_POWER_EXECUTION, Identity.HITLER);
    List<String> others = othersThan(game, game.getCurrentPresident());

    Map<String, Integer> picks = new HashMap<>();
    for (int i = 0; i < ITERATIONS; i++) {
      SecretHitlerGame copy = copyOf(game);
      CpuPlayer bot = presidentBot(copy);
      bot.playerReputation.put(others.get(0), -5);
      assertTrue(bot.act(copy));
      picks.merge(copy.getTarget(), 1, Integer::sum);
    }

    Map<String, Double> expected = new HashMap<>();
    expected.put(others.get(0), 0.5 / 4.25);
    for (String other : others.subList(1, others.size())) {
      expected.put(other, 0.75 / 4.25);
    }
    assertShares(picks, expected);
  }

  /**
   * The one player a liberal's investigation weighs above 0 (a person at +3, weight 0.38) has been
   * investigated already, and the rest are CPUs at +3 (weight 0): the pick is even among those who
   * may be investigated, never a loop on the one it may not.
   */
  @Test
  public void aLiberalInvestigationEndsWhenEveryoneLeftIsTrusted() throws Throwable {
    SecretHitlerGame game = gameAt(9, GameState.PRESIDENTIAL_POWER_INVESTIGATE, Identity.LIBERAL);
    String president = game.getCurrentPresident();
    List<String> others = othersThan(game, president);
    String investigated = others.get(0);
    List<String> rest = others.subList(1, others.size());

    Map<String, Integer> picks = new HashMap<>();
    endsWithin(10, "the investigation never ended", () -> {
      for (int i = 0; i < ITERATIONS / 10; i++) {
        SecretHitlerGame copy = copyOf(game);
        CpuPlayer bot = presidentBot(copy);
        copy.getPlayer(investigated).investigate();
        bot.playerReputation.put(investigated, 3);
        for (String other : rest) {
          copy.getPlayer(other).markAsCpu();
          bot.playerReputation.put(other, 3);
        }

        assertTrue(bot.act(copy));

        assertEquals(GameState.POST_LEGISLATIVE, copy.getState());
        String target = copy.getTarget();
        assertNotEquals(president, target);
        assertNotEquals(investigated, target);
        assertTrue(target + " is known after the investigation", bot.knownPlayerRoles.containsKey(target));
        picks.merge(target, 1, Integer::sum);
      }
    });

    assertEquals(7, rest.size());
    for (String other : rest) {
      assertTrue(other + " was never investigated: " + picks, picks.containsKey(other));
    }
  }
}
