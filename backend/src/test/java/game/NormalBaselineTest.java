package game;

import static org.junit.Assert.fail;

import game.BotScenes.Scene;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * Normal bots decide as Phase 24's did: twenty scenes, each at seeds 0 to 19 (mixed), against
 * {@code normal-baseline.txt}, which was recorded on Phase 24's code before any level existed.
 * The file is never recorded again to make a change pass: a difference is a change to Normal.
 */
public class NormalBaselineTest {
    private static final String BASELINE = "/normal-baseline.txt";
    private static final File ACTUAL = new File("build/normal-baseline-actual.txt");
    private static final int SEEDS = 20;

    /** The scenes, by name, in the file's order. */
    static Map<String, Supplier<Scene>> scenes() {
        Map<String, Supplier<Scene>> scenes = new LinkedHashMap<>();
        scenes.put("nominate-liberal", () -> BotScenes.nomination("LLLFH"));
        scenes.put("nominate-fascist-7", () -> BotScenes.nomination("LFLLLFH"));
        scenes.put("nominate-hitler-7", () -> BotScenes.nomination("LHLLLFF"));
        scenes.put("nominate-hitler-5", () -> BotScenes.nomination("LHLLF"));
        scenes.put("vote-liberal", () -> BotScenes.vote("LLLFH"));
        scenes.put("vote-fascist", () -> BotScenes.vote("LLFLH"));
        scenes.put("vote-hitler-7", () -> BotScenes.vote("LLHLLFF"));
        scenes.put("discard-liberal", () -> BotScenes.presidentsHand("LLLFH", "LLF"));
        scenes.put("discard-fascist", () -> BotScenes.presidentsHand("FLLLH", "FLL"));
        scenes.put("discard-hitler", () -> BotScenes.presidentsHand("HLLLF", "FFL"));
        scenes.put("choose-liberal", () -> BotScenes.chancellorsHand("LLLFH", "FL", "F", 0));
        scenes.put("choose-fascist", () -> BotScenes.chancellorsHand("LFLLH", "FL", "F", 0));
        scenes.put("choose-hitler-7", () -> BotScenes.chancellorsHand("LHLLLFF", "FL", "F", 0));
        scenes.put("veto-liberal", () -> BotScenes.chancellorsHand("LLLFH", "FF", "F", 5));
        scenes.put("answer-liberal", () -> BotScenes.vetoAnswer("LLLFH"));
        scenes.put("investigate-liberal", () -> BotScenes.power("LLLLLFFFH", 1, ""));
        scenes.put("investigate-fascist", () -> BotScenes.power("FLLLLLFFH", 1, ""));
        scenes.put("elect-liberal", () -> BotScenes.power("LLLLFFH", 3, ""));
        scenes.put("execute-liberal", () -> BotScenes.power("LLLFH", 4, ""));
        scenes.put("execute-fascist", () -> BotScenes.power("FLLLLFH", 4, ""));
        return scenes;
    }

    /** What a Normal bot decides in each scene at each seed, a line each. */
    static List<String> decisions() {
        List<String> lines = new ArrayList<>();
        for (Map.Entry<String, Supplier<Scene>> scene : scenes().entrySet()) {
            for (long seed = 0; seed < SEEDS; seed++) {
                Scene s = scene.getValue().get();
                CpuPlayer bot = BotScenes.bot(s, seed);
                GameState before = s.game().getState();
                boolean acted = bot.act(s.game());
                lines.add(scene.getKey() + " " + seed + ": " + Decision.of(before, acted, s.game(), s.bot()));
            }
        }
        return lines;
    }

    private static List<String> baseline() throws IOException {
        try (InputStream in = NormalBaselineTest.class.getResourceAsStream(BASELINE)) {
            if (in == null) {
                return null;
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().toList();
        }
    }

    @Test
    public void normalBotsDecideAsPhase24s() throws IOException {
        List<String> actual = decisions();
        List<String> expected = baseline();
        if (actual.equals(expected)) {
            return;
        }
        ACTUAL.getParentFile().mkdirs();
        Files.writeString(ACTUAL.toPath(), String.join("\n", actual) + "\n", StandardCharsets.UTF_8);
        if (expected == null) {
            fail("There is no " + BASELINE + ": the decisions are in " + ACTUAL.getPath());
        }
        for (int i = 0; i < Math.max(actual.size(), expected.size()); i++) {
            String want = i < expected.size() ? expected.get(i) : "(no line)";
            String got = i < actual.size() ? actual.get(i) : "(no line)";
            if (!want.equals(got)) {
                fail("Line " + (i + 1) + " of " + BASELINE + " differs: expected \"" + want + "\", got \"" + got
                        + "\". Every decision is in " + ACTUAL.getPath());
            }
        }
    }
}
