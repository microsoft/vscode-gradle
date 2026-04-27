# Delegate Test to Gradle — 解耦 BSP 的修复与 GTA 长期方案

> 面向 reviewers / 维护者的背景与架构说明。记录 PR #1810 的动机、当前选型（JUnit XML）、与 BSP / GTA 两种方案的对比，以及后续演进路线。

## 1. 背景：XML fallback/unblocker 的定位

| Issue                                                                                        | 与本 PR 的关系 | 标题（摘要）                                                                  | 实际反映的问题                                                                |
| -------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [microsoft/vscode-gradle#1802](https://github.com/microsoft/vscode-gradle/issues/1802)       | Fixes          | "Project is not a Gradle build server project" 导致 Delegate to Gradle 不可用 | 直接暴露 BSP nature 依赖，非 BSP/未成功 BSP 导入时测试委托失败                |
| [microsoft/vscode-java-test#1726](https://github.com/microsoft/vscode-java-test/issues/1726) | Addresses      | Buildship 导入项目需要明确提示才能用 test delegation                          | 实际诉求不只是提示，而是测试委托不应与导入器强耦合                            |
| [microsoft/vscode-java-test#1771](https://github.com/microsoft/vscode-java-test/issues/1771) | Addresses      | "Delegate to Gradle" 无测试结果                                               | 与 #1726 同源；用户只看到测试委托无反馈 / 无结果                              |
| [microsoft/vscode-java-test#1045](https://github.com/microsoft/vscode-java-test/issues/1045) | Related        | 原始 Gradle test delegation feature request                                   | 已由初版 delegation 关闭；本 PR 修的是后续的 BSP 耦合缺陷，不应作为直接 Fixes |

**当前 PR 定位**：这是一个面向非 BSP / BSP 导入失败场景的 **XML fallback / unblocker**。它把用户从"必须重新以 BSP 导入才能跑 Gradle tests"的断点里解放出来，但不把 JUnit XML 回读包装成最终架构；长期统一方案仍应走 Gradle Tooling API test event stream。

## 2. PR #1810：把"Delegate Test"从 BSP 解耦

- **PR**：[microsoft/vscode-gradle#1810](https://github.com/microsoft/vscode-gradle/pull/1810)
- **分支**：`wenyt/decouple-test-runner-from-bsp`
- **核心改动**：`GradleTestRunner` 不再依赖 BSP 的测试事件流；改为由 vscode-gradle 亲自 invoke Gradle，用 **JUnit XML 报告**回读结果并桥接到 vscode-java-test 的 `TestRunner` API。
- **效果**：不管项目是 Buildship 还是 BSP 导入，`Delegate Test to Gradle` 都有可用路径；这 unblock 了 #1802 / #1726 / #1771 这类 BSP nature 缺失问题。

### 2.1 为什么选 XML 作为第一步？

| 维度     | 说明                                                      |
| -------- | --------------------------------------------------------- |
| 兼容性   | JUnit XML 从 Gradle 1.x 就稳定存在，对 Gradle 版本无下限  |
| 实现成本 | 一个 init script + 读文件，无需引入新的 RPC / daemon 机制 |
| 风险可控 | 与现有 BSP 路径并存，不影响已经依赖 BSP 导入的用户        |
| 诊断友好 | XML 是落盘文件，失败时人工可查                            |

### 2.2 XML 方案的已知代价

批量 / 落盘机制带来的结构性短板（并非实现细节 bug，是协议选择决定的上限）：

1. **没有实时事件**——测试跑完才能看到结果，Test Explorer 里会长时间"Running"
2. **UP-TO-DATE 陷阱**——Gradle 判定任务未变更时不会重新生成 XML；需要强制 `cleanTest` 绕开
3. **结构化信息丢失**——`<failure>` 只有 message + stacktrace 字符串，没有 cause chain
4. **名称归一化**——参数化测试 / `@Nested` / `@TestFactory` 的 displayName 需要额外解析才能对齐 vscode-java-test 的 test id
5. **输出归属**——stdout/stderr 只有 suite 粒度，拿不到"某个 test case 的输出"

这些问题大多可以在 XML 层做 mitigations（见 PR 评审中的 C1–C8），但**天花板**是协议级的，无法通过精雕代码突破。

### 2.3 Copilot Reviewer 反馈回顾

bot 在 `c2ab060` 上给了 8 条 inline review，质量较高。结论：

| #   | 要点                                                    | 采纳       |
| --- | ------------------------------------------------------- | ---------- |
| C1  | `<failure message="">` 属性缺失时 fallback 到正文       | ✅         |
| C2  | 参数化测试 id 规范化                                    | ✅         |
| C3  | 缺少单元测试                                            | ✅（PR B） |
| C4  | `startJavaDebug` fire-and-forget，失败时 build 不会取消 | ✅         |
| C5  | test items 被置 Running 后在异常分支无人 finalize       | ✅         |
| C6  | init script 路径需要 pid + timestamp + 清理             | ✅         |
| C7  | **UP-TO-DATE 导致 XML 不刷新 → 空结果**（最严重）       | ✅         |
| C8  | `time` 属性 `Number.isFinite` 守卫                      | ✅         |

根因并非代码质量差，而是 migration 本身的复杂度：**事件流协议（BSP）→ 批量文件协议（XML）**，同时还要喂回一个事件驱动的上层 API（`TestRunner`）。阻抗不匹配必然产生这些边角。

## 3. 方案对比：XML vs BSP vs GTA 直连

### 3.1 层级关系

```
IDE (vscode-java-test)
  ├─ 当前：BSP 路径  ← 依赖 build-server-for-gradle
  ├─ PR #1810：XML  ← vscode-gradle 自己 invoke
  └─ 长期：GTA 直连 ← vscode-gradle 订阅 Gradle Tooling API 事件流
                       │
                       ▼
                 Gradle Tooling API
                       │
                       ▼
                 Gradle daemon
```

关键事实：**BSP server（[microsoft/build-server-for-gradle](https://github.com/microsoft/build-server-for-gradle)）本身就是 GTA 的消费者**——它把 GTA 事件翻译成 BSP JSON-RPC。所以：

- BSP 能给的信息 ≤ GTA 能给的信息
- GTA 能给的信息 受 Gradle 版本下限约束

### 3.2 Gradle 版本对特性的约束（GTA 与 BSP 同时吃这条线）

| 特性                                              | 最低 Gradle 版本 | 含义                        |
| ------------------------------------------------- | ---------------- | --------------------------- |
| `TestProgressListener` 基本 started/finished 事件 | **2.6**（2015）  | 几乎所有现役项目都支持      |
| `TestOutputEvent`（per-test stdout/stderr 归属）  | **6.0**（2019）  | 决定能否按测试用例区分输出  |
| `TestFailureResult`（结构化失败 + cause chain）   | **7.6**（2022）  | 决定能否区分断言失败 / 异常 |

### 3.3 BSP 协议自身的额外截断

除了 Gradle 版本线，BSP 协议作为"跨 build tool 通用抽象"本身也压扁了一部分信息：

| 信息                                                  | GTA 原生                                 | BSP 承载能力                   |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| 测试父子层级（`@Nested` / `@ParameterizedTest` 子树） | ✅ `TestOperationDescriptor.getParent()` | ⚠ 部分，常被扁平化             |
| Failure cause chain                                   | ✅ 可递归                                | ❌ 压扁为 message + stacktrace |
| 测试级 stdout/stderr 流                               | ✅ `TestOutputEvent`                     | ❌ 无 test-scoped channel      |
| 实时取消                                              | ✅                                       | ✅                             |
| ns 精度时间                                           | ✅                                       | ⚠ 毫秒                         |

### 3.4 三方案能力矩阵

| 维度                           | XML（PR #1810）    | 当前 BSP          | GTA 直连（长期）              |
| ------------------------------ | ------------------ | ----------------- | ----------------------------- |
| 导入方式无关                   | ✅                 | ❌（仅 BSP 导入） | ✅                            |
| 实时进度                       | ❌（批量）         | ✅                | ✅                            |
| UP-TO-DATE 免疫                | ❌（需 cleanTest） | ✅                | ✅                            |
| per-test 输出（Gradle ≥ 6.0）  | ❌ suite 粒度      | ❌ 协议不承载     | ✅                            |
| 结构化 failure（Gradle ≥ 7.6） | ❌                 | ❌ 协议扁平化     | ✅                            |
| 层级测试名                     | ⚠ 需解析           | ⚠ 部分            | ✅                            |
| 取消                           | ⚠ 粗粒度           | ✅                | ✅                            |
| 对老 Gradle 的兼容             | ✅（最好）         | ≥ 2.6             | ≥ 2.6                         |
| 实现 / 维护成本                | 低                 | 外部依赖          | 中（需扩 gradle-server 消息） |

结论：

- **GTA 直连在所有"新 Gradle"情境下严格优于当前 BSP**，并且在"老 Gradle"下打平。
- **XML 是过渡**：解决掉 #1045 / #1771 的可用性断点，对用户体验是"多了能用"，不是"换了更差"。

### 3.5 "让用户升级到 BSP"为什么不是答案

曾被作为 #1771 的关闭理由，但实际上不成立：

1. BSP server 存在覆盖缺口（composite builds、代码生成插件、非常老的 Gradle）
2. 用户可能无权限改 workspace 设置（企业仓库 / 模板项目）
3. 重新 import 成本高，易产生新的 side effect
4. 架构分层错误：跑测试和选导入器本不该耦合
5. 用户心智模型："我选了 Buildship，凭什么跑测试要换？"

## 4. 路线图

| 阶段             | 交付物                                                                                                                                                                               | 状态                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| PR #1810（本次） | `GradleTestRunner` 解耦 BSP，XML 路径可用；修掉 C1 / C3–C8                                                                                                                           | 进行中                     |
| PR A             | javaext-autotest 框架扩展 + `gradle-delegate-buildship.yaml` E2E plan                                                                                                                | 分支已推送，待开 PR        |
| PR B             | `testResultParser` 单元测试 + fixture 纳入版本管理 + CI workflow                                                                                                                     | 待 #1810 / PR A 合入后启动 |
| 跟进 issue       | 参数化测试 id 规范化（C2）                                                                                                                                                           | 待创建                     |
| 长期（GTA 迁移） | 扩 `gradle-server` 新消息：订阅 GTA `TestProgressListener` / `TestOutputEvent` / `TestFailureResult`，直连 `TestRunner` API；XML 留作 Gradle < 2.6 的 fallback（实际上几乎不会触发） | 规划中                     |

## 5. 开发硬规则：触碰 `testResultParser` 前先写失败的 UT

C3（"缺少单元测试"）是这次 review 里最根本的一条。`testResultParser.ts` 承担的是**外部系统（Gradle）生成的 XML → 结构化结果**的协议边界翻译，是典型的 regression 高发区：

- 输入来源不是我们控制的——Gradle 版本、plugin、locale 都可能改 XML 细节
- 同一字段可能有多种表达（`<failure message=".."/>` vs `<failure>..stacktrace..</failure>`）
- 问题在生产环境才暴露时，用户看到的表现是"测试结果缺失 / 状态错乱"，非常难归因

因此从 PR B 落地 `testResultParser.test.ts` 开始，**以下规则对这个文件生效**（写入 `extension/src/bs/AGENTS.md` 或等价约定）：

1. **改 parser 前先加失败 UT**：任何 bugfix / 新支持的 XML 变体，必须先在 `testResultParser.test.ts` 里加一条**失败的**测试用例，再改生产代码使其通过。PR 审核会拒绝"只有生产代码改动，没有对应 UT"的提交。
2. **fixture 小且命名即文档**：在 `extension/src/test/unit/fixtures/testResultParser/` 下按 `<case-name>.xml` 存真实或最小化的 JUnit XML 样本。命名要能一眼看出它在测什么（如 `failure-message-attr-only.xml`、`time-not-finite.xml`、`nested-class.xml`）。
3. **每个被修复的 Copilot / issue 编号都要有对应 UT**：C1 → `failure-message-attr-only.xml`；C8 → `time-not-finite.xml`；将来的 fix 同理。commit message 里引用对应用例名，让 PR 与测试可追溯。
4. **GradleTestRunner 的状态机也走测试**：`runningTestIds` 的"未完成项 → Errored"兜底（C5）、`cleanTest` 前缀（C7）、init script 路径唯一 + 清理（C6）都是容易 regression 的控制流；UT 可以用 mock `client` 覆盖，不需要真 Gradle。

**理由**：这次 review 之所以能一次性命中 6 条真问题，是因为 bot 在"控制流 + 字符串解析 + 外部进程"这三个组合处做了大量假设推演。我们自己下次改这块，如果连一条验证"empty-body failure 也能出 message"的 UT 都没有，改错的概率极高。**让失败先发生在 UT 里，而不是用户的 Test Explorer 里。**

## 6. 相关引用

- Issue：[vscode-java-test#1045](https://github.com/microsoft/vscode-java-test/issues/1045)
- Issue：[vscode-java-test#1771](https://github.com/microsoft/vscode-java-test/issues/1771)
- PR（本次修复）：[vscode-gradle#1810](https://github.com/microsoft/vscode-gradle/pull/1810)
- BSP server 实现（作为 GTA 消费者的参考）：[microsoft/build-server-for-gradle](https://github.com/microsoft/build-server-for-gradle)
- Gradle Tooling API docs：<https://docs.gradle.org/current/userguide/third_party_integration.html#embedding>
- GTA `TestProgressListener` javadoc：<https://docs.gradle.org/current/javadoc/org/gradle/tooling/events/test/package-summary.html>
