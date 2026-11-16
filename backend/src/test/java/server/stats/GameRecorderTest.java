package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
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

    @Test
    public void aRecordAlreadyThereCallsNoAfterSave() throws Exception {
        store.save(record("g1"));
        recorder.start();
        recorder.submit(record("g1"));

        assertTrue(TestStore.await(() -> store.saves.get() == 2, 5_000));
        Thread.sleep(100);
        assertEquals(0, afterSave.get());
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
