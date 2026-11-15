package game;

import server.ApplicationConfig;
import server.SecretHitlerServer;

public class ApplicationTest {
    public static void main(String[] args) {
        ApplicationConfig.DEBUG = true;
        ApplicationConfig.TEST_SIGN_IN = true; // local runs sign in with test accounts
        SecretHitlerServer.main(args);
    }
}
