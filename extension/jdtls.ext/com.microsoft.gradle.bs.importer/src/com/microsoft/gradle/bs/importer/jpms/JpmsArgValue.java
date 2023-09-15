package com.microsoft.gradle.bs.importer.jpms;

import java.util.Objects;

public class JpmsArgValue {
    private final String module;

    private final String value;

    public JpmsArgValue(String module, String value) {
      this.module = module;
      this.value = value;
    }

    public String getModule() {
      return this.module;
    }

    public String getValue() {
      return this.value;
    }

    @Override
    public int hashCode() {
        return Objects.hash(module, value);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null) {
            return false;
        }
        if (getClass() != obj.getClass()) {
            return false;
        }
        JpmsArgValue other = (JpmsArgValue) obj;
        return Objects.equals(module, other.module) && Objects.equals(value, other.value);
    }
}
