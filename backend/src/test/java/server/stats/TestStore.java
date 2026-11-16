package server.stats;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

/**
 * A game store for tests (in memory, or in a file) that can fail, hold its saves back, and count
 * its calls. Every public call first runs {@code onCall} (a check of the calling thread, say), then
 * fails while {@code failing} is set. A save counts as called even when it then fails or waits.
 */
public class TestStore extends GameStore {
    /** Every call fails with an {@code IllegalStateException} while this is set. */
    public volatile boolean failing;
    /** Run at the start of every public call, on the calling thread. */
    public volatile Runnable onCall = () -> {
    };
    /** How many times {@code save} was called. */
    public final AtomicInteger saves = new AtomicInteger();
    /** The thread of each {@code save} call, in order. */
    public final List<String> saveThreads = Collections.synchronizedList(new ArrayList<>());
    /** The ID of each {@code save} call, in order. */
    public final List<String> saveIds = Collections.synchronizedList(new ArrayList<>());
    /** The ID of each save that wrote its game, in order. */
    public final List<String> written = Collections.synchronizedList(new ArrayList<>());
    /** How many times {@code recordedIds} was called. */
    public final AtomicInteger recordedIdsCalls = new AtomicInteger();

    private volatile CountDownLatch gate;

    /** A store in memory. */
    public TestStore() {
        super(null);
    }

    /** A store in the file at {@code path}. */
    public TestStore(String path) {
        super(path);
    }

    /** Holds every save back, before it reaches the database, until {@code release}. */
    public void block() {
        gate = new CountDownLatch(1);
    }

    /** Lets the saves held back, and every later one, go on. */
    public void release() {
        CountDownLatch held = gate;
        gate = null;
        if (held != null) {
            held.countDown();
        }
    }

    private void call() {
        onCall.run();
        if (failing) {
            throw new IllegalStateException("The test's database is down.");
        }
    }

    @Override
    public boolean save(GameRecord record) {
        saves.incrementAndGet();
        saveThreads.add(Thread.currentThread().getName());
        saveIds.add(record.id());
        onCall.run();
        CountDownLatch held = gate;
        if (held != null) {
            try {
                held.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (failing) {
            throw new IllegalStateException("The test's database is down.");
        }
        boolean wrote = super.save(record);
        if (wrote) {
            written.add(record.id());
        }
        return wrote;
    }

    @Override
    public Set<String> recordedIds(Collection<String> ids) {
        recordedIdsCalls.incrementAndGet();
        call();
        return super.recordedIds(ids);
    }

    @Override
    public List<PlayerRow> players() {
        call();
        return super.players();
    }

    @Override
    public List<String> recordsJson() {
        call();
        return super.recordsJson();
    }

    /** Waits up to {@code ms} for {@code condition}, checking every 10 ms; false if it never holds. */
    public static boolean await(BooleanSupplier condition, long ms) {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(ms);
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() > deadline) {
                return false;
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return condition.getAsBoolean();
            }
        }
        return true;
    }
}
