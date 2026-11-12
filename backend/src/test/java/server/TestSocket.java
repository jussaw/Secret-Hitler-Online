package server;

import static org.junit.Assert.fail;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** A real client of the /game WebSocket, using Java's built-in client, for server tests. */
public final class TestSocket implements WebSocket.Listener {
    private static final long WAIT_SECONDS = 5;

    /** How the server closed the socket. */
    public static final class CloseInfo {
        public final int code;
        public final String reason;

        CloseInfo(int code, String reason) {
            this.code = code;
            this.reason = reason;
        }
    }

    private final BlockingQueue<JSONObject> packets = new LinkedBlockingQueue<>();
    private final List<JSONObject> received = new ArrayList<>();
    private final CompletableFuture<CloseInfo> closed = new CompletableFuture<>();
    private final StringBuilder partial = new StringBuilder();
    private WebSocket ws;

    private TestSocket() {
    }

    /** Opens {@code ws://localhost:<port>/game?<query>}. */
    public static TestSocket connect(int port, String query) throws Exception {
        TestSocket socket = new TestSocket();
        socket.ws = HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/game?" + query), socket)
                .get(WAIT_SECONDS, TimeUnit.SECONDS);
        return socket;
    }

    @Override
    public void onOpen(WebSocket webSocket) {
        webSocket.request(1);
    }

    @Override
    public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        partial.append(data);
        if (last) {
            JSONObject packet = new JSONObject(partial.toString());
            partial.setLength(0);
            synchronized (received) {
                received.add(packet);
            }
            packets.add(packet);
        }
        webSocket.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        closed.complete(new CloseInfo(statusCode, reason));
        return null;
    }

    @Override
    public void onError(WebSocket webSocket, Throwable error) {
        closed.completeExceptionally(error);
    }

    /** Sends a message as text. */
    public void send(JSONObject message) throws Exception {
        sendText(message.toString());
    }

    /** Sends raw text, which need not be JSON. */
    public void sendText(String text) throws Exception {
        ws.sendText(text, true).get(WAIT_SECONDS, TimeUnit.SECONDS);
    }

    /** Waits for the next packet of this type, skipping others; fails after 5 s. */
    public JSONObject next(String type) throws InterruptedException {
        long deadline = System.currentTimeMillis() + WAIT_SECONDS * 1000;
        while (true) {
            long left = deadline - System.currentTimeMillis();
            JSONObject packet = left > 0 ? packets.poll(left, TimeUnit.MILLISECONDS) : null;
            if (packet == null) {
                fail("no '" + type + "' packet within " + WAIT_SECONDS + " s");
            }
            if (type.equals(packet.optString("type"))) {
                return packet;
            }
        }
    }

    /** Waits for the next game packet in {@code state}; fails after 5 s. */
    public JSONObject nextState(String state) throws InterruptedException {
        while (true) {
            JSONObject packet = next("game");
            if (state.equals(packet.getString("state"))) {
                return packet;
            }
        }
    }

    /** Every packet received so far. */
    public List<JSONObject> received() {
        synchronized (received) {
            return new ArrayList<>(received);
        }
    }

    /** Waits up to 5 s for the server to close the socket. */
    public CloseInfo awaitClose() throws Exception {
        return closed.get(WAIT_SECONDS, TimeUnit.SECONDS);
    }

    public boolean isOpen() {
        return !closed.isDone() && !ws.isInputClosed();
    }

    public void close() {
        if (!ws.isOutputClosed()) {
            ws.sendClose(WebSocket.NORMAL_CLOSURE, "");
        }
    }
}
