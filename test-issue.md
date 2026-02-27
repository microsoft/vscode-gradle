# Test Explorer 树在每次 Test Run 后被重新刷新的问题

## 问题描述

在运行 test case 之后，Test Explorer 的 tree view 会被完全重建，导致：
- 刚设置的测试结果状态（绿色通过/红色失败）瞬间消失
- Invocation 子节点（参数化测试）被清空后重新加载
- 用户看到树闪烁/刷新

## 根因分析

### 触发链路

```
Test Run 完成
  → Gradle Build Server 发出 buildTarget/didChange 通知
  → GradleBuildClient.onBuildTargetDidChange()          [vscode-gradle]
    → GradleBuildServerBuildSupport.update(project, force=true)
      → updateClasspath()
        → javaProject.setRawClasspath()  ×3次（即使内容没变）
          → JDT ElementChanged delta 事件
            → jdt.ls 对外发出 onDidClasspathUpdate 事件
              → vscode-java-test extension.ts 收到事件
                → refreshExplorer() → 删光所有 tree root → 重建整棵树
```

### Root Cause

位于 **vscode-gradle** 仓库：

**文件**：`extension/jdtls.ext/com.microsoft.gradle.bs.importer/src/com/microsoft/gradle/bs/importer/GradleBuildServerBuildSupport.java`

1. **`onBuildTargetDidChange` 传 `force=true`**（GradleBuildClient.java:135）：Build Server 在 test run 期间/之后发出 `buildTarget/didChange`，即使项目配置没变化也会触发更新

2. **`updateClasspath` 没有做 diff 检查**（GradleBuildServerBuildSupport.java:249-280）：方法内调用了 **3 次** `setRawClasspath()`，且不检查新旧 classpath 是否一致：
   - 第 249 行：设置源码条目（为了检测 modular）
   - 第 265 行：加上依赖 JAR 后再设一次
   - 第 280 行：如果有 JPMS 参数再设第三次

3. **每次 `setRawClasspath()` 都会触发 JDT 的 classpath changed delta**，即使内容完全一样

### 调试证据

通过在 `ClasspathUpdateHandler.elementChanged` 设置断点，捕获到以下调用栈：

```
TestKindProvider.getTestKinds()
TestKindProvider.updateTestKinds()
ClasspathUpdateHandler.elementChanged()
DeltaProcessor → SafeRunner
JavaProject.setRawClasspath()
GradleBuildServerBuildSupport.updateClasspath()    ← root cause
GradleBuildServerBuildSupport.update()
GradleBuildClient.lambda$0()                       ← onBuildTargetDidChange
CompletableFuture$AsyncRun → ForkJoinPool
```

## 修复方案

在 `vscode-gradle` 仓库的 `GradleBuildServerBuildSupport.updateClasspath` 中，每次调用 `setRawClasspath()` 前加 diff 检查：

```java
IClasspathEntry[] newEntries = classpathMap.values().toArray(new IClasspathEntry[0]);
IClasspathEntry[] oldEntries = javaProject.getRawClasspath();
if (!Arrays.equals(oldEntries, newEntries)) {
    javaProject.setRawClasspath(newEntries, monitor);
}
```

对 `updateClasspath` 方法内的 3 处 `setRawClasspath()` 调用以及 `updateProjectDependencies` 中的 1 处调用都应添加此检查。

当 classpath 没有变化时，`setRawClasspath()` 不被调用 → 不触发 JDT delta → 不触发 `onDidClasspathUpdate` → Test Explorer 树不会被错误刷新。

## 涉及的仓库和文件

| 仓库 | 文件 | 角色 |
|------|------|------|
| **vscode-gradle** | `GradleBuildServerBuildSupport.java` | Root cause：无条件调用 `setRawClasspath()` |
| **vscode-gradle** | `GradleBuildClient.java` | 触发入口：`onBuildTargetDidChange` 传 `force=true` |
| vscode-java-test | `src/extension.ts` | 受影响：`onDidClasspathUpdate` → `refreshExplorer()` |
| vscode-java-test | `src/commands/testExplorerCommands.ts` | 受影响：`refreshExplorer()` 删除所有 tree root 并重建 |
