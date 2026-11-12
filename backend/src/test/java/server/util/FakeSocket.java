package server.util;

import io.javalin.websocket.WsConnectContext;
import io.javalin.websocket.WsContext;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.eclipse.jetty.websocket.api.RemoteEndpoint;
import org.eclipse.jetty.websocket.api.Session;
import org.json.JSONObject;

/**
 * A WebSocket connection for Lobby tests: a real Javalin context around a stand-in Jetty session
 * that records every text message sent to it. Lobby only sends, so nothing else is needed.
 */
final class FakeSocket {
    final List<String> sent = new ArrayList<>();
    final WsContext ctx;

    private FakeSocket() {
        RemoteEndpoint remote = stub(RemoteEndpoint.class, (method, args) -> {
            if (method.getName().equals("sendString")) {
                sent.add((String) args[0]);
            }
            return null;
        });
        Session session = stub(Session.class, (method, args) -> {
            if (method.getName().equals("getRemote")) {
                return remote;
            }
            if (method.getName().equals("isOpen")) {
                return true;
            }
            return null;
        });
        ctx = new WsConnectContext(UUID.randomUUID().toString(), session);
    }

    static FakeSocket open() {
        return new FakeSocket();
    }

    /** The last packet sent to this connection. */
    JSONObject last() {
        return new JSONObject(sent.get(sent.size() - 1));
    }

    private interface Handler {
        Object handle(Method method, Object[] args);
    }

    /** A proxy that is equal only to itself and answers every other call with {@code handler}. */
    private static <T> T stub(Class<T> type, Handler handler) {
        Object proxy = Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, (self, method, args) -> {
            switch (method.getName()) {
                case "equals":
                    return self == args[0];
                case "hashCode":
                    return System.identityHashCode(self);
                case "toString":
                    return "Fake" + type.getSimpleName();
                default:
                    Object result = handler.handle(method, args);
                    return result != null ? result : defaultValue(method.getReturnType());
            }
        });
        return type.cast(proxy);
    }

    private static Object defaultValue(Class<?> type) {
        if (type == boolean.class) {
            return false;
        } else if (type == int.class || type == long.class || type == short.class || type == byte.class) {
            return type == long.class ? (Object) 0L : (Object) 0;
        } else if (type == double.class || type == float.class) {
            return 0.0;
        }
        return null;
    }
}
