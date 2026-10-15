package compatibility;

public class App {
    public static void main(String[] args) {
        int feature = Runtime.version().feature();
        System.out.println("JAVA_FEATURE=" + feature);
        if (feature != 27) {
            throw new AssertionError("Expected Java 27, got " + feature);
        }
    }
}
