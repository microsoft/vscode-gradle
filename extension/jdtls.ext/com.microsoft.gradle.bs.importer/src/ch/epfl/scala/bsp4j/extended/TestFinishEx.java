// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package ch.epfl.scala.bsp4j.extended;

import java.util.Objects;

import org.eclipse.lsp4j.jsonrpc.validation.NonNull;

import ch.epfl.scala.bsp4j.TestFinish;
import ch.epfl.scala.bsp4j.TestStatus;

/**
 * Extended {@link TestFinish}, which contains the Suite, class, method.
 * {@link TestFinish} only contains file location which Gradle doesn't have.
 */
public class TestFinishEx extends TestFinish {

  private TestName testName;

  private String stackTrace;

  /**
   * Create a new instance of {@link TestFinishEx}.
   */
  public TestFinishEx(@NonNull String displayName, @NonNull TestStatus status,
      @NonNull TestName testName) {
    super(displayName, status);
    this.testName = testName;
  }


  public TestName getTestName() {
    return testName;
  }

  public void setTestName(TestName testName) {
    this.testName = testName;
  }

  public String getStackTrace() {
    return stackTrace;
  }

  public void setStackTrace(String stackTrace) {
    this.stackTrace = stackTrace;
  }

  @Override
  public int hashCode() {
    final int prime = 31;
    int result = super.hashCode();
    result = prime * result + Objects.hash(testName, stackTrace);
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
    TestFinishEx other = (TestFinishEx) obj;
    return Objects.equals(testName, other.testName)
        && Objects.equals(stackTrace, other.stackTrace);
  }
}
