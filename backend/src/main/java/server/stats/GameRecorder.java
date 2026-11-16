package server.stats;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.LinkedBlockingQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The sink that stores each game's record (#31): a lobby's {@code submit}, made under its lock,
 * only puts the record on a queue, and one daemon thread of the recorder's own,
 * {@code game-recorder}, saves it to the store. So a game never waits on the database. A record
 * whose save fails waits in memory, and goes back on the queue at every {@code retryWaiting} (the
 * server's 60 s timer); {@code flush} tries every record once more at shutdown. A record is lost
 * only if the server stops before the database comes back.
 */
public final class GameRecorder implements GameRecordSink {
    private static final Logger logger = LoggerFactory.getLogger(GameRecorder.class);
    private static final long STOP_WAIT_MS = 10_000;

    private final GameStore store;
    private final Runnable afterSave;
    private final LinkedBlockingQueue<GameRecord> queue = new LinkedBlockingQueue<>();
    private final ConcurrentLinkedQueue<GameRecord> waiting = new ConcurrentLinkedQueue<>();
    private Thread thread;

    /**
     * @param store     where records are saved.
     * @param afterSave run after each save that wrote a game, on the saving thread (the route
     *                  empties its cache): it must not block.
     */
    public GameRecorder(GameStore store, Runnable afterSave) {
        this.store = store;
        this.afterSave = afterSave;
    }

    /** Starts the writer's thread. */
    public synchronized void start() {
        if (thread != null) {
            throw new IllegalStateException("The recorder has started already.");
        }
        thread = new Thread(this::run, "game-recorder");
        thread.setDaemon(true);
        thread.start();
    }

    private void run() {
        try {
            while (!Thread.currentThread().isInterrupted()) {
                trySave(queue.take());
            }
        } catch (InterruptedException e) {
            // stop(): the queued records stay for flush.
        }
    }

    /** Queues the record for the writer's thread. Never blocks, never throws, never touches the store. */
    @Override
    public void submit(GameRecord record) {
        if (record != null) {
            queue.offer(record); // unbounded: never refused, never waits
        }
    }

    /** Puts every record whose save failed back on the queue. */
    public void retryWaiting() {
        GameRecord record;
        while ((record = waiting.poll()) != null) {
            queue.offer(record);
        }
    }

    /**
     * Tries every queued and waiting record once, on the calling thread (the shutdown hook, after
     * {@code stop}). Those that fail wait again.
     */
    public void flush() {
        List<GameRecord> records = new ArrayList<>();
        GameRecord record;
        while ((record = waiting.poll()) != null) {
            records.add(record);
        }
        queue.drainTo(records);
        for (GameRecord each : records) {
            trySave(each);
        }
    }

    /** How many records wait for the database to come back. */
    public int waitingCount() {
        return waiting.size();
    }

    /**
     * Stops the writer's thread, waiting (up to 10 s) for a save under way to end. The records
     * still queued stay queued, for {@code flush}.
     */
    public void stop() {
        Thread stopping;
        synchronized (this) {
            stopping = thread;
        }
        if (stopping == null) {
            return;
        }
        stopping.interrupt();
        try {
            stopping.join(STOP_WAIT_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** Saves the record; one that fails is logged and waits. */
    private void trySave(GameRecord record) {
        boolean wrote;
        try {
            wrote = store.save(record);
        } catch (RuntimeException e) {
            waiting.add(record);
            logger.error("Could not save the record of game " + record.id() + ": it waits for the next try.", e);
            return;
        }
        if (!wrote) {
            logger.info("Game " + record.id() + " has a record already: nothing was written.");
            return;
        }
        logger.debug("Saved the record of game " + record.id() + ".");
        try {
            afterSave.run();
        } catch (RuntimeException e) {
            logger.error("Saved the record of game " + record.id() + ", but what follows a save failed.", e);
        }
    }
}
