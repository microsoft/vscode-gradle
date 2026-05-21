// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package ch.epfl.scala.bsp4j.extended;

import java.util.Objects;

import org.eclipse.lsp4j.jsonrpc.validation.NonNull;

import ch.epfl.scala.bsp4j.TestStart;

/**
 * Extended {@link TestStart}, which contains the Suite, class, method.
 * {@link TestStart} only contains file location which Gradle doesn't have.
 */
public class TestStartEx extends TestStart {

  private TestName testName;

  /**
   * Create a new instance of {@link TestStartEx}.
   */
  public TestStartEx(@NonNull String displayName, @NonNull TestName testName) {
    super(displayName);
    this.testName = testName;
  }

  public TestName getTestName() {
    return testName;
  }

  public void setTestName(TestName testName) {
    this.testName = testName;
  }

  @Override
  public int hashCode() {
    final int prime = 31;
    int result = super.hashCode();
    result = prime * result + Objects.hashCode(testName);
    return result;
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) {
      return true;
    }
    if (!super.equals(obj)) {
      return false;
    }
    if (getClass() != obj.getClass()) {
      return false;
    }
    TestStartEx other = (TestStartEx) obj;
    return Objects.equals(testName, other.testName);
  }
}
