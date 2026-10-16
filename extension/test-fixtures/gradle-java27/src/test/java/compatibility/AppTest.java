package compatibility;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AppTest {
    @Test
    public void usesJava27() {
        int feature = Runtime.version().feature();
        assertEquals(27, feature);
    }
}
