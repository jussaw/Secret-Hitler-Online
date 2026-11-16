package server.stats;

import org.slf4j.LoggerFactory;

/**
 * Where a lobby hands each game's record ({@code Lobby.recordSink}). A lobby calls {@code submit}
 * under its own lock, so a sink must not block or touch a database: it takes the record and
 * returns. Phase 14B's writer is one.
 */
@FunctionalInterface
public interface GameRecordSink {
    /** Takes the record of a game that has ended or been swept. */
    void submit(GameRecord record);

    /** The sink until a recorder is set: it drops each record with a debug line. */
    GameRecordSink DROPPING = record -> LoggerFactory.getLogger(GameRecordSink.class)
            .debug("No recorder: dropped the record of game " + record.id() + ".");
}
