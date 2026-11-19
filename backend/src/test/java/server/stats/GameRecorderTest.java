package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import java.util.function.IntSupplier;
import org.junit.After;
import org.junit.Test;

/**
 * The writer ({@code GameRecorder}): a lobby's {@code submit} only queues, its own thread saves,
 * a record whose save fails waits for the next try, and {@code flush} tries every record once on
 * the calling thread.
 */
public class GameRecorderTest {
    private final TestStore store = new TestStore();
    private final AtomicInteger afterSave = new AtomicInteger();
    private final GameRecorder recorder = new GameRecorder(store, afterSave::incrementAndGet);

    @After
    public void stop() {
        store.release();
        recorder.stop();
        store.close();
    }

    private static GameRecord record(String id) {
        return TestRecords.record(id, 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Ann"));
    }

    @Test
    public void aRecordIsWrittenOffTheCallersThread() {
        recorder.start();
        recorder.submit(record("g1"));

        assertTrue("saved within 5 s", TestStore.await(() -> store.written.size() == 1, 5_000));
        assertEquals(List.of("game-recorder"), store.saveThreads);
        assertTrue(TestStore.await(() -> afterSave.get() == 1, 1_000));
        assertEquals(1, store.recordsJson().size());
        assertEquals(0, recorder.waitingCount());
    }

    /**
     * A record already there (a retry of a save that wrote it but reported a failure, say) writes
     * nothing, but still refreshes what follows a save, so the route never keeps a body without it.
     */
    @Test
    public void aRecordAlreadyThereStillRefreshesTheRoute() {
        store.save(record("g1"));
        recorder.start();
        recorder.submit(record("g1"));

        assertTrue(TestStore.await(() -> afterSave.get() == 1, 5_000));
        assertEquals(2, store.saves.get());
        assertEquals(List.of("g1"), store.written);
        assertEquals(0, recorder.waitingCount());
    }

    @Test
    public void aFailingDatabaseLosesNoRecord() {
        store.failing = true;
        recorder.start();
        recorder.submit(record("g1"));
        assertTrue("the record waits", TestStore.await(() -> recorder.waitingCount() == 1, 5_000));

        recorder.retryWaiting();
        assertTrue("tried again", TestStore.await(() -> store.saves.get() == 2, 5_000));
        assertTrue("and waits again", TestStore.await(() -> recorder.waitingCount() == 1, 5_000));

        store.failing = false;
        recorder.retryWaiting();
        assertTrue("saved once the database is back", TestStore.await(() -> store.written.size() == 1, 5_000));
        assertTrue(TestStore.await(() -> afterSave.get() == 1, 1_000));
        assertEquals(0, recorder.waitingCount());
        assertEquals(1, store.recordsJson().size());
    }

    /**
     * One {@code retryWaiting} tries each waiting record once, however the threads are scheduled
     * (#95). Here the writer's thread tries each record the moment it is queued, and puts it back
     * to wait before {@code retryWaiting} goes on, as a busy machine can schedule it.
     */
    @Test
    public void oneRetryTriesEachWaitingRecordOnce() {
        TriedAtOnce queue = new TriedAtOnce(store);
        GameRecorder retrying = new GameRecorder(store, afterSave::incrementAndGet, queue);
        try {
            store.failing = true;
            retrying.start();
            retrying.submit(record("g1"));
            retrying.submit(record("g2"));
            assertTrue("both records wait", TestStore.await(() -> retrying.waitingCount() == 2, 5_000));

            queue.tryEachAtOnce(retrying::waitingCount);
            retrying.retryWaiting();
            assertEquals(List.of("g1", "g2"), queue.queued);
            assertEquals(List.of("g1", "g2", "g1", "g2"), store.saveIds);
            assertEquals(2, retrying.waitingCount());
        } finally {
            retrying.stop();
        }
    }

    /**
     * The writer's queue for {@link #oneRetryTriesEachWaitingRecordOnce}. Once
     * {@code tryEachAtOnce} is called, each offer returns only after the writer's thread has tried
     * that record and, its save failing, put it back to wait; a record queued a second time fails
     * the test at once, before it reaches the queue. Until then, offers go straight through.
     */
    private static final class TriedAtOnce extends LinkedBlockingQueue<GameRecord> {
        private final TestStore store;
        /** The recorder's {@code waitingCount}, from {@code tryEachAtOnce} on; null before. */
        private volatile IntSupplier waitingCount;
        final List<String> queued = Collections.synchronizedList(new ArrayList<>());

        TriedAtOnce(TestStore store) {
            this.store = store;
        }

        /** From now on, each offer waits for the writer's thread to try its record. */
        void tryEachAtOnce(IntSupplier waitingCount) {
            this.waitingCount = waitingCount;
        }

        @Override
        public boolean offer(GameRecord record) {
            IntSupplier waiting = waitingCount;
            if (waiting == null) {
                return super.offer(record);
            }
            assertFalse("one retryWaiting queued " + record.id() + " twice", queued.contains(record.id()));
            queued.add(record.id());
            int savesBefore = store.saves.get();
            int waitingBefore = waiting.getAsInt();
            BooleanSupplier triedAndBack = () -> store.saves.get() == savesBefore + 1
                    && waiting.getAsInt() == waitingBefore + 1;
            boolean offered = super.offer(record);
            assertTrue(record.id() + " tried and back to wait", TestStore.await(triedAndBack, 5_000));
            return offered;
        }
    }

    /** A test's queue for the writer must be unbounded, as {@code submit} is never refused. */
    @Test(expected = IllegalArgumentException.class)
    public void aBoundedQueueIsRefused() {
        new GameRecorder(store, afterSave::incrementAndGet, new LinkedBlockingQueue<>(1));
    }

    /** A test's queue for the writer must start empty. */
    @Test(expected = IllegalArgumentException.class)
    public void aQueueAlreadyHoldingARecordIsRefused() {
        LinkedBlockingQueue<GameRecord> queue = new LinkedBlockingQueue<>();
        queue.offer(record("g1"));
        new GameRecorder(store, afterSave::incrementAndGet, queue);
    }

    @Test
    public void flushTriesEveryWaitingRecordOnce() {
        store.failing = true;
        recorder.start();
        recorder.submit(record("g1"));
        recorder.submit(record("g2"));
        assertTrue(TestStore.await(() -> recorder.waitingCount() == 2, 5_000));
        recorder.stop();
        recorder.submit(record("g3")); // queued: the thread has stopped
        int before = store.saves.get();

        recorder.flush();
        assertEquals(3, store.saves.get() - before);
        assertEquals(3, recorder.waitingCount());

        store.failing = false;
        store.saveThreads.clear();
        recorder.flush();
        assertEquals(List.of("g1", "g2", "g3"), store.written);
        String test = Thread.currentThread().getName();
        assertEquals(List.of(test, test, test), store.saveThreads);
        assertEquals(0, recorder.waitingCount());
        assertEquals(3, afterSave.get());
    }

    @Test
    public void submitNeverBlocks() {
        store.block();
        recorder.start();
        for (String id : List.of("g1", "g2", "g3")) {
            long start = System.nanoTime();
            recorder.submit(record(id));
            assertTrue(id + " returned at once", System.nanoTime() - start < 100_000_000L);
        }
        assertTrue("the first save is held", TestStore.await(() -> store.saves.get() == 1, 5_000));
        assertEquals(0, store.written.size());

        store.release();
        assertTrue(TestStore.await(() -> store.written.size() == 3, 5_000));
    }

    @Test
    public void submitTouchesNoStore() {
        recorder.submit(record("g1")); // not started: it only queues
        assertEquals(0, store.saves.get());
        assertEquals(0, recorder.waitingCount());
        recorder.flush();
        assertEquals(List.of("g1"), store.written);
    }
}
