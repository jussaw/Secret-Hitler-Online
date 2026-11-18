package game;

/**
 * How well a CPU player plays, written by its name wherever it is stored or sent. Easy is Normal
 * with a share of random legal moves ({@link CpuPlayer#EASY_MISTAKE_CHANCE}); Normal is the bots'
 * own rules; Hard turns on more rules, each reading only what its seat could see (issue #72).
 */
public enum BotSkill {
    EASY,
    NORMAL,
    HARD
}
